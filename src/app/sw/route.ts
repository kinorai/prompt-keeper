import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const SW_SOURCE = `
const CACHE_PREFIX = "prompt-keeper-";
const CACHE_VERSION = "__CACHE_VERSION__";
const STATIC_CACHE = CACHE_PREFIX + "static-" + CACHE_VERSION;
const DYNAMIC_CACHE = CACHE_PREFIX + "dynamic-" + CACHE_VERSION;
const OFFLINE_URL = "/offline";

const STATIC_ASSETS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        STATIC_ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (err) {
            console.warn("[sw] precache miss", url, err);
          }
        })
      );
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function offlineJsonResponse() {
  return new Response(JSON.stringify({ error: "offline", message: "Network unavailable" }), {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "application/json" },
  });
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineJsonResponse();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  const network = await fetchPromise;
  return network || Response.error();
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
`;

function buildCacheVersion() {
  const explicit = process.env.NEXT_PUBLIC_BUILD_ID || process.env.BUILD_ID || process.env.GIT_SHA;
  if (explicit) return explicit.slice(0, 12);
  return createHash("sha1").update(SW_SOURCE).digest("hex").slice(0, 12);
}

export async function GET() {
  const swCode = SW_SOURCE.replace("__CACHE_VERSION__", buildCacheVersion());
  return new Response(swCode, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}

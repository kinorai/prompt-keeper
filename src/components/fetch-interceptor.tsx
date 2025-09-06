"use client";

import { useEffect } from "react";
import type { CSSProperties } from "react";
import { toast } from "sonner";

declare global {
  interface Window {
    __PK_FETCH_INTERCEPTOR__?: boolean;
  }
}

const hasSuppressToastHeader = (input: RequestInfo | URL, init?: RequestInit): boolean => {
  const headerName = "x-suppress-error-toast";
  const fromInit = init?.headers;
  if (fromInit instanceof Headers) {
    return Boolean(fromInit.get(headerName));
  }
  if (Array.isArray(fromInit)) {
    return fromInit.some(([k, v]) => k.toLowerCase() === headerName && Boolean(v));
  }
  if (fromInit && typeof fromInit === "object") {
    const record = fromInit as Record<string, string>;
    const key = Object.keys(record).find((k) => k.toLowerCase() === headerName);
    if (key) return Boolean(record[key]);
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return Boolean(input.headers.get(headerName));
  }
  return false;
};

export function FetchInterceptor() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__PK_FETCH_INTERCEPTOR__) return;
    window.__PK_FETCH_INTERCEPTOR__ = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const response = await originalFetch(input, init);

        const suppressToast = hasSuppressToastHeader(input, init);
        if (!response.ok && !suppressToast) {
          let message = "";
          try {
            const cloned = response.clone();
            const data = await cloned.json().catch(() => null as unknown);
            if (data && typeof data === "object") {
              const record = data as Record<string, unknown>;
              const maybe = record.error || record.message;
              if (typeof maybe === "string") message = maybe;
            }
          } catch {}
          toast.error(message || `Request failed (${response.status})`, {
            style: {
              "--error-bg": "color-mix(in oklab, hsl(var(--destructive)) 10%, hsl(var(--background)))",
              "--error-text": "hsl(var(--destructive))",
              "--error-border": "hsl(var(--destructive))",
              // Also set normal vars so style applies consistently across variants
              "--normal-bg": "color-mix(in oklab, hsl(var(--destructive)) 10%, hsl(var(--background)))",
              "--normal-text": "hsl(var(--destructive))",
              "--normal-border": "hsl(var(--destructive))",
            } as CSSProperties,
            duration: Infinity,
          });
        }

        return response;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Network error";
        toast.error(message, { duration: Infinity });
        throw error;
      }
    };
  }, []);

  return null;
}

export default FetchInterceptor;

import { NextRequest, NextResponse } from "next/server";
import { API_KEY_HEADER, hasValidSession, isAuthenticated, unauthorizedResponse } from "@/lib/request-auth";

// LiteLLM API routes that should use LiteLLM authentication
const LITELLM_ROUTES = ["/api/chat/completions", "/api/completions", "/api/models"];

// The proxy only checks the session and passes NextResponse.next() on, so a refreshed session cookie
// would be discarded: don't let the check write the refresh to the database
const SESSION_CHECK = { disableRefresh: true };

export async function proxy(request: NextRequest) {
  // Set CORS headers
  const response = NextResponse.next();
  const origin = request.headers.get("Origin");
  const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || ["*"];

  if (origin && allowedOrigins.some((allowed) => origin.endsWith(allowed))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", `Content-Type, ${API_KEY_HEADER}, Authorization`);

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return response;
  }

  // Skip authentication for login, auth endpoints, and health probes
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/api/auth" ||
    request.nextUrl.pathname.startsWith("/api/auth/") ||
    request.nextUrl.pathname === "/api/healthz" ||
    request.nextUrl.pathname === "/api/readyz" ||
    request.nextUrl.pathname === "/api/livez"
  ) {
    return response;
  }

  // Check if the route is a LiteLLM route
  const isLiteLLMRoute = LITELLM_ROUTES.includes(request.nextUrl.pathname);

  // Check for API key authentication for API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // For LiteLLM routes, let the request pass through (LiteLLM will handle auth)
    if (isLiteLLMRoute) {
      return response;
    }

    // For non-LiteLLM API routes, require the API key or a session that better-auth validates
    if (await isAuthenticated(request.headers, SESSION_CHECK)) {
      return response;
    }

    return unauthorizedResponse();
  }

  // UI routes need a valid session
  if (await hasValidSession(request.headers, SESSION_CHECK)) {
    return response;
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

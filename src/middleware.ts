import { NextRequest, NextResponse } from "next/server";

// LiteLLM API routes that should use LiteLLM authentication
const LITELLM_ROUTES = ["/api/chat/completions", "/api/completions", "/api/models"];

export async function middleware(request: NextRequest) {
  // Set CORS headers
  const response = NextResponse.next();
  const origin = request.headers.get("Origin");
  const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || ["*"];

  if (origin && allowedOrigins.some((allowed) => origin.endsWith(allowed))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Prompt-Keeper-API-Key, Authorization");

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return response;
  }

  // Skip authentication for login, auth endpoints, and health probes
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
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

    // For non-LiteLLM API routes, require X-Prompt-Keeper-API-Key
    const apiKey = request.headers.get("X-Prompt-Keeper-API-Key");
    const envApiKey = process.env.PROMPT_KEEPER_API_KEY;
    if (envApiKey && apiKey === envApiKey) {
      return response;
    }

    // If no API key, check for Better Auth session cookie
    // We just check for existence here, actual validation happens in the route handler
    const sessionToken = request.cookies.get("better-auth.session_token")?.value;
    if (sessionToken) {
      return response;
    }

    // If no valid authentication, return 401
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // For UI routes, check for Better Auth session cookie
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;
  if (sessionToken) {
    return response;
  }

  // Redirect to login page if token is invalid
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  verifyApiKey,
  verifyToken,
  verifyRefreshToken,
  createToken,
  createRefreshToken,
} from "./lib/auth";

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
    request.nextUrl.pathname === "/api/auth/login" ||
    request.nextUrl.pathname === "/api/auth/refresh" ||
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
    if (verifyApiKey(request)) {
      return response;
    }

    // If no API key, check for cookie authentication
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const user = await verifyToken(token);
      if (user) {
        return response;
      }
    }

    // Attempt refresh-token based re-authentication
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
    if (refreshToken) {
      const userFromRefresh = await verifyRefreshToken(refreshToken);
      if (userFromRefresh) {
        const newAccessToken = await createToken(userFromRefresh);
        const newRefreshToken = await createRefreshToken(userFromRefresh);

        // Set rotated cookies and allow the request to proceed
        response.cookies.set({
          name: AUTH_COOKIE_NAME,
          value: newAccessToken,
          httpOnly: true,
          path: "/",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 15, // 15 minutes
          sameSite: "strict",
        });

        response.cookies.set({
          name: REFRESH_TOKEN_COOKIE_NAME,
          value: newRefreshToken,
          httpOnly: true,
          path: "/",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 7, // 7 days
          sameSite: "strict",
        });

        return response;
      }
    }

    // If no valid authentication and refresh failed, return 401
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // For UI routes, check for cookie authentication
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    const user = await verifyToken(token);
    if (user) {
      return response;
    }
  }

  // Attempt refresh-token based re-authentication for UI routes
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;
  if (refreshToken) {
    const userFromRefresh = await verifyRefreshToken(refreshToken);
    if (userFromRefresh) {
      const newAccessToken = await createToken(userFromRefresh);
      const newRefreshToken = await createRefreshToken(userFromRefresh);

      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: newAccessToken,
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 15, // 15 minutes
        sameSite: "strict",
      });

      response.cookies.set({
        name: REFRESH_TOKEN_COOKIE_NAME,
        value: newRefreshToken,
        httpOnly: true,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        sameSite: "strict",
      });

      return response;
    }
  }

  // Redirect to login page if token is invalid and refresh failed
  return NextResponse.redirect(new URL("/login", request.url));

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

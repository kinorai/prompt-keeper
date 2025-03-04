import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, verifyApiKey, verifyToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
  // Set CORS headers
  const response = NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Prompt-Keeper-API-Key"
  );

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return response;
  }

  // Skip authentication for login page and API
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/api/auth/login"
  ) {
    return response;
  }

  // Check for API key authentication for API routes
  if (request.nextUrl.pathname.startsWith("/api/")) {
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

    // If no valid authentication, return 401
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // For UI routes, check for cookie authentication
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    // Redirect to login page if no token
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Verify token
  const user = await verifyToken(token);
  if (!user) {
    // Redirect to login page if token is invalid
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

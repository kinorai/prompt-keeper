import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  createToken,
  createRefreshToken,
  verifyCredentials,
} from "@/lib/auth";
import rateLimit from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:auth/login");

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  allowedRequests: 5, // 5 requests per minute
});

export async function POST(request: NextRequest) {
  try {
    const realIp = request.headers.get("x-real-ip");
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = realIp || forwardedFor || "127.0.0.1"; // Fallback to localhost if no IP found

    const { isRateLimited } = limiter.check(ip);
    if (isRateLimited) {
      return NextResponse.json({ message: "Too many requests" }, { status: 429 });
    }

    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return NextResponse.json({ message: "Username and password are required" }, { status: 400 });
    }

    // Verify credentials
    const authResult = await verifyCredentials(username, password);

    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Login failed" }, { status: 401 });
    }

    // Create tokens
    const accessToken = await createToken(authResult.user);
    const refreshToken = await createRefreshToken(authResult.user);

    // Create response
    const response = NextResponse.json({ success: true });

    // Set access token cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: accessToken,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15, // 15 minutes
      sameSite: "strict",
    });

    // Set refresh token cookie
    response.cookies.set({
      name: REFRESH_TOKEN_COOKIE_NAME,
      value: refreshToken,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "strict",
    });

    return response;
  } catch (error) {
    log.error(error, "Login error:");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

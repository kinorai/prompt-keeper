import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  verifyRefreshToken,
  createToken,
  createRefreshToken,
} from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:auth/refresh");

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)?.value;

    if (!refreshToken) {
      return NextResponse.json({ message: "Refresh token is missing" }, { status: 401 });
    }

    // Verify refresh token
    const user = await verifyRefreshToken(refreshToken);
    if (!user) {
      return NextResponse.json({ message: "Invalid or expired refresh token" }, { status: 401 });
    }

    // Create new tokens
    const newAccessToken = await createToken(user);
    const newRefreshToken = await createRefreshToken(user);

    // Create response
    const response = NextResponse.json({ success: true });

    // Set new access token cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: newAccessToken,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15, // 15 minutes
      sameSite: "strict",
    });

    // Set new refresh token cookie
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
  } catch (error) {
    log.error("Token refresh error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

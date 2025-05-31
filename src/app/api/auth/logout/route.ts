import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  // Create response
  const response = NextResponse.json({ success: true });

  // Delete both access and refresh token cookies
  response.cookies.delete(AUTH_COOKIE_NAME);
  response.cookies.delete(REFRESH_TOKEN_COOKIE_NAME);

  return response;
}

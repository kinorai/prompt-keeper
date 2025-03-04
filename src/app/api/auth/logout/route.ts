import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  // Create response
  const response = NextResponse.json({ success: true });

  // Delete the authentication cookie
  response.cookies.delete(AUTH_COOKIE_NAME);

  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createToken, verifyCredentials } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { message: "Username and password are required" },
        { status: 400 },
      );
    }

    // Verify credentials
    const authResult = await verifyCredentials(username, password);

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { message: authResult.message || "Authentication failed" },
        { status: 401 },
      );
    }

    // Create JWT token
    const token = await createToken(authResult.user);

    // Create response
    const response = NextResponse.json({ success: true });

    // Set cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // 24 hours
      sameSite: "strict",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}

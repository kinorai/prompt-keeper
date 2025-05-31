import { POST } from "@/app/api/auth/logout/route";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@/lib/auth";

// Mock the auth library
jest.mock("@/lib/auth", () => ({
  AUTH_COOKIE_NAME: "prompt-keeper-auth",
  REFRESH_TOKEN_COOKIE_NAME: "prompt-keeper-refresh-token",
}));

describe("Auth Logout API Route", () => {
  it("should return 200 and delete auth cookies", async () => {
    // Call the API route handler
    const response = await POST();

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify that cookies were deleted
    const cookies = response.cookies.getAll();

    // Check auth cookie
    const authCookie = cookies.find((cookie) => cookie.name === AUTH_COOKIE_NAME);
    expect(authCookie?.value).toBe("");

    // Check refresh token cookie
    const refreshCookie = cookies.find((cookie) => cookie.name === REFRESH_TOKEN_COOKIE_NAME);
    expect(refreshCookie?.value).toBe("");

    // Verify expiration if present
    if (authCookie?.expires instanceof Date) {
      expect(authCookie.expires.getTime()).toBeLessThanOrEqual(Date.now());
    }
    if (refreshCookie?.expires instanceof Date) {
      expect(refreshCookie.expires.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });
});

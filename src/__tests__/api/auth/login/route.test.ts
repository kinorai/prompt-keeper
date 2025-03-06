import { POST } from "@/app/api/auth/login/route";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createToken, verifyCredentials } from "@/lib/auth";

// Mock the auth functions
jest.mock("@/lib/auth", () => ({
  AUTH_COOKIE_NAME: "prompt-keeper-auth",
  createToken: jest.fn(),
  verifyCredentials: jest.fn(),
}));

describe("Auth Login API Route", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it("should return 400 if username or password is missing", async () => {
    // Create a mock request with missing credentials
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(400);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      message: "Username and password are required",
    });

    // Verify that auth functions were not called
    expect(verifyCredentials).not.toHaveBeenCalled();
    expect(createToken).not.toHaveBeenCalled();
  });

  it("should return 401 if credentials are invalid", async () => {
    // Mock failed authentication
    (verifyCredentials as jest.Mock).mockResolvedValueOnce({
      success: false,
      message: "Invalid username or password",
    });

    // Create a mock request with invalid credentials
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "wronguser",
        password: "wrongpass",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(401);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      message: "Invalid username or password",
    });

    // Verify that verifyCredentials was called with the correct parameters
    expect(verifyCredentials).toHaveBeenCalledWith("wronguser", "wrongpass");
    expect(createToken).not.toHaveBeenCalled();
  });

  it("should return 200 and set auth cookie if credentials are valid", async () => {
    // Mock successful authentication
    const mockUser = { username: "testuser" };
    (verifyCredentials as jest.Mock).mockResolvedValueOnce({
      success: true,
      user: mockUser,
    });
    (createToken as jest.Mock).mockResolvedValueOnce("mock-jwt-token");

    // Create a mock request with valid credentials
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "testuser",
        password: "correctpass",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify that auth functions were called with the correct parameters
    expect(verifyCredentials).toHaveBeenCalledWith("testuser", "correctpass");
    expect(createToken).toHaveBeenCalledWith(mockUser);

    // Verify that the auth cookie was set
    const cookies = response.cookies.getAll();
    const authCookie = cookies.find(
      (cookie) => cookie.name === AUTH_COOKIE_NAME,
    );
    expect(authCookie).toBeDefined();
    expect(authCookie?.value).toBe("mock-jwt-token");
  });

  it("should return 500 if an error occurs during authentication", async () => {
    // Mock an error during authentication
    (verifyCredentials as jest.Mock).mockRejectedValueOnce(
      new Error("Authentication error"),
    );

    // Create a mock request
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "testuser",
        password: "testpass",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      message: "Internal server error",
    });
  });
});

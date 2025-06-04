import { POST } from "@/app/api/auth/login/route";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createToken, createRefreshToken, verifyCredentials } from "@/lib/auth";
import rateLimit from "@/lib/rate-limit";

// Mock the auth functions
jest.mock("@/lib/auth", () => ({
  AUTH_COOKIE_NAME: "prompt-keeper-auth",
  createToken: jest.fn(),
  createRefreshToken: jest.fn(),
  verifyCredentials: jest.fn(),
}));

// Mock the rate limiter
jest.mock("@/lib/rate-limit", () => {
  const mockCheck = jest.fn();
  return {
    __esModule: true,
    default: jest.fn(() => ({
      check: mockCheck,
    })),
    mockCheck, // Export the mock function so we can access it
  };
});

describe("Auth Login API Route", () => {
  let mockRateLimiter: { check: jest.Mock };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Get the mocked rate limiter
    const mockRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;
    const mockModule = jest.requireMock("@/lib/rate-limit");
    mockRateLimiter = { check: mockModule.mockCheck };
    mockRateLimit.mockReturnValue(mockRateLimiter);
  });

  it("should return 400 if username or password is missing", async () => {
    // Mock rate limiter to allow request
    mockRateLimiter.check.mockReturnValue({ isRateLimited: false });

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

    // Verify that auth functions were not called
    expect(verifyCredentials).not.toHaveBeenCalled();
    expect(createToken).not.toHaveBeenCalled();
  });

  it("should return 429 when rate limited", async () => {
    // Mock rate limiter to block request
    mockRateLimiter.check.mockReturnValue({ isRateLimited: true });

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
    expect(response.status).toBe(429);

    // Verify rate limiter was called with IP
    expect(mockRateLimiter.check).toHaveBeenCalledWith("127.0.0.1");

    // Verify that auth functions were not called due to rate limiting
    expect(verifyCredentials).not.toHaveBeenCalled();
    expect(createToken).not.toHaveBeenCalled();
  });

  it("should return 401 if credentials are invalid", async () => {
    // Mock rate limiter to allow request
    mockRateLimiter.check.mockReturnValue({ isRateLimited: false });

    // Mock failed authentication
    (verifyCredentials as jest.Mock).mockReturnValueOnce({
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

    // Verify that verifyCredentials was called with the correct parameters
    expect(verifyCredentials).toHaveBeenCalledWith("wronguser", "wrongpass");
    expect(createToken).not.toHaveBeenCalled();
  });

  it("should return 401 with default message if credentials are invalid and no message is provided", async () => {
    // Mock rate limiter to allow request
    mockRateLimiter.check.mockReturnValue({ isRateLimited: false });

    // Mock failed authentication without a specific message
    (verifyCredentials as jest.Mock).mockReturnValueOnce({
      success: false,
      // No message property
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "nouser",
        password: "nopass",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(401);

    // Verify that verifyCredentials was called
    expect(verifyCredentials).toHaveBeenCalledWith("nouser", "nopass");
    expect(createToken).not.toHaveBeenCalled();
  });

  it("should return 200 and set auth cookie if credentials are valid", async () => {
    // Mock rate limiter to allow request
    mockRateLimiter.check.mockReturnValue({ isRateLimited: false });

    // Mock successful authentication
    const mockUser = { username: "testuser" };
    (verifyCredentials as jest.Mock).mockReturnValueOnce({
      success: true,
      user: mockUser,
    });
    (createToken as jest.Mock).mockResolvedValueOnce("mock-jwt-token");
    (createRefreshToken as jest.Mock).mockResolvedValueOnce("mock-refresh-token");

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
    expect(createRefreshToken).toHaveBeenCalledWith(mockUser);

    // Verify that the auth cookie was set
    const cookies = response.cookies.getAll();
    const authCookie = cookies.find((cookie) => cookie.name === AUTH_COOKIE_NAME);
    expect(authCookie).toBeDefined();
    expect(authCookie?.value).toBe("mock-jwt-token");
  });

  it("should return 500 if an error occurs during authentication", async () => {
    // Mock rate limiter to allow request
    mockRateLimiter.check.mockReturnValue({ isRateLimited: false });

    // Mock an error during authentication
    (verifyCredentials as jest.Mock).mockImplementationOnce(() => {
      throw new Error("Authentication error");
    });

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
  });
});

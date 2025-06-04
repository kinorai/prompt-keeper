import { POST } from "@/app/api/auth/refresh/route";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from "@/lib/auth";
import * as auth from "@/lib/auth";

// Mock auth functions
jest.mock("@/lib/auth", () => ({
  verifyRefreshToken: jest.fn(),
  createToken: jest.fn(),
  createRefreshToken: jest.fn(),
  AUTH_COOKIE_NAME: "auth-token",
  REFRESH_TOKEN_COOKIE_NAME: "refresh-token",
}));

describe("POST /api/auth/refresh", () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    mockRequest = {
      cookies: {
        get: jest.fn(),
      },
    } as unknown as NextRequest;
    jest.clearAllMocks();
  });

  it("should return 401 when refresh token is missing", async () => {
    (mockRequest.cookies.get as jest.Mock).mockReturnValue(undefined);

    const response = await POST(mockRequest);
    expect(response.status).toBe(401);
  });

  it("should return 401 when refresh token is invalid", async () => {
    (mockRequest.cookies.get as jest.Mock).mockReturnValue({ value: "invalid-token" });
    (auth.verifyRefreshToken as jest.Mock).mockResolvedValue(undefined);

    const response = await POST(mockRequest);
    expect(response.status).toBe(401);
  });

  it("should return new tokens when refresh token is valid", async () => {
    const mockUser = { id: "user123" };
    (mockRequest.cookies.get as jest.Mock).mockImplementation((name) =>
      name === REFRESH_TOKEN_COOKIE_NAME ? { value: "valid-token" } : undefined,
    );
    (auth.verifyRefreshToken as jest.Mock).mockResolvedValue(mockUser);
    (auth.createToken as jest.Mock).mockResolvedValue("new-access-token");
    (auth.createRefreshToken as jest.Mock).mockResolvedValue("new-refresh-token");

    const response = await POST(mockRequest);
    expect(response.status).toBe(200);

    // Check cookies
    const cookies = response.cookies.getAll();
    expect(cookies).toHaveLength(2);

    const accessCookie = cookies.find((c) => c.name === AUTH_COOKIE_NAME);
    expect(accessCookie?.value).toBe("new-access-token");
    expect(accessCookie?.httpOnly).toBe(true);

    const refreshCookie = cookies.find((c) => c.name === REFRESH_TOKEN_COOKIE_NAME);
    expect(refreshCookie?.value).toBe("new-refresh-token");
    expect(refreshCookie?.maxAge).toBe(60 * 60 * 24 * 7);
  });

  it("should return 401 on internal server error", async () => {
    (mockRequest.cookies.get as jest.Mock).mockReturnValue({ value: "valid-token" });
    (auth.verifyRefreshToken as jest.Mock).mockRejectedValue(new Error("DB error"));

    const response = await POST(mockRequest);
    expect(response.status).toBe(401);
  });
});

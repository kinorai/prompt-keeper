import { NextRequest, NextResponse } from "next/server";
import { middleware } from "@/middleware";
import { verifyApiKey, verifyToken } from "@/lib/auth";

// Mock auth functions
jest.mock("@/lib/auth", () => ({
  verifyApiKey: jest.fn(),
  verifyToken: jest.fn(),
  AUTH_COOKIE_NAME: "prompt-keeper-auth",
}));

// Helper to create a mock NextRequest
function createMockNextRequest(url: string, method = "GET"): NextRequest {
  const request = new Request(url, { method }) as unknown as NextRequest;
  const nextUrl = new URL(url);
  Object.defineProperty(request, "nextUrl", {
    get: () => nextUrl,
    configurable: true,
  });
  Object.defineProperty(request, "cookies", {
    value: {
      get: jest.fn().mockImplementation(() => undefined),
    },
    configurable: true,
  });
  return request;
}

describe("Middleware", () => {
  let mockRequest: NextRequest;
  let mockResponse: NextResponse;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock NextResponse.next()
    mockResponse = {
      headers: new Headers(),
    } as unknown as NextResponse;
    jest.spyOn(NextResponse, "next").mockReturnValue(mockResponse);

    // Mock NextResponse.redirect()
    jest.spyOn(NextResponse, "redirect").mockImplementation((url) => {
      return {
        url,
        headers: new Headers(),
      } as unknown as NextResponse;
    });
  });

  describe("CORS Headers", () => {
    beforeEach(() => {
      mockRequest = createMockNextRequest("http://localhost:3000/api/test");
    });

    it("should set CORS headers", async () => {
      await middleware(mockRequest);

      expect(mockResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(mockResponse.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      expect(mockResponse.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type, X-Prompt-Keeper-API-Key, Authorization",
      );
    });

    it("should handle OPTIONS requests", async () => {
      mockRequest = createMockNextRequest(
        "http://localhost:3000/api/test",
        "OPTIONS",
      );

      const response = await middleware(mockRequest);

      expect(response).toBe(mockResponse);
    });
  });

  describe("Authentication", () => {
    describe("Public Routes", () => {
      it("should allow access to login page", async () => {
        mockRequest = createMockNextRequest("http://localhost:3000/login");

        const response = await middleware(mockRequest);

        expect(response).toBe(mockResponse);
      });

      it("should allow access to login API", async () => {
        mockRequest = createMockNextRequest(
          "http://localhost:3000/api/auth/login",
        );

        const response = await middleware(mockRequest);

        expect(response).toBe(mockResponse);
      });
    });

    describe("LiteLLM Routes", () => {
      it("should allow access to LiteLLM routes", async () => {
        mockRequest = createMockNextRequest(
          "http://localhost:3000/api/chat/completions",
        );

        const response = await middleware(mockRequest);

        expect(response).toBe(mockResponse);
      });
    });

    describe("API Routes", () => {
      beforeEach(() => {
        mockRequest = createMockNextRequest("http://localhost:3000/api/search");
      });

      it("should allow access with valid API key", async () => {
        (verifyApiKey as jest.Mock).mockReturnValue(true);

        const response = await middleware(mockRequest);

        expect(response).toBe(mockResponse);
        expect(verifyApiKey).toHaveBeenCalledWith(mockRequest);
      });

      it("should allow access with valid cookie token", async () => {
        (verifyApiKey as jest.Mock).mockReturnValue(false);
        (verifyToken as jest.Mock).mockResolvedValue({ username: "testuser" });

        const request = createMockNextRequest(
          "http://localhost:3000/api/search",
        );
        (request.cookies.get as jest.Mock).mockImplementation(() => ({
          value: "valid-token",
        }));

        const response = await middleware(request);

        expect(response).toBe(mockResponse);
        expect(verifyToken).toHaveBeenCalledWith("valid-token");
      });

      it("should return 401 with invalid authentication", async () => {
        (verifyApiKey as jest.Mock).mockReturnValue(false);
        (verifyToken as jest.Mock).mockResolvedValue(null);

        const request = createMockNextRequest(
          "http://localhost:3000/api/search",
        );
        (request.cookies.get as jest.Mock).mockImplementation(() => ({
          value: "invalid-token",
        }));

        const response = await middleware(request);

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body).toEqual({ error: "Unauthorized" });
      });
    });

    describe("UI Routes", () => {
      beforeEach(() => {
        mockRequest = createMockNextRequest("http://localhost:3000/dashboard");
      });

      it("should allow access with valid cookie token", async () => {
        (verifyToken as jest.Mock).mockResolvedValue({ username: "testuser" });

        const request = createMockNextRequest(
          "http://localhost:3000/dashboard",
        );
        (request.cookies.get as jest.Mock).mockImplementation(() => ({
          value: "valid-token",
        }));

        const response = await middleware(request);

        expect(response).toBe(mockResponse);
        expect(verifyToken).toHaveBeenCalledWith("valid-token");
      });

      it("should redirect to login with no token", async () => {
        const request = createMockNextRequest(
          "http://localhost:3000/dashboard",
        );
        (request.cookies.get as jest.Mock).mockImplementation(() => undefined);

        expect(NextResponse.redirect).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: "/login",
          }),
        );
      });

      it("should redirect to login with invalid token", async () => {
        (verifyToken as jest.Mock).mockResolvedValue(null);

        const request = createMockNextRequest(
          "http://localhost:3000/dashboard",
        );
        (request.cookies.get as jest.Mock).mockImplementation(() => ({
          value: "invalid-token",
        }));

        expect(NextResponse.redirect).toHaveBeenCalledWith(
          expect.objectContaining({
            pathname: "/login",
          }),
        );
      });
    });
  });
});

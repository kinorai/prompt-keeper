import { compare } from "bcryptjs";
import { NextRequest } from "next/server";
import {
  verifyCredentials,
  verifyApiKey,
  verifyToken,
  createToken,
  User,
} from "@/lib/auth";

// Mock environment variables
const mockEnv = {
  AUTH_USERNAME: "testuser",
  AUTH_PASSWORD_HASH: "$2a$10$mockhashedpassword",
  PROMPT_KEEPER_API_KEY: "test-api-key",
  JWT_SECRET: "test-secret-key",
  NODE_ENV: "test" as "test" | "development" | "production",
};

// Mock bcryptjs
jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
}));

describe("Auth Library", () => {
  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...mockEnv };
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("verifyCredentials", () => {
    it("should return success when credentials are valid", async () => {
      (compare as jest.Mock).mockResolvedValue(true);

      const result = await verifyCredentials("testuser", "correctpassword");

      expect(result).toEqual({
        success: true,
        user: { username: "testuser" },
      });
      expect(compare).toHaveBeenCalledWith(
        "correctpassword",
        mockEnv.AUTH_PASSWORD_HASH,
      );
    });

    it("should return failure when username is incorrect", async () => {
      const result = await verifyCredentials("wronguser", "password");

      expect(result).toEqual({
        success: false,
        message: "Invalid username or password",
      });
      expect(compare).not.toHaveBeenCalled();
    });

    it("should return failure when password is incorrect", async () => {
      (compare as jest.Mock).mockResolvedValue(false);

      const result = await verifyCredentials("testuser", "wrongpassword");

      expect(result).toEqual({
        success: false,
        message: "Invalid username or password",
      });
      expect(compare).toHaveBeenCalledWith(
        "wrongpassword",
        mockEnv.AUTH_PASSWORD_HASH,
      );
    });

    it("should return failure when environment variables are not set", async () => {
      process.env = {
        NODE_ENV: "test" as "test" | "development" | "production",
      };

      const result = await verifyCredentials("testuser", "password");

      expect(result).toEqual({
        success: false,
        message: "Authentication is not configured",
      });
    });
  });

  describe("verifyApiKey", () => {
    it("should return true when API key is valid", () => {
      const mockRequest = {
        headers: new Headers({
          "X-Prompt-Keeper-API-Key": "test-api-key",
        }),
      } as unknown as NextRequest;

      const result = verifyApiKey(mockRequest);

      expect(result).toBe(true);
    });

    it("should return false when API key is invalid", () => {
      const mockRequest = {
        headers: new Headers({
          "X-Prompt-Keeper-API-Key": "wrong-api-key",
        }),
      } as unknown as NextRequest;

      const result = verifyApiKey(mockRequest);

      expect(result).toBe(false);
    });

    it("should return false when API key is missing", () => {
      const mockRequest = {
        headers: new Headers({}),
      } as unknown as NextRequest;

      const result = verifyApiKey(mockRequest);

      expect(result).toBe(false);
    });

    it("should return false when environment API key is not set", () => {
      process.env.PROMPT_KEEPER_API_KEY = undefined;
      const mockRequest = {
        headers: new Headers({
          "X-Prompt-Keeper-API-Key": "test-api-key",
        }),
      } as unknown as NextRequest;

      const result = verifyApiKey(mockRequest);

      expect(result).toBe(false);
    });
  });

  describe("Token Management", () => {
    const testUser: User = { username: "testuser" };

    it("should create and verify a valid token", async () => {
      const token = await createToken(testUser);
      expect(token).toBeTruthy();

      const verifiedUser = await verifyToken(token);
      expect(verifiedUser).toEqual(testUser);
    });

    it("should return null for invalid token", async () => {
      // Use a properly formatted but invalid JWT token to avoid parsing errors
      const invalidToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3R1c2VyIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid-signature";

      const verifiedUser = await verifyToken(invalidToken);
      expect(verifiedUser).toBeNull();
    });
  });
});

import { compare } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

// Secret key for JWT signing and verification
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

// Token expiration time (60 days)
const EXPIRATION_TIME = "60d";

// Cookie name for storing the JWT token
export const AUTH_COOKIE_NAME = "prompt-keeper-auth";

// Interface for user data
export interface User {
  username: string;
}

// Interface for authentication result
export interface AuthResult {
  success: boolean;
  message?: string;
  user?: User;
}

// Verify username and password against environment variables
export async function verifyCredentials(username: string, password: string): Promise<AuthResult> {
  const envUsername = process.env.AUTH_USERNAME;
  const envPasswordHash = process.env.AUTH_PASSWORD_HASH;

  if (!envUsername || !envPasswordHash) {
    return {
      success: false,
      message: "Authentication is not configured",
    };
  }

  if (username !== envUsername) {
    return {
      success: false,
      message: "Invalid username or password",
    };
  }

  try {
    const passwordMatches = await compare(password, envPasswordHash);
    if (!passwordMatches) {
      return {
        success: false,
        message: "Invalid username or password",
      };
    }

    return {
      success: true,
      user: { username },
    };
  } catch (error) {
    console.error("Error verifying credentials:", error);
    return {
      success: false,
      message: "Authentication error",
    };
  }
}

// Create a JWT token for the authenticated user
export async function createToken(user: User): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRATION_TIME)
    .sign(JWT_SECRET);
}

// Verify API key from request header
export function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("X-Prompt-Keeper-API-Key");
  const envApiKey = process.env.PROMPT_KEEPER_API_KEY;

  if (!envApiKey || !apiKey) {
    return false;
  }

  return apiKey === envApiKey;
}

// Verify JWT token from cookies
export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { username: payload.username as string };
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
}

// Get the current user from the request cookies
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

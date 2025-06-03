import md5crypt from "apache-md5";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth");

// Secret keys for JWT signing and verification
const ACCESS_TOKEN_SECRET = new TextEncoder().encode(process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET);
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.REFRESH_TOKEN_SECRET);

// Token expiration times
const ACCESS_TOKEN_EXPIRATION = "15m"; // 15 minutes
const REFRESH_TOKEN_EXPIRATION = "7d"; // 7 days

// Cookie names
export const AUTH_COOKIE_NAME = "prompt-keeper-access-token";
export const REFRESH_TOKEN_COOKIE_NAME = "prompt-keeper-refresh-token";

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

// Verify username and password against environment variables using APR1-MD5
export function verifyCredentials(username: string, password: string): AuthResult {
  const envUsername = process.env.AUTH_USERNAME;
  const envPasswordHash = process.env.AUTH_PASSWORD_HASH;

  if (!envUsername || !envPasswordHash) {
    log.error("Authentication environment variables (AUTH_USERNAME, AUTH_PASSWORD_HASH) not configured.");
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

  // Verify password using APR1-MD5
  const passwordMatches = md5crypt(password, envPasswordHash) === envPasswordHash;

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
}

// Create an access token for the authenticated user
export async function createToken(user: User): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRATION)
    .sign(ACCESS_TOKEN_SECRET);
}

// Create a refresh token for the authenticated user
export async function createRefreshToken(user: User): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRATION)
    .sign(REFRESH_TOKEN_SECRET);
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

// Verify access token from cookies
export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET);
    return { username: payload.username as string };
  } catch (error) {
    log.error(error, "Error verifying token:");
    return null;
  }
}

// Verify refresh token
export async function verifyRefreshToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_TOKEN_SECRET);
    return { username: payload.username as string };
  } catch (error) {
    log.error(error, "Error verifying refresh token:");
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

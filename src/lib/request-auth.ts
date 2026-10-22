import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("auth:request");

export const API_KEY_HEADER = "X-Prompt-Keeper-API-Key";

// Hash both sides first so timingSafeEqual gets equal-length buffers and the key length doesn't leak
const digest = (value: string) => createHash("sha256").update(value).digest();

export function hasValidApiKey(headers: Headers): boolean {
  const expected = process.env.PROMPT_KEEPER_API_KEY;
  const provided = headers.get(API_KEY_HEADER);
  if (!expected || !provided) {
    return false;
  }
  return timingSafeEqual(digest(provided), digest(expected));
}

// The session cookie only names a session; better-auth looks it up in the database and checks
// its signature and expiry. Cookie presence alone proves nothing.
export async function hasValidSession(headers: Headers): Promise<boolean> {
  try {
    const session = await auth.api.getSession({ headers });
    return Boolean(session?.session && session.user);
  } catch (error) {
    log.warn(error, "Session lookup failed");
    return false;
  }
}

export async function isAuthenticated(headers: Headers): Promise<boolean> {
  return hasValidApiKey(headers) || (await hasValidSession(headers));
}

export const unauthorizedResponse = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Route-level guard so a protected handler stays protected even if the proxy matcher changes
export async function requireAuth(req: Request): Promise<NextResponse | null> {
  return (await isAuthenticated(req.headers)) ? null : unauthorizedResponse();
}

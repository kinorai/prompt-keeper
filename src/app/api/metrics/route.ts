import { NextResponse } from "next/server";
import { renderMetrics } from "@/lib/metrics";

// Not a LiteLLM route, so proxy.ts already requires either X-Prompt-Keeper-API-Key or a session
// cookie. Scrapers should send the API key header.
export async function GET() {
  return new NextResponse(renderMetrics(), {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}

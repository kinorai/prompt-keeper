import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:models");

const CONFIG = {
  LITELLM_URL: process.env.LITELLM_URL,
  REQUEST_TIMEOUT: 30000,
};

export async function GET(req: NextRequest) {
  try {
    const forwardHeaders = new Headers(req.headers);
    const response = await fetch(`${CONFIG.LITELLM_URL}/v1/models`, {
      headers: forwardHeaders,
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      return NextResponse.json({ error: await response.text() }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    log.error(error, "[Models API Error]");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

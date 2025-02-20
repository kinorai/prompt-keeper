import { NextRequest, NextResponse } from "next/server";

const CONFIG = {
  TARGET_URL: process.env.TARGET_URL || "https://api.openai.com/",
  REQUEST_TIMEOUT: 30000,
};

export async function GET(req: NextRequest) {
  try {
    const forwardHeaders = new Headers(req.headers);
    const response = await fetch(`${CONFIG.TARGET_URL}/v1/models`, {
      headers: forwardHeaders,
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: await response.text() },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[Models API Error]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

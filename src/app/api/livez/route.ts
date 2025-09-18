import { NextResponse } from "next/server";

async function checkLiteLLMLiveness(): Promise<{ ok: boolean; status?: number }> {
  const url = process.env.LITELLM_URL;
  if (!url) return { ok: true };
  try {
    const res = await fetch(`${url}/health/liveliness`, { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const litellm = await checkLiteLLMLiveness();
  const status = litellm.ok ? 200 : 503;
  return NextResponse.json(
    {
      status: litellm.ok ? "live" : "unhealthy",
      checks: { litellm },
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

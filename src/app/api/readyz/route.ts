import { NextResponse } from "next/server";
import { getOpenSearchClient, ensureIndexExists } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:readyz");

async function checkOpenSearch(): Promise<{ ok: boolean; detail?: unknown }> {
  try {
    // lightweight ping
    const resp = await getOpenSearchClient().ping();
    if (resp.body === true) {
      await ensureIndexExists();
      return { ok: true };
    }
    return { ok: false, detail: resp.body };
  } catch (error) {
    log.error(error, "[Readyz OpenSearch Error]");
    return { ok: false, detail: (error as Error).message };
  }
}

async function checkLiteLLM(): Promise<{ ok: boolean; status?: number }> {
  const url = process.env.LITELLM_URL;
  if (!url) return { ok: true }; // optional dependency for readiness
  try {
    // Prefer LiteLLM readiness endpoint if available in docs
    const res = await fetch(`${url}/health/readiness`, { signal: AbortSignal.timeout(3000) });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const [os, llm] = await Promise.all([checkOpenSearch(), checkLiteLLM()]);
  const allOk = os.ok && llm.ok;
  const status = allOk ? 200 : 503;
  return NextResponse.json(
    {
      status: allOk ? "ready" : "degraded",
      checks: {
        opensearch: os,
        litellm: llm,
      },
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

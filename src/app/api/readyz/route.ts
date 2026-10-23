import { NextResponse } from "next/server";
import { getOpenSearchClient, ensureIndexExists } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";
import getPrisma from "@/lib/prisma";
import { isOpenSearchBackend } from "@/lib/search/backend";

const log = createLogger("api:readyz");

async function checkOpenSearch(): Promise<{ ok: boolean }> {
  try {
    // lightweight ping
    const resp = await getOpenSearchClient().ping();
    if (resp.body === true) {
      await ensureIndexExists();
      return { ok: true };
    }
    log.error({ body: resp.body }, "[Readyz OpenSearch ping failed]");
    return { ok: false };
  } catch (error) {
    // Details stay in the server log: this probe is unauthenticated
    log.error(error, "[Readyz OpenSearch Error]");
    return { ok: false };
  }
}

async function checkPostgres(): Promise<{ ok: boolean }> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    log.error(error, "[Readyz Postgres Error]");
    return { ok: false };
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
  // Ready means search can answer: the search backend, plus LiteLLM for the proxy
  const searchCheck = isOpenSearchBackend()
    ? checkOpenSearch().then((result) => ({ opensearch: result }))
    : checkPostgres().then((result) => ({ postgres: result }));
  const [search, llm] = await Promise.all([searchCheck, checkLiteLLM()]);
  const allOk = Object.values(search).every((result) => result.ok) && llm.ok;
  const status = allOk ? 200 : 503;
  return NextResponse.json(
    {
      status: allOk ? "ready" : "degraded",
      checks: {
        ...search,
        litellm: llm,
      },
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

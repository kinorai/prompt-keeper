/**
 * A/B benchmark: Postgres search vs OpenSearch, through the real /api/search route
 * (x-search-backend header picks the engine per request; dev server only).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/benchmark-search.ts seed   # seed both engines
 *   npx tsx --env-file=.env scripts/benchmark-search.ts run    # run the benchmark
 *
 * Seeding is deterministic (seeded PRNG) and plants known "needle" conversations so
 * relevance checks are exact, not vibes.
 */
import "dotenv/config";
import getPrisma from "../src/lib/prisma";
import { getOpenSearchClient, PROMPT_KEEPER_INDEX, initializeIndex } from "../src/lib/opensearch";
import { buildConversationDoc } from "../src/lib/conversation-doc";

const BASE_URL = process.env.BENCH_BASE_URL || "http://localhost:3000";
const N_CONVERSATIONS = Number(process.env.BENCH_CONVERSATIONS || 2000);
const RUNS_PER_QUERY = Number(process.env.BENCH_RUNS || 12);
const WARMUP_RUNS = 3;

// ---------------------------------------------------------------------------
// Deterministic PRNG (LCG) so both engines index the identical corpus
// ---------------------------------------------------------------------------
let seed = 42;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

const EN_WORDS =
  `kubernetes deployment ingress controller latency benchmark postgres opensearch replica shard container pipeline terraform ansible monitoring dashboard alert webhook token bucket throttle cache eviction schema migration index vacuum checkpoint replication failover snapshot backup restore encryption certificate rotation gateway proxy timeout retry backoff queue worker outbox event stream partition consumer producer offset commit segment compaction`.split(
    " ",
  );
const FR_WORDS =
  `réseau déployé sécurité latence données requête serveur système fiabilité métrique conteneur grappe sauvegarde chiffrement clé passerelle défaillance résilience élévation surveillance journalisation`.split(
    " ",
  );
const CODE_WORDS =
  `getUserById buildConversationDoc pg_message_search_text tsvector ts_headline fetch_url web_search createLogger useMemo NextResponse prisma.$queryRaw kubectl_apply helm_upgrade`.split(" ");
const MODELS = ["gpt-5.6", "claude-fable-5", "bench-model-1", "bench-model-2", "bench-model-3", "deepseek-r2"];
const ROLES_CYCLE = ["user", "assistant"];

function sentence(words: string[], n: number): string {
  return Array.from({ length: n }, () => pick(words)).join(" ");
}

function messageText(): string {
  const r = rand();
  if (r < 0.6) return sentence(EN_WORDS, randInt(15, 120));
  if (r < 0.85) return `${sentence(EN_WORDS, randInt(10, 40))} ${sentence(FR_WORDS, randInt(5, 30))}`;
  return `${sentence(EN_WORDS, randInt(5, 20))}\n\`\`\`ts\nconst x = ${pick(CODE_WORDS)}(${pick(CODE_WORDS)});\n\`\`\`\n${sentence(EN_WORDS, randInt(5, 30))}`;
}

// Needle conversations: known content → exact relevance assertions
const NEEDLES: Array<{ id: string; text: string; extras?: Record<string, unknown> }> = [
  { id: "needle-accent", text: "Le déploiement a réussi sur le serveur kubernetes à Genève hier soir." },
  { id: "needle-prefix", text: "The quixotic zephyr framework benchmark finished in record time." },
  { id: "needle-phrase", text: "Today we discussed reciprocal rank fusion explained with worked examples." },
  {
    id: "needle-tool",
    text: "Let me look that up for you.",
    extras: {
      toolCalls: [{ id: "call_1", type: "function", function: { name: "fetch_url", arguments: '{"url":"x"}' } }],
    },
  },
  { id: "needle-substring", text: "We analysed the hyperparameterization strategy for the tuning job." },
];

async function seedCorpus() {
  const prisma = getPrisma();
  const os = getOpenSearchClient();
  await initializeIndex();

  console.log(`Seeding ${N_CONVERSATIONS} conversations + ${NEEDLES.length} needles...`);
  await prisma.message.deleteMany({});
  await prisma.conversation.deleteMany({});
  await os.deleteByQuery({ index: PROMPT_KEEPER_INDEX, body: { query: { match_all: {} } }, refresh: true });

  const now = Date.now();
  const yearMs = 365 * 24 * 3600 * 1000;

  const batchConvos: Array<Record<string, unknown>> = [];
  const batchMessages: Array<Record<string, unknown>> = [];
  const osBulk: Array<Record<string, unknown>> = [];

  const buildConvo = (id: string, createdAt: Date, model: string, texts: string[], extras?: Record<string, unknown>) => {
    const convo = {
      id,
      model,
      conversationHash: null,
      latencyMs: rand() * 5,
      promptTokens: randInt(50, 2000),
      completionTokens: randInt(50, 4000),
      totalTokens: 0,
      createdAt,
      updatedAt: createdAt,
    };
    convo.totalTokens = (convo.promptTokens as number) + (convo.completionTokens as number);
    batchConvos.push(convo);

    const messages = texts.map((text, i) => ({
      id: `${id}-m${i}`,
      conversationId: id,
      role: ROLES_CYCLE[i % 2],
      content: rand() < 0.12 ? ([{ type: "text", text }] as unknown) : (text as unknown),
      toolCalls: i === texts.length - 1 && extras?.toolCalls ? extras.toolCalls : undefined,
      reasoningContent: rand() < 0.1 ? sentence(EN_WORDS, randInt(10, 50)) : undefined,
      messageIndex: i,
      createdAt,
    }));
    batchMessages.push(...messages);

    // Index into OpenSearch exactly the way the outbox worker would
    const doc = buildConversationDoc(
      { ...convo, requestParams: null } as never,
      messages.map((m) => ({
        ...m,
        toolCalls: m.toolCalls ?? null,
        reasoningContent: m.reasoningContent ?? null,
        toolCallId: null,
        name: null,
        thinkingBlocks: null,
        annotations: null,
        audio: null,
        images: null,
        refusal: null,
        finishReason: null,
      })) as never[],
    );
    osBulk.push({ index: { _index: PROMPT_KEEPER_INDEX, _id: id } }, doc);
  };

  for (let i = 0; i < N_CONVERSATIONS; i++) {
    // Subtract i ms so timestamps are strictly unique — otherwise the two engines
    // tie-break identical created_at values differently and overlap scores lie.
    const createdAt = new Date(now - Math.floor(rand() * yearMs) - i);
    const texts = Array.from({ length: randInt(2, 12) }, () => messageText());
    buildConvo(`bench-${i}`, createdAt, pick(MODELS), texts);
  }
  // Needles: fixed recent timestamps so they're on page 1 of any recency sort
  NEEDLES.forEach((n, i) => {
    buildConvo(n.id, new Date(now - (i + 1) * 3600 * 1000), "bench-model-3", ["Please help with this.", n.text], n.extras);
  });

  console.log(`Inserting ${batchConvos.length} conversations / ${batchMessages.length} messages into Postgres...`);
  const CHUNK = 1000;
  for (let i = 0; i < batchConvos.length; i += CHUNK) {
    await prisma.conversation.createMany({ data: batchConvos.slice(i, i + CHUNK) as never[] });
  }
  for (let i = 0; i < batchMessages.length; i += CHUNK) {
    await prisma.message.createMany({ data: batchMessages.slice(i, i + CHUNK) as never[] });
  }

  console.log("Bulk-indexing into OpenSearch...");
  for (let i = 0; i < osBulk.length; i += 2000) {
    const resp = await os.bulk({ body: osBulk.slice(i, i + 2000), refresh: false });
    if (resp.body.errors) {
      const firstError = resp.body.items.find((it: { index?: { error?: unknown } }) => it.index?.error);
      throw new Error(`OpenSearch bulk errors: ${JSON.stringify(firstError?.index?.error)}`);
    }
  }
  await os.indices.refresh({ index: PROMPT_KEEPER_INDEX });
  console.log("Seed complete.");
}

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------
interface QueryCase {
  name: string;
  body: Record<string, unknown>;
  expectId?: string; // needle that must appear in the hits
}

const QUERIES: QueryCase[] = [
  { name: "browse (empty query)", body: { query: "", timeRange: "all" } },
  { name: "single word", body: { query: "kubernetes", timeRange: "all" } },
  { name: "two words (AND)", body: { query: "kubernetes deployment", timeRange: "all" } },
  { name: "accent-insensitive", body: { query: "deploiement geneve", timeRange: "all" }, expectId: "needle-accent" },
  { name: "prefix (single)", body: { query: "quixo", timeRange: "all" }, expectId: "needle-prefix" },
  { name: "prefix (multi)", body: { query: "quixo zeph", timeRange: "all" }, expectId: "needle-prefix" },
  { name: "quoted phrase", body: { query: '"reciprocal rank fusion"', timeRange: "all" }, expectId: "needle-phrase" },
  { name: "tool-call name", body: { query: "fetch_url", timeRange: "all" }, expectId: "needle-tool" },
  { name: "mid-word substring", body: { query: "para", timeRange: "all" }, expectId: "needle-substring" },
  { name: "role filter", body: { query: "role:user kubernetes", timeRange: "all" } },
  { name: "model filter", body: { query: "model:bench-model-3 kubernetes", timeRange: "all" } },
  { name: "negation", body: { query: "kubernetes -deployment", timeRange: "all" } },
  { name: "long natural query", body: { query: "configure ingress controller latency alert", timeRange: "all" } },
  { name: "time range 1m", body: { query: "kubernetes", timeRange: "1m" } },
];

interface RunResult {
  wallMs: number;
  tookMs: number;
  total: number;
  ids: string[];
  highlighted: boolean;
  error?: string;
}

async function runOnce(backend: string, q: QueryCase): Promise<RunResult> {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-search-backend": backend,
      "X-Prompt-Keeper-API-Key": process.env.PROMPT_KEEPER_API_KEY || "",
    },
    body: JSON.stringify({ ...q.body, size: 20, from: 0 }),
  });
  const wallMs = performance.now() - start;
  const data = await res.json();
  if (!res.ok || data.error) {
    return { wallMs, tookMs: 0, total: 0, ids: [], highlighted: false, error: data.error || `HTTP ${res.status}` };
  }
  interface Hit {
    _id: string;
    highlight?: unknown;
    inner_hits?: unknown;
  }
  const hits: Hit[] = data.hits.hits;
  return {
    wallMs,
    tookMs: data.took,
    total: data.hits.total?.value ?? 0,
    ids: hits.map((h) => h._id),
    highlighted: hits.some((h) => h.highlight || h.inner_hits),
  };
}

function pctl(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : inter / union;
}

async function runBenchmark() {
  const backends = ["opensearch", "postgres"];
  console.log(`\nBenchmark: ${RUNS_PER_QUERY} runs/query after ${WARMUP_RUNS} warmups, size=20, base=${BASE_URL}\n`);

  const rows: string[][] = [
    ["query", "OS p50/p95 (ms)", "PG p50/p95 (ms)", "OS hits", "PG hits", "overlap", "needle OS/PG", "hl OS/PG"],
  ];

  for (const q of QUERIES) {
    const results: Record<string, RunResult[]> = { opensearch: [], postgres: [] };
    for (const backend of backends) {
      for (let i = 0; i < WARMUP_RUNS; i++) await runOnce(backend, q);
      for (let i = 0; i < RUNS_PER_QUERY; i++) results[backend].push(await runOnce(backend, q));
    }
    const os = results.opensearch;
    const pg = results.postgres;
    const osErr = os.find((r) => r.error);
    const pgErr = pg.find((r) => r.error);
    if (osErr || pgErr) {
      rows.push([q.name, osErr?.error ?? "-", pgErr?.error ?? "-", "-", "-", "-", "-", "-"]);
      continue;
    }
    const needle = (r: RunResult) => (q.expectId ? (r.ids.includes(q.expectId) ? "✓" : "✗") : "·");
    rows.push([
      q.name,
      `${pctl(os.map((r) => r.wallMs), 50).toFixed(1)} / ${pctl(os.map((r) => r.wallMs), 95).toFixed(1)}`,
      `${pctl(pg.map((r) => r.wallMs), 50).toFixed(1)} / ${pctl(pg.map((r) => r.wallMs), 95).toFixed(1)}`,
      String(os[0].total),
      String(pg[0].total),
      jaccard(os[0].ids, pg[0].ids).toFixed(2),
      `${needle(os[0])} / ${needle(pg[0])}`,
      `${os[0].highlighted ? "y" : "n"} / ${pg[0].highlighted ? "y" : "n"}`,
    ]);
  }

  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  for (const [i, row] of rows.entries()) {
    console.log(row.map((cell, col) => cell.padEnd(widths[col])).join("  "));
    if (i === 0) console.log(widths.map((w) => "-".repeat(w)).join("  "));
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "seed") await seedCorpus();
  else if (mode === "run") await runBenchmark();
  else {
    console.error("Usage: benchmark-search.ts <seed|run>");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

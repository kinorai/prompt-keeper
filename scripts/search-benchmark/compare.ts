// Runs the same queries on both search backends and compares what they find and how fast.
// Needs a corpus loaded into both (load.ts). Writes a JSON report next to --out.
//
//   npx tsx --env-file=.env.benchmark scripts/search-benchmark/compare.ts --out report.json [--runs 20] [--concurrency 8]
//
// Queries come from the loaded data itself, per category (common and rare words, prefixes, short
// substrings, accents, phrases, operators, filters...). OpenSearch is the reference: "missed" are
// conversations only it found, "extra" those only Postgres found.
import { writeFileSync } from "fs";
import getPrisma from "../../src/lib/prisma";
import { searchOpenSearch } from "../../src/lib/search/opensearch";
import { searchPostgres } from "../../src/lib/search/postgres";
import { parseSearchRequest, type SearchRequest } from "../../src/lib/search/request";
import { parseSearchQuery } from "../../src/lib/search/query-parser";
import { matchesQuery } from "../../src/lib/search/match";
import { foldText, splitWords } from "../../src/lib/search/fold";
import type { SearchResults } from "../../src/lib/search/types";
import { SEARCH_HIGHLIGHT_POST_TAG, SEARCH_HIGHLIGHT_PRE_TAG } from "../../src/lib/search-highlights";
import { DEFAULT_RESULTS_SIZE, SEARCH_LIMITS } from "../../src/lib/defaults";

interface BenchQuery {
  category: string;
  body: Record<string, unknown>;
}

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const OUT = option("out", "search-benchmark-report.json");
const RUNS = Number(option("runs", "20"));
const CONCURRENCY = Number(option("concurrency", "8"));
const LOAD_SECONDS = Number(option("load-seconds", "20"));
const PER_CATEGORY = Number(option("per-category", "12"));

// Deterministic sampling, so two runs compare the same queries
let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const sample = <T>(items: T[], count: number): T[] => {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked;
};

async function buildQueries(): Promise<BenchQuery[]> {
  const prisma = getPrisma();
  const stats = await prisma.$queryRaw<{ word: string; ndoc: number }[]>`
    SELECT word, ndoc FROM ts_stat('SELECT search_tsv FROM messages') WHERE length(word) BETWEEN 3 AND 30`;
  const isLatin = (word: string) => /^[a-z]+$/.test(word);
  const common = stats.filter((s) => s.ndoc > 2000 && isLatin(s.word) && s.word.length >= 5);
  const mid = stats.filter((s) => s.ndoc >= 50 && s.ndoc <= 500 && isLatin(s.word) && s.word.length >= 5);
  const rare = stats.filter((s) => s.ndoc >= 2 && s.ndoc <= 10 && isLatin(s.word) && s.word.length >= 6);
  const nonLatin = stats.filter((s) => s.ndoc >= 5 && /[Ѐ-ӿ一-鿿]/.test(s.word));

  // Words as people type them: with their accents, taken from the raw text
  const accented = await prisma.$queryRaw<{ word: string }[]>`
    SELECT DISTINCT w AS word FROM (
      SELECT regexp_split_to_table(content #>> '{}', '[^[:alpha:]]+') AS w
      FROM messages WHERE jsonb_typeof(content) = 'string' AND random() < 0.05
    ) words WHERE w ~ '[àâäçéèêëîïôöùûüÿñáíóúãõ]' AND length(w) >= 5 LIMIT 400`;

  const phrases = await prisma.$queryRaw<{ phrase: string }[]>`
    SELECT substring(content #>> '{}' from '([[:alpha:]]{4,} [[:alpha:]]{4,} [[:alpha:]]{4,})') AS phrase
    FROM messages WHERE role = 'assistant' AND jsonb_typeof(content) = 'string' AND random() < 0.05 LIMIT 300`;
  const usablePhrases = phrases.map((p) => p.phrase).filter(Boolean);

  const identifiers = await prisma.$queryRaw<{ word: string }[]>`
    SELECT DISTINCT substring(content #>> '{}' from '([a-z]+_[a-z]+(?:_[a-z]+)?)') AS word
    FROM messages WHERE jsonb_typeof(content) = 'string' AND content #>> '{}' ~ '[a-z]+_[a-z]+' LIMIT 300`;

  const words = (list: { word: string }[], count: number) => sample(list, count).map((s) => s.word);
  const queries: BenchQuery[] = [];
  const add = (category: string, query: string, extra: Record<string, unknown> = {}) =>
    queries.push({ category, body: { query, size: DEFAULT_RESULTS_SIZE, ...extra } });

  add("empty (latest)", "");
  words(common, PER_CATEGORY).forEach((w) => add("word: common", w));
  words(mid, PER_CATEGORY).forEach((w) => add("word: mid frequency", w));
  words(rare, PER_CATEGORY).forEach((w) => add("word: rare", w));
  words(mid, PER_CATEGORY).forEach((w) => add("prefix as typed (5 chars)", w.slice(0, 5)));
  words(mid, PER_CATEGORY).forEach((w) => add("substring 3-4 chars", w.slice(1, 1 + 3 + Math.floor(random() * 2))));
  sample(accented, PER_CATEGORY).forEach((a) => add("accented as typed", a.word));
  sample(accented, PER_CATEGORY).forEach((a) =>
    add("accented typed without accents", a.word.normalize("NFD").replace(/\p{M}/gu, "")),
  );
  words(nonLatin, PER_CATEGORY).forEach((w) => add("cyrillic / cjk", w));
  sample(usablePhrases, PER_CATEGORY).forEach((p) => add("two words", p.split(" ").slice(0, 2).join(" ")));
  sample(usablePhrases, PER_CATEGORY).forEach((p) => add("three words", p));
  sample(usablePhrases, PER_CATEGORY).forEach((p) => add("quoted phrase", `"${p.split(" ").slice(0, 2).join(" ")}"`));
  sample(mid, PER_CATEGORY).forEach((s) => add("negation", `${s.word} -${words(common, 1)[0]}`));
  sample(mid, PER_CATEGORY).forEach((s) => add("or", `${s.word} | ${words(rare, 1)[0]}`));
  sample(
    identifiers.filter((i) => i.word),
    PER_CATEGORY,
  ).forEach((i) => add("snake_case identifier", i.word));
  ["fetch_url", "web_search", "run_python", "read_file", "get_weather"].forEach((t) => add("tool name", t));
  ["claude", "gpt", "gemini", "deepseek", "qwen3", "4o", "mini"].forEach((m) => add("model name", m));
  words(mid, 6).forEach((w) => add("role:user filter", `role:user ${w}`));
  words(mid, 6).forEach((w) => add("model: filter", `model:"gpt-4o" ${w}`));
  words(mid, 6).forEach((w) => add("time range 1m", w, { timeRange: "1m" }));
  words(common, 6).forEach((w) =>
    add("time range custom", w, { timeRange: { start: "2026-01-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" } }),
  );
  words(common, 6).forEach((w) => add("page 2 (from 40)", w, { from: 40 }));
  return queries;
}

const toRequest = (body: Record<string, unknown>): SearchRequest => {
  const request = parseSearchRequest(body);
  if ("error" in request) throw new Error(request.error);
  return request;
};

const BACKENDS = {
  opensearch: (request: SearchRequest) => searchOpenSearch(request),
  postgres: (request: SearchRequest) => searchPostgres(request),
} as const;
type BackendName = keyof typeof BACKENDS;

async function timed(backend: BackendName, request: SearchRequest): Promise<{ ms: number; results: SearchResults }> {
  const start = performance.now();
  const results = await BACKENDS[backend](request);
  return { ms: performance.now() - start, results };
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
};

// The words a snippet marks, folded to compare across backends
const highlightedWords = (snippet: string | undefined): Set<string> => {
  const words = new Set<string>();
  if (!snippet) return words;
  const pattern = new RegExp(`${SEARCH_HIGHLIGHT_PRE_TAG}(.*?)${SEARCH_HIGHLIGHT_POST_TAG}`, "gs");
  // Folded and split the same way on both sides: OpenSearch marks fetch_url as one token
  for (const match of snippet.matchAll(pattern)) splitWords(foldText(match[1])).forEach((word) => words.add(word));
  return words;
};

// What the UI shows as the result's snippet (src/app/page.tsx): the top-level content fragment,
// else the first inner hit's highlight
const snippetOf = (hit: SearchResults["hits"][number]): string | undefined => {
  const inner = (hit.inner_hits?.messages?.hits?.hits ?? [])[0]?.highlight;
  return hit.highlight?.["messages.content"]?.[0] ?? inner?.content?.[0] ?? inner?.["messages.content"]?.[0];
};

interface DocMessage {
  content?: unknown;
  reasoning_content?: string;
  tool_calls?: Array<{ function?: { name?: string }; custom?: { name?: string } }>;
}

// Which part of a Postgres-only hit matched, for the report: the differences are by design when
// they come from reasoning (OpenSearch only matches whole words there) or from word adjacency
function extraReason(hit: SearchResults["hits"][number], text: string): string {
  const query = parseSearchQuery(text);
  if (!query) return "no query";
  const source = hit._source as { model: string; messages: DocMessage[] };
  const parts: Record<string, string[]> = { content: [], reasoning: [], "tool name": [] };
  for (const message of source.messages) {
    if (typeof message.content === "string") parts.content.push(message.content);
    if (message.reasoning_content) parts.reasoning.push(message.reasoning_content);
    for (const call of message.tool_calls ?? [])
      parts["tool name"].push(call.function?.name ?? call.custom?.name ?? "");
  }
  for (const [part, texts] of Object.entries(parts)) {
    if (texts.some((value) => matchesQuery(value, query, part !== "tool name"))) return part;
  }
  if (matchesQuery(source.model, query, false)) return "model";
  return "words split across content, reasoning and tool names";
}

async function compareQuery(query: BenchQuery) {
  const request = toRequest(query.body);
  // Everything each backend matches, ids only matter here
  const fullRequest = { ...request, from: 0, size: SEARCH_LIMITS.maxResultWindow };
  const [osAll, pgAll] = await Promise.all([searchOpenSearch(fullRequest), searchPostgres(fullRequest)]);
  const osIds = new Set(osAll.hits.map((hit) => hit._id));
  const pgIds = new Set(pgAll.hits.map((hit) => hit._id));
  const missed = [...osIds].filter((id) => !pgIds.has(id));
  const extra = [...pgIds].filter((id) => !osIds.has(id));
  const pgById = new Map(pgAll.hits.map((hit) => [hit._id, hit]));
  const extraReasons: Record<string, number> = {};
  for (const id of extra) {
    const reason = extraReason(pgById.get(id)!, request.text);
    extraReasons[reason] = (extraReasons[reason] ?? 0) + 1;
  }

  const [osPage, pgPage] = await Promise.all([searchOpenSearch(request), searchPostgres(request)]);
  const pgPageById = new Map(pgPage.hits.map((hit) => [hit._id, hit]));
  const pageOverlap = osPage.hits.filter((hit) => pgPageById.has(hit._id)).length;

  // Snippet agreement on the results both show: same highlighted words
  let snippetsCompared = 0;
  let snippetsAgree = 0;
  // Results only one backend gives a highlighted snippet (the UI then shows the first prompt)
  let snippetOnlyOpenSearch = 0;
  let snippetOnlyPostgres = 0;
  for (const osHit of osPage.hits) {
    const pgHit = pgPageById.get(osHit._id);
    if (!pgHit) continue;
    const osWords = highlightedWords(snippetOf(osHit));
    const pgWords = highlightedWords(snippetOf(pgHit));
    if (osWords.size === 0 || pgWords.size === 0) {
      if (osWords.size > 0) snippetOnlyOpenSearch++;
      if (pgWords.size > 0) snippetOnlyPostgres++;
      continue;
    }
    snippetsCompared++;
    // OpenSearch marks only the matched part of a word (its edge and ngram fields), Postgres the
    // word: the snippets agree when they mark the same words
    const marksSameWord = (a: string, b: string) => a.includes(b) || b.includes(a);
    if ([...osWords].some((osWord) => [...pgWords].some((pgWord) => marksSameWord(osWord, pgWord)))) snippetsAgree++;
  }

  return {
    ...query,
    opensearch: { total: osAll.total.value, matched: osIds.size },
    postgres: { total: pgAll.total.value, matched: pgIds.size },
    missed: missed.length,
    extra: extra.length,
    missedSample: missed.slice(0, 3),
    extraSample: extra.slice(0, 3),
    extraReasons,
    pageSize: Math.max(osPage.hits.length, pgPage.hits.length),
    pageOverlap,
    snippetsCompared,
    snippetsAgree,
    snippetOnlyOpenSearch,
    snippetOnlyPostgres,
  };
}

async function measureLatency(queries: BenchQuery[]) {
  const result: Record<BackendName, Record<string, number[]>> = { opensearch: {}, postgres: {} };
  for (const backend of Object.keys(BACKENDS) as BackendName[]) {
    // Warm both caches first, like a server that has been up for a while
    for (const query of queries) await BACKENDS[backend](toRequest(query.body));
    for (let run = 0; run < RUNS; run++) {
      for (const query of queries) {
        const { ms } = await timed(backend, toRequest(query.body));
        (result[backend][query.category] ??= []).push(ms);
      }
    }
  }
  return result;
}

async function measureThroughput(queries: BenchQuery[]) {
  const result: Record<string, { qps: number; p50: number; p95: number; p99: number; errors: number }> = {};
  for (const backend of Object.keys(BACKENDS) as BackendName[]) {
    const latencies: number[] = [];
    let errors = 0;
    const deadline = Date.now() + LOAD_SECONDS * 1000;
    let next = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (Date.now() < deadline) {
        const query = queries[next++ % queries.length];
        try {
          latencies.push((await timed(backend, toRequest(query.body))).ms);
        } catch {
          errors++;
        }
      }
    });
    await Promise.all(workers);
    result[backend] = {
      qps: latencies.length / LOAD_SECONDS,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      errors,
    };
  }
  return result;
}

// The JS fold (query words, highlights) must fold like pk_search_fold (the index), or a typed word
// misses what it should find. Checked on words from the loaded data.
async function foldConsistency() {
  const rows = await getPrisma().$queryRaw<{ word: string; folded: string }[]>`
    SELECT word, pk_search_fold(word) AS folded FROM (
      SELECT DISTINCT regexp_split_to_table(content #>> '{}', '\\s+') AS word
      FROM messages WHERE jsonb_typeof(content) = 'string' AND random() < 0.1
    ) words WHERE word <> '' LIMIT 50000`;
  const mismatches = rows.filter((row) => splitWords(foldText(row.word)).join(" ") !== (row.folded ?? ""));
  return {
    words: rows.length,
    mismatches: mismatches.length,
    examples: mismatches.slice(0, 15).map((row) => ({
      word: row.word,
      sql: row.folded,
      js: splitWords(foldText(row.word)).join(" "),
    })),
  };
}

async function main() {
  const fold = await foldConsistency();
  console.log(`fold: ${fold.mismatches} of ${fold.words} words fold differently`);
  const queries = await buildQueries();
  console.log(`${queries.length} queries`);

  const quality = [];
  for (const query of queries) quality.push(await compareQuery(query));

  const latencyRuns = await measureLatency(queries);
  const latency: Record<string, Record<string, { p50: number; p95: number; p99: number; max: number }>> = {};
  for (const [backend, byCategory] of Object.entries(latencyRuns)) {
    const all = Object.values(byCategory).flat();
    latency[backend] = {
      all: { p50: percentile(all, 50), p95: percentile(all, 95), p99: percentile(all, 99), max: Math.max(...all) },
    };
    for (const [category, values] of Object.entries(byCategory)) {
      latency[backend][category] = {
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
        max: Math.max(...values),
      };
    }
  }

  const throughput = await measureThroughput(queries);

  writeFileSync(
    OUT,
    JSON.stringify({ runs: RUNS, concurrency: CONCURRENCY, fold, queries: quality, latency, throughput }, null, 2),
  );
  console.log(`report written to ${OUT}`);
  await getPrisma().$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

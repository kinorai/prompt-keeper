// Loads a conversation corpus into Postgres and, unless --postgres-only, into OpenSearch with the
// documents the outbox worker builds. For the search benchmark only: it writes to whatever
// POSTGRES_PRISMA_URL and OPENSEARCH_URL point at, so point them at throwaway instances.
//
//   npx tsx --env-file=.env.benchmark scripts/search-benchmark/load.ts corpus.jsonl [--copies N] [--postgres-only]
//   npx tsx --env-file=.env.benchmark scripts/search-benchmark/load.ts --from-postgres
//
// --from-postgres indexes into OpenSearch what Postgres already holds, e.g. a restored pg_dump.
//
// One JSON object per line: { model, created_at, latency_ms?, usage?, messages: [...] }, messages
// in the chat completions shape (role, content, tool_calls, tool_call_id, name, reasoning_content).
// --copies N loads the corpus N times, each copy shifted back by its index in years, to measure
// how the search scales.
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Prisma } from "@prisma/client";
import getPrisma from "../../src/lib/prisma";
import { getOpenSearchClient, INDEX_MAPPING, INDEX_SETTINGS, PROMPT_KEEPER_INDEX } from "../../src/lib/opensearch";
import { toSearchDocument } from "../../src/lib/search/document";

interface CorpusMessage {
  role: string;
  content: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
}

interface CorpusConversation {
  model: string;
  created_at: string;
  latency_ms?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  messages: CorpusMessage[];
}

const BATCH_SIZE = 500;
const YEAR_MS = 365 * 24 * 3600 * 1000;

const args = process.argv.slice(2);
const copiesIndex = args.indexOf("--copies");
const copies = copiesIndex === -1 ? 1 : Number(args[copiesIndex + 1]) || 1;
// The first argument that is neither a flag nor the value of --copies
const corpusPath = args.find(
  (arg, index) => !arg.startsWith("--") && (copiesIndex === -1 || index !== copiesIndex + 1),
);
const isPostgresOnly = args.includes("--postgres-only");
const isFromPostgres = args.includes("--from-postgres");

const asJson = (value: unknown) =>
  value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

async function* readCorpus(path: string): AsyncGenerator<CorpusConversation> {
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as CorpusConversation;
  }
}

async function loadBatch(batch: CorpusConversation[], copy: number, ids: string[]) {
  const prisma = getPrisma();
  const conversations = batch.map((convo, index) => ({
    id: `bench-${copy}-${ids.length + index}`,
    model: convo.model,
    latencyMs: convo.latency_ms ?? null,
    promptTokens: convo.usage?.prompt_tokens ?? null,
    completionTokens: convo.usage?.completion_tokens ?? null,
    totalTokens: convo.usage?.total_tokens ?? null,
    createdAt: new Date(new Date(convo.created_at).getTime() - copy * YEAR_MS),
  }));
  await prisma.conversation.createMany({ data: conversations });
  await prisma.message.createMany({
    data: batch.flatMap((convo, index) =>
      convo.messages.map((message, messageIndex) => ({
        conversationId: conversations[index].id,
        role: message.role,
        content: message.content === null || message.content === undefined ? Prisma.JsonNull : asJson(message.content),
        toolCalls: asJson(message.tool_calls),
        toolCallId: message.tool_call_id ?? null,
        name: message.name ?? null,
        reasoningContent: message.reasoning_content ?? null,
        messageIndex,
        createdAt: conversations[index].createdAt,
      })),
    ),
  });
  ids.push(...conversations.map((convo) => convo.id));
}

async function indexOpenSearch(ids: string[]) {
  const prisma = getPrisma();
  const client = getOpenSearchClient();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const slice = ids.slice(i, i + BATCH_SIZE);
    const [conversations, messages] = await Promise.all([
      prisma.conversation.findMany({ where: { id: { in: slice } } }),
      prisma.message.findMany({ where: { conversationId: { in: slice } }, orderBy: { messageIndex: "asc" } }),
    ]);
    const body = conversations.flatMap((convo) => [
      { index: { _index: PROMPT_KEEPER_INDEX, _id: convo.id } },
      toSearchDocument(
        convo,
        messages.filter((message) => message.conversationId === convo.id),
      ),
    ]);
    const response = await client.bulk({ body });
    if (response.body.errors) throw new Error(`Bulk indexing failed at batch ${i / BATCH_SIZE}`);
  }
  await client.indices.refresh({ index: PROMPT_KEEPER_INDEX });
}

async function main() {
  if (!corpusPath && !isFromPostgres) {
    throw new Error("usage: load.ts corpus.jsonl [--copies N] [--postgres-only] | load.ts --from-postgres");
  }
  const started = Date.now();
  const ids: string[] = isFromPostgres
    ? (await getPrisma().conversation.findMany({ select: { id: true } })).map((convo) => convo.id)
    : [];
  for (let copy = 0; copy < (isFromPostgres ? 0 : copies); copy++) {
    let batch: CorpusConversation[] = [];
    for await (const convo of readCorpus(corpusPath!)) {
      batch.push(convo);
      if (batch.length === BATCH_SIZE) {
        await loadBatch(batch, copy, ids);
        batch = [];
      }
    }
    if (batch.length > 0) await loadBatch(batch, copy, ids);
  }
  console.log(`Postgres: ${ids.length} conversations in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (!isPostgresOnly) {
    const indexStarted = Date.now();
    const client = getOpenSearchClient();
    const exists = await client.indices.exists({ index: PROMPT_KEEPER_INDEX });
    if (!exists.body) {
      await client.indices.create({
        index: PROMPT_KEEPER_INDEX,
        body: { settings: INDEX_SETTINGS, mappings: INDEX_MAPPING },
      });
    }
    await indexOpenSearch(ids);
    console.log(`OpenSearch: indexed in ${((Date.now() - indexStarted) / 1000).toFixed(1)}s`);
  }
  await getPrisma().$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

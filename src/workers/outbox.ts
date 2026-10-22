import "dotenv/config";
import { createServer } from "http";
import { errors } from "@opensearch-project/opensearch";
import { createLogger } from "../lib/logger";
import getPrisma from "../lib/prisma";
import { getOpenSearchClient, PROMPT_KEEPER_INDEX, ensureIndexExists } from "../lib/opensearch";
import { deleteFile } from "../lib/s3";
import { STORED_IMAGE_KEY_PREFIX } from "../lib/image-types";

const log = createLogger("worker:outbox");

interface OutboxEventRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown | null;
  attempts: number;
  rejectedAttempts: number;
  lockedAt: Date | null;
  lockId: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

const CONFIG = {
  pollIntervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS || 1000),
  batchSize: Number(process.env.OUTBOX_BATCH_SIZE || 50),
  shardId: Number(process.env.WORKER_SHARD_ID || 0),
  shardTotal: Math.max(1, Number(process.env.WORKER_SHARD_TOTAL || 1)),
  // Reclaims events whose worker died mid-processing
  lockTtlMs: 60000,
  // A failed event waits retryBaseMs * 2^(attempts - 1), at most retryMaxMs, before its next attempt
  retryBaseMs: 10000,
  retryMaxMs: 3600000,
  // Only attempts OpenSearch rejected count; outages are retried until they end
  maxAttempts: Math.max(1, Number(process.env.OUTBOX_MAX_ATTEMPTS || 10)),
  healthPort: Number(process.env.HEALTH_PORT || 3001),
};

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

// Health state tracking
let isLive = false;
let lastPollTime = Date.now();

function modHash(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

// Events that are pending, not locked by a live worker, and past their backoff
function claimableWhere(now: Date) {
  const expired = new Date(now.getTime() - CONFIG.lockTtlMs);
  return {
    processedAt: null,
    deadLetteredAt: null,
    AND: [
      { OR: [{ lockedAt: null }, { lockedAt: { lt: expired } }] },
      { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    ],
  };
}

async function claimEvent(id: string): Promise<boolean> {
  const prisma = getPrisma();
  const now = new Date();
  const res = await prisma.outboxEvent.updateMany({
    where: { id, ...claimableWhere(now) },
    data: { lockedAt: now, lockId: WORKER_ID, attempts: { increment: 1 } },
  });
  return res.count === 1;
}

async function markProcessed(id: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.outboxEvent.update({
    where: { id },
    data: { processedAt: new Date(), lockId: null, lockedAt: null },
  });
}

// OpenSearch refused the event itself (bad mapping, invalid document): retrying the same payload fails
// the same way. Connection errors, timeouts, throttling and 5xx are outages and are retried until they end.
function isRejection(err: unknown): boolean {
  if (err instanceof errors.SerializationError) return true;
  if (!(err instanceof errors.ResponseError)) return false;
  const status = err.statusCode;
  return status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;
}

const retryDelayMs = (attempts: number): number =>
  Math.min(CONFIG.retryBaseMs * 2 ** Math.min(Math.max(attempts - 1, 0), 30), CONFIG.retryMaxMs);

// A failing event backs off exponentially instead of being retried on every poll
async function recordFailure(e: OutboxEventRecord, err: unknown): Promise<void> {
  const prisma = getPrisma();
  const lastError = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  // claimEvent already counted this attempt
  const attempts = e.attempts + 1;
  const rejectedAttempts = e.rejectedAttempts + (isRejection(err) ? 1 : 0);
  const isDeadLetter = rejectedAttempts >= CONFIG.maxAttempts;
  await prisma.outboxEvent.update({
    where: { id: e.id },
    data: {
      lockId: null,
      lockedAt: null,
      lastError,
      rejectedAttempts,
      nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
      ...(isDeadLetter ? { deadLetteredAt: new Date() } : {}),
    },
  });
  if (isDeadLetter) {
    log.error(
      { eventId: e.id, eventType: e.eventType, aggregateId: e.aggregateId, attempts, rejectedAttempts, lastError },
      "[Outbox] Event dead-lettered after OpenSearch rejected it too many times; see README to requeue",
    );
  }
}

const getImageKeys = (payload: unknown): string[] => {
  const keys = (payload as { imageKeys?: unknown } | null)?.imageKeys;
  return Array.isArray(keys)
    ? keys.filter((key): key is string => typeof key === "string" && key.startsWith(STORED_IMAGE_KEY_PREFIX))
    : [];
};

async function processConversationUpsert(aggregateId: string): Promise<void> {
  const prisma = getPrisma();
  // Load conversation and messages
  const convo = await prisma.conversation.findUnique({ where: { id: aggregateId } });
  if (!convo) return;
  const messages = await prisma.message.findMany({
    where: { conversationId: aggregateId },
    orderBy: { messageIndex: "asc" },
  });

  const body = {
    model: convo.model,
    messages: messages.map((m) => {
      let content = m.content;
      let multimodal_content = undefined;

      // Handle multimodal content (array)
      if (Array.isArray(m.content)) {
        // Extract text for the main content field (to satisfy text mapping)
        content = (m.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === "text")
          .map((c) => c.text || "")
          .join("\n");
        // Store full structure in a new field
        multimodal_content = m.content;
      }

      return {
        role: m.role,
        content: content,
        multimodal_content,
        tool_calls: m.toolCalls ?? undefined,
        tool_call_id: m.toolCallId ?? undefined,
        name: m.name ?? undefined,
        reasoning_content: m.reasoningContent ?? undefined,
        thinking_blocks: m.thinkingBlocks ?? undefined,
        annotations: m.annotations ?? undefined,
        audio: m.audio ?? undefined,
        images: m.images ?? undefined,
        refusal: m.refusal ?? undefined,
      };
    }),
    usage: {
      prompt_tokens: convo.promptTokens ?? 0,
      completion_tokens: convo.completionTokens ?? 0,
      total_tokens: convo.totalTokens ?? 0,
    },
    latency: convo.latencyMs ?? 0,
    conversation_hash: convo.conversationHash ?? null,
    created_at: convo.createdAt,
    updated_at: convo.updatedAt,
  } as const;

  await ensureIndexExists();
  await getOpenSearchClient().index({ index: PROMPT_KEEPER_INDEX, id: aggregateId, body });
}

async function processConversationDelete(aggregateId: string, payload: unknown): Promise<void> {
  try {
    await getOpenSearchClient().delete({
      index: PROMPT_KEEPER_INDEX,
      id: aggregateId,
      refresh: "wait_for",
    });
    log.info({ conversationId: aggregateId }, "Conversation deleted from OpenSearch");
  } catch (error) {
    // If document doesn't exist in OpenSearch, that's okay. The client reports it as a ResponseError
    // whose message is just "Response Error", so check the status
    if (error instanceof errors.ResponseError && error.statusCode === 404) {
      log.warn({ conversationId: aggregateId }, "Conversation not found in OpenSearch (already deleted?)");
    } else {
      throw error;
    }
  }

  // Uploaded images outlive the conversation unless they are removed here. S3 deletes are idempotent,
  // so a retry after a partial failure is safe.
  const imageKeys = getImageKeys(payload);
  await Promise.all(imageKeys.map((key) => deleteFile(key)));
  if (imageKeys.length > 0) {
    log.info({ conversationId: aggregateId, count: imageKeys.length }, "Conversation images deleted from S3");
  }
}

async function processEvent(e: OutboxEventRecord): Promise<void> {
  try {
    if (!(await claimEvent(e.id))) return; // lost race
    switch (e.eventType) {
      case "conversation.upserted":
        await processConversationUpsert(e.aggregateId);
        break;
      case "conversation.deleted":
        await processConversationDelete(e.aggregateId, e.payload);
        break;
      default:
        // Unknown events are marked processed to avoid blocking
        log.warn({ eventType: e.eventType }, "Unknown event type, marking processed");
    }
    await markProcessed(e.id);
  } catch (err) {
    log.error(err, "[Outbox] Processing error");
    await recordFailure(e, err);
  }
}

async function pollOnce(): Promise<void> {
  const prisma = getPrisma();
  const candidates = await prisma.outboxEvent.findMany({
    where: claimableWhere(new Date()),
    orderBy: { createdAt: "asc" },
    take: CONFIG.batchSize * 2, // fetch extra before shard filtering
  });

  const shardFiltered = candidates.filter(
    (e: OutboxEventRecord) => modHash(e.aggregateId, CONFIG.shardTotal) === CONFIG.shardId,
  );
  const batch = shardFiltered.slice(0, CONFIG.batchSize);
  if (batch.length === 0) return;

  for (const e of batch) {
    await processEvent(e as OutboxEventRecord);
  }

  // Update last poll time for liveness tracking
  lastPollTime = Date.now();
}

// Health check functions
// Failure details go to the log, not the response: the probe is unauthenticated
async function checkPostgres(): Promise<{ ok: boolean }> {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    log.error(error, "Readiness: Postgres check failed");
    return { ok: false };
  }
}

async function checkOpenSearch(): Promise<{ ok: boolean }> {
  try {
    const resp = await getOpenSearchClient().ping();
    if (resp.body === true) {
      return { ok: true };
    }
    log.error({ body: resp.body }, "Readiness: OpenSearch ping failed");
    return { ok: false };
  } catch (error) {
    log.error(error, "Readiness: OpenSearch check failed");
    return { ok: false };
  }
}

// HTTP Health Server
function startHealthServer() {
  const server = createServer(async (req, res) => {
    const url = req.url || "/";

    // Basic health check
    if (url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    // Liveness check - ensure main loop is running and polling
    if (url === "/livez") {
      const timeSinceLastPoll = Date.now() - lastPollTime;
      const isHealthy = isLive && timeSinceLastPoll < CONFIG.pollIntervalMs * 3; // 3x poll interval
      const status = isHealthy ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: isHealthy ? "live" : "unhealthy",
          checks: {
            timeSinceLastPoll,
            threshold: CONFIG.pollIntervalMs * 3,
          },
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    // Readiness check - ensure dependencies are reachable
    if (url === "/readyz") {
      const [pg, os] = await Promise.all([checkPostgres(), checkOpenSearch()]);
      const allOk = pg.ok && os.ok;
      const status = allOk ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: allOk ? "ready" : "degraded",
          checks: {
            postgres: pg,
            opensearch: os,
          },
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(CONFIG.healthPort, () => {
    log.info({ port: CONFIG.healthPort }, "Health server listening");
  });

  return server;
}

async function main() {
  // Start health server first
  startHealthServer();

  log.info(
    {
      pollIntervalMs: CONFIG.pollIntervalMs,
      batchSize: CONFIG.batchSize,
      shardId: CONFIG.shardId,
      shardTotal: CONFIG.shardTotal,
      workerId: WORKER_ID,
      healthPort: CONFIG.healthPort,
    },
    "Outbox worker started",
  );

  // Mark as live after successful startup
  isLive = true;
  lastPollTime = Date.now();

  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      log.error(err, "[Outbox] Poll error");
    }
    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
  }
}

// Tests import the event handling without starting the loop and health server
if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    log.error(err, "Outbox worker fatal error");
    process.exit(1);
  });
}

export { processEvent, pollOnce };

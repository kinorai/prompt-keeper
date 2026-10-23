import { errors } from "@opensearch-project/opensearch";
import { createLogger } from "@/lib/logger";
import getPrisma from "@/lib/prisma";
import { getOpenSearchClient, PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { deleteFile } from "@/lib/s3";
import { STORED_IMAGE_KEY_PREFIX } from "@/lib/image-types";
import { getSearchBackend } from "@/lib/search/backend";
import type { SearchBackend } from "@/lib/defaults";
import { toSearchDocument } from "@/lib/search/document";

// The outbox: what the write paths enqueue in the same transaction as the Postgres write, and the
// processing that applies it. The worker (src/workers/outbox.ts) runs it for the OpenSearch
// backend; with the Postgres backend the app runs it in-process (startInProcessOutbox).

const log = createLogger("outbox");

export const OUTBOX_CONFIG = {
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
};

export const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

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

function modHash(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

// Events that are pending, not locked by a live worker, and past their backoff
function claimableWhere(now: Date) {
  const expired = new Date(now.getTime() - OUTBOX_CONFIG.lockTtlMs);
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
  Math.min(OUTBOX_CONFIG.retryBaseMs * 2 ** Math.min(Math.max(attempts - 1, 0), 30), OUTBOX_CONFIG.retryMaxMs);

// A failing event backs off exponentially instead of being retried on every poll
async function recordFailure(e: OutboxEventRecord, err: unknown): Promise<void> {
  const prisma = getPrisma();
  const lastError = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  // claimEvent already counted this attempt
  const attempts = e.attempts + 1;
  const rejectedAttempts = e.rejectedAttempts + (isRejection(err) ? 1 : 0);
  const isDeadLetter = rejectedAttempts >= OUTBOX_CONFIG.maxAttempts;
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

async function processConversationUpsert(aggregateId: string, backend: SearchBackend): Promise<void> {
  // Postgres is the search index itself: nothing to sync. Events left from an OpenSearch setup drain here.
  if (backend !== "opensearch") return;
  const prisma = getPrisma();
  // Load conversation and messages
  const convo = await prisma.conversation.findUnique({ where: { id: aggregateId } });
  if (!convo) return;
  const messages = await prisma.message.findMany({
    where: { conversationId: aggregateId },
    orderBy: { messageIndex: "asc" },
  });

  await ensureIndexExists();
  await getOpenSearchClient().index({
    index: PROMPT_KEEPER_INDEX,
    id: aggregateId,
    body: toSearchDocument(convo, messages),
  });
}

async function processConversationDelete(aggregateId: string, payload: unknown, backend: SearchBackend): Promise<void> {
  if (backend === "opensearch") await deleteFromOpenSearch(aggregateId);

  // Uploaded images outlive the conversation unless they are removed here. S3 deletes are idempotent,
  // so a retry after a partial failure is safe.
  const imageKeys = getImageKeys(payload);
  await Promise.all(imageKeys.map((key) => deleteFile(key)));
  if (imageKeys.length > 0) {
    log.info({ conversationId: aggregateId, count: imageKeys.length }, "Conversation images deleted from S3");
  }
}

async function deleteFromOpenSearch(aggregateId: string): Promise<void> {
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
}

// `backend` is whose events these are: the worker passes "opensearch", it exists for nothing else
// and must not depend on its own SEARCH_BACKEND being set
export async function processEvent(e: OutboxEventRecord, backend: SearchBackend = getSearchBackend()): Promise<void> {
  try {
    if (!(await claimEvent(e.id))) return; // lost race
    switch (e.eventType) {
      case "conversation.upserted":
        await processConversationUpsert(e.aggregateId, backend);
        break;
      case "conversation.deleted":
        await processConversationDelete(e.aggregateId, e.payload, backend);
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

export async function pollOnce(backend: SearchBackend = getSearchBackend()): Promise<void> {
  const prisma = getPrisma();
  const candidates = await prisma.outboxEvent.findMany({
    where: claimableWhere(new Date()),
    orderBy: { createdAt: "asc" },
    take: OUTBOX_CONFIG.batchSize * 2, // fetch extra before shard filtering
  });

  const shardFiltered = candidates.filter(
    (e: OutboxEventRecord) => modHash(e.aggregateId, OUTBOX_CONFIG.shardTotal) === OUTBOX_CONFIG.shardId,
  );
  const batch = shardFiltered.slice(0, OUTBOX_CONFIG.batchSize);
  if (batch.length === 0) return;

  for (const e of batch) {
    await processEvent(e as OutboxEventRecord, backend);
  }
}

let inProcessTimer: NodeJS.Timeout | undefined;

// With the Postgres backend nothing else drains the outbox: the app does, at a slow pace, since
// only deleted conversations' images are left to clean up there. Safe with several replicas,
// claims are per event.
export function startInProcessOutbox(intervalMs: number): void {
  if (inProcessTimer) return;
  const tick = async () => {
    try {
      await pollOnce();
    } catch (err) {
      log.error(err, "[Outbox] Poll error");
    }
    inProcessTimer = setTimeout(tick, intervalMs);
    inProcessTimer.unref();
  };
  inProcessTimer = setTimeout(tick, 0);
  inProcessTimer.unref();
  log.info({ intervalMs, workerId: WORKER_ID }, "In-process outbox started");
}

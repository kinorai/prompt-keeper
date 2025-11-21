import "dotenv/config";
import { createLogger } from "../lib/logger";
import getPrisma from "../lib/prisma";
import opensearchClient, { PROMPT_KEEPER_INDEX, ensureIndexExists } from "../lib/opensearch";

const log = createLogger("worker:outbox");

interface OutboxEventRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown | null;
  attempts: number;
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
  lockTtlMs: 60000,
};

const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

function modHash(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

async function claimEvent(id: string): Promise<boolean> {
  const prisma = getPrisma();
  const now = new Date();
  const expired = new Date(Date.now() - CONFIG.lockTtlMs);
  const res = await prisma.outboxEvent.updateMany({
    where: {
      id,
      processedAt: null,
      OR: [{ lockedAt: null }, { lockedAt: { lt: expired } }],
    },
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

async function releaseLock(id: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.outboxEvent.update({ where: { id }, data: { lockId: null, lockedAt: null } });
}

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
    timestamp: new Date(),
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
  await opensearchClient.index({ index: PROMPT_KEEPER_INDEX, id: aggregateId, body });
}

async function processConversationDelete(aggregateId: string): Promise<void> {
  try {
    await opensearchClient.delete({
      index: PROMPT_KEEPER_INDEX,
      id: aggregateId,
      refresh: "wait_for",
    });
    log.info({ conversationId: aggregateId }, "Conversation deleted from OpenSearch");
  } catch (error) {
    // If document doesn't exist in OpenSearch, that's okay
    if (error instanceof Error && error.message.includes("404")) {
      log.warn({ conversationId: aggregateId }, "Conversation not found in OpenSearch (already deleted?)");
    } else {
      throw error;
    }
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
        await processConversationDelete(e.aggregateId);
        break;
      default:
        // Unknown events are marked processed to avoid blocking
        log.warn({ eventType: e.eventType }, "Unknown event type, marking processed");
    }
    await markProcessed(e.id);
  } catch (err) {
    log.error(err, "[Outbox] Processing error");
    await releaseLock(e.id);
  }
}

async function pollOnce(): Promise<void> {
  const prisma = getPrisma();
  const expired = new Date(Date.now() - CONFIG.lockTtlMs);
  const candidates = await prisma.outboxEvent.findMany({
    where: {
      processedAt: null,
      OR: [{ lockedAt: null }, { lockedAt: { lt: expired } }],
    },
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
}

async function main() {
  log.info(
    {
      pollIntervalMs: CONFIG.pollIntervalMs,
      batchSize: CONFIG.batchSize,
      shardId: CONFIG.shardId,
      shardTotal: CONFIG.shardTotal,
      workerId: WORKER_ID,
    },
    "Outbox worker started",
  );

  while (true) {
    try {
      await pollOnce();
    } catch (err) {
      log.error(err, "[Outbox] Poll error");
    }
    await new Promise((r) => setTimeout(r, CONFIG.pollIntervalMs));
  }
}

main().catch((err) => {
  log.error(err, "Outbox worker fatal error");
  process.exit(1);
});

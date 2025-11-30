import { Client } from "@opensearch-project/opensearch";
import { PrismaClient, Prisma } from "@prisma/client";
// import dotenv from "dotenv";

// dotenv.config();

console.log("Script started...");

const OPENSEARCH_INDEX = "prompt-keeper"; // Old index name

// Initialize OpenSearch Client
const osClient = new Client({
  node: process.env.OPENSEARCH_URL || "https://localhost:9200",
  auth: {
    username: process.env.OPENSEARCH_USERNAME || "admin",
    password: process.env.OPENSEARCH_PASSWORD || "admin",
  },
  ssl: {
    rejectUnauthorized: false, // For self-signed certs in local dev
  },
});

// Initialize Prisma Client
const prisma = new PrismaClient();

interface OpenSearchMessage {
  role: string;
  content: Prisma.InputJsonValue;
}

interface OpenSearchSource {
  raw_response?: {
    created?: number;
  };
  created_at?: string | number | Date;
  timestamp?: string | number | Date;
  updated_at?: string | number | Date;
  model?: string;
  conversation_hash?: string;
  latency?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  messages?: OpenSearchMessage[];
}

async function migrate() {
  console.log("Starting migration from OpenSearch to Postgres...");
  console.log(`Source Index: ${OPENSEARCH_INDEX}`);

  try {
    // Check if index exists
    const indexExists = await osClient.indices.exists({ index: OPENSEARCH_INDEX });
    if (!indexExists.body) {
      console.error(`Index ${OPENSEARCH_INDEX} does not exist.`);
      process.exit(1);
    }

    // Initialize scroll
    let scrollResponse = await osClient.search({
      index: OPENSEARCH_INDEX,
      scroll: "1m",
      size: 10,
      body: {
        query: {
          match_all: {},
        },
      },
    });

    let totalProcessed = 0;
    let totalErrors = 0;

    while (scrollResponse.body.hits.hits.length > 0) {
      const hits = scrollResponse.body.hits.hits;
      console.error(`Processing batch of ${hits.length} documents... (Total so far: ${totalProcessed})`);

      for (const hit of hits) {
        try {
          const source = hit._source as OpenSearchSource;
          const id = hit._id; // Use OpenSearch ID as Conversation ID if possible, or generate new one?
          // The schema uses CUIDs. If the old IDs are not CUIDs, we might want to keep them if they are compatible or generate new ones.
          // However, to maintain history, we should try to use the existing ID if it fits, or map it.
          // Let's assume we can use the existing ID or let Prisma generate one if we don't provide it.
          // But we need to link messages.
          // Let's try to use the `_id` from OpenSearch as the `id` in Postgres.
          // If it fails (e.g. length constraints), we might have an issue, but standard UUIDs/CUIDs fit in String.

          // Map fields
          // Debug: Log the first document to see structure
          if (totalProcessed === 0) {
            console.log("First document source:", JSON.stringify(source, null, 2));
          }

          // Helper to parse date
          const parseDate = (date: string | number | Date | null | undefined): Date | null => {
            if (!date) return null;
            const d = new Date(date);
            return isNaN(d.getTime()) ? null : d;
          };

          const createdFromEpoch = source.raw_response?.created ? new Date(source.raw_response.created * 1000) : null;

          // Try to find a valid creation date
          const creationDate =
            parseDate(source.created_at) || parseDate(source.timestamp) || createdFromEpoch || new Date(); // Fallback to now if absolutely nothing found

          const updateDate = parseDate(source.updated_at) || creationDate;

          // Map fields
          const conversationData = {
            id: id, // Attempt to preserve ID
            model: source.model || "unknown",
            conversationHash: source.conversation_hash || null,
            latencyMs: source.latency ? parseFloat(source.latency) : null,
            promptTokens: source.usage?.prompt_tokens || 0,
            completionTokens: source.usage?.completion_tokens || 0,
            totalTokens: source.usage?.total_tokens || 0,
            createdAt: creationDate,
            updatedAt: updateDate,
          };

          // Map messages
          const messages = (source.messages || []).map((msg: OpenSearchMessage, index: number) => ({
            role: msg.role,
            content: msg.content, // JSON field in Postgres
            messageIndex: index,
            createdAt: conversationData.createdAt,
          }));

          // Transaction: Create Conversation + Messages + OutboxEvent
          await prisma.$transaction(async (tx) => {
            // 1. Create Conversation
            // Use upsert to avoid duplicates if running multiple times
            await tx.conversation.upsert({
              where: { id: conversationData.id },
              update: {
                ...conversationData, // Update fields if exists (to fix dates)
                messages: {
                  deleteMany: {}, // Delete old messages to replace with new ones (simplest way to sync)
                  create: messages,
                },
              },
              create: {
                ...conversationData,
                messages: {
                  create: messages,
                },
              },
            });

            // 2. Create OutboxEvent
            // We need this to sync to the NEW OpenSearch index (prompt-keeper-v3)
            await tx.outboxEvent.create({
              data: {
                eventType: "conversation.upserted",
                aggregateType: "conversation",
                aggregateId: conversationData.id,
                payload: {}, // Payload not strictly needed as worker fetches from DB
              },
            });
          });

          totalProcessed++;
        } catch (err) {
          console.error(`Failed to process document ${hit._id}:`, err);
          totalErrors++;
        }
      }

      // Get next batch
      if (scrollResponse.body._scroll_id) {
        scrollResponse = await osClient.scroll({
          scroll_id: scrollResponse.body._scroll_id,
          scroll: "1m",
        });
      } else {
        break;
      }
    }

    console.error("Migration completed.");
    console.error(`Total processed: ${totalProcessed}`);
    console.error(`Total errors: ${totalErrors}`);
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await prisma.$disconnect();
    // Clear scroll context if possible, but client closing handles it usually or it times out
  }
}

migrate();

import { Client } from "@opensearch-project/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("opensearch");

const client = new Client({
  node: process.env.OPENSEARCH_URL || "http://localhost:9200",
  auth: {
    username: process.env.OPENSEARCH_USERNAME || "",
    password: process.env.OPENSEARCH_PASSWORD || "",
  },
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
  },
  maxRetries: 3,
  requestTimeout: 30000,
});

export const PROMPT_KEEPER_INDEX = "prompt-keeper";

// Initialize index with mapping if it doesn't exist
export async function initializeIndex() {
  try {
    const indexExists = await client.indices.exists({
      index: PROMPT_KEEPER_INDEX,
    });

    if (!indexExists.body) {
      log.info(`Creating index ${PROMPT_KEEPER_INDEX}...`);
      await client.indices.create({
        index: PROMPT_KEEPER_INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
          },
          mappings: {
            properties: {
              timestamp: { type: "date" },
              created_at: { type: "date" },
              updated_at: { type: "date" },
              conversation_hash: {
                type: "keyword",
                fields: {
                  keyword: { type: "keyword" },
                },
              },
              model: {
                type: "text",
                fields: {
                  keyword: { type: "keyword" },
                },
              },
              messages: {
                type: "nested",
                properties: {
                  role: { type: "keyword" },
                  content: {
                    type: "text",
                    analyzer: "standard",
                  },
                },
              },
              usage: {
                properties: {
                  total_tokens: { type: "integer" },
                  prompt_tokens: { type: "integer" },
                  completion_tokens: { type: "integer" },
                },
              },
              latency: { type: "float" },
            },
          },
        },
      });
      log.info(`Index ${PROMPT_KEEPER_INDEX} created successfully`);
    } else {
      // If index already exists, update mapping to add new fields
      try {
        await client.indices.putMapping({
          index: PROMPT_KEEPER_INDEX,
          body: {
            properties: {
              created_at: { type: "date" },
              updated_at: { type: "date" },
              conversation_hash: {
                type: "keyword",
                fields: {
                  keyword: { type: "keyword" },
                },
              },
            },
          },
        });
        log.info(`Updated mapping for ${PROMPT_KEEPER_INDEX} to include conversation_hash and timestamp fields`);
      } catch (mappingError) {
        log.error(mappingError, "Failed to update OpenSearch mapping:");
      }
    }
  } catch (error) {
    log.error(error, "Failed to initialize OpenSearch index:");
    throw error;
  }
}

// Call initializeIndex when the module is imported
initializeIndex().catch((error) => log.error(error, "Error initializing index:"));

export default client;

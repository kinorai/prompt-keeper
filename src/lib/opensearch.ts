import { Client } from "@opensearch-project/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("opensearch");

/**
 * OpenSearch client instance configured from environment variables.
 * This client is used throughout the application for all OpenSearch operations.
 */
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

// Track initialization state
let isInitialized = false;

// Define the complete mapping schema
const INDEX_MAPPING = {
  properties: {
    timestamp: { type: "date" as const },
    created_at: { type: "date" as const },
    updated_at: { type: "date" as const },
    conversation_hash: {
      type: "keyword" as const,
      fields: {
        keyword: { type: "keyword" as const },
      },
    },
    model: {
      type: "text" as const,
      fields: {
        keyword: { type: "keyword" as const },
        asyt: { type: "search_as_you_type" as const },
        keyword_lower: { type: "keyword" as const, normalizer: "lowercase_normalizer" as const },
      },
    },
    messages: {
      type: "nested" as const,
      properties: {
        role: { type: "keyword" as const },
        content: {
          type: "text" as const,
          analyzer: "standard" as const,
          fields: {
            asyt: { type: "search_as_you_type" as const },
            keyword_lower: { type: "keyword" as const, normalizer: "lowercase_normalizer" as const },
          },
        },
      },
    },
    usage: {
      properties: {
        total_tokens: { type: "integer" as const },
        prompt_tokens: { type: "integer" as const },
        completion_tokens: { type: "integer" as const },
      },
    },
    latency: { type: "float" as const },
  },
};

/**
 * Check if the prompt-keeper index exists in OpenSearch.
 * This is a read-only operation that doesn't modify the index.
 *
 * @returns {Promise<boolean>} True if the index exists, false otherwise
 */
export async function checkIndexExists(): Promise<boolean> {
  try {
    const response = await client.indices.exists({
      index: PROMPT_KEEPER_INDEX,
    });
    return response.body;
  } catch (error) {
    log.error(error, "Failed to check if index exists:");
    return false;
  }
}

/**
 * Initialize the prompt-keeper index with the proper mapping schema.
 * This function should only be called once during application startup,
 * typically through the /api/init endpoint.
 *
 * Best practices:
 * - Call this function only during initial setup or deployment
 * - Use the /api/init endpoint rather than calling directly
 * - The function tracks initialization state to prevent redundant operations
 *
 * @throws {Error} If index creation fails
 */
export async function initializeIndex() {
  try {
    // Skip if already initialized in this runtime
    if (isInitialized) {
      log.debug("Index already initialized in this runtime");
      return;
    }

    const indexExists = await checkIndexExists();

    if (!indexExists) {
      log.info(`Creating index ${PROMPT_KEEPER_INDEX}...`);
      await client.indices.create({
        index: PROMPT_KEEPER_INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              normalizer: {
                lowercase_normalizer: {
                  type: "custom",
                  filter: ["lowercase"],
                },
              },
            },
          },
          mappings: INDEX_MAPPING,
        },
      });
      log.info(`Index ${PROMPT_KEEPER_INDEX} created successfully`);
    } else {
      log.debug(`Index ${PROMPT_KEEPER_INDEX} already exists`);

      // Only check mapping compatibility if needed
      // In production, you might want to add migration logic here
      // For now, we'll just log that the index exists
    }

    isInitialized = true;
  } catch (error) {
    log.error(error, "Failed to initialize OpenSearch index:");
    throw error;
  }
}

/**
 * Ensure the OpenSearch index exists before performing operations.
 * This function is called automatically by all API routes that interact with OpenSearch.
 * It provides a fast check without modifying the index mapping.
 *
 * @throws {Error} If the index doesn't exist and needs initialization
 */
export async function ensureIndexExists() {
  if (!isInitialized) {
    const exists = await checkIndexExists();
    if (!exists) {
      // Log admin-facing detail but surface a user-friendly message outward
      log.error("OpenSearch index not initialized. Please call /api/init endpoint first.");
      throw new Error("Search is currently unavailable. Please try again later.");
    }
    isInitialized = true;
  }
}

/**
 * Reset the initialization state. This is primarily useful for testing.
 * In production, the initialization state persists for the lifetime of the process.
 */
export function resetInitializationState() {
  isInitialized = false;
}

export default client;

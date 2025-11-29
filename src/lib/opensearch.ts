import { Client } from "@opensearch-project/opensearch";
import type { IndexSettings } from "@opensearch-project/opensearch/api/_types/indices._common";
import type { TokenChar } from "@opensearch-project/opensearch/api/_types/_common.analysis";
import { createLogger } from "@/lib/logger";

const log = createLogger("opensearch");

/**
 * OpenSearch client instance configured from environment variables.
 * This client is lazily initialized on first use to avoid errors during build time.
 */
let client: Client | null = null;

/**
 * Get or create the OpenSearch client instance.
 * The client is lazily initialized only when this function is called,
 * preventing issues during build time when environment variables may not be available.
 *
 * @returns {Client} The OpenSearch client instance
 */
// Note: No default export to prevent eager client initialization at import time.
// Always use getOpenSearchClient() to get the client instance.
export function getOpenSearchClient(): Client {
  if (client) return client;

  client = new Client({
    node: process.env.OPENSEARCH_URL || "",
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

  return client;
}

export const PROMPT_KEEPER_INDEX = "prompt-keeper-v2";

// Track initialization state
let isInitialized = false;

const TOKEN_CHARS_LETTER_DIGIT: TokenChar[] = ["letter", "digit"];

// Define the analysis settings
const INDEX_SETTINGS: IndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 1,
  analysis: {
    tokenizer: {
      edge_ngram_tokenizer: {
        type: "edge_ngram",
        min_gram: 2,
        max_gram: 20,
        token_chars: TOKEN_CHARS_LETTER_DIGIT,
      },
      ngram_tokenizer: {
        type: "ngram",
        min_gram: 3,
        max_gram: 4,
        token_chars: TOKEN_CHARS_LETTER_DIGIT,
      },
    },
    analyzer: {
      edge_ngram_analyzer: {
        type: "custom",
        tokenizer: "edge_ngram_tokenizer",
        filter: ["lowercase", "asciifolding"],
      },
      ngram_analyzer: {
        type: "custom",
        tokenizer: "ngram_tokenizer",
        filter: ["lowercase", "asciifolding"],
      },
      folded_analyzer: {
        type: "custom",
        tokenizer: "standard",
        filter: ["lowercase", "asciifolding"],
      },
    },
    normalizer: {
      lowercase_asciifolding_normalizer: {
        type: "custom",
        filter: ["lowercase", "asciifolding"],
      },
    },
  },
};

// Define the complete mapping schema
const INDEX_MAPPING = {
  properties: {
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
      analyzer: "standard",
      fields: {
        keyword: { type: "keyword" as const },
        edge: {
          type: "text" as const,
          analyzer: "edge_ngram_analyzer",
          search_analyzer: "folded_analyzer",
        },
        folded: {
          type: "text" as const,
          analyzer: "folded_analyzer",
        },
      },
    },
    messages: {
      type: "nested" as const,
      properties: {
        role: { type: "keyword" as const },
        content: {
          type: "text" as const,
          analyzer: "standard",
          fields: {
            folded: {
              type: "text" as const,
              analyzer: "folded_analyzer",
            },
            edge: {
              type: "text" as const,
              analyzer: "edge_ngram_analyzer",
              search_analyzer: "folded_analyzer",
            },
            ngram: {
              type: "text" as const,
              analyzer: "ngram_analyzer",
              search_analyzer: "folded_analyzer",
            },
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
    const response = await getOpenSearchClient().indices.exists({
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
      await getOpenSearchClient().indices.create({
        index: PROMPT_KEEPER_INDEX,
        body: {
          settings: INDEX_SETTINGS,
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

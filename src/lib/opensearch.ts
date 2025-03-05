import { Client } from "@opensearch-project/opensearch";

const client = new Client({
  node: process.env.OPENSEARCH_URL || "http://localhost:9200",
  auth: {
    username: process.env.OPENSEARCH_USERNAME || "",
    password: process.env.OPENSEARCH_PASSWORD || "",
  },
  ssl: {
    rejectUnauthorized: false,
  },
});

export const PROMPT_KEEPER_INDEX = "prompt-keeper";

// Initialize index with mapping if it doesn't exist
export async function initializeIndex() {
  try {
    const indexExists = await client.indices.exists({
      index: PROMPT_KEEPER_INDEX,
    });

    if (!indexExists.body) {
      console.log(`Creating index ${PROMPT_KEEPER_INDEX}...`);
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
      console.log(`Index ${PROMPT_KEEPER_INDEX} created successfully`);
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
        console.log(
          `Updated mapping for ${PROMPT_KEEPER_INDEX} to include conversation_hash and timestamp fields`
        );
      } catch (mappingError) {
        console.error("Failed to update OpenSearch mapping:", mappingError);
        // Continue even if mapping update fails, as it might already include these fields
      }
    }
  } catch (error) {
    console.error("Failed to initialize OpenSearch index:", error);
    throw error;
  }
}

// Call initializeIndex when the module is imported
initializeIndex().catch(console.error);

export default client;

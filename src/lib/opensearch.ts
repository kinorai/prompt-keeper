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
              raw_response: {
                type: "object",
                properties: {
                  choices: {
                    type: "nested",
                    properties: {
                      message: {
                        properties: {
                          content: { type: "text" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      console.log(`Index ${PROMPT_KEEPER_INDEX} created successfully`);
    }
  } catch (error) {
    console.error("Failed to initialize OpenSearch index:", error);
    throw error;
  }
}

// Call initializeIndex when the module is imported
initializeIndex().catch(console.error);

export default client;

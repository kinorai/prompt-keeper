import { Client } from "@opensearch-project/opensearch";
import { INDEX_MAPPING, INDEX_SETTINGS } from "../src/lib/opensearch";
import { createLogger } from "../src/lib/logger";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const log = createLogger("scripts:reindex");

const client = new Client({
  node: process.env.OPENSEARCH_URL || "",
  auth: {
    username: process.env.OPENSEARCH_USERNAME || "",
    password: process.env.OPENSEARCH_PASSWORD || "",
  },
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === "production",
  },
});

const index = process.env.PROMPT_KEEPER_INDEX || "";

async function reindex() {
  try {
    const tempIndex = `${index}-temp`;

    log.info(`Starting reindexing process...`);
    log.info(`Source index: ${index}`);
    log.info(`Temp index: ${tempIndex}`);

    // 1. Create temp index with correct mapping
    const tempIndexExists = await client.indices.exists({ index: tempIndex });
    if (tempIndexExists.body) {
      log.info(`Deleting existing temp index ${tempIndex}...`);
      await client.indices.delete({ index: tempIndex });
    }

    log.info(`Creating temp index ${tempIndex} with correct mapping...`);
    await client.indices.create({
      index: tempIndex,
      body: {
        settings: INDEX_SETTINGS,
        mappings: INDEX_MAPPING,
      },
    });

    // 2. Reindex from source to temp
    log.info(`Reindexing data from ${index} to ${tempIndex}...`);
    const reindexResponse = await client.reindex({
      body: {
        source: { index: index },
        dest: { index: tempIndex },
      },
      wait_for_completion: true,
    });

    if (reindexResponse.body.failures.length > 0) {
      log.error("Reindexing failed with errors:", reindexResponse.body.failures);
      throw new Error("Reindexing failed");
    }

    log.info(`Reindexed ${reindexResponse.body.total} documents.`);

    // 3. Delete source index
    log.info(`Deleting source index ${index}...`);
    await client.indices.delete({ index: index });

    // 4. Create source index with correct mapping
    log.info(`Recreating source index ${index} with correct mapping...`);
    await client.indices.create({
      index: index,
      body: {
        settings: INDEX_SETTINGS,
        mappings: INDEX_MAPPING,
      },
    });

    // 5. Reindex from temp to source
    log.info(`Reindexing data from ${tempIndex} back to ${index}...`);
    const restoreResponse = await client.reindex({
      body: {
        source: { index: tempIndex },
        dest: { index: index },
      },
      wait_for_completion: true,
    });

    if (restoreResponse.body.failures.length > 0) {
      log.error("Restore reindexing failed with errors:", restoreResponse.body.failures);
      throw new Error("Restore reindexing failed");
    }

    log.info(`Restored ${restoreResponse.body.total} documents.`);

    // 6. Delete temp index
    log.info(`Deleting temp index ${tempIndex}...`);
    await client.indices.delete({ index: tempIndex });

    log.info("Reindexing completed successfully!");
  } catch (error) {
    log.error(error, "Reindexing failed:");
    process.exit(1);
  }
}

reindex();

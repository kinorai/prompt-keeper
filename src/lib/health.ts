import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import getPrisma from "@/lib/prisma";
import { getOpenSearchClient } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("health");

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

async function checkPrisma() {
  const prisma = getPrisma();
  await prisma.$queryRaw`SELECT 1`;
}

async function checkOpenSearch() {
  await getOpenSearchClient().ping();
}

async function checkS3() {
  const s3Client = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "",
      secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  });
  await s3Client.send(new ListBucketsCommand({}));
}

async function retry<T>(name: string, fn: () => Promise<T>, retries = MAX_RETRIES): Promise<void> {
  try {
    await fn();
    log.info(`${name} connection successful`);
  } catch (error) {
    if (retries > 0) {
      log.warn({ error }, `${name} connection failed, retrying in ${RETRY_DELAY_MS}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return retry(name, fn, retries - 1);
    } else {
      log.error({ error }, `${name} connection failed after ${MAX_RETRIES} retries`);
      throw error;
    }
  }
}

export async function checkConnections() {
  log.info("Starting health checks...");
  try {
    await Promise.all([retry("Prisma", checkPrisma), retry("OpenSearch", checkOpenSearch), retry("S3", checkS3)]);
    log.info("All health checks passed");
  } catch (error) {
    log.fatal({ error }, "Health checks failed. Exiting process.");
    process.exit(1);
  }
}

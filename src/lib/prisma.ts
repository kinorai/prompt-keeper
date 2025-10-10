import { PrismaClient } from "@prisma/client";

let prismaSingleton: PrismaClient | undefined;

export default function getPrisma(): PrismaClient {
  if (!process.env.POSTGRES_PRISMA_URL) {
    throw new Error("POSTGRES_PRISMA_URL not configured");
  }

  if (prismaSingleton) {
    return prismaSingleton;
  }

  prismaSingleton = new PrismaClient();
  return prismaSingleton;
}

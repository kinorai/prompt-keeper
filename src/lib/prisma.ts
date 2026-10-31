import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const createClient = () =>
  new PrismaClient({
    // Prisma 7 queries through node-postgres. pg waits forever for a connection by default;
    // 5 s is Prisma 6's connect_timeout, so a down database still fails the health checks fast.
    adapter: new PrismaPg({ connectionString: process.env.POSTGRES_PRISMA_URL, connectionTimeoutMillis: 5_000 }),
    // search_words repeats every message's words for the search indexes: never load it
    omit: { message: { searchWords: true, searchLong: true } },
  });

let prismaSingleton: ReturnType<typeof createClient> | undefined;

export default function getPrisma(): ReturnType<typeof createClient> {
  if (prismaSingleton) {
    return prismaSingleton;
  }

  // Lazy validation: PrismaClient will throw when trying to connect
  // if the URL is invalid, but we can instantiate it during build
  // This avoids needing IS_BUILD flag
  prismaSingleton = createClient();
  return prismaSingleton;
}

import { PrismaClient } from "@prisma/client";

// search_words repeats every message's words for the search indexes: never load it
const createClient = () => new PrismaClient({ omit: { message: { searchWords: true } } });

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

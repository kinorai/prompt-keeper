import { PrismaClient } from "@prisma/client";

let prismaSingleton: PrismaClient | undefined;

export default function getPrisma(): PrismaClient {
  if (prismaSingleton) {
    return prismaSingleton;
  }

  // Lazy validation: PrismaClient will throw when trying to connect
  // if the URL is invalid, but we can instantiate it during build
  // This avoids needing IS_BUILD flag
  prismaSingleton = new PrismaClient();
  return prismaSingleton;
}

// Prisma CLI config (migrate, generate, db execute). Since Prisma 7 the CLI no longer
// reads .env itself, and the connection URL lives here instead of in schema.prisma.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations take the direct connection, as `directUrl` did. process.env rather than
    // env(): env() throws when the variable is unset, and `prisma generate` runs without
    // a database (Docker build, CI).
    url: process.env.POSTGRES_URL_NON_POOLING,
  },
});

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "better-auth/plugins/passkey";
import { createAuthMiddleware, APIError } from "better-auth/api";
import getPrisma from "@/lib/prisma";

const prisma = getPrisma();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [passkey()],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const count = await prisma.user.count();
        // Allow signup if no users exist (admin setup) OR if ENABLE_SIGNUP is explicitly true
        if (count > 0 && process.env.ENABLE_SIGNUP !== "true") {
          throw new APIError("FORBIDDEN", { message: "Signups are disabled." });
        }
      }
    }),
  },
});

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { createAuthMiddleware, APIError } from "better-auth/api";
import getPrisma from "@/lib/prisma";

const prisma = getPrisma();

// Auth requests coming from an origin other than BETTER_AUTH_URL are rejected with
// INVALID_ORIGIN. Set BETTER_AUTH_TRUSTED_ORIGINS (comma-separated, scheme and port
// included) when the app is also reached by another address — a LAN/VPN host in
// development, or an extra domain in production.
const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// A passkey is bound to its Relying Party ID at creation, and the RP ID must be the origin's
// domain or a registrable suffix of it. Setting the parent domain (e.g. example.com rather than
// app.example.com) lets one passkey work across every subdomain — dev and production — at the
// cost of trusting every host under that domain. Defaults to the origin's own host when unset.
const rpID = process.env.BETTER_AUTH_RP_ID?.trim() || undefined;
const rpName = process.env.BETTER_AUTH_RP_NAME?.trim() || "Prompt Keeper";

// Rejects a new password (sign-up, password change or reset) found in the Have I Been Pwned
// corpus. Only the first 5 hex characters of its SHA-1 go to api.pwnedpasswords.com; sign-in
// never calls it. The check fails closed: when the API can't be reached the request fails with
// a 500 and no password is set, so a blocked egress can't silently skip it. Set
// PASSWORD_BREACH_CHECK=false on an install without internet access.
const isPasswordBreachCheckEnabled = process.env.PASSWORD_BREACH_CHECK !== "false";

export const auth = betterAuth({
  ...(trustedOrigins?.length ? { trustedOrigins } : {}),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [passkey({ ...(rpID ? { rpID } : {}), rpName }), haveIBeenPwned({ enabled: isPasswordBreachCheckEnabled })],
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
    // The count check above and the insert are not atomic: concurrent first signups can all see zero
    // users. After the insert, keep only the oldest account and undo any other that slipped through.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" || process.env.ENABLE_SIGNUP === "true") {
        return;
      }
      const returned = ctx.context.returned as { user?: { id?: string } } | undefined;
      const createdUserId = returned instanceof APIError ? undefined : returned?.user?.id;
      if (!createdUserId) {
        return;
      }
      const firstUser = await prisma.user.findFirst({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (firstUser && firstUser.id !== createdUserId) {
        // Sessions and accounts cascade with the user
        await prisma.user.delete({ where: { id: createdUserId } });
        throw new APIError("FORBIDDEN", { message: "Signups are disabled." });
      }
    }),
  },
});

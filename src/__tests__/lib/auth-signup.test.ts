import { betterAuth } from "better-auth";
import "@/lib/auth";
import getPrisma from "@/lib/prisma";

// auth.ts takes the Prisma client at import time, so the mock has to be built inside the factory
jest.mock("@/lib/prisma", () => {
  const client = { user: { count: jest.fn(), findFirst: jest.fn(), delete: jest.fn() } };
  return { __esModule: true, default: () => client };
});

const mockPrisma = getPrisma() as unknown as { user: Record<"count" | "findFirst" | "delete", jest.Mock> };

jest.mock("better-auth/api", () => {
  class APIError extends Error {
    constructor(
      public status: string,
      body: { message: string },
    ) {
      super(body.message);
    }
  }
  return {
    createAuthMiddleware: (fn: unknown) => fn,
    APIError,
  };
});

interface HookContext {
  path: string;
  context: { returned?: unknown };
}
type Hook = (ctx: HookContext) => Promise<void>;

const { hooks } = (betterAuth as jest.Mock).mock.calls[0][0] as { hooks: { before: Hook; after: Hook } };

const signedUp = (userId: string): HookContext => ({
  path: "/sign-up/email",
  context: { returned: { token: "t", user: { id: userId } } },
});

describe("first-user signup gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_SIGNUP;
  });

  it("blocks signup once a user exists", async () => {
    mockPrisma.user.count.mockResolvedValue(1);

    await expect(hooks.before({ path: "/sign-up/email", context: {} })).rejects.toThrow("Signups are disabled.");
  });

  it("keeps the first user", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "first" });

    await expect(hooks.after(signedUp("first"))).resolves.toBeUndefined();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("undoes a signup that raced past the count check", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "first" });

    await expect(hooks.after(signedUp("second"))).rejects.toThrow("Signups are disabled.");
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "second" } });
  });

  it("leaves existing users alone when the signup itself failed", async () => {
    await hooks.after({ path: "/sign-up/email", context: { returned: new Error("User already exists") } });

    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it("allows extra users when ENABLE_SIGNUP is true", async () => {
    process.env.ENABLE_SIGNUP = "true";

    await hooks.after(signedUp("second"));

    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });
});

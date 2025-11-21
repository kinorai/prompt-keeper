import crypto from "crypto";

// Polyfill crypto.randomUUID for tests
if (!global.crypto) {
  Object.defineProperty(global, "crypto", {
    value: {
      randomUUID: () => crypto.randomUUID(),
    },
    writable: true,
  });
} else if (!global.crypto.randomUUID) {
  // @ts-ignore
  global.crypto.randomUUID = () => crypto.randomUUID();
}

// Mock Next.js environment variables
Object.defineProperty(process.env, "NODE_ENV", { value: "test" });
process.env.AUTH_USERNAME = "testuser";
process.env.AUTH_PASSWORD_HASH = "$2a$10$mockhashedpassword";
process.env.PROMPT_KEEPER_API_KEY = "test-api-key";
process.env.JWT_SECRET = "test-secret-key";
process.env.POSTGRES_PRISMA_URL = "postgresql://test/test@test:5432/db"; // not used due to prisma mock

// Mock Next.js URL
global.URL = URL;

// Mock Headers for Next.js Request/Response
if (!global.Headers) {
  global.Headers = class Headers {
    private headers: Map<string, string>;

    constructor(init?: Record<string, string>) {
      this.headers = new Map();
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this.set(key, value);
        });
      }
    }

    get(name: string): string | null {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value);
    }

    has(name: string): boolean {
      return this.headers.has(name.toLowerCase());
    }
  } as unknown as typeof globalThis.Headers;
}

export {};

import type { Prisma } from "@prisma/client";

interface MockConversationRow {
  id: string;
  model: string;
  conversationHash: string | null;
  created: Date;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: Date;
  updatedAt: Date;
}

type MockTransactionClient = {
  conversation: {
    create: jest.Mock<Promise<MockConversationRow>, [{ data: Prisma.ConversationUncheckedCreateInput }]>;
    findFirst: jest.Mock<Promise<MockConversationRow | null>, [Prisma.ConversationFindFirstArgs]>;
    findUnique: jest.Mock<Promise<MockConversationRow | null>, [Prisma.ConversationFindUniqueArgs]>;
    update: jest.Mock<Promise<MockConversationRow>, [Prisma.ConversationUpdateArgs]>;
    delete: jest.Mock<Promise<MockConversationRow>, [Prisma.ConversationDeleteArgs]>;
  };
  message: {
    createMany: jest.Mock<Promise<{ count: number }>, [{ data: Prisma.MessageCreateManyArgs["data"] }]>;
    deleteMany: jest.Mock<Promise<{ count: number }>, [Prisma.MessageDeleteManyArgs]>;
  };
  outboxEvent: {
    create: jest.Mock<Promise<{ id: string }>, [{ data: Prisma.OutboxEventUncheckedCreateInput }]>;
  };
};

const mockTx: MockTransactionClient = {
  conversation: {
    create: jest.fn<Promise<MockConversationRow>, [{ data: Prisma.ConversationUncheckedCreateInput }]>(
      async ({ data }) => ({
        id: "conv_test",
        model: data.model ?? "test-model",
        conversationHash: (data.conversationHash as string | null | undefined) ?? null,
        created: (data.created as Date | undefined) ?? new Date(),
        latencyMs: (data.latencyMs as number | undefined) ?? 0,
        promptTokens: (data.promptTokens as number | null | undefined) ?? null,
        completionTokens: (data.completionTokens as number | null | undefined) ?? null,
        totalTokens: (data.totalTokens as number | null | undefined) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
    findFirst: jest.fn<Promise<MockConversationRow | null>, [Prisma.ConversationFindFirstArgs]>(async () => null),
    findUnique: jest.fn<Promise<MockConversationRow | null>, [Prisma.ConversationFindUniqueArgs]>(async () => null),
    update: jest.fn<Promise<MockConversationRow>, [Prisma.ConversationUpdateArgs]>(async ({ where, data }) => ({
      id: where.id as string,
      model: (data.model as string | undefined) ?? "test-model",
      conversationHash: (data.conversationHash as string | null | undefined) ?? null,
      created: new Date(),
      latencyMs: (data.latencyMs as number | undefined) ?? 0,
      promptTokens: (data.promptTokens as number | null | undefined) ?? null,
      completionTokens: (data.completionTokens as number | null | undefined) ?? null,
      totalTokens: (data.totalTokens as number | null | undefined) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    delete: jest.fn<Promise<MockConversationRow>, [Prisma.ConversationDeleteArgs]>(async ({ where }) => ({
      id: where.id as string,
      model: "test-model",
      conversationHash: null,
      created: new Date(),
      latencyMs: 0,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  },
  message: {
    createMany: jest.fn<Promise<{ count: number }>, [{ data: Prisma.MessageCreateManyArgs["data"] }]>(
      async ({ data }) => {
        const entries = Array.isArray(data) ? data : [data];
        return { count: entries.length };
      },
    ),
    deleteMany: jest.fn<Promise<{ count: number }>, [Prisma.MessageDeleteManyArgs]>(async () => ({ count: 0 })),
  },
  outboxEvent: {
    create: jest.fn<Promise<{ id: string }>, [{ data: Prisma.OutboxEventUncheckedCreateInput }]>(async ({ data }) => ({
      id: `evt_${String(data.aggregateId ?? "test")}`,
    })),
  },
};

jest.mock("@/lib/prisma", () => {
  const client = {
    $transaction: async <T>(fn: (tx: MockTransactionClient) => Promise<T>): Promise<T> => fn(mockTx),
  };

  return {
    __esModule: true,
    default: () => client,
  };
});

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({
    send: jest.fn(),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

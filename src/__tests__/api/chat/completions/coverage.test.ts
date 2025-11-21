import { POST } from "@/app/api/chat/completions/route";
import { NextRequest } from "next/server";
import { uploadFile } from "@/lib/s3";

// Mock dependencies
jest.mock("@/lib/opensearch", () => ({
  index: jest.fn(),
  search: jest.fn(),
  ensureIndexExists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/s3", () => ({
  uploadFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock crypto
jest.mock("crypto", () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue("mock-hash"),
  }),
  randomUUID: jest.fn().mockReturnValue("mock-uuid"),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock Prisma
const mockTx = {
  conversation: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: "new-id" }),
    deleteMany: jest.fn(),
  },
  message: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  outboxEvent: {
    create: jest.fn(),
  },
};

const mockPrismaClient = {
  $transaction: jest.fn((callback) => callback(mockTx)),
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: () => mockPrismaClient,
}));

describe("Chat Completions API Coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.conversation.findFirst.mockResolvedValue(null);
    mockPrismaClient.$transaction.mockImplementation((callback) => callback(mockTx));
  });

  it("should handle base64 image upload in messages", async () => {
    const requestBody = {
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,abc123" },
            },
          ],
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "mock-id",
        model: "gpt-4",
        created: 1234567890,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Response" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      headers: new Headers(),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify uploadFile was called
    expect(uploadFile).toHaveBeenCalled();
  });

  it("should update existing conversation if hash matches", async () => {
    // Mock findFirst to return an existing conversation
    mockTx.conversation.findFirst.mockResolvedValueOnce({
      id: "existing-id",
      conversationHash: "mock-hash",
      updatedAt: new Date(),
    });

    const requestBody = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "Message 1" },
        { role: "assistant", content: "Response 1" },
        { role: "user", content: "Message 2" },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "mock-id-2",
        model: "gpt-4",
        created: 1234567890,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Response 2" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
      }),
      headers: new Headers(),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    expect(mockTx.conversation.findFirst).toHaveBeenCalled();
    expect(mockTx.conversation.update).toHaveBeenCalled();
  });

  it("should handle database errors gracefully", async () => {
    // Mock transaction to throw error
    mockPrismaClient.$transaction.mockRejectedValueOnce(new Error("DB Error"));

    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "mock-id",
        model: "gpt-4",
        created: 1234567890,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Response" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      headers: new Headers(),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    expect(response.status).toBe(200); // API still returns success even if DB storage fails (it logs error)
  });

  it("should handle image upload failure gracefully", async () => {
    // Mock uploadFile to throw error
    (uploadFile as jest.Mock).mockRejectedValueOnce(new Error("Upload Failed"));

    const requestBody = {
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,abc123" },
            },
          ],
        },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "mock-id",
        model: "gpt-4",
        created: 1234567890,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Response" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      headers: new Headers(),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify uploadFile was called
    expect(uploadFile).toHaveBeenCalled();
  });
});

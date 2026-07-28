import { POST } from "@/app/api/chat/completions/route";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

jest.mock("@/lib/opensearch", () => ({
  index: jest.fn(),
  search: jest.fn(),
  ensureIndexExists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/s3", () => ({
  uploadFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("crypto", () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue("mock-hash"),
  }),
  randomUUID: jest.fn().mockReturnValue("mock-uuid"),
}));

global.fetch = jest.fn();

const mockTx = {
  conversation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
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

// Shape of the rows handed to prisma.message.createMany
interface StoredMessage {
  role: string;
  content: unknown;
  toolCalls: unknown;
  toolCallId: string | null;
  name: string | null;
  reasoningContent: string | null;
  finishReason: string | null;
  messageIndex: number;
  raw: unknown;
}

const storedMessages = (): StoredMessage[] => mockTx.message.createMany.mock.calls[0][0].data;

const sseStream = (chunks: unknown[]) =>
  new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

const streamChunk = (delta: unknown, finishReason?: string) => ({
  id: "chunk-id",
  model: "gpt-4",
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta, ...(finishReason ? { finish_reason: finishReason } : {}) }],
});

describe("Chat Completions tool call persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.conversation.findFirst.mockResolvedValue(null);
    mockTx.conversation.findMany.mockResolvedValue([]);
    mockPrismaClient.$transaction.mockImplementation((callback) => callback(mockTx));
  });

  it("stores tool calls, tool results and null content from a non-streaming exchange", async () => {
    const requestBody = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "what are kraken fees" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "web_search", arguments: '{"query":"kraken fees"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_1", name: "web_search", content: '{"results":[]}' },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "mock-id",
        model: "gpt-4",
        object: "chat.completion",
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        choices: [
          { index: 0, message: { role: "assistant", content: "Use a post-only limit order." }, finish_reason: "stop" },
        ],
      }),
      headers: new Headers({ "content-type": "application/json" }),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    await POST(req);

    const rows = storedMessages();
    expect(rows).toHaveLength(4);

    // The assistant turn keeps its calls, and its null content becomes an explicit JSON null
    expect(rows[1].content).toBe(Prisma.JsonNull);
    expect(rows[1].toolCalls).toEqual([
      { id: "call_1", type: "function", function: { name: "web_search", arguments: '{"query":"kraken fees"}' } },
    ]);

    // The result stays pairable with the call that produced it
    expect(rows[2].role).toBe("tool");
    expect(rows[2].toolCallId).toBe("call_1");
    expect(rows[2].name).toBe("web_search");
  });

  it("accumulates streamed tool call fragments into one call", async () => {
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "fetch the fee schedule" }],
      stream: true,
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: sseStream([
        streamChunk({ role: "assistant", content: "" }),
        streamChunk({
          tool_calls: [{ index: 0, id: "call_9", type: "function", function: { name: "fetch_url", arguments: "" } }],
        }),
        streamChunk({ tool_calls: [{ index: 0, function: { arguments: '{"url":"https://' } }] }),
        streamChunk({ tool_calls: [{ index: 0, function: { arguments: 'kraken.com"}' } }] }),
        streamChunk({}, "tool_calls"),
      ]),
      headers: new Headers({ "content-type": "text/event-stream" }),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    // Draining the body releases stream backpressure so the storage step can run
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const assistantRow = storedMessages()[1];
    expect(assistantRow.toolCalls).toEqual([
      {
        index: 0,
        id: "call_9",
        type: "function",
        function: { name: "fetch_url", arguments: '{"url":"https://kraken.com"}' },
      },
    ]);
    expect(assistantRow.finishReason).toBe("tool_calls");
  });

  it("normalizes the legacy function_call shape into tool calls", async () => {
    const requestBody = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "weather" },
        { role: "assistant", content: null, function_call: { name: "get_weather", arguments: '{"city":"Paris"}' } },
      ],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce({
        id: "mock-id",
        model: "gpt-4",
        object: "chat.completion",
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        choices: [{ index: 0, message: { role: "assistant", content: "It is sunny." }, finish_reason: "stop" }],
      }),
      headers: new Headers({ "content-type": "application/json" }),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    await POST(req);

    expect(storedMessages()[1].toolCalls).toEqual([
      { index: 0, type: "function", function: { name: "get_weather", arguments: '{"city":"Paris"}' } },
    ]);
  });

  it("stores the verbatim message, the request envelope and real streamed usage", async () => {
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "fees?" }],
      stream: true,
      // Envelope fields that used to be discarded entirely
      tools: [{ type: "function", function: { name: "web_search", parameters: {} } }],
      tool_choice: "auto",
      temperature: 0.2,
      stream_options: { include_usage: true },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: sseStream([
        streamChunk({ role: "assistant", content: "post-only limit order" }),
        streamChunk({}, "stop"),
        // Open WebUI asks for this chunk via stream_options.include_usage
        {
          id: "chunk-id",
          model: "gpt-4",
          object: "chat.completion.chunk",
          choices: [],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        },
      ]),
      headers: new Headers({ "content-type": "text/event-stream" }),
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Usage from the final chunk instead of hardcoded zeros
    expect(mockTx.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ promptTokens: 11, completionTokens: 7, totalTokens: 18 }),
      }),
    );

    // The request envelope is kept, minus the messages themselves
    const conversationData = mockTx.conversation.create.mock.calls[0][0].data;
    expect(conversationData.requestParams).toMatchObject({ tool_choice: "auto", temperature: 0.2 });
    expect(conversationData.requestParams).not.toHaveProperty("messages");

    // And every message keeps a verbatim copy
    const rows = storedMessages();
    expect(rows[0].raw).toEqual({ role: "user", content: "fees?" });
  });
});

import { POST } from "@/app/api/chat/completions/route";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

// Deliberately no crypto mock here: identity is what is under test, so it needs real hashes.
jest.mock("@/lib/opensearch", () => ({
  index: jest.fn(),
  search: jest.fn(),
  ensureIndexExists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/s3", () => ({ uploadFile: jest.fn().mockResolvedValue(undefined) }));

global.fetch = jest.fn();

const mockTx = {
  conversation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: "new-id" }),
    deleteMany: jest.fn(),
  },
  message: { deleteMany: jest.fn(), createMany: jest.fn() },
  outboxEvent: { create: jest.fn() },
};

const mockPrismaClient = { $transaction: jest.fn((callback) => callback(mockTx)) };
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: () => mockPrismaClient }));

const jsonReply = (message: Record<string, unknown>, finishReason: string) => ({
  ok: true,
  json: jest.fn().mockResolvedValueOnce({
    id: "mock-id",
    model: "gpt-4",
    object: "chat.completion",
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    choices: [{ index: 0, message, finish_reason: finishReason }],
  }),
  headers: new Headers({ "content-type": "application/json" }),
});

const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const req = new NextRequest("http://localhost/api/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return POST(req);
};

const assistantWithCall = {
  role: "assistant",
  content: null,
  tool_calls: [{ id: "call_1", type: "function", function: { name: "web_search", arguments: '{"q":"fees"}' } }],
};

describe("conversation identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.conversation.findMany.mockResolvedValue([]);
    mockTx.conversation.create.mockResolvedValue({ id: "new-id" });
    mockPrismaClient.$transaction.mockImplementation((callback) => callback(mockTx));
  });

  it("links a tool round-trip to the turn that requested it", async () => {
    // Turn 1: the user asks, the model answers with a tool call
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply(assistantWithCall, "tool_calls"));
    await post({ model: "gpt-4", messages: [{ role: "user", content: "kraken fees?" }] });

    const firstHash = mockTx.conversation.create.mock.calls[0][0].data.conversationHash;
    expect(firstHash).toMatch(/^[0-9a-f]{64}$/);

    jest.clearAllMocks();
    mockTx.conversation.findMany.mockResolvedValue([]);

    // Turn 2: the client resends the history plus the tool result. The new messages are not user
    // messages, which is exactly the case the old system+user hash could not match.
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonReply({ role: "assistant", content: "Use post-only." }, "stop"),
    );
    await post({
      model: "gpt-4",
      messages: [
        { role: "user", content: "kraken fees?" },
        assistantWithCall,
        { role: "tool", tool_call_id: "call_1", content: "results" },
      ],
    });

    const candidateHashes = mockTx.conversation.findMany.mock.calls[0][0].where.conversationHash.in;
    expect(candidateHashes).toContain(firstHash);
    // Longest prefix first: [user, assistant] precedes [user], so the parent is the first candidate
    expect(candidateHashes.indexOf(firstHash)).toBe(0);
  });

  it("updates the parent instead of creating a second conversation", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply({ role: "assistant", content: "second" }, "stop"));
    // Stand in for Postgres: return a row whose hash is one of the queried candidates
    mockTx.conversation.findMany.mockImplementationOnce(
      ({ where }: { where: { conversationHash: { in: string[] } } }) =>
        Promise.resolve([{ id: "parent-id", conversationHash: where.conversationHash.in[0], updatedAt: new Date() }]),
    );

    await post({
      model: "gpt-4",
      messages: [
        { role: "user", content: "one" },
        { role: "assistant", content: "first" },
        { role: "user", content: "two" },
      ],
    });

    expect(mockTx.conversation.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "parent-id" } }));
    expect(mockTx.conversation.create).not.toHaveBeenCalled();
  });

  it("matches a continuation only against the caller's own conversations", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply({ role: "assistant", content: "hi" }, "stop"));
    await post(
      { model: "gpt-4", messages: [{ role: "user", content: "hello" }] },
      { Authorization: "Bearer sk-alice" },
    );
    const aliceHash = mockTx.conversation.create.mock.calls[0][0].data.callerKeyHash;
    expect(aliceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(aliceHash).not.toContain("sk-alice");

    jest.clearAllMocks();
    mockTx.conversation.findMany.mockResolvedValue([]);
    mockTx.conversation.create.mockResolvedValue({ id: "new-id" });

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply({ role: "assistant", content: "again" }, "stop"));
    await post(
      {
        model: "gpt-4",
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
          { role: "user", content: "more" },
        ],
      },
      { "x-litellm-api-key": "sk-bob" },
    );

    const { where } = mockTx.conversation.findMany.mock.calls[0][0];
    const bobHash = mockTx.conversation.create.mock.calls[0][0].data.callerKeyHash;
    expect(bobHash).not.toBe(aliceHash);
    // Bob can match his own conversations and unowned legacy rows, never Alice's
    expect(where.OR).toEqual([{ callerKeyHash: bobHash }, { callerKeyHash: null }]);
  });

  it("identifies the caller by x-litellm-api-key over Authorization, like LiteLLM", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply({ role: "assistant", content: "hi" }, "stop"));
    await post(
      { model: "gpt-4", messages: [{ role: "user", content: "hello" }] },
      { "x-litellm-api-key": "sk-alice", Authorization: "Bearer provider-key" },
    );

    const expected = createHash("sha256").update("sk-alice").digest("hex");
    expect(mockTx.conversation.create.mock.calls[0][0].data.callerKeyHash).toBe(expected);
  });

  it("adopts a legacy conversation on its first continuation", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply({ role: "assistant", content: "second" }, "stop"));
    mockTx.conversation.findMany.mockImplementationOnce(
      ({ where }: { where: { conversationHash: { in: string[] } } }) =>
        Promise.resolve([
          {
            id: "legacy-id",
            conversationHash: where.conversationHash.in[0],
            callerKeyHash: null,
            updatedAt: new Date(),
          },
        ]),
    );

    await post(
      {
        model: "gpt-4",
        messages: [
          { role: "user", content: "one" },
          { role: "assistant", content: "first" },
          { role: "user", content: "two" },
        ],
      },
      { Authorization: "Bearer sk-alice" },
    );

    const { where, data } = mockTx.conversation.update.mock.calls[0][0];
    expect(where).toEqual({ id: "legacy-id" });
    expect(data.callerKeyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes assistant turns that differ only by their tool call", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply(assistantWithCall, "tool_calls"));
    await post({ model: "gpt-4", messages: [{ role: "user", content: "same question" }] });
    const withCall = mockTx.conversation.create.mock.calls[0][0].data.conversationHash;

    jest.clearAllMocks();
    mockTx.conversation.findMany.mockResolvedValue([]);
    mockTx.conversation.create.mockResolvedValue({ id: "new-id" });

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonReply(
        {
          ...assistantWithCall,
          tool_calls: [
            { ...assistantWithCall.tool_calls[0], function: { name: "fetch_url", arguments: '{"q":"fees"}' } },
          ],
        },
        "tool_calls",
      ),
    );
    await post({ model: "gpt-4", messages: [{ role: "user", content: "same question" }] });
    const otherCall = mockTx.conversation.create.mock.calls[0][0].data.conversationHash;

    // Content is identical in both; only the tool name differs
    expect(withCall).not.toBe(otherCall);
  });
});

describe("stored image references", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.conversation.findMany.mockResolvedValue([]);
    mockTx.conversation.create.mockResolvedValue({ id: "new-id" });
    mockPrismaClient.$transaction.mockImplementation((callback) => callback(mockTx));
  });

  it("never stores a client-supplied s3:// image URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonReply({ role: "assistant", content: "ok" }, "stop"));
    await post({
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "look" },
            { type: "image_url", image_url: { url: "s3://conversations/images/2026/10/someone-else.png" } },
          ],
        },
      ],
    });

    const stored = JSON.stringify([mockTx.conversation.create.mock.calls, mockTx.message.createMany.mock.calls]);
    expect(stored).toContain("[image reference removed]");
    expect(stored).not.toContain("s3://");
  });
});

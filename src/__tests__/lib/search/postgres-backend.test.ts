// SEARCH_BACKEND=postgres (the default): no OpenSearch anywhere, the app drains the outbox itself
delete process.env.SEARCH_BACKEND;

import { NextRequest } from "next/server";
import { POST as search } from "@/app/api/search/route";
import { DELETE } from "@/app/api/search/[id]/route";
import { GET as readyz } from "@/app/api/readyz/route";
import { processEvent } from "@/lib/outbox";
import { getSearchBackend } from "@/lib/search/backend";
import { searchPostgres } from "@/lib/search/postgres";
import { searchOpenSearch } from "@/lib/search/opensearch";
import { deleteFile } from "@/lib/s3";
import { getOpenSearchClient } from "@/lib/opensearch";

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: jest.fn().mockResolvedValue({ session: { id: "session" }, user: { id: "user" } }) } },
}));

jest.mock("@/lib/search/postgres", () => ({
  searchPostgres: jest.fn().mockResolvedValue({ hits: [], total: { value: 0, relation: "eq" }, took: 3 }),
}));
jest.mock("@/lib/search/opensearch", () => ({ searchOpenSearch: jest.fn() }));

jest.mock("@/lib/opensearch", () => {
  const client = { delete: jest.fn(), index: jest.fn(), ping: jest.fn() };
  return { __esModule: true, getOpenSearchClient: () => client, ensureIndexExists: jest.fn() };
});

jest.mock("@/lib/s3", () => ({ deleteFile: jest.fn(), getPresignedUrl: jest.fn() }));

const tx = {
  $queryRaw: jest.fn().mockResolvedValue([]),
  conversation: { findUnique: jest.fn(), delete: jest.fn() },
  message: { findMany: jest.fn(), deleteMany: jest.fn() },
  outboxEvent: { create: jest.fn() },
};
const prisma = {
  $queryRaw: jest.fn(),
  $transaction: jest.fn((callback) => callback(tx)),
  outboxEvent: { updateMany: jest.fn(), update: jest.fn() },
  conversation: { findUnique: jest.fn() },
  message: { findMany: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({ __esModule: true, default: () => prisma }));

const opensearch = getOpenSearchClient() as unknown as Record<"delete" | "index" | "ping", jest.Mock>;

const event = (eventType: string, payload: unknown = null) => ({
  id: "evt",
  eventType,
  aggregateType: "conversation",
  aggregateId: "conv",
  payload,
  attempts: 0,
  rejectedAttempts: 0,
  lockedAt: null,
  lockId: null,
  createdAt: new Date(),
  processedAt: null,
});

describe("Postgres search backend", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
    tx.conversation.findUnique.mockResolvedValue({ id: "conv" });
  });

  it("is the default and rejects unknown values", () => {
    expect(getSearchBackend()).toBe("postgres");
    process.env.SEARCH_BACKEND = "elastic";
    expect(() => getSearchBackend()).toThrow(/SEARCH_BACKEND/);
    delete process.env.SEARCH_BACKEND;
  });

  it("rejects a query over 1000 characters", async () => {
    const response = await search(
      new NextRequest("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ query: "a ".repeat(501) }),
      }),
    );
    expect(response.status).toBe(400);
    expect(searchPostgres).not.toHaveBeenCalled();
  });

  it("rejects a query of more than 32 words", async () => {
    const response = await search(
      new NextRequest("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ query: Array.from({ length: 33 }, (_, i) => `-w${i}`).join(" ") }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("answers /api/search from Postgres", async () => {
    const response = await search(
      new NextRequest("http://localhost/api/search", { method: "POST", body: JSON.stringify({ query: "bread" }) }),
    );
    expect(response.status).toBe(200);
    expect(searchPostgres).toHaveBeenCalledWith(expect.objectContaining({ text: "bread" }));
    expect(searchOpenSearch).not.toHaveBeenCalled();
    expect((await response.json()).took).toBe(3);
  });

  it("is ready when Postgres answers, without asking OpenSearch", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    const response = await readyz();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.checks).toEqual(expect.objectContaining({ postgres: { ok: true } }));
    expect(body.checks.opensearch).toBeUndefined();
    expect(opensearch.ping).not.toHaveBeenCalled();
  });

  it("is not ready when Postgres is down", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error("connection refused"));
    expect((await readyz()).status).toBe(503);
  });

  it("enqueues nothing when a deleted conversation had no images", async () => {
    tx.message.findMany.mockResolvedValue([{ content: "plain text" }]);
    const response = await DELETE(new NextRequest("http://localhost/api/search/conv", { method: "DELETE" }), {
      params: Promise.resolve({ id: "conv" }),
    });
    expect(response.status).toBe(200);
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it("still enqueues the image cleanup of a deleted conversation", async () => {
    tx.message.findMany.mockResolvedValue([
      { content: [{ type: "image_url", image_url: { url: "s3://conversations/images/2026/10/a.png" } }] },
    ]);
    await DELETE(new NextRequest("http://localhost/api/search/conv", { method: "DELETE" }), {
      params: Promise.resolve({ id: "conv" }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "conversation.deleted" }) }),
    );
  });

  it("deletes the images of a deleted conversation without touching OpenSearch", async () => {
    await processEvent(event("conversation.deleted", { imageKeys: ["conversations/images/2026/10/a.png"] }));
    expect(deleteFile).toHaveBeenCalledWith("conversations/images/2026/10/a.png");
    expect(opensearch.delete).not.toHaveBeenCalled();
  });

  it("indexes for the worker whatever this process's SEARCH_BACKEND says", async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce({
      id: "conv",
      model: "m",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma.message.findMany.mockResolvedValueOnce([]);
    await processEvent(event("conversation.upserted"), "opensearch");
    expect(opensearch.index).toHaveBeenCalled();
  });

  it("marks upsert events left from an OpenSearch setup processed without indexing them", async () => {
    await processEvent(event("conversation.upserted"));
    expect(opensearch.index).not.toHaveBeenCalled();
    expect(prisma.message.findMany).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processedAt: expect.any(Date) }) }),
    );
  });
});

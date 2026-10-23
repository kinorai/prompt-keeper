// These tests cover the OpenSearch backend; the Postgres one has its own
process.env.SEARCH_BACKEND = "opensearch";

import { errors } from "@opensearch-project/opensearch";
import { pollOnce, processEvent } from "@/workers/outbox";
import { deleteFile } from "@/lib/s3";
import { getOpenSearchClient } from "@/lib/opensearch";

jest.mock("@/lib/prisma", () => {
  const client = {
    outboxEvent: { updateMany: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    conversation: { findUnique: jest.fn() },
    message: { findMany: jest.fn() },
  };
  return { __esModule: true, default: () => client };
});

jest.mock("@/lib/opensearch", () => {
  const client = { delete: jest.fn(), index: jest.fn() };
  return {
    __esModule: true,
    getOpenSearchClient: () => client,
    ensureIndexExists: jest.fn(),
    PROMPT_KEEPER_INDEX: "prompt-keeper",
  };
});

jest.mock("@/lib/s3", () => ({ deleteFile: jest.fn() }));

import getPrisma from "@/lib/prisma";

const prisma = getPrisma() as unknown as {
  outboxEvent: Record<"updateMany" | "update" | "findMany", jest.Mock>;
};
const opensearch = getOpenSearchClient() as unknown as { delete: jest.Mock };

const rejection = (status: number) =>
  new errors.ResponseError({
    body: { error: { type: "mapper_parsing_exception" }, status },
    statusCode: status,
    headers: {},
    meta: {} as never,
    warnings: null,
  });

const event = (overrides: Record<string, unknown> = {}) => ({
  id: "evt",
  eventType: "conversation.deleted",
  aggregateType: "conversation",
  aggregateId: "conv",
  payload: null,
  attempts: 0,
  rejectedAttempts: 0,
  lockedAt: null,
  lockId: null,
  createdAt: new Date(),
  processedAt: null,
  ...overrides,
});

describe("outbox worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.outboxEvent.updateMany.mockResolvedValue({ count: 1 });
  });

  it("deletes the conversation's uploaded images with the conversation", async () => {
    await processEvent(
      event({ payload: { imageKeys: ["conversations/images/2026/10/a.png", "other/prefix/b.png", 3] } }),
    );

    expect(opensearch.delete).toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith("conversations/images/2026/10/a.png");
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processedAt: expect.any(Date) }) }),
    );
  });

  it("treats a missing OpenSearch document as already deleted and still removes the images", async () => {
    opensearch.delete.mockRejectedValueOnce(
      new errors.ResponseError({
        body: { result: "not_found" },
        statusCode: 404,
        headers: {},
        meta: {} as never,
        warnings: null,
      }),
    );

    await processEvent(event({ payload: { imageKeys: ["conversations/images/2026/10/a.png"] } }));

    expect(deleteFile).toHaveBeenCalledWith("conversations/images/2026/10/a.png");
    expect(prisma.outboxEvent.update.mock.calls[0][0].data).toHaveProperty("processedAt");
  });

  it("backs off exponentially on failure and records the error", async () => {
    opensearch.delete.mockRejectedValueOnce(new Error("cluster down"));
    const before = Date.now();

    // This claim is the third attempt: 10s * 2^2
    await processEvent(event({ attempts: 2 }));

    const { data } = prisma.outboxEvent.update.mock.calls[0][0];
    expect(data).toMatchObject({ lockId: null, lockedAt: null, lastError: "cluster down", rejectedAttempts: 0 });
    expect(data.nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(40000);
    expect(data.nextAttemptAt.getTime() - before).toBeLessThan(41000);
    expect(data).not.toHaveProperty("deadLetteredAt");
  });

  it("caps the backoff at one hour", async () => {
    opensearch.delete.mockRejectedValueOnce(new Error("cluster down"));
    const before = Date.now();

    await processEvent(event({ attempts: 500 }));

    const { nextAttemptAt } = prisma.outboxEvent.update.mock.calls[0][0].data;
    expect(nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(3600000);
    expect(nextAttemptAt.getTime() - before).toBeLessThan(3601000);
  });

  it.each([
    ["a connection error", new errors.ConnectionError("connect ECONNREFUSED", {} as never)],
    ["a timeout", new errors.TimeoutError("Request timed out", {} as never)],
    ["a 5xx", rejection(503)],
    ["throttling", rejection(429)],
  ])("never dead-letters on %s, however many attempts failed", async (_, err) => {
    opensearch.delete.mockRejectedValueOnce(err);

    await processEvent(event({ attempts: 50, rejectedAttempts: 9 }));

    const { data } = prisma.outboxEvent.update.mock.calls[0][0];
    expect(data.rejectedAttempts).toBe(9);
    expect(data).not.toHaveProperty("deadLetteredAt");
  });

  it("counts an OpenSearch rejection without dead-lettering it early", async () => {
    opensearch.delete.mockRejectedValueOnce(rejection(400));

    await processEvent(event({ attempts: 3, rejectedAttempts: 1 }));

    const { data } = prisma.outboxEvent.update.mock.calls[0][0];
    expect(data.rejectedAttempts).toBe(2);
    expect(data).not.toHaveProperty("deadLetteredAt");
  });

  it("dead-letters an event on its last allowed rejection", async () => {
    opensearch.delete.mockRejectedValueOnce(rejection(400));

    // Default OUTBOX_MAX_ATTEMPTS is 10; this is the tenth rejection
    await processEvent(event({ attempts: 30, rejectedAttempts: 9 }));

    const { data } = prisma.outboxEvent.update.mock.calls[0][0];
    expect(data).toMatchObject({
      rejectedAttempts: 10,
      lastError: expect.stringContaining("mapper_parsing_exception"),
      deadLetteredAt: expect.any(Date),
    });
  });

  it("skips events still backing off", async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await pollOnce();
    await processEvent(event());

    const backoff = { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: expect.any(Date) } }] };
    expect(prisma.outboxEvent.findMany.mock.calls[0][0].where.AND).toContainEqual(backoff);
    expect(prisma.outboxEvent.updateMany.mock.calls[0][0].where.AND).toContainEqual(backoff);
  });

  it("never polls or claims dead-lettered events", async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await pollOnce();
    await processEvent(event());

    expect(prisma.outboxEvent.findMany.mock.calls[0][0].where).toMatchObject({ deadLetteredAt: null });
    expect(prisma.outboxEvent.updateMany.mock.calls[0][0].where).toMatchObject({ deadLetteredAt: null });
  });
});

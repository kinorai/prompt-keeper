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

const event = (overrides: Record<string, unknown> = {}) => ({
  id: "evt",
  eventType: "conversation.deleted",
  aggregateType: "conversation",
  aggregateId: "conv",
  payload: null,
  attempts: 0,
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

  it("keeps the lock on failure so the event backs off, and records the error", async () => {
    opensearch.delete.mockRejectedValueOnce(new Error("cluster down"));

    await processEvent(event({ attempts: 2 }));

    const { data } = prisma.outboxEvent.update.mock.calls[0][0];
    expect(data).toEqual({ lockId: null, lastError: "cluster down" });
    expect(data).not.toHaveProperty("lockedAt");
    expect(data).not.toHaveProperty("deadLetteredAt");
  });

  it("dead-letters an event on its last allowed attempt", async () => {
    opensearch.delete.mockRejectedValueOnce(new Error("mapping conflict"));

    // Default OUTBOX_MAX_ATTEMPTS is 10; this claim is the tenth attempt
    await processEvent(event({ attempts: 9 }));

    const { data } = prisma.outboxEvent.update.mock.calls[0][0];
    expect(data).toEqual({ lockId: null, lastError: "mapping conflict", deadLetteredAt: expect.any(Date) });
  });

  it("never polls or claims dead-lettered events", async () => {
    prisma.outboxEvent.findMany.mockResolvedValue([]);

    await pollOnce();
    await processEvent(event());

    expect(prisma.outboxEvent.findMany.mock.calls[0][0].where).toMatchObject({ deadLetteredAt: null });
    expect(prisma.outboxEvent.updateMany.mock.calls[0][0].where).toMatchObject({ deadLetteredAt: null });
  });
});

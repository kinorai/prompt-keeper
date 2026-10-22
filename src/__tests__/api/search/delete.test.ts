import { DELETE } from "@/app/api/search/[id]/route";
import { NextRequest } from "next/server";
import getPrisma from "@/lib/prisma";

// Mock Prisma
// The handlers validate the caller; these tests run as a signed-in user
jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: jest.fn().mockResolvedValue({ session: { id: "session" }, user: { id: "user" } }) } },
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe("DELETE /api/search/[id]", () => {
  const mockPrisma = {
    $transaction: jest.fn(),
    conversation: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      deleteMany: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrisma as jest.Mock).mockReturnValue(mockPrisma);
  });

  it("should delete a conversation successfully", async () => {
    const outboxCreate = jest.fn().mockResolvedValue({ id: "outbox-id" });
    // Mock successful transaction
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return await callback({
        $queryRaw: jest.fn().mockResolvedValue([]),
        conversation: {
          findUnique: jest.fn().mockResolvedValue({ id: "test-id" }),
          delete: jest.fn().mockResolvedValue({ id: "test-id" }),
        },
        message: {
          findMany: jest.fn().mockResolvedValue([
            { content: "plain text" },
            {
              content: [
                { type: "text", text: "look" },
                { type: "image_url", image_url: { url: "s3://conversations/images/2026/10/a.png" } },
                { type: "image_url", image_url: { url: "s3://other/prefix/b.png" } },
                { type: "image_url", image_url: { url: "https://example.com/c.png" } },
              ],
            },
          ]),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        outboxEvent: {
          create: outboxCreate,
        },
      });
    });

    const request = new NextRequest("http://localhost:3000/api/search/test-id", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "test-id" }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      deleted: true,
    });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // Only uploaded images are handed to the worker for deletion
    expect(outboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "conversation.deleted",
        payload: { imageKeys: ["conversations/images/2026/10/a.png"] },
      }),
    });
  });

  it("keeps images another conversation still references", async () => {
    const outboxCreate = jest.fn().mockResolvedValue({ id: "outbox-id" });
    const queryRaw = jest.fn().mockResolvedValue([{ key: "conversations/images/2026/10/victim.png" }]);
    mockPrisma.$transaction.mockImplementation(async (callback) =>
      callback({
        $queryRaw: queryRaw,
        conversation: {
          findUnique: jest.fn().mockResolvedValue({ id: "test-id" }),
          delete: jest.fn().mockResolvedValue({ id: "test-id" }),
        },
        message: {
          findMany: jest.fn().mockResolvedValue([
            {
              content: [
                { type: "image_url", image_url: { url: "s3://conversations/images/2026/10/own.png" } },
                { type: "image_url", image_url: { url: "s3://conversations/images/2026/10/victim.png" } },
              ],
            },
          ]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        outboxEvent: { create: outboxCreate },
      }),
    );

    const request = new NextRequest("http://localhost:3000/api/search/test-id", { method: "DELETE" });
    const response = await DELETE(request, { params: Promise.resolve({ id: "test-id" }) });

    expect(response.status).toBe(200);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(outboxCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ payload: { imageKeys: ["conversations/images/2026/10/own.png"] } }),
    });
  });

  it("should return 404 for non-existent conversation", async () => {
    // Mock transaction that throws NOT_FOUND
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return await callback({
        conversation: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        message: {
          deleteMany: jest.fn(),
        },
        outboxEvent: {
          create: jest.fn(),
        },
      });
    });

    // Need to actually throw the error in the transaction
    mockPrisma.$transaction.mockImplementation(async () => {
      throw new Error("NOT_FOUND");
    });

    const request = new NextRequest("http://localhost:3000/api/search/non-existent", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "non-existent" }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({
      error: "Conversation not found",
    });
  });

  it("should handle server errors", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Server error"));

    const request = new NextRequest("http://localhost:3000/api/search/test-id", {
      method: "DELETE",
    });

    const response = await DELETE(request, { params: Promise.resolve({ id: "test-id" }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({
      success: false,
      error: "Failed to delete conversation",
    });
  });
});

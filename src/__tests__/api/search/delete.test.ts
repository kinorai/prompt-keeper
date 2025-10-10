import { DELETE } from "@/app/api/search/[id]/route";
import { NextRequest } from "next/server";
import getPrisma from "@/lib/prisma";

// Mock Prisma
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
    // Mock successful transaction
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      return await callback({
        conversation: {
          findUnique: jest.fn().mockResolvedValue({ id: "test-id" }),
          delete: jest.fn().mockResolvedValue({ id: "test-id" }),
        },
        message: {
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        outboxEvent: {
          create: jest.fn().mockResolvedValue({ id: "outbox-id" }),
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
      error: "Server error",
    });
  });
});

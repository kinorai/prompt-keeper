import { DELETE } from "@/app/api/search/[id]/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

import getPrisma from "@/lib/prisma";

describe("Delete API Coverage", () => {
  it("should return 400 if ID is missing", async () => {
    const req = new NextRequest("http://localhost/api/search/undefined", {
      method: "DELETE",
    });

    const params = Promise.resolve({ id: "" });

    const response = await DELETE(req, { params });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Conversation ID is required");
  });

  it("should return 404 if conversation not found", async () => {
    const req = new NextRequest("http://localhost/api/search/non-existent", {
      method: "DELETE",
    });

    const params = Promise.resolve({ id: "non-existent" });

    // Mock transaction to simulate not found
    // We need to mock getPrisma to return a client that executes the transaction
    // and the transaction callback should call findUnique which returns null

    const mockTx = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const mockPrisma = {
      $transaction: jest.fn((callback) => callback(mockTx)),
    };

    (getPrisma as jest.Mock).mockReturnValue(mockPrisma);

    const response = await DELETE(req, { params });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Conversation not found");
  });
});

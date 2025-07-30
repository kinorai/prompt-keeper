import { DELETE } from "@/app/api/search/[id]/route";
import { NextRequest } from "next/server";
import opensearchClient from "@/lib/opensearch";

jest.mock("@/lib/opensearch");

describe("DELETE /api/search/[id]", () => {
  const mockOpensearchClient = opensearchClient as jest.Mocked<typeof opensearchClient>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should delete a conversation successfully", async () => {
    mockOpensearchClient.delete.mockResolvedValue({
      body: {
        result: "deleted",
      },
    } as never);

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
    expect(mockOpensearchClient.delete).toHaveBeenCalledWith({
      index: "prompt-keeper",
      id: "test-id",
      refresh: "wait_for",
    });
  });

  it("should return 404 for non-existent conversation", async () => {
    mockOpensearchClient.delete.mockRejectedValue(new Error("404 Not Found") as never);

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
    mockOpensearchClient.delete.mockRejectedValue(new Error("Server error") as never);

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

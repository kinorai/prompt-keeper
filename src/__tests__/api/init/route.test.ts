import { POST } from "@/app/api/init/route";
import { NextResponse } from "next/server";
import { initializeIndex } from "@/lib/opensearch";

// Mock the OpenSearch library
jest.mock("@/lib/opensearch", () => ({
  initializeIndex: jest.fn(),
}));

describe("Init API Route", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it("should return success message when index initialization is successful", async () => {
    // Mock successful index initialization
    (initializeIndex as jest.Mock).mockResolvedValueOnce(undefined);

    // Call the API route handler
    const response = await POST();

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      message: "Index initialized successfully",
    });

    // Verify that initializeIndex was called
    expect(initializeIndex).toHaveBeenCalledTimes(1);
  });

  it("should return error message when index initialization fails", async () => {
    // Mock failed index initialization
    (initializeIndex as jest.Mock).mockRejectedValueOnce(
      new Error("Initialization error"),
    );

    // Call the API route handler
    const response = await POST();

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      error: "Failed to initialize index",
    });

    // Verify that initializeIndex was called
    expect(initializeIndex).toHaveBeenCalledTimes(1);
  });
});

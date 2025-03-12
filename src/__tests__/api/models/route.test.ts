import { GET } from "@/app/api/models/route";
import { NextRequest, NextResponse } from "next/server";

// Mock the global fetch function
global.fetch = jest.fn();

// Mock AbortSignal.timeout
Object.defineProperty(AbortSignal, "timeout", {
  value: jest.fn().mockImplementation(() => ({})),
});

describe("Models API Route", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it("should return models data when the API call is successful", async () => {
    // Mock successful response from LiteLLM
    const mockModelsData = {
      object: "list",
      data: [
        { id: "model1", object: "model" },
        { id: "model2", object: "model" },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockModelsData),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/models");

    // Call the API route handler
    const response = await GET(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual(mockModelsData);

    // Verify that fetch was called with the correct URL and headers
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/models"),
      expect.objectContaining({
        headers: expect.any(Headers),
        signal: expect.any(Object),
      }),
    );
  });

  it("should return error response when the API call fails", async () => {
    // Mock error response from LiteLLM
    const errorMessage = "API Error";

    // Setup the fetch mock to return error response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValueOnce(errorMessage),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/models");

    // Call the API route handler
    const response = await GET(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({ error: errorMessage });
  });

  it("should return 500 error when fetch throws an exception", async () => {
    // Setup the fetch mock to throw an error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    // Create a mock request
    const req = new NextRequest("http://localhost/api/models");

    // Call the API route handler
    const response = await GET(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({ error: "Internal server error" });
  });
});

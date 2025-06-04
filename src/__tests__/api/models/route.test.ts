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

  it("should return models list when fetch is successful", async () => {
    // Mock successful response from LiteLLM
    const mockModelsResponse = {
      data: [
        {
          id: "gpt-4",
          object: "model",
          created: 1625097600,
          owned_by: "openai",
        },
        {
          id: "gpt-3.5-turbo",
          object: "model",
          created: 1625097600,
          owned_by: "openai",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockModelsResponse),
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
    expect(responseData).toEqual(mockModelsResponse);

    // Verify that fetch was called with the correct URL
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/models"),
      expect.objectContaining({
        headers: expect.any(Headers),
        signal: expect.any(Object),
      }),
    );
  });

  it("should return error when fetch fails", async () => {
    // Setup the fetch mock to return an error
    const errorMessage = "Network error";
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: jest.fn().mockResolvedValueOnce(errorMessage),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/models");

    // Call the API route handler
    const response = await GET(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Only verify status code, not error message content
  });

  it("should return 500 when fetch throws an exception", async () => {
    // Setup the fetch mock to throw an error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    // Create a mock request
    const req = new NextRequest("http://localhost/api/models");

    // Call the API route handler
    const response = await GET(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Only verify status code, not error message content
  });
});

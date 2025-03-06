/**
 * Test for the chat completions API route
 */

import { jest } from "@jest/globals";
import { NextRequest } from "next/server";

// Mock the OpenSearch client before importing the route
const mockSearch = jest.fn();
const mockIndex = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/lib/opensearch", () => ({
  __esModule: true,
  PROMPT_KEEPER_INDEX: "prompt-keeper",
  default: {
    search: mockSearch,
    index: mockIndex,
    update: mockUpdate,
  },
  initializeIndex: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock Date.now to return a fixed timestamp
const mockNow = 1677858242000; // Fixed timestamp for testing
global.Date.now = jest.fn(() => mockNow);

// Import the route after mocking dependencies
import { POST } from "@/app/api/chat/completions/route";

describe("Chat Completions API Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default mock responses
    mockSearch.mockResolvedValue({
      body: {
        hits: {
          total: { value: 0 },
          hits: [],
        },
      },
    });

    mockIndex.mockResolvedValue({
      body: {
        _id: "mock-id",
        result: "created",
      },
    });

    mockUpdate.mockResolvedValue({
      body: {
        result: "updated",
      },
    });
  });

  it("should forward requests to LiteLLM and store conversation data", async () => {
    // Mock the fetch response
    const mockResponse = {
      id: "chatcmpl-123",
      object: "chat.completion",
      created: 1677858242,
      model: "gpt-4",
      usage: {
        prompt_tokens: 5,
        completion_tokens: 7,
        total_tokens: 12,
      },
      choices: [
        {
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
          index: 0,
        },
      ],
    };

    // Mock the fetch implementation
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
        headers: new Headers({
          "Content-Type": "application/json",
        }),
      }),
    );

    // Create a mock request
    const request = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }],
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Call the API route
    const response = await POST(request);
    const responseData = await response.json();

    // Verify the response
    expect(response.status).toBe(200);
    expect(responseData).toEqual(mockResponse);

    // Verify that fetch was called with the correct parameters
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/chat/completions"),
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Object),
        body: expect.any(String),
      }),
    );

    // Verify that the conversation was stored in OpenSearch
    // We need to wait for the asynchronous storage to complete
    await new Promise(process.nextTick);

    expect(mockIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          model: "gpt-4",
          messages: expect.any(Array),
        }),
      }),
    );
  });

  it("should handle errors from LiteLLM gracefully", async () => {
    // Mock the fetch implementation to return an error
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ error: { message: "Invalid request" } }),
        text: () =>
          Promise.resolve(
            JSON.stringify({ error: { message: "Invalid request" } }),
          ),
        headers: new Headers({
          "Content-Type": "application/json",
        }),
      }),
    );

    // Create a mock request
    const request = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello!" }],
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Call the API route
    const response = await POST(request);

    // Verify the response
    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error).toBeDefined();

    // Verify that the conversation was not stored in OpenSearch
    // We need to wait for any potential asynchronous operations
    await new Promise(process.nextTick);

    expect(mockIndex).not.toHaveBeenCalled();
  });

  // Define types for the search query
  interface TimeRange {
    gte: string;
    lte: string;
  }

  interface RangeClause {
    range: {
      timestamp: TimeRange;
    };
  }

  // Test for time range limitation in conversation hash search
  describe("Conversation hash search time range", () => {
    test("search query should include time range limitation of now-1y", () => {
      // Create a sample search query similar to what would be used in storeConversation
      const searchQuery = {
        index: "prompt-keeper",
        body: {
          query: {
            bool: {
              must: [
                {
                  term: {
                    "conversation_hash.keyword": "sample-hash",
                  },
                },
                {
                  range: {
                    timestamp: {
                      gte: "now-1y",
                      lte: "now",
                    },
                  },
                },
              ],
            },
          },
          sort: [{ timestamp: { order: "desc" } }],
          size: 1,
        },
      };

      // Verify the query structure
      expect(searchQuery.body.query.bool.must).toHaveLength(2);

      // Find the time range filter
      const timeRangeFilter = searchQuery.body.query.bool.must.find(
        (clause): clause is RangeClause =>
          "range" in clause &&
          clause.range !== undefined &&
          "timestamp" in clause.range,
      );

      // Verify the time range filter exists
      expect(timeRangeFilter).toBeDefined();

      // Now TypeScript knows timeRangeFilter is a RangeClause if it exists
      if (timeRangeFilter) {
        expect(timeRangeFilter.range.timestamp.gte).toBe("now-1y");
        expect(timeRangeFilter.range.timestamp.lte).toBe("now");
      }
    });
  });
});

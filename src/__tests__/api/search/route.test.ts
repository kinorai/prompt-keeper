import { POST } from "@/app/api/search/route";
import { NextRequest, NextResponse } from "next/server";

// Mock the OpenSearch client
jest.mock("@/lib/opensearch", () => {
  const mockClient = {
    search: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockClient,
    PROMPT_KEEPER_INDEX: "prompt-keeper",
  };
});

// Import the mocked OpenSearch client
import opensearchClient from "@/lib/opensearch";

describe("Search API Route", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it("should return search results when the search is successful", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 2 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [
                  { role: "user", content: "Hello" },
                  { role: "assistant", content: "Hi there!" },
                ],
              },
            },
            {
              _id: "2",
              _score: 0.8,
              _source: {
                model: "gpt-3.5-turbo",
                messages: [
                  { role: "user", content: "How are you?" },
                  { role: "assistant", content: "I am fine, thank you!" },
                ],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with search parameters
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        searchMode: "keyword",
        timeRange: "1d",
        size: 10,
        from: 0,
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      hits: {
        hits: mockSearchResults.body.hits.hits,
        total: mockSearchResults.body.hits.total,
      },
      took: mockSearchResults.body.took,
    });

    // Verify that OpenSearch client was called with the correct parameters
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          query: expect.any(Object),
          sort: expect.any(Array),
          size: 10,
          from: 0,
        }),
      }),
    );
  });

  it("should handle fuzzy search mode correctly", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [
                  { role: "user", content: "Hello" },
                  { role: "assistant", content: "Hi there!" },
                ],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with fuzzy search parameters
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        searchMode: "fuzzy",
        fuzzyConfig: {
          fuzziness: "AUTO",
          prefixLength: 2,
        },
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called with fuzzy query
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.arrayContaining([
                expect.objectContaining({
                  match: expect.objectContaining({
                    model: expect.objectContaining({
                      query: "hello",
                      fuzziness: "AUTO",
                      prefix_length: 2,
                    }),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle regex search mode correctly", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [
                  { role: "user", content: "Hello" },
                  { role: "assistant", content: "Hi there!" },
                ],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with regex search parameters
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello.*",
        searchMode: "regex",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called with regex query
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.arrayContaining([
                expect.objectContaining({
                  regexp: expect.any(Object),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle custom time range correctly", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [
                  { role: "user", content: "Hello" },
                  { role: "assistant", content: "Hi there!" },
                ],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with custom time range
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        timeRange: {
          start: "2023-01-01",
          end: "2023-12-31",
        },
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called with time range filter
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  range: expect.objectContaining({
                    timestamp: expect.objectContaining({
                      gte: "2023-01-01",
                      lte: "2023-12-31",
                    }),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle empty query correctly", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 5 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [{ role: "user", content: "Hello" }],
              },
            },
          ],
        },
        took: 3,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with no query
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        // No query provided
        timeRange: "1d",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called with a query that doesn't include search terms
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.any(Array),
              minimum_should_match: 1,
            }),
          }),
        }),
      }),
    );
  });

  it("should handle custom time range object correctly", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [{ role: "user", content: "Hello" }],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with custom time range object
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        timeRange: {
          start: "2023-01-01",
          end: "2023-12-31",
        },
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called with time range filter
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  range: expect.objectContaining({
                    timestamp: expect.objectContaining({
                      gte: "2023-01-01",
                      lte: "2023-12-31",
                    }),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle invalid time range gracefully", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [{ role: "user", content: "Hello" }],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with invalid time range
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        timeRange: "invalid_range", // Not a valid predefined range
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called without time range filter
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.not.objectContaining({
              must: expect.anything(),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle partial time range object gracefully", async () => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "1",
              _score: 1.0,
              _source: {
                model: "gpt-4",
                messages: [{ role: "user", content: "Hello" }],
              },
            },
          ],
        },
        took: 5,
      },
    };

    // Setup the OpenSearch client mock to return successful response
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request with partial time range object
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        timeRange: {
          // Missing start or end
          someOtherProperty: "value",
        },
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called without time range filter
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.not.objectContaining({
              must: expect.anything(),
            }),
          }),
        }),
      }),
    );
  });

  it("should return empty results with error status when OpenSearch throws an error", async () => {
    // Setup the OpenSearch client mock to throw an error
    (opensearchClient.search as jest.Mock).mockRejectedValueOnce(new Error("OpenSearch error"));

    // Create a mock request
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
      }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({
      hits: {
        hits: [],
        total: { value: 0 },
      },
      took: 0,
      error: "OpenSearch error",
    });
  });
});

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

    // Verify that OpenSearch client was called with fuzzy query for both model and messages.content
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.arrayContaining([
                // Check for model match
                expect.objectContaining({
                  match: {
                    model: {
                      query: "hello",
                      fuzziness: "AUTO",
                      prefix_length: 2,
                    },
                  },
                }),
                // Check for messages.content match (nested)
                expect.objectContaining({
                  nested: {
                    path: "messages",
                    query: {
                      match: {
                        "messages.content": {
                          query: "hello",
                          fuzziness: "AUTO",
                          prefix_length: 2,
                        },
                      },
                    },
                  },
                }),
              ]),
              minimum_should_match: 1,
            }),
          }),
          // Verify sort order for fuzzy search
          sort: expect.arrayContaining([
            expect.objectContaining({ _score: "desc" }),
            expect.objectContaining({ timestamp: "desc" }),
          ]),
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

    // Only verify status code, not error message content
  });
  test.each([
    ["1h", "now-1h"],
    ["1m", "now-1M"],
    ["1y", "now-1y"],
  ])("should handle timeRange '%s' correctly", async (timeRangeValue, expectedGte) => {
    // Mock successful response from OpenSearch
    const mockSearchResults = {
      body: { hits: { total: { value: 0 }, hits: [] }, took: 2 },
    };
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create a mock request
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "test", timeRange: timeRangeValue }),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch client was called with the correct time range filter
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  range: expect.objectContaining({
                    timestamp: expect.objectContaining({
                      gte: expectedGte, // Check the specific gte value
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
  it("should handle OpenSearch response with hits.total as number", async () => {
    // Mock response where hits.total is a number (older ES versions)
    const mockSearchResults = {
      body: {
        hits: {
          total: 1, // total is a number
          hits: [{ _id: "num-total-id", _score: 1.0, _source: { model: "test" } }],
        },
        took: 3,
      },
    };
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.hits.total).toBe(1); // Check if the number is passed correctly
  });

  it("should handle OpenSearch hits missing _source", async () => {
    // Mock response where a hit is missing the _source field
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [{ _id: "no-source-id", _score: 1.0 /* no _source */ }],
        },
        took: 4,
      },
    };
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.hits.hits[0]._source).toBeUndefined();
  });

  it("should handle OpenSearch hits with _source but missing messages", async () => {
    // Mock response where a hit has _source but no messages array
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 1 },
          hits: [{ _id: "no-messages-id", _score: 1.0, _source: { model: "gpt-test" /* no messages */ } }],
        },
        took: 6,
      },
    };
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.hits.hits[0]._source.messages).toBeUndefined();
  });

  it("should handle fuzzy search with custom fuzzy config", async () => {
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

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    // Create request with custom fuzzy config
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        searchMode: "fuzzy",
        fuzzyConfig: {
          fuzziness: "1",
          prefixLength: 3,
        },
      }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify that OpenSearch was called with custom fuzzy config
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.arrayContaining([
                expect.objectContaining({
                  match: {
                    model: {
                      query: "hello",
                      fuzziness: "1",
                      prefix_length: 3,
                    },
                  },
                }),
                expect.objectContaining({
                  nested: {
                    path: "messages",
                    query: {
                      match: {
                        "messages.content": {
                          query: "hello",
                          fuzziness: "1",
                          prefix_length: 3,
                        },
                      },
                    },
                  },
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle search when OpenSearch took is not available", async () => {
    // Mock response without took field
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
        // No took field
      },
    };

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "hello" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.took).toBeGreaterThanOrEqual(0); // Should use calculated search time (can be 0 in tests)
  });

  it("should handle search with empty results and no hits", async () => {
    // Mock response with no hits
    const mockSearchResults = {
      body: {
        hits: {
          total: { value: 0 },
          hits: [], // Empty array
        },
        took: 2,
      },
    };

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "nonexistent" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.hits.hits).toHaveLength(0);
    expect(responseData.hits.total.value).toBe(0);
  });
});

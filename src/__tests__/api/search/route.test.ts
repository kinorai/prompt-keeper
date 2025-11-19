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
    PROMPT_KEEPER_INDEX: "prompt-keeper-v2",
    ensureIndexExists: jest.fn().mockResolvedValue(undefined),
    checkIndexExists: jest.fn().mockResolvedValue(true),
    initializeIndex: jest.fn().mockResolvedValue(undefined),
    resetInitializationState: jest.fn(),
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
                  { role: "assistant", content: "Hi!" },
                ],
              },
            },
          ],
        },
        took: 5,
      },
    };

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce(mockSearchResults);

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
      }),
    });

    const response = await POST(req);
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData.hits.hits).toHaveLength(1);
    expect(responseData.hits.total.value).toBe(1);

    // Verify basic magic query structure
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper-v2",
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  bool: expect.objectContaining({
                    should: expect.arrayContaining([
                      // Root simple_query_string
                      expect.objectContaining({
                        simple_query_string: expect.objectContaining({
                          query: "hello",
                          fields: expect.arrayContaining(["model^2"]),
                        }),
                      }),
                      // Nested simple_query_string
                      expect.objectContaining({
                        nested: expect.objectContaining({
                          path: "messages",
                          query: expect.objectContaining({
                            simple_query_string: expect.objectContaining({
                              query: "hello",
                              fields: expect.arrayContaining(["messages.content^4"]),
                            }),
                          }),
                        }),
                      }),
                    ]),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should include fuzzy typo-tolerant clauses for tokens", async () => {
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { total: { value: 0 }, hits: [] }, took: 1 },
    });

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "poulet",
      }),
    });

    await POST(req);

    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  bool: expect.objectContaining({
                    should: expect.arrayContaining([
                      expect.objectContaining({
                        match: expect.objectContaining({
                          model: expect.objectContaining({
                            fuzziness: "AUTO:2,3",
                          }),
                        }),
                      }),
                      expect.objectContaining({
                        nested: expect.objectContaining({
                          path: "messages",
                          query: expect.objectContaining({
                            match: expect.objectContaining({
                              "messages.content": expect.objectContaining({
                                fuzziness: "AUTO:2,3",
                              }),
                            }),
                          }),
                        }),
                      }),
                    ]),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle role: filter extraction", async () => {
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { total: { value: 0 }, hits: [] }, took: 1 },
    });

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "role:user javascript error",
      }),
    });

    await POST(req);

    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              // Check for text search with clean query
              must: expect.arrayContaining([
                expect.objectContaining({
                  bool: expect.objectContaining({
                    should: expect.arrayContaining([
                      expect.objectContaining({
                        simple_query_string: expect.objectContaining({
                          query: "javascript error", // role:user stripped
                        }),
                      }),
                    ]),
                  }),
                }),
              ]),
              // Check for role filter
              filter: expect.arrayContaining([
                expect.objectContaining({
                  nested: expect.objectContaining({
                    path: "messages",
                    query: expect.objectContaining({
                      terms: expect.objectContaining({
                        "messages.role": expect.arrayContaining(["user"]),
                      }),
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

  it("should handle model: filter extraction", async () => {
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { total: { value: 0 }, hits: [] }, took: 1 },
    });

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: 'model:"gpt-4" testing',
      }),
    });

    await POST(req);

    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              // Check for text search with clean query
              must: expect.arrayContaining([
                expect.objectContaining({
                  bool: expect.objectContaining({
                    should: expect.arrayContaining([
                      expect.objectContaining({
                        simple_query_string: expect.objectContaining({
                          query: "testing", // model:"gpt-4" stripped
                        }),
                      }),
                    ]),
                  }),
                }),
              ]),
              // Check for model filter
              filter: expect.arrayContaining([
                expect.objectContaining({
                  terms: expect.objectContaining({
                    "model.keyword": expect.arrayContaining(["gpt-4"]),
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle explicit UI filters (roles and timeRange)", async () => {
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { total: { value: 0 }, hits: [] }, took: 1 },
    });

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "hello",
        roles: ["assistant"],
        timeRange: "1d",
      }),
    });

    await POST(req);

    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                // Role filter
                expect.objectContaining({
                  nested: expect.objectContaining({
                    path: "messages",
                    query: expect.objectContaining({
                      terms: expect.objectContaining({
                        "messages.role": expect.arrayContaining(["assistant"]),
                      }),
                    }),
                  }),
                }),
                // Time range filter
                expect.objectContaining({
                  range: expect.objectContaining({
                    timestamp: expect.objectContaining({
                      gte: "now-1d",
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

  it("should handle empty query (match_all)", async () => {
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { total: { value: 0 }, hits: [] }, took: 1 },
    });

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "",
      }),
    });

    await POST(req);

    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  match_all: {},
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("should handle OpenSearch errors", async () => {
    (opensearchClient.search as jest.Mock).mockRejectedValueOnce(new Error("OpenSearch failure"));

    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "fail" }),
    });

    const response = await POST(req);
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("OpenSearch failure");
  });
});

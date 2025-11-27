import { POST } from "@/app/api/search/route";
import { NextRequest, NextResponse } from "next/server";
import { SEARCH_HIGHLIGHT_POST_TAG, SEARCH_HIGHLIGHT_PRE_TAG } from "@/lib/search-highlights";

type ShouldClause = {
  simple_query_string?: {
    query?: string;
  };
  nested?: {
    path?: string;
    inner_hits?: unknown;
  };
  [key: string]: unknown;
};

// Mock the OpenSearch client
jest.mock("@/lib/opensearch", () => {
  const mockClient = {
    search: jest.fn(),
  };
  return {
    __esModule: true,
    getOpenSearchClient: jest.fn(() => mockClient),
    PROMPT_KEEPER_INDEX: "prompt-keeper-v2",
    ensureIndexExists: jest.fn().mockResolvedValue(undefined),
    checkIndexExists: jest.fn().mockResolvedValue(true),
    initializeIndex: jest.fn().mockResolvedValue(undefined),
    resetInitializationState: jest.fn(),
  };
});

// Import the mocked OpenSearch client getter
import { getOpenSearchClient } from "@/lib/opensearch";

// Get the mock client instance for assertions
const opensearchClient = getOpenSearchClient();

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

    const callArgs = (opensearchClient.search as jest.Mock).mock.calls[0][0];
    expect(callArgs.index).toBe("prompt-keeper-v2");
    const mustClauses = callArgs.body.query.bool.must;
    expect(mustClauses).toHaveLength(1);
    const shouldClauses = mustClauses[0].bool.should as ShouldClause[];
    expect(shouldClauses.some((clause) => clause.simple_query_string?.query === "hello")).toBe(true);
    expect(shouldClauses.some((clause) => clause.nested?.path === "messages" && clause.nested?.inner_hits)).toBe(true);
    expect(callArgs.body.highlight).toEqual(
      expect.objectContaining({
        pre_tags: [SEARCH_HIGHLIGHT_PRE_TAG],
        post_tags: [SEARCH_HIGHLIGHT_POST_TAG],
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
                          inner_hits: expect.any(Object),
                          query: expect.objectContaining({
                            bool: expect.objectContaining({
                              should: expect.arrayContaining([
                                expect.objectContaining({
                                  match: expect.objectContaining({
                                    "messages.content": expect.objectContaining({
                                      fuzziness: "AUTO:2,3",
                                    }),
                                  }),
                                }),
                              ]),
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

    const lastCall = (opensearchClient.search as jest.Mock).mock.calls.at(-1)?.[0];
    expect(lastCall?.body?.highlight).toBeUndefined();
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

import { POST } from "@/app/api/search/route";
import { NextRequest } from "next/server";

// Type for OpenSearch filter objects
type OpenSearchFilter = { range?: { created_at?: { gte?: string; lte?: string } } } | Record<string, unknown>;

jest.mock("@/lib/opensearch", () => {
  const mockClient = {
    search: jest.fn(),
  };
  return {
    __esModule: true,
    getOpenSearchClient: jest.fn(() => mockClient),
    ensureIndexExists: jest.fn().mockResolvedValue(undefined),
    PROMPT_KEEPER_INDEX: "prompt-keeper",
  };
});

import { getOpenSearchClient } from "@/lib/opensearch";
import { getPresignedUrl } from "@/lib/s3";

// Get the mock client instance for assertions
const opensearchClient = getOpenSearchClient();

jest.mock("@/lib/s3", () => ({
  getPresignedUrl: jest.fn(),
}));

describe("Search API Coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle different time ranges", async () => {
    const ranges = ["1h", "1m", "1y"];

    for (const range of ranges) {
      const req = new NextRequest("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ query: "test", timeRange: range }),
      });

      (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
        body: { hits: { hits: [], total: { value: 0 } }, took: 10 },
      });

      await POST(req);

      // Verify opensearch was called with correct range filter
      // We need to check the most recent call since we loop
      const callArgs = (opensearchClient.search as jest.Mock).mock.lastCall[0];
      const filters = callArgs.body.query.bool.filter;

      const rangeFilter = filters.find((f: OpenSearchFilter) => "range" in f && f.range);
      expect(rangeFilter).toBeDefined();
      expect(rangeFilter.range.created_at.gte).toBeDefined();

      // Reset mocks for next iteration
      jest.clearAllMocks();
    }
  });

  it("should handle custom time range", async () => {
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({
        query: "test",
        timeRange: { start: "now-2d", end: "now" },
      }),
    });

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { hits: [], total: { value: 0 } }, took: 10 },
    });

    await POST(req);

    const callArgs = (opensearchClient.search as jest.Mock).mock.calls[0][0];
    const filters = callArgs.body.query.bool.filter;
    const rangeFilter = filters.find((f: OpenSearchFilter) => "range" in f && f.range);
    expect(rangeFilter).toBeDefined();
    expect(rangeFilter.range.created_at.gte).toBe("now-2d");
    expect(rangeFilter.range.created_at.lte).toBe("now");
  });

  it("should handle multimodal content and sign S3 urls", async () => {
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      body: JSON.stringify({ query: "test" }),
    });

    const mockHits = [
      {
        _source: {
          messages: [
            {
              role: "user",
              multimodal_content: [
                { type: "text", text: "some text" },
                { type: "image_url", image_url: { url: "s3://bucket/key" } },
              ],
            },
          ],
        },
      },
    ];

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: { hits: { hits: mockHits, total: { value: 1 } }, took: 10 },
    });

    (getPresignedUrl as jest.Mock).mockResolvedValue("https://signed-url.com");

    const response = await POST(req);
    const data = await response.json();

    expect(data.hits.hits[0]._source.messages[0].content).toHaveLength(2);
    expect(data.hits.hits[0]._source.messages[0].content[1].image_url.url).toBe("https://signed-url.com");
  });
});

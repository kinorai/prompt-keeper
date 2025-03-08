import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX } from "@/lib/opensearch";

export async function POST(req: NextRequest) {
  try {
    const {
      query,
      searchMode = "keyword",
      timeRange,
      size = 20,
      from = 0,
      fuzzyConfig,
    } = await req.json();

    console.log("[Search API] Request:", {
      query,
      searchMode,
      timeRange,
      size,
      from,
      fuzzyConfig,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryBody: any = {
      bool: {
        should: [],
        minimum_should_match: 1,
      },
    };

    // Add search query based on mode
    if (query) {
      switch (searchMode) {
        case "fuzzy":
          queryBody.bool.should.push({
            match: {
              model: {
                query,
                fuzziness: fuzzyConfig?.fuzziness || "AUTO",
                prefix_length: fuzzyConfig?.prefixLength || 2,
              },
            },
          });

          queryBody.bool.should.push({
            nested: {
              path: "messages",
              query: {
                match: {
                  "messages.content": {
                    query,
                    fuzziness: fuzzyConfig?.fuzziness || "AUTO",
                    prefix_length: fuzzyConfig?.prefixLength || 2,
                  },
                },
              },
            },
          });
          break;

        case "regex":
          queryBody.bool.should.push(
            { regexp: { model: query } },
            {
              nested: {
                path: "messages",
                query: {
                  regexp: { "messages.content": query },
                },
              },
            },
          );
          break;

        default: // keyword
          queryBody.bool.should.push(
            { match: { model: query } },
            {
              nested: {
                path: "messages",
                query: {
                  match: { "messages.content": query },
                },
              },
            },
          );
      }
    }

    // Add time range filter if specified
    if (timeRange && timeRange !== "all") {
      const range: { gte?: string; lte?: string } = {};
      switch (timeRange) {
        case "1h":
          range.gte = "now-1h";
          break;
        case "1d":
          range.gte = "now-1d";
          break;
        case "1m":
          range.gte = "now-1M";
          break;
        case "1y":
          range.gte = "now-1y";
          break;
        default:
          if (
            typeof timeRange === "object" &&
            timeRange.start &&
            timeRange.end
          ) {
            range.gte = timeRange.start;
            range.lte = timeRange.end;
          }
      }

      if (Object.keys(range).length > 0) {
        queryBody.bool.must = queryBody.bool.must || [];
        queryBody.bool.must.push({
          range: { timestamp: range },
        });
      }
    }

    console.log("[Search API] Query:", JSON.stringify(queryBody, null, 2));

    const startTime = Date.now();
    const response = await opensearchClient.search({
      index: PROMPT_KEEPER_INDEX,
      body: {
        query: queryBody,
        sort: [{ timestamp: "desc" }],
        size,
        from,
        _source: true,
        highlight: {
          fields: {
            "messages.content": {
              pre_tags: ["<mark>"],
              post_tags: ["</mark>"],
              fragment_size: 150,
              number_of_fragments: 0
            },
            model: {
              pre_tags: ["<mark>"],
              post_tags: ["</mark>"]
            }
          },
          require_field_match: false
        }
      },
    });

    const searchTime = Date.now() - startTime;

    console.log("[Search API] Response:", {
      total:
        typeof response.body.hits.total === "number"
          ? response.body.hits.total
          : response.body.hits.total?.value || 0,
      hits: response.body.hits.hits.length,
      took: response.body.took,
      searchTime,
    });

    // Log the first result if available
    if (response.body.hits.hits.length > 0) {
      const firstResult = response.body.hits.hits[0];
      console.log("[Search API] First result:", {
        id: firstResult._id,
        score: firstResult._score,
        model: firstResult._source?.model,
        messageCount: firstResult._source?.messages?.length || 0,
      });
    }

    // Ensure we always return a consistent structure
    return NextResponse.json({
      hits: {
        hits: response.body.hits.hits,
        total: response.body.hits.total,
      },
      took: response.body.took || searchTime,
    });
  } catch (error) {
    console.error("[Search API Error]", error);
    // Return empty results on error
    return NextResponse.json(
      {
        hits: {
          hits: [],
          total: { value: 0 },
        },
        took: 0,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

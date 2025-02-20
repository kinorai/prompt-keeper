import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX } from "@/lib/opensearch";

export async function POST(req: NextRequest) {
  try {
    const {
      query,
      searchMode = "keyword",
      timeRange,
      fields = ["messages.content", "model"],
      size = 20,
      from = 0,
      fuzzyConfig,
    } = await req.json();

    let queryBody: any = {
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
            }
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
            }
          );
      }
    }

    // Add time range filter if specified
    if (timeRange && timeRange !== "all") {
      const range: any = {};
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

    const startTime = Date.now();
    const response = await opensearchClient.search({
      index: PROMPT_KEEPER_INDEX,
      body: {
        query: queryBody,
        sort: [{ timestamp: "desc" }],
        size,
        from,
        highlight: {
          fields: {
            model: {},
            "messages.content": {},
          },
        },
      },
    });

    const searchTime = Date.now() - startTime;

    console.debug("[Search API Response]", {
      query: JSON.stringify(queryBody, null, 2),
      hits:
        typeof response.body.hits.total === "number"
          ? response.body.hits.total
          : response.body.hits.total?.value || 0,
      searchTime,
    });
    // Ensure we always return a consistent structure
    return NextResponse.json({
      hits: response.body.hits.hits,
      total: response.body.hits.total,
      searchTime,
    });
  } catch (error) {
    console.error("[Search API Error]", error);
    // Return empty results on error
    return NextResponse.json(
      {
        hits: [],
        total: { value: 0 },
        searchTime: 0,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}

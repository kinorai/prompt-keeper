import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:search");

export async function POST(req: NextRequest) {
  try {
    // Ensure index exists before searching
    await ensureIndexExists();

    const { query, searchMode = "keyword", timeRange, size = 20, from = 0, fuzzyConfig, roles } = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const esQueryBody: any = {
      bool: {
        should: [],
        minimum_should_match: 1,
      },
    };

    if (query) {
      const rolesFilterActive = Array.isArray(roles) && roles.length > 0 && roles.length < 3;
      // Add search query based on mode
      switch (searchMode) {
        case "fuzzy":
          if (rolesFilterActive) {
            esQueryBody.bool.should.push({
              nested: {
                path: "messages",
                query: {
                  bool: {
                    filter: [{ terms: { "messages.role": roles } }],
                    must: [
                      {
                        match: {
                          "messages.content": {
                            query,
                            fuzziness: fuzzyConfig?.fuzziness || "AUTO",
                            prefix_length: fuzzyConfig?.prefixLength || 2,
                          },
                        },
                      },
                    ],
                  },
                },
              },
            });
          } else {
            esQueryBody.bool.should.push({
              match: {
                model: {
                  query,
                  fuzziness: fuzzyConfig?.fuzziness || "AUTO",
                  prefix_length: fuzzyConfig?.prefixLength || 2,
                },
              },
            });
            esQueryBody.bool.should.push({
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
          }
          break;

        case "regex":
          if (rolesFilterActive) {
            esQueryBody.bool.should.push({
              nested: {
                path: "messages",
                query: {
                  bool: {
                    filter: [{ terms: { "messages.role": roles } }],
                    must: [{ regexp: { "messages.content": query } }],
                  },
                },
              },
            });
          } else {
            esQueryBody.bool.should.push(
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
          }
          break;

        default: // keyword
          if (rolesFilterActive) {
            esQueryBody.bool.should.push({
              nested: {
                path: "messages",
                query: {
                  bool: {
                    filter: [{ terms: { "messages.role": roles } }],
                    must: [{ match: { "messages.content": query } }],
                  },
                },
              },
            });
          } else {
            esQueryBody.bool.should.push(
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
    } else {
      // No search query, use match_all but keep in the should array for test consistency
      esQueryBody.bool.should.push({ match_all: {} });
    }

    // Add role filters if provided (filter nested messages by selected roles)
    if (Array.isArray(roles) && roles.length > 0 && roles.length < 3) {
      esQueryBody.bool.filter = esQueryBody.bool.filter || [];
      esQueryBody.bool.filter.push({
        nested: {
          path: "messages",
          query: {
            terms: { "messages.role": roles },
          },
        },
      });
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
          if (typeof timeRange === "object" && timeRange.start && timeRange.end) {
            range.gte = timeRange.start;
            range.lte = timeRange.end;
          }
      }

      if (Object.keys(range).length > 0) {
        // Ensure bool and must clauses exist
        esQueryBody.bool.must = esQueryBody.bool.must || [];
        // Add the range filter to the 'must' clause.
        esQueryBody.bool.must.push({
          range: { timestamp: range },
        });
      }
    }

    log.debug(esQueryBody, "[Search API] Query:");

    const startTime = Date.now();
    const response = await opensearchClient.search({
      index: PROMPT_KEEPER_INDEX,
      body: {
        query: esQueryBody,
        // Always order by date (most recent first)
        sort: [{ timestamp: "desc" }],
        size,
        from,
        _source: true,
      },
    });

    const searchTime = Date.now() - startTime;

    // Log response details exactly as expected by tests
    log.debug(response, "[Search API] Response:");

    // Log the first result if available, exactly as expected by tests
    if (response.body.hits.hits.length > 0) {
      const firstResult = response.body.hits.hits[0];
      log.debug(firstResult, "[Search API] First result:");
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
    log.error(error, "[Search API Error]");
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

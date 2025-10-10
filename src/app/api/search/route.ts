import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:search");

export async function POST(req: NextRequest) {
  try {
    // Ensure index exists before searching
    await ensureIndexExists();

    const {
      query,
      searchMode = "smart",
      timeRange,
      size = 20,
      from = 0,
      fuzzyConfig,
      phraseConfig,
      roles,
    } = await req.json();

    function parseSmartQuery(raw: string) {
      const rolesAllowed = new Set(["system", "user", "assistant"]);
      const phrases: string[] = [];
      const plus: string[] = [];
      const minus: string[] = [];
      const rolesFromQuery: string[] = [];
      const modelsFromQuery: string[] = [];

      let working = raw;
      // Extract quoted phrases
      const phraseRegex = /"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = phraseRegex.exec(raw)) !== null) {
        if (m[1]) phrases.push(m[1]);
      }
      working = working.replace(phraseRegex, " ");

      const tokens = working
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const residual: string[] = [];
      for (const tok of tokens) {
        if (tok.startsWith("+")) {
          const val = tok.slice(1);
          if (val) plus.push(val);
          continue;
        }
        if (tok.startsWith("-")) {
          const val = tok.slice(1);
          if (val) minus.push(val);
          continue;
        }
        if (tok.startsWith("role:")) {
          const role = tok.slice(5).toLowerCase();
          if (rolesAllowed.has(role)) rolesFromQuery.push(role);
          continue;
        }
        if (tok.startsWith("model:")) {
          const model = tok.slice(6);
          if (model) modelsFromQuery.push(model);
          continue;
        }
        residual.push(tok);
      }

      return {
        phrases,
        plus,
        minus,
        rolesFromQuery,
        modelsFromQuery,
        residual,
        raw,
        lower: raw.toLowerCase(),
      };
    }

    type EsQueryClause = Record<string, unknown>;

    interface EsBoolQuery {
      should: EsQueryClause[];
      minimum_should_match: number;
      must?: EsQueryClause[];
      must_not?: EsQueryClause[];
      filter?: EsQueryClause[];
    }

    const esQueryBody: { bool: EsBoolQuery } = {
      bool: {
        should: [],
        minimum_should_match: 1,
      },
    };

    if (query) {
      const rolesFilterActive = Array.isArray(roles) && roles.length > 0 && roles.length < 3;
      // Add search query based on mode
      switch (searchMode) {
        case "smart": {
          const parsed = parseSmartQuery(query);

          // Merge roles filter from UI and query
          const mergedRoles = Array.from(
            new Set([...(Array.isArray(roles) ? roles : []), ...parsed.rolesFromQuery]).values(),
          );
          const rolesFilterActiveSmart = mergedRoles.length > 0 && mergedRoles.length < 3;

          // Strong phrase boosts (exact and near)
          for (const ph of parsed.phrases.length > 0 ? parsed.phrases : [query]) {
            esQueryBody.bool.should.push(
              {
                nested: {
                  path: "messages",
                  query: {
                    match_phrase: { "messages.content": { query: ph, slop: 0, boost: 6 } },
                  },
                },
              },
              {
                nested: {
                  path: "messages",
                  query: {
                    match_phrase: { "messages.content": { query: ph, slop: 2, boost: 3 } },
                  },
                },
              },
              {
                match_phrase: { model: { query: ph, slop: 0, boost: 2 } },
              },
            );
          }

          // Cross-field AND match (content + model)
          esQueryBody.bool.should.push({
            multi_match: {
              query,
              type: "cross_fields",
              operator: "AND",
              fields: ["messages.content^3", "model^1"],
              boost: 2,
            },
          });

          // As-you-type boost for partial inputs
          esQueryBody.bool.should.push(
            { match: { "messages.content.asyt": { query, boost: 1 } } },
            { match: { "model.asyt": { query, boost: 0.8 } } },
          );

          // Exact lowercase keyword boost (verbatim substring equality-ish)
          esQueryBody.bool.should.push(
            { term: { "messages.content.keyword_lower": { value: parsed.lower, boost: 4 } } },
            { term: { "model.keyword_lower": { value: parsed.lower, boost: 1.5 } } },
          );

          // Required terms (+word)
          if (parsed.plus.length > 0) {
            esQueryBody.bool.must = esQueryBody.bool.must || [];
            for (const t of parsed.plus) {
              esQueryBody.bool.must.push(
                {
                  nested: {
                    path: "messages",
                    query: { match: { "messages.content": t } },
                  },
                },
                { match: { model: t } },
              );
            }
          }

          // Excluded terms (-word)
          if (parsed.minus.length > 0) {
            esQueryBody.bool.must_not = esQueryBody.bool.must_not || [];
            for (const t of parsed.minus) {
              esQueryBody.bool.must_not.push(
                {
                  nested: {
                    path: "messages",
                    query: { match: { "messages.content": t } },
                  },
                },
                { match: { model: t } },
              );
            }
          }

          // Query-specified model filters
          if (parsed.modelsFromQuery.length > 0) {
            esQueryBody.bool.filter = esQueryBody.bool.filter || [];
            for (const m of parsed.modelsFromQuery) {
              esQueryBody.bool.filter.push({ match: { model: m } });
            }
          }

          // Roles filter (merged)
          if (rolesFilterActiveSmart) {
            esQueryBody.bool.filter = esQueryBody.bool.filter || [];
            esQueryBody.bool.filter.push({
              nested: {
                path: "messages",
                query: {
                  terms: { "messages.role": mergedRoles },
                },
              },
            });
          }
          break;
        }
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

        case "phrase":
          if (rolesFilterActive) {
            esQueryBody.bool.should.push({
              nested: {
                path: "messages",
                query: {
                  bool: {
                    filter: [{ terms: { "messages.role": roles } }],
                    must: [
                      {
                        match_phrase: {
                          "messages.content": {
                            query,
                            slop: typeof phraseConfig?.slop === "number" ? phraseConfig.slop : 0,
                          },
                        },
                      },
                    ],
                  },
                },
              },
            });
          } else {
            esQueryBody.bool.should.push(
              {
                match_phrase: {
                  model: {
                    query,
                    slop: typeof phraseConfig?.slop === "number" ? phraseConfig.slop : 0,
                  },
                },
              },
              {
                nested: {
                  path: "messages",
                  query: {
                    match_phrase: {
                      "messages.content": {
                        query,
                        slop: typeof phraseConfig?.slop === "number" ? phraseConfig.slop : 0,
                      },
                    },
                  },
                },
              },
            );
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

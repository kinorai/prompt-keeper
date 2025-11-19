import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:search");
const FUZZINESS_SETTING = "AUTO:2,3";
const FUZZY_PREFIX_LENGTH = 1;
const MIN_FUZZY_TERM_LENGTH = 3;
const MAX_FUZZY_TERMS = 5;

function extractFuzzyTokens(input: string): string[] {
  const tokens = input
    .split(/\s+/)
    .map((token) =>
      token
        .replace(/^[+\-]+/, "")
        .replace(/["']/g, "")
        .trim(),
    )
    .filter((token) => token.length >= MIN_FUZZY_TERM_LENGTH);

  return Array.from(new Set(tokens)).slice(0, MAX_FUZZY_TERMS);
}

export async function POST(req: NextRequest) {
  try {
    // Ensure index exists before searching
    await ensureIndexExists();

    const {
      query,
      timeRange,
      size = 20,
      from = 0,
      roles, // From UI filters
    } = await req.json();

    // 1. Parse Magic Query
    const roleRegex = /\brole:(system|user|assistant)\b/gi;
    const modelRegex = /\bmodel:([^\s"']+|"[^"]*"|'[^']+')/gi;

    const rolesFromQuery: string[] = [];
    const modelsFromQuery: string[] = [];

    let cleanQuery = query || "";

    // Extract roles
    let roleMatch;
    while ((roleMatch = roleRegex.exec(query || "")) !== null) {
      rolesFromQuery.push(roleMatch[1].toLowerCase());
      cleanQuery = cleanQuery.replace(roleMatch[0], "");
    }

    // Extract models (handling quoted strings)
    let modelMatch;
    while ((modelMatch = modelRegex.exec(query || "")) !== null) {
      let model = modelMatch[1];
      // Remove quotes if present
      if ((model.startsWith('"') && model.endsWith('"')) || (model.startsWith("'") && model.endsWith("'"))) {
        model = model.slice(1, -1);
      }
      modelsFromQuery.push(model);
      cleanQuery = cleanQuery.replace(modelMatch[0], "");
    }

    // Clean up extra spaces
    cleanQuery = cleanQuery.replace(/\s+/g, " ").trim();

    // 2. Construct OpenSearch Query
    interface EsBoolQuery {
      must: Record<string, unknown>[];
      filter: Record<string, unknown>[];
      should: Record<string, unknown>[];
    }

    const esQueryBody: { bool: EsBoolQuery } = {
      bool: {
        must: [],
        filter: [],
        should: [], // Used for matching logic (OR between fields)
      },
    };

    // Text Search
    if (cleanQuery) {
      // We need to search in both root fields (model) and nested fields (messages.content)
      // simple_query_string cannot handle both root and nested fields simultaneously in the same query block
      // So we split them into two 'should' clauses. At least one must match.

      const textSearchBool: {
        bool: {
          should: Record<string, unknown>[];
          minimum_should_match: number;
        };
      } = {
        bool: {
          should: [
            // Root fields (Model)
            {
              simple_query_string: {
                query: cleanQuery,
                fields: ["model^2", "model.edge", "model.folded"],
                default_operator: "AND",
                flags: "ALL",
              },
            },
            // Nested fields (Messages)
            {
              nested: {
                path: "messages",
                query: {
                  simple_query_string: {
                    query: cleanQuery,
                    fields: [
                      "messages.content^4",
                      "messages.content.folded^4",
                      "messages.content.edge^2",
                      "messages.content.ngram^1",
                    ],
                    default_operator: "AND",
                    flags: "ALL",
                  },
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      };

      const fuzzyTokens = extractFuzzyTokens(cleanQuery);
      if (fuzzyTokens.length > 0) {
        for (const token of fuzzyTokens) {
          textSearchBool.bool.should.push({
            match: {
              model: {
                query: token,
                fuzziness: FUZZINESS_SETTING,
                prefix_length: FUZZY_PREFIX_LENGTH,
                boost: 0.5,
              },
            },
          });
          textSearchBool.bool.should.push({
            nested: {
              path: "messages",
              query: {
                match: {
                  "messages.content": {
                    query: token,
                    fuzziness: FUZZINESS_SETTING,
                    prefix_length: FUZZY_PREFIX_LENGTH,
                    boost: 0.7,
                  },
                },
              },
            },
          });
        }
      }

      esQueryBody.bool.must.push(textSearchBool);
    } else {
      esQueryBody.bool.must.push({ match_all: {} });
    }

    // Filters

    // Roles
    const validRoles = ["system", "user", "assistant"];
    const uiRoles = Array.isArray(roles) ? roles.filter((r) => validRoles.includes(r)) : [];

    const activeRoles = new Set<string>();
    if (uiRoles.length > 0 && uiRoles.length < 3) {
      uiRoles.forEach((r) => activeRoles.add(r));
    }
    if (rolesFromQuery.length > 0) {
      rolesFromQuery.forEach((r) => activeRoles.add(r));
    }

    if (activeRoles.size > 0) {
      esQueryBody.bool.filter.push({
        nested: {
          path: "messages",
          query: {
            terms: { "messages.role": Array.from(activeRoles) },
          },
        },
      });
    }

    // Models
    if (modelsFromQuery.length > 0) {
      esQueryBody.bool.filter.push({
        terms: { "model.keyword": modelsFromQuery },
      });
    }

    // Time Range
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
        esQueryBody.bool.filter.push({
          range: { timestamp: range },
        });
      }
    }

    log.debug(esQueryBody, "[Search API] Magic Query:");

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

    return NextResponse.json({
      hits: {
        hits: response.body.hits.hits,
        total: response.body.hits.total,
      },
      took: response.body.took || searchTime,
    });
  } catch (error) {
    log.error(error, "[Search API Error]");
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

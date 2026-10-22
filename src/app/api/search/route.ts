import { NextRequest, NextResponse } from "next/server";
import { getOpenSearchClient, PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { SEARCH_HIGHLIGHT_POST_TAG, SEARCH_HIGHLIGHT_PRE_TAG } from "@/lib/search-highlights";
import { createLogger } from "@/lib/logger";
import { getPresignedUrl } from "@/lib/s3";
import { DEFAULT_ROLES, SEARCH_LIMITS } from "@/lib/defaults";
import { requireAuth } from "@/lib/request-auth";
// @ts-expect-error — deep subpath types exist but aren't exposed in package exports for bundler resolution
import type { Highlight, HighlightField } from "@opensearch-project/opensearch/api/_types/_core.search";
// @ts-expect-error — same as above
import type { QueryContainer } from "@opensearch-project/opensearch/api/_types/_common.query_dsl";

const log = createLogger("api:search");

// Types for OpenSearch response structure
interface MessageContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
}

interface SearchMessage {
  role: string;
  content: string | MessageContentItem[];
  multimodal_content?: MessageContentItem[];
}

interface SearchHitSource {
  messages?: SearchMessage[];
  [key: string]: unknown;
}

interface SearchHit {
  _source?: SearchHitSource;
  highlight?: Record<string, string[]>;
  [key: string]: unknown;
}

const HIGHLIGHT_FRAGMENT_SIZE = 2000;

const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

// Returns an error message for a request body the search can't run safely, or null when it is valid
function validateSearchParams({ query, size, from, roles, timeRange }: Record<string, unknown>): string | null {
  if (query !== undefined && query !== null && typeof query !== "string") {
    return "query must be a string";
  }
  if (!isNonNegativeInteger(size) || size < 1 || size > SEARCH_LIMITS.maxResultsSize) {
    return `size must be an integer between 1 and ${SEARCH_LIMITS.maxResultsSize}`;
  }
  if (!isNonNegativeInteger(from) || from + size > SEARCH_LIMITS.maxResultWindow) {
    return `from must be a non-negative integer and from + size at most ${SEARCH_LIMITS.maxResultWindow}`;
  }
  if (
    roles != null &&
    (!Array.isArray(roles) || !roles.every((role) => (DEFAULT_ROLES as readonly unknown[]).includes(role)))
  ) {
    return `roles must be an array of ${DEFAULT_ROLES.join(", ")}`;
  }
  if (
    timeRange !== null &&
    typeof timeRange === "object" &&
    (typeof (timeRange as Record<string, unknown>).start !== "string" ||
      typeof (timeRange as Record<string, unknown>).end !== "string")
  ) {
    return "timeRange start and end must be strings";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    // Ensure index exists before searching
    await ensureIndexExists();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const {
      query,
      timeRange,
      size = 20,
      from = 0,
      roles, // From UI filters
    } = body;

    const validationError = validateSearchParams({ query, size, from, roles, timeRange });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // 1. Parse Magic Query
    const roleRegex = new RegExp(`\\brole:(${DEFAULT_ROLES.join("|")})\\b`, "gi");
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
    let highlightConfig: Highlight | undefined;

    if (cleanQuery) {
      const buildHighlightQuery = (fields: string[]): QueryContainer => ({
        simple_query_string: {
          query: cleanQuery,
          fields,
          default_operator: "AND",
          flags: "ALL",
        },
      });

      const buildSnippetField = (fields: string[]): HighlightField => ({
        number_of_fragments: 2,
        fragment_size: 90,
        fragmenter: "span",
        type: "unified",
        force_source: true,
        highlight_query: buildHighlightQuery(fields),
      });

      const baseMessageHighlightField: HighlightField = {
        number_of_fragments: 0,
        fragment_size: HIGHLIGHT_FRAGMENT_SIZE,
        type: "unified",
        force_source: true,
      };

      const topLevelHighlightFields: Record<string, HighlightField> = {
        model: buildSnippetField(["model", "model.folded", "model.edge"]),
        "model.edge": buildSnippetField(["model", "model.folded", "model.edge"]),
        "messages.content": buildSnippetField([
          "messages.content",
          "messages.content.folded",
          "messages.content.edge",
          "messages.content.ngram",
        ]),
      };

      highlightConfig = {
        pre_tags: [SEARCH_HIGHLIGHT_PRE_TAG],
        post_tags: [SEARCH_HIGHLIGHT_POST_TAG],
        require_field_match: false,
        fields: topLevelHighlightFields,
      };

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
          ],
          minimum_should_match: 1,
        },
      };

      const nestedShouldClauses: Record<string, unknown>[] = [
        {
          simple_query_string: {
            query: cleanQuery,
            fields: [
              "messages.content^4",
              "messages.content.folded^4",
              "messages.content.edge^2",
              "messages.content.ngram^1",
              // Reasoning is prose the user wrote a query against just as much as content is,
              // and the tool name is how you find "which conversation called fetch_url"
              "messages.reasoning_content^2",
              "messages.reasoning_content.folded^2",
              "messages.tool_calls.function.name^2",
            ],
            default_operator: "AND",
            flags: "ALL",
          },
        },
      ];

      textSearchBool.bool.should.push({
        nested: {
          path: "messages",
          query: {
            bool: {
              should: nestedShouldClauses,
              minimum_should_match: 1,
            },
          },
          inner_hits: {
            name: "messages",
            size: 5,
            highlight: {
              pre_tags: [SEARCH_HIGHLIGHT_PRE_TAG],
              post_tags: [SEARCH_HIGHLIGHT_POST_TAG],
              require_field_match: false,
              fields: {
                content: {
                  ...baseMessageHighlightField,
                  highlight_query: buildHighlightQuery([
                    "messages.content",
                    "messages.content.folded",
                    "messages.content.edge",
                    "messages.content.ngram",
                  ]),
                },
                reasoning_content: {
                  ...baseMessageHighlightField,
                  highlight_query: buildHighlightQuery([
                    "messages.reasoning_content",
                    "messages.reasoning_content.folded",
                  ]),
                },
              },
            },
          },
        },
      });

      esQueryBody.bool.must.push(textSearchBool);
    } else {
      esQueryBody.bool.must.push({ match_all: {} });
    }

    // Filters

    // Roles
    const validRoles: string[] = [...DEFAULT_ROLES];
    const uiRoles: string[] = roles ?? [];

    const activeRoles = new Set<string>();
    if (uiRoles.length > 0 && uiRoles.length < validRoles.length) {
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
          range: { created_at: range },
        });
      }
    }

    log.debug(esQueryBody, "[Search API] Magic Query:");

    const startTime = Date.now();
    const response = await getOpenSearchClient().search({
      index: PROMPT_KEEPER_INDEX,
      body: {
        query: esQueryBody,
        ...(highlightConfig ? { highlight: highlightConfig } : {}),
        // Always order by date (most recent first)
        sort: [{ created_at: "desc" }],
        size,
        from,
        _source: true,
      },
    });
    const searchTime = Date.now() - startTime;

    const hits = response.body.hits.hits;

    // Process hits to sign URLs for S3 images
    await Promise.all(
      hits.map(async (hit: SearchHit) => {
        if (hit._source?.messages) {
          await Promise.all(
            hit._source.messages.map(async (msg: SearchMessage) => {
              // If multimodal_content exists, use it as the main content
              if (msg.multimodal_content) {
                msg.content = msg.multimodal_content;
              }

              if (Array.isArray(msg.content)) {
                await Promise.all(
                  msg.content.map(async (item: MessageContentItem) => {
                    if (item.type === "image_url" && item.image_url?.url?.startsWith("s3://")) {
                      const key = item.image_url.url.replace("s3://", "");
                      const signedUrl = await getPresignedUrl(key);
                      if (signedUrl) {
                        item.image_url.url = signedUrl;
                      }
                    }
                  }),
                );
              }
            }),
          );
        }
      }),
    );

    return NextResponse.json({
      hits: {
        hits: hits,
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

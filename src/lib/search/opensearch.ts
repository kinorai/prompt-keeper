import { getOpenSearchClient, PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { SEARCH_HIGHLIGHT_POST_TAG, SEARCH_HIGHLIGHT_PRE_TAG } from "@/lib/search-highlights";
import { createLogger } from "@/lib/logger";
import type { SearchRequest, TimeFilter } from "@/lib/search/request";
import type { SearchResults } from "@/lib/search/types";
// @ts-expect-error — deep subpath types exist but aren't exposed in package exports for bundler resolution
import type { Highlight, HighlightField } from "@opensearch-project/opensearch/api/_types/_core.search";
// @ts-expect-error — same as above
import type { QueryContainer } from "@opensearch-project/opensearch/api/_types/_common.query_dsl";

const log = createLogger("search:opensearch");

const HIGHLIGHT_FRAGMENT_SIZE = 2000;

const PRESET_RANGES = { "1h": "now-1h", "1d": "now-1d", "1m": "now-1M", "1y": "now-1y" } as const;

function toOpenSearchRange(timeRange: TimeFilter | null): { gte?: string; lte?: string } | null {
  if (!timeRange) return null;
  if ("preset" in timeRange) return { gte: PRESET_RANGES[timeRange.preset] };
  return { gte: timeRange.start, lte: timeRange.end };
}

export async function searchOpenSearch(request: SearchRequest): Promise<SearchResults> {
  await ensureIndexExists();
  const { text, size, from } = request;

  // Construct the OpenSearch query
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

  if (text) {
    const buildHighlightQuery = (fields: string[]): QueryContainer => ({
      simple_query_string: {
        query: text,
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
              query: text,
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
          query: text,
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
  if (request.roles.length > 0) {
    esQueryBody.bool.filter.push({
      nested: {
        path: "messages",
        query: {
          terms: { "messages.role": request.roles },
        },
      },
    });
  }

  // Models
  if (request.models.length > 0) {
    esQueryBody.bool.filter.push({
      terms: { "model.keyword": request.models },
    });
  }

  // Time Range
  const range = toOpenSearchRange(request.timeRange);
  if (range) {
    esQueryBody.bool.filter.push({
      range: { created_at: range },
    });
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

  // Passed through as OpenSearch returns them; SearchHit is the subset the UI reads
  return {
    hits: response.body.hits.hits as unknown as SearchResults["hits"],
    total: response.body.hits.total as SearchResults["total"],
    took: response.body.took || searchTime,
  };
}

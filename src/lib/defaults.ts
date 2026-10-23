export const DEFAULT_TIME_RANGE = "1y";
export const DEFAULT_RESULTS_SIZE = 40;

// Bounds for /api/search pagination. maxResultWindow matches OpenSearch's default index.max_result_window.
export const SEARCH_LIMITS = {
  maxResultsSize: 1000,
  maxResultWindow: 10000,
  // Characters
  maxQueryLength: 1000,
  // Words and phrases in one query: each is a condition Postgres evaluates, on every message when
  // none of them narrows the search (a query of only negations)
  maxQueryTerms: 32,
} as const;

// Where /api/search runs: "postgres" (no other service needed) or "opensearch" (needs OPENSEARCH_*
// and the outbox worker to keep the index in sync)
export const SEARCH_BACKENDS = ["postgres", "opensearch"] as const;
export type SearchBackend = (typeof SEARCH_BACKENDS)[number];
export const DEFAULT_SEARCH_BACKEND: SearchBackend = "postgres";

export const POSTGRES_SEARCH = {
  // Matching messages returned per conversation, like the OpenSearch inner_hits size
  innerHitsSize: 5,
  // Totals are exact up to here, like OpenSearch's default track_total_hits
  trackTotalHits: 10000,
  // The list snippet, like the OpenSearch highlight's fragment_size and number_of_fragments
  snippet: { size: 90, count: 2 },
} as const;

// With the Postgres backend the app drains the outbox itself (only deleted conversations' images
// are left to clean up), so it polls far less often than the OpenSearch worker
export const IN_PROCESS_OUTBOX_POLL_INTERVAL_MS = 15000;

// UI and behavior defaults
export const BREAKPOINTS = {
  // Tailwind 'sm' breakpoint
  sm: 640,
  // Useful for max-width queries
  smMax: 639,
} as const;

export const MOBILE_MEDIA_QUERY = `(max-width: ${BREAKPOINTS.smMax}px)`;

export const SEARCH_BEHAVIOR_DEFAULTS = {
  // Minimum characters before auto-search; empty string still fetches latest
  minQueryLength: 3,
  // Debounce durations
  searchDebounceMs: 600,
  filterDebounceMs: 400,
} as const;

export const FILTERS_DEFAULTS = {
  timeRange: DEFAULT_TIME_RANGE,
  resultsSize: DEFAULT_RESULTS_SIZE,
} as const;

// Roles defaults used across the app
export const DEFAULT_ROLES = ["system", "user", "assistant", "tool"] as const;
export type Role = (typeof DEFAULT_ROLES)[number];

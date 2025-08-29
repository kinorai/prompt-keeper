export const DEFAULT_TIME_RANGE = "1y";
export const DEFAULT_RESULTS_SIZE = 40;
export const DEFAULT_SEARCH_MODE = "fuzzy";
export const DEFAULT_FUZZINESS = "AUTO";
export const DEFAULT_PREFIX_LENGTH = 2;

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
  searchMode: DEFAULT_SEARCH_MODE,
  fuzziness: DEFAULT_FUZZINESS,
  prefixLength: DEFAULT_PREFIX_LENGTH,
} as const;

// Deletion behavior defaults
export const DELETE_UNDO_TIMEOUT_MS = 5000;

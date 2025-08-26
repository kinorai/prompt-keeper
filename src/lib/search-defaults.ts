export const DEFAULT_TIME_RANGE = "1y";
export const DEFAULT_RESULTS_SIZE = 200;
export const DEFAULT_SEARCH_MODE = "fuzzy";
export const DEFAULT_FUZZINESS = "AUTO";
export const DEFAULT_PREFIX_LENGTH = 2;

export const FILTERS_DEFAULTS = {
  timeRange: DEFAULT_TIME_RANGE,
  resultsSize: DEFAULT_RESULTS_SIZE,
  searchMode: DEFAULT_SEARCH_MODE,
  fuzziness: DEFAULT_FUZZINESS,
  prefixLength: DEFAULT_PREFIX_LENGTH,
} as const;

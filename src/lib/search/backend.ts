import { DEFAULT_SEARCH_BACKEND, SEARCH_BACKENDS, type SearchBackend } from "@/lib/defaults";

// Read on every call rather than once: tests and scripts switch it at runtime
export function getSearchBackend(): SearchBackend {
  const value = (process.env.SEARCH_BACKEND || DEFAULT_SEARCH_BACKEND).trim().toLowerCase();
  if (!(SEARCH_BACKENDS as readonly string[]).includes(value)) {
    throw new Error(`SEARCH_BACKEND must be one of ${SEARCH_BACKENDS.join(", ")}, got "${value}"`);
  }
  return value as SearchBackend;
}

export const isOpenSearchBackend = () => getSearchBackend() === "opensearch";

// The /api/search response shape. It is OpenSearch's search response, which the UI was written
// against; the Postgres backend builds the same fields.
export interface SearchInnerHit {
  _nested: { field: string; offset: number };
  highlight?: Record<string, string[]>;
}

export interface SearchHit {
  _id: string;
  _source?: Record<string, unknown>;
  highlight?: Record<string, string[]>;
  inner_hits?: { messages: { hits: { total: { value: number; relation: string }; hits: SearchInnerHit[] } } };
  [key: string]: unknown;
}

export interface SearchResults {
  hits: SearchHit[];
  total: { value: number; relation?: string };
  took: number;
}

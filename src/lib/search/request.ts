import { DEFAULT_ROLES, SEARCH_LIMITS } from "@/lib/defaults";
import { isOpenSearchBackend } from "@/lib/search/backend";
import { countTerms, parseSearchQuery } from "@/lib/search/query-parser";

// What /api/search asks for, once the body is validated and the magic filters (role:, model:)
// are taken out of the query text. Both backends take this.
export interface SearchRequest {
  // The query text without the magic filters; empty lists everything
  text: string;
  size: number;
  from: number;
  // A conversation qualifies when one of its messages has one of these roles; empty = no filter
  roles: string[];
  // Exact model names; empty = no filter
  models: string[];
  timeRange: TimeFilter | null;
}

export type TimeFilter = { preset: "1h" | "1d" | "1m" | "1y" } | { start: string; end: string };

const TIME_PRESETS = ["1h", "1d", "1m", "1y"] as const;

const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

// Clients that build the body from form or URL state send numbers as strings; accept "20" like 20
const toInteger = (value: unknown): unknown =>
  typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;

interface PagingParams {
  size: number;
  from: number;
  roles?: string[];
}

// Normalizes the paging and role filters, or returns an error message for a body the search can't run safely
function parsePagingParams(body: Record<string, unknown>): PagingParams | { error: string } {
  const { query, timeRange } = body;
  const size = toInteger(body.size ?? 20);
  const from = toInteger(body.from ?? 0);
  // Roles are matched case-insensitively, like role: in the query
  const roles = Array.isArray(body.roles)
    ? body.roles.map((role) => (typeof role === "string" ? role.toLowerCase() : role))
    : body.roles;

  if (query !== undefined && query !== null && typeof query !== "string") {
    return { error: "query must be a string" };
  }
  if (typeof query === "string" && query.length > SEARCH_LIMITS.maxQueryLength) {
    return { error: `query must be at most ${SEARCH_LIMITS.maxQueryLength} characters` };
  }
  if (!isNonNegativeInteger(size) || size < 1 || size > SEARCH_LIMITS.maxResultsSize) {
    return { error: `size must be an integer between 1 and ${SEARCH_LIMITS.maxResultsSize}` };
  }
  if (!isNonNegativeInteger(from) || from + size > SEARCH_LIMITS.maxResultWindow) {
    return {
      error: `from must be a non-negative integer and from + size at most ${SEARCH_LIMITS.maxResultWindow}`,
    };
  }
  if (
    roles != null &&
    (!Array.isArray(roles) || !roles.every((role) => (DEFAULT_ROLES as readonly unknown[]).includes(role)))
  ) {
    return { error: `roles must be an array of ${DEFAULT_ROLES.join(", ")}` };
  }
  if (
    timeRange !== null &&
    typeof timeRange === "object" &&
    (typeof (timeRange as Record<string, unknown>).start !== "string" ||
      typeof (timeRange as Record<string, unknown>).end !== "string")
  ) {
    return { error: "timeRange start and end must be strings" };
  }
  // Postgres casts them to timestamptz: an unreadable date would fail the query (a 500). OpenSearch
  // also takes its date math (now-7d), so only the Postgres backend needs readable dates.
  if (
    timeRange !== null &&
    typeof timeRange === "object" &&
    !isOpenSearchBackend() &&
    [(timeRange as { start: string }).start, (timeRange as { end: string }).end].some((date) =>
      Number.isNaN(Date.parse(date)),
    )
  ) {
    return { error: "timeRange start and end must be dates (ISO 8601)" };
  }
  return { size, from, roles: (roles as string[] | null) ?? undefined };
}

function parseTimeRange(timeRange: unknown): TimeFilter | null {
  if (!timeRange || timeRange === "all") return null;
  if (typeof timeRange === "string") {
    return (TIME_PRESETS as readonly string[]).includes(timeRange)
      ? { preset: timeRange as (typeof TIME_PRESETS)[number] }
      : null;
  }
  if (typeof timeRange === "object") {
    const { start, end } = timeRange as { start?: string; end?: string };
    if (start && end) return { start, end };
  }
  return null;
}

// Takes the magic filters out of the query: role:<role> and model:<name> (quoted if it has spaces)
function extractMagicFilters(query: string): { text: string; roles: string[]; models: string[] } {
  const roleRegex = new RegExp(`\\brole:(${DEFAULT_ROLES.join("|")})\\b`, "gi");
  const modelRegex = /\bmodel:([^\s"']+|"[^"]*"|'[^']+')/gi;

  const roles: string[] = [];
  const models: string[] = [];
  let text = query;

  let roleMatch;
  while ((roleMatch = roleRegex.exec(query)) !== null) {
    roles.push(roleMatch[1].toLowerCase());
    text = text.replace(roleMatch[0], "");
  }

  let modelMatch;
  while ((modelMatch = modelRegex.exec(query)) !== null) {
    let model = modelMatch[1];
    // Remove quotes if present
    if ((model.startsWith('"') && model.endsWith('"')) || (model.startsWith("'") && model.endsWith("'"))) {
      model = model.slice(1, -1);
    }
    models.push(model);
    text = text.replace(modelMatch[0], "");
  }

  return { text: text.replace(/\s+/g, " ").trim(), roles, models };
}

export function parseSearchRequest(body: Record<string, unknown>): SearchRequest | { error: string } {
  const paging = parsePagingParams(body);
  if ("error" in paging) return paging;

  const magic = extractMagicFilters((body.query as string | undefined) || "");
  if (countTerms(parseSearchQuery(magic.text)) > SEARCH_LIMITS.maxQueryTerms) {
    return { error: `query must have at most ${SEARCH_LIMITS.maxQueryTerms} words and phrases` };
  }

  // The UI sends every role when none is filtered out: only a strict subset filters
  const uiRoles = paging.roles ?? [];
  const activeRoles = new Set<string>(uiRoles.length > 0 && uiRoles.length < DEFAULT_ROLES.length ? uiRoles : []);
  magic.roles.forEach((role) => activeRoles.add(role));

  return {
    text: magic.text,
    size: paging.size,
    from: paging.from,
    roles: [...activeRoles],
    models: magic.models,
    timeRange: parseTimeRange(body.timeRange),
  };
}

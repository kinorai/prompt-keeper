import { DEFAULT_ROLES } from "@/lib/defaults";

export interface ParsedMagicQuery {
  cleanQuery: string;
  rolesFromQuery: string[];
  modelsFromQuery: string[];
}

/**
 * Parse the "magic query" syntax (`role:user`, `model:gpt-4` / `model:"quoted name"`)
 * out of a raw search string. Extracted from the search route so the OpenSearch and
 * Postgres backends interpret queries identically.
 */
export function parseMagicQuery(query: string | undefined | null): ParsedMagicQuery {
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

  return { cleanQuery, rolesFromQuery, modelsFromQuery };
}

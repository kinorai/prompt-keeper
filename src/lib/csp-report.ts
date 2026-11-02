import { CSP_REPORTS } from "@/lib/defaults";

// What a browser reports when a page breaks the Content-Security-Policy (lib/content-security-policy.ts),
// in either format: a Reporting API batch (report-to, application/reports+json: a list of
// { type: "csp-violation", url, user_agent, body }) or one legacy report (report-uri,
// application/csp-report: { "csp-report": {...} }). MDN: "CSPViolationReport", "Content-Security-Policy:
// report-uri directive".
//
// A report is attacker-controlled and its URLs can hold a search (the search page keeps its query in the
// URL): every URL keeps its origin and path only. The script sample and the referrer are dropped.

const MAX_TEXT = 200;
const DIRECTIVE = /^[a-z-]{1,40}$/;

export interface CspViolation {
  // The directive it broke, e.g. img-src or script-src-elem
  directive: string;
  // What was blocked: an origin and path, a scheme (data, chrome-extension) or a keyword (inline, eval)
  blocked?: string;
  // The page it happened on
  document?: string;
  // The script that did it, and where in it
  source?: string;
  line?: number;
  column?: number;
  // "report" while the policy is Report-Only, "enforce" after
  disposition?: "report" | "enforce";
  userAgent?: string;
  // Which way it came
  via: "report-to" | "report-uri";
}

export type ReportBody = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

/**
 * A request's JSON, read no further than CSP_REPORTS.maxBodyBytes: a route handler has no body limit of
 * its own short of the 100 MB next.config.ts allows.
 */
export async function readReportBody(request: Request): Promise<ReportBody> {
  const max = CSP_REPORTS.maxBodyBytes;
  if (Number(request.headers.get("content-length")) > max) return { ok: false, status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) };
  } catch {
    return { ok: false, status: 400 };
  }
}

const whole = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value.slice(0, MAX_TEXT) : undefined);

/**
 * A reported URL without its query, fragment or credentials. A URL that isn't http(s) keeps its scheme
 * only (data, chrome-extension), as the spec sends it; a keyword (inline, eval) stays as is.
 */
export function cleanReportUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (URL.canParse(value)) {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return url.protocol.slice(0, -1).slice(0, MAX_TEXT);
    return `${url.origin}${url.pathname}`.slice(0, MAX_TEXT);
  }
  return text(value.split(/[?#]/)[0]);
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function violation(via: CspViolation["via"], fields: Record<string, unknown>): CspViolation | null {
  if (typeof fields.directive !== "string" || !DIRECTIVE.test(fields.directive)) return null;
  // Fields left undefined don't reach the log line: pino drops them, as JSON does
  return {
    directive: fields.directive,
    blocked: cleanReportUrl(fields.blocked),
    document: cleanReportUrl(fields.document),
    source: cleanReportUrl(fields.source),
    line: whole(fields.line),
    column: whole(fields.column),
    disposition: fields.disposition === "report" || fields.disposition === "enforce" ? fields.disposition : undefined,
    userAgent: text(fields.userAgent),
    via,
  };
}

/**
 * The violations in a report body, cleaned, at most CSP_REPORTS.maxViolationsPerBatch; null if it is
 * neither format. Reports of other types in a batch are skipped. A legacy report carries no user agent:
 * `userAgent` is the request's.
 */
export function parseCspReport(body: unknown, userAgent?: string | null): CspViolation[] | null {
  if (Array.isArray(body))
    return body.slice(0, CSP_REPORTS.maxViolationsPerBatch).flatMap((entry) => {
      const report = record(entry);
      const fields = record(report?.body);
      if (report?.type !== "csp-violation" || !fields) return [];
      const found = violation("report-to", {
        directive: fields.effectiveDirective,
        blocked: fields.blockedURL,
        document: fields.documentURL ?? report.url,
        source: fields.sourceFile,
        line: fields.lineNumber,
        column: fields.columnNumber,
        disposition: fields.disposition,
        userAgent: report.user_agent,
      });
      return found ? [found] : [];
    });
  const legacy = record(record(body)?.["csp-report"]);
  if (!legacy) return null;
  const found = violation("report-uri", {
    // CSP Level 2 browsers send no effective-directive, and the whole directive in violated-directive
    // ("img-src 'self'"): its name is the first word
    directive:
      legacy["effective-directive"] ??
      (typeof legacy["violated-directive"] === "string" ? legacy["violated-directive"].split(" ")[0] : undefined),
    blocked: legacy["blocked-uri"],
    document: legacy["document-uri"],
    source: legacy["source-file"],
    line: legacy["line-number"],
    column: legacy["column-number"],
    disposition: legacy.disposition,
    userAgent,
  });
  return found ? [found] : [];
}

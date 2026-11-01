import { createLogger } from "@/lib/logger";
import { parseCspReport, readReportBody } from "@/lib/csp-report";
import { CSP_REPORTS } from "@/lib/defaults";
import rateLimit from "@/lib/rate-limit";

const log = createLogger("api:csp-report");

// One window for all browsers: the endpoint needs no sign-in, and an IP behind the reverse proxy is not
// one this route can trust
const limiter = rateLimit(CSP_REPORTS.rateLimit);

/**
 * Where browsers report what the Content-Security-Policy would block (lib/content-security-policy.ts): a
 * Reporting API batch or one legacy report, as JSON. No sign-in: the login page reports too, so the proxy
 * lets it through. Past the rate limit a report is dropped unread, still with 204. Never 410: it tells the
 * browser to drop the endpoint.
 */
export async function POST(request: Request) {
  if (limiter.check("all").isRateLimited) return new Response(null, { status: 204 });
  const body = await readReportBody(request);
  if (!body.ok) return new Response(null, { status: body.status });
  const violations = parseCspReport(body.value, request.headers.get("user-agent"));
  if (!violations) return new Response(null, { status: 400 });
  for (const violation of violations) log.warn(violation, `CSP violation: ${violation.directive}`);
  return new Response(null, { status: 204 });
}

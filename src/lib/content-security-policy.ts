import { CSP_REPORTS } from "@/lib/defaults";

// The Content-Security-Policy, sent as Content-Security-Policy-Report-Only by the proxy on every
// response it passes on: browsers report what it would block to POST /api/csp-report, and block
// nothing yet. The proxy builds it per request, not next.config.ts headers(), because the image
// host comes from S3_ENDPOINT at runtime and headers() is fixed when the image is built.
//
// No nonces: they force every page to render per request (Next.js docs, "Content Security
// Policy", Without Nonces). So scripts and styles allow 'unsafe-inline', and 'unsafe-eval' in
// development only (React's dev server error stacks).
//
// Reports go two ways, as MDN advises while support differs: report-to names an endpoint from the
// Reporting-Endpoints header (Chrome, Safari 16.4+, Firefox 149+, batched as
// application/reports+json), and report-uri serves older browsers (one application/csp-report
// each). A browser that supports report-to ignores report-uri, so nothing comes twice.

export interface CspEnv {
  NODE_ENV?: string;
  S3_ENDPOINT?: string;
  S3_BUCKET_NAME?: string;
  S3_FORCE_PATH_STYLE?: string;
}

/**
 * The origin of the presigned image URLs (lib/s3.ts): the S3 endpoint's, or with virtual-hosted
 * style its bucket subdomain (not on an IP endpoint). Null without an http(s) endpoint.
 */
export function s3ImageOrigin(env: CspEnv): string | null {
  if (!env.S3_ENDPOINT || !URL.canParse(env.S3_ENDPOINT)) return null;
  const endpoint = new URL(env.S3_ENDPOINT);
  if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null;
  // The AWS SDK falls back to path style on an IP endpoint: a bucket can't be a subdomain of an IP
  const ip = /^\d+\.\d+\.\d+\.\d+$/.test(endpoint.hostname) || endpoint.hostname.startsWith("[");
  if (env.S3_FORCE_PATH_STYLE === "true" || !env.S3_BUCKET_NAME || ip) return endpoint.origin;
  return `${endpoint.protocol}//${env.S3_BUCKET_NAME}.${endpoint.host}`;
}

/** The policy, one line. */
export function contentSecurityPolicy(env: CspEnv = process.env): string {
  const dev = env.NODE_ENV === "development";
  const s3 = s3ImageOrigin(env);
  const directives = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    // data: for images pasted into chats, the S3 origin for uploaded ones (presigned by /api/search).
    // Markdown images are only data: or same-origin (lib/markdown.ts).
    ["img-src", "'self'", "data:", "blob:", ...(s3 ? [s3] : [])],
    // next/font serves Geist from our own origin; KaTeX's fonts are bundled with its CSS.
    ["font-src", "'self'", "data:"],
    // The browser only calls our API; LiteLLM and S3 uploads are reached from the server.
    ["connect-src", "'self'"],
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["object-src", "'none'"],
    ["worker-src", "'self'"],
    ["manifest-src", "'self'"],
    ["report-uri", CSP_REPORTS.path],
    ["report-to", CSP_REPORTS.endpointName],
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/** The headers the proxy sets on every response. */
export function securityHeaders(env: CspEnv = process.env): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(env) },
    // A path: the Reporting API resolves it against the page's URL
    { key: "Reporting-Endpoints", value: `${CSP_REPORTS.endpointName}="${CSP_REPORTS.path}"` },
  ];
}

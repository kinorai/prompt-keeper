// Headers never passed on to LiteLLM: the hop-by-hop ones, and credentials meant for Prompt Keeper
// or the proxies in front of it. LiteLLM reads its key from Authorization or x-litellm-api-key; the
// session cookie, the Prompt Keeper API key and the Cloudflare Access JWT would only leak into its
// logs and callbacks.
const SKIP_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "content-encoding",
  "cookie",
  "x-prompt-keeper-api-key",
  "proxy-authorization",
  "cf-access-jwt-assertion",
];

export function liteLLMHeaders(headers: Headers): Headers {
  const forwardHeaders = new Headers(headers);
  SKIP_HEADERS.forEach((header) => forwardHeaders.delete(header));
  return forwardHeaders;
}

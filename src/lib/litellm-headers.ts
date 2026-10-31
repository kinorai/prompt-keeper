// Headers never passed on to LiteLLM: the hop-by-hop ones, and Prompt Keeper's own credentials.
// LiteLLM reads its key from Authorization or x-litellm-api-key; the session cookie and the
// Prompt Keeper API key would only leak into its logs and callbacks.
const SKIP_HEADERS = [
  "host",
  "domain",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "content-encoding",
  "cookie",
  "x-prompt-keeper-api-key",
];

export function liteLLMHeaders(headers: Headers): Headers {
  const forwardHeaders = new Headers(headers);
  SKIP_HEADERS.forEach((header) => forwardHeaders.delete(header));
  return forwardHeaders;
}

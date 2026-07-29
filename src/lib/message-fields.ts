/**
 * The set of fields a chat message can carry, used to detect when an upstream provider starts
 * sending something we do not model yet.
 *
 * Sources, in order of authority for this proxy:
 *  - litellm/types/utils.py, `class Message` / `class Delta` — LiteLLM normalizes every provider
 *    into this shape, so it is the actual contract we receive.
 *  - openai/openai-openapi (openapi.json) — the canonical OpenAI chat schema.
 *
 * Adding a field here is a statement that we handle it. Anything absent is counted and logged
 * by collectUnknownFields so it shows up in monitoring instead of being silently dropped.
 */
export const KNOWN_MESSAGE_FIELDS: ReadonlySet<string> = new Set([
  // Core
  "role",
  "content",
  "name",
  // Tool calling, including the deprecated function_call form
  "tool_calls",
  "tool_call_id",
  "function_call",
  // Reasoning (LiteLLM-standardized)
  "reasoning_content",
  "thinking_blocks",
  "reasoning_items",
  // Other LiteLLM Message fields
  "annotations",
  "audio",
  "images",
  "provider_specific_fields",
  // OpenAI assistant fields
  "refusal",
  // Anthropic prompt-caching marker, passed straight through by some clients
  "cache_control",
]);

/**
 * `type` values a content part can have. Text and image_url are rendered; the rest are recorded
 * so a payload we cannot render yet is still visible rather than blank.
 */
export const KNOWN_CONTENT_PART_TYPES: ReadonlySet<string> = new Set([
  "text",
  "image_url",
  "input_audio",
  "file",
  "refusal",
  // Anthropic-native blocks, seen when a client bypasses the OpenAI translation
  "thinking",
  "redacted_thinking",
  "tool_use",
  "tool_result",
]);

export interface UnknownFields {
  fields: string[];
  partTypes: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Report message keys and content-part types that are not in the known sets above. */
export function collectUnknownFields(message: unknown): UnknownFields {
  if (!isRecord(message)) return { fields: [], partTypes: [] };

  const fields = Object.keys(message).filter((key) => !KNOWN_MESSAGE_FIELDS.has(key));

  const partTypes = Array.isArray(message.content)
    ? Array.from(
        new Set(
          message.content
            .filter(isRecord)
            .map((part) => part.type)
            .filter((type): type is string => typeof type === "string" && !KNOWN_CONTENT_PART_TYPES.has(type)),
        ),
      )
    : [];

  return { fields, partTypes };
}

/**
 * Request-body fields worth keeping alongside a conversation: what the model was offered and how
 * it was configured, so a logged turn can be reproduced.
 *
 * An allowlist rather than a deny-list on purpose. LiteLLM accepts per-request credentials in the
 * body (api_key, aws_secret_access_key, vertex_credentials, azure_ad_token), and anything not
 * named here would otherwise be persisted verbatim — and end up in database backups.
 */
export const PERSISTED_REQUEST_PARAMS: ReadonlySet<string> = new Set([
  "model",
  // What the model could call, and whether it was forced to
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  // Sampling and limits
  "temperature",
  "top_p",
  "top_k",
  "max_tokens",
  "max_completion_tokens",
  "frequency_penalty",
  "presence_penalty",
  "repetition_penalty",
  "seed",
  "stop",
  "n",
  // Output shape
  "response_format",
  "modalities",
  "prediction",
  "reasoning_effort",
  "thinking",
  "web_search_options",
  // Transport
  "stream",
  "stream_options",
  "service_tier",
  "logprobs",
  "top_logprobs",
]);

/** Keep only the allowlisted request params, dropping credentials and client-specific extras. */
export function pickRequestParams(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => PERSISTED_REQUEST_PARAMS.has(key)));
}

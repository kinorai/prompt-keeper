import type { Conversation, Message } from "@prisma/client";

// A conversation as search results carry it: the OpenSearch document the outbox worker indexes,
// and the `_source` the Postgres backend returns, so the UI reads one shape from either backend
export function toSearchDocument(convo: Conversation, messages: Omit<Message, "searchWords" | "searchLong">[]) {
  return {
    model: convo.model,
    messages: messages.map((m) => {
      let content = m.content;
      let multimodal_content = undefined;

      // Handle multimodal content (array)
      if (Array.isArray(m.content)) {
        // Extract text for the main content field (to satisfy text mapping)
        content = (m.content as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === "text")
          .map((c) => c.text || "")
          .join("\n");
        // Store full structure in a new field
        multimodal_content = m.content;
      }

      return {
        role: m.role,
        content: content,
        multimodal_content,
        tool_calls: m.toolCalls ?? undefined,
        tool_call_id: m.toolCallId ?? undefined,
        name: m.name ?? undefined,
        reasoning_content: m.reasoningContent ?? undefined,
        thinking_blocks: m.thinkingBlocks ?? undefined,
        annotations: m.annotations ?? undefined,
        audio: m.audio ?? undefined,
        images: m.images ?? undefined,
        refusal: m.refusal ?? undefined,
      };
    }),
    usage: {
      prompt_tokens: convo.promptTokens ?? 0,
      completion_tokens: convo.completionTokens ?? 0,
      total_tokens: convo.totalTokens ?? 0,
    },
    latency: convo.latencyMs ?? 0,
    conversation_hash: convo.conversationHash ?? null,
    created_at: convo.createdAt,
    updated_at: convo.updatedAt,
  } as const;
}

export type SearchDocument = ReturnType<typeof toSearchDocument>;

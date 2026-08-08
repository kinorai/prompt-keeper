import type { Conversation, Message } from "@prisma/client";

/**
 * Shape a conversation + its messages into the document form the UI consumes
 * (and the outbox worker indexes into OpenSearch). Multimodal content arrays are
 * flattened to their text parts for `content`, with the full structure preserved
 * in `multimodal_content`.
 */
export function buildConversationDoc(convo: Conversation, messages: Message[]) {
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

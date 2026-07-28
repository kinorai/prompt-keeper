import type { Role } from "@/lib/defaults";

export interface ConversationToolCall {
  id?: string;
  function?: { name?: string };
  custom?: { name?: string };
}

export interface ConversationMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | null;
  finish_reason?: string;
  tool_calls?: ConversationToolCall[];
  tool_call_id?: string;
  name?: string;
}

export const formatPayloadSize = (text: string) => {
  const kb = text.length / 1024;
  return kb < 1 ? `${text.length} B` : `${kb.toFixed(1)} KB`;
};

const toolCallName = (call: ConversationToolCall) => call.function?.name || call.custom?.name || "tool";

const toolNamesByCallId = (messages: ConversationMessage[]) => {
  const names = new Map<string, string>();
  messages.forEach((message) =>
    message.tool_calls?.forEach((call) => {
      if (call.id) names.set(call.id, toolCallName(call));
    }),
  );
  return names;
};

// Tool payloads run to tens of kilobytes; a copied conversation keeps the call, not the haystack
const summarizeForExport = (message: ConversationMessage, toolNames: Map<string, string>) => {
  const text = extractTextFromContent(message.content);

  // `function` is the deprecated role for a tool result and still shows up in older logs
  if (message.role === "tool" || message.role === "function") {
    const name = (message.tool_call_id && toolNames.get(message.tool_call_id)) || message.name || "tool result";
    return `[${name} → ${formatPayloadSize(text)} omitted]`;
  }

  const calls = message.tool_calls?.map(toolCallName).join(", ");
  if (!calls) return text;
  return text ? `${text}\n\n[called ${calls}]` : `[called ${calls}]`;
};

export const extractTextFromContent = (content: ConversationMessage["content"]): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("\n");
  }
  return "";
};

export const buildConversationPlainText = (messages: ConversationMessage[]) => {
  const toolNames = toolNamesByCallId(messages);
  return messages.map((m) => `${m.role.toUpperCase()}: ${summarizeForExport(m, toolNames)}`).join("\n\n");
};

export const buildConversationMarkdown = (args: {
  model: string;
  created_at: Date | string;
  messages: ConversationMessage[];
}) => {
  const createdDate = typeof args.created_at === "string" ? new Date(args.created_at) : args.created_at;
  const header = `# Conversation with ${args.model}\n\nDate: ${createdDate.toLocaleString()}\n\n---\n\n`;
  const toolNames = toolNamesByCallId(args.messages);
  const body = args.messages
    .map((m) => `### ${m.role.toUpperCase()}\n\n${summarizeForExport(m, toolNames)}\n\n`)
    .join("");

  return header + body;
};

export const isAllowedRole = (role: string, allowed: readonly string[]): role is Role => allowed.includes(role as Role);

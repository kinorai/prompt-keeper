import type { Message, ToolCall } from "@/components/search/conversation-card";
import { extractTextFromContent, formatPayloadSize } from "@/lib/conversation";

export interface ToolInvocation {
  key: string;
  name: string;
  args?: string;
  result?: string;
  highlightedResult?: string;
}

type RenderItem = { kind: "message"; message: Message } | { kind: "tools"; invocations: ToolInvocation[] };

// Helpers

export const tryParseJson = (text?: string): unknown => {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const formatValue = (value: unknown) => (typeof value === "string" ? value : (JSON.stringify(value) ?? ""));

export const summarizeArgs = (args?: string) => {
  if (!args) return "";
  const parsed = tryParseJson(args);

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 1) return formatValue(entries[0][1]);
    return entries.map(([key, value]) => `${key}=${formatValue(value)}`).join(" · ");
  }

  return args.replace(/\s+/g, " ").trim();
};

// Prefer a meaningful count over a byte size: `{"results": [...]}` reads better as "10 results"
export const summarizeResult = (result?: string) => {
  if (result === undefined) return "no result";
  if (!result.trim()) return "empty";

  const parsed = tryParseJson(result);
  if (Array.isArray(parsed)) return `${parsed.length} items`;

  if (parsed && typeof parsed === "object") {
    const entries = Object.entries(parsed as Record<string, unknown>);
    const [firstKey, firstValue] = entries[0] ?? [];
    if (entries.length === 1 && Array.isArray(firstValue)) return `${firstValue.length} ${firstKey}`;
  }

  return formatPayloadSize(result);
};

export const prettify = (text: string) => {
  const parsed = tryParseJson(text);
  return parsed === undefined ? text : JSON.stringify(parsed, null, 2);
};

const nameOf = (call?: ToolCall, result?: Message) =>
  call?.function?.name || call?.custom?.name || result?.name || "tool result";

const argsOf = (call?: ToolCall) => call?.function?.arguments || call?.custom?.input;

const toInvocation = (key: string, call?: ToolCall, result?: Message): ToolInvocation => ({
  key,
  name: nameOf(call, result),
  args: argsOf(call),
  result: result ? extractTextFromContent(result.content) : undefined,
  highlightedResult: result?.highlightedContent,
});

// `function` is the deprecated role for a tool result and still shows up in older logs
const isToolResult = (message: Message) => message.role === "tool" || message.role === "function";

// An assistant turn that only called tools has nothing left to put in a bubble
const isRenderableMessage = (message: Message) => {
  if (message.role !== "assistant") return true;
  if (message.highlightedContent || message.reasoning_content) return true;
  // Payloads other than text are rendered by MessageExtras, so a turn carrying only one of
  // these still has something to show
  if (message.refusal || message.audio) return true;
  if (message.images?.length || message.annotations?.length) return true;
  return extractTextFromContent(message.content).trim().length > 0;
};

/**
 * Flatten a message list into render items, pairing each assistant tool call with its
 * `role: "tool"` result via `tool_call_id`. Results that cannot be paired (conversations
 * logged before tool fields were persisted) are kept as standalone invocations.
 */
export const buildRenderItems = (messages: Message[]): RenderItem[] => {
  const resultsByCallId = new Map<string, Message>();
  messages.forEach((message) => {
    if (isToolResult(message) && message.tool_call_id) resultsByCallId.set(message.tool_call_id, message);
  });

  // Resolve pairing up front: a result can appear before the assistant turn that called it, and
  // walking in document order would then render it twice — once orphaned, once resolved.
  const paired = new Set<Message>();
  messages.forEach((message) => {
    (message.tool_calls ?? []).forEach((call) => {
      const result = call.id ? resultsByCallId.get(call.id) : undefined;
      if (result) paired.add(result);
    });
  });
  const items: RenderItem[] = [];

  const pushInvocations = (invocations: ToolInvocation[]) => {
    const last = items[items.length - 1];
    if (last?.kind === "tools") last.invocations.push(...invocations);
    else items.push({ kind: "tools", invocations });
  };

  messages.forEach((message, index) => {
    if (isToolResult(message)) {
      if (!paired.has(message)) pushInvocations([toInvocation(`orphan-${index}`, undefined, message)]);
      return;
    }

    const calls = message.tool_calls ?? [];
    if (calls.length > 0) {
      pushInvocations(
        calls.map((call, callIndex) =>
          toInvocation(`${index}-${callIndex}`, call, call.id ? resultsByCallId.get(call.id) : undefined),
        ),
      );
    }

    if (isRenderableMessage(message)) items.push({ kind: "message", message });
  });

  return items;
};

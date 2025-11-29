import type { Role } from "@/lib/defaults";

export interface ConversationMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  finish_reason?: string;
}

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

export const buildConversationPlainText = (messages: ConversationMessage[]) =>
  messages.map((m) => `${m.role.toUpperCase()}: ${extractTextFromContent(m.content)}`).join("\n\n");

export const buildConversationMarkdown = (args: {
  model: string;
  created_at: Date | string;
  messages: ConversationMessage[];
}) => {
  const createdDate = typeof args.created_at === "string" ? new Date(args.created_at) : args.created_at;
  const header = `# Conversation with ${args.model}\n\nDate: ${createdDate.toLocaleString()}\n\n---\n\n`;
  const body = args.messages
    .map((m) => `### ${m.role.toUpperCase()}\n\n${extractTextFromContent(m.content)}\n\n`)
    .join("");

  return header + body;
};

export const isAllowedRole = (role: string, allowed: readonly string[]): role is Role => allowed.includes(role as Role);

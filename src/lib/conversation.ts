import type { Role } from "@/lib/defaults";

export interface ConversationMessage {
  role: string;
  content: string;
  finish_reason?: string;
}

export const buildConversationPlainText = (messages: ConversationMessage[]) =>
  messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

export const buildConversationMarkdown = (args: {
  model: string;
  created: Date | string;
  messages: ConversationMessage[];
}) => {
  const createdDate = typeof args.created === "string" ? new Date(args.created) : args.created;
  const header = `# Conversation with ${args.model}\n\nDate: ${createdDate.toLocaleString()}\n\n---\n\n`;
  const body = args.messages.map((m) => `### ${m.role.toUpperCase()}\n\n${m.content}\n\n`).join("");
  return header + body;
};

export const isAllowedRole = (role: string, allowed: readonly string[]): role is Role => allowed.includes(role as Role);

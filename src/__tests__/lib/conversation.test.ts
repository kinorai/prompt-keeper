import { buildConversationMarkdown, buildConversationPlainText, formatPayloadSize } from "@/lib/conversation";

const messages = [
  { role: "user", content: "what are kraken fees" },
  {
    role: "assistant",
    content: null,
    tool_calls: [{ id: "call_1", function: { name: "web_search" } }],
  },
  { role: "tool", tool_call_id: "call_1", content: "x".repeat(4096) },
  { role: "assistant", content: "Use a post-only limit order." },
];

describe("conversation export helpers", () => {
  it("replaces tool payloads with a one-line placeholder", () => {
    const text = buildConversationPlainText(messages);

    expect(text).toContain("TOOL: [web_search → 4.0 KB omitted]");
    expect(text).not.toContain("xxxx");
  });

  it("names the tool call on an assistant turn that has no text", () => {
    expect(buildConversationPlainText(messages)).toContain("ASSISTANT: [called web_search]");
  });

  it("falls back to the tool message name when the call cannot be paired", () => {
    const orphan = [{ role: "tool", name: "fetch_url", content: "body" }];

    expect(buildConversationPlainText(orphan)).toContain("TOOL: [fetch_url → 4 B omitted]");
  });

  it("keeps placeholders in the shareable markdown", () => {
    const markdown = buildConversationMarkdown({ model: "gpt-4", created_at: new Date(0), messages });

    expect(markdown).toContain("[web_search → 4.0 KB omitted]");
    expect(markdown).toContain("Use a post-only limit order.");
  });

  it("formats payload sizes in bytes below one kilobyte", () => {
    expect(formatPayloadSize("abc")).toBe("3 B");
    expect(formatPayloadSize("x".repeat(2048))).toBe("2.0 KB");
  });
});

import { buildRenderItems } from "@/lib/tool-calls";
import type { Message } from "@/components/search/conversation-card";

describe("buildRenderItems", () => {
  it("pairs each tool result with the call that produced it", () => {
    const messages: Message[] = [
      { role: "user", content: "what are kraken fees" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "web_search", arguments: '{"query":"fees"}' } },
          { id: "call_2", type: "function", function: { name: "fetch_url", arguments: '{"url":"kraken.com"}' } },
        ],
      },
      { role: "tool", tool_call_id: "call_2", content: "fee schedule" },
      { role: "tool", tool_call_id: "call_1", content: '{"results":[1,2,3]}' },
      { role: "assistant", content: "Use a post-only limit order." },
    ];

    const items = buildRenderItems(messages);

    // user bubble, one tool strip, assistant bubble — the empty assistant turn is dropped
    expect(items.map((item) => item.kind)).toEqual(["message", "tools", "message"]);

    const strip = items[1];
    if (strip.kind !== "tools") throw new Error("expected a tool strip");

    expect(strip.invocations.map((invocation) => invocation.name)).toEqual(["web_search", "fetch_url"]);
    expect(strip.invocations[0].result).toBe('{"results":[1,2,3]}');
    expect(strip.invocations[1].result).toBe("fee schedule");
  });

  it("keeps unpairable results from conversations logged before tool fields existed", () => {
    const messages: Message[] = [
      { role: "user", content: "search" },
      { role: "assistant", content: "" },
      { role: "tool", content: "first payload" },
      { role: "tool", content: "second payload" },
      { role: "assistant", content: "done" },
    ];

    const items = buildRenderItems(messages);
    const strip = items[1];
    if (strip.kind !== "tools") throw new Error("expected a tool strip");

    // Consecutive orphans collapse into a single strip rather than one strip each
    expect(items.map((item) => item.kind)).toEqual(["message", "tools", "message"]);
    expect(strip.invocations).toHaveLength(2);
    expect(strip.invocations[0].name).toBe("tool result");
  });

  it("keeps an assistant turn that has both text and tool calls", () => {
    const messages: Message[] = [
      {
        role: "assistant",
        content: "Let me look that up.",
        tool_calls: [{ id: "call_1", function: { name: "web_search", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "result" },
    ];

    expect(buildRenderItems(messages).map((item) => item.kind)).toEqual(["tools", "message"]);
  });

  it("keeps an assistant turn whose only payload is reasoning", () => {
    const messages: Message[] = [{ role: "assistant", content: "", reasoning_content: "thinking out loud" }];

    expect(buildRenderItems(messages).map((item) => item.kind)).toEqual(["message"]);
  });

  it("keeps an assistant turn whose only payload is a refusal", () => {
    const messages: Message[] = [{ role: "assistant", content: "", refusal: "I can't help with that." }];

    expect(buildRenderItems(messages).map((item) => item.kind)).toEqual(["message"]);
  });

  it("keeps an assistant turn whose only payload is citations or audio", () => {
    const withCitations: Message[] = [
      { role: "assistant", content: "", annotations: [{ type: "url_citation", url_citation: { url: "https://x" } }] },
    ];
    const withAudio: Message[] = [{ role: "assistant", content: "", audio: { transcript: "spoken" } }];

    expect(buildRenderItems(withCitations).map((i) => i.kind)).toEqual(["message"]);
    expect(buildRenderItems(withAudio).map((i) => i.kind)).toEqual(["message"]);
  });

  it("does not render a result twice when it precedes the call that produced it", () => {
    const messages: Message[] = [
      // Out of order on purpose: the result arrives before the assistant turn
      { role: "tool", tool_call_id: "call_1", content: "result" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", function: { name: "web_search", arguments: "{}" } }],
      },
    ];

    const items = buildRenderItems(messages);
    const invocations = items.flatMap((item) => (item.kind === "tools" ? item.invocations : []));

    expect(invocations).toHaveLength(1);
    expect(invocations[0].name).toBe("web_search");
    expect(invocations[0].result).toBe("result");
  });
});

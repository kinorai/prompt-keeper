import { collectUnknownFields, KNOWN_MESSAGE_FIELDS } from "@/lib/message-fields";
import { incrementCounter, renderMetrics, resetMetrics } from "@/lib/metrics";

describe("collectUnknownFields", () => {
  it("reports nothing for a message built only from known fields", () => {
    const message = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "web_search", arguments: "{}" } }],
      reasoning_content: "thinking",
      annotations: [],
      refusal: null,
    };

    expect(collectUnknownFields(message)).toEqual({ fields: [], partTypes: [] });
  });

  it("reports a field a provider added that we do not model", () => {
    const message = { role: "assistant", content: "hi", some_new_provider_field: { a: 1 } };

    expect(collectUnknownFields(message).fields).toEqual(["some_new_provider_field"]);
  });

  it("reports unknown content part types and de-duplicates them", () => {
    const message = {
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "video_url", video_url: { url: "https://example.com/a.mp4" } },
        { type: "video_url", video_url: { url: "https://example.com/b.mp4" } },
        { type: "input_audio", input_audio: { data: "…", format: "wav" } },
      ],
    };

    // input_audio is known, video_url is not
    expect(collectUnknownFields(message).partTypes).toEqual(["video_url"]);
  });

  it("covers every field LiteLLM's Message class can carry", () => {
    // From litellm/types/utils.py, class Message
    const litellmMessageFields = [
      "content",
      "role",
      "tool_calls",
      "function_call",
      "audio",
      "images",
      "reasoning_content",
      "thinking_blocks",
      "reasoning_items",
      "provider_specific_fields",
      "annotations",
    ];

    expect(litellmMessageFields.filter((field) => !KNOWN_MESSAGE_FIELDS.has(field))).toEqual([]);
  });

  it("tolerates a message that is not an object", () => {
    expect(collectUnknownFields(null)).toEqual({ fields: [], partTypes: [] });
    expect(collectUnknownFields("nope")).toEqual({ fields: [], partTypes: [] });
  });
});

describe("metrics", () => {
  beforeEach(() => resetMetrics());

  it("exposes counters in the Prometheus text format", () => {
    incrementCounter("promptkeeper_unknown_message_fields_total", { scope: "field", field: "video_tokens" });
    incrementCounter("promptkeeper_unknown_message_fields_total", { scope: "field", field: "video_tokens" });
    incrementCounter("promptkeeper_unknown_message_fields_total", { scope: "content_part", field: "video_url" });

    const output = renderMetrics();

    expect(output).toContain("# TYPE promptkeeper_unknown_message_fields_total counter");
    expect(output).toContain('promptkeeper_unknown_message_fields_total{field="video_tokens",scope="field"} 2');
    expect(output).toContain('promptkeeper_unknown_message_fields_total{field="video_url",scope="content_part"} 1');
  });

  it("escapes label values", () => {
    incrementCounter("promptkeeper_unknown_message_fields_total", { scope: "field", field: 'we"ird' });

    expect(renderMetrics()).toContain('field="we\\"ird"');
  });

  it("renders nothing when no counter has been touched", () => {
    expect(renderMetrics()).toBe("");
  });
});

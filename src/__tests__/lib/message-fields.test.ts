import { collectUnknownFields, KNOWN_MESSAGE_FIELDS, pickRequestParams } from "@/lib/message-fields";

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

describe("pickRequestParams", () => {
  it("keeps what a turn needs to be reproducible", () => {
    const kept = pickRequestParams({
      model: "gpt-4",
      tools: [{ type: "function" }],
      tool_choice: "auto",
      temperature: 0.2,
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(kept).toEqual({
      model: "gpt-4",
      tools: [{ type: "function" }],
      tool_choice: "auto",
      temperature: 0.2,
      stream: true,
    });
  });

  it("drops credentials a client may authenticate with per request", () => {
    const kept = pickRequestParams({
      model: "gpt-4",
      api_key: "sk-secret",
      aws_access_key_id: "AKIA…",
      aws_secret_access_key: "secret",
      vertex_credentials: { private_key: "…" },
      azure_ad_token: "token",
      user: "user-42",
      metadata: { chat_id: "abc" },
    });

    expect(kept).toEqual({ model: "gpt-4" });
  });
});

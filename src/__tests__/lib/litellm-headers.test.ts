import { liteLLMHeaders } from "@/lib/litellm-headers";
import { API_KEY_HEADER } from "@/lib/request-auth";

jest.mock("@/lib/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));

describe("liteLLMHeaders", () => {
  it("drops Prompt Keeper's own credentials and keeps LiteLLM's", () => {
    const headers = liteLLMHeaders(
      new Headers({
        cookie: "better-auth.session_token=abc",
        [API_KEY_HEADER]: "pk-key",
        authorization: "Bearer sk-litellm",
        "x-litellm-api-key": "sk-litellm",
        "content-type": "application/json",
        host: "prompt-keeper.example",
      }),
    );

    expect(headers.get("cookie")).toBeNull();
    expect(headers.get(API_KEY_HEADER)).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("authorization")).toBe("Bearer sk-litellm");
    expect(headers.get("x-litellm-api-key")).toBe("sk-litellm");
    expect(headers.get("content-type")).toBe("application/json");
  });
});

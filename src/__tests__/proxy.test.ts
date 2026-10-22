import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { auth } from "@/lib/auth";

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

const getSession = auth.api.getSession as unknown as jest.Mock;

const FORGED_COOKIE = "better-auth.session_token=forged";
const VALID_SESSION = { session: { id: "session" }, user: { id: "user" } };

const request = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3000${path}`, init);

// NextResponse.next() carries this header; a redirect or a 401 does not
const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

describe("proxy", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(null);
  });

  describe("API routes", () => {
    it.each([
      ["POST", "/api/search"],
      ["DELETE", "/api/search/some-id"],
    ])("rejects %s %s with a forged session cookie", async (method, path) => {
      const response = await proxy(request(path, { method, headers: { cookie: FORGED_COOKIE } }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
      expect(getSession).toHaveBeenCalled();
    });

    it("rejects a forged __Secure- session cookie", async () => {
      const response = await proxy(
        request("/api/search", { method: "POST", headers: { cookie: "__Secure-better-auth.session_token=forged" } }),
      );

      expect(response.status).toBe(401);
    });

    it("rejects a request with no credentials", async () => {
      const response = await proxy(request("/api/search", { method: "POST" }));

      expect(response.status).toBe(401);
    });

    it("rejects a session lookup that throws", async () => {
      getSession.mockRejectedValue(new Error("database down"));

      const response = await proxy(request("/api/search", { method: "POST", headers: { cookie: FORGED_COOKIE } }));

      expect(response.status).toBe(401);
    });

    it("lets a validated session through", async () => {
      getSession.mockResolvedValue(VALID_SESSION);

      const response = await proxy(request("/api/search", { method: "POST", headers: { cookie: FORGED_COOKIE } }));

      expect(passedThrough(response)).toBe(true);
    });

    it("lets the configured API key through without a session lookup", async () => {
      const response = await proxy(
        request("/api/search", { method: "POST", headers: { "X-Prompt-Keeper-API-Key": "test-api-key" } }),
      );

      expect(passedThrough(response)).toBe(true);
      expect(getSession).not.toHaveBeenCalled();
    });

    it("never accepts the .env.example placeholder API key", async () => {
      const configured = process.env.PROMPT_KEEPER_API_KEY;
      process.env.PROMPT_KEEPER_API_KEY = "change-me";
      try {
        const response = await proxy(
          request("/api/search", { method: "POST", headers: { "X-Prompt-Keeper-API-Key": "change-me" } }),
        );

        expect(response.status).toBe(401);
      } finally {
        process.env.PROMPT_KEEPER_API_KEY = configured;
      }
    });

    it("rejects a wrong API key", async () => {
      const response = await proxy(
        request("/api/search", { method: "POST", headers: { "X-Prompt-Keeper-API-Key": "test-api-kez" } }),
      );

      expect(response.status).toBe(401);
    });

    it.each(["/api/chat/completions", "/api/completions", "/api/models"])(
      "passes LiteLLM route %s through for LiteLLM to authenticate",
      async (path) => {
        const response = await proxy(request(path, { method: "POST" }));

        expect(passedThrough(response)).toBe(true);
        expect(getSession).not.toHaveBeenCalled();
      },
    );

    it.each(["/api/auth/sign-in/email", "/api/healthz", "/api/readyz", "/api/livez"])(
      "keeps public path %s public",
      async (path) => {
        const response = await proxy(request(path));

        expect(passedThrough(response)).toBe(true);
      },
    );

    it("does not treat /api/auth-prefixed lookalikes as public", async () => {
      const response = await proxy(request("/api/authx", { headers: { cookie: FORGED_COOKIE } }));

      expect(response.status).toBe(401);
    });

    it("answers preflight requests without authentication", async () => {
      const response = await proxy(request("/api/search", { method: "OPTIONS" }));

      expect(passedThrough(response)).toBe(true);
    });
  });

  describe("UI routes", () => {
    it.each(["/", "/?q=secret"])("redirects %s to /login with a forged session cookie", async (path) => {
      const response = await proxy(request(path, { headers: { cookie: FORGED_COOKIE } }));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    });

    it("redirects to /login without a cookie", async () => {
      const response = await proxy(request("/"));

      expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    });

    it("does not accept the API key in place of a session", async () => {
      const response = await proxy(request("/", { headers: { "X-Prompt-Keeper-API-Key": "test-api-key" } }));

      expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    });

    it("renders for a validated session", async () => {
      getSession.mockResolvedValue(VALID_SESSION);

      const response = await proxy(request("/", { headers: { cookie: FORGED_COOKIE } }));

      expect(passedThrough(response)).toBe(true);
    });

    it("keeps /login public", async () => {
      const response = await proxy(request("/login"));

      expect(passedThrough(response)).toBe(true);
      expect(getSession).not.toHaveBeenCalled();
    });
  });
});

import { POST } from "@/app/api/csp-report/route";

const mockWarn = jest.fn();
jest.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args) }),
}));

const post = (body: string, type: string) =>
  POST(
    new Request("http://localhost/api/csp-report", {
      method: "POST",
      headers: { "Content-Type": type, "User-Agent": "TestBrowser/1" },
      body,
    }),
  );

// The fields of each line logged
const logged = () => mockWarn.mock.calls.map(([fields]) => fields);

const batch = JSON.stringify([
  {
    type: "csp-violation",
    age: 10,
    url: "https://pk.test/?q=secret",
    user_agent: "Chrome/150",
    body: {
      documentURL: "https://pk.test/?q=secret#frag",
      blockedURL: "https://evil.test/x.png?token=abc",
      effectiveDirective: "img-src",
      originalPolicy: "default-src 'self'",
      sourceFile: "https://pk.test/_next/static/a.js?v=1",
      lineNumber: 3,
      columnNumber: 7,
      disposition: "report",
      sample: "alert(document.cookie)",
      referrer: "https://www.google.com/search?q=secret",
      statusCode: 200,
    },
  },
  { type: "deprecation", url: "https://pk.test/", body: {} },
]);

const legacy = JSON.stringify({
  "csp-report": {
    "document-uri": "https://pk.test/login?next=%2F%3Fq%3Dsecret",
    "blocked-uri": "inline",
    "violated-directive": "style-src-attr",
    disposition: "report",
    "original-policy": "default-src 'self'",
  },
});

describe("POST /api/csp-report", () => {
  beforeEach(() => mockWarn.mockReset());

  it("logs a Reporting API batch's CSP reports, without queries, samples or referrers", async () => {
    const response = await post(batch, "application/reports+json");

    expect(response.status).toBe(204);
    expect(logged()).toEqual([
      {
        directive: "img-src",
        blocked: "https://evil.test/x.png",
        document: "https://pk.test/",
        source: "https://pk.test/_next/static/a.js",
        line: 3,
        column: 7,
        disposition: "report",
        userAgent: "Chrome/150",
        via: "report-to",
      },
    ]);
    expect(JSON.stringify(logged())).not.toMatch(/secret|token|cookie|frag/);
  });

  it("logs a legacy report-uri report with the request's user agent", async () => {
    const response = await post(legacy, "application/csp-report");

    expect(response.status).toBe(204);
    expect(logged()).toEqual([
      {
        directive: "style-src-attr",
        blocked: "inline",
        document: "https://pk.test/login",
        disposition: "report",
        userAgent: "TestBrowser/1",
        via: "report-uri",
      },
    ]);
  });

  it("logs at most 50 violations from one batch", async () => {
    const many = JSON.stringify(
      Array.from({ length: 60 }, () => ({ type: "csp-violation", body: { effectiveDirective: "img-src" } })),
    );

    expect((await post(many, "application/reports+json")).status).toBe(204);
    expect(mockWarn).toHaveBeenCalledTimes(50);
  });

  it("logs a CSP Level 2 report, whose violated-directive is the whole directive", async () => {
    const level2 = JSON.stringify({
      "csp-report": { "document-uri": "https://pk.test/", "violated-directive": "img-src 'self' data:" },
    });

    expect((await post(level2, "application/json")).status).toBe(204);
    expect(logged()).toEqual([
      { directive: "img-src", document: "https://pk.test/", userAgent: "TestBrowser/1", via: "report-uri" },
    ]);
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", ""])(
    "refuses a body sent as %s, as another site's page can send it, logging nothing",
    async (type) => {
      expect((await post(legacy, type)).status).toBe(415);
      expect(mockWarn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["not JSON", "{", 400],
    ["JSON but no report", '{"hello":1}', 400],
    ["over 64 KB", JSON.stringify({ pad: "a".repeat(64 * 1024) }), 413],
  ])("refuses a body %s, logging nothing", async (_, body, status) => {
    expect((await post(body, "application/csp-report")).status).toBe(status);
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

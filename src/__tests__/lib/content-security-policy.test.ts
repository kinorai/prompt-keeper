import { contentSecurityPolicy, s3ImageOrigin, securityHeaders } from "@/lib/content-security-policy";

const directive = (policy: string, name: string) => policy.split("; ").find((entry) => entry.startsWith(`${name} `));

const PROD = {
  NODE_ENV: "production",
  S3_ENDPOINT: "https://api-s3.example.com",
  S3_BUCKET_NAME: "prompt-keeper",
  S3_FORCE_PATH_STYLE: "true",
};

describe("contentSecurityPolicy", () => {
  it.each([
    ["production", "script-src 'self' 'unsafe-inline'"],
    ["development", "script-src 'self' 'unsafe-inline' 'unsafe-eval'"],
  ])("allows eval only in development (%s)", (NODE_ENV, scripts) => {
    expect(directive(contentSecurityPolicy({ ...PROD, NODE_ENV }), "script-src")).toBe(scripts);
  });

  it("allows images from the S3 origin, and reports both ways", () => {
    const policy = contentSecurityPolicy(PROD);

    expect(directive(policy, "img-src")).toBe("img-src 'self' data: blob: https://api-s3.example.com");
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(directive(policy, "report-uri")).toBe("report-uri /api/csp-report");
    expect(directive(policy, "report-to")).toBe("report-to csp-endpoint");
  });

  it("allows no other image host without an S3 endpoint", () => {
    expect(directive(contentSecurityPolicy({ NODE_ENV: "production" }), "img-src")).toBe("img-src 'self' data: blob:");
  });
});

describe("s3ImageOrigin", () => {
  it.each([
    ["path style", PROD, "https://api-s3.example.com"],
    ["virtual-hosted style", { ...PROD, S3_FORCE_PATH_STYLE: "false" }, "https://prompt-keeper.api-s3.example.com"],
    ["a local endpoint with a port", { ...PROD, S3_ENDPOINT: "http://localhost:9000/" }, "http://localhost:9000"],
    [
      "an IP endpoint without path style",
      { ...PROD, S3_ENDPOINT: "http://127.0.0.1:9000", S3_FORCE_PATH_STYLE: "false" },
      "http://127.0.0.1:9000",
    ],
    ["no endpoint", { NODE_ENV: "production" }, null],
    ["an endpoint that isn't a URL", { ...PROD, S3_ENDPOINT: "minio:9000" }, null],
  ])("finds the presigned URLs' origin with %s", (_, env, origin) => {
    expect(s3ImageOrigin(env)).toBe(origin);
  });
});

describe("securityHeaders", () => {
  it("only reports, to the endpoint report-to names", () => {
    expect(securityHeaders(PROD)).toEqual([
      { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(PROD) },
      { key: "Reporting-Endpoints", value: 'csp-endpoint="/api/csp-report"' },
    ]);
  });
});

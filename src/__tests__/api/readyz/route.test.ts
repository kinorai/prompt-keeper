import { GET } from "@/app/api/readyz/route";
import opensearchClient from "@/lib/opensearch";

// Mock OpenSearch client
jest.mock("@/lib/opensearch", () => ({
  __esModule: true,
  default: {
    ping: jest.fn(),
  },
  ensureIndexExists: jest.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe("GET /api/readyz", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LITELLM_URL;
  });

  it("should return 200 when all services are ready", async () => {
    (opensearchClient.ping as jest.Mock).mockResolvedValue({ body: true });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.checks.opensearch.ok).toBe(true);
    expect(data.checks.litellm.ok).toBe(true);
    expect(data.timestamp).toBeDefined();
  });

  it("should return 200 when OpenSearch is ready and LiteLLM is healthy", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (opensearchClient.ping as jest.Mock).mockResolvedValue({ body: true });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ready");
    expect(data.checks.opensearch.ok).toBe(true);
    expect(data.checks.litellm.ok).toBe(true);
  });

  it("should return 503 when OpenSearch is unhealthy", async () => {
    (opensearchClient.ping as jest.Mock).mockResolvedValue({ body: false });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.checks.opensearch.ok).toBe(false);
  });

  it("should return 503 when OpenSearch ping fails", async () => {
    (opensearchClient.ping as jest.Mock).mockRejectedValue(new Error("Connection error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.checks.opensearch.ok).toBe(false);
    expect(data.checks.opensearch.detail).toBe("Connection error");
  });

  it("should return 503 when LiteLLM is unhealthy", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (opensearchClient.ping as jest.Mock).mockResolvedValue({ body: true });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.checks.opensearch.ok).toBe(true);
    expect(data.checks.litellm.ok).toBe(false);
  });

  it("should return 503 when LiteLLM fetch fails", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (opensearchClient.ping as jest.Mock).mockResolvedValue({ body: true });
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.checks.litellm.ok).toBe(false);
  });

  it("should return 503 when both services are unhealthy", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (opensearchClient.ping as jest.Mock).mockRejectedValue(new Error("OpenSearch error"));
    (global.fetch as jest.Mock).mockRejectedValue(new Error("LiteLLM error"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.checks.opensearch.ok).toBe(false);
    expect(data.checks.litellm.ok).toBe(false);
  });
});

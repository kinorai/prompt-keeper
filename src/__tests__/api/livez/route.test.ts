import { GET } from "@/app/api/livez/route";

// Mock fetch globally
global.fetch = jest.fn();

describe("GET /api/livez", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LITELLM_URL;
  });

  it("should return 200 when LITELLM_URL is not configured", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("live");
    expect(data.checks.litellm.ok).toBe(true);
    expect(data.timestamp).toBeDefined();
  });

  it("should return 200 when LiteLLM is healthy", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("live");
    expect(data.checks.litellm.ok).toBe(true);
    expect(data.checks.litellm.status).toBe(200);
  });

  it("should return 503 when LiteLLM is unhealthy", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.checks.litellm.ok).toBe(false);
  });

  it("should return 503 when LiteLLM fetch fails", async () => {
    process.env.LITELLM_URL = "http://localhost:4000";
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.status).toBe("unhealthy");
    expect(data.checks.litellm.ok).toBe(false);
  });
});

import { NextRequest } from "next/server";
import { POST } from "@/app/api/search/route";
import { DELETE } from "@/app/api/search/[id]/route";
import { auth } from "@/lib/auth";
import { getOpenSearchClient } from "@/lib/opensearch";
import getPrisma from "@/lib/prisma";

jest.mock("@/lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("@/lib/opensearch", () => {
  const mockClient = { search: jest.fn() };
  return {
    __esModule: true,
    getOpenSearchClient: jest.fn(() => mockClient),
    ensureIndexExists: jest.fn().mockResolvedValue(undefined),
    PROMPT_KEEPER_INDEX: "prompt-keeper",
  };
});

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: jest.fn(() => ({ $transaction: jest.fn() })),
}));

const getSession = auth.api.getSession as unknown as jest.Mock;
const FORGED_COOKIE = "better-auth.session_token=forged";

// The proxy is the first gate; the handlers check again so a matcher change can't expose them
describe("search route authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSession.mockResolvedValue(null);
  });

  it("POST /api/search returns 401 for a forged session cookie", async () => {
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      headers: { cookie: FORGED_COOKIE },
      body: JSON.stringify({ query: "" }),
    });

    const response = await POST(req);

    expect(response.status).toBe(401);
    expect(getSession).toHaveBeenCalledWith({ headers: req.headers });
    expect(getOpenSearchClient().search).not.toHaveBeenCalled();
  });

  it("DELETE /api/search/[id] returns 401 for a forged session cookie", async () => {
    const req = new NextRequest("http://localhost/api/search/some-id", {
      method: "DELETE",
      headers: { cookie: FORGED_COOKIE },
    });

    const response = await DELETE(req, { params: Promise.resolve({ id: "some-id" }) });

    expect(response.status).toBe(401);
    expect(getPrisma).not.toHaveBeenCalled();
  });

  it("POST /api/search accepts the API key", async () => {
    (getOpenSearchClient().search as jest.Mock).mockResolvedValue({
      body: { hits: { hits: [], total: { value: 0 } }, took: 1 },
    });
    const req = new NextRequest("http://localhost/api/search", {
      method: "POST",
      headers: { "X-Prompt-Keeper-API-Key": "test-api-key" },
      body: JSON.stringify({ query: "" }),
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(getSession).not.toHaveBeenCalled();
  });
});

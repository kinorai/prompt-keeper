import { GET } from "@/app/api/healthz/route";

describe("GET /api/healthz", () => {
  it("should return 200 with status ok", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      status: "ok",
    });
  });
});

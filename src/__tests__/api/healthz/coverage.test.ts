import { GET } from "@/app/api/healthz/route";
import { NextResponse } from "next/server";

describe("Healthz API Coverage", () => {
  it("should handle errors", async () => {
    const jsonSpy = jest.spyOn(NextResponse, "json");
    jsonSpy.mockImplementationOnce(() => {
      throw new Error("Mock Error");
    });

    const response = await GET();
    expect(response.status).toBe(500);

    jsonSpy.mockRestore();
  });
});

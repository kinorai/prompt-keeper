import { GET, POST } from "@/app/api/auth/[...all]/route";
import { toNextJsHandler } from "better-auth/next-js";

describe("Auth API Route", () => {
  it("should export GET and POST handlers from better-auth", () => {
    expect(toNextJsHandler).toHaveBeenCalled();
    expect(GET).toBeDefined();
    expect(POST).toBeDefined();
  });
});

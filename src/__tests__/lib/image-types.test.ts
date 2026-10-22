import { hasImageSignature, isRenderableDataUrl, parseImageDataUrl } from "@/lib/image-types";

const toBase64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

describe("parseImageDataUrl", () => {
  it.each(["image/png", "image/jpeg", "image/gif", "image/webp", "IMAGE/PNG"])("accepts %s", (type) => {
    expect(parseImageDataUrl(`data:${type};base64,AAAA`)).toEqual({ contentType: type.toLowerCase(), base64: "AAAA" });
  });

  it.each(["image/svg+xml", "text/html", "application/octet-stream", "constructor", "toString"])(
    "rejects %s",
    (type) => {
      expect(parseImageDataUrl(`data:${type};base64,AAAA`)).toBeNull();
    },
  );

  it("rejects a data: URL that is not base64", () => {
    expect(parseImageDataUrl("data:image/png,<svg/>")).toBeNull();
  });
});

describe("hasImageSignature", () => {
  it.each([
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("accepts real %s bytes", (type, bytes) => {
    expect(hasImageSignature(Buffer.from(bytes), type)).toBe(true);
  });

  it("rejects HTML declared as PNG", () => {
    expect(hasImageSignature(Buffer.from(toBase64([0x3c, 0x68]), "base64"), "image/png")).toBe(false);
  });
});

describe("isRenderableDataUrl", () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];

  it("accepts a PNG whose bytes match", () => {
    expect(isRenderableDataUrl(`data:image/png;base64,${toBase64(png)}`)).toBe(true);
  });

  it("rejects SVG or HTML bytes declared as PNG", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64");
    expect(isRenderableDataUrl(`data:image/png;base64,${svg}`)).toBe(false);
  });

  it("rejects a disallowed type", () => {
    expect(isRenderableDataUrl(`data:image/svg+xml;base64,${toBase64(png)}`)).toBe(false);
  });
});

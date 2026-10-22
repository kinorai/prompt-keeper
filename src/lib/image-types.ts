// Raster image types accepted from data: URLs. The type becomes the stored object's Content-Type
// and file extension, so anything active (SVG, HTML) must stay out.
export const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

// S3 prefix of uploaded images; search presigns only keys under it
export const STORED_IMAGE_KEY_PREFIX = "conversations/images/";

const DATA_URL_PATTERN = /^data:([A-Za-z0-9.+\/-]+);base64,([\s\S]+)$/;

export function parseImageDataUrl(url: string): { contentType: string; base64: string } | null {
  const match = url.match(DATA_URL_PATTERN);
  if (!match) {
    return null;
  }
  const contentType = match[1].toLowerCase();
  return Object.prototype.hasOwnProperty.call(IMAGE_MIME_EXTENSIONS, contentType)
    ? { contentType, base64: match[2] }
    : null;
}

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, i) => buffer[offset + i] === byte);

// The declared type is client-supplied; check the bytes actually match it
export function hasImageSignature(buffer: Buffer, contentType: string): boolean {
  switch (contentType) {
    case "image/png":
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWith(buffer, [0x47, 0x49, 0x46, 0x38]);
    case "image/webp":
      return startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8);
    default:
      return false;
  }
}

// An inline data: image is shown only if it passes the same checks as an upload:
// an allowed type and bytes that match it. Only the first bytes are decoded.
export function isRenderableDataUrl(url: string): boolean {
  const parsed = parseImageDataUrl(url);
  if (!parsed) {
    return false;
  }
  const head = Buffer.from(parsed.base64.slice(0, 24), "base64");
  return hasImageSignature(head, parsed.contentType);
}

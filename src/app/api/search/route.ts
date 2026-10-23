import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { getPresignedUrl } from "@/lib/s3";
import { requireAuth } from "@/lib/request-auth";
import { isRenderableDataUrl, STORED_IMAGE_KEY_PREFIX } from "@/lib/image-types";
import { isOpenSearchBackend } from "@/lib/search/backend";
import { searchOpenSearch } from "@/lib/search/opensearch";
import { searchPostgres } from "@/lib/search/postgres";
import { parseSearchRequest } from "@/lib/search/request";

const log = createLogger("api:search");

// The parts of a hit the image signing touches
interface MessageContentItem {
  type: string;
  text?: string;
  image_url?: { url: string; renderable?: boolean };
}

interface SearchMessage {
  role: string;
  content: string | MessageContentItem[];
  multimodal_content?: MessageContentItem[];
}

interface SignableSource {
  messages?: SearchMessage[];
  [key: string]: unknown;
}

interface SignableHit {
  _source?: SignableSource;
  highlight?: Record<string, string[]>;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const request = parseSearchRequest(body);
    if ("error" in request) {
      return NextResponse.json({ error: request.error }, { status: 400 });
    }

    const results = isOpenSearchBackend() ? await searchOpenSearch(request) : await searchPostgres(request);
    const hits = results.hits;

    // Process hits to sign URLs for S3 images
    await Promise.all(
      hits.map(async (hit: SignableHit) => {
        if (hit._source?.messages) {
          await Promise.all(
            hit._source.messages.map(async (msg: SearchMessage) => {
              // If multimodal_content exists, use it as the main content
              if (msg.multimodal_content) {
                msg.content = msg.multimodal_content;
              }

              if (Array.isArray(msg.content)) {
                await Promise.all(
                  msg.content.map(async (item: MessageContentItem) => {
                    if (item.type !== "image_url" || !item.image_url) {
                      return;
                    }
                    // Always overwrite the flag: stored content comes from callers and may carry its own.
                    // The UI auto-loads only renderable images; anything else becomes a link.
                    item.image_url.renderable = isRenderableDataUrl(item.image_url.url ?? "");
                    const key = item.image_url.url?.startsWith("s3://")
                      ? item.image_url.url.slice("s3://".length)
                      : null;
                    // Only presign keys the upload path writes, never an arbitrary key a caller stored
                    if (key?.startsWith(STORED_IMAGE_KEY_PREFIX)) {
                      const signedUrl = await getPresignedUrl(key);
                      if (signedUrl) {
                        item.image_url.url = signedUrl;
                        item.image_url.renderable = true;
                      }
                    }
                  }),
                );
              }
            }),
          );
        }
      }),
    );

    return NextResponse.json({
      hits: {
        hits: hits,
        total: results.total,
      },
      took: results.took,
    });
  } catch (error) {
    log.error(error, "[Search API Error]");
    return NextResponse.json(
      {
        hits: {
          hits: [],
          total: { value: 0 },
        },
        took: 0,
        error: "Search failed",
      },
      { status: 500 },
    );
  }
}

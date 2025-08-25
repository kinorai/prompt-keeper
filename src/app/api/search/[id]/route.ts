import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX, ensureIndexExists } from "@/lib/opensearch";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:search:delete");

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
    }

    // Ensure index exists before deleting
    await ensureIndexExists();

    log.debug({ id }, "[Delete API] Deleting conversation");

    const response = await opensearchClient.delete({
      index: PROMPT_KEEPER_INDEX,
      id: id,
      refresh: "wait_for", // Ensure the deletion is immediately visible
    });

    log.debug(response, "[Delete API] Response:");

    return NextResponse.json({
      success: true,
      deleted: response.body.result === "deleted",
    });
  } catch (error) {
    log.error(error, "[Delete API Error]");

    // Handle 404 errors specifically
    if (error instanceof Error && error.message.includes("404")) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
    }

    // Ensure index exists before fetching
    await ensureIndexExists();

    log.debug({ id }, "[Get API] Fetching conversation");

    const response = await opensearchClient.get({
      index: PROMPT_KEEPER_INDEX,
      id: id,
    });

    // OpenSearch get() returns { found: boolean, _source: {...} }
    // Normalize a minimal response shape for the client
    return NextResponse.json({
      _id: response.body._id,
      found: response.body.found,
      _source: response.body._source,
    });
  } catch (error) {
    log.error(error, "[Get API Error]");

    // Handle 404 errors specifically
    if (error instanceof Error && error.message.includes("404")) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

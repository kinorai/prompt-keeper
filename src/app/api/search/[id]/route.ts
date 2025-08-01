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

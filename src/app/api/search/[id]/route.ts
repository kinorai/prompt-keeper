import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import getPrisma from "@/lib/prisma";

const log = createLogger("api:search:delete");

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Conversation ID is required" }, { status: 400 });
    }

    log.debug({ id }, "[Delete API] Deleting conversation from Postgres");

    const prisma = getPrisma();

    // Delete from Postgres (source of truth) and enqueue outbox event
    await prisma.$transaction(async (tx) => {
      // Check if conversation exists
      const conversation = await tx.conversation.findUnique({
        where: { id },
      });

      if (!conversation) {
        throw new Error("NOT_FOUND");
      }

      // Delete messages (cascade should handle this, but explicit is safer)
      await tx.message.deleteMany({
        where: { conversationId: id },
      });

      // Delete conversation
      await tx.conversation.delete({
        where: { id },
      });

      // Enqueue outbox event for OpenSearch deletion
      await tx.outboxEvent.create({
        data: {
          eventType: "conversation.deleted",
          aggregateType: "conversation",
          aggregateId: id,
        },
      });

      log.debug({ id }, "[Delete API] Conversation deleted from Postgres and outbox event created");
    });

    return NextResponse.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    log.error(error, "[Delete API Error]");

    // Handle 404 errors specifically
    if (error instanceof Error && error.message === "NOT_FOUND") {
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

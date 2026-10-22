import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import getPrisma from "@/lib/prisma";
import { requireAuth } from "@/lib/request-auth";
import { STORED_IMAGE_KEY_PREFIX } from "@/lib/image-types";

const log = createLogger("api:search:delete");

function collectStoredImageKeys(contents: unknown[]): string[] {
  const keys = new Set<string>();
  for (const content of contents) {
    if (!Array.isArray(content)) continue;
    for (const part of content as Array<{ type?: string; image_url?: { url?: unknown } }>) {
      const url = part?.type === "image_url" ? part.image_url?.url : undefined;
      if (typeof url === "string" && url.startsWith(`s3://${STORED_IMAGE_KEY_PREFIX}`)) {
        keys.add(url.slice("s3://".length));
      }
    }
  }
  return [...keys];
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAuth(req);
  if (unauthorized) {
    return unauthorized;
  }

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

      // Collect uploaded image keys first so the worker can delete the objects with the conversation
      const messages = await tx.message.findMany({
        where: { conversationId: id },
        select: { content: true },
      });
      const imageKeys = collectStoredImageKeys(messages.map((message) => message.content));

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
          ...(imageKeys.length > 0 ? { payload: { imageKeys } } : {}),
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
        error: "Failed to delete conversation",
      },
      { status: 500 },
    );
  }
}

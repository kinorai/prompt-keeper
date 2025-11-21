import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createLogger } from "@/lib/logger";
import getPrisma from "@/lib/prisma";
import { uploadFile } from "@/lib/s3";

const log = createLogger("api:chat/completions");

// Constants
const CONFIG = {
  LITELLM_URL: process.env.LITELLM_URL,
  REQUEST_TIMEOUT: process.env.REQUEST_TIMEOUT || 480000, // 8 minutes because LLM can take a while
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  CORS_METHODS: process.env.CORS_METHODS || "GET, POST, OPTIONS, PUT, DELETE",
  CORS_HEADERS: process.env.CORS_HEADERS || "Content-Type, Authorization, X-Prompt-Keeper-API-Key",
  CORS_MAX_AGE: process.env.CORS_MAX_AGE || "86400",
};

// Types
interface StreamChunk {
  id: string;
  model: string;
  created: number;
  object: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: string;
  }>;
}

interface FormattedResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  object: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason?: string;
  }>;
}

interface Message {
  role: string;
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
        [key: string]: any;
      }>;
}

const skipHeaders = [
  "host",
  "domain",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "content-encoding",
];

// Helper function to generate a conversation hash
// When excludeLastUserMessage is true, we exclude the last user message (used for FINDING existing conversations)
// When excludeLastUserMessage is false, we include all messages (used for STORING the conversation hash)
function generateConversationHash(messages: Message[], excludeLastUserMessage = false): string {
  if (!messages || messages.length === 0) return "";

  // For conversation continuity identification:
  // When a client sends a conversation continuation, they send the FULL history including the new message.
  //
  // To FIND existing conversation: hash OLD messages (exclude last user message)
  // To STORE conversation: hash ALL messages (include last user message)
  //
  // Example flow:
  // - Request 1: ["user:1"]
  //   → Find with hash of [] (empty, no old messages) → not found
  //   → Store with hash of ["user:1"]
  //
  // - Request 2: ["user:1", "user:2"]
  //   → Find with hash of ["user:1"] → FOUND!
  //   → Update with hash of ["user:1", "user:2"]
  //
  // - Request 3: ["user:1", "user:2", "user:3"]
  //   → Find with hash of ["user:1", "user:2"] → FOUND!
  //   → Update with hash of ["user:1", "user:2", "user:3"]

  const messagesToHash: Message[] = [];

  // Find system message and ALL user messages
  const systemMessage = messages.find((msg) => msg.role === "system");
  const userMessages = messages.filter((msg) => msg.role === "user");

  if (systemMessage) {
    messagesToHash.push(systemMessage);
  }

  // Add user messages (all or all except last, depending on the flag)
  if (excludeLastUserMessage && userMessages.length > 1) {
    // Exclude the last user message (for finding existing conversation)
    messagesToHash.push(...userMessages.slice(0, -1));
  } else if (!excludeLastUserMessage) {
    // Include all user messages (for storing conversation)
    messagesToHash.push(...userMessages);
  }

  if (messagesToHash.length === 0) {
    // No messages to hash (new conversation with no history)
    return "";
  }

  // Create a string from the selected messages
  const contentString = messagesToHash
    .map((msg) => {
      let contentStr = "";

      if (typeof msg.content === "string") {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentStr = msg.content
          .filter((item) => item.type === "text")
          .map((item) => item.text)
          .join("\n");
      }

      // Normalize content by trimming and converting to lowercase
      contentStr = contentStr.trim().toLowerCase();

      return `${msg.role}:${contentStr}`;
    })
    .join("|");

  // Return a hash of the content string
  return crypto.createHash("sha256").update(contentString).digest("hex");
}

function formatStreamToResponse(chunks: StreamChunk[]): FormattedResponse {
  if (chunks.length === 0) {
    throw new Error("No chunks received from stream");
  }

  const firstChunk = chunks[0];
  const lastChunk = chunks[chunks.length - 1];
  const aggregatedContent = chunks.reduce((acc, chunk) => {
    return acc + (chunk.choices[0]?.delta?.content || "");
  }, "");

  return {
    id: firstChunk.id,
    model: firstChunk.model,
    created: firstChunk.created,
    object: firstChunk.object,
    usage: {
      prompt_tokens: 0, // These will be updated when available
      completion_tokens: 0,
      total_tokens: 0,
    },
    choices: [
      {
        index: 0,
        message: {
          role: "assistant", // We know this is always assistant for responses
          content: aggregatedContent,
        },
        finish_reason: lastChunk.choices[0]?.finish_reason,
      },
    ],
  };
}

// Add this helper function to sanitize messages
// Process message for storage: upload images to S3 and return clean message object
async function processMessageForStorage(message: Message): Promise<Message> {
  if (typeof message.content === "string") {
    return message;
  }

  if (Array.isArray(message.content)) {
    const newContent = await Promise.all(
      message.content.map(async (item) => {
        if (item.type === "image_url" && item.image_url?.url?.startsWith("data:")) {
          try {
            // Extract base64 data
            const matches = item.image_url.url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              const contentType = matches[1];
              const buffer = Buffer.from(matches[2], "base64");
              const ext = contentType.split("/")[1] || "bin";
              const date = new Date().toISOString().split("T")[0].split("-"); // [YYYY, MM, DD]
              const key = `conversations/images/${date[0]}/${date[1]}/${crypto.randomUUID()}.${ext}`;

              await uploadFile(key, buffer, contentType);

              return {
                type: "image_url",
                image_url: {
                  url: `s3://${key}`,
                },
              };
            }
          } catch (error) {
            log.error(error, "Failed to process image for S3 upload");
            // Fallback: keep original or maybe strip it? Keeping original might be too large for DB if it's base64
            return item;
          }
        }
        return item;
      }),
    );

    return {
      ...message,
      content: newContent,
    };
  }

  return message;
}

// Removed direct OpenSearch writes; indexing is done by the outbox worker

// Store conversation in Postgres (source of truth) and enqueue outbox event
// If a conversation with the same hash exists (within 1 year), update it instead of creating new
async function storeConversationPostgres(requestMessages: Message[], response: FormattedResponse, latency: number) {
  try {
    const sanitizedRequestMessages = await Promise.all(requestMessages.map(processMessageForStorage));
    const sanitizedResponseMessages = await Promise.all(
      response.choices.map((choice) => processMessageForStorage(choice.message)),
    );

    // Generate TWO hashes:
    // 1. findHash: excludes last user message - used to FIND existing conversation
    // 2. storeHash: includes all messages - used to STORE the conversation
    const findHash = generateConversationHash(requestMessages, true); // exclude last
    const storeHash = generateConversationHash(requestMessages, false); // include all

    const createdDate = typeof response.created === "number" ? new Date(response.created * 1000) : new Date();

    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      let conversationId: string;
      let isUpdate = false;

      // Try to find existing conversation with same hash (updated within 1 year)
      // Use findHash which excludes the current/new message
      if (findHash && requestMessages.length > 1) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const existing = await tx.conversation.findFirst({
          where: {
            conversationHash: findHash,
            updatedAt: { gte: oneYearAgo },
          },
          orderBy: { updatedAt: "desc" },
        });

        if (existing) {
          log.debug({ existingId: existing.id, findHash, storeHash }, "[Postgres] Updating existing conversation");
          isUpdate = true;
          conversationId = existing.id;

          // Delete old messages for this conversation
          await tx.message.deleteMany({
            where: { conversationId: existing.id },
          });

          // Update conversation metadata (including the new hash with all messages)
          await tx.conversation.update({
            where: { id: existing.id },
            data: {
              model: response.model,
              conversationHash: storeHash, // Update hash to include the new message
              latencyMs: latency,
              promptTokens: response.usage?.prompt_tokens ?? null,
              completionTokens: response.usage?.completion_tokens ?? null,
              totalTokens: response.usage?.total_tokens ?? null,
              updatedAt: new Date(),
            },
          });
        } else {
          // No existing conversation found, create new
          const newConversation = await tx.conversation.create({
            data: {
              model: response.model,
              conversationHash: storeHash,
              created: createdDate,
              latencyMs: latency,
              promptTokens: response.usage?.prompt_tokens ?? null,
              completionTokens: response.usage?.completion_tokens ?? null,
              totalTokens: response.usage?.total_tokens ?? null,
            },
          });
          conversationId = newConversation.id;
        }
      } else {
        // New conversation (no hash or single message)
        const newConversation = await tx.conversation.create({
          data: {
            model: response.model,
            conversationHash: storeHash,
            created: createdDate,
            latencyMs: latency,
            promptTokens: response.usage?.prompt_tokens ?? null,
            completionTokens: response.usage?.completion_tokens ?? null,
            totalTokens: response.usage?.total_tokens ?? null,
          },
        });
        conversationId = newConversation.id;
      }

      // Insert all messages (both request and response)
      const messagesToInsert: Array<{
        conversationId: string;
        role: string;
        content: string;
        finishReason?: string | null;
        messageIndex: number;
      }> = [];

      sanitizedRequestMessages.forEach((m, idx) => {
        messagesToInsert.push({
          conversationId,
          role: m.role,
          content: m.content as any, // Prisma expects Json, passing object/array directly

          finishReason: null,
          messageIndex: idx,
        });
      });

      sanitizedResponseMessages.forEach((m, idx) => {
        messagesToInsert.push({
          conversationId,
          role: m.role || "assistant",
          content: m.content as any, // Prisma expects Json

          finishReason: response.choices[idx]?.finish_reason ?? null,
          messageIndex: sanitizedRequestMessages.length + idx,
        });
      });

      if (messagesToInsert.length > 0) {
        await tx.message.createMany({ data: messagesToInsert });
      }

      // Enqueue outbox event (will sync to OpenSearch)
      await tx.outboxEvent.create({
        data: {
          eventType: "conversation.upserted",
          aggregateType: "conversation",
          aggregateId: conversationId,
          payload: {
            model: response.model,
            conversationHash: storeHash,
            usage: response.usage,
            latency,
            isUpdate,
          },
        },
      });

      log.debug({ conversationId, isUpdate, findHash, storeHash }, "[Postgres] Conversation stored");
    });
  } catch (error) {
    log.error(error, "[Postgres Storage Error]");
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Log the incoming request details
    const requestBody = await req.text();
    const parsedBody = JSON.parse(requestBody);

    log.debug(req, "[Incoming Chat Completions Request]");

    const forwardHeaders = new Headers(req.headers);
    skipHeaders.forEach((header) => forwardHeaders.delete(header));

    const requestData = parsedBody; // Use already parsed body
    const requestMessages = requestData.messages || [];
    log.debug(CONFIG.LITELLM_URL, "[LiteLLM URL]");
    const response = await fetch(`${CONFIG.LITELLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: forwardHeaders,
      body: requestBody,
      signal: AbortSignal.timeout(Number(CONFIG.REQUEST_TIMEOUT)),
    });

    if (!response.ok) {
      log.error(response, "[Chat Completions API Error]");
      return NextResponse.json({ error: await response.text() }, { status: response.status });
    }

    const latency = Date.now() - startTime;

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const { readable, writable } = new TransformStream();
      const chunks: StreamChunk[] = [];

      const reader = response.body?.getReader();
      if (!reader) {
        return NextResponse.json({ error: "No reader available" }, { status: 500 });
      }

      (async () => {
        const textDecoder = new TextDecoder();
        const writer = writable.getWriter();

        try {
          let buffer = ""; // Add buffer for incomplete chunks
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Stream is complete, now we can store the conversation
              const formattedResponse = formatStreamToResponse(chunks);
              await storeConversationPostgres(requestMessages, formattedResponse, latency);
              break;
            }

            const text = textDecoder.decode(value, { stream: true });
            await writer.write(value);

            // Add new text to buffer and split into lines
            buffer += text;
            const lines = buffer.split("\n");

            // Process all complete lines
            buffer = lines.pop() || ""; // Keep the last incomplete line in buffer

            for (const line of lines) {
              if (line.trim() === "") continue;
              if (line === "data: [DONE]") continue;
              if (line.startsWith("data: ")) {
                try {
                  const jsonStr = line.slice(6); // Remove 'data: ' prefix
                  const chunk: StreamChunk = JSON.parse(jsonStr);
                  chunks.push(chunk);
                } catch (error) {
                  log.error(error, "[Stream Parse Error]");
                }
              }
            }
          }
        } catch (error) {
          log.error(error, "[Stream Processing Error]");
        } finally {
          writer.close();
        }
      })();

      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } else {
      const jsonResponse = await response.json();
      await storeConversationPostgres(requestMessages, jsonResponse, latency);
      return NextResponse.json(jsonResponse);
    }
  } catch (error) {
    log.error(error, "[API Error]");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

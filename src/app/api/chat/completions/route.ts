import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createLogger } from "@/lib/logger";
import getPrisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { uploadFile } from "@/lib/s3";
import {
  IMAGE_MIME_EXTENSIONS,
  STORED_IMAGE_KEY_PREFIX,
  hasImageSignature,
  parseImageDataUrl,
} from "@/lib/image-types";
import { collectUnknownFields, pickRequestParams } from "@/lib/message-fields";

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
// A tool call is either `type: "function"` (arguments is a JSON string) or `type: "custom"`
// (freeform input). Streamed deltas arrive fragmented and are keyed by `index`.
interface ToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
  custom?: { name?: string; input?: string };
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  [key: string]: unknown;
}

interface StreamChunk {
  id: string;
  model: string;
  object: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  // Present on the final chunk when the client asked for stream_options.include_usage,
  // which Open WebUI does whenever the model has the usage capability enabled
  usage?: Usage;
}

interface FormattedResponse {
  id: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  object: string;
  choices: Array<{
    index: number;
    message: Message;
    finish_reason?: string;
  }>;
}

interface Message {
  role: string;
  // Assistant turns that only call tools send `content: null`
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
        [key: string]: unknown;
      }>
    | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  reasoning_content?: string;
  thinking_blocks?: unknown[];
  reasoning_items?: unknown[];
  annotations?: unknown[];
  audio?: unknown;
  images?: unknown[];
  refusal?: string;
  provider_specific_fields?: Record<string, unknown>;
  // Deprecated predecessor of tool_calls, still emitted by older clients
  function_call?: { name?: string; arguments?: string };
}

// Normalize the legacy `function_call` shape into `tool_calls` so that everything
// downstream (storage, indexing, UI) only has to understand one shape.
function normalizeToolCalls(message: Message): ToolCall[] | null {
  if (message.tool_calls?.length) return message.tool_calls;
  if (message.function_call) return [{ index: 0, type: "function", function: message.function_call }];
  return null;
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

// Conversation identity
//
// A client continuing a conversation resends the whole history, so the messages we stored last
// time are a *prefix* of the incoming list. Hashing every message (not just system + user) and
// matching on prefixes therefore links a turn to its parent even when the new messages are not
// user messages — which is what a tool round-trip looks like:
//
//   request 1: [user]                              -> stored [user, assistant(tool_calls)]
//   request 2: [user, assistant(tool_calls), tool] -> prefix of length 2 matches request 1
//
// Hashing only system + user messages could not see that, so every tool round-trip started a
// new conversation.
// Digest of a single message. Hashing per message rather than per prefix keeps the cost linear:
// tool payloads run to tens of KB and a long agentic history would otherwise be re-hashed once
// per prefix, on the proxy's hot path.
function messageDigest(msg: Message): string {
  let contentStr = "";

  if (typeof msg.content === "string") {
    contentStr = msg.content;
  } else if (Array.isArray(msg.content)) {
    contentStr = msg.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
  }

  // Tool calls carry the meaning of an assistant turn whose content is null
  const calls = (normalizeToolCalls(msg) ?? [])
    .map((call) => `${call.function?.name ?? call.custom?.name ?? ""}:${call.function?.arguments ?? ""}`)
    .join(",");

  // Normalize content by trimming and converting to lowercase
  contentStr = contentStr.trim().toLowerCase();

  return crypto
    .createHash("sha256")
    .update(`${msg.role}:${contentStr}${calls ? `:${calls}` : ""}`)
    .digest("hex");
}

// Running hash after each message. Chaining means the hash of a list is also the hash of that
// list as a prefix of any longer one, which is what parent lookup relies on.
function chainedHashes(messages: Message[]): string[] {
  const hashes: string[] = [];
  let previous = "";

  for (const message of messages) {
    previous = crypto
      .createHash("sha256")
      .update(previous + messageDigest(message))
      .digest("hex");
    hashes.push(previous);
  }

  return hashes;
}

function hashMessages(messages: Message[]): string {
  return chainedHashes(messages).at(-1) ?? "";
}

// Hashes of every proper prefix of the incoming history, longest first. One of these is the
// storeHash of the conversation this request continues, if there is one.
function prefixHashes(messages: Message[]): string[] {
  return chainedHashes(messages).slice(0, -1).reverse();
}

function formatStreamToResponse(chunks: StreamChunk[]): FormattedResponse {
  if (chunks.length === 0) {
    throw new Error("No chunks received from stream");
  }

  const firstChunk = chunks[0];
  let aggregatedContent = "";
  let aggregatedReasoning = "";
  // Tool call fragments are keyed by `index`; `arguments` is split across chunks
  const toolCallsByIndex = new Map<number, ToolCall>();
  // The final chunk may carry usage only (empty choices), so keep the last one we saw
  let finishReason: string | undefined;
  let usage: Usage | undefined;

  for (const chunk of chunks) {
    // Read usage before the choices guard: the chunk that carries it has an empty choices array
    if (chunk.usage) usage = chunk.usage;

    const choice = chunk.choices?.[0];
    if (!choice) continue;

    aggregatedContent += choice.delta?.content || "";
    aggregatedReasoning += choice.delta?.reasoning_content || "";
    if (choice.finish_reason) finishReason = choice.finish_reason;

    for (const fragment of choice.delta?.tool_calls || []) {
      const index = fragment.index ?? 0;
      const merged = toolCallsByIndex.get(index) || { index };

      merged.id = fragment.id || merged.id;
      merged.type = fragment.type || merged.type;
      if (fragment.function) {
        merged.function = {
          name: fragment.function.name || merged.function?.name,
          arguments: (merged.function?.arguments || "") + (fragment.function.arguments || ""),
        };
      }
      if (fragment.custom) {
        merged.custom = {
          name: fragment.custom.name || merged.custom?.name,
          input: (merged.custom?.input || "") + (fragment.custom.input || ""),
        };
      }

      toolCallsByIndex.set(index, merged);
    }
  }

  const toolCalls = Array.from(toolCallsByIndex.keys())
    .sort((a, b) => a - b)
    .map((index) => toolCallsByIndex.get(index) as ToolCall);

  return {
    id: firstChunk.id,
    model: firstChunk.model,
    object: firstChunk.object,
    // Real token counts when the stream included them, zeros only when it genuinely did not
    usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    choices: [
      {
        index: 0,
        message: {
          role: "assistant", // We know this is always assistant for responses
          content: aggregatedContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          ...(aggregatedReasoning ? { reasoning_content: aggregatedReasoning } : {}),
        },
        finish_reason: finishReason,
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
            const image = parseImageDataUrl(item.image_url.url);
            const buffer = image ? Buffer.from(image.base64, "base64") : null;
            if (image && buffer && hasImageSignature(buffer, image.contentType)) {
              const ext = IMAGE_MIME_EXTENSIONS[image.contentType];
              const date = new Date().toISOString().split("T")[0].split("-"); // [YYYY, MM, DD]
              const key = `${STORED_IMAGE_KEY_PREFIX}${date[0]}/${date[1]}/${crypto.randomUUID()}.${ext}`;

              await uploadFile(key, buffer, image.contentType);

              return {
                type: "image_url",
                image_url: {
                  url: `s3://${key}`,
                },
              };
            }
            // Not an allowlisted raster image: keep it out of S3. The UI won't render it as an image.
            log.warn("Skipping S3 upload of a data: URL that is not an allowlisted image");
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
async function storeConversationPostgres(
  requestMessages: Message[],
  response: FormattedResponse,
  latency: number,
  requestBody: Record<string, unknown> = {},
) {
  try {
    const sanitizedRequestMessages = await Promise.all(requestMessages.map(processMessageForStorage));
    const sanitizedResponseMessages = await Promise.all(
      response.choices.map((choice) => processMessageForStorage(choice.message)),
    );

    // What we are about to store: the client's history plus this turn's reply. The next request
    // in the conversation resends exactly this list as its own prefix.
    const storedMessages = [...sanitizedRequestMessages, ...sanitizedResponseMessages];
    const storeHash = hashMessages(storedMessages);
    // Proper prefixes of the incoming history, longest first — one of them is the parent's hash
    const candidateHashes = prefixHashes(sanitizedRequestMessages);

    // Everything about the request except the messages themselves: tools offered, tool_choice,
    // sampling params, stream options, and any client-specific extras
    const requestParams = pickRequestParams(requestBody);

    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const candidates =
        candidateHashes.length > 0
          ? await tx.conversation.findMany({
              where: { conversationHash: { in: candidateHashes }, updatedAt: { gte: oneYearAgo } },
              orderBy: { updatedAt: "desc" },
            })
          : [];

      // candidateHashes is longest-first, so the earliest hash with a match is the most specific
      // parent for this turn
      const existing = candidateHashes
        .map((hash) => candidates.find((candidate) => candidate.conversationHash === hash))
        .find(Boolean);

      const conversationData = {
        model: response.model,
        conversationHash: storeHash,
        requestParams: Object.keys(requestParams).length > 0 ? (requestParams as Prisma.InputJsonValue) : Prisma.DbNull,
        latencyMs: latency,
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
      };

      let conversationId: string;
      const isUpdate = Boolean(existing);

      if (existing) {
        log.debug({ existingId: existing.id, storeHash }, "[Postgres] Updating existing conversation");
        conversationId = existing.id;

        // Replace the message list wholesale; the incoming history supersedes it
        await tx.message.deleteMany({ where: { conversationId: existing.id } });
        await tx.conversation.update({
          where: { id: existing.id },
          data: { ...conversationData, updatedAt: new Date() },
        });
      } else {
        const newConversation = await tx.conversation.create({ data: conversationData });
        conversationId = newConversation.id;
      }

      // Insert all messages (both request and response)
      const toMessageRow = (m: Message, messageIndex: number, finishReason: string | null) => {
        const toolCalls = normalizeToolCalls(m);
        const asJson = (value: unknown) => (value ? (value as Prisma.InputJsonValue) : Prisma.DbNull);

        // Anything this version does not model is counted and logged rather than dropped in
        // silence, so a provider adding a field surfaces in monitoring
        const unknown = collectUnknownFields(m);
        if (unknown.fields.length > 0 || unknown.partTypes.length > 0) {
          log.warn({ role: m.role, ...unknown }, "[Postgres] Message carried fields this version does not model");
        }

        return {
          conversationId,
          role: m.role || "assistant",
          // `content` is a required Json column, and Prisma rejects a bare `null` — assistant
          // turns that only call tools send exactly that, so pass an explicit JSON null
          content:
            m.content === null || m.content === undefined ? Prisma.JsonNull : (m.content as Prisma.InputJsonValue),
          toolCalls: toolCalls ? (toolCalls as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          toolCallId: m.tool_call_id ?? null,
          name: m.name ?? null,
          reasoningContent: m.reasoning_content ?? null,
          thinkingBlocks: asJson(m.thinking_blocks),
          annotations: asJson(m.annotations),
          audio: asJson(m.audio),
          images: asJson(m.images),
          refusal: m.refusal ?? null,
          finishReason,
          messageIndex,
        };
      };

      const messagesToInsert = [
        ...sanitizedRequestMessages.map((m, idx) => toMessageRow(m, idx, null)),
        ...sanitizedResponseMessages.map((m, idx) =>
          toMessageRow(m, sanitizedRequestMessages.length + idx, response.choices[idx]?.finish_reason ?? null),
        ),
      ];

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

      log.debug({ conversationId, isUpdate, storeHash }, "[Postgres] Conversation stored");
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
              await storeConversationPostgres(requestMessages, formattedResponse, latency, requestData);
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
      await storeConversationPostgres(requestMessages, jsonResponse, latency, requestData);
      return NextResponse.json(jsonResponse);
    }
  } catch (error) {
    log.error(error, "[API Error]");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import opensearchClient, { PROMPT_KEEPER_INDEX } from "@/lib/opensearch";
import crypto from "crypto";

// Constants
const CONFIG = {
  LITELLM_URL: process.env.LITELLM_URL || "http://localhost:4000",
  REQUEST_TIMEOUT: 30000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  CORS_METHODS: process.env.CORS_METHODS || "GET, POST, OPTIONS",
  CORS_HEADERS: process.env.CORS_HEADERS || "*",
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
  content: string | { type: string; text: string }[];
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

// Helper function to generate a conversation hash based on initial messages
function generateConversationHash(messages: Message[]): string {
  if (!messages || messages.length === 0) return "";

  // For conversation continuity identification, we'll use:
  // 1. If the first message is a system message:
  //    - Use the system message and the first user message (if it exists)
  // 2. If there's no system message:
  //    - Use only the first user message

  const messagesToHash: Message[] = [];

  // Find system and first user message
  const systemMessage = messages.find((msg) => msg.role === "system");
  const firstUserMessage = messages.find((msg) => msg.role === "user");

  if (systemMessage) {
    messagesToHash.push(systemMessage);
    if (firstUserMessage) {
      messagesToHash.push(firstUserMessage);
    }
  } else if (firstUserMessage) {
    messagesToHash.push(firstUserMessage);
  } else {
    // Fallback: use the first message whatever it is
    messagesToHash.push(messages[0]);
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
function sanitizeMessage(message: {
  content: string | { type: string; text: string }[];
}) {
  // If message is a simple string content
  if (typeof message.content === "string") {
    return message;
  }

  // If message content is an array (multimodal content)
  if (Array.isArray(message.content)) {
    return {
      ...message,
      content: message.content
        .filter((item: { type: string }) => item.type === "text")
        .map((item: { text: string }) => item.text)
        .join("\n"),
    };
  }

  return message;
}

async function storeConversation(
  requestMessages: Message[],
  response: FormattedResponse,
  latency: number
) {
  try {
    // Sanitize all messages before storing
    const sanitizedRequestMessages = requestMessages.map(sanitizeMessage);
    const sanitizedResponseMessages = response.choices.map((choice) =>
      sanitizeMessage(choice.message)
    );

    // Combine sanitized messages
    const allMessages = [
      ...sanitizedRequestMessages,
      ...sanitizedResponseMessages,
    ];

    // Generate conversation hash based on the initial messages
    const conversationHash = generateConversationHash(requestMessages);

    console.debug("[OpenSearch] Processing conversation", {
      messageCount: requestMessages.length,
      conversationHash,
      firstMessageRole: requestMessages[0]?.role || "none",
    });

    // If we have a valid hash and more than one message (likely a continuation)
    if (conversationHash && requestMessages.length > 1) {
      try {
        // Try to find an existing conversation with the same conversation hash
        const searchResponse = await opensearchClient.search({
          index: PROMPT_KEEPER_INDEX,
          body: {
            query: {
              term: {
                "conversation_hash.keyword": conversationHash,
              },
            },
            sort: [{ timestamp: { order: "desc" } }],
            size: 1,
          },
        });

        const hits = searchResponse.body.hits.hits;

        if (hits && hits.length > 0) {
          const existingConversation = hits[0];
          const existingId = existingConversation._id;

          console.debug("[OpenSearch] Found existing conversation", {
            hash: conversationHash,
            id: existingId,
            existingMessageCount:
              existingConversation._source?.messages?.length || 0,
            updatingToMessageCount: allMessages.length,
          });

          // Update the existing conversation with new messages
          await opensearchClient.update({
            index: PROMPT_KEEPER_INDEX,
            id: existingId,
            body: {
              doc: {
                timestamp: new Date(), // Update timestamp to now
                messages: allMessages,
                usage: response.usage,
                latency,
                conversation_hash: conversationHash,
                updated_at: new Date(),
              },
            },
          });

          console.debug("[OpenSearch] Updated existing conversation", {
            id: existingId,
          });
          return;
        } else {
          console.debug(
            "[OpenSearch] No existing conversation found with hash",
            conversationHash
          );
        }
      } catch (searchError) {
        console.error(
          "[OpenSearch] Error searching for existing conversation:",
          searchError
        );
        // Continue to create a new document if search fails
      }
    }

    // If no existing conversation found, or if this is a new conversation
    // Create a new document
    const indexResult = await opensearchClient.index({
      index: PROMPT_KEEPER_INDEX,
      body: {
        timestamp: new Date(),
        model: response.model,
        messages: allMessages,
        usage: response.usage,
        latency,
        conversation_hash: conversationHash,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    console.debug("[OpenSearch] Created new conversation", {
      id: indexResult.body._id,
      hash: conversationHash,
      messageCount: allMessages.length,
    });
  } catch (error) {
    console.error("[OpenSearch Storage Error]", error);
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Log the incoming request details
    const requestBody = await req.text();
    const parsedBody = JSON.parse(requestBody);

    console.debug("[Incoming Chat Completions Request]", {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      body: JSON.stringify(parsedBody, null, 2), // Fully stringify the body with formatting
      messages: JSON.stringify(parsedBody.messages, null, 2), // Explicitly stringify messages
      timestamp: new Date().toISOString(),
    });

    const forwardHeaders = new Headers(req.headers);
    skipHeaders.forEach((header) => forwardHeaders.delete(header));

    const requestData = parsedBody; // Use already parsed body
    const requestMessages = requestData.messages || [];

    const response = await fetch(`${CONFIG.LITELLM_URL}/v1/chat/completions`, {
      method: "POST",
      headers: forwardHeaders,
      body: requestBody,
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      console.error("[Chat Completions API Error]", {
        status: response.status,
        statusText: response.statusText,
        error: await response.text(),
      });
      return NextResponse.json(
        { error: await response.text() },
        { status: response.status }
      );
    }

    const latency = Date.now() - startTime;

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const { readable, writable } = new TransformStream();
      const chunks: StreamChunk[] = [];

      const reader = response.body?.getReader();
      if (!reader) {
        return NextResponse.json(
          { error: "No reader available" },
          { status: 500 }
        );
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
              await storeConversation(
                requestMessages,
                formattedResponse,
                latency
              );
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
                } catch (e) {
                  console.error("[Stream Parse Error]", {
                    error: e,
                    line,
                    bufferState: buffer,
                    isLastLine: lines.indexOf(line) === lines.length - 1,
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error("[Stream Processing Error]", error);
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
      await storeConversation(requestMessages, jsonResponse, latency);
      return NextResponse.json(jsonResponse);
    }
  } catch (err) {
    console.error("[API Error]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

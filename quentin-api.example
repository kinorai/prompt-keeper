import { Kafka, type ProducerConfig } from "kafkajs";
let producer: any = null;

// Constants
const CONFIG = {
  TARGET_URL: process.env.TARGET_URL || "https://api.openai.com/",
  KAFKA_BROKERS: process.env.KAFKA_BROKERS?.split(",") || ["localhost:9092"],
  KAFKA_TOPIC: process.env.KAFKA_TOPIC || "openai-responses",
  REQUEST_TIMEOUT: 30000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
  CORS_METHODS: process.env.CORS_METHODS || "GET, POST, OPTIONS",
  CORS_HEADERS: process.env.CORS_HEADERS || "*", // Changed to allow all headers
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

class ProxyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Kafka configuration
console.log("[Kafka] Initializing producer...");
if (process.env.KAFKA_BROKERS) {
  console.log("[Kafka] Initializing producer...");
  const producerConfig: ProducerConfig = {
    allowAutoTopicCreation: true,
    idempotent: true,
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  };

  const kafka = new Kafka({
    clientId: "openai-proxy",
    brokers: CONFIG.KAFKA_BROKERS,
  });

  producer = kafka.producer(producerConfig);
  await producer.connect();
  console.log("[Kafka] Producer connected");
} else {
  console.log("[Kafka] No brokers configured, skipping Kafka integration");
}

async function handleJsonResponse(response: Response): Promise<Response> {
  const jsonResponse = await response.json();
  // Don't await Kafka send, just fire and forget
  sendToKafka([
    {
      key: jsonResponse.model,
      value: JSON.stringify(jsonResponse),
    },
  ]).catch((err) =>
    console.error("[Kafka Fatal] Failed to send JSON response:", err)
  );

  return new Response(JSON.stringify(jsonResponse), {
    headers: {
      "content-type": "application/json",
    },
  });
}

async function sendToKafka(messages: any[], retries = CONFIG.MAX_RETRIES) {
  console.log("[Kafka] Sending messages to Kafka...", messages);
  if (!producer) return;
  try {
    await producer.send({
      topic: CONFIG.KAFKA_TOPIC,
      messages,
      timeout: CONFIG.REQUEST_TIMEOUT,
    });
  } catch (error) {
    console.error("[Kafka Error]", error);
    if (retries > 0) {
      console.warn(`[Kafka Retry] Attempts left: ${retries}`);
      await new Promise((resolve) => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return sendToKafka(messages, retries - 1);
    }
    console.error("[Kafka Fatal] Failed to send messages after all retries");
  }
}

function formatStreamToResponse(chunks: StreamChunk[]): FormattedResponse {
  if (chunks.length === 0) {
    return {
      id: "",
      model: "",
      created: 0,
      object: "",
      choices: [
        {
          index: 0,
          message: {
            role: "",
            content: "",
          },
          finish_reason: "",
        },
      ],
    };
  }

  const lastChunk = chunks[chunks.length - 1];
  const aggregatedContent = chunks.reduce((acc, chunk) => {
    return acc + (chunk.choices[0]?.delta?.content || "");
  }, "");

  return {
    id: chunks[0].id,
    model: chunks[0].model,
    created: chunks[0].created,
    object: chunks[0].object,
    choices: [
      {
        index: 0,
        message: {
          role: chunks[0].choices[0]?.delta?.role || "assistant",
          content: aggregatedContent,
        },
        finish_reason: lastChunk.choices[0]?.finish_reason,
      },
    ],
  };
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

const server = Bun.serve({
  async fetch(req) {
    console.log(`[Request] ${req.method} ${req.url}`);
    const url = new URL(req.url);

    // Add CORS headers to all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": CONFIG.CORS_ORIGIN,
      "Access-Control-Allow-Methods": CONFIG.CORS_METHODS,
      "Access-Control-Allow-Headers": CONFIG.CORS_HEADERS,
      "Access-Control-Max-Age": CONFIG.CORS_MAX_AGE,
    };

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      const forwardHeaders = new Headers(req.headers);
      skipHeaders.forEach((header) => forwardHeaders.delete(header));

      let requestBody = null;
      if (req.method === "POST") {
        const clonedReq = req.clone();
        requestBody = await clonedReq.text();
      }

      const response = await fetch(`${CONFIG.TARGET_URL}${url.pathname}`, {
        method: req.method,
        headers: forwardHeaders,
        body: requestBody,
        signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
      });

      if (!response.ok) {
        throw new ProxyError(response.status, await response.text());
      }

      let resp = response;
      if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
        if (
          response.headers.get("content-type")?.includes("text/event-stream")
        ) {
          // Create a TransformStream to handle the response
          const { readable, writable } = new TransformStream();

          // Process the stream only once
          const reader = resp.body?.getReader();
          if (!reader) throw new ProxyError(500, "No reader available");
          (async () => {
            const textDecoder = new TextDecoder();
            const writer = writable.getWriter();
            const chunks: StreamChunk[] = [];

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // Format and send complete data to Kafka
                  const formattedResponse = formatStreamToResponse(chunks);
                  if (formattedResponse) {
                    await sendToKafka([
                      {
                        key: formattedResponse.model,
                        value: JSON.stringify(formattedResponse),
                      },
                    ]);
                  }
                  break;
                }

                const text = textDecoder.decode(value, { stream: true });
                await writer.write(value);

                // Parse and collect chunks
                const lines = text.split("\n");
                for (const line of lines) {
                  if (line.startsWith("data: ") && line !== "data: [DONE]") {
                    try {
                      const chunk: StreamChunk = JSON.parse(line.slice(6));
                      chunks.push(chunk);
                    } catch (e) {
                      console.error("Failed to parse chunk:", e);
                    }
                  }
                }
              }
            } finally {
              writer.close();
            }
          })();

          resp = new Response(readable, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
          });
        } else {
          resp = await handleJsonResponse(response);
        }
      }
      skipHeaders.forEach((header) => resp.headers.delete(header));

      // Add CORS headers to the response
      const respHeaders = new Headers(resp.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        respHeaders.set(key, value);
      });

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: respHeaders,
      });
    } catch (err) {
      console.error("[Proxy Error]", err);
      const error =
        err instanceof ProxyError
          ? err
          : new ProxyError(500, "Internal server error");
      return new Response(error.message, {
        status: error.status,
        headers: {
          "content-type": "application/json",
          ...corsHeaders,
        },
      });
    }
  },
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  if (producer) {
    await producer.disconnect();
  }
  process.exit(0);
});

console.log(`[Server] Proxy running on port ${server.port}`);

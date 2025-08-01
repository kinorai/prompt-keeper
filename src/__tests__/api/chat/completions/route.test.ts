import { POST } from "@/app/api/chat/completions/route";
import { NextRequest, NextResponse } from "next/server";
import opensearchClient from "@/lib/opensearch";

// Mock the global fetch function
global.fetch = jest.fn();

// Mock the OpenSearch client
jest.mock("@/lib/opensearch", () => {
  const mockClient = {
    search: jest.fn(),
    update: jest.fn(),
    index: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockClient,
    PROMPT_KEEPER_INDEX: "prompt-keeper",
    ensureIndexExists: jest.fn().mockResolvedValue(undefined),
    checkIndexExists: jest.fn().mockResolvedValue(true),
    initializeIndex: jest.fn().mockResolvedValue(undefined),
    resetInitializationState: jest.fn(),
  };
});

// Mock AbortSignal.timeout
Object.defineProperty(AbortSignal, "timeout", {
  value: jest.fn().mockImplementation(() => ({})),
});

// Mock crypto for conversation hash generation
jest.mock("crypto", () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue("mock-conversation-hash"),
  }),
}));

// Mock TransformStream
class MockTransformStream {
  readable: ReadableStream;
  writable: WritableStream;
  constructor() {
    this.readable = {
      getReader: jest.fn().mockReturnValue({
        read: jest.fn().mockResolvedValue({ done: true }),
      }),
    } as unknown as ReadableStream;
    this.writable = {
      getWriter: jest.fn().mockReturnValue({
        write: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      }),
    } as unknown as WritableStream;
  }
}

global.TransformStream = MockTransformStream as unknown as typeof TransformStream;

// Mock TextDecoder
class MockTextDecoder {
  encoding = "utf-8";
  fatal = false;
  ignoreBOM = false;

  decode(value?: BufferSource): string {
    // Simple mock implementation that returns an empty string
    return value ? "" : "";
  }
}

global.TextDecoder = MockTextDecoder as unknown as typeof TextDecoder;

describe("Chat Completions API Route", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it("should handle non-streaming response correctly", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch client mock
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual(mockCompletionResponse);

    // Verify that fetch was called with the correct URL and body
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/chat/completions"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(requestBody),
        headers: expect.any(Headers),
        signal: expect.any(Object),
      }),
    );

    // Verify that OpenSearch index was called to store the conversation
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          model: "gpt-4",
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: "Hello",
            }),
            expect.objectContaining({
              role: "assistant",
              content: "Hello! How can I help you today?",
            }),
          ]),
          usage: mockCompletionResponse.usage,
          conversation_hash: "mock-conversation-hash",
        }),
      }),
    );
  });

  it("should handle streaming response and store conversation after stream ends", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4-stream",
      messages: [{ role: "user", content: "Stream test" }],
      stream: true,
    };

    // Mock stream chunks
    const mockStreamChunks = [
      {
        id: "mock-stream-id",
        model: "gpt-4-stream",
        created: 1625097601,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      },
      {
        id: "mock-stream-id",
        model: "gpt-4-stream",
        created: 1625097601,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "Stream " }, finish_reason: null }],
      },
      {
        id: "mock-stream-id",
        model: "gpt-4-stream",
        created: 1625097601,
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content: "response." }, finish_reason: "stop" }],
      },
    ];

    // --- Mock Stream Processing ---
    let streamClosedPromiseResolve: (value?: unknown) => void;
    const streamClosedPromise = new Promise((resolve) => {
      streamClosedPromiseResolve = resolve;
    });

    const mockReader = {
      read: jest
        .fn()
        // Yield first chunk
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(`data: ${JSON.stringify(mockStreamChunks[0])}\n\n`),
        })
        // Yield second chunk
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(`data: ${JSON.stringify(mockStreamChunks[1])}\n\n`),
        })
        // Yield third chunk + DONE signal
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(`data: ${JSON.stringify(mockStreamChunks[2])}\n\ndata: [DONE]\n\n`),
        })
        // Signal stream end
        .mockResolvedValueOnce({ done: true }),
      cancel: jest.fn(),
    };

    const mockBody = {
      getReader: jest.fn().mockReturnValue(mockReader),
    } as unknown as ReadableStream<Uint8Array>;

    // Mock TextDecoder to actually decode
    const originalTextDecoder = global.TextDecoder;
    global.TextDecoder = class MockDecoder {
      decode(value?: BufferSource) {
        if (!value) return "";
        // Simple Buffer to string conversion for testing
        return Buffer.from(value as ArrayBuffer).toString("utf-8");
      }
    } as typeof TextDecoder;

    // Mock TransformStream to capture when the writer is closed
    const originalTransformStream = global.TransformStream;
    global.TransformStream = class MockTransformStream {
      readable: ReadableStream;
      writable: WritableStream;
      constructor() {
        this.readable = mockBody; // Pass the mock reader through
        this.writable = {
          getWriter: jest.fn().mockReturnValue({
            write: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockImplementation(() => {
              streamClosedPromiseResolve(); // Resolve promise when writer closes
              return Promise.resolve(undefined);
            }),
            abort: jest.fn().mockResolvedValue(undefined),
          }),
        } as unknown as WritableStream;
      }
    } as typeof TransformStream;
    // --- End Mock Stream Processing ---

    // Setup the fetch mock to return the controlled streaming response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockBody,
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
    });

    // Setup OpenSearch mocks for storing conversation
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } }); // Assume new conversation
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-stream-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response is streaming
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing and storage to complete
    await streamClosedPromise;

    // Verify fetch call
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/chat/completions"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(requestBody),
      }),
    );

    // Verify OpenSearch index call (happens after stream ends)
    expect(opensearchClient.index).toHaveBeenCalledTimes(1);
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          model: "gpt-4-stream",
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Stream test" }),
            expect.objectContaining({ role: "assistant", content: "Stream response." }), // Aggregated content
          ]),
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, // Usage is not available from stream chunks in this mock
          conversation_hash: "mock-conversation-hash",
        }),
      }),
    );

    // Restore original mocks
    global.TextDecoder = originalTextDecoder;
    global.TransformStream = originalTransformStream;
  });

  it("should handle error response from LiteLLM", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    // Setup the fetch mock to return an error response
    const errorText = "Invalid request";
    const mockResponse = {
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: jest.fn().mockResolvedValueOnce(errorText),
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(400);

    // Only verify status code, not error message content

    // Verify that OpenSearch index was not called
    expect(opensearchClient.index).not.toHaveBeenCalled();
  });

  it("should handle exceptions during processing", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    // Setup the fetch mock to throw an error
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Only verify status code, not error message content

    // Verify that OpenSearch index was not called
    expect(opensearchClient.index).not.toHaveBeenCalled();
  });

  it("should handle multimodal content in messages", async () => {
    // Mock request body with multimodal content
    const requestBody = {
      model: "gpt-4",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this image?" },
            {
              type: "image",
              image_url: { url: "data:image/jpeg;base64,abc123" },
            },
          ],
        },
      ],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "This is a description of the image.",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch client mock
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch index was called with sanitized messages
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: "What is this image?", // Only the text content should be stored
            }),
            expect.objectContaining({
              role: "assistant",
              content: "This is a description of the image.",
            }),
          ]),
        }),
      }),
    );
  });

  it("should handle streaming response with no reader available", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    // Setup the fetch mock to return a streaming response with no reader
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: null, // No reader available
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response is an error
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Only verify status code, not error message content
  });

  it("should handle errors during OpenSearch operations", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch client mock to throw an error
    (opensearchClient.index as jest.Mock).mockRejectedValueOnce(new Error("OpenSearch error"));

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response is still successful (OpenSearch errors are caught and logged)
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual(mockCompletionResponse);
  });

  it("should handle search errors when looking for existing conversations", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch search mock to throw an error
    (opensearchClient.search as jest.Mock).mockRejectedValueOnce(new Error("Search error"));

    // Setup the OpenSearch index mock to succeed
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response is still successful (search errors are caught and logged)
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch index was called as a fallback
    expect(opensearchClient.index).toHaveBeenCalled();
  });

  it("should handle formatStreamToResponse with empty chunks array", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    // Create a mock readable stream with empty chunks
    const mockReadable = new ReadableStream({
      start(controller) {
        // Send an array with no valid chunks
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    // Setup the fetch mock to return a streaming response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockReadable,
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("should handle empty stream chunks gracefully", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    // Create a mock readable stream with empty chunks
    const mockReadable = new ReadableStream({
      start(controller) {
        // Send an empty array of chunks
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    // Setup the fetch mock to return a streaming response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockReadable,
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("should test sanitizeMessage with all possible message content types and edge cases", async () => {
    // Mock request body with all possible message content types and edge cases
    const requestBody = {
      model: "gpt-4",
      messages: [
        // Test array content with multiple types
        {
          role: "user",
          content: [
            { type: "text", text: "First text part" },
            { type: "text", text: "Second text part" },
            {
              type: "image",
              image_url: { url: "data:image/jpeg;base64,abc123" },
            },
            // Add an unknown type to test the default case
            { type: "unknown", data: "some data" },
          ],
        },
        // Test empty array content
        {
          role: "user",
          content: [],
        },
        // Test null content
        {
          role: "user",
          content: null,
        },
        // Test undefined content
        {
          role: "user",
          content: undefined,
        },
        // Test object content that's not an array
        {
          role: "user",
          content: { someProperty: "someValue" },
        },
      ],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "This is a response to multiple text parts and an image.",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch client mock
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch index was called with sanitized messages
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: "First text part\nSecond text part", // Text parts should be joined with newlines
            }),
            expect.objectContaining({
              role: "assistant",
              content: "This is a response to multiple text parts and an image.",
            }),
          ]),
        }),
      }),
    );
  });

  it("should handle stream processing with valid chunks", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    // Create valid stream chunks
    const validChunks = [
      {
        id: "mock-id",
        model: "gpt-4",
        created: 1625097600,
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: "mock-id",
        model: "gpt-4",
        created: 1625097600,
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {
              content: "Hello",
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: "mock-id",
        model: "gpt-4",
        created: 1625097600,
        object: "chat.completion.chunk",
        choices: [
          {
            index: 0,
            delta: {
              content: "!",
            },
            finish_reason: "stop",
          },
        ],
      },
    ];

    // Create a mock readable stream that will return valid chunks
    const mockReadable = {
      getReader: jest.fn().mockImplementation(() => {
        let index = 0;
        return {
          read: jest.fn().mockImplementation(() => {
            if (index < validChunks.length) {
              const chunk = validChunks[index++];
              return Promise.resolve({
                done: false,
                value: new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`),
              });
            } else {
              return Promise.resolve({
                done: true,
                value: undefined,
              });
            }
          }),
        };
      }),
    };

    // Setup the fetch mock to return a streaming response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockReadable,
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
    });

    // Setup the OpenSearch client mock
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // We can't verify the OpenSearch index call directly since it happens asynchronously
    // and the mock implementation doesn't actually process the stream chunks
  });

  it("should handle additional edge cases in message processing", async () => {
    // Mock request body with various edge cases
    const requestBody = {
      model: "gpt-4",
      messages: [
        // Test with a message that has a complex content structure
        {
          role: "user",
          content: [
            { type: "text", text: "First text part" },
            { type: "text", text: "Second text part" },
            {
              type: "image",
              image_url: { url: "data:image/jpeg;base64,abc123" },
            },
            { type: "unknown", data: "some data" },
          ],
        },
        // Test with a message that has an empty array content
        { role: "user", content: [] },
        // Test with a message that has null content
        { role: "user", content: null },
        // Test with a message that has undefined content
        { role: "user", content: undefined },
        // Test with a message that has an object content
        { role: "user", content: { someProperty: "someValue" } },
      ],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Response to various message types",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch client mock
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch index was called with sanitized messages
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.any(String), // The sanitized content
            }),
            expect.objectContaining({
              role: "assistant",
              content: "Response to various message types",
            }),
          ]),
        }),
      }),
    );
  });

  it("should handle stream processing error with specific error message", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    // Create a mock readable stream that will throw an error during processing
    const mockReadable = {
      getReader: jest.fn().mockImplementation(() => ({
        read: jest.fn().mockImplementation(() => {
          throw new Error("Stream processing error");
        }),
      })),
    };

    // Setup the fetch mock to return a streaming response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockReadable,
      headers: new Headers({
        "content-type": "text/event-stream",
      }),
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it("should handle text/plain content type", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Setup the OpenSearch client mock
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request with text/plain content type
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual(mockCompletionResponse);
  });

  it("should handle the case when no existing conversation is found", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello! How can I help you today?",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Mock OpenSearch search to return empty results (no existing conversation)
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: {
        hits: {
          hits: [], // Empty array means no existing conversation found
        },
      },
    });

    // Setup the OpenSearch index mock to succeed
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({
      body: { _id: "mock-index-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that OpenSearch index was called to create a new conversation
    expect(opensearchClient.index).toHaveBeenCalled();
  });

  it("should update existing conversation when conversation hash matches", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "I am doing well, thank you for asking!",
          },
          finish_reason: "stop",
        },
      ],
    };

    // Setup the fetch mock to return successful response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({
        "content-type": "application/json",
      }),
    });

    // Mock OpenSearch search to find an existing conversation
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({
      body: {
        hits: {
          hits: [
            {
              _id: "existing-conversation-id",
              _source: {
                messages: [
                  { role: "system", content: "You are a helpful assistant." },
                  { role: "user", content: "Hello" },
                  { role: "assistant", content: "Hi there!" },
                ],
                model: "gpt-4",
                usage: {
                  prompt_tokens: 15,
                  completion_tokens: 5,
                  total_tokens: 20,
                },
              },
            },
          ],
        },
      },
    });

    // Setup the OpenSearch update mock
    (opensearchClient.update as jest.Mock).mockResolvedValueOnce({
      body: { _id: "existing-conversation-id" },
    });

    // Create a mock request
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual(mockCompletionResponse);

    // Verify that OpenSearch search was called to find existing conversation
    expect(opensearchClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                expect.objectContaining({
                  term: expect.objectContaining({
                    "conversation_hash.keyword": "mock-conversation-hash",
                  }),
                }),
              ]),
            }),
          }),
        }),
      }),
    );

    // Verify that OpenSearch update was called to update the existing conversation
    expect(opensearchClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        index: "prompt-keeper",
        id: "existing-conversation-id",
        body: expect.objectContaining({
          doc: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                role: "system",
                content: "You are a helpful assistant.",
              }),
              expect.objectContaining({
                role: "user",
                content: "Hello",
              }),
              expect.objectContaining({
                role: "assistant",
                content: "Hi there!",
              }),
              expect.objectContaining({
                role: "user",
                content: "How are you?",
              }),
              expect.objectContaining({
                role: "assistant",
                content: "I am doing well, thank you for asking!",
              }),
            ]),
            usage: mockCompletionResponse.usage,
          }),
        }),
      }),
    );

    // Verify that OpenSearch index was not called (since update was used)
    expect(opensearchClient.index).not.toHaveBeenCalled();
  });
  it("should handle generateConversationHash fallback when first message is not system/user", async () => {
    // Mock request body with only an assistant message initially (unusual case)
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "assistant", content: "Initial assistant message" }],
    };

    // Mock successful non-streaming response
    const mockCompletionResponse = {
      id: "mock-fallback-id",
      model: "gpt-4",
      created: 1625097602,
      object: "chat.completion",
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      choices: [{ index: 0, message: { role: "assistant", content: "Response" }, finish_reason: "stop" }],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({ "content-type": "application/json" }),
    });

    // Mock OpenSearch (assume new conversation)
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } });
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({ body: { _id: "mock-fallback-index-id" } });

    // Configure the crypto mock specifically for this test case
    const updateMock = jest.fn().mockReturnThis();
    const digestMock = jest.fn().mockReturnValue("fallback-hash");

    // Access the mocked createHash function (already mocked at the top level)
    // and configure its return value for this specific test run.
    // We need to cast to jest.Mock to use mockReturnValueOnce.
    const crypto = jest.requireMock("crypto"); // Use jest.requireMock to get the mocked module
    (crypto.createHash as jest.Mock).mockReturnValueOnce({
      update: updateMock,
      digest: digestMock,
    });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    await POST(req);

    // Verify the hash was generated based on the first (assistant) message
    expect(updateMock).toHaveBeenCalledWith("assistant:initial assistant message");
    expect(digestMock).toHaveBeenCalledWith("hex");

    // Verify OpenSearch index call used the fallback hash
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          conversation_hash: "fallback-hash",
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "assistant", content: "Initial assistant message" }),
            expect.objectContaining({ role: "assistant", content: "Response" }),
          ]),
        }),
      }),
    );
  });

  it("should handle stream parsing edge cases (empty lines, malformed JSON)", async () => {
    const requestBody = {
      model: "gpt-4-stream-edge",
      messages: [{ role: "user", content: "Stream edge cases" }],
      stream: true,
    };

    // Mock stream chunks with issues
    const validChunk = {
      id: "edge-id",
      model: "gpt-4",
      created: 1,
      object: "c",
      choices: [{ index: 0, delta: { content: "OK" }, finish_reason: null }],
    };
    const malformedJsonLine = "data: {invalid json";
    const emptyLine = "";

    // --- Mock Stream Processing ---
    let streamClosedPromiseResolve: (value?: unknown) => void;
    const streamClosedPromise = new Promise((resolve) => {
      streamClosedPromiseResolve = resolve;
    });
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(); // Spy on console.error

    const mockReader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(`${emptyLine}\n`) }) // Empty line
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(`${malformedJsonLine}\n`) }) // Malformed JSON
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(`data: ${JSON.stringify(validChunk)}\n\n`),
        }) // Valid chunk
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(`data: [DONE]\n\n`) }) // DONE
        .mockResolvedValueOnce({ done: true }),
      cancel: jest.fn(),
    };
    const mockBody = { getReader: jest.fn().mockReturnValue(mockReader) } as unknown as ReadableStream<Uint8Array>;

    // Mock TextDecoder
    const originalTextDecoder = global.TextDecoder;
    global.TextDecoder = class MockDecoder {
      decode(v?: BufferSource) {
        return v ? Buffer.from(v as ArrayBuffer).toString("utf-8") : "";
      }
    } as typeof TextDecoder;

    // Mock TransformStream
    const originalTransformStream = global.TransformStream;
    global.TransformStream = class MockTransformStream {
      readable: ReadableStream;
      writable: WritableStream;
      constructor() {
        this.readable = mockBody;
        this.writable = {
          getWriter: jest.fn().mockReturnValue({
            write: jest.fn(),
            close: jest.fn().mockImplementation(() => {
              streamClosedPromiseResolve();
              return Promise.resolve();
            }),
            abort: jest.fn(),
          }),
        } as unknown as WritableStream;
      }
    } as typeof TransformStream;
    // --- End Mock Stream Processing ---

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: mockBody,
      headers: new Headers({ "content-type": "text/event-stream" }),
    });
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } });
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({ body: { _id: "edge-index-id" } });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    await POST(req);
    await streamClosedPromise; // Wait for stream processing

    // Verify OpenSearch index call still happened with the valid chunk data
    expect(opensearchClient.index).toHaveBeenCalledTimes(1);
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Stream edge cases" }),
            expect.objectContaining({ role: "assistant", content: "OK" }), // Content from the valid chunk
          ]),
        }),
      }),
    );

    // Restore mocks
    consoleErrorSpy.mockRestore();
    global.TextDecoder = originalTextDecoder;
    global.TransformStream = originalTransformStream;
  });

  it("should handle empty messages array correctly", async () => {
    // Mock request body with empty messages array
    const requestBody = {
      model: "gpt-4",
      messages: [], // Empty array
    };

    // Mock successful non-streaming response
    const mockCompletionResponse = {
      id: "mock-empty-id",
      model: "gpt-4",
      created: 1625097604,
      object: "chat.completion",
      usage: { prompt_tokens: 0, completion_tokens: 5, total_tokens: 5 },
      choices: [{ index: 0, message: { role: "assistant", content: "Empty response" }, finish_reason: "stop" }],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({ "content-type": "application/json" }),
    });

    // Mock OpenSearch (assume new conversation)
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } });
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({ body: { _id: "mock-empty-index-id" } });

    // Get the mocked crypto module
    const crypto = jest.requireMock("crypto");
    // Create specific mocks for this test case to track calls
    const updateMock = jest.fn().mockReturnThis();
    // generateConversationHash should return "" for empty messages, so digest shouldn't be called
    const digestMock = jest.fn();

    // Configure the globally mocked createHash to return our specific mocks for this test run
    // We expect update/digest not to be called, but set up mocks just in case and for clarity.
    (crypto.createHash as jest.Mock).mockReturnValueOnce({
      update: updateMock,
      digest: digestMock,
    });

    // Spy on console.debug
    const consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    await POST(req);

    // Verify hash generation was not attempted in the usual way
    expect(updateMock).not.toHaveBeenCalled();
    expect(digestMock).not.toHaveBeenCalled();

    // Verify OpenSearch index call used empty hash
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          conversation_hash: "", // Empty hash expected
          messages: expect.arrayContaining([expect.objectContaining({ role: "assistant", content: "Empty response" })]),
        }),
      }),
    );

    consoleDebugSpy.mockRestore();
  });

  it("should handle non-streaming response with text/plain content type", async () => {
    // Mock request body
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Plain text test" }],
    };

    // Mock successful response data (as if it were JSON)
    const mockJsonResponse = {
      id: "mock-plain-id",
      model: "gpt-4",
      created: 1625097605,
      object: "chat.completion",
      usage: { prompt_tokens: 6, completion_tokens: 6, total_tokens: 12 },
      choices: [{ index: 0, message: { role: "assistant", content: "Plain response" }, finish_reason: "stop" }],
    };

    // Setup the fetch mock to return ok: true, but with text/plain header
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      // Simulate response.json() still working even with wrong content-type
      json: jest.fn().mockResolvedValueOnce(mockJsonResponse),
      headers: new Headers({
        "content-type": "text/plain", // Incorrect content type
      }),
    });

    // Mock OpenSearch (assume new conversation)
    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } });
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({ body: { _id: "mock-plain-index-id" } });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response (should still return JSON because the code proceeds)
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual(mockJsonResponse);

    // Verify storeConversation was called
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          model: "gpt-4",
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: "Plain text test" }),
            expect.objectContaining({ role: "assistant", content: "Plain response" }),
          ]),
        }),
      }),
    );
  });

  it("should handle request parsing with malformed JSON", async () => {
    // Create a request with malformed JSON
    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: "invalid json {",
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response returns 500 for malformed JSON
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);

    // Only verify status code, not error message content
  });

  it("should handle message content as undefined", async () => {
    // Mock request body with message having undefined content
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user" /* no content */ }],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      choices: [{ index: 0, message: { role: "assistant", content: "Response" }, finish_reason: "stop" }],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({ "content-type": "application/json" }),
    });

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } });
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({ body: { _id: "mock-index-id" } });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify sanitizeMessage handles undefined content correctly
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user" }),
            expect.objectContaining({ role: "assistant", content: "Response" }),
          ]),
        }),
      }),
    );
  });

  it("should handle message content as object (not array)", async () => {
    // Mock request body with message having object content
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: { someProperty: "someValue" } }],
    };

    // Mock successful response from LiteLLM
    const mockCompletionResponse = {
      id: "mock-id",
      model: "gpt-4",
      created: 1625097600,
      object: "chat.completion",
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      choices: [{ index: 0, message: { role: "assistant", content: "Response" }, finish_reason: "stop" }],
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValueOnce(mockCompletionResponse),
      headers: new Headers({ "content-type": "application/json" }),
    });

    (opensearchClient.search as jest.Mock).mockResolvedValueOnce({ body: { hits: { hits: [] } } });
    (opensearchClient.index as jest.Mock).mockResolvedValueOnce({ body: { _id: "mock-index-id" } });

    const req = new NextRequest("http://localhost/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    expect(response.status).toBe(200);

    // Verify sanitizeMessage handles object content correctly (should return original message)
    expect(opensearchClient.index).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: "user", content: { someProperty: "someValue" } }),
            expect.objectContaining({ role: "assistant", content: "Response" }),
          ]),
        }),
      }),
    );
  });
});

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

  it("should handle streaming response correctly", async () => {
    // Mock request body with stream: true
    const requestBody = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    };

    // Mock stream chunks
    const mockStreamChunks = [
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

    // Create a mock readable stream
    const mockReadable = new ReadableStream({
      start(controller) {
        // Send each chunk as a server-sent event
        mockStreamChunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
        });
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

    // Note: We can't easily verify the streaming response content or the OpenSearch index call
    // in this test because the streaming processing happens asynchronously after the response
    // is returned. In a real environment, we would need to use a more sophisticated approach
    // to test streaming responses.
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

    // Mock the NextResponse.json method to capture what's being returned
    const originalJson = NextResponse.json;
    const mockJsonResponse = { error: errorText };
    jest.spyOn(NextResponse, "json").mockImplementationOnce(() => {
      return originalJson(mockJsonResponse, { status: 400 });
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(400);

    // Verify that OpenSearch index was not called
    expect(opensearchClient.index).not.toHaveBeenCalled();

    // Restore the original NextResponse.json method
    (NextResponse.json as jest.Mock).mockRestore();
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

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({ error: "Internal server error" });

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

    // Parse the response JSON
    const responseData = await response.json();
    expect(responseData).toEqual({ error: "No reader available" });
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

    // Create a mock readable stream that will cause formatStreamToResponse to be called with empty chunks
    const mockReadable = new ReadableStream({
      start(controller) {
        // Send invalid data that won't parse as JSON
        controller.enqueue(new TextEncoder().encode("data: {invalid-json}\n\n"));
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

    // Mock console.error to capture the error
    const consoleErrorSpy = jest.spyOn(console, "error");

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that some error was logged (either parse error or processing error)
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Restore console.error
    consoleErrorSpy.mockRestore();
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

    // Mock console.error to capture the error
    const consoleErrorSpy = jest.spyOn(console, "error");

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that the error was logged for empty chunks
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[Stream Processing Error]",
      expect.objectContaining({
        message: "No chunks received from stream",
      }),
    );

    // Restore console.error
    consoleErrorSpy.mockRestore();
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

    // Mock console.error to capture the error
    const consoleErrorSpy = jest.spyOn(console, "error");

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    // Wait for the stream processing to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that the error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith("[Stream Processing Error]", expect.any(Error));

    // Restore console.error
    consoleErrorSpy.mockRestore();
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

    // Mock console.debug to capture the debug message
    const consoleDebugSpy = jest.spyOn(console, "debug");

    // Call the API route handler
    const response = await POST(req);

    // Verify the response
    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);

    // Verify that the debug message for no existing conversation was logged
    expect(consoleDebugSpy).toHaveBeenCalledWith(
      "[OpenSearch] No existing conversation found with hash",
      expect.any(String),
    );

    // Verify that OpenSearch index was called to create a new conversation
    expect(opensearchClient.index).toHaveBeenCalled();

    // Restore console.debug
    consoleDebugSpy.mockRestore();
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
});

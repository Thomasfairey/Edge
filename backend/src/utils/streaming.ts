/**
 * SSE streaming utilities for the API.
 *
 * Provides helpers for Server-Sent Events format
 * used by the iOS and web clients for real-time content delivery.
 */

/**
 * Create SSE-formatted response headers.
 */
export function sseHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
    ...extra,
  };
}

/**
 * Format a text chunk as an SSE data event.
 */
export function sseEvent(data: string, event?: string): string {
  let msg = "";
  if (event) {
    msg += `event: ${event}\n`;
  }
  // SSE data lines — split on newlines to conform to spec
  for (const line of data.split("\n")) {
    msg += `data: ${line}\n`;
  }
  msg += "\n";
  return msg;
}

/**
 * Format the SSE done event.
 */
export function sseDone(): string {
  return "event: done\ndata: [DONE]\n\n";
}

/**
 * Wrap a ReadableStream<Uint8Array> of plain text into SSE format.
 * Each text chunk becomes an SSE data event.
 */
export function wrapStreamAsSSE(
  plainStream: ReadableStream<Uint8Array>,
  metadata?: Record<string, string>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send metadata as the first event if provided
      if (metadata) {
        controller.enqueue(
          encoder.encode(sseEvent(JSON.stringify(metadata), "metadata"))
        );
      }

      const reader = plainStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(sseEvent(text)));
        }
        controller.enqueue(encoder.encode(sseDone()));
        controller.close();
      } catch {
        controller.enqueue(encoder.encode(sseEvent("Stream error", "error")));
        controller.enqueue(encoder.encode(sseDone()));
        controller.close();
      }
    },
  });
}

/**
 * Create a plain text streaming response with appropriate headers.
 * This is the simpler format used by the current implementation.
 */
export function streamingResponse(
  stream: ReadableStream<Uint8Array>,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      ...extraHeaders,
    },
  });
}

/**
 * Input validation helper for streaming endpoints.
 * Returns validated session_id or throws.
 */
export function requireSessionId(body: Record<string, unknown>): string {
  const sessionId = body.session_id;
  if (!sessionId || typeof sessionId !== "string") {
    throw new Error("session_id is required");
  }
  return sessionId;
}

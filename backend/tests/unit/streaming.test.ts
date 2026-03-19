/**
 * Unit tests for streaming utilities.
 */

import { describe, it, expect } from "vitest";
import {
  sseHeaders,
  sseEvent,
  sseDone,
  streamingResponse,
} from "../../src/utils/streaming.js";

describe("sseHeaders", () => {
  it("should return correct Content-Type", () => {
    const headers = sseHeaders();
    expect(headers["Content-Type"]).toBe("text/event-stream");
    expect(headers["Cache-Control"]).toBe("no-cache");
    expect(headers["Connection"]).toBe("keep-alive");
  });

  it("should merge extra headers", () => {
    const headers = sseHeaders({ "X-Custom": "value" });
    expect(headers["X-Custom"]).toBe("value");
    expect(headers["Content-Type"]).toBe("text/event-stream");
  });
});

describe("sseEvent", () => {
  it("should format data event correctly", () => {
    const event = sseEvent("hello world");
    expect(event).toBe("data: hello world\n\n");
  });

  it("should include event type when provided", () => {
    const event = sseEvent("test data", "metadata");
    expect(event).toContain("event: metadata\n");
    expect(event).toContain("data: test data\n");
  });

  it("should handle multi-line data", () => {
    const event = sseEvent("line1\nline2");
    expect(event).toContain("data: line1\n");
    expect(event).toContain("data: line2\n");
  });
});

describe("sseDone", () => {
  it("should return done event", () => {
    const done = sseDone();
    expect(done).toContain("event: done");
    expect(done).toContain("[DONE]");
  });
});

describe("streamingResponse", () => {
  it("should return Response with correct content type", () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("test"));
        controller.close();
      },
    });

    const response = streamingResponse(stream);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
  });

  it("should include extra headers", () => {
    const _encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const response = streamingResponse(stream, { "X-Test": "value" });
    expect(response.headers.get("X-Test")).toBe("value");
  });
});

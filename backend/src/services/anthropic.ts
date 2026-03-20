/**
 * Anthropic Claude API wrapper.
 *
 * Split architecture:
 * - Sonnet 4.5 for all primary phases
 * - Haiku 4.5 for /coach and latency fallback
 *
 * Features:
 * - Single retry on 429 with 2s delay
 * - Configurable timeouts per phase
 * - Streaming and non-streaming helpers
 * - Structured logging
 */

import Anthropic from "@anthropic-ai/sdk";
import { AIServiceError } from "../types/errors.js";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY must be set in environment variables.");
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------------------------------------------------------------------------
// Model constants
// ---------------------------------------------------------------------------

export const MODELS = {
  PRIMARY: "claude-sonnet-4-5-20250929",
  FAST: "claude-haiku-4-5-20251001",
} as const;

// ---------------------------------------------------------------------------
// Phase configs
// ---------------------------------------------------------------------------

export interface PhaseConfig {
  model: string;
  max_tokens: number;
  temperature: number;
}

export const PHASE_CONFIG: Record<string, PhaseConfig> = {
  checkin: { model: MODELS.PRIMARY, max_tokens: 200, temperature: 0.7 },
  lesson: { model: MODELS.PRIMARY, max_tokens: 1200, temperature: 0.8 },
  roleplay: { model: MODELS.PRIMARY, max_tokens: 300, temperature: 0.9 },
  coach: { model: MODELS.FAST, max_tokens: 300, temperature: 0.7 },
  debrief: { model: MODELS.PRIMARY, max_tokens: 1500, temperature: 0.6 },
  mission: { model: MODELS.PRIMARY, max_tokens: 400, temperature: 0.7 },
};

// ---------------------------------------------------------------------------
// Message type
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

async function callWithRetry(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  stream: boolean
): Promise<Anthropic.Message | AsyncIterable<Anthropic.MessageStreamEvent>> {
  const params = {
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const attempt = async (isRetry: boolean): Promise<Anthropic.Message | AsyncIterable<Anthropic.MessageStreamEvent>> => {
    try {
      if (stream) {
        return anthropic.messages.stream(params);
      } else {
        return await anthropic.messages.create(params);
      }
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Error && error.message.includes("429"));

      if (isRateLimit && !isRetry) {
        console.log(JSON.stringify({ level: "warn", service: "anthropic", message: "Rate limited — retrying in 2s", timestamp: new Date().toISOString() }));
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return attempt(true);
      }
      throw error;
    }
  };

  return attempt(false);
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Request timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ---------------------------------------------------------------------------
// Streaming helper — returns ReadableStream for SSE
// ---------------------------------------------------------------------------

export function streamResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  onComplete?: (fullText: string) => void
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = await withTimeout(
          callWithRetry(systemPrompt, messages, config, true) as Promise<AsyncIterable<Anthropic.MessageStreamEvent>>,
          30000
        );

        let tokenCount = 0;
        let fullText = "";

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            tokenCount += Math.ceil(event.delta.text.length / 4);
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        console.log(JSON.stringify({ level: "info", service: "anthropic", method: "stream", model: config.model, tokens: tokenCount, timestamp: new Date().toISOString() }));

        // Fire post-stream callback (e.g. to persist the full response)
        if (onComplete) {
          try { onComplete(fullText); } catch (e) {
            console.log(JSON.stringify({ level: "error", service: "anthropic", method: "stream_onComplete", message: e instanceof Error ? e.message : "Unknown", timestamp: new Date().toISOString() }));
          }
        }

        controller.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.log(JSON.stringify({ level: "error", service: "anthropic", method: "stream", message, timestamp: new Date().toISOString() }));
        controller.enqueue(
          encoder.encode("\n\n[System: Response generation failed. Please try again.]")
        );
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Buffered streaming — streams internally, returns full text
// ---------------------------------------------------------------------------

export async function generateResponseViaStream(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig
): Promise<string> {
  try {
    const stream = await withTimeout(
      callWithRetry(systemPrompt, messages, config, true) as Promise<AsyncIterable<Anthropic.MessageStreamEvent>>,
      90000
    );

    let fullText = "";
    let tokenCount = 0;

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text;
        tokenCount += Math.ceil(event.delta.text.length / 4);
      }
    }

    console.log(JSON.stringify({ level: "info", service: "anthropic", method: "buffered", model: config.model, tokens: tokenCount, timestamp: new Date().toISOString() }));
    return fullText;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(JSON.stringify({ level: "error", service: "anthropic", method: "buffered", message, timestamp: new Date().toISOString() }));
    throw new AIServiceError(message);
  }
}

// ---------------------------------------------------------------------------
// Non-streaming helper
// ---------------------------------------------------------------------------

export async function generateResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig
): Promise<string> {
  try {
    const response = (await withTimeout(
      callWithRetry(systemPrompt, messages, config, false),
      60000
    )) as Anthropic.Message;

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const tokenCount = response.usage?.output_tokens ?? Math.ceil(text.length / 4);
    console.log(JSON.stringify({ level: "info", service: "anthropic", method: "sync", model: config.model, tokens: tokenCount, timestamp: new Date().toISOString() }));
    return text;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(JSON.stringify({ level: "error", service: "anthropic", method: "sync", message, timestamp: new Date().toISOString() }));
    throw new AIServiceError(message);
  }
}

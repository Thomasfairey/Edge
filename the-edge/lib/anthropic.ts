/**
 * Anthropic client singleton, model constants, phase configs, and helpers.
 *
 * Provides both streaming and non-streaming generation functions with:
 * - Single retry on 429 (rate limit) with 2s delay
 * - 15-second timeout with graceful error message
 * - Console logging of phase, model, and approximate token count
 *
 * PRD Section 4.1 — split architecture:
 *   Sonnet 4.5 for all phases, Haiku 4.5 for /coach + latency fallback.
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY is not set. Add it to .env.local before starting the server."
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default anthropic;

// ---------------------------------------------------------------------------
// Model constants
// ---------------------------------------------------------------------------

export const MODELS = {
  PRIMARY: "claude-sonnet-4-5-20250929", // Roleplay, debrief, lessons, missions
  FAST: "claude-haiku-4-5-20251001", // /coach endpoint, latency fallback
} as const;

// ---------------------------------------------------------------------------
// Phase-specific generation configs
// ---------------------------------------------------------------------------

export const PHASE_CONFIG = {
  checkin: { model: MODELS.PRIMARY, max_tokens: 200, temperature: 0.7 },
  lesson: { model: MODELS.PRIMARY, max_tokens: 1200, temperature: 0.8 },
  roleplay: { model: MODELS.PRIMARY, max_tokens: 400, temperature: 0.9 },
  coach: { model: MODELS.FAST, max_tokens: 300, temperature: 0.7 },
  debrief: { model: MODELS.PRIMARY, max_tokens: 1500, temperature: 0.6 },
  mission: { model: MODELS.PRIMARY, max_tokens: 400, temperature: 0.7 },
} as const;

export type PhaseConfig = (typeof PHASE_CONFIG)[keyof typeof PHASE_CONFIG];

// ---------------------------------------------------------------------------
// Message type for helpers
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Internal: retry-aware API call
// ---------------------------------------------------------------------------

async function callWithRetry(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  stream: false
): Promise<Anthropic.Message>;
async function callWithRetry(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  stream: true
): Promise<AsyncIterable<Anthropic.MessageStreamEvent>>;
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

  const attempt = async (
    isRetry: boolean
  ): Promise<
    Anthropic.Message | AsyncIterable<Anthropic.MessageStreamEvent>
  > => {
    try {
      if (stream) {
        const streamResponse = anthropic.messages.stream(params);
        return streamResponse;
      } else {
        const response = await anthropic.messages.create(params);
        return response;
      }
    } catch (error: unknown) {
      const isRateLimit =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Error && error.message.includes("429"));

      if (isRateLimit && !isRetry) {
        console.warn("[anthropic] Rate limited — retrying in 2s...");
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
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Streaming helper
// ---------------------------------------------------------------------------

/**
 * Stream an Anthropic response as a ReadableStream of text chunks.
 * Handles rate-limit retry (once, 2s delay) and 30s timeout.
 * Errors are yielded as text in the stream rather than thrown.
 */
export function streamResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const phaseName =
    Object.entries(PHASE_CONFIG).find(
      ([, c]) => c.model === config.model && c.max_tokens === config.max_tokens
    )?.[0] ?? "unknown";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = await withTimeout(
          callWithRetry(systemPrompt, messages, config, true) as Promise<
            AsyncIterable<Anthropic.MessageStreamEvent>
          >,
          30000
        );

        let tokenCount = 0;

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            tokenCount += Math.ceil(text.length / 4); // rough estimate
            controller.enqueue(encoder.encode(text));
          }
        }

        console.log(
          `[anthropic] ${phaseName} | model=${config.model} | ~${tokenCount} tokens`
        );

        controller.close();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`[anthropic] ${phaseName} stream error: ${message}`);
        controller.enqueue(
          encoder.encode(
            `\n\n[System: Response generation failed — ${message}. Please try again.]`
          )
        );
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Streaming-buffered helper (keeps connection alive for long generations)
// ---------------------------------------------------------------------------

/**
 * Stream an Anthropic response internally, buffer all chunks, return the
 * complete text as a string. Same signature as generateResponse but uses
 * streaming under the hood to avoid idle connection timeouts on Vercel.
 */
export async function generateResponseViaStream(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig
): Promise<string> {
  const phaseName =
    Object.entries(PHASE_CONFIG).find(
      ([, c]) => c.model === config.model && c.max_tokens === config.max_tokens
    )?.[0] ?? "unknown";

  try {
    const stream = await withTimeout(
      callWithRetry(systemPrompt, messages, config, true) as Promise<
        AsyncIterable<Anthropic.MessageStreamEvent>
      >,
      90000 // 90s timeout for streaming buffer
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

    console.log(
      `[anthropic] ${phaseName} (streamed) | model=${config.model} | ~${tokenCount} tokens`
    );

    return fullText;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[anthropic] ${phaseName} stream-buffer error: ${message}`);
    return `[System: Response generation failed — ${message}. Please try again.]`;
  }
}

// ---------------------------------------------------------------------------
// Non-streaming helper
// ---------------------------------------------------------------------------

/**
 * Generate a complete Anthropic response and return the full text.
 * Used for phases where streaming isn't needed (checkin, debrief scoring, mission).
 * Handles rate-limit retry (once, 2s delay) and 60s timeout.
 */
export async function generateResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig
): Promise<string> {
  const phaseName =
    Object.entries(PHASE_CONFIG).find(
      ([, c]) => c.model === config.model && c.max_tokens === config.max_tokens
    )?.[0] ?? "unknown";

  try {
    const response = (await withTimeout(
      callWithRetry(systemPrompt, messages, config, false),
      60000
    )) as Anthropic.Message;

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const tokenCount = response.usage?.output_tokens ?? Math.ceil(text.length / 4);
    console.log(
      `[anthropic] ${phaseName} | model=${config.model} | ${tokenCount} tokens`
    );

    return text;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[anthropic] ${phaseName} generation error: ${message}`);
    return `[System: Response generation failed — ${message}. Please try again.]`;
  }
}

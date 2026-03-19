/**
 * Anthropic client singleton, model constants, phase configs, and helpers.
 *
 * Provides both streaming and non-streaming generation functions with:
 * - Single retry on 429 (rate limit) with 2s delay
 * - Configurable timeout with graceful error message
 * - Client disconnect detection (AbortController) for streaming
 * - Circuit breaker (3 consecutive failures → 30s open state)
 * - Console logging of phase, model, and approximate token count
 *
 * PRD Section 4.1 — split architecture:
 *   Sonnet 4.5 for all phases, Haiku 4.5 for /coach + latency fallback.
 */

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Client singleton (lazy init — avoids crashing at import/build time)
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  logger.error("ANTHROPIC_API_KEY is not set. Add it to .env.local before starting the server.", { phase: "anthropic" });
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export default anthropic;

// ---------------------------------------------------------------------------
// Token cost tracking — module-level counters (reset on cold start)
// ---------------------------------------------------------------------------

interface ModelTokenStats {
  input_tokens: number;
  output_tokens: number;
  requests: number;
}

const tokenStats: Record<string, ModelTokenStats> = {};

function trackTokens(model: string, input: number, output: number) {
  if (!tokenStats[model]) {
    tokenStats[model] = { input_tokens: 0, output_tokens: 0, requests: 0 };
  }
  tokenStats[model].input_tokens += input;
  tokenStats[model].output_tokens += output;
  tokenStats[model].requests += 1;
}

/**
 * Returns current session token usage stats per model.
 * Resets on cold start / redeployment.
 */
export function getTokenStats(): Record<string, ModelTokenStats> {
  const copy: Record<string, ModelTokenStats> = {};
  for (const [model, stats] of Object.entries(tokenStats)) {
    copy[model] = { ...stats };
  }
  return copy;
}

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
  roleplay: { model: MODELS.PRIMARY, max_tokens: 300, temperature: 0.9 },
  coach: { model: MODELS.FAST, max_tokens: 300, temperature: 0.7 },
  debrief: { model: MODELS.PRIMARY, max_tokens: 1500, temperature: 0.6 },
  mission: { model: MODELS.PRIMARY, max_tokens: 400, temperature: 0.7 },
} as const;

export type PhaseConfig = (typeof PHASE_CONFIG)[keyof typeof PHASE_CONFIG];

// ---------------------------------------------------------------------------
// Precomputed phase name lookup (O(1) instead of O(n) on every request)
// ---------------------------------------------------------------------------

const PHASE_NAME_MAP = new Map<string, string>();
for (const [name, config] of Object.entries(PHASE_CONFIG)) {
  PHASE_NAME_MAP.set(`${config.model}:${config.max_tokens}`, name);
}

function getPhaseLabel(config: PhaseConfig): string {
  return PHASE_NAME_MAP.get(`${config.model}:${config.max_tokens}`) ?? "unknown";
}

// ---------------------------------------------------------------------------
// Message type for helpers
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// Circuit breaker — protects against cascading failures to the Anthropic API
// ---------------------------------------------------------------------------

let cbConsecutiveFailures = 0;
let cbOpenedAt = 0; // timestamp when circuit opened (0 = closed)
const CB_FAILURE_THRESHOLD = 3;
const CB_OPEN_DURATION_MS = 30_000;

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super(
      "Anthropic API circuit breaker is open — too many consecutive failures. Retry in 30s."
    );
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Check circuit breaker state before making an API call.
 * Throws CircuitBreakerOpenError if the circuit is open.
 * Returns true if this is a half-open probe request.
 */
function cbBeforeRequest(): boolean {
  if (cbOpenedAt === 0) {
    // Circuit is closed — allow request
    return false;
  }

  const elapsed = Date.now() - cbOpenedAt;
  if (elapsed >= CB_OPEN_DURATION_MS) {
    // Half-open: allow one probe request through
    logger.info("Circuit breaker half-open — allowing probe request", { phase: "anthropic" });
    return true;
  }

  // Still open — reject immediately
  throw new CircuitBreakerOpenError();
}

/** Record a successful API response. Resets the circuit breaker. */
function cbOnSuccess(): void {
  if (cbConsecutiveFailures > 0 || cbOpenedAt > 0) {
    logger.info("Circuit breaker reset — API call succeeded", { phase: "anthropic" });
  }
  cbConsecutiveFailures = 0;
  cbOpenedAt = 0;
}

/** Record a failed API response. Opens the circuit after threshold. */
function cbOnFailure(): void {
  cbConsecutiveFailures++;
  if (cbConsecutiveFailures >= CB_FAILURE_THRESHOLD) {
    cbOpenedAt = Date.now();
    logger.warn(
      `Circuit breaker OPEN after ${cbConsecutiveFailures} consecutive failures — blocking requests for ${CB_OPEN_DURATION_MS / 1000}s`,
      { phase: "anthropic" }
    );
  }
}

// ---------------------------------------------------------------------------
// Internal: retry-aware API call (with circuit breaker + abort support)
// ---------------------------------------------------------------------------

async function callWithRetry(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  stream: false,
  signal?: AbortSignal
): Promise<Anthropic.Message>;
async function callWithRetry(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  stream: true,
  signal?: AbortSignal
): Promise<AsyncIterable<Anthropic.MessageStreamEvent>>;
async function callWithRetry(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  stream: boolean,
  signal?: AbortSignal
): Promise<Anthropic.Message | AsyncIterable<Anthropic.MessageStreamEvent>> {
  // Circuit breaker check
  cbBeforeRequest();

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
      // Check abort before making the call
      if (signal?.aborted) {
        throw new Error("Request aborted — client disconnected");
      }

      let result: Anthropic.Message | AsyncIterable<Anthropic.MessageStreamEvent>;
      if (stream) {
        result = anthropic.messages.stream(params, { signal });
      } else {
        result = await anthropic.messages.create(params, { signal });
      }

      cbOnSuccess();
      return result;
    } catch (error: unknown) {
      // Don't count aborts as failures for the circuit breaker
      if (signal?.aborted) {
        throw error;
      }

      const isRateLimit =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Error && error.message.includes("429"));

      if (isRateLimit && !isRetry) {
        logger.warn("Rate limited — retrying in 2s...", { phase: "anthropic" });
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return attempt(true);
      }

      cbOnFailure();
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
 * Handles rate-limit retry (once, 2s delay) and configurable timeout.
 * Aborts the Anthropic API call when the client disconnects (cancel).
 * Errors are yielded as text in the stream rather than thrown.
 *
 * @param timeoutMs - Timeout for the API call. Must be LESS than the
 *   route's maxDuration to avoid Vercel killing the function first.
 *   Defaults to 25_000 (25s).
 */
export function streamResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  timeoutMs: number = 25_000
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const phaseName = getPhaseLabel(config);
  const abortController = new AbortController();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = await withTimeout(
          callWithRetry(systemPrompt, messages, config, true, abortController.signal) as Promise<
            AsyncIterable<Anthropic.MessageStreamEvent>
          >,
          timeoutMs
        );

        let tokenCount = 0;

        for await (const event of stream) {
          // Check if client disconnected mid-stream
          if (abortController.signal.aborted) {
            logger.info(`${phaseName} stream aborted — client disconnected`, { phase: "anthropic" });
            break;
          }

          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            tokenCount += Math.ceil(text.length / 4); // rough estimate
            controller.enqueue(encoder.encode(text));
          }
        }

        // Track tokens (streaming: estimate input from message length)
        const estimatedInput = Math.ceil(systemPrompt.length / 4) + messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
        trackTokens(config.model, estimatedInput, tokenCount);

        logger.info(`${phaseName} | model=${config.model} | ~${tokenCount} tokens`, { phase: "anthropic", model: config.model, tokens: tokenCount });

        controller.close();
      } catch (error: unknown) {
        // If aborted by client disconnect, just close cleanly
        if (abortController.signal.aborted) {
          logger.info(`${phaseName} stream cancelled — client disconnected`, { phase: "anthropic" });
          controller.close();
          return;
        }

        // Circuit breaker open — send a clear, retryable message
        if (error instanceof CircuitBreakerOpenError) {
          logger.warn(`${phaseName} stream blocked by circuit breaker`, { phase: "anthropic" });
          controller.enqueue(
            encoder.encode(
              "AI is temporarily busy. Please try again in 30 seconds."
            )
          );
          controller.close();
          return;
        }

        const rawMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`${phaseName} stream error: ${rawMessage}`, { phase: "anthropic" });
        controller.enqueue(
          encoder.encode(
            `\n\n[System: Response generation failed. Please try again.]`
          )
        );
        controller.close();
      }
    },

    cancel() {
      // Client disconnected — abort the in-flight Anthropic API call
      logger.info(`${phaseName} ReadableStream cancelled — aborting Anthropic call`, { phase: "anthropic" });
      abortController.abort();
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
 *
 * @param timeoutMs - Timeout for the API call. Must be LESS than the
 *   route's maxDuration. Defaults to 55_000 (55s).
 */
export async function generateResponseViaStream(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  timeoutMs: number = 55_000
): Promise<string> {
  const phaseName = getPhaseLabel(config);

  try {
    const stream = await withTimeout(
      callWithRetry(systemPrompt, messages, config, true) as Promise<
        AsyncIterable<Anthropic.MessageStreamEvent>
      >,
      timeoutMs
    );

    const chunks: string[] = [];
    let tokenCount = 0;

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        chunks.push(event.delta.text);
        tokenCount += Math.ceil(event.delta.text.length / 4);
      }
    }

    const fullText = chunks.join("");

    // Track tokens (streaming-buffered: estimate input from message length)
    const estimatedInput = Math.ceil(systemPrompt.length / 4) + messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    trackTokens(config.model, estimatedInput, tokenCount);

    logger.info(`${phaseName} (streamed) | model=${config.model} | ~${tokenCount} tokens`, { phase: "anthropic", model: config.model, tokens: tokenCount });

    return fullText;
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`${phaseName} stream-buffer error: ${rawMessage}`, { phase: "anthropic" });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Non-streaming helper
// ---------------------------------------------------------------------------

/**
 * Generate a complete Anthropic response and return the full text.
 * Used for phases where streaming isn't needed (checkin, debrief scoring, mission).
 * Handles rate-limit retry (once, 2s delay) and configurable timeout.
 *
 * @param timeoutMs - Timeout for the API call. Must be LESS than the
 *   route's maxDuration. Defaults to 25_000 (25s).
 */
export async function generateResponse(
  systemPrompt: string,
  messages: ChatMessage[],
  config: PhaseConfig,
  timeoutMs: number = 25_000
): Promise<string> {
  const phaseName = getPhaseLabel(config);

  try {
    const response = (await withTimeout(
      callWithRetry(systemPrompt, messages, config, false),
      timeoutMs
    )) as Anthropic.Message;

    // Safely extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const inputTokens = response.usage?.input_tokens ?? (Math.ceil(systemPrompt.length / 4) + messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0));
    const outputTokens = response.usage?.output_tokens ?? Math.ceil(text.length / 4);
    trackTokens(config.model, inputTokens, outputTokens);

    logger.info(`${phaseName} | model=${config.model} | ${outputTokens} tokens`, { phase: "anthropic", model: config.model, tokens: outputTokens });

    return text;
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`${phaseName} generation error: ${rawMessage}`, { phase: "anthropic" });
    throw error;
  }
}

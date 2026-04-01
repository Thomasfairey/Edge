/**
 * Production error reporting — structured error capture for observability.
 *
 * Provides a unified captureError() function that:
 * 1. Logs structured error data to server console (always)
 * 2. Tracks to analytics_events table (async, fire-and-forget)
 * 3. Forwards to Sentry if configured (opt-in via SENTRY_DSN env var)
 *
 * This module is the single integration point for error monitoring.
 * To add Sentry: npm i @sentry/nextjs, set SENTRY_DSN, uncomment the init block.
 */

import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";

interface ErrorContext {
  /** Which system component: "debrief", "roleplay", "auth", "anthropic", etc. */
  phase: string;
  /** The API route or client component that triggered the error */
  source?: string;
  /** User ID if available */
  userId?: string | null;
  /** Additional structured metadata */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Report an error to all configured sinks.
 * Never throws — safe to call in any error handler.
 */
export function captureError(error: unknown, context: ErrorContext): void {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "UnknownError";
  const stack = error instanceof Error ? error.stack : undefined;

  // 1. Structured server log (always available, even without Sentry)
  logger.error(`[${context.phase}] ${name}: ${message}`, {
    phase: context.phase,
    source: context.source,
    userId: context.userId ?? "anonymous",
    ...(context.metadata ?? {}),
    // Include first 500 chars of stack for log parsers
    stack: stack?.slice(0, 500),
  });

  // 2. Analytics event for error aggregation queries
  trackEvent({
    event: "circuit_breaker_trip", // Reusing existing event type for errors
    userId: context.userId,
    properties: {
      error_name: name,
      error_message: message.slice(0, 200),
      phase: context.phase,
      source: context.source ?? "unknown",
      ...(context.metadata ?? {}),
    },
  });

  // 3. Sentry (when configured)
  // To enable: npm i @sentry/nextjs && set SENTRY_DSN in .env.local
  // Then uncomment the block below:
  //
  // if (typeof globalThis !== "undefined" && (globalThis as any).__SENTRY__) {
  //   const Sentry = require("@sentry/nextjs");
  //   Sentry.captureException(error instanceof Error ? error : new Error(message), {
  //     tags: { phase: context.phase, source: context.source },
  //     user: context.userId ? { id: context.userId } : undefined,
  //     extra: context.metadata,
  //   });
  // }
}

/**
 * Client-side error reporting via the /api/track endpoint.
 * Call this from error boundaries and client-side catch blocks.
 */
export function captureClientError(
  error: unknown,
  context: { phase: string; source?: string }
): void {
  if (typeof window === "undefined") return;
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "UnknownError";

  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "circuit_breaker_trip",
      properties: {
        error_name: name,
        error_message: message.slice(0, 200),
        phase: context.phase,
        source: context.source ?? "client",
      },
    }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Structured logging utility with request context support.
 * Outputs JSON in production for log aggregation (Vercel, Datadog, etc.).
 * Falls back to readable console output in development.
 *
 * Usage:
 *   logger.info("message", { phase: "auth" });
 *   const reqLogger = logger.withRequestContext(requestId, userId);
 *   reqLogger.info("scoped message", { phase: "roleplay" });
 */

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  phase?: string;
  model?: string;
  tokens?: number;
  duration?: number;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

const isDev = process.env.NODE_ENV === "development";

function log(level: LogLevel, message: string, payload?: LogPayload) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  if (isDev) {
    const prefix = `[${entry.phase ?? "app"}]`;
    const ctx = entry.requestId ? ` req=${entry.requestId.slice(0, 8)}` : "";
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`${prefix}${ctx}`, message, payload ?? "");
  } else {
    // Structured JSON for production log aggregation
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(JSON.stringify(entry));
  }
}

export interface Logger {
  info: (message: string, payload?: LogPayload) => void;
  warn: (message: string, payload?: LogPayload) => void;
  error: (message: string, payload?: LogPayload) => void;
  withRequestContext: (requestId: string, userId?: string) => Logger;
}

export const logger: Logger = {
  info: (message: string, payload?: LogPayload) => log("info", message, payload),
  warn: (message: string, payload?: LogPayload) => log("warn", message, payload),
  error: (message: string, payload?: LogPayload) => log("error", message, payload),

  /**
   * Returns a logger instance that automatically injects requestId and userId
   * into every log call. Use this in request handlers for correlated logging.
   */
  withRequestContext(requestId: string, userId?: string): Logger {
    const basePayload: LogPayload = { requestId };
    if (userId) basePayload.userId = userId;

    const scopedLog = (level: LogLevel, message: string, payload?: LogPayload) => {
      log(level, message, { ...basePayload, ...payload });
    };

    const scoped: Logger = {
      info: (message: string, payload?: LogPayload) => scopedLog("info", message, payload),
      warn: (message: string, payload?: LogPayload) => scopedLog("warn", message, payload),
      error: (message: string, payload?: LogPayload) => scopedLog("error", message, payload),
      // Nested withRequestContext preserves existing context and overrides
      withRequestContext(newRequestId: string, newUserId?: string): Logger {
        return logger.withRequestContext(newRequestId, newUserId ?? userId);
      },
    };

    return scoped;
  },
};

/**
 * Create a request-scoped logger from a NextRequest.
 * Reads the x-request-id header (injected by withRateLimit) and includes userId.
 * Use at the top of every API route handler.
 */
export function createRequestLogger(
  req: { headers: { get(name: string): string | null } },
  userId?: string | null
): Logger {
  const requestId = req.headers.get("x-request-id") ?? "no-req-id";
  return logger.withRequestContext(requestId, userId ?? undefined);
}

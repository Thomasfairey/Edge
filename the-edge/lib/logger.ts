/**
 * Structured logging utility.
 * Outputs JSON in production for log aggregation (Vercel, Datadog, etc.).
 * Falls back to readable console output in development.
 */

type LogLevel = "info" | "warn" | "error";

interface LogPayload {
  phase?: string;
  model?: string;
  tokens?: number;
  duration?: number;
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
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(prefix, message, payload ?? "");
  } else {
    // Structured JSON for production log aggregation
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(JSON.stringify(entry));
  }
}

export const logger = {
  info: (message: string, payload?: LogPayload) => log("info", message, payload),
  warn: (message: string, payload?: LogPayload) => log("warn", message, payload),
  error: (message: string, payload?: LogPayload) => log("error", message, payload),
};

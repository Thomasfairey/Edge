/**
 * Structured request logging middleware with request-ID tracing.
 */

import { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

export async function requestLogger(c: Context<AppEnv>, next: Next) {
  const requestId =
    c.req.header("X-Request-Id") ?? crypto.randomUUID();

  // Make the ID available to all downstream handlers
  c.set("requestId", requestId);

  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  // Attach the request ID to the response so clients can reference it
  c.header("X-Request-Id", requestId);

  const duration = Date.now() - start;
  const status = c.res.status;
  let user: { id: string } | undefined;
  try { user = c.get("user"); } catch { /* not authenticated */ }

  const logEntry = {
    level: status >= 400 ? "error" : "info",
    request_id: requestId,
    method,
    path,
    status,
    duration_ms: duration,
    user_id: user?.id ?? "anonymous",
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(logEntry));
}

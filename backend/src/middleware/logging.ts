/**
 * Structured request logging middleware.
 */

import { Context, Next } from "hono";
import type { AppEnv } from "../types/env.js";

export async function requestLogger(c: Context<AppEnv>, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  let user: { id: string } | undefined;
  try { user = c.get("user"); } catch { /* not authenticated */ }

  const log = {
    method,
    path,
    status,
    duration_ms: duration,
    user_id: user?.id ?? "anonymous",
  };

  if (status >= 400) {
    console.error("[request]", JSON.stringify(log));
  } else {
    console.log("[request]", JSON.stringify(log));
  }
}

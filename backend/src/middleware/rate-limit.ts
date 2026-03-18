/**
 * Per-user rate limiting middleware.
 * Uses in-memory sliding window — suitable for single-instance deployment.
 */

import { Context, Next } from "hono";
import { RateLimitError } from "../types/errors.js";
import type { AppEnv } from "../types/env.js";

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/**
 * Create rate limit middleware for a specific endpoint.
 * @param limit - Max requests in the window
 * @param windowMs - Window duration (default 60s)
 */
export function rateLimit(limit: number, windowMs: number = 60_000) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = c.get("user");
    const key = user?.id ?? c.req.header("x-forwarded-for") ?? "anonymous";
    const endpointKey = `${key}:${c.req.path}`;

    const now = Date.now();
    const entry = store.get(endpointKey) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= limit) {
      const oldest = entry.timestamps[0];
      const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
      throw new RateLimitError(retryAfter);
    }

    entry.timestamps.push(now);
    store.set(endpointKey, entry);

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(limit - entry.timestamps.length));

    await next();
  };
}

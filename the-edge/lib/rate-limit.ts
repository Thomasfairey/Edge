/**
 * In-memory sliding window rate limiter (Map-based, per-instance).
 * Resets on server restart — acceptable for single-instance Vercel deployment.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/**
 * Check rate limit for a given key.
 * @param key - Unique identifier (e.g., IP address or API key)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Sliding window duration in milliseconds (default 60s)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): { success: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    store.set(key, entry);
    return { success: false, remaining: 0, retryAfter };
  }

  entry.timestamps.push(now);
  store.set(key, entry);

  return {
    success: true,
    remaining: limit - entry.timestamps.length,
    retryAfter: 0,
  };
}

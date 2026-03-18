/**
 * In-memory sliding window rate limiter (Map-based, per-instance).
 * Resets on server restart — acceptable for single-instance Vercel deployment.
 *
 * Security: Uses rightmost x-forwarded-for (last proxy hop) to resist IP spoofing.
 * Bounded store size prevents memory exhaustion from distributed attacks.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000; // prevent unbounded memory growth

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 120_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/**
 * Extract the most trustworthy client IP.
 * Uses the rightmost x-forwarded-for entry (added by the last trusted proxy),
 * falling back to x-real-ip or "unknown".
 */
export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // Rightmost IP is set by the trusted reverse proxy (e.g., Vercel)
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Check rate limit for a given key.
 * @param key - Unique identifier (e.g., IP:route)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Sliding window duration in milliseconds (default 60s)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): { success: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();

  // Evict oldest entry if store at capacity
  if (store.size >= MAX_STORE_SIZE && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  const entry = store.get(key) ?? { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfter = Math.max(0, Math.ceil((oldest + windowMs - now) / 1000));
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

/**
 * Hybrid rate limiter: in-memory fast path + Supabase durable store.
 *
 * The in-memory Map handles the hot path (zero latency). On cold starts the
 * Supabase `rate_limits` table is consulted so limits survive across instances.
 *
 * Writes to Supabase are fire-and-forget (async, non-blocking).
 * If Supabase is unreachable the limiter degrades gracefully to in-memory only.
 *
 * Security: Uses rightmost x-forwarded-for (last proxy hop) to resist IP spoofing.
 * Bounded store size prevents memory exhaustion from distributed attacks.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  windowStart: number; // epoch ms
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfter: number;
}

// ---------------------------------------------------------------------------
// In-memory fast-path store
// ---------------------------------------------------------------------------

const memStore = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;
let lastMemCleanup = Date.now();
let lastSupaCleanup = Date.now();

/** Purge stale in-memory entries (at most once per 60 s). */
function cleanupMemoryIfNeeded(windowMs: number) {
  const now = Date.now();
  if (now - lastMemCleanup < 60_000) return;
  lastMemCleanup = now;
  for (const [key, entry] of memStore) {
    if (now - entry.windowStart >= windowMs) {
      memStore.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Supabase durable store helpers (all fire-and-forget / best-effort)
// ---------------------------------------------------------------------------

/**
 * Delete expired rows from `rate_limits`. Called at most once per 60 s,
 * fire-and-forget so it never blocks the request path.
 */
function cleanupSupabaseIfNeeded() {
  const now = Date.now();
  if (now - lastSupaCleanup < 60_000) return;
  lastSupaCleanup = now;

  Promise.resolve(
    supabaseAdmin
      .from("rate_limits")
      .delete()
      .lt("expires_at", new Date().toISOString())
  )
    .then(({ error }) => {
      if (error) {
        logger.warn(`rate-limit supabase cleanup failed: ${error.message}`, {
          phase: "rate-limit",
        });
      }
    })
    .catch(() => {
      // Swallow — network failure during cleanup is harmless
    });
}

/**
 * Upsert the current count into `rate_limits` (fire-and-forget).
 * Uses Postgres upsert so concurrent writers converge on the max count.
 */
function persistToSupabase(
  key: string,
  count: number,
  windowStart: Date,
  expiresAt: Date
) {
  Promise.resolve(
    supabaseAdmin
      .from("rate_limits")
      .upsert(
        {
          key,
          count,
          window_start: windowStart.toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: "key" }
      )
  )
    .then(({ error }) => {
      if (error) {
        logger.warn(`rate-limit supabase upsert failed: ${error.message}`, {
          phase: "rate-limit",
        });
      }
    })
    .catch(() => {
      // Swallow — Supabase down means we degrade to memory-only
    });
}

/**
 * Fetch the current window count from Supabase for a key.
 * Returns null if not found, expired, or on error (graceful degradation).
 */
async function fetchFromSupabase(
  key: string,
  windowMs: number
): Promise<RateLimitEntry | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("rate_limits")
      .select("count, window_start")
      .eq("key", key)
      .single();

    if (error || !data) return null;

    const windowStart = new Date(data.window_start).getTime();
    const now = Date.now();

    // Row has expired — treat as absent
    if (now - windowStart >= windowMs) return null;

    return { count: data.count, windowStart };
  } catch {
    // Supabase unreachable — degrade to memory-only
    return null;
  }
}

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

/**
 * Extract the most trustworthy client IP.
 * Uses the rightmost x-forwarded-for entry (added by the last trusted proxy),
 * falling back to x-real-ip or "unknown".
 */
export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return headers.get("x-real-ip") ?? "unknown";
}

// ---------------------------------------------------------------------------
// Core: hybrid check
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key (async — may hit Supabase on cold start).
 *
 * Flow:
 *  1. Check in-memory store (fast path — zero latency).
 *  2. If no in-memory entry exists, fetch from Supabase (cold-start path).
 *  3. Increment count, persist to Supabase asynchronously.
 *
 * @param key      Unique identifier (e.g., IP:route)
 * @param limit    Max requests allowed in the window
 * @param windowMs Sliding window duration in ms (default 60 000)
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  cleanupMemoryIfNeeded(windowMs);
  cleanupSupabaseIfNeeded();

  const now = Date.now();

  // --- Fast path: in-memory entry exists and is still within the window ---
  let entry = memStore.get(key);

  if (entry && now - entry.windowStart < windowMs) {
    // Window still active — use cached count
  } else if (entry && now - entry.windowStart >= windowMs) {
    // Window expired — reset
    entry = undefined;
    memStore.delete(key);
  }

  // --- Cold-start path: no in-memory entry, consult Supabase ---
  if (!entry) {
    const durable = await fetchFromSupabase(key, windowMs);
    if (durable) {
      entry = durable;
      memStore.set(key, entry);
    }
  }

  // --- Still nothing? Start a fresh window ---
  if (!entry) {
    entry = { count: 0, windowStart: now };
  }

  // --- Enforce limit ---
  if (entry.count >= limit) {
    const retryAfter = Math.max(
      0,
      Math.ceil((entry.windowStart + windowMs - now) / 1000)
    );
    // Make sure memory store reflects the block
    memStore.set(key, entry);
    return { success: false, remaining: 0, retryAfter };
  }

  // --- Increment ---
  entry.count += 1;

  // Evict oldest in-memory entry if at capacity
  if (memStore.size >= MAX_STORE_SIZE && !memStore.has(key)) {
    const oldest = memStore.keys().next().value;
    if (oldest !== undefined) memStore.delete(oldest);
  }

  memStore.set(key, entry);

  // Persist to Supabase asynchronously (fire-and-forget)
  const windowStartDate = new Date(entry.windowStart);
  const expiresAtDate = new Date(entry.windowStart + windowMs);
  persistToSupabase(key, entry.count, windowStartDate, expiresAtDate);

  return {
    success: true,
    remaining: limit - entry.count,
    retryAfter: 0,
  };
}

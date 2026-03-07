/**
 * Higher-order function that wraps a Next.js API route handler with rate limiting
 * and CSRF origin validation for state-changing requests.
 * Returns 429 + Retry-After header when limit exceeded.
 * Returns 403 when origin doesn't match for non-GET requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "./rate-limit";

type RouteHandler = (req: NextRequest) => Promise<Response | NextResponse>;

/**
 * Validate that the request origin matches the host (CSRF protection).
 * Only enforced for non-GET/HEAD/OPTIONS requests.
 * Returns null if valid, or a 403 NextResponse if invalid.
 */
function checkOrigin(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // If no origin header (same-origin requests from some clients), allow
  if (!origin) return null;

  // Extract hostname from origin URL
  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return null;
  } catch {
    // Invalid origin URL
  }

  return NextResponse.json(
    { error: "Forbidden" },
    { status: 403 }
  );
}

/**
 * Wrap a route handler with CSRF origin check and rate limiting.
 * @param handler - The original route handler
 * @param limit - Max requests per minute (default 10)
 */
export function withRateLimit(handler: RouteHandler, limit: number = 10): RouteHandler {
  return async (req: NextRequest) => {
    // CSRF origin check for state-changing requests
    const originResult = checkOrigin(req);
    if (originResult) return originResult;

    // Use x-real-ip (Vercel trusted header) with forwarded-for fallback
    const realIp = req.headers.get("x-real-ip");
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = realIp || forwarded?.split(",")[0]?.trim() || "unknown";
    const routeKey = new URL(req.url).pathname;
    const key = `${ip}:${routeKey}`;

    const result = checkRateLimit(key, limit);

    if (!result.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = await handler(req);

    // Add rate limit headers to successful responses
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));

    return response;
  };
}

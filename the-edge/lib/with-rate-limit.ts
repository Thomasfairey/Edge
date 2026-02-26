/**
 * Higher-order function that wraps a Next.js API route handler with rate limiting.
 * Returns 429 + Retry-After header when limit exceeded.
 * Adds X-RateLimit-* headers to all responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "./rate-limit";

type RouteHandler = (req: NextRequest) => Promise<Response | NextResponse>;

/**
 * Wrap a route handler with rate limiting.
 * @param handler - The original route handler
 * @param limit - Max requests per minute (default 10)
 */
export function withRateLimit(handler: RouteHandler, limit: number = 10): RouteHandler {
  return async (req: NextRequest) => {
    // Use IP or forwarded-for as the rate limit key
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
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

/**
 * Higher-order function that wraps a Next.js API route handler with rate limiting,
 * CSRF origin validation, and request ID generation.
 * Returns 429 + Retry-After header when limit exceeded.
 * Returns 403 when origin doesn't match for non-GET requests.
 * Adds X-Request-Id header to every response for observability.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, extractClientIp } from "./rate-limit";
import { logger } from "@/lib/logger";
import { randomUUID } from "crypto";

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
 * Wrap a route handler with CSRF origin check, rate limiting, and request ID.
 * @param handler - The original route handler
 * @param limit - Max requests per minute (default 10)
 */
export function withRateLimit(handler: RouteHandler, limit: number = 10): RouteHandler {
  return async (req: NextRequest) => {
    const requestId = randomUUID();
    const routeKey = new URL(req.url).pathname;
    const ip = extractClientIp(req.headers);
    const reqLogger = logger.withRequestContext(requestId);

    reqLogger.info(`${req.method} ${routeKey}`, { phase: "request", ip });

    // CSRF origin check for state-changing requests
    const originResult = checkOrigin(req);
    if (originResult) {
      originResult.headers.set("X-Request-Id", requestId);
      return originResult;
    }

    const key = `${ip}:${routeKey}`;
    const result = await checkRateLimit(key, limit);

    if (!result.success) {
      reqLogger.warn(`Rate limited ${ip} (retry in ${result.retryAfter}s)`, { phase: "rate-limit" });
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-Request-Id": requestId,
          },
        }
      );
    }

    // Inject request ID into request headers so downstream handlers can access it
    const enrichedHeaders = new Headers(req.headers);
    enrichedHeaders.set("x-request-id", requestId);
    const enrichedReq = new NextRequest(req.url, {
      method: req.method,
      headers: enrichedHeaders,
      body: req.body,
      duplex: "half",
    });

    const start = Date.now();
    const response = await handler(enrichedReq);
    const duration = Date.now() - start;

    // Add standard headers to successful responses
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("X-RateLimit-Limit", String(limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));

    reqLogger.info(`${req.method} ${routeKey} ${response.status} ${duration}ms`, {
      phase: "response",
      duration,
      status: response.status,
    });

    return response;
  };
}

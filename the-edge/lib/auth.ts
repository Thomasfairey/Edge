/**
 * API key protection.
 * When EDGE_API_KEY is set, all requests must include it via
 * the Authorization header (Bearer token) or X-API-Key header.
 * Query-param auth is intentionally excluded to avoid key leakage in logs.
 *
 * Uses timing-safe comparison to prevent timing attacks on API key validation.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

type RouteHandler = (req: NextRequest) => Promise<Response | NextResponse>;

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to maintain constant time even on length mismatch
    const buf = Buffer.from(a);
    timingSafeEqual(buf, buf);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Check if request has valid API key.
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 */
export function checkAuth(req: NextRequest): NextResponse | null {
  const requiredKey = process.env.EDGE_API_KEY;

  // If no key is configured, all requests pass (dev mode)
  if (!requiredKey) return null;

  // Accept Authorization: Bearer <key> or X-API-Key header (not query params)
  const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerKey = req.headers.get("x-api-key");
  const providedKey = bearerToken || headerKey;

  if (!providedKey || !safeCompare(providedKey, requiredKey)) {
    console.warn(`[auth] Rejected request to ${req.nextUrl.pathname}`);
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}

/**
 * HOF wrapper — compose with withRateLimit:
 * export const POST = withRateLimit(withAuth(handlePost), 5)
 */
export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest) => {
    const authResult = checkAuth(req);
    if (authResult) return authResult;
    return handler(req);
  };
}

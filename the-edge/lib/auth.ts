/**
 * Opt-in API key protection scaffold.
 * If EDGE_API_KEY env var is not set, all requests pass (zero breaking change).
 * Reads X-API-Key header or ?key= query param.
 */

import { NextRequest, NextResponse } from "next/server";

type RouteHandler = (req: NextRequest) => Promise<Response | NextResponse>;

/**
 * Check if request has valid API key.
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 */
export function checkAuth(req: NextRequest): NextResponse | null {
  const requiredKey = process.env.EDGE_API_KEY;

  // If no key is configured, all requests pass
  if (!requiredKey) return null;

  // Only accept API key via header — never via URL to prevent leaking in logs/referers
  const headerKey = req.headers.get("x-api-key");

  if (!headerKey || headerKey !== requiredKey) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid API key via X-API-Key header." },
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

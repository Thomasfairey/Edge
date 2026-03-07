/**
 * API key protection middleware.
 * Reads X-API-Key header only (never from query params to avoid log leakage).
 * If EDGE_API_KEY env var is not set, all requests pass (development mode).
 */

import { NextRequest, NextResponse } from "next/server";

type RouteHandler = (req: NextRequest) => Promise<Response | NextResponse>;

/**
 * Check if request has valid API key.
 * Returns null if auth passes, or a 401 NextResponse if it fails.
 */
export function checkAuth(req: NextRequest): NextResponse | null {
  const requiredKey = process.env.EDGE_API_KEY;

  // If no key is configured, all requests pass (development mode)
  if (!requiredKey) return null;

  const headerKey = req.headers.get("x-api-key");

  if (!headerKey || headerKey !== requiredKey) {
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

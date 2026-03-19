/**
 * Authentication middleware for API routes.
 *
 * Uses Supabase session auth (cookie-based) as primary auth.
 * Falls back to X-API-Key header (with timing-safe comparison) for programmatic access.
 * Query-param auth is intentionally excluded to avoid key leakage in logs.
 * Passes userId directly to route handlers via closure.
 */

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

export type AuthRouteHandler = (req: NextRequest, userId: string | null) => Promise<Response | NextResponse>;
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
 * Extract authenticated user_id from the request.
 * Checks Supabase session cookies first, then X-API-Key header.
 */
async function getAuthUser(req: NextRequest): Promise<{ userId: string | null; error: NextResponse | null }> {
  // Try Supabase session auth first
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {
            // No-op in route handlers — middleware handles token refresh
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      return { userId: user.id, error: null };
    }
  } catch {
    // Supabase auth failed, try API key
  }

  // Fallback: API key auth (for programmatic access / mobile)
  // Uses timing-safe comparison to prevent timing attacks on API key validation.
  const requiredKey = process.env.EDGE_API_KEY;
  if (requiredKey) {
    const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const headerKey = req.headers.get("x-api-key");
    const providedKey = bearerToken || headerKey;
    if (providedKey && safeCompare(providedKey, requiredKey)) {
      // API key users have no user scoping (backwards compat)
      return { userId: null, error: null };
    }
  } else if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NODE_ENV === "development") {
    // No Supabase and no API key configured — development mode only
    console.warn("[auth] No auth configured — allowing unauthenticated access (development only)");
    return { userId: null, error: null };
  }

  console.warn(`[auth] Rejected request to ${req.nextUrl.pathname}`);
  return {
    userId: null,
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

/**
 * HOF wrapper — authenticates the request and passes userId to the handler.
 * Handler signature: (req: NextRequest, userId: string | null) => Promise<Response>
 */
export function withAuth(handler: AuthRouteHandler): RouteHandler {
  return async (req: NextRequest) => {
    const { userId, error } = await getAuthUser(req);
    if (error) return error;
    return handler(req, userId);
  };
}

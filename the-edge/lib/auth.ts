/**
 * Authentication middleware for API routes.
 *
 * Uses Supabase session auth (cookie-based) as primary auth.
 * Falls back to X-API-Key header for programmatic access.
 * Extracts user_id and attaches it to the request via header.
 */

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type RouteHandler = (req: NextRequest) => Promise<Response | NextResponse>;

/**
 * Extract authenticated user_id from the request.
 * Checks Supabase session cookies first, then X-API-Key header.
 * Returns { userId, error } — userId is null if auth fails.
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
            // No-op in route handlers
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
  const requiredKey = process.env.EDGE_API_KEY;
  if (requiredKey) {
    const headerKey = req.headers.get("x-api-key");
    if (headerKey && headerKey === requiredKey) {
      // API key users get the admin user_id (first profile, or null for backwards compat)
      return { userId: null, error: null };
    }
  } else {
    // No EDGE_API_KEY and no Supabase session — development mode, allow
    return { userId: null, error: null };
  }

  return {
    userId: null,
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

/**
 * HOF wrapper — authenticates the request and attaches user_id.
 * The user_id is available via req.headers.get("x-user-id").
 */
export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest) => {
    const { userId, error } = await getAuthUser(req);
    if (error) return error;

    // Attach user_id to request headers so route handlers can read it
    if (userId) {
      req.headers.set("x-user-id", userId);
    }

    return handler(req);
  };
}

/**
 * Extract user_id from the request (set by withAuth middleware).
 */
export function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

/**
 * Supabase clients — server-side only.
 *
 * supabaseAdmin — service-role client that bypasses RLS.
 *   Use ONLY for admin operations (e.g. server-side data access already
 *   scoped by userId from withAuth).
 *
 * createUserClient(req) — per-request client using ANON key + user cookies.
 *   Respects RLS policies. Use in API route handlers where possible.
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Admin client (service role — bypasses RLS)
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before starting the server.",
    { phase: "supabase" }
  );
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseServiceKey ?? "placeholder-key"
);

/**
 * @deprecated Use supabaseAdmin explicitly or createUserClient(req) for RLS.
 * Kept as alias during migration to avoid breaking existing imports.
 */
export const supabase = supabaseAdmin;

// ---------------------------------------------------------------------------
// Per-request user client (ANON key — respects RLS)
// ---------------------------------------------------------------------------

/**
 * Create a Supabase client that uses the ANON key and the user's auth cookies.
 * This client respects Row Level Security policies.
 * Use in API route handlers where you have access to the NextRequest.
 */
export function createUserClient(req: NextRequest) {
  return createServerClient(
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
}

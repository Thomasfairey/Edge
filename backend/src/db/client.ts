/**
 * Supabase client configuration.
 *
 * Two clients:
 * - adminClient: uses service role key for admin operations (bypasses RLS)
 * - createUserClient: creates a per-request client with the user's JWT (respects RLS)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables."
  );
}

/**
 * Admin client — bypasses RLS. Use only for:
 * - Auth operations
 * - Admin queries
 * - Operations that don't belong to a specific user
 */
export const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Create a per-request Supabase client that respects RLS.
 * Pass the user's JWT from the Authorization header.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey || supabaseServiceKey!, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

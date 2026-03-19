/**
 * Supabase client — server-side only.
 *
 * Uses service role key because V0 is single-user with no RLS policies.
 * For commercial version: switch to ANON_KEY + RLS policies per user.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
    "Add them to .env.local before starting the server."
  );
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseKey ?? "placeholder-key"
);

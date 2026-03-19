/**
 * Supabase client — server-side only (uses service role key).
 * Validates env vars at startup to fail fast with clear errors.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "SUPABASE_URL is not set. Add it to .env.local before starting the server."
  );
}
if (!supabaseKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local before starting the server."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Shared E2E fixture helpers.
 *
 * The auth-gated specs log in as a fixed fixture user. Nothing previously
 * created it, so login() timed out and the whole authenticated suite cascaded.
 * These helpers seed that user idempotently and can reset its profile so
 * onboarding-flow tests deterministically see the onboarding UI.
 */

export const FIXTURE_EMAIL = "test@example.com";
export const FIXTURE_PASSWORD = "password123";

/** Minimal .env.local reader — the test-runner process doesn't inherit Next's env loading. */
function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall back to process.env */
  }
  return out;
}

let cached: SupabaseClient | null = null;

/** Admin (service-role) client, or null if secrets are unavailable. */
export function adminClient(): SupabaseClient | null {
  if (cached) return cached;
  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** Create the fixture user if it doesn't exist. Safe to call repeatedly. */
export async function ensureFixtureUser(): Promise<void> {
  const admin = adminClient();
  if (!admin) {
    console.warn("[fixture] Missing Supabase service role key — cannot seed fixture user.");
    return;
  }
  const { error } = await admin.auth.admin.createUser({
    email: FIXTURE_EMAIL,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "E2E Fixture" },
  });
  if (error && !/already been registered|already exists|email_exists/i.test(error.message)) {
    throw new Error(`[fixture] Failed to seed fixture user: ${error.message}`);
  }
}

async function fixtureUserId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("email", FIXTURE_EMAIL)
    .maybeSingle();
  return data?.id ?? null;
}

/** Clear the fixture user's profile so onboarding (onboardingNeeded) appears. */
export async function resetFixtureProfile(): Promise<void> {
  const admin = adminClient();
  if (!admin) return;
  const id = await fixtureUserId(admin);
  if (!id) return;
  await admin.from("profiles").update({ profile_data: null }).eq("id", id);
}

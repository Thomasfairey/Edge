import { ensureFixtureUser, FIXTURE_EMAIL } from "./helpers/fixture";

/**
 * Playwright global setup.
 *
 * The auth-gated specs all log in as a fixed fixture user (test@example.com).
 * Nothing previously created that user, so `login()` timed out and the entire
 * authenticated suite cascaded red. This seeds the fixture user idempotently
 * via the Supabase admin API before any test runs.
 */
async function globalSetup(): Promise<void> {
  await ensureFixtureUser();
  console.log(`[global-setup] Fixture user ready: ${FIXTURE_EMAIL}`);
}

export default globalSetup;

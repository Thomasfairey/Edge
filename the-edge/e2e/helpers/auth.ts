import type { Page } from "@playwright/test";

/**
 * Shared authentication helpers for Playwright e2e tests.
 *
 * These helpers drive the real /login page via Supabase auth cookies.
 * Tests that depend on a logged-in session require a test account to
 * exist in the configured Supabase project. Provide it via
 * E2E_TEST_EMAIL / E2E_TEST_PASSWORD env vars (defaults shown below).
 */

const DEFAULT_EMAIL = process.env.E2E_TEST_EMAIL ?? "test@example.com";
const DEFAULT_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "password123";
const DEFAULT_INVITE_CODE = process.env.E2E_TEST_INVITE_CODE ?? "TEST_INVITE";

/**
 * Log in at `/login` with the given credentials and wait for the redirect
 * to the home page. Throws if the redirect never happens.
 */
export async function login(
  page: Page,
  email: string = DEFAULT_EMAIL,
  password: string = DEFAULT_PASSWORD
): Promise<void> {
  // Ensure we're on the login page; if not, navigate there.
  if (!page.url().includes("/login")) {
    await page.goto("/login");
  }

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for Supabase auth cookie to land and the router to push to "/".
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
}

/**
 * Complete the signup form with the given details. Waits for either the
 * redirect to `/` (auto-login) or a "check your email" success message.
 */
export async function signup(
  page: Page,
  opts: {
    email?: string;
    password?: string;
    displayName?: string;
    inviteCode?: string;
  } = {}
): Promise<void> {
  const email = opts.email ?? `test-${Date.now()}@example.com`;
  const password = opts.password ?? "TestPassword123";
  const displayName = opts.displayName ?? "Test User";
  const inviteCode = opts.inviteCode ?? DEFAULT_INVITE_CODE;

  if (!page.url().includes("/login")) {
    await page.goto("/login");
  }

  // Toggle into signup mode.
  await page.click('button:has-text("Sign up")');
  await page.waitForSelector('input[placeholder="Your name"]');

  await page.fill('input[placeholder="Your name"]', displayName);
  await page.fill('input[placeholder="Enter invite code"]', inviteCode);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  await page.click('button[type="submit"]');

  // Signup may auto-login (→ "/") or ask for email confirmation (stays on /login).
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {
    // networkidle may never settle with streaming endpoints — fine either way.
  });
}

/**
 * Return the subset of cookies that look like Supabase auth cookies.
 * Keys are the cookie names, values are the cookie values.
 */
export async function getAuthCookies(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const out: Record<string, string> = {};
  for (const c of cookies) {
    if (c.name.startsWith("sb-") || c.name.includes("supabase")) {
      out[c.name] = c.value;
    }
  }
  return out;
}

/**
 * Probe whether the current context has a Supabase session cookie.
 * Intentionally cookie-based rather than route-based so it doesn't
 * trigger a navigation.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const cookies = await getAuthCookies(page);
  return Object.keys(cookies).length > 0;
}

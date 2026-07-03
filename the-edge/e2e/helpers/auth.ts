import { Page } from "@playwright/test";

/**
 * Authentication helper utilities for E2E tests.
 * Provides functions for login, signup, and cookie extraction.
 */

/**
 * Log in with email and password.
 * Assumes login page is already loaded.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/", { timeout: 10000 });
}

/**
 * Sign up with email, password, display name, and invite code.
 * Assumes login page is already loaded in login mode.
 */
export async function signup(
  page: Page,
  email: string,
  password: string,
  displayName: string,
  inviteCode: string
): Promise<void> {
  // Click "Sign up" button to switch to signup mode
  await page.click('button:has-text("Sign up")');
  await page.waitForSelector('input[placeholder="Your name"]');

  // Fill signup form
  await page.fill('input[placeholder="Your name"]', displayName);
  await page.fill('input[placeholder="Enter invite code"]', inviteCode);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for either redirect to home or error message
  try {
    await page.waitForURL("/", { timeout: 10000 });
  } catch {
    // Might require email confirmation
    await page.waitForSelector('text=/Account created|Check your email/');
  }
}

/**
 * Extract auth cookies from the page.
 * Returns an object with auth-related cookies.
 */
export async function getAuthCookies(page: Page): Promise<Record<string, string>> {
  const cookies = await page.context().cookies();
  const authCookies: Record<string, string> = {};

  for (const cookie of cookies) {
    if (
      cookie.name.includes("auth") ||
      cookie.name.includes("session") ||
      cookie.name.includes("supabase") ||
      cookie.name.includes("sb-")
    ) {
      authCookies[cookie.name] = cookie.value;
    }
  }

  return authCookies;
}

/**
 * Check if user is authenticated by verifying auth cookies exist.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const cookies = await getAuthCookies(page);
  return Object.keys(cookies).length > 0;
}

/**
 * Wait for auth to complete after signup/login.
 * Checks for redirect to home page or presence of auth cookies.
 */
export async function waitForAuthComplete(page: Page): Promise<void> {
  try {
    await page.waitForURL("/", { timeout: 15000 });
  } catch {
    // If home page redirect doesn't happen, check if we're still on login
    const onLoginPage = page.url().includes("/login");
    if (onLoginPage) {
      throw new Error("Auth failed - still on login page");
    }
  }
}

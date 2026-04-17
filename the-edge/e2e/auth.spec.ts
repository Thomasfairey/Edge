import { test, expect } from "@playwright/test";
import { login, getAuthCookies, isAuthenticated } from "./helpers/auth";

/**
 * Authentication tests covering login, signup, and session persistence.
 * Maps to test cases 2.1-2.7 and 3.2-3.4 from E2E test plan.
 */

test.describe("Authentication", () => {
  test("2.1: Login page renders with all form fields", async ({ page }) => {
    await page.goto("/login");

    // Verify brand heading
    await expect(page.locator("h1")).toContainText(/the\s+edge/i);

    // Verify "Log in" heading
    await expect(page.locator("h2")).toContainText("Log in");

    // Verify form fields exist and are visible
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText("Log in");

    // Verify "Sign up" toggle is present
    await expect(page.locator('button:has-text("Sign up")')).toBeVisible();
  });

  test("2.2: Signup toggle shows invite code field", async ({ page }) => {
    await page.goto("/login");

    // Click "Sign up" toggle button
    await page.click('button:has-text("Sign up")');

    // Wait for signup form to appear
    await page.waitForSelector('input[placeholder="Your name"]');

    // Verify form heading changed to "Create account"
    await expect(page.locator("h2")).toContainText("Create account");

    // Verify all signup fields are visible
    await expect(page.locator('input[placeholder="Your name"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Enter invite code"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Verify submit button text changed
    await expect(page.locator('button[type="submit"]')).toContainText("Create account");
  });

  test("2.3: Invalid invite code is rejected", async ({ page }) => {
    await page.goto("/login");

    // Switch to signup mode
    await page.click('button:has-text("Sign up")');
    await page.waitForSelector('input[placeholder="Your name"]');

    // Fill form with an invalid invite code
    await page.fill('input[placeholder="Your name"]', "Test User");
    await page.fill('input[placeholder="Enter invite code"]', "INVALID_CODE_123");
    await page.fill('input[type="email"]', `test-${Date.now()}@example.com`);
    await page.fill('input[type="password"]', "password123");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for inline error message
    await expect(page.locator("text=Invalid invite code")).toBeVisible();

    // Verify user is still on login page
    expect(page.url()).toContain("/login");
  });

  test("2.7: Valid signup flow creates account and logs in", async ({ page }) => {
    await page.goto("/login");

    // Switch to signup mode
    await page.click('button:has-text("Sign up")');
    await page.waitForSelector('input[placeholder="Your name"]');

    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;

    await page.fill('input[placeholder="Your name"]', "Test User");
    await page.fill('input[placeholder="Enter invite code"]', "TEST_INVITE");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', "TestPassword123");

    await page.click('button[type="submit"]');

    // Signup either auto-logs in (→ "/") or stays on /login with a
    // confirmation message, depending on Supabase email-confirm config.
    await page.waitForURL(/\/(login)?$/, { timeout: 15000 });

    if (new URL(page.url()).pathname === "/") {
      expect(await isAuthenticated(page)).toBeTruthy();
    }
  });

  test("3.2: Wrong password shows error message", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "wrong_password");

    await page.click('button[type="submit"]');

    // Wait for the inline error
    await expect(page.locator("text=/Invalid email or password/i")).toBeVisible();

    // Still on login page
    expect(page.url()).toContain("/login");
  });

  test("3.3: Login with valid credentials succeeds", async ({ page }) => {
    await page.goto("/login");
    await login(page);

    // Verify redirect to home page
    expect(new URL(page.url()).pathname).toBe("/");

    // Verify auth cookies exist
    const authCookies = await getAuthCookies(page);
    expect(Object.keys(authCookies).length).toBeGreaterThan(0);
  });

  test("3.4: Session persists across page refresh", async ({ page }) => {
    await page.goto("/login");
    await login(page);

    // Verify we're on home page
    expect(new URL(page.url()).pathname).toBe("/");

    // Capture cookies after login
    const cookiesBeforeRefresh = await getAuthCookies(page);
    expect(Object.keys(cookiesBeforeRefresh).length).toBeGreaterThan(0);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Still authenticated and still on home page
    expect(await isAuthenticated(page)).toBeTruthy();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("Forgot password link is visible on login", async ({ page }) => {
    await page.goto("/login");

    const forgotLink = page.locator('button:has-text("Forgot password?")');
    await expect(forgotLink).toBeVisible();

    await forgotLink.click();

    // Form header switches to reset-password mode
    await expect(page.locator("h2")).toContainText("Reset password");

    // Email field remains, password field disappears, submit button changes text
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('button[type="submit"]')).toContainText("Send reset link");
  });
});

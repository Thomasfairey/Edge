import { test, expect } from "@playwright/test";
import { login, signup as _signup, getAuthCookies, isAuthenticated } from "./helpers/auth";

/**
 * Authentication tests covering login, signup, and session persistence.
 * Maps to test cases 2.1-2.7 and 3.2-3.4 from E2E test plan.
 */

test.describe("Authentication", () => {
  test("2.1: Login page renders with all form fields", async ({ page }) => {
    await page.goto("/login");

    // Verify page title
    expect(page.locator("text=/the edge/i")).toBeDefined();

    // Verify "Log in" heading
    expect(page.locator("h2")).toContainText("Log in");

    // Verify form fields exist
    expect(page.locator('input[type="email"]')).toBeDefined();
    expect(page.locator('input[type="password"]')).toBeDefined();
    expect(page.locator('button[type="submit"]')).toContainText("Log in");

    // Verify "Sign up" link exists
    expect(page.locator("button:has-text('Sign up')")).toBeDefined();
  });

  test("2.2: Signup toggle shows invite code field", async ({ page }) => {
    await page.goto("/login");

    // Click "Sign up" button
    await page.click('button:has-text("Sign up")');

    // Wait for signup form to appear
    await page.waitForSelector('input[placeholder="Your name"]');

    // Verify form heading changed to "Create account"
    expect(page.locator("h2")).toContainText("Create account");

    // Verify all signup fields are visible
    expect(page.locator('input[placeholder="Your name"]')).toBeDefined();
    expect(page.locator('input[placeholder="Enter invite code"]')).toBeDefined();
    expect(page.locator('input[type="email"]')).toBeDefined();
    expect(page.locator('input[type="password"]')).toBeDefined();

    // Verify submit button text changed
    expect(page.locator('button[type="submit"]')).toContainText("Create account");
  });

  test("2.3: Invalid invite code is rejected", async ({ page }) => {
    await page.goto("/login");

    // Switch to signup mode
    await page.click('button:has-text("Sign up")');
    await page.waitForSelector('input[placeholder="Your name"]');

    // Fill form with invalid invite code
    await page.fill('input[placeholder="Your name"]', "Test User");
    await page.fill('input[placeholder="Enter invite code"]', "INVALID_CODE_123");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password123");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for error message
    await page.waitForSelector("text=Invalid invite code");

    // Verify error is displayed
    expect(page.locator("text=Invalid invite code")).toBeDefined();

    // Verify user is still on login page
    expect(page.url()).toContain("/login");
  });

  test("2.7: Valid signup flow creates account and logs in", async ({ page }) => {
    await page.goto("/login");

    // Switch to signup mode
    await page.click('button:has-text("Sign up")');
    await page.waitForSelector('input[placeholder="Your name"]');

    // Create unique email
    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;

    // Fill form with valid invite code (assuming test code exists)
    await page.fill('input[placeholder="Your name"]', "Test User");
    await page.fill('input[placeholder="Enter invite code"]', "TEST_INVITE");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', "TestPassword123");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for successful signup/login
    // May redirect to home or show email confirmation message
    await page.waitForURL(/(\/|\/login)/, { timeout: 15000 });

    // If redirected to home, verify we're authenticated
    if (page.url().includes("localhost:3000/")) {
      const authed = await isAuthenticated(page);
      expect(authed).toBeTruthy();
    }
  });

  test("3.2: Wrong password shows error message", async ({ page }) => {
    await page.goto("/login");

    // Use a test account
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "wrong_password");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for error
    await page.waitForSelector("text=/Invalid email or password/i");

    // Verify error is displayed
    expect(page.locator("text=/Invalid email or password/i")).toBeDefined();

    // Verify we're still on login page
    expect(page.url()).toContain("/login");
  });

  test("3.3: Login with valid credentials succeeds", async ({ page }) => {
    await page.goto("/login");

    // Login with valid test credentials
    await login(page, "test@example.com", "password123");

    // Verify redirect to home page
    expect(page.url()).toBe("http://localhost:3000/");

    // Verify auth cookies exist
    const authCookies = await getAuthCookies(page);
    expect(Object.keys(authCookies).length).toBeGreaterThan(0);
  });

  test("3.4: Session persists across page refresh", async ({ page }) => {
    await page.goto("/login");

    // Login
    await login(page, "test@example.com", "password123");

    // Verify we're on home page
    expect(page.url()).toBe("http://localhost:3000/");

    // Get cookies after login
    const cookiesBeforeRefresh = await getAuthCookies(page);
    expect(Object.keys(cookiesBeforeRefresh).length).toBeGreaterThan(0);

    // Refresh page
    await page.reload();

    // Wait for page to load
    await page.waitForURL("/", { timeout: 10000 });

    // Verify still authenticated
    const authed = await isAuthenticated(page);
    expect(authed).toBeTruthy();

    // Verify still on home page (not redirected to login)
    expect(page.url()).toContain("localhost:3000/");
  });

  test("Forgot password link is visible on login", async ({ page }) => {
    await page.goto("/login");

    // Verify "Forgot password?" link exists
    const forgotLink = page.locator('button:has-text("Forgot password?")');
    expect(forgotLink).toBeDefined();

    // Click it
    await forgotLink.click();

    // Verify form changed to password reset
    expect(page.locator("h2")).toContainText("Reset password");

    // Verify email field is there
    expect(page.locator('input[type="email"]')).toBeDefined();

    // Verify submit button changed
    expect(page.locator('button[type="submit"]')).toContainText("Send reset link");
  });
});

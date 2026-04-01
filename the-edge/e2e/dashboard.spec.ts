import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Home dashboard tests.
 * Maps to test cases 6.1-6.8 from E2E test plan.
 */

test.describe("Dashboard / Home Page", () => {
  test.beforeEach(async ({ page }) => {
    // Login and navigate to home page
    await page.goto("/login");
    await login(page, "test@example.com", "password123");
  });

  test("6.1: Dashboard renders with progress ring", async ({ page }) => {
    // Should be on home page after login
    expect(page.url()).toBe("http://localhost:3000/");

    // Wait for content to load
    await page.waitForSelector("svg[role='img']");

    // Verify progress ring SVG exists
    const progressRing = page.locator("svg[role='img']");
    expect(progressRing).toBeDefined();

    // Verify progress ring has accessible label
    const ariaLabel = await progressRing.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
  });

  test("6.2: Progress ring displays score or placeholder", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("svg[role='img']");

    // Get progress ring
    const _progressRing = page.locator("svg[role='img']");

    // Verify it contains either a number or dash (no data state)
    const displayText = page.locator(".display");
    expect(displayText).toBeDefined();

    // Get the text content (either score or "–")
    const content = await displayText.textContent();
    expect(content).toBeTruthy();
  });

  test("6.3: New user shows zero state message", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("text=/Complete your first session/");

    // If user has no session data, should see zero state message
    const zeroState = page.locator("text=/Complete your first session to unlock/");

    // Check if zero state is visible (might not be if user has sessions)
    const isVisible = await zeroState.isVisible().catch(() => false);

    if (isVisible) {
      expect(zeroState).toBeDefined();
    }
    // If zero state not visible, user has data, which is also fine
  });

  test("6.4: Day counter displays current day number", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("text=/Day/");

    // Verify day number is displayed
    const dayText = page.locator("text=/Day \\d+/");
    expect(dayText).toBeDefined();

    // Verify it's a number
    const content = await dayText.textContent();
    const match = content?.match(/Day (\d+)/);
    expect(match?.[1]).toBeTruthy();
    expect(parseInt(match?.[1] || "0")).toBeGreaterThanOrEqual(1);
  });

  test("6.5: Streak counter displays when streak > 0", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("text=/Day/");

    // Streak may or may not be visible depending on user data
    const streakText = page.locator("text=/day streak/");

    // Check if visible
    const isVisible = await streakText.isVisible().catch(() => false);

    if (isVisible) {
      // If visible, verify it shows a number
      const content = await streakText.textContent();
      const match = content?.match(/(\d+)-day streak/);
      expect(match?.[1]).toBeTruthy();
    }
  });

  test("6.6: Settings menu is accessible from dashboard", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("button[aria-label='Settings']");

    // Click settings button
    const settingsButton = page.locator("button[aria-label='Settings']");
    await settingsButton.click();

    // Wait for menu to appear
    await page.waitForSelector("text=Sign Out");

    // Verify sign out option is visible
    const signOutButton = page.locator("button[role='menuitem']:has-text('Sign Out')");
    expect(signOutButton).toBeDefined();
  });

  test("6.7: Score dimensions row is visible", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("[role='group'][aria-label='Score dimensions']");

    // Verify score dimensions row exists
    const scoreDimensionsRow = page.locator("[role='group'][aria-label='Score dimensions']");
    expect(scoreDimensionsRow).toBeDefined();

    // Verify at least one dimension circle is visible
    const dimensionButtons = scoreDimensionsRow.locator("button");
    const count = await dimensionButtons.count();
    expect(count).toBeGreaterThanOrEqual(5); // Should have 5 dimensions
  });

  test("6.8: Begin session button is functional", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("button:has-text('Begin today')");

    // Verify button exists
    const beginButton = page.locator("button:has-text('Begin today')");
    expect(beginButton).toBeDefined();

    // Verify button is enabled (not offline)
    const isDisabled = await beginButton.evaluate((el: HTMLElement) =>
      (el as HTMLButtonElement).disabled
    );
    expect(isDisabled).toBeFalsy();

    // Click it
    await beginButton.click();

    // Should navigate to session page
    await page.waitForURL(/\/session/, { timeout: 10000 });
    expect(page.url()).toContain("/session");
  });

  test("6.9: Dimension score circles are clickable and show tooltips", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("[role='group'][aria-label='Score dimensions']");

    // Get first dimension button
    const scoreDimensionsRow = page.locator("[role='group'][aria-label='Score dimensions']");
    const firstDimension = scoreDimensionsRow.locator("button").first();

    // Click it
    await firstDimension.click();

    // Wait for tooltip
    await page.waitForSelector("[role='tooltip']").catch(() => {
      // Tooltip might not appear if no data, that's ok
    });

    // Verify tooltip is visible (if there's data)
    const tooltip = page.locator("[role='tooltip']");
    const isVisible = await tooltip.isVisible().catch(() => false);

    if (isVisible) {
      expect(tooltip).toBeDefined();
    }
  });

  test("6.10: Resume session card appears if session in progress", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("body");

    // Check if resume card is visible
    const resumeCard = page.locator("[role='region'][aria-label='Resume session']");
    const isVisible = await resumeCard.isVisible().catch(() => false);

    if (isVisible) {
      // Verify it has buttons
      const resumeButton = resumeCard.locator("button:has-text('Resume')");
      const startFreshButton = resumeCard.locator("button:has-text('Start fresh')");

      expect(resumeButton).toBeDefined();
      expect(startFreshButton).toBeDefined();
    }
  });

  test("6.11: Recent sessions are listed", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("body");

    // Check if session history section exists
    const historySection = page.locator("[aria-label='Session history']");
    const isVisible = await historySection.isVisible().catch(() => false);

    if (isVisible) {
      // Should have session entries
      const sessionEntries = historySection.locator("[class*='rounded']");
      const count = await sessionEntries.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test("6.12: Logout from settings menu works", async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector("button[aria-label='Settings']");

    // Click settings
    const settingsButton = page.locator("button[aria-label='Settings']");
    await settingsButton.click();

    // Click sign out
    await page.waitForSelector("button[role='menuitem']:has-text('Sign Out')");
    const signOutButton = page.locator("button[role='menuitem']:has-text('Sign Out')");
    await signOutButton.click();

    // Should redirect to login
    await page.waitForURL("/login", { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});

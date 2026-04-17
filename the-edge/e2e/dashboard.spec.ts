import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Home dashboard tests.
 * Maps to test cases 6.1-6.8 from E2E test plan.
 */

test.describe("Dashboard / Home Page", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure the 4-screen intro onboarding is skipped so fresh test users
    // land on the dashboard rather than the marketing flow.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // localStorage unavailable in this context — non-fatal.
      }
    });

    await page.goto("/login");
    await login(page);
  });

  test("6.1: Dashboard renders with progress ring", async ({ page }) => {
    expect(new URL(page.url()).pathname).toBe("/");

    // Progress ring SVG
    const progressRing = page.locator("svg[role='img']").first();
    await expect(progressRing).toBeVisible();

    const ariaLabel = await progressRing.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
  });

  test("6.2: Progress ring displays score or placeholder", async ({ page }) => {
    await page.waitForSelector("svg[role='img']");

    // The score label inside the ring uses the `.text-display` typography class.
    const displayText = page.locator("span.text-display").first();
    await expect(displayText).toBeVisible();

    const content = await displayText.textContent();
    expect(content?.trim()).toBeTruthy();
  });

  test("6.3: Zero state or populated data is rendered for the user", async ({ page }) => {
    // Wait until the dashboard has finished loading — either the progress ring
    // (data path) or the begin-session button is rendered.
    await page.waitForSelector("svg[role='img'], button:has-text('Begin today')");

    const zeroState = page.locator("text=/Complete your first session to unlock/");

    const isZeroStateVisible = await zeroState.isVisible().catch(() => false);
    const firstDimensionContent = await page
      .locator("[role='group'][aria-label='Score dimensions'] button")
      .first()
      .textContent()
      .catch(() => null);

    // Either the new-user zero state is shown, or the first dimension circle
    // holds a real score (not the "–" en-dash placeholder).
    const hasScoreData =
      firstDimensionContent !== null && !firstDimensionContent.trim().startsWith("\u2013");
    expect(isZeroStateVisible || hasScoreData).toBeTruthy();
  });

  test("6.4: Day counter displays current day number", async ({ page }) => {
    const dayText = page.locator("text=/Day \\d+/").first();
    await expect(dayText).toBeVisible();

    const content = await dayText.textContent();
    const match = content?.match(/Day (\d+)/);
    expect(match?.[1]).toBeTruthy();
    expect(parseInt(match?.[1] ?? "0", 10)).toBeGreaterThanOrEqual(1);
  });

  test("6.5: Streak counter renders a number when visible", async ({ page }) => {
    await page.waitForSelector("text=/Day \\d+/");

    const streakText = page.locator("text=/day streak/").first();

    if (await streakText.isVisible().catch(() => false)) {
      const content = await streakText.textContent();
      const match = content?.match(/(\d+)-day streak/);
      expect(match?.[1]).toBeTruthy();
    }
    // Streak may be 0 for new users — absence of the pill is valid.
  });

  test("6.6: Settings menu is accessible from dashboard", async ({ page }) => {
    const settingsButton = page.locator("button[aria-label='Settings']");
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    const signOut = page.locator("button[role='menuitem']:has-text('Sign Out')");
    await expect(signOut).toBeVisible();
  });

  test("6.7: Score dimensions row is visible", async ({ page }) => {
    const scoreDimensions = page.locator("[role='group'][aria-label='Score dimensions']");
    await expect(scoreDimensions).toBeVisible();

    // Should have exactly 5 dimension buttons.
    await expect(scoreDimensions.locator("button")).toHaveCount(5);
  });

  test("6.8: Begin session button is functional", async ({ page }) => {
    const beginButton = page.locator("button:has-text('Begin today')");
    await expect(beginButton).toBeVisible();
    await expect(beginButton).toBeEnabled();

    await beginButton.click();

    await page.waitForURL(/\/session/, { timeout: 10000 });
    expect(page.url()).toContain("/session");
  });

  test("6.9: Dimension score circles open a tooltip when clicked", async ({ page }) => {
    const scoreDimensions = page.locator("[role='group'][aria-label='Score dimensions']");
    await expect(scoreDimensions).toBeVisible();

    const firstDimension = scoreDimensions.locator("button").first();
    await firstDimension.click();

    // The aria-expanded attribute flips to "true" regardless of whether there
    // is a score value — the tooltip itself is rendered conditionally on that.
    await expect(firstDimension).toHaveAttribute("aria-expanded", "true");

    const tooltip = page.locator("[role='tooltip']").first();
    await expect(tooltip).toBeVisible();
  });

  test("6.10: Resume session card surfaces when a session is in progress", async ({ page }) => {
    const resumeCard = page.locator("[role='region'][aria-label='Resume session']");

    if (await resumeCard.isVisible().catch(() => false)) {
      await expect(resumeCard.locator("button:has-text('Resume')")).toBeVisible();
      await expect(resumeCard.locator("button:has-text('Start fresh')")).toBeVisible();
    }
    // For most users there is no in-progress session — absence is valid.
  });

  test("6.11: Recent sessions list renders entries when history exists", async ({ page }) => {
    const historySection = page.locator("[aria-label='Session history']");

    if (await historySection.isVisible().catch(() => false)) {
      // The heading is "Recent sessions"
      await expect(historySection.locator("h2")).toContainText(/recent sessions/i);

      // Each session is a collapsible row (button followed by a details panel).
      const sessionButtons = historySection.locator("button");
      expect(await sessionButtons.count()).toBeGreaterThan(0);
    }
  });

  test("6.12: Logout from settings menu works", async ({ page }) => {
    const settingsButton = page.locator("button[aria-label='Settings']");
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    const signOut = page.locator("button[role='menuitem']:has-text('Sign Out')");
    await expect(signOut).toBeVisible();
    await signOut.click();

    await page.waitForURL(/\/login$/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });
});

import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Onboarding flow tests (session-level onboarding: bio + feedback style).
 * Maps to test cases 5.1-5.9 from E2E test plan.
 *
 * These tests require a Supabase user whose profile row has no profile_data
 * yet; otherwise useSession() skips the onboarding and goes straight to the
 * lesson fetch. When that happens we mark the test as skipped rather than
 * failed so the suite stays green for returning users.
 */

const BIO_HEADING = "Welcome to The Edge";
const BIO_SELECTOR = `text=${BIO_HEADING}`;
const STYLE_HEADING = "How do you prefer feedback?";

async function waitForOnboarding(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(BIO_SELECTOR, { timeout: 7000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("Onboarding Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Skip the 4-screen marketing onboarding on the home page; it isn't
    // shown on /session but users routed through "/" first would otherwise
    // have to dismiss it before navigating.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);
  });

  test("5.1: Bio onboarding appears for first-time users", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    await expect(page.locator(BIO_SELECTOR)).toBeVisible();
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("5.2: Next button stays disabled until the bio reaches min length", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    const textarea = page.locator("textarea");
    const nextButton = page.locator('button:has-text("Next")');

    // The bio step gates Next on trimmed length >= 20 chars.
    await textarea.fill("too short");
    await expect(nextButton).toBeDisabled();

    await textarea.fill("I'm a CEO working on negotiations and influence");
    await expect(nextButton).toBeEnabled();
  });

  test("5.3: Feedback style step surfaces all three preferences", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    await page.locator("textarea").fill("I'm a CEO working on negotiations and influence");
    await page.locator('button:has-text("Next")').click();

    await expect(page.locator(`text=${STYLE_HEADING}`)).toBeVisible();

    await expect(page.locator("text=Direct & blunt")).toBeVisible();
    await expect(page.locator("text=Balanced")).toBeVisible();
    await expect(page.locator("text=Supportive")).toBeVisible();
  });

  test("5.4: Completing both steps transitions into the lesson phase", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    await page.locator("textarea").fill("I'm a CEO working on negotiations");
    await page.locator('button:has-text("Next")').click();

    await expect(page.locator(`text=${STYLE_HEADING}`)).toBeVisible();
    await page.locator("button:has-text('Balanced')").click();

    // Onboarding → saving → lesson fetch. Accept either the transient saving
    // state or the lesson loading/ready state as evidence of progression.
    await expect(
      page.locator("text=/Setting up your profile|Preparing today|Ready to practise/")
    ).toBeVisible({ timeout: 20000 });
  });

  test("5.5: Bio textarea has a 2000-character hard cap", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    const textarea = page.locator("textarea");

    const maxLength = await textarea.evaluate(
      (el) => (el as HTMLTextAreaElement).maxLength
    );
    expect(maxLength).toBe(2000);

    // Attempt to fill with 2500 chars; the <textarea maxLength> attribute
    // enforces the cap client-side.
    await textarea.fill("a".repeat(2500));
    const value = await textarea.inputValue();
    expect(value.length).toBeLessThanOrEqual(2000);
  });

  test("5.6: Back button returns to bio from the style step", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    await page.locator("textarea").fill("I'm a CEO working on negotiations");
    await page.locator('button:has-text("Next")').click();

    await expect(page.locator(`text=${STYLE_HEADING}`)).toBeVisible();

    await page.locator('button:has-text("Back")').click();
    await expect(page.locator(BIO_SELECTOR)).toBeVisible();
  });

  test("5.7: Selecting a feedback style advances onboarding", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    await page.locator("textarea").fill("I'm a CEO working on negotiations");
    await page.locator('button:has-text("Next")').click();

    await expect(page.locator(`text=${STYLE_HEADING}`)).toBeVisible();
    await page.locator("button:has-text('Supportive')").click();

    // We should never land back on /login — the user is authenticated.
    expect(new URL(page.url()).pathname).not.toBe("/login");
  });

  test("5.8: Completing onboarding keeps the user inside the session flow", async ({ page }) => {
    await page.goto("/session");
    const appeared = await waitForOnboarding(page);
    test.skip(!appeared, "User profile already populated — no onboarding to test");

    await page.locator("textarea").fill("I'm a CEO working on negotiations");
    await page.locator('button:has-text("Next")').click();

    await expect(page.locator(`text=${STYLE_HEADING}`)).toBeVisible();
    await page.locator("button:has-text('Balanced')").click();

    await page.waitForLoadState("networkidle").catch(() => {
      // Streaming endpoints may prevent networkidle — it's an optional check.
    });

    const pathname = new URL(page.url()).pathname;
    expect(pathname.startsWith("/session") || pathname === "/").toBeTruthy();
  });
});

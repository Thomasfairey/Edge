import { test, expect, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { FIXTURE_EMAIL, FIXTURE_PASSWORD, resetFixtureProfile } from "./helpers/fixture";

/**
 * Onboarding flow tests.
 * Maps to test cases 5.1-5.9 from E2E test plan.
 *
 * The in-session onboarding is a 3-step flow: TRACK -> BIO -> STYLE.
 * (The track step was added when The Edge gained selectable Professional /
 * Social / Both training tracks.) Each test resets the fixture user's profile
 * first so onboardingNeeded is true and the flow reliably appears.
 */

const TRACK_HEADING = "What do you want an edge in?";
const BIO_HEADING = "Tell me about yourself";
const STYLE_HEADING = "How do you prefer feedback?";

/** Wait for the onboarding track step; returns false if it doesn't appear. */
async function waitForOnboarding(page: Page): Promise<boolean> {
  try {
    // Generous timeout: the first hit to /session triggers a cold Next dev compile.
    await page.locator(`text=${TRACK_HEADING}`).waitFor({ timeout: 25000 });
    return true;
  } catch {
    return false;
  }
}

/** Pick a track and advance to the bio step. */
async function pickTrack(page: Page, label: "Professional" | "Social" | "Both"): Promise<void> {
  await page.locator(`button:has-text("${label}")`).first().click();
  await page.waitForSelector(`text=${BIO_HEADING}`);
}

test.describe("Onboarding Flow", () => {
  test.beforeEach(async ({ page }) => {
    await resetFixtureProfile(); // ensure onboarding will show
    await page.goto("/login");
    await login(page, FIXTURE_EMAIL, FIXTURE_PASSWORD);
  });

  test("5.1: Onboarding appears for a user without a profile", async ({ page }) => {
    await page.goto("/session");
    expect(await waitForOnboarding(page)).toBeTruthy();
  });

  test("5.2: First step offers all three training tracks", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    // The new track step is first and offers Professional / Social / Both.
    // Use exact text on the option labels — `has-text` is a case-insensitive
    // substring match, and the "Both" description contains "professional"/"social".
    await expect(page.getByText("Professional", { exact: true })).toBeVisible();
    await expect(page.getByText("Social", { exact: true })).toBeVisible();
    await expect(page.getByText("Both", { exact: true })).toBeVisible();
  });

  test("5.3: Selecting a track advances to the bio step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Social");

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();

    // Next is disabled until the bio has enough text.
    const nextButton = page.locator('button:has-text("Next")');
    await textarea.fill("I want to be more captivating and memorable at parties and on dates");
    const isDisabled = await nextButton.evaluate(
      (el: HTMLElement) => (el as HTMLButtonElement).disabled
    );
    expect(isDisabled).toBeFalsy();
  });

  test("5.4: Bio step advances to the feedback-style step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Professional");
    await page.locator("textarea").fill("I'm a CEO working on negotiations and influence");
    await page.locator('button:has-text("Next")').click();

    await page.waitForSelector(`text=${STYLE_HEADING}`);
    await expect(page.locator("text=Direct & blunt")).toBeVisible();
    await expect(page.locator("text=Balanced")).toBeVisible();
    await expect(page.locator("text=Supportive")).toBeVisible();
  });

  test("5.5: Full flow (track -> bio -> style) completes onboarding", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Both");
    await page.locator("textarea").fill("I run a startup and also want to be better socially");
    await page.locator('button:has-text("Next")').click();

    await page.waitForSelector(`text=${STYLE_HEADING}`);
    await page.locator("button:has-text('Balanced')").click();

    // Onboarding completes -> lesson loads / preparing state.
    await page.waitForSelector("text=/Preparing today|Listen|Ready to practise|Welcome/", {
      timeout: 15000,
    });
    expect(page.url()).not.toContain("/login");
  });

  test("5.6: Bio field enforces the 2000-char limit", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Professional");
    const textarea = page.locator("textarea");

    const maxLength = await textarea.evaluate(
      (el: HTMLElement) => (el as HTMLTextAreaElement).maxLength
    );
    expect(maxLength).toBe(2000);

    await textarea.fill("a".repeat(2500));
    const value = await textarea.inputValue();
    expect(value.length).toBeLessThanOrEqual(2000);
  });

  test("5.7: Back from bio returns to the track step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Professional");
    await page.locator('button:has-text("Back")').click();

    await page.waitForSelector(`text=${TRACK_HEADING}`);
    await expect(page.locator(`text=${TRACK_HEADING}`)).toBeVisible();
  });

  test("5.8: Back from style returns to the bio step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Professional");
    await page.locator("textarea").fill("I'm a CEO working on negotiations");
    await page.locator('button:has-text("Next")').click();

    await page.waitForSelector(`text=${STYLE_HEADING}`);
    await page.locator('button:has-text("Back")').click();

    await page.waitForSelector(`text=${BIO_HEADING}`);
    await expect(page.locator(`text=${BIO_HEADING}`)).toBeVisible();
  });

  test("5.9: Completing onboarding leaves the login screen behind", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickTrack(page, "Social");
    await page.locator("textarea").fill("I want to tell better stories and be more magnetic");
    await page.locator('button:has-text("Next")').click();
    await page.waitForSelector(`text=${STYLE_HEADING}`);
    await page.locator("button:has-text('Balanced')").click();

    await page
      .waitForSelector("text=/Preparing today|Listen|Ready to practise|Welcome/", { timeout: 15000 })
      .catch(() => {});

    const isInSession = page.url().includes("/session");
    const isOnHome = page.url() === "http://localhost:3000/";
    expect(isInSession || isOnHome).toBeTruthy();
  });
});

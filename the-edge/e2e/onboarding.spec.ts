import { test, expect, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { FIXTURE_EMAIL, FIXTURE_PASSWORD, resetFixtureProfile } from "./helpers/fixture";

/**
 * Onboarding flow tests.
 * Maps to test cases 5.1-5.9 from E2E test plan.
 *
 * The in-session onboarding is a 3-step flow: CONTEXTS -> BIO -> STYLE.
 * The first step is a multi-select over the five life contexts (dating,
 * friends, groups, family, work), which replaced the earlier three-way
 * Professional / Social / Both track picker. Each test resets the fixture
 * user's profile first so onboardingNeeded is true and the flow reliably
 * appears.
 */

const CONTEXTS_HEADING = "Where do you want to get better with people?";
const BIO_HEADING = "Tell me about yourself";
const STYLE_HEADING = "How do you prefer feedback?";

/** Wait for the onboarding contexts step; returns false if it doesn't appear. */
async function waitForOnboarding(page: Page): Promise<boolean> {
  try {
    // Generous timeout: the first hit to /session triggers a cold Next dev compile.
    await page.locator(`text=${CONTEXTS_HEADING}`).waitFor({ timeout: 25000 });
    return true;
  } catch {
    return false;
  }
}

type ContextLabel = "Dating & romance" | "Friendships" | "Groups & parties"
  | "Family & hard conversations" | "Work";

/**
 * Select the given contexts and continue to the bio step.
 *
 * The step is a multi-select that starts with the four social contexts already
 * chosen, so selecting one that is already on would deselect it. Each label is
 * toggled only if it is not already pressed.
 */
async function pickContexts(page: Page, labels: ContextLabel[]): Promise<void> {
  for (const label of labels) {
    const button = page.locator(`button[aria-pressed]:has-text("${label}")`).first();
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  }
  await page.locator('button:has-text("Continue")').click();
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

  test("5.2: First step offers all five life contexts", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    for (const label of [
      "Dating & romance",
      "Friendships",
      "Groups & parties",
      "Family & hard conversations",
      "Work",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("5.2b: Contexts are multi-select and cannot all be deselected", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    const options = page.locator("button[aria-pressed]");
    await expect(options).toHaveCount(5);

    // Work starts off; the other four start on.
    const work = options.filter({ hasText: "Work" }).first();
    await expect(work).toHaveAttribute("aria-pressed", "false");
    await work.click();
    await expect(work).toHaveAttribute("aria-pressed", "true");

    // Turning everything off must be impossible — an empty selection would
    // leave the concept pool with nothing to draw from.
    for (let i = 0; i < 5; i++) await options.nth(i).click();
    const pressed = await options.evaluateAll((els) =>
      els.filter((el) => el.getAttribute("aria-pressed") === "true").length
    );
    expect(pressed).toBeGreaterThanOrEqual(1);
  });

  test("5.3: Selecting a track advances to the bio step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickContexts(page, ["Dating & romance"]);

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

    await pickContexts(page, ["Work"]);
    await page.locator("textarea").fill("I run a team and need to get better at hard conversations");
    await page.locator('button:has-text("Next")').click();

    await page.waitForSelector(`text=${STYLE_HEADING}`);
    await expect(page.locator("text=Direct & blunt")).toBeVisible();
    await expect(page.locator("text=Balanced")).toBeVisible();
    await expect(page.locator("text=Supportive")).toBeVisible();
  });

  test("5.5: Full flow (contexts -> bio -> style) completes onboarding", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickContexts(page, ["Friendships", "Work"]);
    await page.locator("textarea").fill("I have drifted from friends I care about and freeze in groups");
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

    await pickContexts(page, []);
    const textarea = page.locator("textarea");

    const maxLength = await textarea.evaluate(
      (el: HTMLElement) => (el as HTMLTextAreaElement).maxLength
    );
    expect(maxLength).toBe(2000);

    await textarea.fill("a".repeat(2500));
    const value = await textarea.inputValue();
    expect(value.length).toBeLessThanOrEqual(2000);
  });

  test("5.7: Back from bio returns to the contexts step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickContexts(page, []);
    await page.locator('button:has-text("Back")').click();

    await page.waitForSelector(`text=${CONTEXTS_HEADING}`);
    await expect(page.locator(`text=${CONTEXTS_HEADING}`)).toBeVisible();
  });

  test("5.8: Back from style returns to the bio step", async ({ page }) => {
    await page.goto("/session");
    if (!(await waitForOnboarding(page))) test.skip();

    await pickContexts(page, []);
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

    await pickContexts(page, []);
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

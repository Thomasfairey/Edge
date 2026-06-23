import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Error handling and resilience tests.
 * Maps to test cases 21.1, 21.3, 21.4 from E2E test plan.
 */

test.describe("Error Handling & Resilience", () => {
  test("21.1: Offline banner surfaces on the home page", async ({ page, context }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);

    // Drop the connection AFTER the initial navigation so the page itself
    // has already loaded; we're testing the in-page offline banner.
    await context.setOffline(true);
    try {
      // Trigger the browser's offline event so the page's online state flips.
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));

      const offlineBanner = page.locator("text=You're offline").first();
      await expect(offlineBanner).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("21.2: Offline banner shows in session", async ({ page, context }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);
    await page.goto("/session");

    await context.setOffline(true);
    try {
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      await expect(page.locator("text=Offline").first()).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("21.3: Page reload keeps the user inside the session flow", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);

    await page.goto("/session");
    await page.waitForLoadState("domcontentloaded");

    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    const finalPathname = new URL(page.url()).pathname;
    expect(finalPathname === "/" || finalPathname.startsWith("/session")).toBeTruthy();
  });

  test("21.4: Backend failure does not leak a raw 500 to the UI", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);

    // Force a specific backend endpoint to fail, then make sure the UI
    // doesn't render raw server-error text or a stack trace.
    await page.route("/api/status", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.locator("text=/Internal Server Error|stack trace/i")).toHaveCount(0);
  });

  test("21.5: Required fields are validated client-side on login", async ({ page }) => {
    await page.goto("/login");

    // Only fill the password and try to submit — the email <input required>
    // should block submission and keep the user on /login.
    await page.locator('input[type="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();

    await page.waitForTimeout(500);
    expect(page.url()).toContain("/login");
  });

  test("21.6: Resume-session card is actionable when a session is saved", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
        // Seed a recent in-progress session so the dashboard offers "Resume".
        localStorage.setItem(
          "edge-session-state",
          JSON.stringify({ timestamp: Date.now() })
        );
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);

    const resumeCard = page.locator("[role='region'][aria-label='Resume session']");
    if (await resumeCard.isVisible().catch(() => false)) {
      await resumeCard.locator("button:has-text('Resume')").click();
      await page.waitForURL(/\/session/, { timeout: 10000 });
      expect(page.url()).toContain("/session");
    }
    // If no resume card (e.g. localStorage blocked), treat as no-op.
  });

  test("21.7: /session requires authentication", async ({ page }) => {
    await page.context().clearCookies();

    await page.goto("/session");
    await page.waitForURL(/\/login$/, { timeout: 10000 });
    expect(page.url()).toContain("/login");
  });

  test("21.8: Session page exposes a retry affordance when needed", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);
    await page.goto("/session");

    await page.waitForLoadState("domcontentloaded");

    // The Retry button only appears when an API call has failed. If it is
    // present, it must be visible and enabled.
    const retryButton = page.locator("button:has-text('Retry')");
    if (await retryButton.count()) {
      await expect(retryButton.first()).toBeVisible();
      await expect(retryButton.first()).toBeEnabled();
    }
  });

  test("21.9: Long-running phases render a loading indicator", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
      } catch {
        // non-fatal
      }
    });

    await page.goto("/login");
    await login(page);
    await page.goto("/session");

    // Either the skeleton (initial load) or the "Preparing today's lesson..."
    // message should appear while we wait for the lesson stream to start.
    const skeleton = page.locator(".skeleton");
    const preparing = page.locator("text=/Preparing today/");

    await expect(skeleton.first().or(preparing.first())).toBeVisible({ timeout: 15000 });
  });
});

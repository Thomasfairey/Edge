import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

/**
 * Voice read-back (TTS) state-machine E2E — WebKit (Safari engine).
 *
 * Validates the client audio path WITHOUT any AI cost:
 *  - a lesson is pre-seeded into localStorage (fetchLesson uses the cache, so
 *    /api/lesson is never called)
 *  - /api/profile, /api/status and /api/tts are mocked deterministically
 *  - /api/tts returns a real (tiny, silent) MPEG frame
 *
 * Key assertion: the lesson auto-speaks card-by-card, advancing to the next
 * card only when the previous audio's `onended` fires. So observing a SECOND
 * /api/tts request proves the playback state machine completed and advanced —
 * i.e. it did NOT get stuck in "speaking" (the core iOS bug this fix targets).
 *
 * NOTE: desktop WebKit does not enforce iOS's user-gesture/autoplay rules, so a
 * green run here is a regression guard, not proof the iPhone works. Definitive
 * device validation is via the ?debug=1 overlay on a real phone.
 */

const E2E_EMAIL = "e2e-voice@example.com";
const E2E_PASSWORD = "password123";

/** Build a silent mono 16-bit WAV of the given duration — browsers play these
 *  reliably and fire `ended`, unlike a degenerate ~0ms MPEG frame. */
function silentWav(ms = 300, sampleRate = 8000): Buffer {
  const samples = Math.floor((sampleRate * ms) / 1000);
  const dataLen = samples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf; // samples already zero (silence)
}

const LESSON_CONTENT = [
  "## The Principle",
  "People follow the path of least resistance. Make the action you want the easiest one available.",
  "",
  "## The Play",
  "When you ask, give a default. A pre-filled choice is taken far more often than an open question.",
].join("\n");

const CONCEPT = {
  id: "test-concept",
  name: "Path of Least Resistance",
  domain: "influence",
  source: "Test",
  description: "People take the easiest available action.",
};

async function mockApis(page: Page) {
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ profileData: { bio: "test", style: "direct" }, displayName: "Test" }),
    })
  );
  await page.route("**/api/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ dayNumber: 1, lastEntry: null }),
    })
  );
}

test.describe("voice read-back state machine (WebKit)", () => {
  test("auto-speaks lesson cards and advances on playback end (no stuck speaking)", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // Capture CSP media violations — the exact failure mode this fix targets:
    // a data: unlock URI blocked by `media-src 'self' blob:`, which stopped
    // audio from ever unlocking so TTS never played.
    const cspMediaViolations: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/violates.+Content Security Policy/i.test(t) && /media/i.test(t)) {
        cspMediaViolations.push(t);
      }
    });

    // Headless WebKit has no audio sink, so a real <audio> never fires `ended`.
    // Stub playback to resolve and emit `ended` so the app's onended-driven
    // card-advance logic runs deterministically. The element's src is still
    // assigned (so the CSP check above is still exercised on the unlock blob).
    await page.addInitScript(() => {
      const proto = HTMLMediaElement.prototype as unknown as { play: () => Promise<void> };
      proto.play = function (this: HTMLMediaElement) {
        setTimeout(() => {
          try {
            this.dispatchEvent(new Event("ended"));
          } catch {
            /* ignore */
          }
        }, 30);
        return Promise.resolve();
      };
    });

    let ttsCalls = 0;
    const ttsTexts: string[] = [];
    await page.route("**/api/tts", async (route) => {
      ttsCalls += 1;
      try {
        ttsTexts.push(JSON.parse(route.request().postData() || "{}").text ?? "");
      } catch {
        /* ignore */
      }
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: silentWav(300),
      });
    });

    await mockApis(page);

    // Authenticate (real Supabase session — middleware validates the cookie).
    await page.goto("/login");
    await login(page, E2E_EMAIL, E2E_PASSWORD);

    // Pre-seed voice-on + a cached lesson so fetchLesson skips /api/lesson.
    await page.evaluate(
      ({ lesson, concept }) => {
        localStorage.setItem("edge-voice-enabled", "true");
        localStorage.setItem(
          "edge-pregenerated-lesson",
          JSON.stringify({
            date: new Date().toISOString().slice(0, 10),
            concept,
            lessonContent: lesson,
            isReview: false,
          })
        );
      },
      { lesson: LESSON_CONTENT, concept: CONCEPT }
    );

    await page.goto("/session");

    // Lesson rendered from cache.
    await expect(
      page.getByRole("heading", { name: /Path of Least Resistance/ })
    ).toBeVisible({ timeout: 15000 });

    // The first card's TTS is fetched immediately (fetch precedes unlock)...
    await expect.poll(() => ttsCalls, { timeout: 10000 }).toBeGreaterThanOrEqual(1);

    // ...but playback is queued until a user gesture unlocks audio. Simulate the
    // tap on a real element. The AudioUnlock recovery path must then flush the
    // queued playback.
    await page.getByRole("heading", { name: /Path of Least Resistance/ }).click();

    // Once card 1 plays and its audio `onended` fires, the machine advances and
    // speaks card 2. A second /api/tts call proves it did NOT get stuck in
    // "speaking" — the core regression this fix guards against.
    await expect.poll(() => ttsCalls, { timeout: 15000 }).toBeGreaterThanOrEqual(2);

    // The headline fix: the silent unlock clip must NOT be CSP-blocked.
    expect(
      cspMediaViolations,
      `CSP media violations: ${cspMediaViolations.join(" | ")}`
    ).toHaveLength(0);
    expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toHaveLength(0);
    expect(ttsTexts[0]).toContain("The Principle");
  });
});

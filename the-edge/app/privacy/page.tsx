/**
 * Privacy Policy page — required by App Store and Play Store.
 * This is a public route (added to middleware PUBLIC_PATHS).
 */

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-bold text-primary">Privacy Policy</h1>
      <p className="mb-8 text-sm text-secondary">Last updated: 7 March 2026</p>

      <div className="space-y-6 text-base leading-relaxed text-primary">
        <section>
          <h2 className="mb-2 text-lg font-semibold">What we collect</h2>
          <p>
            The Edge collects your email address and password for account authentication.
            During sessions, we process your text and voice inputs to deliver personalised
            influence training. Session scores and performance data are stored to track your
            progress over time.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Voice data</h2>
          <p>
            When you enable voice mode, audio is processed in real time for speech recognition.
            We do not store raw audio recordings. Transcribed text is used only within your
            active session and is not shared with third parties.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">How we use your data</h2>
          <ul className="ml-5 list-disc space-y-1">
            <li>Authenticate your account and manage sessions</li>
            <li>Generate personalised lessons and roleplay scenarios</li>
            <li>Track performance scores and learning progress</li>
            <li>Deliver spaced repetition reviews at optimal intervals</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Third-party services</h2>
          <p>We use the following third-party services to operate The Edge:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong>Supabase</strong> — authentication and database hosting</li>
            <li><strong>Anthropic (Claude)</strong> — AI-powered lesson and roleplay generation</li>
            <li><strong>ElevenLabs</strong> — text-to-speech for voice mode</li>
            <li><strong>Vercel</strong> — application hosting</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Cookies</h2>
          <p>
            The Edge uses cookies solely for session management. Supabase authentication
            sets cookies to maintain your login session across page loads. We do not use
            tracking cookies, advertising cookies, or any third-party analytics cookies.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Data storage</h2>
          <p>
            Your data is stored securely in Supabase (hosted on AWS) with row-level security
            policies ensuring you can only access your own data. We do not sell or share your
            personal data with advertisers.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Data retention</h2>
          <p>
            Session data, performance scores, and learning progress are retained for as long
            as your account exists. If you request account deletion, we will begin processing
            your request immediately; all associated data will be permanently and irreversibly
            removed within 30 days of the request. This 30-day window covers the technical
            processing time required to purge data from all systems and backups — your data is
            not retained for any other purpose during this period. Under GDPR, we retain
            personal data only for as long as necessary to fulfil the purposes for which it
            was collected.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Your rights</h2>
          <p>
            You can request deletion of your account and all associated data at any time by
            contacting us. Under GDPR, you also have the right to access, rectify, restrict
            processing of, or export your data. We will respond to any data subject request
            within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Contact</h2>
          <p>
            For privacy enquiries, email{" "}
            <a href="mailto:privacy@theedge.app" className="text-[var(--accent)] underline">
              privacy@theedge.app
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}

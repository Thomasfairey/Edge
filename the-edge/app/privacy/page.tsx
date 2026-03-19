/**
 * Privacy Policy page — required by App Store and Play Store.
 * This is a public route (added to middleware PUBLIC_PATHS).
 */

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
          <h2 className="mb-2 text-lg font-semibold">Data storage</h2>
          <p>
            Your data is stored securely in Supabase (hosted on AWS) with row-level security
            policies ensuring you can only access your own data. We do not sell or share your
            personal data with advertisers.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Your rights</h2>
          <p>
            You can request deletion of your account and all associated data at any time by
            contacting us. Under GDPR, you also have the right to access, rectify, or export
            your data.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Contact</h2>
          <p>
            For privacy enquiries, email{" "}
            <a href="mailto:privacy@presential.ai" className="text-[#5A52E0] underline">
              privacy@presential.ai
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}

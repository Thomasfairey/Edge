"use client";

/**
 * Login / signup page.
 * - Email + password auth via Supabase
 * - Invite code required for new signups
 * - Matches the warm cream design system
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();

    if (mode === "signup") {
      // Validate invite code via server
      const codeRes = await fetch("/api/validate-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      });
      if (!codeRes.ok) {
        setError("Invalid invite code");
        setLoading(false);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split("@")[0] },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      // Auto-login after signup (Supabase confirms immediately if email confirm is off)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // Might need email confirmation
        setError("Account created. Check your email to confirm, then log in.");
        setMode("login");
        setLoading(false);
        return;
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#FAF9F6" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-[#5A52E0]">the</span> edge
          </h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-[#5A52E0]/60 uppercase">
            Daily influence training
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
          <h2 className="text-lg font-semibold text-[#1A1A2E] mb-4">
            {mode === "login" ? "Log in" : "Create account"}
          </h2>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {mode === "signup" && (
            <>
              <label className="block mb-3">
                <span className="text-xs font-medium text-[#8E8C99] uppercase tracking-wide">Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-[#E0DED8] bg-[#FAF9F6] px-4 py-3 text-sm text-[#1A1A2E] placeholder:text-[#B5B3C0] focus:border-[#5A52E0] focus:outline-none focus:ring-1 focus:ring-[#5A52E0]"
                  placeholder="Your name"
                />
              </label>
              <label className="block mb-3">
                <span className="text-xs font-medium text-[#8E8C99] uppercase tracking-wide">Invite code</span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-xl border border-[#E0DED8] bg-[#FAF9F6] px-4 py-3 text-sm text-[#1A1A2E] placeholder:text-[#B5B3C0] focus:border-[#5A52E0] focus:outline-none focus:ring-1 focus:ring-[#5A52E0]"
                  placeholder="Enter invite code"
                />
              </label>
            </>
          )}

          <label className="block mb-3">
            <span className="text-xs font-medium text-[#8E8C99] uppercase tracking-wide">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-xl border border-[#E0DED8] bg-[#FAF9F6] px-4 py-3 text-sm text-[#1A1A2E] placeholder:text-[#B5B3C0] focus:border-[#5A52E0] focus:outline-none focus:ring-1 focus:ring-[#5A52E0]"
              placeholder="you@example.com"
            />
          </label>

          <label className="block mb-5">
            <span className="text-xs font-medium text-[#8E8C99] uppercase tracking-wide">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 block w-full rounded-xl border border-[#E0DED8] bg-[#FAF9F6] px-4 py-3 text-sm text-[#1A1A2E] placeholder:text-[#B5B3C0] focus:border-[#5A52E0] focus:outline-none focus:ring-1 focus:ring-[#5A52E0]"
              placeholder="Min 6 characters"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#5A52E0] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {loading ? "..." : mode === "login" ? "Log in" : "Create account"}
          </button>

          <p className="mt-4 text-center text-sm text-[#8E8C99]">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button type="button" onClick={() => { setMode("signup"); setError(null); }} className="text-[#5A52E0] font-medium">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => { setMode("login"); setError(null); }} className="text-[#5A52E0] font-medium">
                  Log in
                </button>
              </>
            )}
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-[#B5B3C0]">
          <a href="/privacy" className="underline">Privacy Policy</a>
        </p>
      </div>
    </main>
  );
}

"use client";

/**
 * Login / signup page.
 * - Email + password auth via Supabase
 * - Invite code required for new signups
 * - Password reset flow
 * - Matches the warm cream design system
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type Mode = "login" | "signup" | "forgot";

function getPasswordStrength(pw: string): { label: string; color: string } | null {
  if (!pw) return null;
  if (pw.length < 8) return { label: "Weak", color: "var(--score-low)" };
  if (pw.length < 12) return { label: "Fair", color: "var(--score-mid)" };
  const hasMixed = /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
  if (hasMixed) return { label: "Strong", color: "var(--score-high)" };
  return { label: "Fair", color: "var(--score-mid)" };
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();

    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth/callback",
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess("Check your email for a reset link");
      }
      setLoading(false);
      return;
    }

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

  function getButtonLabel(): string {
    if (loading) {
      if (mode === "forgot") return "Sending link...";
      if (mode === "signup") return "Creating account...";
      return "Signing in...";
    }
    if (mode === "forgot") return "Send reset link";
    if (mode === "signup") return "Create account";
    return "Log in";
  }

  const inputClassName =
    "mt-1 block w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-1";

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            <span style={{ color: "var(--accent)" }}>the</span> edge
          </h1>
          <p
            className="mt-1 text-sm font-medium tracking-wide uppercase"
            style={{ color: "var(--accent)", opacity: 0.6 }}
          >
            Daily influence training
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl p-6"
          style={{
            backgroundColor: "var(--surface)",
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            {mode === "forgot"
              ? "Reset password"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </h2>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--score-high-bg)", color: "var(--score-high-text)" }}>
              {success}
            </div>
          )}

          {mode === "signup" && (
            <>
              <label className="block mb-3">
                <span
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Name
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={inputClassName}
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Your name"
                />
              </label>
              <label className="block mb-3">
                <span
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Invite code
                </span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  className={inputClassName}
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--background)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Enter invite code"
                />
              </label>
            </>
          )}

          <label className="block mb-3">
            <span
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-tertiary)" }}
            >
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClassName}
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--text-primary)",
              }}
              placeholder="you@example.com"
            />
          </label>

          {mode !== "forgot" && (
            <label className="block mb-1">
              <span
                className="text-xs font-medium uppercase tracking-wide"
                style={{ color: "var(--text-tertiary)" }}
              >
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className={inputClassName}
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--background)",
                  color: "var(--text-primary)",
                }}
                placeholder="Min 6 characters"
              />
            </label>
          )}

          {mode === "signup" && passwordStrength && (
            <div className="mb-4 mt-2 flex items-center gap-2">
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width:
                    passwordStrength.label === "Weak"
                      ? "33%"
                      : passwordStrength.label === "Fair"
                        ? "66%"
                        : "100%",
                  backgroundColor: passwordStrength.color,
                }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: passwordStrength.color }}
              >
                {passwordStrength.label}
              </span>
            </div>
          )}

          {mode !== "signup" && mode !== "forgot" && (
            <div className="mb-5 mt-1 text-right">
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setSuccess(null);
                }}
                className="text-xs font-medium"
                style={{ color: "var(--accent)" }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === "forgot" && <div className="mb-5" />}
          {mode === "signup" && !passwordStrength && <div className="mb-5" />}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {loading && (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {getButtonLabel()}
          </button>

          <p
            className="mt-4 text-center text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setSuccess(null);
                  }}
                  className="font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  Sign up
                </button>
              </>
            ) : mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                    setSuccess(null);
                  }}
                  className="font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  Log in
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setSuccess(null);
                }}
                className="font-medium"
                style={{ color: "var(--accent)" }}
              >
                Back to login
              </button>
            )}
          </p>
        </form>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: "var(--text-tertiary)" }}
        >
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </main>
  );
}

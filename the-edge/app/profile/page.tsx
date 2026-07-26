"use client";

/**
 * Profile editing page.
 * Lets users update display name, professional context (bio), and feedback style.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LIFE_CONTEXTS,
  CONTEXT_LABELS,
  CONTEXT_BLURBS,
  SOCIAL_CONTEXTS,
  normaliseContexts,
  type LifeContext,
} from "@/lib/types";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type FeedbackStyle = "direct" | "balanced" | "supportive";


export default function ProfilePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [feedbackStyle, setFeedbackStyle] = useState<FeedbackStyle>("direct");
  const [contexts, setContexts] = useState<LifeContext[]>([...SOCIAL_CONTEXTS]);
  const [floorHit, setFloorHit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const res = await fetch("/api/profile");
      if (res.ok) {
        const data = await res.json();
        setDisplayName(data.displayName || "");
        if (data.profileData) {
          setBio(data.profileData.bio || "");
          setFeedbackStyle(data.profileData.feedbackStyle || "direct");
          setContexts(normaliseContexts(data.profileData.contexts, data.profileData.track));
        }
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // Update profile_data via API
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileData: { bio, feedbackStyle, contexts },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      // Update display_name via Supabase directly
      const supabase = createBrowserSupabaseClient();
      const { error: nameError } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", (await supabase.auth.getUser()).data.user?.id);

      if (nameError) throw new Error(nameError.message);

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputClassName =
    "mt-1 block w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "var(--background)" }}>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Loading...</p>
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen items-start justify-center px-4 pt-12 pb-20"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push("/")}
            className="flex items-center justify-center rounded-full transition-colors"
            style={{ width: 40, height: 40, color: "var(--text-tertiary)" }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 10H5M5 10l5-5M5 10l5 5" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Edit Profile</h1>
        </div>

        <div
          className="rounded-3xl p-6 space-y-5"
          style={{ backgroundColor: "var(--surface)", boxShadow: "var(--shadow-soft)" }}
        >
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          {saved && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--score-high-bg)", color: "var(--score-high-text)" }}>
              Profile saved
            </div>
          )}

          {/* Display name */}
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Name
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClassName}
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--text-primary)" }}
            />
          </label>

          {/* Life contexts */}
          <div>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Where you want to get better
            </span>
            <div className="mt-2 space-y-2">
              {LIFE_CONTEXTS.map((context) => {
                const selected = contexts.includes(context);
                return (
                  <button
                    key={context}
                    aria-pressed={selected}
                    onClick={() =>
                      setContexts((prev) => {
                        if (!prev.includes(context)) {
                          setFloorHit(false);
                          return [...prev, context];
                        }
                        // Never allow an empty selection — it would leave the
                        // concept pool with nothing to draw from. Say so rather
                        // than ignoring the click, which reads as a bug.
                        if (prev.length === 1) {
                          setFloorHit(true);
                          return prev;
                        }
                        setFloorHit(false);
                        return prev.filter((c) => c !== context);
                      })
                    }
                    className="w-full rounded-xl px-4 py-3 text-left text-sm transition-all"
                    style={{
                      backgroundColor: selected ? "var(--accent)" : "var(--background)",
                      color: selected ? "white" : "var(--text-secondary)",
                      border: selected ? "none" : "1px solid var(--border)",
                    }}
                  >
                    <span className="font-medium">{CONTEXT_LABELS[context]}</span>
                    <span
                      className="mt-0.5 block text-xs leading-relaxed"
                      style={{ color: selected ? "rgba(255,255,255,0.8)" : "var(--text-tertiary)" }}
                    >
                      {CONTEXT_BLURBS[context]}
                    </span>
                  </button>
                );
              })}
            </div>
            {floorHit && (
              <p className="mt-2 text-caption" style={{ color: "var(--text-tertiary)" }} role="status">
                Keep at least one — it decides what you practise.
              </p>
            )}
          </div>

          {/* About you */}
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              {contexts.length === 1 && contexts[0] === "work" ? "About your work" : "About you"}
            </span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={2000}
              className="mt-1 block w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--text-primary)" }}
              placeholder={
                contexts.length === 1 && contexts[0] === "work"
                  ? "Your role, what you're working on, and the conversations you need to get better at..."
                  : "Who you are, the people in your life, and what you find hard about being around them..."
              }
            />
            <span className="mt-1 block text-right text-xs" style={{ color: "var(--text-tertiary)" }}>{bio.length}/2000</span>
          </label>

          {/* Feedback style */}
          <div>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
              Feedback style
            </span>
            <div className="mt-2 flex gap-2">
              {(["direct", "balanced", "supportive"] as FeedbackStyle[]).map((style) => (
                <button
                  key={style}
                  onClick={() => setFeedbackStyle(style)}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium capitalize transition-all"
                  style={{
                    backgroundColor: feedbackStyle === style ? "var(--accent)" : "var(--background)",
                    color: feedbackStyle === style ? "white" : "var(--text-secondary)",
                    border: feedbackStyle === style ? "none" : "1px solid var(--border)",
                  }}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </main>
  );
}

"use client";

/**
 * 4-screen onboarding flow — premium, emotionally compelling.
 * Screen 1: Hook + value prop
 * Screen 2: How it works (4 phases)
 * Screen 3: Five scoring dimensions
 * Screen 4: Implementation intention — "When will you train?"
 */

import { useState } from "react";

const DIMENSIONS = [
  { label: "TA", name: "Technique Application", desc: "How effectively you deploy each session\u2019s concept during practice." },
  { label: "TW", name: "Tactical Awareness", desc: "Your ability to recognise the other party\u2019s tactics and adapt in real time." },
  { label: "FC", name: "Frame Control", desc: "Who owns the conversation \u2014 and whether you hold or lose it under pressure." },
  { label: "ER", name: "Emotional Regulation", desc: "Whether you stay strategic or become reactive when provoked." },
  { label: "SO", name: "Strategic Outcome", desc: "Whether you achieve your objective and shift the other party\u2019s position." },
];

const PHASES = [
  { label: "Learn", color: "var(--phase-learn)", tint: "var(--phase-learn-tint)", desc: "Micro-lesson on today\u2019s concept" },
  { label: "Recall", color: "var(--phase-learn)", tint: "var(--phase-learn-tint)", desc: "Test your memory before practice" },
  { label: "Simulate", color: "var(--phase-simulate)", tint: "var(--phase-simulate-tint)", desc: "Roleplay against a character" },
  { label: "Deploy", color: "var(--phase-deploy)", tint: "var(--phase-deploy-tint)", desc: "Real-world mission for tomorrow" },
];

const TRAINING_WINDOWS = [
  { label: "Morning commute", emoji: "\u2600\uFE0F", desc: "Start the day sharp" },
  { label: "Lunch break", emoji: "\uD83C\uDF5C", desc: "Midday reset" },
  { label: "Evening wind-down", emoji: "\uD83C\uDF19", desc: "Reflect and prepare" },
];

const TOTAL_SCREENS = 4;
const SCREEN_LABELS = ["Introduction", "How it works", "Your five dimensions", "Training window"];

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [screen, setScreen] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);

  function goForward() {
    if (screen === TOTAL_SCREENS - 1) {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
        if (selectedWindow) {
          localStorage.setItem("edge-training-window", selectedWindow);
        }
      } catch { /* ok */ }
      onComplete();
      return;
    }
    setDirection("forward");
    setScreen((s) => s + 1);
  }

  function goBack() {
    if (screen === 0) return;
    setDirection("back");
    setScreen((s) => s - 1);
  }

  const animClass = direction === "forward" ? "slide-in-right" : "slide-in-left";

  return (
    <div
      className="flex min-h-[75dvh] flex-col items-center justify-center gap-8 px-4"
      role="region"
      aria-label="Onboarding"
    >
      <div
        key={screen}
        className={`w-full max-w-sm ${animClass}`}
        role="tabpanel"
        aria-label={SCREEN_LABELS[screen]}
      >
        {screen === 0 && (
          <div className="card text-center" style={{ padding: "32px 24px" }}>
            <h1 className="text-display font-bold" style={{ color: "var(--text-primary)" }}>
              <span style={{ color: "var(--accent)" }}>the</span> edge
            </h1>
            <p className="mt-2 text-body" style={{ color: "var(--text-secondary)" }}>
              Daily influence training for your commute
            </p>
            <div className="my-6 h-px" style={{ background: "var(--border)" }} role="separator" />
            <p className="text-lead leading-relaxed" style={{ color: "var(--text-primary)" }}>
              Every day, you&apos;ll learn one influence technique, practise it in a realistic roleplay against a challenging character, and receive a blunt performance debrief.
            </p>
            <p className="mt-4 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
              Then you&apos;ll deploy what you learned with a micro-mission designed for your real conversations.
            </p>
            <p className="mt-5 text-caption font-medium" style={{ color: "var(--text-secondary)" }}>
              10 minutes. No fluff. Measurable improvement.
            </p>
          </div>
        )}

        {screen === 1 && (
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>How it works</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>Four phases, every session</p>
            <ol className="mt-6 space-y-3" aria-label="Session phases">
              {PHASES.map((p, idx) => (
                <li key={p.label} className="flex items-center gap-3.5 rounded-[var(--radius-md)] p-3.5" style={{ backgroundColor: p.tint }}>
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold"
                    style={{ backgroundColor: p.color, color: "white" }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{p.label}</p>
                    <p className="text-caption" style={{ color: "var(--text-secondary)" }}>{p.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {screen === 2 && (
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>Your five dimensions</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>Scored 1&ndash;5 after every roleplay</p>
            <div className="mt-6 space-y-4" role="list" aria-label="Score dimensions">
              {DIMENSIONS.map((d) => (
                <div key={d.label} className="flex items-start gap-3.5" role="listitem">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    {d.label}
                  </div>
                  <div>
                    <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{d.name}</p>
                    <p className="text-caption leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 3 && (
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>When will you train?</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>
              Pick your daily window &mdash; consistency beats intensity
            </p>
            <div className="mt-6 space-y-3">
              {TRAINING_WINDOWS.map((w) => (
                <button
                  key={w.label}
                  onClick={() => setSelectedWindow(w.label)}
                  className={`w-full flex items-center gap-3 rounded-[var(--radius-md)] p-4 text-left transition-all ${
                    selectedWindow === w.label
                      ? "ring-2 ring-[var(--accent)] scale-[1.01]"
                      : "hover:opacity-80"
                  }`}
                  style={{
                    backgroundColor: selectedWindow === w.label ? "var(--accent-soft)" : "var(--background)",
                  }}
                >
                  <span className="text-2xl">{w.emoji}</span>
                  <div>
                    <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{w.label}</p>
                    <p className="text-caption" style={{ color: "var(--text-secondary)" }}>{w.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-5 text-center text-caption" style={{ color: "var(--text-tertiary)" }}>
              You can change this anytime. This helps build your daily habit.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex w-full max-w-sm items-center justify-between px-1" aria-label="Onboarding navigation">
        <button
          onClick={goBack}
          disabled={screen === 0}
          className={`touch-target text-body font-medium transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A52E0] focus-visible:ring-offset-2 rounded-lg px-2 py-1 ${screen === 0 ? "opacity-0 pointer-events-none" : ""}`}
          style={{ color: "var(--text-secondary)" }}
          aria-label="Go back"
        >
          Back
        </button>

        {/* Progress dots */}
        <div className="flex gap-2.5" role="tablist" aria-label="Onboarding progress">
          {Array.from({ length: TOTAL_SCREENS }, (_, i) => (
            <div
              key={i}
              role="tab"
              aria-selected={i === screen}
              aria-label={`Step ${i + 1} of ${TOTAL_SCREENS}: ${SCREEN_LABELS[i]}`}
              className="rounded-full transition-all"
              style={{
                width: i === screen ? 24 : 8,
                height: 8,
                backgroundColor: i === screen ? "var(--accent)" : "var(--border)",
              }}
            />
          ))}
        </div>

        <button
          onClick={goForward}
          disabled={screen === 3 && !selectedWindow}
          className="btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A52E0] focus-visible:ring-offset-2"
          style={{ width: "auto", minWidth: 100 }}
        >
          {screen === TOTAL_SCREENS - 1 ? "Start" : "Next"}
        </button>
      </nav>
    </div>
  );
}

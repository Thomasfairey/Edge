"use client";

/**
 * 4-screen onboarding flow — premium, emotionally compelling.
 * Screen 1: Hook + value prop
 * Screen 2: How it works (4 phases)
 * Screen 3: Five scoring dimensions
 * Screen 4: Implementation intention — "When will you train?"
 */

import { useState } from "react";
import { dimensionSetFor } from "@/lib/scoring-dimensions";

// Scoring dimensions depend on where you're practising — a family
// conversation is scored on regulation and repair, a date on presence and
// spark. Onboarding shows one context's five as an example rather than
// claiming a single universal rubric.
const EXAMPLE_DIMENSIONS = dimensionSetFor("friends").dimensions;

const PHASES = [
  { label: "Learn", color: "var(--phase-learn)", tint: "var(--phase-learn-tint)", desc: "A short lesson on one idea, then a quick recall check" },
  { label: "Simulate", color: "var(--phase-simulate)", tint: "var(--phase-simulate-tint)", desc: "A conversation with someone who has their own agenda" },
  { label: "Debrief", color: "var(--phase-debrief)", tint: "var(--phase-debrief-tint)", desc: "An honest read on how it actually went" },
  { label: "Deploy", color: "var(--phase-deploy)", tint: "var(--phase-deploy-tint)", desc: "One thing to try with a real person today" },
];

const COMMITMENTS = [
  { label: "About ten minutes", desc: "Some days less \u2014 sessions vary in length and shape" },
  { label: "30 days", desc: "Long enough for the difference to show up in real conversations" },
  { label: "It ends in the real world", desc: "Every session finishes with something to try on an actual person" },
];

const TOTAL_SCREENS = 4;
const SCREEN_LABELS = ["Introduction", "How it works", "How you\u2019re scored", "Your commitment"];

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [screen, setScreen] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  function goForward() {
    if (screen === TOTAL_SCREENS - 1) {
      try {
        localStorage.setItem("edge-onboarding-complete", "1");
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
              Daily practice at being good with people
            </p>
            <div className="my-6 h-px" style={{ background: "var(--border)" }} role="separator" />
            <p className="text-lead leading-relaxed" style={{ color: "var(--text-primary)" }}>
              Most of us get better with people by accident, if at all. There is no rehearsal room for the conversation with your father, the date that matters, or the friend you have quietly let drift.
            </p>
            <p className="mt-4 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
              This is that room. You practise one idea a day against someone with their own mood and agenda, find out honestly how it went, and take one specific thing into your actual life.
            </p>
            <p className="mt-5 text-caption font-medium" style={{ color: "var(--text-secondary)" }}>
              Ten minutes. No flattery. Real conversations.
            </p>
          </div>
        )}

        {screen === 1 && (
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>How it works</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>The shape varies day to day</p>
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
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>How you&rsquo;re scored</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>Five things, 1&ndash;5, and they change with the setting. These are the ones for friendships.</p>
            <div className="mt-6 space-y-4" role="list" aria-label="Score dimensions">
              {EXAMPLE_DIMENSIONS.map((d) => (
                <div key={d.key} className="flex items-start gap-3.5" role="listitem">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    {d.short}
                  </div>
                  <div>
                    <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{d.label}</p>
                    <p className="text-caption leading-relaxed" style={{ color: "var(--text-secondary)" }}>{d.prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 3 && (
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>Your commitment</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>
              Consistency beats intensity
            </p>
            <div className="mt-6 space-y-3.5" role="list" aria-label="Commitment items">
              {COMMITMENTS.map((c) => (
                <div
                  key={c.label}
                  role="listitem"
                  className="flex items-start gap-3.5 rounded-[var(--radius-md)] p-4"
                  style={{ backgroundColor: "var(--accent-soft)" }}
                >
                  <div
                    className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold"
                    style={{ backgroundColor: "var(--accent)", color: "white" }}
                    aria-hidden="true"
                  >
                    &#10003;
                  </div>
                  <div>
                    <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{c.label}</p>
                    <p className="text-caption" style={{ color: "var(--text-secondary)" }}>{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-caption" style={{ color: "var(--text-tertiary)" }}>
              Every day you show up, The Edge adapts to make you sharper.
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex w-full max-w-sm items-center justify-between px-1" aria-label="Onboarding navigation">
        <button
          onClick={goBack}
          disabled={screen === 0}
          className={`touch-target text-body font-medium transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-lg px-2 py-1 ${screen === 0 ? "opacity-0 pointer-events-none" : ""}`}
          style={{ color: "var(--text-secondary)" }}
          aria-label="Go back"
        >
          Back
        </button>

        {/* Progress dots */}
        <div className="flex gap-2.5" aria-label="Onboarding progress">
          {Array.from({ length: TOTAL_SCREENS }, (_, i) => (
            <div
              key={i}
              role="presentation"
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
          disabled={false}
          className="btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{ width: "auto", minWidth: 100 }}
        >
          {screen === TOTAL_SCREENS - 1 ? "Start" : "Next"}
        </button>
      </nav>
    </div>
  );
}

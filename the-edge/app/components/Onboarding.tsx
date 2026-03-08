"use client";

/**
 * 3-screen onboarding flow — premium, emotionally compelling.
 * Screen 1: Hook + value prop
 * Screen 2: How it works (4 phases)
 * Screen 3: Five scoring dimensions
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

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [screen, setScreen] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  function goForward() {
    if (screen === 2) {
      try { localStorage.setItem("edge-onboarding-complete", "1"); } catch {}
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
    <div className="flex min-h-[75dvh] flex-col items-center justify-center gap-8">
      <div
        key={screen}
        className={`w-full max-w-sm ${animClass}`}
      >
        {screen === 0 && (
          <div className="card text-center" style={{ padding: "32px 24px" }}>
            <h1 className="text-display font-bold" style={{ color: "var(--text-primary)" }}>
              <span style={{ color: "var(--accent)" }}>the</span> edge
            </h1>
            <p className="mt-2 text-body" style={{ color: "var(--text-secondary)" }}>
              Daily influence training
            </p>
            <div className="my-6 h-px" style={{ background: "var(--border)" }} />
            <p className="text-lead leading-relaxed" style={{ color: "var(--text-primary)" }}>
              Every day, you learn one influence technique, practise it in a realistic roleplay, and receive a blunt performance debrief.
            </p>
            <p className="mt-4 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
              Then you deploy what you learned with a micro-mission designed for your real conversations.
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
            <div className="mt-6 space-y-3">
              {PHASES.map((p, idx) => (
                <div key={p.label} className="flex items-center gap-3.5 rounded-[var(--radius-md)] p-3.5" style={{ backgroundColor: p.tint }}>
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold"
                    style={{ backgroundColor: p.color, color: "white" }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>{p.label}</p>
                    <p className="text-caption" style={{ color: "var(--text-secondary)" }}>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 2 && (
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="text-center text-lead font-semibold" style={{ color: "var(--text-primary)" }}>Your five dimensions</p>
            <p className="text-center text-caption mt-1" style={{ color: "var(--text-secondary)" }}>Scored 1\u20135 after every roleplay</p>
            <div className="mt-6 space-y-4">
              {DIMENSIONS.map((d) => (
                <div key={d.label} className="flex items-start gap-3.5">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold"
                    style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}
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
      </div>

      {/* Navigation */}
      <div className="flex w-full max-w-sm items-center justify-between px-1">
        <button
          onClick={goBack}
          className={`touch-target text-body font-medium transition-opacity ${screen === 0 ? "opacity-0 pointer-events-none" : ""}`}
          style={{ color: "var(--text-secondary)" }}
        >
          Back
        </button>

        {/* Dots */}
        <div className="flex gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
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
          className="btn-primary"
          style={{ width: "auto", minWidth: 100 }}
        >
          {screen === 2 ? "Start" : "Next"}
        </button>
      </div>
    </div>
  );
}

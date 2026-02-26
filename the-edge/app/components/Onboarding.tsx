"use client";

/**
 * 3-screen onboarding flow shown on home page when no ledger entries exist.
 * Uses localStorage key 'edge-onboarding-complete' to track completion.
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
  { label: "Learn", color: "#B8D4E3", desc: "Micro-lesson on today\u2019s concept" },
  { label: "Recall", color: "#B8D4E3", desc: "Test your memory before practice" },
  { label: "Simulate", color: "#F2C4C4", desc: "Roleplay against a character" },
  { label: "Deploy", color: "#B8E0C8", desc: "Real-world mission for tomorrow" },
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
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4">
      <div
        key={screen}
        className={`w-full max-w-sm ${animClass}`}
      >
        {screen === 0 && (
          <div className="rounded-3xl bg-white p-8 shadow-[var(--shadow-soft)] text-center">
            <p className="mb-2 text-3xl font-bold text-primary">the edge</p>
            <p className="mb-6 text-sm text-secondary">Daily influence training for your commute</p>
            <div className="mb-6 h-px bg-[#F0EDE8]" />
            <p className="text-base leading-relaxed text-primary">
              Every day, you\u2019ll learn one influence technique, practise it in a realistic roleplay against a challenging character, and receive a blunt performance debrief.
            </p>
            <p className="mt-4 text-base leading-relaxed text-primary">
              Then you\u2019ll deploy what you learned with a micro-mission designed for your real conversations.
            </p>
            <p className="mt-4 text-sm text-secondary">
              10 minutes. No fluff. Measurable improvement.
            </p>
          </div>
        )}

        {screen === 1 && (
          <div className="rounded-3xl bg-white p-8 shadow-[var(--shadow-soft)]">
            <p className="mb-1 text-center text-lg font-semibold text-primary">How it works</p>
            <p className="mb-6 text-center text-sm text-secondary">Four phases, every session</p>
            <div className="space-y-3">
              {PHASES.map((p) => (
                <div key={p.label} className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: `${p.color}33` }}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: p.color }}>
                    <span className="text-xs font-bold text-white">{PHASES.indexOf(p) + 1}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary">{p.label}</p>
                    <p className="text-xs text-secondary">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {screen === 2 && (
          <div className="rounded-3xl bg-white p-8 shadow-[var(--shadow-soft)]">
            <p className="mb-1 text-center text-lg font-semibold text-primary">Your five dimensions</p>
            <p className="mb-6 text-center text-sm text-secondary">Scored 1\u20135 after every roleplay</p>
            <div className="space-y-3">
              {DIMENSIONS.map((d) => (
                <div key={d.label} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#EEEDFF] text-xs font-bold text-[#5A52E0]">
                    {d.label}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary">{d.name}</p>
                    <p className="text-xs leading-relaxed text-secondary">{d.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex w-full max-w-sm items-center justify-between">
        <button
          onClick={goBack}
          className={`text-sm font-medium text-secondary transition-opacity ${screen === 0 ? "opacity-0 pointer-events-none" : ""}`}
        >
          Back
        </button>

        {/* Dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${i === screen ? "w-6 bg-[#5A52E0]" : "w-2 bg-[#E0DED8]"}`}
            />
          ))}
        </div>

        <button
          onClick={goForward}
          className="rounded-full bg-[#5A52E0] px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
        >
          {screen === 2 ? "Start" : "Next"}
        </button>
      </div>
    </div>
  );
}

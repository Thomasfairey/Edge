"use client";

import { PHASES } from "./types";
import type { SessionPhase } from "./types";

interface PhaseIndicatorProps {
  current: SessionPhase;
  completed: Set<SessionPhase>;
}

export default function PhaseIndicator({ current, completed }: PhaseIndicatorProps) {
  return (
    <nav aria-label="Session progress" className="flex-shrink-0 z-50 pt-safe" style={{ backgroundColor: "var(--background)" }}>
      <div className="flex items-center justify-center gap-3 pt-3 pb-3" role="list" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {PHASES.map((p, idx) => {
          const isActive = p.key === current || (current === "retrieval" && p.key === "lesson");
          const isDone = completed.has(p.key);
          const isPast = idx < PHASES.findIndex(pp => pp.key === current || (current === "retrieval" && pp.key === "lesson"));

          return (
            <div key={p.key} className="flex items-center gap-3" role="listitem" aria-current={isActive ? "step" : undefined}>
              <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 48 }}>
                <div
                  aria-hidden="true"
                  className={`rounded-full transition-all ${isActive ? "phase-dot-active" : ""}`}
                  style={{
                    width: isActive ? 16 : isDone ? 12 : 10,
                    height: isActive ? 16 : isDone ? 12 : 10,
                    backgroundColor: isDone || isActive ? p.color : "transparent",
                    border: isDone || isActive ? "none" : `2px solid ${p.color}40`,
                    boxShadow: isActive ? `0 0 10px ${p.color}50` : "none",
                    transition: "all 400ms var(--ease-out-expo)",
                  }}
                />
                <span
                  className="text-caption font-medium transition-colors"
                  style={{
                    color: isActive ? "var(--text-primary)" : isDone ? "var(--text-secondary)" : "var(--text-tertiary)",
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 500,
                    transition: "color 300ms ease",
                  }}
                >
                  {p.label}
                </span>
              </div>
              {idx < PHASES.length - 1 && (
                <div
                  className="h-[2px] w-5 rounded-full -mt-4"
                  style={{
                    backgroundColor: isPast || isDone ? `${p.color}80` : "var(--border-subtle)",
                    transition: "background-color 400ms ease",
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

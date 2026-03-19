"use client";

import { useState, useEffect, useRef } from "react";
import type { SessionScores } from "./types";
import { SCORE_DIMS, scoreCircleColor, scoreTextColor, LoadingDots } from "./types";

// ---------------------------------------------------------------------------
// Debrief section parser
// ---------------------------------------------------------------------------

function parseDebriefSections(text: string): { title: string; content: React.ReactNode[] }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: React.ReactNode[] }[] = [];
  let currentSection: { title: string; content: React.ReactNode[] } = { title: "", content: [] };
  let key = 0;
  let inReplayBlock = false;

  function pushLine(line: string) {
    const lower = line.toLowerCase();

    if (lower.includes("what you said") || lower.includes("you said:") || lower.includes("your response:")) {
      inReplayBlock = true;
      currentSection.content.push(
        <div key={key++} className="mt-3 rounded-2xl border-l-4 border-[#F2C4C4] bg-[#FDF2F2] px-4 py-3">
          <p className="text-xs font-semibold text-[#D4908F] uppercase tracking-wider">Your move</p>
          <p className="mt-1 text-sm leading-relaxed text-primary/70 italic">
            {line.replace(/^.*?(?:what you said|you said:|your response:)\s*/i, "").replace(/\*\*/g, "")}
          </p>
        </div>
      );
      return;
    }

    if (inReplayBlock && (lower.includes("what you should") || lower.includes("stronger response") || lower.includes("try instead") || lower.includes("better approach") || lower.includes("ideal response"))) {
      inReplayBlock = false;
      currentSection.content.push(
        <div key={key++} className="mt-1 mb-3 rounded-2xl border-l-4 border-[#6BC9A0] bg-[#E8F5ED] px-4 py-3">
          <p className="text-xs font-semibold text-[#2D6A4F] uppercase tracking-wider">The edge move</p>
          <p className="mt-1 text-sm leading-relaxed text-primary font-medium">
            {line.replace(/^.*?(?:what you should|stronger response|try instead|better approach|ideal response)[^:]*:\s*/i, "").replace(/\*\*/g, "")}
          </p>
        </div>
      );
      return;
    }

    if (line.trim() === "") {
      if (inReplayBlock) return;
      currentSection.content.push(<div key={key++} className="h-2" />);
    } else if (lower.includes("why this works") || lower.includes("why it works")) {
      currentSection.content.push(
        <div key={key++} className="mt-2 mb-2 rounded-2xl bg-[#EEEDFF] px-4 py-3">
          <p className="text-xs font-semibold text-[var(--accent)] uppercase tracking-wider mb-1">Why this works</p>
          <p className="text-sm leading-relaxed text-primary">
            {line.replace(/^.*?(?:why (?:this|it) works)[^:]*:\s*/i, "").replace(/\*\*/g, "")}
          </p>
        </div>
      );
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      currentSection.content.push(
        <p key={key++} className="text-sm leading-relaxed text-primary">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
            ) : part
          )}
        </p>
      );
    }
  }

  for (const line of lines) {
    if (line.startsWith("## ") || (line.startsWith("**") && line.endsWith("**") && !line.includes("**") && line.length < 80) || (line.startsWith("**") && line.endsWith("**"))) {
      const isSectionHeader = line.startsWith("## ") || (line.startsWith("**") && line.endsWith("**") && line.length < 80);
      if (isSectionHeader) {
        inReplayBlock = false;
        if (currentSection.title || currentSection.content.length > 0) {
          sections.push(currentSection);
        }
        const header = line.startsWith("## ") ? line.slice(3) : line.slice(2, -2);
        currentSection = { title: header, content: [] };
        continue;
      }
    }
    pushLine(line);
  }
  if (currentSection.title || currentSection.content.length > 0) {
    sections.push(currentSection);
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Collapsible debrief section
// ---------------------------------------------------------------------------

function DebriefSection({ title, children, scores, defaultOpen }: {
  title: string;
  children: React.ReactNode;
  scores?: SessionScores | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  const dimMap: Record<string, keyof SessionScores> = {
    technique: "technique_application",
    tactical: "tactical_awareness",
    frame: "frame_control",
    emotion: "emotional_regulation",
    regulation: "emotional_regulation",
    strategic: "strategic_outcome",
    outcome: "strategic_outcome",
  };
  const titleLower = title.toLowerCase();
  let matchedScore: number | null = null;
  if (scores) {
    for (const [keyword, key] of Object.entries(dimMap)) {
      if (titleLower.includes(keyword)) {
        matchedScore = scores[key];
        break;
      }
    }
  }

  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (open) {
      const el = contentRef.current;
      if (el) {
        setHeight(el.scrollHeight);
        const t = setTimeout(() => setHeight(undefined), 250);
        return () => clearTimeout(t);
      }
    } else {
      const el = contentRef.current;
      if (el) {
        setHeight(el.scrollHeight);
        requestAnimationFrame(() => setHeight(0));
      }
    }
  }, [open]);

  return (
    <div className="border-b border-[#F0EDE8]/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left"
        style={{ minHeight: 48 }}
      >
        <div className="flex items-center gap-2.5">
          <h2 className="text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--phase-debrief-muted)" }}>{title}</h2>
          {matchedScore !== null && (
            <span
              className="badge"
              style={{
                backgroundColor: matchedScore >= 4 ? "var(--score-high-bg)" : matchedScore >= 3 ? "var(--score-mid-bg)" : "var(--score-low-bg)",
                color: matchedScore >= 4 ? "var(--score-high-text)" : matchedScore >= 3 ? "var(--score-mid-text)" : "var(--score-low-text)",
                padding: "3px 10px",
                fontSize: 12,
              }}
            >
              {matchedScore}/5
            </span>
          )}
        </div>
        <div className="touch-target -mr-1">
          <svg
            className="h-5 w-5 transition-transform"
            style={{ color: "var(--text-tertiary)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 250ms ease" }}
            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height,opacity] duration-250 ease-out"
        style={{
          maxHeight: height === undefined ? "none" : `${height}px`,
          opacity: open ? 1 : 0,
          transition: "max-height 250ms ease-out, opacity 200ms ease-out",
        }}
      >
        <div className="pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DebriefPhase props
// ---------------------------------------------------------------------------

interface DebriefPhaseProps {
  isLoading: boolean;
  debriefContent: string | null;
  scores: SessionScores | null;
  previousScores: SessionScores | null;
}

// ---------------------------------------------------------------------------
// DebriefPhase
// ---------------------------------------------------------------------------

export default function DebriefPhase({
  isLoading,
  debriefContent,
  scores,
  previousScores,
}: DebriefPhaseProps) {
  return (
    <>
      {isLoading && (
        <div className="text-center">
          <p className="mb-2 text-sm text-secondary">Analysing your performance...</p>
          <LoadingDots />
        </div>
      )}

      {debriefContent && !isLoading && (
        <>
          {/* Score circles with deltas */}
          {scores && (
            <div className="mb-5 card">
              <div className="flex items-center justify-center gap-4">
                {SCORE_DIMS.map(({ key, fullName }) => {
                  const s = scores[key];
                  const prev = previousScores ? previousScores[key] : null;
                  const diff = prev !== null ? s - prev : null;
                  return (
                    <div key={key} className="flex flex-col items-center gap-2 animate-score-pop" style={{ opacity: 0 }}>
                      <div
                        className="flex items-center justify-center rounded-full text-lead font-bold relative"
                        style={{
                          width: 52, height: 52,
                          backgroundColor: scoreCircleColor(s),
                          color: scoreTextColor(s),
                        }}
                      >
                        {s}
                        {diff !== null && (
                          <span
                            className="absolute -top-1.5 -right-2 text-caption font-bold rounded-full px-1.5"
                            style={{
                              fontSize: 11,
                              color: diff > 0 ? "var(--score-high-text)" : diff < 0 ? "var(--score-low-text)" : "var(--text-secondary)",
                              backgroundColor: diff > 0 ? "var(--score-high-bg)" : diff < 0 ? "var(--score-low-bg)" : "var(--border)",
                            }}
                          >
                            {diff > 0 ? `+${diff}` : diff === 0 ? "=" : diff}
                          </span>
                        )}
                      </div>
                      <span className="text-caption" style={{ color: "var(--text-secondary)", fontSize: 12 }}>{fullName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Analysis card */}
          <div className="select-text mb-5 card-tinted" style={{ backgroundColor: "var(--phase-debrief-tint)" }} aria-live="polite">
            {(() => {
              const sections = parseDebriefSections(debriefContent);
              if (sections.length <= 1) {
                return <div className="space-y-0">{sections[0]?.content}</div>;
              }
              return sections.map((s, i) => (
                s.title ? (
                  <DebriefSection key={i} title={s.title} scores={scores} defaultOpen={i < 2}>
                    <div className="space-y-1">{s.content}</div>
                  </DebriefSection>
                ) : (
                  <div key={i} className="space-y-1 pb-3">{s.content}</div>
                )
              ));
            })()}
          </div>
        </>
      )}
    </>
  );
}

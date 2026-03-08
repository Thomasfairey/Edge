"use client";

/**
 * Session page — manages the full daily loop.
 * Day 1:  Learn → Retrieval → Simulate → Debrief → Mission
 * Day 2+: Learn → Retrieval → Simulate → Debrief → Check-in → Mission
 *
 * Tiimo-inspired: phase-coloured backgrounds, super-rounded cards, soft pastels,
 * emoji command circles, coloured score dots, confetti completion.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SessionPhase,
  Concept,
  CharacterArchetype,
  SessionScores,
  Message,
} from "@/lib/types";
import { useVoice } from "@/app/hooks/useVoice";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "edge-session-state";
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const PHASES: { key: SessionPhase; label: string; color: string }[] = [
  { key: "lesson", label: "Learn", color: "#B8D4E3" },
  { key: "roleplay", label: "Sim", color: "#F2C4C4" },
  { key: "debrief", label: "Brief", color: "#C5B8E8" },
  { key: "mission", label: "Deploy", color: "#B8E0C8" },
];

const PHASE_BG: Record<string, string> = {
  lesson: "#EFF6FA",
  retrieval: "#EFF6FA",
  roleplay: "#FDF2F2",
  debrief: "#F3F0FA",
  mission: "#F0FAF4",
};

const PHASE_TINT: Record<string, string> = {
  lesson: "#EFF6FA",
  retrieval: "#EFF6FA",
  roleplay: "#FDF2F2",
  debrief: "#F3F0FA",
  mission: "#F0FAF4",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

/** Normalise scores that may use abbreviated keys (TA/TW/FC/ER/SO) to canonical form. */
const ABBREV_MAP: Record<string, keyof SessionScores> = {
  TA: "technique_application", TW: "tactical_awareness",
  FC: "frame_control", ER: "emotional_regulation", SO: "strategic_outcome",
};
function normaliseScores(scores: Record<string, number> | null): SessionScores | null {
  if (!scores) return null;
  if ("technique_application" in scores) return scores as unknown as SessionScores;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    out[ABBREV_MAP[k] ?? k] = v;
  }
  return out as unknown as SessionScores;
}

function characterEmoji(id?: string): string {
  switch (id) {
    case "sceptical-investor": return "🎯";
    case "political-stakeholder": return "🏛";
    case "resistant-report": return "😏";
    case "hostile-negotiator": return "⚔️";
    case "alpha-peer": return "🔬";
    case "consultancy-gatekeeper": return "👔";
    default: return "🎭";
  }
}

function PersonaLine({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="mt-1 text-left pl-10 w-full"
    >
      <p className={`text-[11px] text-tertiary transition-all duration-200 ${expanded ? "" : "truncate"}`}>
        {description}
      </p>
    </button>
  );
}

function scoreCircleColor(score: number): string {
  if (score >= 4) return "var(--score-high)";
  if (score === 3) return "var(--score-mid)";
  return "var(--score-low)";
}

function scoreTextColor(score: number): string {
  if (score >= 4) return "var(--score-high-text)";
  if (score === 3) return "var(--score-mid-text)";
  return "var(--score-low-text)";
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5,
  delay = 3000,
  onAttempt?: (attempt: number) => void
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      onAttempt?.(i);
      const res = await fetch(url, options);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e as Error;
      if (i < maxRetries) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

// ---------------------------------------------------------------------------
// Phase indicator — coloured dots per phase
// ---------------------------------------------------------------------------

function PhaseIndicator({
  current,
  completed,
}: {
  current: SessionPhase;
  completed: Set<SessionPhase>;
}) {
  return (
    <div className="flex-shrink-0 z-50 pt-safe" style={{ backgroundColor: "var(--background)" }}>
      <div className="flex items-center justify-center gap-3 pt-3 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {PHASES.map((p, idx) => {
          const isActive = p.key === current || (current === "retrieval" && p.key === "lesson");
          const isDone = completed.has(p.key);
          const isPast = idx < PHASES.findIndex(pp => pp.key === current || (current === "retrieval" && pp.key === "lesson"));

          return (
            <div key={p.key} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 48 }}>
                <div
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
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading dots
// ---------------------------------------------------------------------------

function LoadingDots() {
  return (
    <div className="flex items-center justify-center gap-2 py-5">
      <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(90,82,224,0.4)" }} />
      <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(90,82,224,0.4)" }} />
      <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(90,82,224,0.4)" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string, context: "lesson" | "debrief" | "default" = "default"): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let isFirstParagraph = true;
  const isLesson = context === "lesson";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      isFirstParagraph = true;
      elements.push(
        <h2 key={key++} className="mb-2 mt-5 text-caption font-semibold uppercase tracking-wider first:mt-0" style={{ color: "var(--phase-learn-muted)" }}>
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="mb-2 mt-4 text-caption font-medium" style={{ color: "var(--phase-learn-muted)" }}>
          {line.slice(4)}
        </h3>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const hasBold = parts.some(p => p.startsWith("**"));

      // Detect example-like content (quotes, named scenarios, "When X did Y")
      const isExample = isLesson && !hasBold && (
        line.startsWith('"') || line.startsWith('\u201C') ||
        /^When [A-Z]/.test(line) || /^In \d{4}/.test(line)
      );

      if (isExample) {
        isFirstParagraph = false;
        elements.push(
          <div key={key++} className="lesson-example">{line}</div>
        );
      } else if (isFirstParagraph && !hasBold && line.length > 20) {
        isFirstParagraph = false;
        const sentenceEnd = line.search(/[.!?]\s|[.!?]$/);
        if (sentenceEnd > 0) {
          const firstSentence = line.slice(0, sentenceEnd + 1);
          const rest = line.slice(sentenceEnd + 1);
          elements.push(
            <p key={key++} className={isLesson ? "lesson-definition" : "text-base leading-relaxed text-primary"}>
              {isLesson ? firstSentence : <strong className="font-semibold">{firstSentence}</strong>}
              {rest && <span className={isLesson ? "font-normal text-base" : ""}>{rest}</span>}
            </p>
          );
        } else {
          elements.push(
            <p key={key++} className={isLesson ? "lesson-definition" : "text-base leading-relaxed text-primary font-medium"}>{line}</p>
          );
        }
      } else {
        isFirstParagraph = false;
        if (!hasBold && line.length > 200) {
          const sentences = line.match(/[^.!?]+[.!?]+\s*/g) || [line];
          const chunks: string[] = [];
          let buf = "";
          for (const s of sentences) {
            buf += s;
            if (buf.length > 100) {
              chunks.push(buf.trim());
              buf = "";
            }
          }
          if (buf.trim()) chunks.push(buf.trim());
          for (const chunk of chunks) {
            elements.push(
              <p key={key++} className={`${isLesson ? "lesson-body" : "text-base leading-relaxed text-primary"} mb-2`}>{chunk}</p>
            );
          }
        } else {
          elements.push(
            <p key={key++} className={isLesson ? "lesson-body" : "text-base leading-relaxed text-primary"}>
              {parts.map((part, i) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={i} className="font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  part
                )
              )}
            </p>
          );
        }
      }
    }
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Lesson section splitter — parses "## The Principle", "## The Play", "## The Counter"
// Also handles review format: "## The Refresher", "## The Advanced Play"
// ---------------------------------------------------------------------------

function splitLessonSections(text: string): { title: string; content: string }[] {
  const raw: { title: string; content: string }[] = [];
  const pattern = /^## (The (?:Principle|Play|Counter|Refresher|Advanced Play))/gm;
  const headings: { title: string; index: number }[] = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    headings.push({ title: match[1], index: match.index });
  }

  if (headings.length === 0) {
    return [{ title: "Lesson", content: text }];
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index + headings[i].title.length + 3;
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    raw.push({
      title: headings[i].title,
      content: text.slice(start, end).trim(),
    });
  }

  const MAX_CARD_CHARS = 600;
  const sections: { title: string; content: string }[] = [];
  for (const section of raw) {
    if (section.content.length <= MAX_CARD_CHARS) {
      sections.push(section);
    } else {
      let paragraphs = section.content.split(/\n\n+/);
      if (paragraphs.length <= 1) {
        paragraphs = section.content.split(/\n/);
      }
      let current = "";
      let partNum = 1;
      for (const para of paragraphs) {
        if (current && (current.length + para.length + 2) > MAX_CARD_CHARS) {
          sections.push({ title: partNum === 1 ? section.title : `${section.title} (cont.)`, content: current.trim() });
          current = para;
          partNum++;
        } else {
          current += (current ? "\n\n" : "") + para;
        }
      }
      if (current.trim()) {
        sections.push({ title: partNum > 1 ? `${section.title} (cont.)` : section.title, content: current.trim() });
      }
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Swipeable lesson cards component (#4 — enhanced navigation)
// ---------------------------------------------------------------------------

function LessonCards({
  sections,
  isStreaming,
  onCardChange,
}: {
  sections: { title: string; content: string }[];
  isStreaming: boolean;
  onCardChange?: (current: number, total: number) => void;
}) {
  const [currentCard, setCurrentCard] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Fade swipe hint after 3s
  useEffect(() => {
    const t = setTimeout(() => setShowSwipeHint(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // Notify parent of card position
  useEffect(() => {
    onCardChange?.(currentCard, sections.length);
  }, [currentCard, sections.length, onCardChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentCard < sections.length - 1) {
        setCurrentCard((c) => c + 1);
      } else if (diff < 0 && currentCard > 0) {
        setCurrentCard((c) => c - 1);
      }
    }
  };

  const section = sections[currentCard];
  if (!section) return null;

  const hasMore = currentCard < sections.length - 1;

  return (
    <div className="relative">
      {/* Next-card peek strip */}
      {hasMore && (
        <div
          className="absolute right-0 top-0 bottom-0 w-3 rounded-r-3xl z-10 pointer-events-none"
          style={{
            background: "linear-gradient(to left, rgba(90,82,224,0.08), transparent)",
          }}
        />
      )}

      <div
        className="select-text overflow-y-auto relative"
        style={{
          backgroundColor: "var(--phase-learn-tint)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          boxShadow: "var(--shadow-soft)",
          maxHeight: "calc(100dvh - 220px)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--phase-learn-muted)" }} />
          <h2 className="text-caption font-semibold uppercase tracking-widest" style={{ color: "var(--phase-learn-muted)" }}>{section.title}</h2>
        </div>
        <div className="space-y-1">
          {renderMarkdown(section.content, "lesson")}
          {isStreaming && currentCard === sections.length - 1 && (
            <span className="inline-block animate-pulse text-[#5A52E0]">|</span>
          )}
        </div>

        {/* Swipe hint on first card */}
        {currentCard === 0 && showSwipeHint && sections.length > 1 && (
          <div
            className="mt-4 text-center text-xs text-[#5A52E0] transition-opacity duration-1000"
            style={{ opacity: showSwipeHint ? 0.8 : 0 }}
          >
            Swipe to continue &rarr;
          </div>
        )}

        {/* Sticky dot indicators */}
        <div className="sticky bottom-0 pt-3 pb-1" style={{ background: "linear-gradient(transparent, var(--phase-learn-tint) 40%)" }}>
          <div className="flex items-center justify-center gap-2">
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentCard(i)}
                aria-label={`Go to page ${i + 1} of ${sections.length}`}
                aria-current={i === currentCard ? "true" : undefined}
                className="touch-target"
                style={{ minWidth: 28 }}
              >
                <div
                  className="rounded-full transition-all"
                  style={{
                    height: 8,
                    width: i === currentCard ? 28 : 8,
                    backgroundColor: i === currentCard ? "var(--accent)" : "var(--phase-learn)",
                  }}
                />
              </button>
            ))}
            {!isStreaming && (
              <span className="ml-2 text-caption" style={{ color: "var(--text-tertiary)" }}>
                {currentCard + 1} / {sections.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debrief markdown renderer (lavender styling)
// ---------------------------------------------------------------------------

/** Parse debrief into sections keyed by ## headers, with special card rendering for replay blocks. */
function parseDebriefSections(text: string): { title: string; content: React.ReactNode[] }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: React.ReactNode[] }[] = [];
  let currentSection: { title: string; content: React.ReactNode[] } = { title: "", content: [] };
  let key = 0;
  let inReplayBlock = false;

  function pushLine(line: string) {
    const lower = line.toLowerCase();

    // Detect replay / "what you said" sections
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
          <p className="text-xs font-semibold text-[#5A52E0] uppercase tracking-wider mb-1">Why this works</p>
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
      // Check if this is a dimension header (not inline bold)
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

/** Collapsible debrief section with score badge */
function DebriefSection({ title, children, scores, defaultOpen }: {
  title: string;
  children: React.ReactNode;
  scores?: SessionScores | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  // Try to match a score dimension from the title
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
        // After transition, set to auto for dynamic content
        const t = setTimeout(() => setHeight(undefined), 250);
        return () => clearTimeout(t);
      }
    } else {
      // First set to explicit height, then to 0 on next frame
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
// Confetti component
// ---------------------------------------------------------------------------

function Confetti() {
  const colors = ["#B8D4E3", "#F2C4C4", "#C5B8E8", "#B8E0C8"];
  const dots = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${10 + Math.random() * 80}%`,
    delay: `${Math.random() * 0.4}s`,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((dot) => (
        <div
          key={dot.id}
          className="confetti-dot"
          style={{
            backgroundColor: dot.color,
            left: dot.left,
            bottom: "40%",
            animationDelay: dot.delay,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Motivational line based on trajectory
// ---------------------------------------------------------------------------

function getMotivationalLine(scores: SessionScores, previousScores: SessionScores | null): string {
  if (!previousScores) return "First session in the books. The baseline is set.";

  const currentAvg = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
  const prevAvg = Object.values(previousScores).reduce((a, b) => a + b, 0) / 5;
  const diff = currentAvg - prevAvg;

  if (diff > 0.5) return "The work is compounding.";
  if (diff > 0) return "Marginal gains. Keep stacking.";
  if (diff === 0) return "Holding steady. The next breakthrough is close.";
  if (diff > -0.5) return "Tougher session \u2014 that\u2019s where growth happens.";
  return "Hard day. The best sessions often follow the worst.";
}

// ---------------------------------------------------------------------------
// Main session component
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const router = useRouter();
  const online = useOnlineStatus();

  // Session state
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>("lesson");
  const [completedPhases, setCompletedPhases] = useState<Set<SessionPhase>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [restored, setRestored] = useState(false);

  // Data
  const [dayNumber, setDayNumber] = useState(1);
  const [lastMission, setLastMission] = useState<string | null>(null);
  const [checkinOutcome, setCheckinOutcome] = useState<string | null>(null);
  const [checkinUserText, setCheckinUserText] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [character, setCharacter] = useState<CharacterArchetype | null>(null);
  const [lessonContent, setLessonContent] = useState<string | null>(null);
  const [scenarioContext, setScenarioContext] = useState<string | null>(null);
  const [roleplayTranscript, setRoleplayTranscript] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [coachAdvice, setCoachAdvice] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [commandsUsed, setCommandsUsed] = useState<string[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [debriefContent, setDebriefContent] = useState<string | null>(null);
  const [scores, setScores] = useState<SessionScores | null>(null);
  const [behavioralWeaknessSummary, setBehavioralWeaknessSummary] = useState("");
  const [keyMoment, setKeyMoment] = useState("");
  const [mission, setMission] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [isReviewSession, setIsReviewSession] = useState(false);
  const [previousScores, setPreviousScores] = useState<SessionScores | null>(null);

  // Check-in state (within deploy phase)
  const [checkinNeeded, setCheckinNeeded] = useState(false);
  const [checkinDone, setCheckinDone] = useState(false);
  const [checkinPillSelected, setCheckinPillSelected] = useState<"completed" | "tried" | null>(null);
  const [checkinResponse, setCheckinResponse] = useState<string | null>(null);

  // Retrieval bridge
  const [retrievalQuestion, setRetrievalQuestion] = useState<string | null>(null);
  const [retrievalResponse, setRetrievalResponse] = useState<string | null>(null);
  const [retrievalReady, setRetrievalReady] = useState(false);

  // Roleplay retry
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  // Phase animation
  const [phaseAnimation, setPhaseAnimation] = useState<"enter" | "active" | "exit">("active");

  // Completion
  const [showConfetti, setShowConfetti] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [resetNotice, setResetNotice] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // ---------------------------------------------------------------------------
  // Voice (STT + TTS)
  // ---------------------------------------------------------------------------

  const voice = useVoice({
    onTranscript: useCallback((text: string) => {
      // Route transcribed speech to the active phase
      if (text.trim()) {
        setInputValue(text);
        // Auto-submit for roleplay
        voiceAutoSubmitRef.current = text.trim();
      }
    }, []),
    characterId: character?.id,
  });

  const voiceAutoSubmitRef = useRef<string | null>(null);

  // Process auto-submit after voice transcript arrives
  useEffect(() => {
    if (voiceAutoSubmitRef.current && !isStreaming && !isLoading) {
      const text = voiceAutoSubmitRef.current;
      voiceAutoSubmitRef.current = null;
      if (currentPhase === "roleplay") {
        handleRoleplayInput(text);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, isStreaming, isLoading, currentPhase]);

  // Auto-speak AI roleplay responses when voice mode is on
  const lastSpokenIndex = useRef(-1);
  useEffect(() => {
    if (!voice.voiceEnabled || !voice.ttsSupported) return;
    if (currentPhase !== "roleplay") return;
    const lastMsg = roleplayTranscript[roleplayTranscript.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      roleplayTranscript.length - 1 > lastSpokenIndex.current
    ) {
      lastSpokenIndex.current = roleplayTranscript.length - 1;
      voice.speak(lastMsg.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleplayTranscript, currentPhase, voice.voiceEnabled]);

  // After TTS finishes speaking, auto-start listening again
  const prevVoiceState = useRef(voice.state);
  useEffect(() => {
    if (
      prevVoiceState.current === "speaking" &&
      voice.state === "idle" &&
      voice.voiceEnabled &&
      currentPhase === "roleplay" &&
      !isStreaming &&
      !isLoading
    ) {
      // Small delay so user hears the end of speech
      const t = setTimeout(() => voice.startListening(), 400);
      prevVoiceState.current = voice.state;
      return () => clearTimeout(t);
    }
    prevVoiceState.current = voice.state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state, voice.voiceEnabled, currentPhase, isStreaming, isLoading]);

  // ---------------------------------------------------------------------------
  // Auto-scroll
  // ---------------------------------------------------------------------------

  const isNearBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isNearBottom()) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowNewMessagePill(false);
    }
  }, [isNearBottom]);

  useEffect(() => {
    if (isNearBottom()) { scrollToBottom(); }
    else if (roleplayTranscript.length > 0) { setShowNewMessagePill(true); }
  }, [roleplayTranscript, streamingText, scrollToBottom, isNearBottom]);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const h = () => { if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) setShowNewMessagePill(false); };
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
  }, [currentPhase]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const h = () => { if (vv.height < window.innerHeight * 0.75) chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
    vv.addEventListener("resize", h);
    return () => vv.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", `/session?phase=${currentPhase}`);
  }, [currentPhase]);

  useEffect(() => {
    if (!isStreaming && currentPhase === "roleplay") inputRef.current?.focus();
  }, [isStreaming, currentPhase]);

  useEffect(() => {
    if (restored) { const t = setTimeout(() => setRestored(false), 3000); return () => clearTimeout(t); }
  }, [restored]);

  // ---------------------------------------------------------------------------
  // Session persistence
  // ---------------------------------------------------------------------------

  function saveSession() {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        phase: currentPhase, concept, character, lessonContent,
        transcript: roleplayTranscript, turnCount,
        completedPhases: Array.from(completedPhases), commandsUsed,
        checkinOutcome, checkinNeeded, checkinDone, checkinUserText,
        dayNumber, scenarioContext, debriefContent, scores,
        behavioralWeaknessSummary, keyMoment, mission, rationale,
        lastMission, coachAdvice, isReviewSession, previousScores,
        timestamp: Date.now(),
      }));
    } catch {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
  }

  useEffect(() => {
    if (!isLoading) saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase, roleplayTranscript.length, turnCount, debriefContent, scores, mission, checkinDone, coachAdvice]);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Date.now() - s.timestamp < SESSION_MAX_AGE_MS) {
          setCurrentPhase(s.phase); setConcept(s.concept); setCharacter(s.character);
          setLessonContent(s.lessonContent); setRoleplayTranscript(s.transcript || []);
          setTurnCount(s.turnCount || 0); setCompletedPhases(new Set(s.completedPhases || []));
          setCommandsUsed(s.commandsUsed || []); setCheckinOutcome(s.checkinOutcome);
          setCheckinNeeded(s.checkinNeeded ?? false); setCheckinDone(s.checkinDone ?? false);
          setCheckinUserText(s.checkinUserText ?? null);
          setDayNumber(s.dayNumber || 1); setScenarioContext(s.scenarioContext || null);
          if (s.debriefContent) setDebriefContent(s.debriefContent);
          if (s.scores) setScores(normaliseScores(s.scores));
          if (s.behavioralWeaknessSummary) setBehavioralWeaknessSummary(s.behavioralWeaknessSummary);
          if (s.keyMoment) setKeyMoment(s.keyMoment);
          if (s.mission) setMission(s.mission);
          if (s.rationale) setRationale(s.rationale);
          if (s.lastMission) setLastMission(s.lastMission);
          if (s.coachAdvice) setCoachAdvice(s.coachAdvice);
          if (s.isReviewSession) setIsReviewSession(s.isReviewSession);
          if (s.previousScores) setPreviousScores(normaliseScores(s.previousScores));
          setIsLoading(false); setRestored(true); return;
        } else { localStorage.removeItem(SESSION_STORAGE_KEY); }
      }
    } catch {}

    // Always start with lesson — fetch status to check if checkin needed later
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        setDayNumber(data.dayNumber);
        if (data.lastEntry) {
          setLastMission(data.lastEntry.mission);
          setCheckinNeeded(true);
          // Store previous scores for completion screen deltas
          if (data.lastEntry.scores) {
            setPreviousScores(normaliseScores(data.lastEntry.scores));
          }
        }
        fetchLesson();
      })
      .catch(() => { fetchLesson(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Phase transition
  // ---------------------------------------------------------------------------

  function advancePhase(from: SessionPhase, to: SessionPhase) {
    setPhaseAnimation("exit");
    setTimeout(() => {
      setCompletedPhases((prev) => new Set([...prev, from]));
      setCurrentPhase(to);
      setError(null);
      setPhaseAnimation("enter");
      haptic();
      setTimeout(() => setPhaseAnimation("active"), 80);
    }, 280);
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Lesson
  // ---------------------------------------------------------------------------

  const [lessonStreaming, setLessonStreaming] = useState(false);
  const [lessonCardPos, setLessonCardPos] = useState<{ current: number; total: number }>({ current: 0, total: 999 });
  const onLessonCardChange = useCallback((current: number, total: number) => {
    setLessonCardPos({ current, total });
  }, []);

  async function fetchLesson() {
    setIsLoading(true);
    setError(null);

    // Check for pre-generated lesson in localStorage
    try {
      const cached = localStorage.getItem("edge-pregenerated-lesson");
      if (cached) {
        const parsed = JSON.parse(cached);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.date === today && parsed.concept && parsed.lessonContent) {
          setConcept(parsed.concept);
          setLessonContent(parsed.lessonContent);
          setIsReviewSession(parsed.isReview ?? false);
          setIsLoading(false);
          localStorage.removeItem("edge-pregenerated-lesson");
          return;
        }
        localStorage.removeItem("edge-pregenerated-lesson");
      }
    } catch {}

    // Stream the lesson
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Extract concept from header
      const conceptHeader = res.headers.get("X-Concept");
      if (conceptHeader) {
        setConcept(JSON.parse(decodeURIComponent(conceptHeader)));
      }

      // Check if review session
      const isReview = res.headers.get("X-Is-Review") === "true";
      setIsReviewSession(isReview);

      // Stream the lesson content
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream body");

      const decoder = new TextDecoder();
      let fullText = "";
      setLessonStreaming(true);
      setIsLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setLessonContent(fullText);
      }

      setLessonContent(fullText);
      setLessonStreaming(false);
    } catch {
      setLessonStreaming(false);
      setError("Couldn\u2019t load your session \u2014 your connection might be patchy. Tap to retry.");
      setIsLoading(false);
    }
  }

  function pregenerateTomorrowsLesson() {
    try {
      fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: false }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.concept && data.lessonContent) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            localStorage.setItem(
              "edge-pregenerated-lesson",
              JSON.stringify({
                date: tomorrow.toISOString().slice(0, 10),
                concept: data.concept,
                lessonContent: data.lessonContent,
                isReview: data.isReview ?? false,
              })
            );
          }
        })
        .catch(() => {});
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Retrieval Bridge
  // ---------------------------------------------------------------------------

  async function startRetrieval() {
    if (!concept) return;
    advancePhase("lesson", "retrieval");
    setIsLoading(true);
    try {
      const res = await fetchWithRetry(
        "/api/retrieval-bridge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept }),
          signal: AbortSignal.timeout(30000) },
        5, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/5)`); }
      );
      const data = await res.json();
      setRetrievalQuestion(data.response);
      setError(null); setIsLoading(false);
    } catch {
      setError("No connection. Your progress is saved \u2014 continue when back online.");
      setIsLoading(false);
    }
  }

  async function submitRetrievalResponse(userResponse: string) {
    if (!concept || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch("/api/retrieval-bridge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, userResponse }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      setRetrievalResponse(data.response);
      setRetrievalReady(data.ready);
      setIsLoading(false); submittingRef.current = false;
      if (data.ready) setTimeout(() => startRoleplay(), 1500);
    } catch {
      setError("Failed to evaluate response. Try again.");
      setIsLoading(false); submittingRef.current = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Roleplay
  // ---------------------------------------------------------------------------

  async function startRoleplay() {
    if (!concept) return;
    const { selectCharacter } = await import("@/lib/characters");
    const char = selectCharacter(concept);
    setCharacter(char);
    advancePhase("retrieval", "roleplay");
    setIsLoading(true);
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character: char, transcript: [], userMessage: null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) setScenarioContext(decodeURIComponent(sc));
      await streamRoleplayResponse(res, []);
    } catch {
      setError("Failed to start roleplay. Try again.");
      setIsLoading(false);
    }
  }

  async function sendRoleplayMessage(userMessage: string) {
    if (!concept || !character || isStreaming || submittingRef.current) return;
    submittingRef.current = true;
    setPendingRetry(null);
    const updated: Message[] = [...roleplayTranscript, { role: "user", content: userMessage }];
    setRoleplayTranscript(updated);
    setTurnCount((p) => p + 1);
    setInputValue("");
    haptic();
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character, transcript: updated, userMessage: null, scenarioContext }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      await streamRoleplayResponse(res, updated);
    } catch {
      setRoleplayTranscript(roleplayTranscript);
      setTurnCount((p) => p - 1);
      setPendingRetry(userMessage);
      submittingRef.current = false;
    }
  }

  async function streamRoleplayResponse(res: Response, currentTranscript: Message[]) {
    setIsStreaming(true); setStreamingText(""); setIsLoading(false);
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      setStreamingText(fullText);
    }
    setRoleplayTranscript([...currentTranscript, { role: "assistant", content: fullText }]);
    setStreamingText(""); setIsStreaming(false);
    setTurnCount((p) => p + 1);
    submittingRef.current = false;
  }

  async function handleCoach() {
    if (!concept || roleplayTranscript.length === 0) return;
    setCoachAdvice(null); setCoachLoading(true);
    setCommandsUsed((p) => p.includes("/coach") ? p : [...p, "/coach"]);
    haptic();
    try {
      const res = await fetch("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: roleplayTranscript, concept }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      setCoachAdvice(data.advice);
    } catch { setCoachAdvice("Coach unavailable right now. Trust your instincts."); }
    finally { setCoachLoading(false); }
  }

  function handleReset() {
    setCommandsUsed((p) => [...p, "/reset"]);
    setRoleplayTranscript([]); setTurnCount(0);
    setStreamingText(""); setCoachAdvice(null); setCoachLoading(false);
    setResetNotice(true); haptic();
    setTimeout(() => setResetNotice(false), 3000);
    startRoleplayFresh();
  }

  async function startRoleplayFresh() {
    if (!concept || !character) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character, transcript: [], userMessage: null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) setScenarioContext(decodeURIComponent(sc));
      await streamRoleplayResponse(res, []);
    } catch { setError("Failed to reset."); setIsLoading(false); }
  }

  function handleSkip() {
    setCommandsUsed((p) => [...p, "/skip"]); haptic();
    advancePhase("roleplay", "debrief"); fetchDebrief();
  }

  function handleDone() {
    haptic(); advancePhase("roleplay", "debrief"); fetchDebrief();
  }

  function handleRoleplayInput(value: string) {
    const t = value.trim().toLowerCase();
    if (t === "/coach") { handleCoach(); setInputValue(""); }
    else if (t === "/reset") { handleReset(); setInputValue(""); }
    else if (t === "/skip") { handleSkip(); setInputValue(""); }
    else if (t === "/done") { handleDone(); setInputValue(""); }
    else { sendRoleplayMessage(value.trim()); }
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Debrief (#1 — increased timeout, fallback, #2 — streaming, #5 — checkin context)
  // ---------------------------------------------------------------------------

  const [debriefRetryCount, setDebriefRetryCount] = useState(0);
  const [canSkipDebrief, setCanSkipDebrief] = useState(false);

  async function fetchDebrief() {
    if (!concept || !character) return;
    setIsLoading(true); setError(null);
    try {
      const res = await fetchWithRetry(
        "/api/debrief",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: roleplayTranscript,
            concept,
            character,
            commandsUsed,
            checkinContext: checkinUserText || undefined,
          }),
          signal: AbortSignal.timeout(65000) }, // #1: increased from 30s to 65s
        3, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/3)`); }
      );
      const data = await res.json();
      let display = data.debriefContent;
      const idx = display.indexOf("---SCORES---");
      if (idx !== -1) display = display.slice(0, idx).trim();
      setDebriefContent(display);
      setScores(normaliseScores(data.scores));
      setBehavioralWeaknessSummary(data.behavioralWeaknessSummary);
      setKeyMoment(data.keyMoment);
      setError(null); setIsLoading(false);
      setDebriefRetryCount(0);
    } catch {
      const newCount = debriefRetryCount + 1;
      setDebriefRetryCount(newCount);
      if (newCount >= 2) {
        setCanSkipDebrief(true);
        setError("Couldn\u2019t generate your debrief. Tap to retry or skip to mission.");
      } else {
        setError("Couldn\u2019t generate your debrief \u2014 tap to retry.");
      }
      setIsLoading(false);
    }
  }

  function skipDebriefToMission() {
    setScores({ technique_application: 3, tactical_awareness: 3, frame_control: 3, emotional_regulation: 3, strategic_outcome: 3 });
    setDebriefContent("Debrief unavailable due to connection issues. Default scores applied.");
    setBehavioralWeaknessSummary("Unable to generate analysis.");
    setKeyMoment("Unable to identify key moment.");
    setCanSkipDebrief(false);
    setError(null);
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Deploy (check-in + mission) — #5 enhanced
  // ---------------------------------------------------------------------------

  function enterDeploy() {
    advancePhase("debrief", "mission");
    if (checkinNeeded && !checkinDone) {
      setIsLoading(false);
    } else {
      fetchMission();
    }
  }

  async function submitCheckin(outcomeType: "completed" | "tried" | "skipped", userOutcome?: string) {
    if (!lastMission || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    // Store user text for debrief context
    if (userOutcome) setCheckinUserText(userOutcome);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousMission: lastMission, outcomeType, userOutcome }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("Check-in API failed");
      const data = await res.json();
      setCheckinResponse(data.response);
      setCheckinOutcome(data.type);
      setCheckinDone(true);
      setIsLoading(false);
      submittingRef.current = false;
      // #5: increased display time from 2s to 3.5s
      setTimeout(() => { setCheckinResponse(null); fetchMission(); }, 3500);
    } catch {
      setError("Failed to submit. Try again.");
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  const [missionRetryCount, setMissionRetryCount] = useState(0);

  async function fetchMission() {
    if (!concept || !character || !scores || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true); setError(null);
    try {
      const res = await fetchWithRetry(
        "/api/mission",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, checkinOutcome }),
          signal: AbortSignal.timeout(30000) },
        3, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/3)`); }
      );
      const data = await res.json();
      setMission(data.mission); setRationale(data.rationale);
      setError(null); setIsLoading(false);
      submittingRef.current = false;
      setMissionRetryCount(0);
    } catch {
      const newCount = missionRetryCount + 1;
      setMissionRetryCount(newCount);
      if (newCount >= 2) {
        const fallbacks: Record<string, { mission: string; rationale: string }[]> = {
          "Influence & Persuasion": [
            { mission: "In your next conversation, give something of value before making any request. Note how the dynamic shifts.", rationale: "Reciprocity primes compliance before you ask." },
            { mission: "Get one person to agree with a small, specific statement today. Watch how it shapes their subsequent behaviour.", rationale: "Micro-commitments cascade into larger concessions." },
          ],
          "Power Dynamics": [
            { mission: "In your next meeting, speak last. Observe how others position themselves when the floor is open.", rationale: "Silence is a power move that forces others to reveal their hand." },
            { mission: "Identify who holds the real decision-making power in your next group interaction. Note how authority flows.", rationale: "Reading power structures is the first step to navigating them." },
          ],
          "Negotiation": [
            { mission: "Name the other person\u2019s likely concern before they raise it. Watch how it changes the tone.", rationale: "Tactical empathy disarms resistance before it forms." },
            { mission: "In your next negotiation, anchor first with a specific number or position. Observe how it shapes the range.", rationale: "The first number spoken becomes the gravitational centre." },
          ],
          "Behavioural Psychology & Cognitive Bias": [
            { mission: "Notice one decision today where you or someone else chose the default option. Ask why.", rationale: "Awareness of status quo bias is the first step to overriding it." },
            { mission: "Frame one request today as an avoidance of loss rather than a pursuit of gain. Note the difference.", rationale: "Loss aversion drives decisions twice as powerfully as equivalent gains." },
          ],
          "Nonverbal Intelligence & Behavioural Profiling": [
            { mission: "In your next conversation, match the other person\u2019s speaking pace for two minutes. Notice the rapport shift.", rationale: "Pace-matching signals unconscious alignment." },
            { mission: "Observe one person\u2019s baseline behaviour today, then note when they deviate. What triggered the shift?", rationale: "Deviations from baseline reveal stress, deception, or genuine interest." },
          ],
          "Rapport & Relationship Engineering": [
            { mission: "Ask one person an open question about their work today and listen without interrupting for 60 seconds.", rationale: "Sustained attention is the rarest gift in a distracted world." },
            { mission: "Mirror back one person\u2019s exact words today instead of paraphrasing. Note their reaction.", rationale: "Exact mirroring creates a deeper sense of being understood." },
          ],
          "Dark Psychology & Coercive Technique Recognition": [
            { mission: "Identify one moment today where someone used urgency to pressure a decision. Pause before responding.", rationale: "Recognising manufactured urgency is the first line of defence." },
            { mission: "Notice one attempt to shift blame or responsibility in a conversation today. Name it internally.", rationale: "Pattern recognition neutralises manipulation before it takes hold." },
          ],
        };
        const domain = concept?.domain || "";
        const pool = fallbacks[domain] || [
          { mission: "Apply today\u2019s technique deliberately in your next conversation. Observe the other person\u2019s response.", rationale: "Deliberate practice with observation accelerates mastery." },
        ];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        setMission(pick.mission);
        setRationale(pick.rationale);
        setError(null);
      } else {
        setError("Couldn\u2019t load your mission \u2014 tap to retry.");
      }
      setIsLoading(false); submittingRef.current = false;
    }
  }

  const sessionCompletedRef = useRef(false);
  function completeSession() {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;
    setCompletedPhases((p) => new Set([...p, "mission"]));
    setShowConfetti(true);
    clearSession(); haptic();
    pregenerateTomorrowsLesson();
  }

  function retry() {
    setError(null);
    if (currentPhase === "lesson") fetchLesson();
    else if (currentPhase === "retrieval") startRetrieval();
    else if (currentPhase === "roleplay") startRoleplayFresh();
    else if (currentPhase === "debrief") fetchDebrief();
    else if (currentPhase === "mission" && concept && character && scores) fetchMission();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const SCORE_DIMS: { key: keyof SessionScores; label: string; fullName: string }[] = [
    { key: "technique_application", label: "TA", fullName: "Technique" },
    { key: "tactical_awareness", label: "TW", fullName: "Tactical" },
    { key: "frame_control", label: "FC", fullName: "Frame" },
    { key: "emotional_regulation", label: "ER", fullName: "Regulation" },
    { key: "strategic_outcome", label: "SO", fullName: "Outcome" },
  ];

  const isRoleplay = currentPhase === "roleplay";
  const phaseBg = PHASE_BG[currentPhase] || "#FAF9F6";
  const phaseClass = phaseAnimation === "enter" ? "phase-enter" : phaseAnimation === "active" ? "phase-active" : "phase-exit";

  return (
    <div
      className="session-page flex flex-col h-dvh overflow-hidden phase-bg-transition"
      style={{ backgroundColor: phaseBg }}
    >
      {/* Phase indicator with exit button */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setShowExitModal(true)}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-50 touch-target rounded-full"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Leave session"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <PhaseIndicator current={currentPhase} completed={completedPhases} />
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--coach-bg)", color: "var(--coach-muted)" }}>
          Offline &mdash; reconnecting...
        </div>
      )}

      {restored && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          Session restored
        </div>
      )}

      {/* Review session badge */}
      {isReviewSession && currentPhase === "lesson" && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          Review session
        </div>
      )}

      {/* Scrollable content */}
      <div ref={isRoleplay ? chatContainerRef : undefined} className="chat-container flex-1 overflow-y-auto px-4 sm:px-6">
        <div className={`mx-auto max-w-lg py-5 sm:py-8 ${phaseClass}`}>

          {error && (
            <div className="mb-5 card text-center">
              <p className="text-body" style={{ color: "var(--score-low)" }}>{error}</p>
              <div className="mt-4 flex items-center justify-center gap-5">
                <button onClick={retry} className="touch-target text-caption font-semibold underline" style={{ color: "var(--accent)" }}>
                  Retry
                </button>
                {canSkipDebrief && currentPhase === "debrief" && (
                  <button onClick={skipDebriefToMission} className="touch-target text-caption font-medium underline" style={{ color: "var(--text-secondary)" }}>
                    Skip to mission
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* LEARN                                                           */}
          {/* ============================================================== */}
          {currentPhase === "lesson" && (
            <>
              {isLoading && (
                <div className="text-center py-8">
                  <p className="text-body" style={{ color: "var(--text-secondary)" }}>Preparing today&apos;s lesson...</p>
                  <LoadingDots />
                </div>
              )}

              {lessonContent && !isLoading && (
                <>
                  {concept && (
                    <div className="mb-5">
                      <div className="flex items-center gap-2.5">
                        <span className="badge" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
                          {concept.domain}
                        </span>
                        {isReviewSession && (
                          <span className="badge" style={{ backgroundColor: "var(--score-mid-bg)", color: "var(--score-mid-text)" }}>
                            Review
                          </span>
                        )}
                      </div>
                      <h2 className="mt-3 text-heading font-semibold" style={{ color: "var(--text-primary)" }}>
                        {concept.name}
                        <span className="ml-2 text-caption font-normal italic" style={{ color: "var(--text-secondary)" }}>({concept.source})</span>
                      </h2>
                    </div>
                  )}

                  <LessonCards
                    sections={splitLessonSections(lessonContent)}
                    isStreaming={lessonStreaming}
                    onCardChange={onLessonCardChange}
                  />
                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* RETRIEVAL                                                       */}
          {/* ============================================================== */}
          {currentPhase === "retrieval" && (
            <>
              {isLoading && !retrievalQuestion && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-secondary">One moment...</p>
                  <LoadingDots />
                </div>
              )}

              {retrievalQuestion && (
                <div className="space-y-5 animate-challenge">
                  <div className="text-center mb-1">
                    <span className="badge" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
                      Quick check
                    </span>
                  </div>
                  <div className="card" style={{ padding: "24px" }}>
                    <p className="text-center text-lead font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      {retrievalQuestion}
                    </p>
                  </div>

                  {retrievalResponse && (
                    <div className="animate-fade-in-up card-tinted text-center" style={{ backgroundColor: "var(--accent-soft)", padding: "24px" }}>
                      <p className="mb-1 text-body font-semibold" style={{ color: "var(--accent)" }}>Solid recall</p>
                      <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{retrievalResponse}</p>
                    </div>
                  )}

                  {!retrievalResponse && (
                    <div className="space-y-3">
                      {/* Voice listening state for retrieval */}
                      {voice.voiceEnabled && voice.state === "listening" && (
                        <div className="flex flex-col items-center gap-3 py-4">
                          <div className="flex items-center gap-1.5 h-6 text-[#5A52E0]">
                            <span className="voice-bar" />
                            <span className="voice-bar" />
                            <span className="voice-bar" />
                          </div>
                          <p className="text-sm text-secondary">{voice.interimTranscript || "Listening..."}</p>
                          <button
                            onClick={voice.stopListening}
                            className="voice-listening flex h-12 w-12 items-center justify-center rounded-full text-white"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                              <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                              <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                            </svg>
                          </button>
                        </div>
                      )}

                      {(!voice.voiceEnabled || voice.state !== "listening") && (
                        <>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder={voice.voiceEnabled ? "Tap mic or type..." : "Your answer..."}
                              className="input-field flex-1"
                              style={{ backgroundColor: "var(--phase-learn-tint)" }}
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) { submitRetrievalResponse(inputValue.trim()); setInputValue(""); } }}
                              disabled={isLoading}
                              autoFocus
                            />
                            {voice.voiceEnabled && voice.sttSupported && !inputValue.trim() && !isLoading && (
                              <button
                                onClick={voice.startListening}
                                className="touch-target flex-shrink-0 rounded-full"
                                style={{ backgroundColor: "var(--accent)", color: "white" }}
                                title="Speak"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                                  <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                                  <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => { if (inputValue.trim()) { submitRetrievalResponse(inputValue.trim()); setInputValue(""); } }}
                            disabled={isLoading || !inputValue.trim()}
                            className={inputValue.trim() ? "btn-primary" : "btn-primary"}
                            style={{
                              backgroundColor: inputValue.trim() ? "var(--accent)" : "var(--border)",
                              color: inputValue.trim() ? "white" : "var(--text-tertiary)",
                              boxShadow: inputValue.trim() ? "var(--shadow-accent)" : "none",
                            }}
                          >
                            {isLoading ? "Evaluating..." : "Submit"}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {retrievalResponse && !retrievalReady && (
                    <button onClick={() => startRoleplay()} className="btn-primary">
                      Continue to practice &rarr;
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* SIMULATE                                                        */}
          {/* ============================================================== */}
          {currentPhase === "roleplay" && (
            <>
              {/* Character persona card — shown until first AI message arrives */}
              {character && roleplayTranscript.length === 0 && (
                <div className="mb-5 animate-challenge">
                  <div className="card" style={{ padding: "28px 24px" }}>
                    <div className="text-center mb-5">
                      <div
                        className="inline-flex h-16 w-16 items-center justify-center rounded-full text-3xl mb-3"
                        style={{ backgroundColor: "var(--phase-simulate-tint)" }}
                      >
                        {characterEmoji(character.id)}
                      </div>
                      <p className="text-lead font-bold" style={{ color: "var(--text-primary)" }}>{character.name}</p>
                      <p className="mt-1 text-body leading-snug" style={{ color: "var(--text-secondary)" }}>{character.description}</p>
                    </div>

                    {/* Key traits */}
                    <div className="flex gap-2 justify-center flex-wrap mb-5">
                      {character.tactics.slice(0, 2).map((t, i) => (
                        <span key={i} className="badge" style={{ backgroundColor: "var(--score-low-bg)", color: "var(--score-low-text)", fontSize: 12, padding: "4px 12px" }}>
                          {t.length > 30 ? t.slice(0, 30) + "\u2026" : t}
                        </span>
                      ))}
                    </div>

                    {scenarioContext && (
                      <div style={{ backgroundColor: "var(--phase-simulate-tint)", borderRadius: "var(--radius-md)", padding: "14px 16px" }}>
                        <p className="text-caption font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--phase-simulate-muted)" }}>Scene</p>
                        <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{scenarioContext}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{characterEmoji(character?.id)}</span>
                    <span className="text-caption font-medium" style={{ color: "var(--text-secondary)" }}>{character?.name ?? "Character"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div
                        key={i}
                        className="rounded-full transition-all"
                        style={{
                          width: 6, height: 6,
                          backgroundColor: i < Math.max(1, Math.ceil(turnCount / 2)) ? "var(--phase-simulate)" : "var(--border-subtle)",
                          transform: i < Math.max(1, Math.ceil(turnCount / 2)) ? "scale(1)" : "scale(0.8)",
                          transition: "all 300ms ease",
                        }}
                      />
                    ))}
                  </div>
                </div>
                {character?.description && roleplayTranscript.length > 0 && (
                  <PersonaLine description={character.description} />
                )}
              </div>

              {resetNotice && (
                <p className="mb-2 text-center text-xs text-secondary animate-pulse">Same concept. Fresh start.</p>
              )}

              <div className="space-y-3.5 pb-4">
                {roleplayTranscript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end pl-10" : "justify-start pr-10 gap-2.5"} animate-fade-in-up`}>
                    {msg.role === "assistant" && (
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body mt-1"
                        style={{ backgroundColor: "var(--phase-simulate-tint)" }}
                      >
                        {characterEmoji(character?.id)}
                      </div>
                    )}
                    <div
                      className="text-body leading-relaxed"
                      style={{
                        padding: "14px 18px",
                        borderRadius: msg.role === "user" ? "var(--radius-xl) var(--radius-xl) 8px var(--radius-xl)" : "var(--radius-xl) var(--radius-xl) var(--radius-xl) 8px",
                        backgroundColor: msg.role === "user" ? "var(--accent)" : "var(--surface)",
                        color: msg.role === "user" ? "var(--text-inverted)" : "var(--text-primary)",
                        boxShadow: msg.role === "user" ? "0 2px 10px rgba(90,82,224,0.18)" : "var(--shadow-soft)",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isStreaming && streamingText && (
                  <div className="flex justify-start pr-10 gap-2.5">
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body mt-1"
                      style={{ backgroundColor: "var(--phase-simulate-tint)" }}
                    >
                      {characterEmoji(character?.id)}
                    </div>
                    <div
                      className="max-w-[80%] text-body leading-relaxed"
                      style={{
                        padding: "14px 18px",
                        borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) 8px",
                        backgroundColor: "var(--surface)",
                        boxShadow: "var(--shadow-soft)",
                      }}
                    >
                      {streamingText}
                      <span className="inline-block animate-pulse" style={{ color: "var(--accent)" }}>|</span>
                    </div>
                  </div>
                )}

                {isLoading && !isStreaming && (
                  <div className="flex justify-start gap-2.5">
                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body mt-1"
                      style={{ backgroundColor: "var(--phase-simulate-tint)" }}
                    >
                      {characterEmoji(character?.id)}
                    </div>
                    <div style={{ padding: "16px 18px", borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) 8px", backgroundColor: "var(--surface)", boxShadow: "var(--shadow-soft)" }}>
                      <div className="flex items-center gap-2">
                        <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(212,144,143,0.5)" }} />
                        <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(212,144,143,0.5)" }} />
                        <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(212,144,143,0.5)" }} />
                      </div>
                    </div>
                  </div>
                )}

                {pendingRetry && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => sendRoleplayMessage(pendingRetry)}
                      className="touch-target rounded-full px-5 py-2.5 text-caption font-semibold"
                      style={{ backgroundColor: "var(--coach-bg)", color: "var(--coach-muted)" }}
                    >
                      Connection lost. Tap to retry &rarr;
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {Math.ceil(turnCount / 2) >= 8 && (
                <div className="mb-2 text-center text-caption" style={{ backgroundColor: "rgba(255,255,255,0.7)", borderRadius: "var(--radius-md)", padding: "10px 16px", color: "var(--text-secondary)" }}>
                  You can continue or tap &#10003; when ready
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* DEBRIEF                                                         */}
          {/* ============================================================== */}
          {currentPhase === "debrief" && (
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

                  {/* Analysis card — collapsible sections */}
                  <div className="select-text mb-5 card-tinted" style={{ backgroundColor: "var(--phase-debrief-tint)" }}>
                    {(() => {
                      const sections = parseDebriefSections(debriefContent);
                      if (sections.length <= 1) {
                        // Fallback: no sections detected, render flat
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
          )}

          {/* ============================================================== */}
          {/* DEPLOY (check-in + mission) — #5 enhanced styling              */}
          {/* ============================================================== */}
          {currentPhase === "mission" && (
            <>
              {/* Check-in card (Day 2+, before mission loads) */}
              {checkinNeeded && !checkinDone && !isLoading && !mission && (
                <div className="animate-fade-in-up space-y-5">
                  <div className="card" style={{ padding: "28px 24px" }}>
                    <p className="mb-1 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--phase-deploy-muted)" }}>Mission debrief</p>
                    <p className="mb-1 text-caption" style={{ color: "var(--text-secondary)" }}>Yesterday you were asked to:</p>
                    <p className="mb-5 text-body font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
                      &ldquo;{lastMission}&rdquo;
                    </p>
                    <p className="mb-4 text-body font-medium" style={{ color: "var(--text-primary)" }}>How did it go?</p>

                    {/* Outcome pills */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setCheckinPillSelected("completed"); haptic(20); }}
                        className={`flex-1 text-body font-semibold transition-all ${
                          checkinPillSelected === "completed" ? "animate-celebrate scale-[1.02]" : ""
                        }`}
                        style={{
                          backgroundColor: "var(--phase-deploy)",
                          color: "var(--score-high-text)",
                          borderRadius: "var(--radius-md)",
                          padding: "14px 16px",
                          boxShadow: checkinPillSelected === "completed" ? "0 0 0 2px var(--score-high-text), 0 4px 12px rgba(107,201,160,0.3)" : "none",
                        }}
                      >
                        &#9889; Nailed it
                      </button>
                      <button
                        onClick={() => setCheckinPillSelected("tried")}
                        className={`flex-1 text-body font-semibold transition-all ${
                          checkinPillSelected === "tried" ? "scale-[1.02]" : ""
                        }`}
                        style={{
                          backgroundColor: "var(--score-mid-bg)",
                          color: "var(--score-mid-text)",
                          borderRadius: "var(--radius-md)",
                          padding: "14px 16px",
                          boxShadow: checkinPillSelected === "tried" ? "0 0 0 2px var(--score-mid-text), 0 4px 12px rgba(245,197,99,0.3)" : "none",
                        }}
                      >
                        &#128075; Tried it
                      </button>
                      <button
                        onClick={() => submitCheckin("skipped")}
                        className="flex-1 text-body font-medium transition-transform"
                        style={{
                          backgroundColor: "var(--border)",
                          color: "var(--text-secondary)",
                          borderRadius: "var(--radius-md)",
                          padding: "14px 16px",
                        }}
                      >
                        Skip
                      </button>
                    </div>

                    {/* Expandable input */}
                    {checkinPillSelected && (
                      <div className="mt-4 animate-fade-in-up space-y-3">
                        <p className="text-center text-sm font-medium" style={{
                          color: checkinPillSelected === "completed" ? "#2D6A4F" : "#8B7024"
                        }}>
                          {checkinPillSelected === "completed" ? "Nice work! Quick follow-up:" : "Good effort. Tell me more:"}
                        </p>
                        {/* Voice listening state for check-in */}
                        {voice.voiceEnabled && voice.state === "listening" && (
                          <div className="flex flex-col items-center gap-3 py-4">
                            <div className="flex items-center gap-1.5 h-6 text-[#5A52E0]">
                              <span className="voice-bar" />
                              <span className="voice-bar" />
                              <span className="voice-bar" />
                            </div>
                            <p className="text-sm text-secondary">{voice.interimTranscript || "Listening..."}</p>
                            <button
                              onClick={voice.stopListening}
                              className="voice-listening flex h-12 w-12 items-center justify-center rounded-full text-white"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                                <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                                <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {(!voice.voiceEnabled || voice.state !== "listening") && (
                          <>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder={checkinPillSelected === "completed" ? "What was the exact reaction?" : "What happened when you tried?"}
                                className="flex-1 rounded-2xl border-none px-4 py-3 text-base text-primary placeholder-tertiary outline-none focus:ring-2 focus:ring-[#5A52E0]/20"
                                style={{ backgroundColor: PHASE_TINT.mission }}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) submitCheckin(checkinPillSelected, inputValue.trim()); }}
                                autoFocus
                              />
                              {voice.voiceEnabled && voice.sttSupported && !inputValue.trim() && (
                                <button
                                  onClick={voice.startListening}
                                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#5A52E0] text-white transition-transform active:scale-[0.97]"
                                  title="Speak"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                                    <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                                    <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => { if (inputValue.trim()) submitCheckin(checkinPillSelected, inputValue.trim()); }}
                              disabled={!inputValue.trim()}
                              className="w-full rounded-2xl bg-[#5A52E0] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                            >
                              Submit
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Check-in response */}
              {checkinResponse && (
                <div className="animate-fade-in-up card text-center">
                  <p className="text-body leading-relaxed italic" style={{ color: "var(--text-secondary)" }}>{checkinResponse}</p>
                </div>
              )}

              {/* Loading mission */}
              {isLoading && !checkinResponse && (
                <div className="text-center py-8">
                  <p className="text-body" style={{ color: "var(--text-secondary)" }}>Assigning your mission...</p>
                  <LoadingDots />
                </div>
              )}

              {/* Mission card */}
              {mission && !isLoading && !checkinResponse && (
                <div className="animate-challenge relative">
                  <div className="text-center mb-5">
                    <span className="badge" style={{ backgroundColor: "var(--score-high-bg)", color: "var(--score-high-text)" }}>
                      Field assignment
                    </span>
                  </div>

                  <div className="mb-5 card-tinted" style={{ backgroundColor: "var(--phase-deploy-tint)", padding: "24px" }}>
                    {(() => {
                      const sentenceEnd = mission.search(/[.!?]\s|[.!?]$/);
                      if (sentenceEnd > 0 && sentenceEnd < mission.length - 1) {
                        const headline = mission.slice(0, sentenceEnd + 1);
                        const detail = mission.slice(sentenceEnd + 1).trim();
                        return (
                          <>
                            <p className="text-lead font-bold leading-snug" style={{ color: "var(--text-primary)" }}>{headline}</p>
                            {detail && <p className="mt-2 text-body leading-relaxed" style={{ color: "var(--text-primary)", opacity: 0.8 }}>{detail}</p>}
                          </>
                        );
                      }
                      return <p className="text-lead font-bold leading-relaxed" style={{ color: "var(--text-primary)" }}>{mission}</p>;
                    })()}
                    {rationale && (
                      <>
                        <div className="my-4" style={{ borderTop: "1px solid rgba(184,224,200,0.3)" }} />
                        <p className="text-caption italic" style={{ color: "var(--text-secondary)" }}>{rationale}</p>
                      </>
                    )}
                  </div>

                  {!showConfetti ? (
                    <button onClick={completeSession} className="btn-primary" style={{ backgroundColor: "var(--score-high)", boxShadow: "0 4px 16px rgba(107,201,160,0.3)" }}>
                      Session complete &#10003;
                    </button>
                  ) : (
                    <div className="animate-fade-in-up space-y-5">
                      {/* Enhanced completion card */}
                      <div className="card-tinted animate-celebrate" style={{ backgroundColor: "var(--score-high-bg)", padding: "28px 24px" }}>
                        <p className="mb-1 text-center text-heading font-semibold" style={{ color: "var(--text-primary)" }}>
                          Session complete
                        </p>
                        <p className="mb-3 text-center text-body" style={{ color: "var(--text-secondary)" }}>
                          Day {dayNumber} &middot; {concept?.name}
                        </p>

                        {/* Motivational line */}
                        {scores && (
                          <p className="mb-5 text-center text-caption font-medium" style={{ color: "var(--phase-deploy-muted)" }}>
                            {getMotivationalLine(scores, previousScores)}
                          </p>
                        )}

                        {/* Key moment */}
                        {keyMoment && (
                          <div className="mb-5" style={{ backgroundColor: "rgba(255,255,255,0.6)", borderRadius: "var(--radius-md)", padding: "14px 16px" }}>
                            <p className="text-caption font-semibold" style={{ color: "var(--text-secondary)" }}>Key takeaway</p>
                            <p className="mt-1 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{keyMoment}</p>
                          </div>
                        )}

                        {/* Scores with deltas */}
                        {scores && (
                          <div className="mb-5">
                            <div className="flex items-center justify-center gap-3">
                              {SCORE_DIMS.map(({ key, fullName }) => {
                                const s = scores[key];
                                const prev = previousScores ? previousScores[key] : null;
                                const diff = prev !== null ? s - prev : null;
                                return (
                                  <div key={key} className="flex flex-col items-center gap-1.5">
                                    <div
                                      className="flex items-center justify-center rounded-full text-body font-bold relative"
                                      style={{ width: 44, height: 44, backgroundColor: scoreCircleColor(s), color: scoreTextColor(s) }}
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
                                    <span className="text-caption" style={{ color: "var(--text-secondary)", fontSize: 11 }}>{fullName}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Mission recap */}
                        {mission && (
                          <div className="mb-4" style={{ borderRadius: "var(--radius-md)", border: "2px dashed var(--phase-deploy)", backgroundColor: "rgba(255,255,255,0.6)", padding: "14px 16px" }}>
                            <p className="text-caption font-semibold" style={{ color: "var(--phase-deploy-muted)" }}>Your mission today</p>
                            <p className="mt-1 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{mission}</p>
                          </div>
                        )}

                        {/* Share preview card */}
                        <div className="mb-3" style={{ borderRadius: "var(--radius-md)", backgroundColor: "white", padding: "16px", boxShadow: "var(--shadow-sm)" }}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-body font-bold" style={{ color: "var(--text-primary)" }}>
                                <span style={{ color: "var(--accent)" }}>the</span> edge
                              </p>
                              <p className="text-caption" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Day {dayNumber}</p>
                            </div>
                            {scores && (
                              <div className="flex items-center gap-1">
                                <span className="text-lead font-bold" style={{ color: "var(--accent)" }}>
                                  {(Object.values(scores).reduce((a, b) => a + b, 0) / 5).toFixed(1)}
                                </span>
                                <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>/5</span>
                              </div>
                            )}
                          </div>
                          <p className="text-caption font-medium mb-2" style={{ color: "var(--text-primary)" }}>{concept?.name}</p>
                          {scores && (
                            <div className="flex gap-1.5 mb-2">
                              {SCORE_DIMS.map(({ key }) => {
                                const s = scores[key];
                                return (
                                  <div key={key} className="h-2 flex-1 rounded-full" style={{
                                    backgroundColor: s >= 4 ? "var(--score-high)" : s >= 3 ? "var(--score-mid)" : "var(--score-low)",
                                  }} />
                                );
                              })}
                            </div>
                          )}
                          {keyMoment && (
                            <p className="text-caption italic truncate" style={{ color: "var(--text-secondary)" }}>{keyMoment}</p>
                          )}
                        </div>

                        {/* Share button */}
                        <button
                          onClick={async () => {
                            const text = `The Edge - Day ${dayNumber}\nConcept: ${concept?.name}\nScores: ${scores ? Object.values(scores).join(", ") : "-"}\nMission: ${mission || "-"}`;

                            try {
                              const canvas = document.createElement("canvas");
                              canvas.width = 600;
                              canvas.height = 400;
                              const ctx = canvas.getContext("2d");
                              if (ctx) {
                                ctx.fillStyle = "#FAF9F6";
                                ctx.beginPath();
                                ctx.roundRect(0, 0, 600, 400, 24);
                                ctx.fill();
                                ctx.fillStyle = "#5A52E0";
                                ctx.fillRect(0, 0, 600, 6);
                                ctx.fillStyle = "#2D2B3D";
                                ctx.font = "bold 28px sans-serif";
                                ctx.fillText("the edge", 32, 48);
                                ctx.fillStyle = "#8E8C99";
                                ctx.font = "16px sans-serif";
                                ctx.fillText(`Day ${dayNumber}`, 32, 76);
                                ctx.fillStyle = "#2D2B3D";
                                ctx.font = "bold 20px sans-serif";
                                ctx.fillText(concept?.name || "", 32, 120);

                                if (scores) {
                                  const dims = ["TA", "TW", "FC", "ER", "SO"];
                                  const keys: (keyof SessionScores)[] = ["technique_application", "tactical_awareness", "frame_control", "emotional_regulation", "strategic_outcome"];
                                  keys.forEach((k, i) => {
                                    const s = scores[k];
                                    const cx = 64 + i * 72;
                                    const cy = 175;
                                    ctx.beginPath();
                                    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
                                    ctx.fillStyle = scoreCircleColor(s);
                                    ctx.fill();
                                    ctx.fillStyle = scoreTextColor(s);
                                    ctx.font = "bold 18px sans-serif";
                                    ctx.textAlign = "center";
                                    ctx.fillText(String(s), cx, cy + 6);
                                    ctx.fillStyle = "#8E8C99";
                                    ctx.font = "11px sans-serif";
                                    ctx.fillText(dims[i], cx, cy + 40);
                                  });
                                  ctx.textAlign = "start";
                                }

                                if (keyMoment) {
                                  ctx.fillStyle = "#8E8C99";
                                  ctx.font = "13px sans-serif";
                                  ctx.fillText("Key takeaway", 32, 250);
                                  ctx.fillStyle = "#2D2B3D";
                                  ctx.font = "14px sans-serif";
                                  const words = keyMoment.split(" ");
                                  let line = "";
                                  let y = 270;
                                  for (const word of words) {
                                    const test = line + (line ? " " : "") + word;
                                    if (ctx.measureText(test).width > 536) {
                                      ctx.fillText(line, 32, y);
                                      line = word;
                                      y += 20;
                                      if (y > 340) { ctx.fillText(line + "...", 32, y); line = ""; break; }
                                    } else { line = test; }
                                  }
                                  if (line) ctx.fillText(line, 32, y);
                                }

                                ctx.fillStyle = "#B5B3BD";
                                ctx.font = "12px sans-serif";
                                ctx.fillText("the-edge-xi.vercel.app", 32, 384);

                                const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
                                if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], "edge-session.png", { type: "image/png" })] })) {
                                  await navigator.share({
                                    text,
                                    files: [new File([blob], "edge-session.png", { type: "image/png" })],
                                  });
                                  return;
                                }
                              }
                            } catch {}

                            if (navigator.share) {
                              navigator.share({ text }).catch(() => {});
                            } else {
                              navigator.clipboard.writeText(text).catch(() => {});
                            }
                          }}
                          className="btn-secondary mb-2"
                          style={{ borderColor: "var(--phase-deploy)", color: "var(--phase-deploy-muted)" }}
                        >
                          Share summary
                        </button>
                      </div>

                      {/* Done button */}
                      <button onClick={() => router.push("/")} className="btn-primary">
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* ================================================================== */}
      {/* Sticky CTA (learn phase)                                            */}
      {/* ================================================================== */}
      {currentPhase === "lesson" && lessonContent && !isLoading && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.lesson, borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-lg">
            {lessonCardPos.current < lessonCardPos.total - 1 ? (
              <p className="py-3 text-center text-body" style={{ color: "var(--text-secondary)" }}>
                {lessonCardPos.current + 1} of {lessonCardPos.total} &mdash; swipe to continue
              </p>
            ) : (
              <button onClick={() => startRetrieval()} className="btn-primary animate-fade-in-up">
                Ready to practise &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Sticky continue button (debrief)                                    */}
      {/* ================================================================== */}
      {currentPhase === "debrief" && debriefContent && !isLoading && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.debrief, borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-lg">
            <button onClick={enterDeploy} className="btn-primary" style={{ backgroundColor: "var(--phase-debrief-muted)" }}>
              Your mission &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Fixed bottom bar (roleplay)                                         */}
      {/* ================================================================== */}
      {isRoleplay && !completedPhases.has("roleplay") && (
        <div className="flex-shrink-0 bottom-bar bg-white px-4 pt-3 shadow-[var(--shadow-elevated)]" style={{ borderRadius: "var(--radius-xl) var(--radius-xl) 0 0" }}>

          {/* Voice listening state — replaces text input when actively listening */}
          {voice.voiceEnabled && voice.state === "listening" && (
            <div className="flex flex-col items-center gap-3 mb-2 py-2">
              <div className="flex items-center gap-1.5 h-6 text-[#5A52E0]">
                <span className="voice-bar" />
                <span className="voice-bar" />
                <span className="voice-bar" />
              </div>
              <p className="text-sm text-secondary">
                {voice.interimTranscript || "Listening..."}
              </p>
              <button
                onClick={voice.stopListening}
                className="voice-listening flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-[0.93]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                  <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                  <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                </svg>
              </button>
            </div>
          )}

          {/* Voice speaking state — show indicator while AI talks */}
          {voice.voiceEnabled && voice.state === "speaking" && (
            <div className="flex flex-col items-center gap-3 mb-2 py-2">
              <div className="flex items-center gap-1.5 h-6 text-[#D4908F]">
                <span className="voice-bar" />
                <span className="voice-bar" />
                <span className="voice-bar" />
              </div>
              <p className="text-sm text-secondary">{character?.name} is speaking...</p>
              <button
                onClick={() => { voice.stopSpeaking(); }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FDF2F2] text-[#D4908F] transition-transform active:scale-[0.93] voice-speaking"
                title="Stop speaking"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          {/* Normal text input (shown when not listening/speaking in voice mode) */}
          {(!voice.voiceEnabled || (voice.state !== "listening" && voice.state !== "speaking")) && (
            <div className="flex items-end gap-2 mb-2">
              <textarea
                ref={inputRef}
                placeholder={voice.voiceEnabled ? "Tap mic or type..." : "Type your response..."}
                rows={1}
                className="input-field flex-1 resize-none"
                style={{ backgroundColor: "var(--phase-simulate-tint)", maxHeight: "6rem", borderRadius: "var(--radius-md)" }}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && inputValue.trim() && !isStreaming) {
                    e.preventDefault();
                    handleRoleplayInput(inputValue);
                  }
                }}
                disabled={isStreaming || isLoading}
              />

              {/* Mic button (when voice enabled and no text typed) */}
              {voice.voiceEnabled && voice.sttSupported && !inputValue.trim() && !isStreaming && !isLoading && (
                <button
                  onClick={voice.startListening}
                  className="touch-target rounded-full"
                  style={{ backgroundColor: "var(--accent)", color: "white" }}
                  title="Speak"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                    <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                  </svg>
                </button>
              )}

              {/* Send button */}
              {(!voice.voiceEnabled || inputValue.trim() || isStreaming || isLoading) && (
                <button
                  onClick={() => { if (inputValue.trim() && !isStreaming) handleRoleplayInput(inputValue); }}
                  disabled={isStreaming || isLoading || !inputValue.trim()}
                  className="touch-target rounded-full disabled:opacity-40"
                  style={{ backgroundColor: "var(--accent)", color: "white" }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                    <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.637a.75.75 0 0 0 0-1.4L3.105 2.289Z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Command toolbar */}
          <div className="flex items-center justify-between px-1 pb-2">
            {/* Left: Assistance tools */}
            <div className="flex items-center gap-3">
              {voice.sttSupported && (
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={voice.toggleVoice}
                    className="touch-target rounded-full transition-all"
                    style={{
                      backgroundColor: voice.voiceEnabled ? "var(--accent)" : "var(--border)",
                      color: voice.voiceEnabled ? "white" : "var(--text-secondary)",
                      boxShadow: voice.voiceEnabled ? "var(--shadow-accent)" : "none",
                    }}
                    title={voice.voiceEnabled ? "Voice on" : "Voice off"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      {voice.voiceEnabled ? (
                        <>
                          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06Z" />
                          <path d="M18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                          <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
                        </>
                      ) : (
                        <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
                      )}
                    </svg>
                  </button>
                  <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Voice</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-1">
                <button onClick={handleCoach} className="touch-target rounded-full text-lead" style={{ backgroundColor: "var(--coach-bg)" }} title="Coach">
                  &#128161;
                </button>
                <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Hint</span>
              </div>
            </div>

            {/* Center: Session controls */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <button onClick={handleReset} className="touch-target rounded-full text-body" style={{ backgroundColor: "var(--border)" }} title="Reset">
                  &#128260;
                </button>
                <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Reset</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button onClick={handleSkip} className="touch-target rounded-full text-body" style={{ backgroundColor: "var(--border)" }} title="Skip">
                  &#9197;
                </button>
                <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Skip</span>
              </div>
            </div>

            {/* Right: Primary action — Done */}
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={handleDone}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-lead font-bold"
                style={{ backgroundColor: "var(--score-high)", color: "white", boxShadow: "0 3px 12px rgba(107,201,160,0.3)" }}
                title="Done"
              >
                &#10003;
              </button>
              <span className="text-caption font-medium" style={{ fontSize: 10, color: "var(--score-high-text)" }}>Done</span>
            </div>
          </div>
        </div>
      )}

      {/* New message pill */}
      {showNewMessagePill && isRoleplay && (
        <button
          onClick={() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); setShowNewMessagePill(false); }}
          className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-caption font-semibold"
          style={{ backgroundColor: "var(--accent)", color: "white", boxShadow: "var(--shadow-accent)" }}
        >
          &darr; New message
        </button>
      )}

      {/* ================================================================== */}
      {/* Exit confirmation modal                                             */}
      {/* ================================================================== */}
      {showExitModal && (
        <>
          <div className="fixed inset-0 z-[60] backdrop-blur-overlay" style={{ backgroundColor: "rgba(0,0,0,0.2)" }} onClick={() => setShowExitModal(false)} />
          <div className="fixed inset-x-5 top-1/2 z-[70] mx-auto max-w-sm -translate-y-1/2 card" style={{ padding: "28px 24px", boxShadow: "var(--shadow-elevated)" }}>
            <p className="text-lead font-semibold" style={{ color: "var(--text-primary)" }}>Leave session?</p>
            <p className="mt-2 mb-6 text-body" style={{ color: "var(--text-secondary)" }}>Your progress will be saved. You can resume within 30 minutes.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  saveSession();
                  router.push("/");
                }}
                className="btn-primary flex-1"
                style={{ backgroundColor: "var(--score-low)", color: "var(--score-low-text)", boxShadow: "none" }}
              >
                Leave
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="btn-secondary flex-1"
              >
                Stay
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* Coach panel — warm cream bottom sheet                               */}
      {/* ================================================================== */}
      {(coachAdvice || coachLoading) && (
        <>
          <div
            className="fixed inset-0 z-40 backdrop-blur-overlay sm:hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.1)" }}
            onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
          />
          <div
            className="fixed inset-x-0 bottom-0 top-[40%] z-50 overflow-y-auto p-6 sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:top-0 sm:w-80 sm:max-w-[90vw] sm:rounded-none"
            style={{
              backgroundColor: "var(--coach-bg)",
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              boxShadow: "var(--shadow-elevated)",
            }}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full sm:hidden" style={{ backgroundColor: "var(--border)" }} />
            <div className="mb-5 flex items-center justify-between">
              <span className="text-body font-semibold" style={{ color: "var(--coach-muted)" }}>Mentor</span>
              <button
                onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
                className="touch-target text-lead"
                style={{ color: "var(--text-secondary)" }}
              >
                &times;
              </button>
            </div>
            {coachLoading ? <LoadingDots /> : (
              <div className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{renderMarkdown(coachAdvice!)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

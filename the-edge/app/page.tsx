"use client";

/**
 * Home page — session launcher with progress ring, score circles,
 * onboarding flow, and trend dashboard.
 * Tiimo-inspired: warm cream, soft purple accent, DM Sans, generous whitespace.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SessionScores, LedgerEntry } from "@/lib/types";
import Onboarding from "./components/Onboarding";
import TrendDashboard from "./components/TrendDashboard";

interface ScoreEntry {
  day: number;
  date: string;
  scores: SessionScores;
  concept: string;
}

interface StatusData {
  dayNumber: number;
  lastEntry: LedgerEntry | null;
  recentScores: SessionScores[];
  streakCount: number;
  srSummary?: { totalConcepts: number; dueForReview: number; masteredCount: number };
  allScores?: ScoreEntry[];
}

const DIMENSIONS: { key: keyof SessionScores; label: string; fullName: string; description: string }[] = [
  { key: "technique_application", label: "Technique", fullName: "Technique Application", description: "How effectively you deployed the day\u2019s concept during the roleplay." },
  { key: "tactical_awareness", label: "Tactical", fullName: "Tactical Awareness", description: "Your ability to recognise the character\u2019s tactics and adapt in real time." },
  { key: "frame_control", label: "Frame", fullName: "Frame Control", description: "Who owned the conversation frame and whether you maintained or lost it." },
  { key: "emotional_regulation", label: "Regulation", fullName: "Emotional Regulation", description: "Whether you stayed strategic under pressure or became reactive." },
  { key: "strategic_outcome", label: "Outcome", fullName: "Strategic Outcome", description: "Whether you achieved your objective and moved the character from their position." },
];

function scoreCircleColor(score: number): string {
  if (score >= 4) return "#6BC9A0";
  if (score === 3) return "#F5C563";
  return "#E88B8B";
}

function scoreTextColor(score: number): string {
  if (score >= 4) return "#1A5C3A";
  if (score === 3) return "#6B4F00";
  return "#611414";
}

function averageDescriptor(avg: number): string {
  if (avg >= 4.8) return "Master";
  if (avg >= 4.0) return "Elite";
  if (avg >= 3.5) return "Sharp";
  if (avg >= 2.5) return "Building";
  return "Developing";
}

// ---------------------------------------------------------------------------
// Progress Ring — SVG circle showing overall average
// ---------------------------------------------------------------------------

function ProgressRing({ average, hasData }: { average: number; hasData: boolean }) {
  const size = 160;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = hasData ? (average / 5) * circumference : 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Delay to ensure the initial strokeDashoffset renders before transitioning
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative mx-auto" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className={`rotate-[-90deg] ${hasData && average >= 4.0 ? "ring-glow" : ""}`}
          role="img"
          aria-label={hasData ? `Overall score: ${average.toFixed(1)} out of 5` : "No score data yet"}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#F0EDE8"
            strokeWidth={strokeWidth}
          />
          {hasData && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#5A52E0"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={mounted ? circumference - progress : circumference}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-primary">
            {hasData ? average.toFixed(1) : "\u2013"}
          </span>
          {hasData && <span className="text-xs text-secondary">out of 5</span>}
        </div>
      </div>
      {hasData && (
        <>
          <span
            className="achievement-badge"
            style={{
              backgroundColor: average >= 4.0 ? "#EEEDFF" : average >= 3.0 ? "#FEF3CD" : "#FDE2E2",
              color: average >= 4.0 ? "#5A52E0" : average >= 3.0 ? "#6B4F00" : "#611414",
            }}
          >
            {average >= 4.0 && <span aria-hidden="true">&#9733;</span>}
            {averageDescriptor(average)}
          </span>
          {average < 3 && (
            <span className="text-[11px] text-secondary mt-0.5">
              Most users hit 3.0 by Day 10
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const CACHE_KEY = "edge-status-cache";
const SESSION_STORAGE_KEY = "edge-session-state";
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [hasIncompleteSession, setHasIncompleteSession] = useState(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(SESSION_STORAGE_KEY) : null;
      if (raw) {
        const s = JSON.parse(raw);
        if (Date.now() - s.timestamp < SESSION_MAX_AGE_MS) return true;
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch { /* empty */ }
    return false;
  });
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const expandTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Cleanup expand timeout on unmount
  useEffect(() => {
    return () => {
      if (expandTimeout.current) clearTimeout(expandTimeout.current);
    };
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Sync initial state via microtask to avoid synchronous setState in effect
    queueMicrotask(() => setOnline(navigator.onLine));
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    // Use microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (Date.now() - s.timestamp < SESSION_MAX_AGE_MS) {
            setHasIncompleteSession(true);
          } else {
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        }
      } catch { /* localStorage unavailable */ }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota exceeded */ }

        // Show onboarding if no sessions and not previously completed
        if (!data.lastEntry) {
          try {
            if (!localStorage.getItem("edge-onboarding-complete")) {
              setShowOnboarding(true);
            }
          } catch { /* localStorage unavailable */ }
        }
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) setStatus(JSON.parse(cached));
        } catch { /* localStorage unavailable */ }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  // Score circle expand handler — clears previous timeout to prevent leaks
  const handleScoreCircleClick = useCallback((key: string) => {
    if (expandTimeout.current) clearTimeout(expandTimeout.current);
    setExpandedDim((prev) => {
      if (prev === key) return null;
      expandTimeout.current = setTimeout(() => setExpandedDim(null), 4000);
      return key;
    });
  }, []);

  const dayNumber = status?.dayNumber ?? 1;
  const recentScores = status?.recentScores ?? [];
  const streakCount = status?.streakCount ?? 0;
  const latestScores = recentScores.length > 0 ? recentScores[recentScores.length - 1] : null;
  const allScores = status?.allScores ?? [];

  const average = latestScores
    ? (latestScores.technique_application +
       latestScores.tactical_awareness +
       latestScores.frame_control +
       latestScores.emotional_regulation +
       latestScores.strategic_outcome) / 5
    : 0;

  const hasData = latestScores !== null;

  // Show onboarding flow
  if (showOnboarding) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex min-h-[85vh] flex-col items-center justify-center gap-8">
        {/* Title + tagline + day */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            <span className="text-[#5A52E0]">the</span> edge
          </h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-[#5A52E0]/60 uppercase">
            Daily influence training
          </p>
          <p className="mt-2 text-base text-primary font-medium" aria-live="polite">
            {loading ? "\u2014" : (
              <>
                Day {dayNumber}
                {streakCount > 0 && <> &middot; <span className="text-score-mid animate-count-up" aria-label={`${streakCount} day streak`}>&#128293; {streakCount}-day streak</span></>}
              </>
            )}
          </p>
        </div>

        {/* Progress ring */}
        <ProgressRing average={average} hasData={hasData} />

        {/* Score circles row */}
        <div
          className="flex w-full items-start justify-center gap-3 sm:gap-5 overflow-x-auto px-2"
          role="group"
          aria-label="Score dimensions"
        >
          {DIMENSIONS.map(({ key, label, fullName, description }) => {
            const score = latestScores ? latestScores[key] : null;
            const isExpanded = expandedDim === key;
            return (
              <div key={key} className="flex flex-col items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => handleScoreCircleClick(key)}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A52E0] focus-visible:ring-offset-2"
                  style={{
                    backgroundColor: score !== null ? scoreCircleColor(score) : "#E0DED8",
                    color: score !== null ? scoreTextColor(score) : "#8E8C99",
                    boxShadow: isExpanded
                      ? "0 0 0 3px #5A52E0"
                      : score === 5
                      ? "0 0 0 2px rgba(107,201,160,0.4)"
                      : "none",
                    opacity: score !== null && score <= 2 ? 0.85 : 1,
                  }}
                  aria-label={`${fullName}: ${score !== null ? score + " out of 5" : "no score yet"}`}
                  aria-expanded={isExpanded}
                >
                  {score !== null ? score : "\u2013"}
                </button>
                <span className="text-[10px] text-secondary">{label}</span>
                {isExpanded && (
                  <div
                    className="animate-fade-in-up w-36 rounded-2xl bg-white p-3 text-center shadow-[0_2px_12px_rgba(0,0,0,0.08)]"
                    role="tooltip"
                  >
                    <p className="text-xs font-semibold text-primary">{fullName}</p>
                    <p className="mt-1 text-[11px] leading-tight text-secondary">{description}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Trend Dashboard (#8) */}
        {allScores.length >= 2 && (
          <TrendDashboard allScores={allScores} />
        )}

        {/* Empty state message */}
        {!hasData && !loading && !hasIncompleteSession && (
          <p className="text-center text-sm text-secondary leading-relaxed">
            Complete your first session to see your scores
          </p>
        )}

        {/* Resume session card */}
        {hasIncompleteSession && (
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]" role="region" aria-label="Resume session">
            <p className="mb-1 text-sm font-medium text-primary">Session in progress</p>
            <p className="mb-5 text-sm text-secondary">You have an unfinished session. Pick up where you left off?</p>
            <div className="flex gap-3">
              <button
                onClick={() => { if (online) router.push("/session"); }}
                disabled={!online}
                className="flex-1 rounded-2xl bg-[#5A52E0] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A52E0] focus-visible:ring-offset-2"
              >
                Resume
              </button>
              <button
                onClick={() => {
                  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ok */ }
                  setHasIncompleteSession(false);
                  if (online) router.push("/session");
                }}
                disabled={!online}
                className="flex-1 rounded-2xl border border-[#F0EDE8] bg-white py-3.5 text-sm font-semibold text-primary transition-transform active:scale-[0.97] disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A52E0] focus-visible:ring-offset-2"
              >
                Start fresh
              </button>
            </div>
          </div>
        )}

        {/* Begin session button */}
        {!hasIncompleteSession && (
          <button
            onClick={() => { if (online) router.push("/session"); }}
            disabled={!online}
            className="w-full max-w-sm rounded-2xl bg-[#5A52E0] px-10 py-5 text-lg font-bold text-white disabled:opacity-40 shadow-[0_4px_20px_rgba(90,82,224,0.25)] transition-shadow hover:shadow-[0_6px_28px_rgba(90,82,224,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A52E0] focus-visible:ring-offset-2"
          >
            {online ? "Begin today\u2019s session" : "Offline"}
          </button>
        )}
      </div>
    </main>
  );
}

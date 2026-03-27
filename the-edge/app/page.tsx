"use client";

/**
 * Home page — personal training dashboard.
 * Mobile-first: warm, focused, premium feel.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SessionScores, LedgerEntry } from "@/lib/types";
import { hapticTap } from "@/lib/haptics";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
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
  if (score >= 4) return "var(--score-high)";
  if (score === 3) return "var(--score-mid)";
  return "var(--score-low)";
}

function scoreTextColor(score: number): string {
  if (score >= 4) return "var(--score-high-text)";
  if (score === 3) return "var(--score-mid-text)";
  return "var(--score-low-text)";
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
  const size = 172;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = hasData ? (average / 5) * circumference : 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative mx-auto animate-float" style={{ width: size, height: size }}>
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
            stroke="var(--border-subtle)"
            strokeWidth={strokeWidth}
          />
          {hasData && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={mounted ? circumference - progress : circumference}
              style={{ transition: "stroke-dashoffset 1.2s var(--ease-out-expo)" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-display font-bold" style={{ color: "var(--text-primary)" }}>
            {hasData ? average.toFixed(1) : "\u2013"}
          </span>
          {hasData && <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>out of 5</span>}
        </div>
      </div>
      {hasData && (
        <>
          <span
            className="achievement-badge"
            style={{
              backgroundColor: average >= 4.0 ? "var(--accent-soft)" : average >= 3.0 ? "var(--score-mid-bg)" : "var(--score-low-bg)",
              color: average >= 4.0 ? "var(--accent)" : average >= 3.0 ? "var(--score-mid-text)" : "var(--score-low-text)",
            }}
          >
            {average >= 4.0 && <span aria-hidden="true">&#9733;</span>}
            {averageDescriptor(average)}
          </span>
          {average < 3 && (
            <span className="text-caption mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Most users hit 3.0 by Day 10
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loader for home page
// ---------------------------------------------------------------------------

function HomeSkeleton() {
  return (
    <div className="flex min-h-[85dvh] flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="skeleton h-6 w-32" />
        <div className="skeleton h-4 w-48 mt-1" />
      </div>
      <div className="skeleton rounded-full" style={{ width: 172, height: 172 }} />
      <div className="flex gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="skeleton rounded-full" style={{ width: 52, height: 52 }} />
            <div className="skeleton h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="skeleton h-[52px] w-full max-w-sm rounded-[16px]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const CACHE_KEY = "edge-status-cache";
const SESSION_STORAGE_KEY = "edge-session-state";
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours — match session page

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
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
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Check auth — redirect to login if no session
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
      } else {
        setAuthChecked(true);
      }
    });
  }, [router]);

  // Cleanup expand timeout on unmount
  useEffect(() => {
    return () => {
      if (expandTimeout.current) clearTimeout(expandTimeout.current);
    };
  }, []);

  // Close settings menu on outside click
  useEffect(() => {
    if (!showSettingsMenu) return;
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettingsMenu]);

  const handleSignOut = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
  }, [router]);

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

  // Don't render anything until auth check completes (prevents flash)
  if (!authChecked) {
    return (
      <main className="mx-auto max-w-[480px] px-5">
        <HomeSkeleton />
      </main>
    );
  }

  if (showOnboarding) {
    return (
      <main className="mx-auto max-w-[480px] px-5 py-8">
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-[480px] px-5">
        <HomeSkeleton />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[480px] px-5 pb-10">
      <div className="flex min-h-[90dvh] flex-col items-center justify-center gap-7">

        {/* Header */}
        <div className="relative text-center w-full">
          {/* Settings button */}
          <div ref={settingsRef} className="absolute right-0 top-0" style={{ zIndex: 10 }}>
            <button
              type="button"
              onClick={() => setShowSettingsMenu((v) => !v)}
              className="flex items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                width: 40,
                height: 40,
                backgroundColor: showSettingsMenu ? "var(--border)" : "transparent",
                color: "var(--text-tertiary)",
              }}
              aria-label="Settings"
              aria-expanded={showSettingsMenu}
              aria-haspopup="true"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="2.5" />
                <path d="M16.2 12.8a1.4 1.4 0 0 0 .28 1.54l.05.05a1.7 1.7 0 1 1-2.4 2.4l-.05-.05a1.4 1.4 0 0 0-1.54-.28 1.4 1.4 0 0 0-.85 1.28v.15a1.7 1.7 0 1 1-3.4 0v-.08a1.4 1.4 0 0 0-.91-1.28 1.4 1.4 0 0 0-1.54.28l-.05.05a1.7 1.7 0 1 1-2.4-2.4l.05-.05a1.4 1.4 0 0 0 .28-1.54 1.4 1.4 0 0 0-1.28-.85H2.3a1.7 1.7 0 1 1 0-3.4h.08a1.4 1.4 0 0 0 1.28-.91 1.4 1.4 0 0 0-.28-1.54l-.05-.05a1.7 1.7 0 1 1 2.4-2.4l.05.05a1.4 1.4 0 0 0 1.54.28h.07a1.4 1.4 0 0 0 .85-1.28V2.3a1.7 1.7 0 1 1 3.4 0v.08a1.4 1.4 0 0 0 .85 1.28 1.4 1.4 0 0 0 1.54-.28l.05-.05a1.7 1.7 0 1 1 2.4 2.4l-.05.05a1.4 1.4 0 0 0-.28 1.54v.07a1.4 1.4 0 0 0 1.28.85h.15a1.7 1.7 0 1 1 0 3.4h-.08a1.4 1.4 0 0 0-1.28.85z" />
              </svg>
            </button>
            {showSettingsMenu && (
              <div
                className="animate-fade-in-up absolute right-0 mt-2 w-40 rounded-[var(--radius-md)] p-1"
                style={{
                  backgroundColor: "var(--surface)",
                  boxShadow: "var(--shadow-elevated)",
                  zIndex: 20,
                }}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-body font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  style={{ color: "var(--score-low-text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--score-low-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 14H3.33A1.33 1.33 0 0 1 2 12.67V3.33A1.33 1.33 0 0 1 3.33 2H6" />
                    <polyline points="10.67 11.33 14 8 10.67 4.67" />
                    <line x1="14" y1="8" x2="6" y2="8" />
                  </svg>
                  Sign Out
                </button>
              </div>
            )}
          </div>

          <h1 className="text-display font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            <span style={{ color: "var(--accent)" }}>the</span> edge
          </h1>
          <p className="mt-1 text-caption font-semibold tracking-widest uppercase" style={{ color: "var(--accent)", opacity: 0.6 }}>
            Daily influence training
          </p>
          <p className="mt-3 text-body font-medium" style={{ color: "var(--text-primary)" }} aria-live="polite">
            {loading ? "\u2014" : (
              <>
                Day {dayNumber}
                {streakCount > 0 && (
                  <span className="animate-count-up ml-2" style={{ color: "var(--score-mid)" }} aria-label={`${streakCount} day streak`}>
                    &#128293; {streakCount}-day streak
                  </span>
                )}
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
              <div key={key} className="flex flex-col items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => handleScoreCircleClick(key)}
                  className="flex items-center justify-center rounded-full text-body font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  style={{
                    width: 52,
                    height: 52,
                    backgroundColor: score !== null ? scoreCircleColor(score) : "var(--border)",
                    color: score !== null ? scoreTextColor(score) : "var(--text-tertiary)",
                    boxShadow: isExpanded
                      ? "0 0 0 3px var(--accent)"
                      : score === 5
                      ? "0 0 0 2px rgba(107,201,160,0.35)"
                      : "none",
                    opacity: score !== null && score <= 2 ? 0.85 : 1,
                  }}
                  aria-label={`${fullName}: ${score !== null ? score + " out of 5" : "no score yet"}`}
                  aria-expanded={isExpanded}
                >
                  {score !== null ? score : "\u2013"}
                </button>
                <span className="text-caption" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{label}</span>
                {isExpanded && (
                  <div
                    className="animate-fade-in-up w-40 rounded-[var(--radius-lg)] p-3.5 text-center"
                    style={{ backgroundColor: "var(--surface)", boxShadow: "var(--shadow-elevated)" }}
                    role="tooltip"
                  >
                    <p className="text-caption font-semibold" style={{ color: "var(--text-primary)" }}>{fullName}</p>
                    <p className="mt-1 text-caption leading-snug" style={{ color: "var(--text-secondary)" }}>{description}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Trend Dashboard */}
        {allScores.length >= 2 && (
          <TrendDashboard allScores={allScores} />
        )}

        {/* Empty state message */}
        {!hasData && !hasIncompleteSession && (
          <div className="text-center px-6">
            <p className="text-body" style={{ color: "var(--text-secondary)" }}>
              Complete your first session to unlock your dashboard
            </p>
          </div>
        )}

        {/* Resume session card */}
        {hasIncompleteSession && (
          <div className="w-full max-w-sm card" role="region" aria-label="Resume session">
            <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>Session in progress</p>
            <p className="mt-1 text-caption" style={{ color: "var(--text-secondary)" }}>You have an unfinished session. Pick up where you left off?</p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { if (online) router.push("/session"); }}
                disabled={!online}
                className="btn-primary flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
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
                className="btn-secondary flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              >
                Start fresh
              </button>
            </div>
          </div>
        )}

        {/* Begin session button */}
        {!hasIncompleteSession && (
          <button
            onClick={() => { hapticTap(); if (online) router.push("/session"); }}
            disabled={!online}
            className="btn-primary w-full max-w-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            {online ? "Begin today\u2019s session" : "Offline"}
          </button>
        )}
      </div>

      {/* Session history */}
      {allScores.length > 0 && (
        <section className="mt-4 w-full" aria-label="Session history">
          <h2
            className="text-body font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Recent sessions
          </h2>
          <div className="flex flex-col gap-2.5">
            {allScores.slice(-5).reverse().map((entry) => {
              const avg =
                (entry.scores.technique_application +
                  entry.scores.tactical_awareness +
                  entry.scores.frame_control +
                  entry.scores.emotional_regulation +
                  entry.scores.strategic_outcome) / 5;
              const formattedDate = new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              });
              return (
                <div
                  key={`${entry.day}-${entry.date}`}
                  className="flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3"
                  style={{
                    backgroundColor: "var(--surface)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="text-caption font-bold shrink-0"
                      style={{
                        color: "var(--accent)",
                        width: 36,
                      }}
                    >
                      D{entry.day}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-body font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {entry.concept}
                      </p>
                      <p
                        className="text-caption"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {formattedDate}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-body font-bold shrink-0 ml-3"
                    style={{ color: scoreTextColor(Math.round(avg)) }}
                  >
                    {avg.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

"use client";

/**
 * Home page — session launcher with competency scores and streak.
 * Mobile-first: compact layout, 2-col score grid, offline support.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionScores, LedgerEntry } from "@/lib/types";

interface StatusData {
  dayNumber: number;
  lastEntry: LedgerEntry | null;
  recentScores: SessionScores[];
  streakCount: number;
}

const DIMENSIONS: { key: keyof SessionScores; label: string; abbr: string }[] = [
  { key: "technique_application", label: "Technique Application", abbr: "TA" },
  { key: "tactical_awareness", label: "Tactical Awareness", abbr: "TW" },
  { key: "frame_control", label: "Frame Control", abbr: "FC" },
  { key: "emotional_regulation", label: "Emotional Regulation", abbr: "ER" },
  { key: "strategic_outcome", label: "Strategic Outcome", abbr: "SO" },
];

function scoreColor(score: number): string {
  if (score >= 4) return "text-success";
  if (score === 3) return "text-amber";
  return "text-accent";
}

function trendArrow(scores: number[]): string {
  if (scores.length < 2) return "";
  const recent = scores.slice(-3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const older = scores.slice(0, -3);
  if (older.length === 0) return "";
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  if (avg > olderAvg + 0.3) return "\u2191";
  if (avg < olderAvg - 0.3) return "\u2193";
  return "\u2192";
}

const CACHE_KEY = "edge-status-cache";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  // Online/offline tracking
  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        // Cache for offline use
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch(() => {
        // Try cached data when offline
        try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) setStatus(JSON.parse(cached));
        } catch {}
      })
      .finally(() => setLoading(false));
  }, []);

  const dayNumber = status?.dayNumber ?? 1;
  const recentScores = status?.recentScores ?? [];
  const streakCount = status?.streakCount ?? 0;

  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex min-h-[85vh] flex-col items-center justify-center">
        {/* Title — compact on mobile, large on desktop */}
        <h1 className="mb-1 text-2xl font-light tracking-widest text-foreground sm:text-5xl sm:font-bold sm:tracking-tight">
          THE EDGE
        </h1>
        <p className="mb-10 font-mono text-sm tracking-widest text-secondary">
          DAY {loading ? "\u2014" : dayNumber}
        </p>

        {/* Session launcher */}
        <button
          onClick={() => { if (online) router.push("/session"); }}
          disabled={!online}
          className="mb-12 w-full rounded-lg bg-accent px-10 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 sm:w-auto"
        >
          {online ? "BEGIN SESSION" : "Offline"}
        </button>

        {/* Competency scores — 2-col grid on mobile, list on desktop */}
        <div className="mb-6 w-full max-w-md rounded-lg border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
            Competency Scores
          </h2>

          {/* Mobile: 2-column grid */}
          <div className="grid grid-cols-2 gap-3 sm:hidden">
            {DIMENSIONS.map(({ key, abbr }) => {
              const allScores = recentScores.map((s) => s[key]);
              const latest = allScores.length > 0 ? allScores[allScores.length - 1] : null;
              const trend = trendArrow(allScores);
              return (
                <div key={key} className="flex items-center justify-between rounded-md bg-background/50 px-3 py-2">
                  <span className="font-mono text-xs text-secondary">{abbr}</span>
                  <div className="flex items-center gap-1.5 font-mono text-sm">
                    {latest !== null ? (
                      <>
                        <span className={scoreColor(latest)}>{latest}</span>
                        {trend && (
                          <span className={
                            trend === "\u2191" ? "text-success" :
                            trend === "\u2193" ? "text-accent" : "text-secondary"
                          }>{trend}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-secondary">{"\u2014"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: full labels list */}
          <div className="hidden space-y-3 sm:block">
            {DIMENSIONS.map(({ key, label }) => {
              const allScores = recentScores.map((s) => s[key]);
              const latest = allScores.length > 0 ? allScores[allScores.length - 1] : null;
              const avg =
                allScores.length > 0
                  ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1)
                  : null;
              const trend = trendArrow(allScores);

              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{label}</span>
                  <div className="flex items-center gap-3 font-mono text-sm">
                    {latest !== null ? (
                      <>
                        <span className={scoreColor(latest)}>{latest}</span>
                        <span className="text-secondary">{avg}</span>
                        {trend && (
                          <span
                            className={
                              trend === "\u2191"
                                ? "text-success"
                                : trend === "\u2193"
                                  ? "text-accent"
                                  : "text-secondary"
                            }
                          >
                            {trend}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-secondary">{"\u2014"}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Streak counter */}
        <p className="font-mono text-sm text-secondary">
          {streakCount > 0 ? (
            <>
              <span className="text-amber">{"\uD83D\uDD25"}</span> Day{" "}
              {streakCount} streak
            </>
          ) : (
            "Start your streak"
          )}
        </p>
      </div>
    </main>
  );
}

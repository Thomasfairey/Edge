"use client";

/**
 * Home page — session launcher with competency scores and streak.
 * Fetches status data from /api/status on mount.
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

const DIMENSIONS: { key: keyof SessionScores; label: string }[] = [
  { key: "technique_application", label: "Technique Application" },
  { key: "tactical_awareness", label: "Tactical Awareness" },
  { key: "frame_control", label: "Frame Control" },
  { key: "emotional_regulation", label: "Emotional Regulation" },
  { key: "strategic_outcome", label: "Strategic Outcome" },
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

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  const dayNumber = status?.dayNumber ?? 1;
  const recentScores = status?.recentScores ?? [];
  const streakCount = status?.streakCount ?? 0;

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center">
      {/* Title */}
      <h1 className="mb-1 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
        THE EDGE
      </h1>
      <p className="mb-10 font-mono text-sm tracking-widest text-secondary">
        DAY {loading ? "—" : dayNumber}
      </p>

      {/* Session launcher */}
      <button
        onClick={() => router.push("/session")}
        className="mb-12 rounded-lg bg-accent px-10 py-4 text-lg font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
      >
        BEGIN SESSION
      </button>

      {/* Competency scores */}
      <div className="mb-6 w-full max-w-md rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
          Competency Scores
        </h2>
        <div className="space-y-3">
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
                    <span className="text-secondary">—</span>
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
  );
}

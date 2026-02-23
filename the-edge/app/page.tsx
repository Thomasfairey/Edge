"use client";

/**
 * Home page — session launcher with progress ring and score circles.
 * Tiimo-inspired: warm cream, soft purple accent, DM Sans, generous whitespace.
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
  { key: "technique_application", label: "TA" },
  { key: "tactical_awareness", label: "TW" },
  { key: "frame_control", label: "FC" },
  { key: "emotional_regulation", label: "ER" },
  { key: "strategic_outcome", label: "SO" },
];

function scoreCircleColor(score: number): string {
  if (score >= 4) return "#6BC9A0";
  if (score === 3) return "#F5C563";
  return "#E88B8B";
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

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#F0EDE8"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        {hasData && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#6C63FF"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: "stroke-dashoffset 800ms ease-out" }}
          />
        )}
      </svg>
      {/* Centre number */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl font-bold text-primary">
          {hasData ? average.toFixed(1) : "\u2013"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const CACHE_KEY = "edge-status-cache";

export default function Home() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

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
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      })
      .catch(() => {
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
  const latestScores = recentScores.length > 0 ? recentScores[recentScores.length - 1] : null;

  const average = latestScores
    ? (latestScores.technique_application +
       latestScores.tactical_awareness +
       latestScores.frame_control +
       latestScores.emotional_regulation +
       latestScores.strategic_outcome) / 5
    : 0;

  const hasData = latestScores !== null;

  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex min-h-[85vh] flex-col items-center justify-center gap-8">
        {/* Title + day */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            the edge
          </h1>
          <p className="mt-1 text-base text-secondary">
            {loading ? "\u2014" : (
              <>
                Day {dayNumber}
                {streakCount > 0 && <> &middot; <span className="text-score-mid">&#128293;</span> {streakCount}-day streak</>}
              </>
            )}
          </p>
        </div>

        {/* Progress ring */}
        <ProgressRing average={average} hasData={hasData} />

        {/* Score circles row */}
        <div className="flex items-center justify-center gap-5">
          {DIMENSIONS.map(({ key, label }) => {
            const score = latestScores ? latestScores[key] : null;
            return (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    backgroundColor: score !== null ? scoreCircleColor(score) : "#E0DED8",
                  }}
                >
                  {score !== null ? score : "\u2013"}
                </div>
                <span className="text-xs text-secondary">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Empty state message */}
        {!hasData && !loading && (
          <p className="text-base text-secondary">
            &#127793; Your first session
          </p>
        )}

        {/* Begin session button — solid purple, no gradient */}
        <button
          onClick={() => { if (online) router.push("/session"); }}
          disabled={!online}
          className="w-full max-w-sm rounded-2xl bg-[#6C63FF] px-10 py-4 text-lg font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
        >
          {online ? "Begin session" : "Offline"}
        </button>
      </div>
    </main>
  );
}

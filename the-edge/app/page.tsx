"use client";

/**
 * Home page — session launcher with pentagon radar chart and streak.
 * Light theme, mobile-first, Inter font, indigo/violet gradients.
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
  { key: "technique_application", label: "Technique", abbr: "TA" },
  { key: "tactical_awareness", label: "Tactical", abbr: "TW" },
  { key: "frame_control", label: "Frame", abbr: "FC" },
  { key: "emotional_regulation", label: "Emotional", abbr: "ER" },
  { key: "strategic_outcome", label: "Strategic", abbr: "SO" },
];

// ---------------------------------------------------------------------------
// Pentagon radar chart — 5 vertices, SVG 200x200
// ---------------------------------------------------------------------------

function PentagonRadar({ scores }: { scores: SessionScores | null }) {
  const cx = 100;
  const cy = 100;
  const maxR = 80;
  const levels = 5;

  // Pentagon vertices: start from top, go clockwise
  const angleOffset = -Math.PI / 2;
  const angles = DIMENSIONS.map((_, i) => angleOffset + (2 * Math.PI * i) / 5);

  function polarToXY(angle: number, r: number): [number, number] {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function polygonPoints(r: number): string {
    return angles.map((a) => polarToXY(a, r).join(",")).join(" ");
  }

  // Data polygon
  const scoreValues = scores
    ? DIMENSIONS.map((d) => scores[d.key])
    : [0, 0, 0, 0, 0];

  const dataPoints = angles
    .map((a, i) => {
      const r = (scoreValues[i] / levels) * maxR;
      return polarToXY(a, r).join(",");
    })
    .join(" ");

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[220px] mx-auto">
      {/* Grid levels */}
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={polygonPoints((level / levels) * maxR)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={level === 5 ? "1" : "0.5"}
          opacity={level === 5 ? 1 : 0.5}
        />
      ))}

      {/* Axis lines */}
      {angles.map((a, i) => {
        const [x, y] = polarToXY(a, maxR);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="var(--border)"
            strokeWidth="0.5"
            opacity="0.5"
          />
        );
      })}

      {/* Data fill */}
      {scores && (
        <polygon
          points={dataPoints}
          fill="url(#radarGradient)"
          fillOpacity="0.2"
          stroke="url(#radarStroke)"
          strokeWidth="2"
        />
      )}

      {/* Data dots */}
      {scores &&
        angles.map((a, i) => {
          const r = (scoreValues[i] / levels) * maxR;
          const [x, y] = polarToXY(a, r);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="var(--accent)"
              stroke="white"
              strokeWidth="1.5"
            />
          );
        })}

      {/* Labels */}
      {angles.map((a, i) => {
        const labelR = maxR + 16;
        const [x, y] = polarToXY(a, labelR);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-secondary text-[9px] font-medium"
          >
            {DIMENSIONS[i].abbr}
          </text>
        );
      })}

      {/* Score values at vertices */}
      {scores &&
        angles.map((a, i) => {
          const r = (scoreValues[i] / levels) * maxR;
          const [x, y] = polarToXY(a, r);
          const offsetY = y < cy ? -10 : 10;
          return (
            <text
              key={`v-${i}`}
              x={x}
              y={y + offsetY}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-accent text-[10px] font-bold"
            >
              {scoreValues[i]}
            </text>
          );
        })}

      {/* Gradient defs */}
      <defs>
        <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-violet)" />
        </linearGradient>
        <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-violet)" />
        </linearGradient>
      </defs>
    </svg>
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

  // Get the latest scores for the radar chart
  const latestScores = recentScores.length > 0 ? recentScores[recentScores.length - 1] : null;

  // Compute averages
  const avgScore = latestScores
    ? (
        (latestScores.technique_application +
          latestScores.tactical_awareness +
          latestScores.frame_control +
          latestScores.emotional_regulation +
          latestScores.strategic_outcome) / 5
      ).toFixed(1)
    : null;

  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex min-h-[85vh] flex-col items-center justify-center">
        {/* Title */}
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
          The Edge
        </h1>
        <p className="mb-8 font-mono text-sm tracking-widest text-secondary">
          DAY {loading ? "\u2014" : dayNumber}
        </p>

        {/* Pentagon radar chart card */}
        <div className="card mb-6 w-full max-w-sm">
          <h2 className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
            Performance Profile
          </h2>

          <PentagonRadar scores={latestScores} />

          {latestScores && avgScore && (
            <div className="mt-4 flex items-center justify-center gap-6 border-t border-border pt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-accent">{avgScore}</p>
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wider">Average</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{recentScores.length}</p>
                <p className="text-[10px] font-medium text-tertiary uppercase tracking-wider">Sessions</p>
              </div>
              {streakCount > 0 && (
                <>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <p className="text-2xl font-bold text-warning">{streakCount}</p>
                    <p className="text-[10px] font-medium text-tertiary uppercase tracking-wider">Streak</p>
                  </div>
                </>
              )}
            </div>
          )}

          {!latestScores && (
            <p className="mt-4 text-center text-sm text-tertiary">
              Complete your first session to see your profile
            </p>
          )}
        </div>

        {/* Session launcher — gradient CTA */}
        <button
          onClick={() => { if (online) router.push("/session"); }}
          disabled={!online}
          className="btn-gradient mb-6 w-full max-w-sm px-10 py-4 text-lg"
        >
          {online ? "Begin Session" : "Offline"}
        </button>

        {/* Streak / motivation */}
        {streakCount > 0 && (
          <p className="text-sm text-secondary">
            {streakCount} day streak — keep going
          </p>
        )}
        {streakCount === 0 && !loading && (
          <p className="text-sm text-tertiary">
            Start your streak today
          </p>
        )}
      </div>
    </main>
  );
}

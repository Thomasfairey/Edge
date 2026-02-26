"use client";

/**
 * Metacognitive trend dashboard — sparklines, trend arrows, recurring pattern card.
 * Only renders when 2+ sessions exist.
 */

import { SessionScores } from "@/lib/types";

interface ScoreEntry {
  day: number;
  date: string;
  scores: SessionScores;
  concept: string;
}

const DIMS: { key: keyof SessionScores; label: string; fullName: string }[] = [
  { key: "technique_application", label: "TA", fullName: "Technique Application" },
  { key: "tactical_awareness", label: "TW", fullName: "Tactical Awareness" },
  { key: "frame_control", label: "FC", fullName: "Frame Control" },
  { key: "emotional_regulation", label: "ER", fullName: "Emotional Regulation" },
  { key: "strategic_outcome", label: "SO", fullName: "Strategic Outcome" },
];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;

  const width = 80;
  const height = 28;
  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * innerW;
    const y = padding + innerH - ((v - 1) / 4) * innerH; // scale 1-5 to height
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current value dot */}
      {values.length > 0 && (() => {
        const lastX = padding + ((values.length - 1) / (values.length - 1)) * innerW;
        const lastY = padding + innerH - ((values[values.length - 1] - 1) / 4) * innerH;
        return <circle cx={lastX} cy={lastY} r={3} fill={color} />;
      })()}
    </svg>
  );
}

function trendArrow(values: number[]): { symbol: string; color: string } {
  if (values.length < 2) return { symbol: "\u2192", color: "#8E8C99" };

  // Compare average of last 2 vs previous entries
  const recent = values.slice(-2);
  const earlier = values.slice(0, -2);
  if (earlier.length === 0) {
    const diff = recent[1] - recent[0];
    if (diff > 0) return { symbol: "\u2191", color: "#6BC9A0" };
    if (diff < 0) return { symbol: "\u2193", color: "#E88B8B" };
    return { symbol: "\u2192", color: "#8E8C99" };
  }

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const diff = recentAvg - earlierAvg;

  if (diff > 0.3) return { symbol: "\u2191", color: "#6BC9A0" };
  if (diff < -0.3) return { symbol: "\u2193", color: "#E88B8B" };
  return { symbol: "\u2192", color: "#8E8C99" };
}

function scoreColor(score: number): string {
  if (score >= 4) return "#6BC9A0";
  if (score >= 3) return "#F5C563";
  return "#E88B8B";
}

export default function TrendDashboard({ allScores }: { allScores: ScoreEntry[] }) {
  if (allScores.length < 2) return null;

  // Calculate dimension averages and find weakest
  const dimStats = DIMS.map(({ key, label, fullName }) => {
    const values = allScores.map((e) => e.scores[key]);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const best = Math.max(...values);
    const current = values[values.length - 1];
    const trend = trendArrow(values);
    return { key, label, fullName, values, avg, best, current, trend };
  });

  const weakest = dimStats.reduce((a, b) => (a.avg < b.avg ? a : b));

  return (
    <div className="w-full max-w-sm space-y-4">
      {/* Sparkline table */}
      <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-soft)]">
        <p className="mb-4 text-sm font-semibold text-primary">Trend</p>
        <div className="space-y-3">
          {dimStats.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-7 text-xs font-medium text-secondary">{d.label}</span>
              <Sparkline values={d.values} color={scoreColor(d.current)} />
              <span
                className="w-6 text-center text-sm font-bold"
                style={{ color: scoreColor(d.current) }}
              >
                {d.current}
              </span>
              <span className="w-5 text-center text-base" style={{ color: d.trend.color }}>
                {d.trend.symbol}
              </span>
              <span className="text-xs text-tertiary">{d.best}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recurring pattern card */}
      <div className="rounded-3xl p-5 shadow-[var(--shadow-soft)]" style={{ backgroundColor: "#EEEDFF" }}>
        <p className="mb-1 text-xs font-medium text-[#5A52E0]">Growth edge</p>
        <p className="text-sm leading-relaxed text-primary">
          <strong>{weakest.fullName}</strong> is your lowest-scoring dimension
          (avg {weakest.avg.toFixed(1)}).
          {weakest.trend.symbol === "\u2191"
            ? " It\u2019s trending up \u2014 keep the pressure on."
            : weakest.trend.symbol === "\u2193"
            ? " It\u2019s trending down \u2014 this is where to focus."
            : " It\u2019s holding steady \u2014 time to push through."}
        </p>
      </div>
    </div>
  );
}

"use client";

/**
 * Metacognitive trend dashboard — sparklines, trend arrows, growth edge card.
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
  { key: "technique_application", label: "Technique", fullName: "Technique Application" },
  { key: "tactical_awareness", label: "Tactical", fullName: "Tactical Awareness" },
  { key: "frame_control", label: "Frame", fullName: "Frame Control" },
  { key: "emotional_regulation", label: "Regulation", fullName: "Emotional Regulation" },
  { key: "strategic_outcome", label: "Outcome", fullName: "Strategic Outcome" },
];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;

  const width = 88;
  const height = 32;
  const padding = 3;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * innerW;
    const y = padding + innerH - ((v - 1) / 4) * innerH;
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
      {values.length > 0 && (() => {
        const lastX = padding + ((values.length - 1) / (values.length - 1)) * innerW;
        const lastY = padding + innerH - ((values[values.length - 1] - 1) / 4) * innerH;
        return <circle cx={lastX} cy={lastY} r={3.5} fill={color} />;
      })()}
    </svg>
  );
}

function trendArrow(values: number[]): { symbol: string; color: string; delta: number } {
  if (values.length < 2) return { symbol: "\u2192", color: "var(--text-tertiary)", delta: 0 };

  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const diff = current - previous;

  if (diff > 0) return { symbol: "\u2191", color: "var(--score-high)", delta: diff };
  if (diff < 0) return { symbol: "\u2193", color: "var(--score-low)", delta: diff };
  return { symbol: "\u2192", color: "var(--text-tertiary)", delta: 0 };
}

function scoreColor(score: number): string {
  if (score >= 4) return "var(--score-high)";
  if (score >= 3) return "var(--score-mid)";
  return "var(--score-low)";
}

export default function TrendDashboard({ allScores }: { allScores: ScoreEntry[] }) {
  if (allScores.length < 2) return null;

  const dimStats = DIMS.map(({ key, label, fullName }) => {
    const values = allScores.map((e) => e.scores[key]);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const current = values[values.length - 1];
    const trend = trendArrow(values);
    return { key, label, fullName, values, avg, current, trend };
  });

  const weakest = dimStats.reduce((a, b) => (a.avg < b.avg ? a : b));

  return (
    <div className="w-full space-y-4">
      {/* Growth edge */}
      <div className="card-tinted" style={{ backgroundColor: "var(--accent-soft)", boxShadow: "0 4px 20px rgba(90,82,224,0.08)" }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-body"
            style={{ backgroundColor: "rgba(90,82,224,0.1)" }}
          >
            &#127919;
          </div>
          <p className="text-caption font-bold" style={{ color: "var(--accent)" }}>Today&apos;s focus</p>
        </div>
        <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <strong>{weakest.fullName}</strong> is your growth edge
          (avg {weakest.avg.toFixed(1)}/5).
          {weakest.trend.symbol === "\u2191"
            ? " Trending up \u2014 keep the pressure on."
            : weakest.trend.symbol === "\u2193"
            ? " Trending down \u2014 focus here today."
            : " Holding steady \u2014 time to push through."}
        </p>
      </div>

      {/* Sparkline table */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>Trend</p>
          <p className="text-caption" style={{ color: "var(--text-tertiary)" }}>Last {allScores.length} sessions</p>
        </div>
        <div className="space-y-4">
          {dimStats.map((d) => (
            <div key={d.key} className="flex items-center gap-2.5" title={d.fullName}>
              <span className="w-20 text-caption font-medium truncate" style={{ color: "var(--text-secondary)" }}>{d.label}</span>
              <Sparkline values={d.values} color={scoreColor(d.current)} />
              <span
                className="w-7 text-center text-body font-bold"
                style={{ color: scoreColor(d.current) }}
              >
                {d.current}
              </span>
              <span className="w-10 text-center text-caption font-medium" style={{ color: d.trend.color }}>
                {d.trend.symbol}{d.trend.delta !== 0 ? (d.trend.delta > 0 ? `+${d.trend.delta}` : d.trend.delta) : ""}
              </span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="mt-4 pt-4 flex items-center justify-center gap-5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--score-high)" }} />
            <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>Strong</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--score-mid)" }} />
            <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>Building</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--score-low)" }} />
            <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>Focus</span>
          </div>
        </div>
      </div>
    </div>
  );
}

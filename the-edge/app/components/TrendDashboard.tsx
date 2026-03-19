"use client";

/**
 * Metacognitive trend dashboard — sparklines, trend arrows, growth edge card.
 * Only renders when 2+ sessions exist.
 */

import { useMemo } from "react";
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

function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
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
    <svg
      width={width}
      height={height}
      className="flex-shrink-0"
      role="img"
      aria-label={`${label} trend: ${values.join(", ")}`}
    >
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

function trendArrow(values: number[]): { symbol: string; color: string; delta: number; textLabel: string } {
  if (values.length < 2) return { symbol: "\u2192", color: "var(--text-tertiary)", delta: 0, textLabel: "steady" };

  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const diff = current - previous;

  if (diff > 0) return { symbol: "\u2191", color: "var(--score-high)", delta: diff, textLabel: "up" };
  if (diff < 0) return { symbol: "\u2193", color: "var(--score-low)", delta: diff, textLabel: "down" };
  return { symbol: "\u2192", color: "var(--text-tertiary)", delta: 0, textLabel: "steady" };
}

function scoreColor(score: number): string {
  if (score >= 4) return "var(--score-high)";
  if (score >= 3) return "var(--score-mid)";
  return "var(--score-low)";
}

export default function TrendDashboard({ allScores }: { allScores: ScoreEntry[] }) {
  // Memoize dimension stats to avoid recalculation on re-renders
  const dimStats = useMemo(() => {
    if (allScores.length < 2) return [];
    return DIMS.map(({ key, label, fullName }) => {
      const values = allScores.map((e) => e.scores[key]);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const best = Math.max(...values);
      const current = values[values.length - 1];
      const trend = trendArrow(values);
      return { key, label, fullName, values, avg, best, current, trend };
    });
  }, [allScores]);

  if (allScores.length < 2 || dimStats.length === 0) return null;

  const weakest = dimStats.reduce((a, b) => (a.avg < b.avg ? a : b));

  return (
    <div className="w-full max-w-sm space-y-4" role="region" aria-label="Performance trends">
      {/* Growth edge -- most valuable insight, shown first */}
      <div className="card-tinted" style={{ backgroundColor: "var(--accent-soft)", boxShadow: "0 4px 20px rgba(90,82,224,0.08)" }}>
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-body"
            style={{ backgroundColor: "rgba(90,82,224,0.1)" }}
            aria-hidden="true"
          >
            &#127919;
          </div>
          <p className="text-caption font-bold" style={{ color: "var(--accent)" }}>Today&apos;s focus</p>
        </div>
        <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
          <strong>{weakest.fullName}</strong> is your growth edge
          (avg {weakest.avg.toFixed(1)}/5).
          {weakest.trend.textLabel === "up"
            ? " It\u2019s trending up \u2014 keep the pressure on."
            : weakest.trend.textLabel === "down"
            ? " It\u2019s trending down \u2014 this is where to focus."
            : " It\u2019s holding steady \u2014 time to push through."}
        </p>
      </div>

      {/* Sparkline table */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <p className="text-body font-semibold" style={{ color: "var(--text-primary)" }}>Trend</p>
          <p className="text-caption" style={{ color: "var(--text-tertiary)" }}>Last {allScores.length} sessions</p>
        </div>
        <div className="space-y-4" role="list" aria-label="Score trends by dimension">
          {dimStats.map((d) => (
            <div
              key={d.key}
              className="flex items-center gap-2.5"
              role="listitem"
              title={d.fullName}
              aria-label={`${d.fullName}: score ${d.current}, trending ${d.trend.textLabel}${d.trend.delta !== 0 ? ` by ${Math.abs(d.trend.delta)}` : ""}`}
            >
              <span className="w-20 text-caption font-medium truncate" style={{ color: "var(--text-secondary)" }}>{d.label}</span>
              <Sparkline values={d.values} color={scoreColor(d.current)} label={d.fullName} />
              <span
                className="w-7 text-center text-body font-bold"
                style={{ color: scoreColor(d.current) }}
              >
                {d.current}
              </span>
              <span
                className="w-10 text-center text-caption font-medium"
                style={{ color: d.trend.color }}
                aria-hidden="true"
              >
                {d.trend.symbol}{d.trend.delta !== 0 ? (d.trend.delta > 0 ? `+${d.trend.delta}` : d.trend.delta) : ""}
              </span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="mt-4 pt-4 flex items-center justify-center gap-5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--score-high)" }} aria-hidden="true" />
            <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>Strong (4-5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--score-mid)" }} aria-hidden="true" />
            <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>Building (3)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "var(--score-low)" }} aria-hidden="true" />
            <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>Focus area (1-2)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

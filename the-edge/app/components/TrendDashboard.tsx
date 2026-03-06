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
  { key: "technique_application", label: "Technique", fullName: "Technique Application" },
  { key: "tactical_awareness", label: "Tactical", fullName: "Tactical Awareness" },
  { key: "frame_control", label: "Frame", fullName: "Frame Control" },
  { key: "emotional_regulation", label: "Regulation", fullName: "Emotional Regulation" },
  { key: "strategic_outcome", label: "Outcome", fullName: "Strategic Outcome" },
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

function trendArrow(values: number[]): { symbol: string; color: string; delta: number } {
  if (values.length < 2) return { symbol: "\u2192", color: "#8E8C99", delta: 0 };

  // Compare latest score to previous score (most intuitive for users)
  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const diff = current - previous;

  if (diff > 0) return { symbol: "\u2191", color: "#6BC9A0", delta: diff };
  if (diff < 0) return { symbol: "\u2193", color: "#E88B8B", delta: diff };
  return { symbol: "\u2192", color: "#8E8C99", delta: 0 };
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
      {/* Growth edge — most valuable insight, shown first */}
      <div className="rounded-3xl p-5 shadow-[0_4px_20px_rgba(90,82,224,0.08)]" style={{ backgroundColor: "#EEEDFF" }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5A52E0]/10 text-sm">
            &#127919;
          </div>
          <p className="text-sm font-bold text-[#5A52E0]">Today&apos;s focus</p>
        </div>
        <p className="text-base leading-relaxed text-primary">
          <strong>{weakest.fullName}</strong> is your growth edge
          (avg {weakest.avg.toFixed(1)}/5).
          {weakest.trend.symbol === "\u2191"
            ? " It\u2019s trending up \u2014 keep the pressure on."
            : weakest.trend.symbol === "\u2193"
            ? " It\u2019s trending down \u2014 this is where to focus."
            : " It\u2019s holding steady \u2014 time to push through."}
        </p>
      </div>

      {/* Sparkline table */}
      <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-primary">Trend</p>
          <p className="text-[10px] text-tertiary">Last {allScores.length} sessions</p>
        </div>
        <div className="space-y-3">
          {dimStats.map((d) => (
            <div key={d.key} className="flex items-center gap-2" title={d.fullName}>
              <span className="w-20 text-xs font-medium text-secondary truncate">{d.label}</span>
              <Sparkline values={d.values} color={scoreColor(d.current)} />
              <span
                className="w-6 text-center text-sm font-bold"
                style={{ color: scoreColor(d.current) }}
              >
                {d.current}
              </span>
              <span className="w-10 text-center text-xs font-medium" style={{ color: d.trend.color }}>
                {d.trend.symbol}{d.trend.delta !== 0 ? (d.trend.delta > 0 ? `+${d.trend.delta}` : d.trend.delta) : ""}
              </span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="mt-3 pt-3 border-t border-[#F0EDE8] flex items-center justify-center gap-4">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#6BC9A0" }} />
            <span className="text-[10px] text-tertiary">Strong (4-5)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#F5C563" }} />
            <span className="text-[10px] text-tertiary">Building (3)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#E88B8B" }} />
            <span className="text-[10px] text-tertiary">Focus area (1-2)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

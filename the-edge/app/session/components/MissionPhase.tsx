"use client";

import type { Concept, SessionScores } from "./types";
import { SCORE_DIMS, scoreCircleColor, scoreTextColor } from "./types";

// ---------------------------------------------------------------------------
// Motivational lines
// ---------------------------------------------------------------------------

const IMPROVEMENT_LINES = [
  "The work is compounding.",
  "Momentum. Don\u2019t let it go.",
  "That\u2019s a gear shift. You\u2019re moving differently now.",
  "You wouldn\u2019t have scored this on Day 1.",
];

const MARGINAL_LINES = [
  "Marginal gains. Keep stacking.",
  "Small edge, big compound. This is how it works.",
  "Incremental. Relentless. That\u2019s the pattern.",
];

const STEADY_LINES = [
  "Holding steady. The next breakthrough is close.",
  "Plateaus precede breakthroughs. Keep pushing.",
  "Consistency is a weapon. You\u2019re wielding it.",
];

const DIP_LINES = [
  "Tougher session \u2014 that\u2019s where growth happens.",
  "Hard reps build the edge that easy reps can\u2019t.",
  "A dip today, a spike tomorrow. Stay in it.",
];

const HARD_DAY_LINES = [
  "Hard day. The best sessions often follow the worst.",
  "This is the session you\u2019ll look back on as a turning point.",
  "Discomfort is the price of growth. You paid it today.",
];

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getMotivationalLine(scores: SessionScores, previousScores: SessionScores | null): string {
  if (!previousScores) return "First session in the books. The baseline is set.";

  const currentAvg = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
  const prevAvg = Object.values(previousScores).reduce((a, b) => a + b, 0) / 5;
  const diff = currentAvg - prevAvg;

  if (diff > 0.5) return pick(IMPROVEMENT_LINES);
  if (diff > 0) return pick(MARGINAL_LINES);
  if (diff === 0) return pick(STEADY_LINES);
  if (diff > -0.5) return pick(DIP_LINES);
  return pick(HARD_DAY_LINES);
}

function getMilestoneLine(day: number): string | null {
  if (day === 7) return "One week complete. You\u2019ve built the foundation \u2014 most people quit by Day 3.";
  if (day === 14) return "Two weeks in. The concepts are starting to compound. You\u2019ll notice it in real conversations.";
  if (day === 21) return "21 days \u2014 the habit is forming. This is no longer a novelty, it\u2019s a practice.";
  if (day === 30) return "30 days. You\u2019ve completed a full cycle of The Edge. Very few make it here.";
  if (day === 50) return "50 sessions deep. The person who started this programme wouldn\u2019t recognise you now.";
  if (day % 10 === 0 && day > 30) return `Day ${day}. Still here. Still sharper than yesterday.`;
  return null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MissionPhaseProps {
  isLoading: boolean;
  mission: string | null;
  rationale: string | null;
  scores: SessionScores | null;
  previousScores: SessionScores | null;
  concept: Concept | null;
  dayNumber: number;
  keyMoment: string;
  showConfetti: boolean;
  completeSession: () => void;
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// MissionPhase — mission card + completion celebration
// ---------------------------------------------------------------------------

export default function MissionPhase({
  isLoading,
  mission,
  rationale,
  scores,
  previousScores,
  concept,
  dayNumber,
  keyMoment,
  showConfetti,
  completeSession,
  onDone,
}: MissionPhaseProps) {
  // Only render mission card when not in check-in flow and not showing check-in response
  // (those are handled by CheckinPhase)
  if (!mission || isLoading) return null;

  return (
    <div className="animate-challenge relative">
      <div className="text-center mb-5">
        <span className="badge" style={{ backgroundColor: "var(--score-high-bg)", color: "var(--score-high-text)" }}>
          Field assignment
        </span>
      </div>

      <div className="mb-5 card-tinted" style={{ backgroundColor: "var(--phase-deploy-tint)", padding: "24px" }}>
        {(() => {
          const sentenceEnd = mission.search(/[.!?]\s|[.!?]$/);
          if (sentenceEnd > 0 && sentenceEnd < mission.length - 1) {
            const headline = mission.slice(0, sentenceEnd + 1);
            const detail = mission.slice(sentenceEnd + 1).trim();
            return (
              <>
                <p className="text-lead font-bold leading-snug" style={{ color: "var(--text-primary)" }}>{headline}</p>
                {detail && <p className="mt-2 text-body leading-relaxed" style={{ color: "var(--text-primary)", opacity: 0.8 }}>{detail}</p>}
              </>
            );
          }
          return <p className="text-lead font-bold leading-relaxed" style={{ color: "var(--text-primary)" }}>{mission}</p>;
        })()}
        {rationale && (
          <>
            <div className="my-4" style={{ borderTop: "1px solid rgba(184,224,200,0.3)" }} />
            <p className="text-caption italic" style={{ color: "var(--text-secondary)" }}>{rationale}</p>
          </>
        )}
      </div>

      {!showConfetti ? (
        <button onClick={completeSession} className="btn-primary" style={{ backgroundColor: "var(--score-high)", boxShadow: "0 4px 16px rgba(107,201,160,0.3)" }}>
          Session complete &#10003;
        </button>
      ) : (
        <div className="animate-fade-in-up space-y-5 relative">
          <div className="card-tinted animate-celebrate" style={{ backgroundColor: "var(--score-high-bg)", padding: "28px 24px" }}>
            <p className="mb-1 text-center text-heading font-semibold" style={{ color: "var(--text-primary)" }}>
              Session complete
            </p>
            <p className="mb-3 text-center text-body" style={{ color: "var(--text-secondary)" }}>
              Day {dayNumber} &middot; {concept?.name}
            </p>

            {getMilestoneLine(dayNumber) && (
              <div className="mb-4 card-tinted text-center" style={{ backgroundColor: "var(--accent-soft)", padding: "12px 16px", borderRadius: "var(--radius-md)" }}>
                <p className="text-caption font-bold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>Milestone</p>
                <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{getMilestoneLine(dayNumber)}</p>
              </div>
            )}

            {scores && (
              <p className="mb-5 text-center text-caption font-medium" style={{ color: "var(--phase-deploy-muted)" }}>
                {getMotivationalLine(scores, previousScores)}
              </p>
            )}

            {keyMoment && (
              <div className="mb-5" style={{ backgroundColor: "rgba(255,255,255,0.6)", borderRadius: "var(--radius-md)", padding: "14px 16px" }}>
                <p className="text-caption font-semibold" style={{ color: "var(--text-secondary)" }}>Key takeaway</p>
                <p className="mt-1 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{keyMoment}</p>
              </div>
            )}

            {scores && (
              <div className="mb-5">
                <div className="flex items-center justify-center gap-3">
                  {SCORE_DIMS.map(({ key, fullName }) => {
                    const s = scores[key];
                    const prev = previousScores ? previousScores[key] : null;
                    const diff = prev !== null ? s - prev : null;
                    return (
                      <div key={key} className="flex flex-col items-center gap-1.5">
                        <div
                          className="flex items-center justify-center rounded-full text-body font-bold relative"
                          style={{ width: 44, height: 44, backgroundColor: scoreCircleColor(s), color: scoreTextColor(s) }}
                        >
                          {s}
                          {diff !== null && (
                            <span
                              className="absolute -top-1.5 -right-2 text-caption font-bold rounded-full px-1.5"
                              style={{
                                fontSize: 11,
                                color: diff > 0 ? "var(--score-high-text)" : diff < 0 ? "var(--score-low-text)" : "var(--text-secondary)",
                                backgroundColor: diff > 0 ? "var(--score-high-bg)" : diff < 0 ? "var(--score-low-bg)" : "var(--border)",
                              }}
                            >
                              {diff > 0 ? `+${diff}` : diff === 0 ? "=" : diff}
                            </span>
                          )}
                        </div>
                        <span className="text-caption" style={{ color: "var(--text-secondary)", fontSize: 11 }}>{fullName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {mission && (
              <div className="mb-4" style={{ borderRadius: "var(--radius-md)", border: "2px dashed var(--phase-deploy)", backgroundColor: "rgba(255,255,255,0.6)", padding: "14px 16px" }}>
                <p className="text-caption font-semibold" style={{ color: "var(--phase-deploy-muted)" }}>Your mission today</p>
                <p className="mt-1 text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{mission}</p>
              </div>
            )}

            {/* Share preview card */}
            <div className="mb-3" style={{ borderRadius: "var(--radius-md)", backgroundColor: "white", padding: "16px", boxShadow: "var(--shadow-sm)" }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-body font-bold" style={{ color: "var(--text-primary)" }}>
                    <span style={{ color: "var(--accent)" }}>the</span> edge
                  </p>
                  <p className="text-caption" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>Day {dayNumber}</p>
                </div>
                {scores && (
                  <div className="flex items-center gap-1">
                    <span className="text-lead font-bold" style={{ color: "var(--accent)" }}>
                      {(Object.values(scores).reduce((a, b) => a + b, 0) / 5).toFixed(1)}
                    </span>
                    <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>/5</span>
                  </div>
                )}
              </div>
              <p className="text-caption font-medium mb-2" style={{ color: "var(--text-primary)" }}>{concept?.name}</p>
              {scores && (
                <div className="flex gap-1.5 mb-2">
                  {SCORE_DIMS.map(({ key }) => {
                    const s = scores[key];
                    return (
                      <div key={key} className="h-2 flex-1 rounded-full" style={{
                        backgroundColor: s >= 4 ? "var(--score-high)" : s >= 3 ? "var(--score-mid)" : "var(--score-low)",
                      }} />
                    );
                  })}
                </div>
              )}
              {keyMoment && (
                <p className="text-caption italic truncate" style={{ color: "var(--text-secondary)" }}>{keyMoment}</p>
              )}
            </div>

            {/* Share button */}
            <button
              onClick={async () => {
                const avg = scores ? (Object.values(scores).reduce((a, b) => a + b, 0) / 5).toFixed(1) : null;
                const text = `${concept?.name ? `Today I practised ${concept.name}` : "The Edge"}${avg ? ` \u2014 scored ${avg}/5` : ""} on Day ${dayNumber}.\n${keyMoment ? `\nKey takeaway: ${keyMoment}\n` : ""}\nThe Edge \u2014 daily influence training\n${window.location.origin}`;

                try {
                  const canvas = document.createElement("canvas");
                  canvas.width = 600;
                  canvas.height = 400;
                  const ctx = canvas.getContext("2d");
                  if (ctx) {
                    ctx.fillStyle = "#FAF9F6";
                    ctx.beginPath();
                    if (ctx.roundRect) {
                      ctx.roundRect(0, 0, 600, 400, 24);
                    } else {
                      ctx.rect(0, 0, 600, 400);
                    }
                    ctx.fill();
                    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5A52E0";
                    ctx.fillRect(0, 0, 600, 6);
                    ctx.fillStyle = "#2D2B3D";
                    ctx.font = "bold 28px sans-serif";
                    ctx.fillText("the edge", 32, 48);
                    ctx.fillStyle = "#8E8C99";
                    ctx.font = "16px sans-serif";
                    ctx.fillText(`Day ${dayNumber}`, 32, 76);
                    ctx.fillStyle = "#2D2B3D";
                    ctx.font = "bold 20px sans-serif";
                    ctx.fillText(concept?.name || "", 32, 120);

                    if (scores) {
                      const dims = ["TA", "TW", "FC", "ER", "SO"];
                      const keys: (keyof SessionScores)[] = ["technique_application", "tactical_awareness", "frame_control", "emotional_regulation", "strategic_outcome"];
                      keys.forEach((k, i) => {
                        const s = scores[k];
                        const cx = 64 + i * 72;
                        const cy = 175;
                        ctx.beginPath();
                        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
                        ctx.fillStyle = scoreCircleColor(s);
                        ctx.fill();
                        ctx.fillStyle = scoreTextColor(s);
                        ctx.font = "bold 18px sans-serif";
                        ctx.textAlign = "center";
                        ctx.fillText(String(s), cx, cy + 6);
                        ctx.fillStyle = "#8E8C99";
                        ctx.font = "11px sans-serif";
                        ctx.fillText(dims[i], cx, cy + 40);
                      });
                      ctx.textAlign = "start";
                    }

                    if (keyMoment) {
                      ctx.fillStyle = "#8E8C99";
                      ctx.font = "13px sans-serif";
                      ctx.fillText("Key takeaway", 32, 250);
                      ctx.fillStyle = "#2D2B3D";
                      ctx.font = "14px sans-serif";
                      const words = keyMoment.split(" ");
                      let line = "";
                      let y = 270;
                      for (const word of words) {
                        const test = line + (line ? " " : "") + word;
                        if (ctx.measureText(test).width > 536) {
                          ctx.fillText(line, 32, y);
                          line = word;
                          y += 20;
                          if (y > 340) { ctx.fillText(line + "...", 32, y); line = ""; break; }
                        } else { line = test; }
                      }
                      if (line) ctx.fillText(line, 32, y);
                    }

                    ctx.fillStyle = "#B5B3BD";
                    ctx.font = "12px sans-serif";
                    ctx.fillText(window.location.hostname, 32, 384);

                    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
                    if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], "edge-session.png", { type: "image/png" })] })) {
                      await navigator.share({
                        text,
                        files: [new File([blob], "edge-session.png", { type: "image/png" })],
                      });
                      return;
                    }
                  }
                } catch {}

                if (navigator.share) {
                  navigator.share({ text }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(text).catch(() => {});
                }
              }}
              className="btn-secondary mb-2"
              style={{ borderColor: "var(--phase-deploy)", color: "var(--phase-deploy-muted)" }}
            >
              Share summary
            </button>
          </div>

          {/* Done button */}
          <button onClick={onDone} className="btn-primary">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Status API — returns current day, last entry, recent scores, streak, SR summary, and all scores.
 * GET /api/status
 * Returns { dayNumber, lastEntry, recentScores, streakCount, srSummary, allScores }
 */

import { NextResponse } from "next/server";
import { getLedger, getLastEntry, getLedgerCount } from "@/lib/ledger";
import { getSRSummary } from "@/lib/spaced-repetition";
import { SessionScores } from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { NextRequest } from "next/server";

function calculateStreak(entries: { date: string }[]): number {
  if (entries.length === 0) return 0;

  let streak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = new Date(entries[entries.length - 1].date);
  lastDate.setHours(0, 0, 0, 0);

  const diffFromToday = Math.floor(
    (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffFromToday > 1) return 0;

  for (let i = entries.length - 2; i >= 0; i--) {
    const current = new Date(entries[i + 1].date);
    const previous = new Date(entries[i].date);
    current.setHours(0, 0, 0, 0);
    previous.setHours(0, 0, 0, 0);
    const diff = Math.floor(
      (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff <= 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

async function handleGet() {
  const entries = getLedger();
  const lastEntry = getLastEntry();
  const dayNumber = getLedgerCount() + 1;

  // Get last 7 entries' scores
  const recentScores: SessionScores[] = entries
    .slice(-7)
    .map((e) => e.scores);

  const streakCount = calculateStreak(entries);

  // SR summary
  let srSummary = { totalConcepts: 0, dueForReview: 0, masteredCount: 0 };
  try {
    srSummary = getSRSummary();
  } catch {}

  // All scores for trend dashboard
  const allScores = entries.map((e) => ({
    day: e.day,
    date: e.date,
    scores: e.scores,
    concept: e.concept,
  }));

  return NextResponse.json({
    dayNumber,
    lastEntry,
    recentScores,
    streakCount,
    srSummary,
    allScores,
  });
}

export const GET = withRateLimit(
  (_req: NextRequest) => handleGet(),
  20
);

/**
 * Status API — returns current day, last entry, recent scores, streak, SR summary, and all scores.
 * GET /api/status
 * Returns { dayNumber, lastEntry, recentScores, streakCount, srSummary, allScores }
 */

import { NextResponse } from "next/server";
import { getLedger, getLastEntry, getLedgerCount } from "@/lib/ledger";
import { getSRSummary } from "@/lib/spaced-repetition";
import type { SessionScores } from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * Calculate streak using UTC dates to avoid timezone-induced miscounts.
 */
function calculateStreak(entries: { date: string }[]): number {
  if (entries.length === 0) return 0;

  let streak = 1;

  // Use UTC to avoid DST issues
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const lastDateStr = entries[entries.length - 1].date;
  const [y, m, d] = lastDateStr.split("-").map(Number);
  const lastMs = Date.UTC(y, m - 1, d);

  const diffFromToday = Math.floor((todayMs - lastMs) / (1000 * 60 * 60 * 24));
  if (diffFromToday > 1) return 0;

  for (let i = entries.length - 2; i >= 0; i--) {
    const [cy, cm, cd] = entries[i + 1].date.split("-").map(Number);
    const [py, pm, pd] = entries[i].date.split("-").map(Number);
    const currentMs = Date.UTC(cy, cm - 1, cd);
    const previousMs = Date.UTC(py, pm - 1, pd);
    const diff = Math.floor((currentMs - previousMs) / (1000 * 60 * 60 * 24));
    if (diff <= 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

async function handleGet(_req: NextRequest, userId: string | null) {
  try {
    const [entries, lastEntry, dayNumber, srSummary] = await Promise.all([
      getLedger(userId),
      getLastEntry(userId),
      getLedgerCount(userId).then((c) => c + 1),
      getSRSummary(userId).catch(() => ({ totalConcepts: 0, dueForReview: 0, masteredCount: 0 })),
    ]);

    // Get last 7 entries' scores
    const recentScores: SessionScores[] = entries
      .slice(-7)
      .map((e) => e.scores);

    const streakCount = calculateStreak(entries);

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
  } catch (error) {
    console.error("[status] Error:", error);
    return NextResponse.json(
      { error: "Failed to load status. Please try again." },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(withAuth(handleGet), 20);

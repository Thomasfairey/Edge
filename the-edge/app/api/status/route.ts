/**
 * Status API — returns current day, last entry, recent scores, and streak.
 * GET /api/status
 * Returns { dayNumber, lastEntry, recentScores, streakCount }
 */

import { NextResponse } from "next/server";
import { getLedger, getLastEntry, getLedgerCount } from "@/lib/ledger";
import { SessionScores } from "@/lib/types";

function calculateStreak(entries: { date: string }[]): number {
  if (entries.length === 0) return 0;

  let streak = 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = new Date(entries[entries.length - 1].date);
  lastDate.setHours(0, 0, 0, 0);

  // If the last session wasn't today or yesterday, streak is 0
  const diffFromToday = Math.floor(
    (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffFromToday > 1) return 0;

  // Walk backwards through entries counting consecutive days
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

export async function GET() {
  const entries = getLedger();
  const lastEntry = getLastEntry();
  const dayNumber = getLedgerCount() + 1;

  // Get last 7 entries' scores
  const recentScores: SessionScores[] = entries
    .slice(-7)
    .map((e) => e.scores);

  const streakCount = calculateStreak(entries);

  return NextResponse.json({
    dayNumber,
    lastEntry,
    recentScores,
    streakCount,
  });
}

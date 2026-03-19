/**
 * Simplified SM-2 spaced repetition engine.
 * Tracks concept mastery across sessions using Supabase.
 * All queries scoped by user_id when provided.
 */

import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export interface SREntry {
  conceptId: string;
  lastPracticed: string; // ISO date
  easeFactor: number; // starts at 2.5
  interval: number; // days until next review
  nextReview: string; // ISO date
  practiceCount: number;
  lastScoreAvg: number;
}

interface SRRow {
  id: number;
  concept_id: string;
  last_practiced: string;
  ease_factor: number;
  interval: number;
  next_review: string;
  practice_count: number;
  last_score_avg: number;
  user_id?: string;
}

function rowToEntry(row: SRRow): SREntry {
  return {
    conceptId: row.concept_id,
    lastPracticed: row.last_practiced,
    easeFactor: Number(row.ease_factor),
    interval: row.interval,
    nextReview: row.next_review,
    practiceCount: row.practice_count,
    lastScoreAvg: Number(row.last_score_avg),
  };
}

/** Calculate next review date as ISO string */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

export async function getSRData(userId?: string | null): Promise<SREntry[]> {
  // Guard: without userId, return empty to prevent leaking all users' data
  if (!userId) return [];

  const query = supabase
    .from("spaced_repetition")
    .select("*")
    .eq("user_id", userId);

  const { data, error } = await query;

  if (error) {
    logger.error("Failed to read SR data", { phase: "sr", error: error.message });
    return [];
  }
  return (data as SRRow[]).map(rowToEntry);
}

/**
 * Update SR entry after a session.
 * SM-2 variant:
 * - avg >= 4 → ease * 1.3, interval * ease (mastery)
 * - avg >= 3 → interval * ease (competent)
 * - avg < 3 → ease * 0.8, interval = 1 (needs review)
 */
export async function updateSREntry(conceptId: string, scores: { [key: string]: number }, userId?: string | null): Promise<void> {
  const values = Object.values(scores);
  if (values.length === 0) {
    logger.warn("updateSREntry called with empty scores — skipping", { phase: "sr" });
    return;
  }
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const today = new Date().toISOString().split("T")[0];

  // Check if entry exists
  let existingQuery = supabase
    .from("spaced_repetition")
    .select("*")
    .eq("concept_id", conceptId)
    .limit(1);

  if (userId) existingQuery = existingQuery.eq("user_id", userId);

  const { data: existing } = await existingQuery;

  if (existing && existing.length > 0) {
    const row = existing[0] as SRRow;
    let easeFactor = Number(row.ease_factor);
    let interval = row.interval;

    if (avg >= 4) {
      easeFactor = Math.min(easeFactor + 0.15, 3.0);
      interval = Math.min(Math.round(interval * easeFactor), 180);
    } else if (avg >= 3) {
      interval = Math.min(Math.round(interval * easeFactor), 180);
    } else {
      easeFactor = Math.max(easeFactor - 0.3, 1.3);
      interval = 1;
    }

    // Ensure interval is at least 1 and reasonable
    interval = Math.max(1, Math.min(interval, 365));

    const { error } = await supabase
      .from("spaced_repetition")
      .update({
        last_practiced: today,
        practice_count: row.practice_count + 1,
        last_score_avg: Math.round(avg * 10) / 10,
        ease_factor: Math.round(easeFactor * 100) / 100,
        interval,
        next_review: addDays(today, interval),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) logger.error("Failed to update SR entry", { phase: "sr", error: error.message });
  } else {
    const initialInterval = avg >= 4 ? 7 : avg >= 3 ? 3 : 1;

    const insertData: Record<string, unknown> = {
      concept_id: conceptId,
      last_practiced: today,
      ease_factor: 2.5,
      interval: initialInterval,
      next_review: addDays(today, initialInterval),
      practice_count: 1,
      last_score_avg: Math.round(avg * 10) / 10,
    };
    if (userId) insertData.user_id = userId;

    const { error } = await supabase
      .from("spaced_repetition")
      .insert(insertData);

    if (error) logger.error("Failed to insert SR entry", { phase: "sr", error: error.message });
  }
}

/**
 * Get concepts due for review (nextReview <= today).
 */
export async function getDueReviews(userId?: string | null): Promise<SREntry[]> {
  // Guard: without userId, return empty to prevent leaking all users' data
  if (!userId) return [];

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("spaced_repetition")
    .select("*")
    .eq("user_id", userId)
    .lte("next_review", today)
    .order("next_review", { ascending: true });

  if (error || !data) return [];
  return (data as SRRow[]).map(rowToEntry);
}

/**
 * Get SR summary stats for the status API.
 */
export async function getSRSummary(userId?: string | null): Promise<{
  totalConcepts: number;
  dueForReview: number;
  masteredCount: number;
}> {
  const data = await getSRData(userId);
  const today = new Date().toISOString().split("T")[0];

  return {
    totalConcepts: data.length,
    dueForReview: data.filter((e) => e.nextReview <= today).length,
    masteredCount: data.filter((e) => e.easeFactor >= 3.5 && e.practiceCount >= 3).length,
  };
}

/**
 * Simplified SM-2 spaced repetition engine.
 * Tracks concept mastery across sessions using Supabase.
 */

import { supabase } from "@/lib/supabase";

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

export async function getSRData(): Promise<SREntry[]> {
  const { data, error } = await supabase
    .from("spaced_repetition")
    .select("*");

  if (error) {
    console.error("[sr] Failed to read:", error.message);
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
export async function updateSREntry(conceptId: string, scores: { [key: string]: number }): Promise<void> {
  const values = Object.values(scores);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const today = new Date().toISOString().split("T")[0];

  // Check if entry exists
  const { data: existing } = await supabase
    .from("spaced_repetition")
    .select("*")
    .eq("concept_id", conceptId)
    .limit(1);

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

    const next = new Date(today);
    next.setDate(next.getDate() + interval);

    const { error } = await supabase
      .from("spaced_repetition")
      .update({
        last_practiced: today,
        practice_count: row.practice_count + 1,
        last_score_avg: Math.round(avg * 10) / 10,
        ease_factor: Math.round(easeFactor * 100) / 100,
        interval,
        next_review: next.toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      })
      .eq("concept_id", conceptId);

    if (error) console.error("[sr] Failed to update:", error.message);
  } else {
    const initialInterval = avg >= 4 ? 7 : avg >= 3 ? 3 : 1;
    const next = new Date(today);
    next.setDate(next.getDate() + initialInterval);

    const { error } = await supabase
      .from("spaced_repetition")
      .insert({
        concept_id: conceptId,
        last_practiced: today,
        ease_factor: 2.5,
        interval: initialInterval,
        next_review: next.toISOString().split("T")[0],
        practice_count: 1,
        last_score_avg: Math.round(avg * 10) / 10,
      });

    if (error) console.error("[sr] Failed to insert:", error.message);
  }
}

/**
 * Get concepts due for review (nextReview <= today).
 */
export async function getDueReviews(): Promise<SREntry[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("spaced_repetition")
    .select("*")
    .lte("next_review", today)
    .order("next_review", { ascending: true });

  if (error || !data) return [];
  return (data as SRRow[]).map(rowToEntry);
}

/**
 * Get SR summary stats for the status API.
 */
export async function getSRSummary(): Promise<{
  totalConcepts: number;
  dueForReview: number;
  masteredCount: number;
}> {
  const data = await getSRData();
  const today = new Date().toISOString().split("T")[0];

  return {
    totalConcepts: data.length,
    dueForReview: data.filter((e) => e.nextReview <= today).length,
    masteredCount: data.filter((e) => e.easeFactor >= 3.5 && e.practiceCount >= 3).length,
  };
}

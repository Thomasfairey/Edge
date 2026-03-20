/**
 * SM-2 Spaced Repetition service — per-user concept mastery tracking.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { SREntry } from "../types/domain.js";

interface SRRow {
  id: number;
  user_id: string;
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

export async function getSRData(
  db: SupabaseClient,
  userId: string
): Promise<SREntry[]> {
  const { data, error } = await db
    .from("spaced_repetition")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.log(JSON.stringify({ level: "error", service: "spaced-rep", operation: "read", message: error.message, timestamp: new Date().toISOString() }));
    return [];
  }
  return (data as SRRow[]).map(rowToEntry);
}

export async function updateSREntry(
  db: SupabaseClient,
  userId: string,
  conceptId: string,
  scores: Record<string, number>
): Promise<void> {
  const values = Object.values(scores);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const today = new Date().toISOString().split("T")[0];

  const { data: existing } = await db
    .from("spaced_repetition")
    .select("*")
    .eq("user_id", userId)
    .eq("concept_id", conceptId)
    .limit(1);

  if (existing && existing.length > 0) {
    const row = existing[0] as SRRow;
    let easeFactor = Number(row.ease_factor);
    let interval = row.interval;

    if (avg >= 4) {
      easeFactor = Math.min(easeFactor * 1.3, 5);
      interval = Math.round(interval * easeFactor);
      interval = Math.max(1, interval);
    } else if (avg >= 3) {
      interval = Math.round(interval * easeFactor);
      interval = Math.max(1, interval);
    } else {
      easeFactor = Math.max(easeFactor * 0.8, 1.3);
      interval = 1;
    }

    const next = new Date(today);
    next.setDate(next.getDate() + interval);

    const { data: updated, error: updateError } = await db
      .from("spaced_repetition")
      .update({
        last_practiced: today,
        practice_count: row.practice_count + 1,
        last_score_avg: Math.round(avg * 10) / 10,
        ease_factor: Math.round(easeFactor * 100) / 100,
        interval,
        next_review: next.toISOString().split("T")[0],
      })
      .eq("user_id", userId)
      .eq("concept_id", conceptId)
      .eq("practice_count", row.practice_count) // Optimistic lock: only update if unchanged
      .select("id");

    // If optimistic lock failed (concurrent update), re-read and retry once
    if (!updateError && (!updated || updated.length === 0)) {
      console.log(JSON.stringify({ level: "warn", service: "spaced-rep", operation: "update_retry", conceptId, timestamp: new Date().toISOString() }));
      const { data: fresh } = await db
        .from("spaced_repetition")
        .select("*")
        .eq("user_id", userId)
        .eq("concept_id", conceptId)
        .limit(1);
      if (fresh && fresh.length > 0) {
        const freshRow = fresh[0] as SRRow;
        await db
          .from("spaced_repetition")
          .update({
            last_practiced: today,
            practice_count: freshRow.practice_count + 1,
            last_score_avg: Math.round(avg * 10) / 10,
            ease_factor: Math.round(easeFactor * 100) / 100,
            interval,
            next_review: next.toISOString().split("T")[0],
          })
          .eq("user_id", userId)
          .eq("concept_id", conceptId);
      }
    }
  } else {
    const initialInterval = avg >= 4 ? 7 : avg >= 3 ? 3 : 1;
    const next = new Date(today);
    next.setDate(next.getDate() + initialInterval);

    await db.from("spaced_repetition").insert({
      user_id: userId,
      concept_id: conceptId,
      last_practiced: today,
      ease_factor: 2.5,
      interval: initialInterval,
      next_review: next.toISOString().split("T")[0],
      practice_count: 1,
      last_score_avg: Math.round(avg * 10) / 10,
    });
  }
}

export async function getDueReviews(
  db: SupabaseClient,
  userId: string
): Promise<SREntry[]> {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await db
    .from("spaced_repetition")
    .select("*")
    .eq("user_id", userId)
    .lte("next_review", today)
    .order("next_review", { ascending: true });

  if (error || !data) return [];
  return (data as SRRow[]).map(rowToEntry);
}

export async function getSRSummary(
  db: SupabaseClient,
  userId: string
): Promise<{ totalConcepts: number; dueForReview: number; masteredCount: number }> {
  const data = await getSRData(db, userId);
  const today = new Date().toISOString().split("T")[0];

  return {
    totalConcepts: data.length,
    dueForReview: data.filter((e) => e.nextReview <= today).length,
    masteredCount: data.filter((e) => e.easeFactor >= 3.5 && e.practiceCount >= 3).length,
  };
}

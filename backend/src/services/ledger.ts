/**
 * Nuance Ledger service — per-user ledger operations with RLS.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { LedgerEntry, SessionScores } from "../types/domain.js";

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface LedgerRow {
  id: number;
  user_id: string;
  day: number;
  date: string;
  concept: string;
  domain: string;
  character: string;
  difficulty: number;
  score_technique_application: number;
  score_tactical_awareness: number;
  score_frame_control: number;
  score_emotional_regulation: number;
  score_strategic_outcome: number;
  behavioral_weakness_summary: string;
  key_moment: string;
  mission: string;
  mission_outcome: string;
  commands_used: string[];
  session_completed: boolean;
}

function rowToEntry(row: LedgerRow): LedgerEntry {
  return {
    day: row.day,
    date: row.date,
    concept: row.concept,
    domain: row.domain,
    character: row.character,
    difficulty: row.difficulty,
    scores: {
      technique_application: row.score_technique_application,
      tactical_awareness: row.score_tactical_awareness,
      frame_control: row.score_frame_control,
      emotional_regulation: row.score_emotional_regulation,
      strategic_outcome: row.score_strategic_outcome,
    },
    behavioral_weakness_summary: row.behavioral_weakness_summary,
    key_moment: row.key_moment,
    mission: row.mission,
    mission_outcome: row.mission_outcome,
    commands_used: row.commands_used,
    session_completed: row.session_completed,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getLedger(
  db: SupabaseClient,
  userId: string
): Promise<LedgerEntry[]> {
  const { data, error } = await db
    .from("ledger")
    .select("*")
    .eq("user_id", userId)
    .order("day", { ascending: true });

  if (error) {
    console.error("[ledger] Failed to read:", error.message);
    return [];
  }
  return (data as LedgerRow[]).map(rowToEntry);
}

export async function appendEntry(
  db: SupabaseClient,
  userId: string,
  entry: LedgerEntry
): Promise<void> {
  const { error } = await db.from("ledger").insert({
    user_id: userId,
    day: entry.day,
    date: entry.date,
    concept: entry.concept,
    domain: entry.domain,
    character: entry.character,
    difficulty: entry.difficulty,
    score_technique_application: entry.scores.technique_application,
    score_tactical_awareness: entry.scores.tactical_awareness,
    score_frame_control: entry.scores.frame_control,
    score_emotional_regulation: entry.scores.emotional_regulation,
    score_strategic_outcome: entry.scores.strategic_outcome,
    behavioral_weakness_summary: entry.behavioral_weakness_summary,
    key_moment: entry.key_moment,
    mission: entry.mission,
    mission_outcome: entry.mission_outcome,
    commands_used: entry.commands_used,
    session_completed: entry.session_completed,
  });

  if (error) {
    console.error("[ledger] Failed to write:", error.message);
    throw new Error(`Ledger write failed: ${error.message}`);
  }
}

export async function getLastEntry(
  db: SupabaseClient,
  userId: string
): Promise<LedgerEntry | null> {
  const { data, error } = await db
    .from("ledger")
    .select("*")
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return rowToEntry(data[0] as LedgerRow);
}

export async function updateLastMissionOutcome(
  db: SupabaseClient,
  userId: string,
  outcome: string
): Promise<void> {
  const { data } = await db
    .from("ledger")
    .select("id")
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return;

  const { error } = await db
    .from("ledger")
    .update({ mission_outcome: outcome })
    .eq("id", data[0].id)
    .eq("user_id", userId);

  if (error) {
    console.error("[ledger] Failed to update mission_outcome:", error.message);
  }
}

export async function serialiseForPrompt(
  db: SupabaseClient,
  userId: string,
  count: number = 7
): Promise<string> {
  const { data, error } = await db
    .from("ledger")
    .select("*")
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(count);

  if (error || !data || data.length === 0) {
    return "No prior sessions recorded.";
  }

  const entries = (data as LedgerRow[]).reverse().map(rowToEntry);
  const lines = entries.map((e) => {
    const missionPart =
      e.mission_outcome && e.mission_outcome !== ""
        ? ` | Mission outcome: ${e.mission_outcome}`
        : "";
    return `- **Day ${e.day} — ${e.concept}:** ${e.behavioral_weakness_summary}${missionPart}`;
  });

  return `## Recent Session History\n\n${lines.join("\n\n")}`;
}

export async function getCompletedConcepts(
  db: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await db
    .from("ledger")
    .select("concept")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data.map((e: { concept: string }) => e.concept);
}

export async function getLedgerCount(
  db: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await db
    .from("ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return 0;
  return count ?? 0;
}

export async function getRecentScores(
  db: SupabaseClient,
  userId: string,
  limit: number = 7
): Promise<Array<{ day: number; scores: SessionScores }>> {
  const { data, error } = await db
    .from("ledger")
    .select("day, score_technique_application, score_tactical_awareness, score_frame_control, score_emotional_regulation, score_strategic_outcome")
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.reverse().map((row: Record<string, number>) => ({
    day: row.day,
    scores: {
      technique_application: row.score_technique_application,
      tactical_awareness: row.score_tactical_awareness,
      frame_control: row.score_frame_control,
      emotional_regulation: row.score_emotional_regulation,
      strategic_outcome: row.score_strategic_outcome,
    },
  }));
}

/**
 * Calculate the user's current streak (consecutive days with completed sessions).
 */
export async function getStreakCount(
  db: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await db
    .from("ledger")
    .select("date")
    .eq("user_id", userId)
    .eq("session_completed", true)
    .order("date", { ascending: false });

  if (error || !data || data.length === 0) return 0;

  let streak = 1;
  const today = new Date().toISOString().split("T")[0];
  const lastDate = data[0].date;

  // If last session wasn't today or yesterday, streak is broken
  const diffFromToday = Math.floor(
    (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000
  );
  if (diffFromToday > 1) return 0;

  for (let i = 1; i < data.length; i++) {
    const prev = new Date(data[i - 1].date);
    const curr = new Date(data[i].date);
    const diff = Math.floor((prev.getTime() - curr.getTime()) / 86400000);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

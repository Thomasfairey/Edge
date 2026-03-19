/**
 * Nuance Ledger — persistence via Supabase.
 *
 * The ledger is the longitudinal memory of The Edge. Each session appends
 * one entry. The serialisation function compresses entries into clean markdown
 * for prompt injection.
 *
 * All queries are scoped by user_id when provided.
 * Reference: PRD Section 4.4, Appendix B
 */

import { supabase } from "@/lib/supabase";
import { LedgerEntry } from "@/lib/types";

// ---------------------------------------------------------------------------
// Row ↔ LedgerEntry mapping
// ---------------------------------------------------------------------------

interface LedgerRow {
  id: number;
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
  user_id?: string;
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

function entryToRow(entry: LedgerEntry, userId?: string | null): Omit<LedgerRow, "id"> {
  const row: Omit<LedgerRow, "id"> = {
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
  };
  if (userId) row.user_id = userId;
  return row;
}

// ---------------------------------------------------------------------------
// Public API (async — callers must await)
// ---------------------------------------------------------------------------

/**
 * Read all ledger entries from Supabase, ordered by day ascending.
 */
export async function getLedger(userId?: string | null): Promise<LedgerEntry[]> {
  let query = supabase
    .from("ledger")
    .select("*")
    .order("day", { ascending: true });

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error) {
    console.error("[ledger] Failed to read:", error.message);
    return [];
  }
  return (data as LedgerRow[]).map(rowToEntry);
}

/**
 * Append a new entry to the ledger.
 */
export async function appendEntry(entry: LedgerEntry, userId?: string | null): Promise<void> {
  const { error } = await supabase
    .from("ledger")
    .insert(entryToRow(entry, userId));

  if (error) {
    console.error("[ledger] Failed to write:", error.message);
  }
}

/**
 * Return the most recent ledger entry, or null if empty.
 */
export async function getLastEntry(userId?: string | null): Promise<LedgerEntry | null> {
  let query = supabase
    .from("ledger")
    .select("*")
    .order("day", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error || !data || data.length === 0) return null;
  return rowToEntry(data[0] as LedgerRow);
}

/**
 * Update the mission_outcome of the most recent entry.
 */
export async function updateLastMissionOutcome(outcome: string, userId?: string | null): Promise<void> {
  let query = supabase
    .from("ledger")
    .select("id")
    .order("day", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);

  const { data } = await query;

  if (!data || data.length === 0) return;

  const { error } = await supabase
    .from("ledger")
    .update({ mission_outcome: outcome })
    .eq("id", data[0].id);

  if (error) {
    console.error("[ledger] Failed to update mission_outcome:", error.message);
  }
}

/**
 * Serialise the last `count` entries into clean markdown for prompt injection.
 */
export async function serialiseForPrompt(count: number = 7, userId?: string | null): Promise<string> {
  let query = supabase
    .from("ledger")
    .select("*")
    .order("day", { ascending: false })
    .limit(count);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

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

/**
 * Return concept names from all ledger entries (for de-duplication).
 */
export async function getCompletedConcepts(userId?: string | null): Promise<string[]> {
  let query = supabase
    .from("ledger")
    .select("concept");

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error || !data) return [];
  return data.map((e: { concept: string }) => e.concept);
}

/**
 * Return the total number of ledger entries.
 */
export async function getLedgerCount(userId?: string | null): Promise<number> {
  let query = supabase
    .from("ledger")
    .select("id", { count: "exact", head: true });

  if (userId) query = query.eq("user_id", userId);

  const { count, error } = await query;

  if (error) return 0;
  return count ?? 0;
}

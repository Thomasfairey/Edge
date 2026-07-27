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
import { DEFAULT_DIMENSION_SET } from "@/lib/scoring-dimensions";
import { logger } from "@/lib/logger";

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
  scores: Record<string, number> | null;
  dimension_set: string | null;
  behavioral_weakness_summary: string;
  key_moment: string;
  mission: string;
  mission_cue: string | null;
  mission_action: string | null;
  mission_commitment: string | null;
  mission_outcome: string;
  mission_opportunity: boolean | null;
  mission_enacted: string | null;
  commands_used: string[];
  session_completed: boolean;
  character_id: string | null;
  context: string | null;
  scenario_summary: string | null;
  shape_id: string | null;
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
    scores: row.scores ?? {},
    dimension_set: row.dimension_set ?? DEFAULT_DIMENSION_SET,
    behavioral_weakness_summary: row.behavioral_weakness_summary,
    key_moment: row.key_moment,
    mission: row.mission,
    mission_cue: row.mission_cue ?? null,
    mission_action: row.mission_action ?? null,
    mission_commitment: row.mission_commitment ?? null,
    mission_outcome: row.mission_outcome,
    mission_opportunity: row.mission_opportunity ?? null,
    mission_enacted: (row.mission_enacted as LedgerEntry["mission_enacted"]) ?? null,
    commands_used: row.commands_used,
    session_completed: row.session_completed,
    character_id: row.character_id ?? null,
    context: (row.context as LedgerEntry["context"]) ?? null,
    scenario_summary: row.scenario_summary ?? null,
    shape_id: row.shape_id ?? null,
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
    scores: entry.scores,
    dimension_set: entry.dimension_set,
    behavioral_weakness_summary: entry.behavioral_weakness_summary,
    key_moment: entry.key_moment,
    mission: entry.mission,
    mission_cue: entry.mission_cue ?? null,
    mission_action: entry.mission_action ?? null,
    mission_commitment: entry.mission_commitment ?? null,
    mission_outcome: entry.mission_outcome,
    mission_opportunity: entry.mission_opportunity ?? null,
    mission_enacted: entry.mission_enacted ?? null,
    commands_used: entry.commands_used,
    session_completed: entry.session_completed,
    character_id: entry.character_id ?? null,
    context: entry.context ?? null,
    scenario_summary: entry.scenario_summary ?? null,
    shape_id: entry.shape_id ?? null,
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
    logger.error(`Failed to read: ${error.message}`, { phase: "ledger" });
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
    throw new Error(`Ledger write failed: ${error.message}`);
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
 * Update the mission outcome of the most recent entry.
 *
 * `structured` carries the two facts the prose cannot: whether the cue occurred
 * at all, and whether the user acted on it. Those are the product's real
 * outcome measures, and keeping them apart from the free text is what stops a
 * mission that never got its moment being counted as a failure.
 */
export async function updateLastMissionOutcome(
  outcome: string,
  userId?: string | null,
  structured?: { opportunity?: boolean | null; enacted?: string | null }
): Promise<void> {
  let query = supabase
    .from("ledger")
    .select("id")
    .order("day", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);

  const { data } = await query;

  if (!data || data.length === 0) return;

  const patch: Record<string, unknown> = { mission_outcome: outcome };
  if (structured) {
    if (structured.opportunity !== undefined) patch.mission_opportunity = structured.opportunity;
    if (structured.enacted !== undefined) patch.mission_enacted = structured.enacted;
  }

  let updateQuery = supabase
    .from("ledger")
    .update(patch)
    .eq("id", data[0].id);

  // Defence-in-depth: re-filter by user_id on updates, not just the initial SELECT
  if (userId) updateQuery = updateQuery.eq("user_id", userId);

  const { error } = await updateQuery;

  if (error) {
    logger.error(`Failed to update mission_outcome: ${error.message}`, { phase: "ledger" });
  }
}

/**
 * Record when the user said they would run the most recent mission.
 *
 * Written after the row exists, because the mission is generated before the
 * user chooses a when.
 */
export async function updateLastMissionCommitment(
  commitment: string,
  userId?: string | null
): Promise<void> {
  let query = supabase
    .from("ledger")
    .select("id")
    .order("day", { ascending: false })
    .limit(1);

  if (userId) query = query.eq("user_id", userId);

  const { data } = await query;
  if (!data || data.length === 0) return;

  let updateQuery = supabase
    .from("ledger")
    .update({ mission_commitment: commitment })
    .eq("id", data[0].id);

  if (userId) updateQuery = updateQuery.eq("user_id", userId);

  const { error } = await updateQuery;
  if (error) {
    logger.error(`Failed to update mission_commitment: ${error.message}`, { phase: "ledger" });
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
 * Concept names from every ledger entry, oldest first, duplicates kept.
 *
 * Order matters and is explicit: selection reads backwards from the end to find
 * which concept is mid-practice and which domains are stale, and repeats are
 * the signal for how far through a concept's three sessions the user is. An
 * unordered read made both of those quietly wrong.
 */
export async function getCompletedConcepts(userId?: string | null): Promise<string[]> {
  let query = supabase
    .from("ledger")
    .select("concept")
    .order("day", { ascending: true });

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error || !data) return [];
  return data.map((e: { concept: string }) => e.concept);
}

/**
 * Return the last `count` entries, most recent first.
 *
 * History-aware selection needs a handful of recent sessions, not the whole
 * ledger — getLedger() pulls every row a user has ever written.
 */
export async function getRecentEntries(
  count: number = 5,
  userId?: string | null
): Promise<LedgerEntry[]> {
  let query = supabase
    .from("ledger")
    .select("*")
    .order("day", { ascending: false })
    .limit(count);

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;

  if (error || !data) {
    if (error) {
      logger.error(`Failed to read recent entries: ${error.message}`, { phase: "ledger" });
    }
    return [];
  }
  return (data as LedgerRow[]).map(rowToEntry);
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

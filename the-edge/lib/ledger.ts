/**
 * Nuance Ledger — persistence and serialisation.
 * JSON file storage at data/ledger.json.
 *
 * The ledger is the longitudinal memory of The Edge. Each session appends
 * one entry. The serialisation function compresses entries into clean markdown
 * for prompt injection, reducing ~1,400 tokens (raw JSON for 7 entries) to
 * ~500 tokens while preserving all behavioural nuance.
 *
 * Reference: PRD Section 4.4, Appendix B
 */

import fs from "fs";
import path from "path";
import { LedgerEntry } from "@/lib/types";

const LEDGER_PATH = path.join(process.cwd(), "data", "ledger.json");

/**
 * Ensure the data directory and ledger file exist on disk.
 */
function ensureFile(): void {
  const dir = path.dirname(LEDGER_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LEDGER_PATH)) {
    fs.writeFileSync(LEDGER_PATH, "[]", "utf-8");
  }
}

/**
 * Read all ledger entries from disk.
 * If the file doesn't exist, creates it with an empty array and returns [].
 */
export function getLedger(): LedgerEntry[] {
  try {
    ensureFile();
    const raw = fs.readFileSync(LEDGER_PATH, "utf-8");
    return JSON.parse(raw) as LedgerEntry[];
  } catch {
    // Corrupted file — reset gracefully
    fs.writeFileSync(LEDGER_PATH, "[]", "utf-8");
    return [];
  }
}

/**
 * Append a new entry to the ledger and write to disk.
 */
export function appendEntry(entry: LedgerEntry): void {
  const entries = getLedger();
  entries.push(entry);
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * Return the most recent ledger entry, or null if the ledger is empty.
 */
export function getLastEntry(): LedgerEntry | null {
  const entries = getLedger();
  if (entries.length === 0) return null;
  return entries[entries.length - 1];
}

/**
 * Serialise the last `count` entries into clean markdown for prompt injection.
 *
 * Extracts ONLY: day, concept, behavioral_weakness_summary, mission_outcome.
 * All other fields (date, character, difficulty, scores, key_moment,
 * commands_used, session_completed) are excluded to save tokens.
 *
 * PRD Section 4.4: reduces ~1,400 tokens to ~500 for 7 entries.
 */
export function serialiseForPrompt(count: number = 7): string {
  const entries = getLedger();
  if (entries.length === 0) {
    return "No prior sessions recorded.";
  }

  const recent = entries.slice(-count);

  const lines = recent.map((e) => {
    const missionPart =
      e.mission_outcome && e.mission_outcome !== ""
        ? ` | Mission outcome: ${e.mission_outcome}`
        : "";
    return `- **Day ${e.day} — ${e.concept}:** ${e.behavioral_weakness_summary}${missionPart}`;
  });

  return `## Recent Session History\n\n${lines.join("\n\n")}`;
}

/**
 * Return concept IDs from all ledger entries. Used for de-duplication
 * so the concept selector avoids repeats.
 */
export function getCompletedConcepts(): string[] {
  return getLedger().map((e) => e.concept);
}

/**
 * Return the total number of ledger entries.
 * Used for the cold start guard: < 3 means no longitudinal pattern analysis.
 */
export function getLedgerCount(): number {
  return getLedger().length;
}

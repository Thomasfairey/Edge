/**
 * Shared TypeScript types for The Edge.
 * All interfaces, type aliases, and utility types used across the application.
 * Reference: PRD Sections 3.1, 3.4, 4.4, Appendix B
 */

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface SessionScores {
  technique_application: number; // 1-5
  tactical_awareness: number; // 1-5
  frame_control: number; // 1-5
  emotional_regulation: number; // 1-5
  strategic_outcome: number; // 1-5
}

export const SCORE_KEYS: (keyof SessionScores)[] = [
  "technique_application",
  "tactical_awareness",
  "frame_control",
  "emotional_regulation",
  "strategic_outcome",
];

// ---------------------------------------------------------------------------
// Nuance Ledger (PRD Section 4.4, Appendix B)
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  day: number;
  date: string; // ISO date
  concept: string; // e.g., "Mirroring (Voss)"
  domain: string; // one of 7 taxonomy domains
  character: string; // archetype name
  difficulty: number; // 1-5
  scores: SessionScores;
  behavioral_weakness_summary: string; // 2 sentences, AI-generated
  key_moment: string; // most important roleplay turn
  mission: string; // the deployed mission
  mission_outcome: string; // qualitative extraction or "NOT EXECUTED"
  commands_used: string[]; // /coach, /reset, /skip
  session_completed: boolean;
}

// ---------------------------------------------------------------------------
// Concept taxonomy — 7 domains (PRD Section 3.3)
// ---------------------------------------------------------------------------

export type ConceptDomain =
  | "Influence & Persuasion"
  | "Power Dynamics"
  | "Negotiation"
  | "Behavioural Psychology & Cognitive Bias"
  | "Nonverbal Intelligence & Behavioural Profiling"
  | "Rapport & Relationship Engineering"
  | "Dark Psychology & Coercive Technique Recognition";

export interface Concept {
  id: string;
  name: string;
  domain: ConceptDomain;
  source: string; // attribution, e.g., "Cialdini"
  description: string; // 1-2 sentence summary for prompt injection
}

// ---------------------------------------------------------------------------
// Character archetypes (PRD Section 3.4)
// ---------------------------------------------------------------------------

export interface CharacterArchetype {
  id: string;
  name: string;
  description: string; // 1 sentence
  personality: string; // detailed personality brief for system prompt
  communication_style: string; // how they talk
  hidden_motivation: string; // what they secretly want
  pressure_points: string[]; // what breaks their position
  tactics: string[]; // techniques they use against the user
}

// ---------------------------------------------------------------------------
// Session state (PRD Section 3.1)
// ---------------------------------------------------------------------------

export type SessionPhase = "checkin" | "lesson" | "retrieval" | "roleplay" | "debrief" | "mission";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface SessionState {
  day: number;
  date: string;
  phase: SessionPhase;
  concept: Concept | null;
  character: CharacterArchetype | null;
  roleplayTranscript: Message[];
  coachMessages: string[];
  commandsUsed: string[];
  checkinOutcome: string | null;
  lessonContent: string | null;
  debriefContent: string | null;
  scores: SessionScores | null;
  mission: string | null;
}

// ---------------------------------------------------------------------------
// Validation helpers — runtime type guards for API input
// ---------------------------------------------------------------------------

/** Max length for user-provided text fields to prevent abuse */
export const MAX_INPUT_LENGTH = 10_000;
export const MAX_TRANSCRIPT_LENGTH = 100;

/** Clamp a score to the valid 1-5 range */
export function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (isNaN(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Validate and sanitize a SessionScores object */
export function validateScores(raw: unknown): SessionScores | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const hasAllKeys = SCORE_KEYS.every((k) => k in obj);
  if (!hasAllKeys) return null;
  return {
    technique_application: clampScore(obj.technique_application),
    tactical_awareness: clampScore(obj.tactical_awareness),
    frame_control: clampScore(obj.frame_control),
    emotional_regulation: clampScore(obj.emotional_regulation),
    strategic_outcome: clampScore(obj.strategic_outcome),
  };
}

/** Validate a Message object */
export function isValidMessage(msg: unknown): msg is Message {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return (
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    m.content.length <= MAX_INPUT_LENGTH
  );
}

/** Validate a transcript array */
export function validateTranscript(raw: unknown): Message[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_TRANSCRIPT_LENGTH) return null;
  if (!raw.every(isValidMessage)) return null;
  return raw as Message[];
}

/** Truncate a string to a max length */
export function truncate(value: unknown, maxLen: number = MAX_INPUT_LENGTH): string {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLen);
}

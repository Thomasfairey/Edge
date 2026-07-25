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
  // ── Relational ──
  | "Charisma & Presence"
  | "Storytelling & Narrative"
  | "Conversation & Memorability"
  | "Rapport & Relationship Engineering"
  // ── Persuasion & pressure ──
  | "Influence & Persuasion"
  | "Power Dynamics"
  | "Negotiation"
  | "Behavioural Psychology & Cognitive Bias"
  | "Nonverbal Intelligence & Behavioural Profiling"
  | "Dark Psychology & Coercive Technique Recognition";

// ---------------------------------------------------------------------------
// Life contexts — the settings a skill is practised in
//
// A domain says what a concept IS; a context says WHERE you use it. The two are
// independent: labelling works on a hostile buyer and on an upset sibling. Work
// is one context among five, not the organising principle.
// ---------------------------------------------------------------------------

export type LifeContext = "dating" | "friends" | "groups" | "family" | "work";

export const LIFE_CONTEXTS: LifeContext[] = ["dating", "friends", "groups", "family", "work"];

/** Everything that isn't work. The default selection for a new user. */
export const SOCIAL_CONTEXTS: LifeContext[] = ["dating", "friends", "groups", "family"];

export const CONTEXT_LABELS: Record<LifeContext, string> = {
  dating: "Dating & romance",
  friends: "Friendships",
  groups: "Groups & parties",
  family: "Family & hard conversations",
  work: "Work",
};

export const CONTEXT_BLURBS: Record<LifeContext, string> = {
  dating: "First dates, flirting, reading interest, the awkward middle, romantic conflict.",
  friends: "Getting past small talk, friends you've drifted from, listening well, asking for help.",
  groups: "Holding a room, joining a conversation, being memorable, hosting.",
  family: "Parents, siblings, partners — conflict with people you can't walk away from.",
  work: "Negotiation, stakeholders, pitching, difficult colleagues.",
};

export function isSocialContext(context: LifeContext): boolean {
  return context !== "work";
}

/**
 * Default contexts for a domain, used to tag content that predates the context
 * model and to keep legacy ledger rows selectable. Content should declare its
 * own `contexts` — this is the fallback, not the source of truth.
 *
 * ORDER MATTERS: the first entry is the domain's representative context, used
 * when a caller has no explicit session context to hand.
 */
export const DOMAIN_DEFAULT_CONTEXTS: Record<ConceptDomain, LifeContext[]> = {
  "Charisma & Presence": ["groups", "dating", "friends", "work"],
  "Storytelling & Narrative": ["groups", "friends", "dating", "work"],
  "Conversation & Memorability": ["groups", "friends", "dating", "work"],
  "Rapport & Relationship Engineering": ["friends", "dating", "groups", "family", "work"],
  "Influence & Persuasion": ["work"],
  "Power Dynamics": ["work"],
  "Negotiation": ["work", "family"],
  "Behavioural Psychology & Cognitive Bias": ["work"],
  "Nonverbal Intelligence & Behavioural Profiling": ["work", "dating", "groups"],
  "Dark Psychology & Coercive Technique Recognition": ["work", "family"],
};

/** Unknown domains fall back to work so legacy data never breaks selection. */
export function contextsForDomain(domain: string): LifeContext[] {
  return DOMAIN_DEFAULT_CONTEXTS[domain as ConceptDomain] ?? ["work"];
}

/** A concept's own contexts, or its domain's defaults. */
export function contextsForConcept(concept: Pick<Concept, "domain" | "contexts">): LifeContext[] {
  return concept.contexts && concept.contexts.length > 0
    ? concept.contexts
    : contextsForDomain(concept.domain);
}

/**
 * The context to assume when no explicit session context was passed. Prompt
 * builders use this so they keep working before the session context is threaded
 * through every route.
 */
export function primaryContextForConcept(concept: Pick<Concept, "domain" | "contexts">): LifeContext {
  return contextsForConcept(concept)[0] ?? "work";
}

/** True when the item is practisable in any of the user's active contexts. */
export function matchesContexts(
  itemContexts: LifeContext[] | undefined,
  active: LifeContext[]
): boolean {
  if (active.length === 0) return true;
  const contexts = itemContexts && itemContexts.length > 0 ? itemContexts : [];
  if (contexts.length === 0) return true;
  return contexts.some((c) => active.includes(c));
}

/**
 * Choose the single context a session runs in — the overlap between what the
 * concept supports and what the user has switched on. Falls back to the
 * concept's own first context, then to work, so this never returns undefined.
 */
export function resolveSessionContext(
  itemContexts: LifeContext[] | undefined,
  active: LifeContext[],
  pick: (n: number) => number = (n) => Math.floor(Math.random() * n)
): LifeContext {
  const contexts = itemContexts && itemContexts.length > 0 ? itemContexts : LIFE_CONTEXTS;
  const overlap = contexts.filter((c) => active.includes(c));
  const pool = overlap.length > 0 ? overlap : contexts;
  return pool[pick(pool.length)] ?? "work";
}

function isLifeContext(value: unknown): value is LifeContext {
  return typeof value === "string" && (LIFE_CONTEXTS as string[]).includes(value);
}

/** Map a pre-context `track` value onto the contexts it stood for. */
export function migrateLegacyTrack(track: unknown): LifeContext[] {
  if (track === "professional") return ["work"];
  if (track === "social") return [...SOCIAL_CONTEXTS];
  if (track === "both") return [...LIFE_CONTEXTS];
  return [...SOCIAL_CONTEXTS];
}

/**
 * Coerce whatever is in profile_data into a valid context list. Accepts the new
 * `contexts` array or a legacy `track` string, drops unknown values, dedupes,
 * and never returns empty.
 */
export function normaliseContexts(raw: unknown, legacyTrack?: unknown): LifeContext[] {
  if (Array.isArray(raw)) {
    const valid = Array.from(new Set(raw.filter(isLifeContext)));
    if (valid.length > 0) return valid;
  }
  if (legacyTrack !== undefined) return migrateLegacyTrack(legacyTrack);
  return [...SOCIAL_CONTEXTS];
}

export interface Concept {
  id: string;
  name: string;
  domain: ConceptDomain;
  source: string; // attribution, e.g., "Cialdini"
  description: string; // 1-2 sentence summary for prompt injection
  contexts?: LifeContext[]; // where this is practised; defaults to the domain's
}

// ---------------------------------------------------------------------------
// Character archetypes (PRD Section 3.4)
// ---------------------------------------------------------------------------

export interface CharacterArchetype {
  id: string;
  name: string;
  description: string; // 1 sentence
  contexts?: LifeContext[]; // settings this character belongs in
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

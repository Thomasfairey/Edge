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

export type SessionPhase = "gate" | "lesson" | "roleplay" | "debrief" | "mission";

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
  gateOutcome: string | null;
  lessonContent: string | null;
  debriefContent: string | null;
  scores: SessionScores | null;
  mission: string | null;
}

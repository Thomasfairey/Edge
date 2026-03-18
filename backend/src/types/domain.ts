/**
 * Domain model types for The Edge.
 * Shared across all backend services.
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

export const SCORE_DIMENSIONS = [
  "technique_application",
  "tactical_awareness",
  "frame_control",
  "emotional_regulation",
  "strategic_outcome",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

// ---------------------------------------------------------------------------
// User Profile (replaces hardcoded Tom Fairey context)
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: string; // Supabase auth.uid()
  email: string;
  display_name: string;
  professional_context: string; // free-text: role, company, goals
  communication_style: string; // how they prefer feedback
  experience_level: "beginner" | "intermediate" | "advanced";
  goals: string[]; // what they want to improve
  subscription_tier: "free" | "pro";
  subscription_expires_at: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Concept taxonomy
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
  source: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Character archetypes
// ---------------------------------------------------------------------------

export interface CharacterArchetype {
  id: string;
  name: string;
  description: string;
  personality: string;
  communication_style: string;
  hidden_motivation: string;
  pressure_points: string[];
  tactics: string[];
}

// ---------------------------------------------------------------------------
// Nuance Ledger
// ---------------------------------------------------------------------------

export interface LedgerEntry {
  day: number;
  date: string;
  concept: string;
  domain: string;
  character: string;
  difficulty: number;
  scores: SessionScores;
  behavioral_weakness_summary: string;
  key_moment: string;
  mission: string;
  mission_outcome: string;
  commands_used: string[];
  session_completed: boolean;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export type SessionPhase =
  | "checkin"
  | "lesson"
  | "roleplay"
  | "debrief"
  | "mission"
  | "complete";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface SessionState {
  id: string;
  user_id: string;
  day: number;
  date: string;
  phase: SessionPhase;
  concept_id: string | null;
  character_id: string | null;
  roleplay_transcript: Message[];
  coach_messages: string[];
  commands_used: string[];
  checkin_outcome: string | null;
  lesson_content: string | null;
  debrief_content: string | null;
  scores: SessionScores | null;
  mission: string | null;
  is_review: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Spaced Repetition
// ---------------------------------------------------------------------------

export interface SREntry {
  conceptId: string;
  lastPracticed: string;
  easeFactor: number;
  interval: number;
  nextReview: string;
  practiceCount: number;
  lastScoreAvg: number;
}

// ---------------------------------------------------------------------------
// Subscription tiers
// ---------------------------------------------------------------------------

export const TIER_LIMITS = {
  free: {
    sessions_per_week: 3,
    domains: ["Influence & Persuasion", "Rapport & Relationship Engineering"] as ConceptDomain[],
    characters: ["sceptical-investor", "resistant-report", "consultancy-gatekeeper"],
    features: {
      trend_analysis: false,
      mission_accountability: false,
      spaced_repetition: false,
      voice_mode: false,
    },
  },
  pro: {
    sessions_per_week: Infinity,
    domains: null, // all domains
    characters: null, // all characters
    features: {
      trend_analysis: true,
      mission_accountability: true,
      spaced_repetition: true,
      voice_mode: true,
    },
  },
} as const;

/**
 * Scoring dimensions, per life context.
 *
 * The original five — technique application, tactical awareness, frame
 * control, emotional regulation, strategic outcome — are a combat rubric. They
 * are the right lens for a procurement negotiation and the wrong one for a
 * friend in crisis, where "did you achieve your objective and shift their
 * position" is not a question worth asking. Scoring a warm conversation on
 * frame control actively teaches the wrong instinct.
 *
 * Each context therefore gets its own five. Five everywhere keeps the UI shape
 * unchanged, and the work set is preserved exactly so professional sessions
 * score as they always did.
 */

import { LifeContext, LIFE_CONTEXTS } from "@/lib/types";

export interface Dimension {
  /** snake_case; the key stored in the scores JSONB. */
  key: string;
  /** Display name. */
  label: string;
  /** Two-letter chip used in the dashboard and onboarding. */
  short: string;
  /** What the debrief should assess for this dimension. */
  prompt: string;
}

export interface DimensionSet {
  id: LifeContext;
  dimensions: Dimension[];
}

const DATING: Dimension[] = [
  { key: "presence", label: "Presence", short: "PR", prompt: "Were they actually here — unhurried, attentive, not performing or rehearsing their next line? Reference the turn where that was most or least true." },
  { key: "playfulness", label: "Playfulness", short: "PL", prompt: "Could they play — tease, be teased, let something be light — or did every exchange stay earnest and flat?" },
  { key: "vulnerability", label: "Vulnerability", short: "VU", prompt: "Did they offer anything real about themselves, and was it calibrated to what the other person had offered, or far ahead of it?" },
  { key: "attunement", label: "Attunement", short: "AT", prompt: "Did they read the other person's actual state — interest, discomfort, retreat — and adjust? Or did they run their own plan regardless?" },
  { key: "spark", label: "Spark", short: "SP", prompt: "By the end, did the other person want more of this conversation? Point to the evidence in their turns, not to how it felt." },
];

const FRIENDS: Dimension[] = [
  { key: "curiosity", label: "Curiosity", short: "CU", prompt: "Did they ask about the other person's actual life and follow the answer, or wait for their turn to talk?" },
  { key: "warmth", label: "Warmth", short: "WA", prompt: "Was there real affection in how they spoke, or only competence? Reference a specific turn." },
  { key: "generosity", label: "Generosity", short: "GE", prompt: "Did they give the other person the floor, the credit, or the benefit of the doubt when it cost them something to do so?" },
  { key: "honesty", label: "Honesty", short: "HO", prompt: "Did they say the true thing when the easy thing was available — including about themselves?" },
  { key: "follow_through", label: "Follow-through", short: "FT", prompt: "Did anything concrete come out of this — a specific plan, a real offer, a named next thing — or did it end on 'we should do this more often'?" },
];

const GROUPS: Dimension[] = [
  { key: "presence", label: "Presence", short: "PR", prompt: "Did they hold their own without straining for it, or shrink and over-compensate?" },
  { key: "timing", label: "Timing", short: "TI", prompt: "Did they read the room's tempo before changing it — entering at a break, landing a point at the right moment?" },
  { key: "inclusion", label: "Inclusion", short: "IN", prompt: "Did they notice who had gone quiet and bring them in? This costs the floor and is the highest-status move available." },
  { key: "memorability", label: "Memorability", short: "ME", prompt: "Would anyone remember them tomorrow? What specifically would they remember — and if nothing, why not?" },
  { key: "energy", label: "Energy", short: "EN", prompt: "Did they add to the group's energy or draw from it? Reference the turn where it shifted." },
];

const FAMILY: Dimension[] = [
  { key: "regulation", label: "Regulation", short: "RE", prompt: "Did they stay regulated, or get flooded and start prosecuting? Name the turn where it tipped, and the tell." },
  { key: "listening", label: "Listening", short: "LI", prompt: "Did they hear what was actually said, or answer the argument they expected? Look for whether they reflected anything back accurately." },
  { key: "ownership", label: "Ownership", short: "OW", prompt: "Did they own their part specifically and without a 'but' attached — or defend, explain, and counter-accuse?" },
  { key: "boundary_clarity", label: "Boundary clarity", short: "BC", prompt: "If a line needed holding, did they state what they would do rather than what the other person must stop doing — and hold it without anger?" },
  { key: "repair", label: "Repair", short: "RP", prompt: "Did they make or accept a repair attempt? In family conflict this matters more than who was right." },
];

/** Unchanged — professional sessions score exactly as they always did. */
const WORK: Dimension[] = [
  { key: "technique_application", label: "Technique application", short: "TA", prompt: "Did the user deploy the concept? How effectively? Reference the specific turn where they used it (or failed to)." },
  { key: "tactical_awareness", label: "Tactical awareness", short: "TW", prompt: "Did the user recognise the character's tactics? Did they adapt? Reference specific turns." },
  { key: "frame_control", label: "Frame control", short: "FC", prompt: "Who owned the frame of this conversation? At what point did control shift (if it did)? Be specific." },
  { key: "emotional_regulation", label: "Emotional regulation", short: "ER", prompt: "Did the user stay strategic or become reactive? If the character provoked them, at which turn? What was the tell?" },
  { key: "strategic_outcome", label: "Strategic outcome", short: "SO", prompt: "Did the user achieve their objective? Was the character moved from their opening position?" },
];

export const DIMENSION_SETS: Record<LifeContext, DimensionSet> = {
  dating: { id: "dating", dimensions: DATING },
  friends: { id: "friends", dimensions: FRIENDS },
  groups: { id: "groups", dimensions: GROUPS },
  family: { id: "family", dimensions: FAMILY },
  work: { id: "work", dimensions: WORK },
};

/** The default for unknown or missing sets — matches the pre-migration rubric. */
export const DEFAULT_DIMENSION_SET: LifeContext = "work";

/**
 * Resolve a dimension set from a context or a stored `dimension_set` value.
 * Unknown values fall back to work rather than throwing, so a ledger row
 * written by a future version never breaks the dashboard.
 */
export function dimensionSetFor(value?: string | null): DimensionSet {
  if (value && (LIFE_CONTEXTS as string[]).includes(value)) {
    return DIMENSION_SETS[value as LifeContext];
  }
  return DIMENSION_SETS[DEFAULT_DIMENSION_SET];
}

export function dimensionKeys(value?: string | null): string[] {
  return dimensionSetFor(value).dimensions.map((d) => d.key);
}

export function dimensionLabel(setId: string | null | undefined, key: string): string {
  return dimensionSetFor(setId).dimensions.find((d) => d.key === key)?.label ?? key.replace(/_/g, " ");
}

/** Clamp to the valid 1–5 range; non-numeric input scores a neutral 3. */
export function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  if (isNaN(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Validate a scores object against a named set. Returns null when any of the
 * set's dimensions is missing — a partial rubric is a generation failure, not
 * something to paper over with defaults.
 */
export function validateScoresForSet(
  raw: unknown,
  setId?: string | null
): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const keys = dimensionKeys(setId);
  if (!keys.every((k) => k in obj)) return null;

  const out: Record<string, number> = {};
  for (const key of keys) out[key] = clampScore(obj[key]);
  return out;
}

/** Mean across whatever dimensions are present. Returns 0 for an empty set. */
export function averageScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * The dimension the user did worst on — what the mission should target.
 * Ties resolve to the first in the set's declared order.
 */
export function weakestDimension(
  scores: Record<string, number>,
  setId?: string | null
): { key: string; label: string; score: number } | null {
  const set = dimensionSetFor(setId);
  let worst: { key: string; label: string; score: number } | null = null;
  for (const dimension of set.dimensions) {
    const score = scores[dimension.key];
    if (typeof score !== "number") continue;
    if (worst === null || score < worst.score) {
      worst = { key: dimension.key, label: dimension.label, score };
    }
  }
  return worst;
}

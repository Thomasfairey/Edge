/**
 * Session shapes.
 *
 * Every session ran the same five phases in the same order — lesson,
 * retrieval, roleplay, debrief, mission — for ten minutes, every day. Even
 * with a fresh concept, a fresh character and a fresh scenario, the *shape* of
 * the day never changed, and that sameness is most of what "repetitive" means
 * once the content problem is solved.
 *
 * A shape is an ordered list of phases plus how long the roleplay should run.
 * The session machinery derives its transitions from the shape rather than
 * from a hardcoded map, so adding a shape is a data change.
 *
 * Check-in is not part of any shape. It is a conditional prelude that runs when
 * the previous session left a mission outstanding, and it precedes whatever
 * shape the day has.
 */

import { SessionPhase } from "@/lib/types";
import { chooseWithHistory, HISTORY_WINDOWS, type Picker } from "@/lib/selection";

export interface SessionShape {
  id: string;
  /** Shown in the session header. */
  label: string;
  /** One line for the user, explaining what today will be. */
  description: string;
  phases: SessionPhase[];
  /** Roleplay turns before the user may end the scene. */
  minTurns: number;
  /** Turns after which the session nudges toward the debrief. */
  maxTurns: number;
}

export const SESSION_SHAPES: SessionShape[] = [
  {
    id: "full",
    label: "Full session",
    description: "Learn something, practise it, get it pulled apart, take it into the world.",
    phases: ["lesson", "retrieval", "roleplay", "debrief", "mission"],
    minTurns: 4,
    maxTurns: 12,
  },
  {
    id: "drill",
    label: "Quick drill",
    description: "Straight into it. A short scene and one thing to try today.",
    phases: ["roleplay", "mission"],
    minTurns: 2,
    maxTurns: 6,
  },
  {
    id: "deep",
    label: "Deep scene",
    description: "One long conversation, played out properly, then taken apart in detail.",
    phases: ["roleplay", "debrief", "mission"],
    minTurns: 8,
    maxTurns: 20,
  },
  {
    id: "review",
    label: "Review",
    description: "Something you've done before, revisited at a level you weren't ready for the first time.",
    phases: ["lesson", "roleplay", "debrief"],
    minTurns: 4,
    maxTurns: 12,
  },
  {
    id: "story",
    label: "Storytelling",
    description: "You tell it, someone real reacts, and then it gets rebuilt.",
    phases: ["lesson", "roleplay", "debrief"],
    minTurns: 3,
    maxTurns: 10,
  },
];

export const DEFAULT_SHAPE_ID = "full";

/** Unknown ids fall back to the full loop rather than throwing. */
export function shapeById(id?: string | null): SessionShape {
  return SESSION_SHAPES.find((s) => s.id === id) ?? SESSION_SHAPES[0];
}

/** The phase after `current` in this shape, or null when the shape is done. */
export function nextPhase(shape: SessionShape, current: SessionPhase): SessionPhase | null {
  const index = shape.phases.indexOf(current);
  if (index === -1 || index === shape.phases.length - 1) return null;
  return shape.phases[index + 1];
}

/**
 * Whether a transition is legal in this shape.
 *
 * Check-in is a prelude to every shape, so leaving it for the shape's first
 * phase is always allowed. Everything else must be a step forward in the
 * shape's own order, which is what stops a resumed or replayed session
 * skipping phases.
 */
export function isValidTransition(
  shape: SessionShape,
  from: SessionPhase,
  to: SessionPhase
): boolean {
  if (from === "checkin") return to === shape.phases[0];
  return nextPhase(shape, from) === to;
}

/** Whether a phase belongs to this shape at all (check-in aside). */
export function shapeIncludes(shape: SessionShape, phase: SessionPhase): boolean {
  return phase === "checkin" || shape.phases.includes(phase);
}

export interface ShapeSelectionOptions {
  /** Shape ids of recent sessions, most recent first. */
  recentShapeIds?: string[];
  /** Day 1 always runs the full loop — the user needs to see the whole thing. */
  dayNumber?: number;
  /** Review only makes sense when spaced repetition has something due. */
  hasDueReview?: boolean;
  /** Story sessions need a storytelling concept to be worth running. */
  isStorytellingConcept?: boolean;
  pick?: Picker;
}

/**
 * Choose today's shape.
 *
 * Guards come first and are absolute; history-aware variety is applied to
 * whatever survives them. As everywhere else in selection, this always returns
 * something — a repeated shape beats no session.
 */
export function selectShape({
  recentShapeIds = [],
  dayNumber = 1,
  hasDueReview = false,
  isStorytellingConcept = false,
  pick,
}: ShapeSelectionOptions = {}): SessionShape {
  // Day 1 is always the full loop: a new user should see every phase once
  // before the product starts varying itself.
  if (dayNumber <= 1) return shapeById("full");

  const eligible = SESSION_SHAPES.filter((shape) => {
    if (shape.id === "review") return hasDueReview;
    if (shape.id === "story") return isStorytellingConcept;
    return true;
  });

  const chosen = chooseWithHistory(eligible, {
    idOf: (s) => s.id,
    recentIds: recentShapeIds,
    window: HISTORY_WINDOWS.shape,
    pick,
  });

  return chosen ?? shapeById("full");
}

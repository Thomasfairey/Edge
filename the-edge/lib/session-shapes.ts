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
 * EVERY SHAPE STARTS WITH THE LESSON. You cannot practise a technique you have
 * not been taught, and the psychology behind it is the point — the roleplay is
 * where you find out whether you understood it, not where you meet it. Earlier
 * versions of `drill` and `deep` opened straight into the conversation; that
 * was the wrong axis to vary on.
 *
 * EVERY SHAPE ALSO CONTAINS THE DEBRIEF AND ENDS WITH THE MISSION, and those
 * are structural rather than stylistic. The mission needs the debrief's scores
 * to target the weakest dimension, and the mission phase is what writes the
 * ledger row — so a shape missing either does not merely feel different, it
 * breaks. A drill without a debrief sent the user to a mission that could not
 * generate, rendering a blank page and losing the session; a shape ending at
 * the debrief never recorded at all. Both shipped. See the tests, which now
 * enforce this.
 *
 * EVERY SHAPE ALSO REHEARSES, between the debrief and the mission. The debrief
 * handing over the exact words you should have said and then ending is the
 * single largest hole in this product: reading a correction gets you
 * recognition, and the skill being trained is production under pressure. So the
 * pivotal moment is replayed and you answer it again. It sits after the debrief
 * because it consumes the debrief's cue, and before the mission because the
 * mission still closes the session and writes the row.
 *
 * Variation therefore comes from the recall check and the length of the scene:
 * 2-6 turns for a drill, 8-20 for a deep one.
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
    description: "Learn the idea, check you have it, practise it, get it pulled apart, take it into the world.",
    phases: ["lesson", "retrieval", "roleplay", "debrief", "rehearse", "mission"],
    minTurns: 4,
    maxTurns: 12,
  },
  {
    id: "drill",
    label: "Quick drill",
    description: "The idea, a short scene to try it in, a straight read on how it went, and one thing for today.",
    phases: ["lesson", "roleplay", "debrief", "rehearse", "mission"],
    minTurns: 2,
    maxTurns: 6,
  },
  {
    id: "deep",
    label: "Deep scene",
    description: "One long conversation, played out properly and taken apart in detail.",
    phases: ["lesson", "retrieval", "roleplay", "debrief", "rehearse", "mission"],
    minTurns: 8,
    maxTurns: 20,
  },
  {
    id: "review",
    label: "Review",
    description: "Something you've done before, at a depth you weren't ready for the first time.",
    phases: ["lesson", "roleplay", "debrief", "rehearse", "mission"],
    minTurns: 4,
    maxTurns: 12,
  },
  {
    id: "story",
    label: "Storytelling",
    description: "The idea, then you tell it, someone real reacts, and it gets rebuilt.",
    phases: ["lesson", "roleplay", "debrief", "rehearse", "mission"],
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

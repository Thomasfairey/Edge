/**
 * The check-in state machine.
 *
 * This is the only place the product touches the user's actual life, and it
 * used to be a free-text box you could satisfy with "went fine". Three taps
 * instead, in an order that matters:
 *
 *   1. Did the moment come up at all?
 *   2. If it did — did you do it?
 *   3. If you did — what did they do?
 *
 * Asking about opportunity first is the substantive part. A mission that never
 * got its moment is not a failure, and treating it as one both misreads the
 * week and punishes the user for their diary. Separating the two also yields
 * the numbers that actually measure whether this product works: how often the
 * cue occurs, and how often the user acts on it when it does.
 */

export type Enactment = "yes" | "partly" | "no";

/** Legacy three-way outcome, kept because the prompt and ledger speak it. */
export type CheckinOutcomeType = "completed" | "tried" | "skipped";

export interface CheckinState {
  /** null until answered. */
  opportunity: boolean | null;
  enacted: Enactment | null;
  outcome: string;
}

export type CheckinStep = "opportunity" | "enacted" | "outcome" | "ready";

export const EMPTY_CHECKIN: CheckinState = {
  opportunity: null,
  enacted: null,
  outcome: "",
};

/** Which question the user is currently on. */
export function checkinStep(state: CheckinState): CheckinStep {
  if (state.opportunity === null) return "opportunity";
  // The moment never arrived: nothing else is worth asking, and asking anyway
  // implies they should have made it happen.
  if (state.opportunity === false) return "ready";
  if (state.enacted === null) return "enacted";
  // Only ask what the other person did if there was something for them to react
  // to. "You didn't do it — how did they respond?" is a nonsense question.
  if (state.enacted === "no") return "ready";
  return "outcome";
}

/** Whether the check-in can be submitted as it stands. */
export function canSubmitCheckin(state: CheckinState): boolean {
  const step = checkinStep(state);
  // The free-text step is genuinely optional — a tap is enough.
  return step === "ready" || step === "outcome";
}

/**
 * Collapse the structured answers into the legacy outcome type.
 *
 * "Didn't get the chance" and "got the chance and didn't take it" both map to
 * `skipped` for the prompt's purposes, but they are stored separately on the
 * ledger because only one of them is about the user.
 */
export function outcomeTypeFor(state: CheckinState): CheckinOutcomeType {
  if (state.opportunity === false) return "skipped";
  if (state.enacted === "yes") return "completed";
  if (state.enacted === "partly") return "tried";
  return "skipped";
}

/**
 * The text stored as `mission_outcome`, for prompts that read the ledger as
 * prose. Structured fields are stored alongside it.
 */
export function serialiseCheckin(state: CheckinState): string {
  if (state.opportunity === false) return "The moment never came up.";

  const stem =
    state.enacted === "yes"
      ? "Did it."
      : state.enacted === "partly"
        ? "Partly did it."
        : "The moment came up and I didn't take it.";

  const detail = state.outcome.trim();
  return detail ? `${stem} ${detail}` : stem;
}

// ---------------------------------------------------------------------------
// Aggregate stats — what replaces the score trend on the home screen
// ---------------------------------------------------------------------------

export interface EnactmentStats {
  /** Sessions with a recorded answer. */
  answered: number;
  /** Of those, how many had the moment come up. */
  opportunities: number;
  /** Of the opportunities, how many were acted on (fully or partly). */
  enacted: number;
}

/**
 * Count what actually happened in the world.
 *
 * Deliberately ignores rows with no check-in rather than counting them as
 * failures — an unanswered check-in means the user didn't come back that day,
 * which is a different fact.
 */
export function enactmentStats(
  entries: { mission_opportunity?: boolean | null; mission_enacted?: string | null }[]
): EnactmentStats {
  let answered = 0;
  let opportunities = 0;
  let enacted = 0;

  for (const entry of entries) {
    if (entry.mission_opportunity === null || entry.mission_opportunity === undefined) continue;
    answered++;
    if (!entry.mission_opportunity) continue;
    opportunities++;
    if (entry.mission_enacted === "yes" || entry.mission_enacted === "partly") enacted++;
  }

  return { answered, opportunities, enacted };
}

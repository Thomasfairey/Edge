/**
 * History-aware selection.
 *
 * Everything the session picks — the concept, the character, later the session
 * shape — used to be a bare `Math.random()` over a filtered list. With a small
 * pool that produces visible repeats, including the same character two days
 * running, which is most of what "repetitive" actually meant.
 *
 * The rules here are deliberately soft. Every one of them relaxes rather than
 * failing, because returning nothing means failing to start a session, and a
 * slightly repetitive session beats no session at all.
 */

import { Disposition, DISPOSITIONS } from "@/lib/types";

/** Injectable for tests; production passes nothing and gets Math.random. */
export type Picker = (n: number) => number;

const defaultPick: Picker = (n) => Math.floor(Math.random() * n);

export interface ChooseOptions<T> {
  /** Stable identity used to match against history. */
  idOf: (item: T) => string;
  /** Previously used ids, most recent first. */
  recentIds: string[];
  /** How many recent entries to treat as off-limits. */
  window: number;
  pick?: Picker;
}

/**
 * Pick from `candidates`, avoiding the most recent `window` selections and
 * preferring items never used at all.
 *
 * If the window would empty the pool it shrinks until something survives, so a
 * small candidate list degrades to "don't repeat the last one" rather than to
 * an error.
 */
export function chooseWithHistory<T>(
  candidates: T[],
  { idOf, recentIds, window, pick = defaultPick }: ChooseOptions<T>
): T | null {
  if (candidates.length === 0) return null;

  const maxWindow = Math.min(window, recentIds.length);
  for (let w = maxWindow; w >= 0; w--) {
    const excluded = new Set(recentIds.slice(0, w));
    const pool = candidates.filter((c) => !excluded.has(idOf(c)));
    if (pool.length === 0) continue;

    // Within what's left, favour anything never used before.
    const everUsed = new Set(recentIds);
    const unused = pool.filter((c) => !everUsed.has(idOf(c)));
    const final = unused.length > 0 ? unused : pool;
    return final[pick(final.length)];
  }

  // Every candidate is in the immediate history — take anything.
  return candidates[pick(candidates.length)];
}

/**
 * Choose the emotional shape of the next session.
 *
 * Three resistant characters in a row makes the product feel like a gauntlet
 * even when the scenarios differ, so this steers away from whatever the recent
 * sessions have been. Advisory only — `selectCharacter` falls back if the
 * context has nobody with the preferred disposition.
 */
export function nextDisposition(
  recentDispositions: Disposition[],
  available: Disposition[] = DISPOSITIONS,
  pick: Picker = defaultPick
): Disposition | undefined {
  if (available.length === 0) return undefined;

  const unused = available.filter((d) => !recentDispositions.includes(d));
  if (unused.length > 0) return unused[pick(unused.length)];

  const [mostRecent] = recentDispositions;
  const different = available.filter((d) => d !== mostRecent);
  if (different.length > 0) return different[pick(different.length)];

  return available[pick(available.length)];
}

/**
 * How far back to look for each kind of selection. Characters get the longest
 * memory because a repeated character is the most obvious repeat of all.
 */
export const HISTORY_WINDOWS = {
  character: 5,
  domain: 3,
  shape: 3,
  disposition: 2,
  /**
   * How many recent sessions block a spaced-repetition review of the same
   * concept. A session scoring below 3 sets the review interval to a single
   * day, so without this the concept practised yesterday is the one offered
   * back today — which reads as the app repeating itself, not as revision.
   */
  review: 3,
} as const;

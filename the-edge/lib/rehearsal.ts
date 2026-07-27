/**
 * Rehearsal cue selection.
 *
 * The debrief names the moment the user handled worst and is asked to quote
 * both sides of it verbatim. Models paraphrase when asked to quote, so nothing
 * here trusts the quotation: the model's job is only to *identify* the turn,
 * and the exact wording is recovered from the transcript we already hold.
 *
 * This never returns null for a transcript with a real exchange in it. A
 * rehearsal against a slightly wrong turn is worth far more than a phase that
 * renders empty, which is the failure this product has shipped before.
 */

import { Message } from "@/lib/types";

export interface RehearsalSelection {
  cue: string;
  brief: string;
  originalReply: string;
}

/** Lowercase, strip punctuation, collapse whitespace — for fuzzy comparison. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Proportion of `needle`'s words that appear in `haystack`. */
function overlap(needle: string, haystack: string): number {
  const needleWords = normalise(needle).split(" ").filter(Boolean);
  if (needleWords.length === 0) return 0;
  const haystackWords = new Set(normalise(haystack).split(" ").filter(Boolean));
  const hits = needleWords.filter((w) => haystackWords.has(w)).length;
  return hits / needleWords.length;
}

/**
 * Every character line that the user actually replied to.
 *
 * A character line with nothing after it cannot be rehearsed — there is no
 * original reply to improve on — so trailing turns are excluded.
 */
function answerableTurns(transcript: Message[]): { cue: string; reply: string }[] {
  const pairs: { cue: string; reply: string }[] = [];
  for (let i = 0; i < transcript.length - 1; i++) {
    if (transcript[i].role === "assistant" && transcript[i + 1].role === "user") {
      const cue = transcript[i].content.trim();
      const reply = transcript[i + 1].content.trim();
      if (cue && reply) pairs.push({ cue, reply });
    }
  }
  return pairs;
}

/**
 * Resolve the model's nomination against the transcript.
 *
 * Returns the transcript's own wording when the nomination matches a real turn
 * well enough, so a paraphrased quote still produces an exact replay. Falls
 * back to the last answerable exchange — the freshest moment, and the one the
 * user remembers best.
 */
export function selectRehearsalCue(
  transcript: Message[],
  nominated: { cue?: string | null; brief?: string | null; original?: string | null }
): RehearsalSelection | null {
  const pairs = answerableTurns(transcript);
  if (pairs.length === 0) return null;

  const brief =
    nominated.brief?.trim() ||
    "Answer what they actually gave you before you add anything of your own.";

  const nominatedCue = nominated.cue?.trim();
  if (nominatedCue) {
    let best = pairs[0];
    let bestScore = 0;
    for (const pair of pairs) {
      const score = overlap(nominatedCue, pair.cue);
      if (score > bestScore) {
        best = pair;
        bestScore = score;
      }
    }
    // Half the nominated words landing in the same turn is a match; below that
    // the model has invented a line and the transcript is the better source.
    if (bestScore >= 0.5) {
      return { cue: best.cue, brief, originalReply: best.reply };
    }
  }

  const last = pairs[pairs.length - 1];
  return { cue: last.cue, brief, originalReply: last.reply };
}

/** Pull the ---REHEARSAL--- block out of a debrief. Tolerates bold and spacing. */
export function parseRehearsalBlock(text: string): {
  cue?: string;
  brief?: string;
  original?: string;
} {
  const blockMatch =
    text.match(/---\s*REHEARSAL\s*---\s*([\s\S]*?)(?:```|$)/) ??
    text.match(/REHEARSAL[:\s]*\n([\s\S]*?)$/i);
  if (!blockMatch) return {};

  const block = blockMatch[1];
  const field = (name: string, next: string[]): string | undefined => {
    const stop = next.map((n) => `\\*?\\*?${n}\\*?\\*?\\s*:`).join("|");
    const re = new RegExp(
      `\\*?\\*?${name}\\*?\\*?\\s*:\\s*([\\s\\S]*?)(?:${stop ? stop + "|" : ""}$)`,
      "i"
    );
    const raw = block.match(re)?.[1]?.trim();
    if (!raw) return undefined;
    // Models wrap quoted lines even when told not to.
    return raw.replace(/^["'“”]+|["'“”]+$/g, "").trim() || undefined;
  };

  return {
    cue: field("rehearsal_cue", ["rehearsal_original", "rehearsal_brief"]),
    original: field("rehearsal_original", ["rehearsal_brief"]),
    brief: field("rehearsal_brief", []),
  };
}

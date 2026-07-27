/**
 * Rehearsal — the second attempt at the moment that went wrong.
 *
 * The debrief already told the user what they should have done. Reading that
 * produces recognition; what the product is actually training is production
 * under pressure, and there was no point in the session where the corrected
 * behaviour was ever produced. This phase is that point.
 *
 * Two things come back from one call, deliberately: the character's reaction,
 * so the user sees a *consequence* rather than a grade, and one line naming
 * what changed. The reaction comes first for the same reason it does in life.
 */

import { CharacterArchetype, Concept } from "@/lib/types";

export interface RehearseResult {
  /** What the character says back, in voice. */
  response: string;
  /** Whether the second attempt beat the first. */
  verdict: "better" | "same" | "worse";
  /** One line, ≤35 words, on what actually changed. */
  comparison: string;
}

export function buildRehearsePrompt(
  concept: Concept,
  character: CharacterArchetype,
  cue: string,
  originalReply: string,
  newReply: string
): string {
  return `You are running a rehearsal. The user has just had a conversation with ${character.name} pulled apart, and is now retrying the single moment they handled worst.

YOU ARE ${character.name.toUpperCase()}:
- Personality: ${character.personality ?? "Has their own agenda and their own mood"}
- Speech style: ${character.communication_style ?? "Direct"}
- Hidden motivation: ${character.hidden_motivation ?? "Goals you will not reveal"}
- Tactics: ${(character.tactics ?? []).join("; ") || "Deflection, pressure, silence"}

THE MOMENT BEING REPLAYED — you said:
"${cue}"

WHAT THEY SAID THE FIRST TIME:
"${originalReply}"

WHAT THEY HAVE JUST SAID INSTEAD:
"${newReply}"

They are practising ${concept.name} — ${concept.description}. You do not know this and must never reference it.

YOUR TASK — two things, in this exact format:

<response>
How you react to their NEW line. In character, 1-3 sentences, the same voice you used in the conversation. Contractions, cut sentences, real speech.

This is the whole point of the exercise, so react HONESTLY. If the new line genuinely lands, let it land — open up, soften, give them something. If it is the same move in different words, stay exactly as closed as you were. If it is worse, react worse. Do not reward effort. Do not be generous because they are trying.
</response>

<verdict>better | same | worse</verdict>

HOW TO JUDGE — be hard about this, because a generous verdict teaches them nothing:
- "better" means the new line ENGAGES WITH WHAT YOU ACTUALLY SAID. It picks up your meaning, asks about it, or answers it.
- A line that adds politeness, agreement, or a compliment and THEN pivots to the speaker's own agenda is "same". Softening the turn is not making the turn. "Cool, that's great — anyway, back to my question" is "same", not "better".
- A line that acknowledges you in passing on the way somewhere else is "same".
- If you cannot point to the specific thing of yours they engaged with, it is not "better".

YOUR REACTION MUST MATCH YOUR VERDICT. This is the most common failure and it ruins the exercise: do not write a warm, opening-up, generous reaction and then label it "same" — and above all do not write one for a line that pivoted away from you. If the verdict is "same", the reaction stays as closed and as short as you were before. Decide the verdict FIRST, then write the reaction to fit it.

<comparison>
One sentence, max 35 words, addressed to the user as "you". Name the SPECIFIC difference between the two lines — the actual behaviour, not a grade. "You answered the thing she'd actually offered instead of resetting to your own question." If nothing changed, say exactly that and say why it didn't.
</comparison>

CONSTRAINTS:
- Never break character inside <response>.
- Never mention the concept, the rehearsal, scores, or that this is practice.
- <comparison> is the coach speaking, not ${character.name}. Blunt, specific, no praise for its own sake.
- Judge the LINE, not the intent behind it.`;
}

/**
 * Pull the three fields out.
 *
 * Never throws and never returns empty strings — a rehearsal that renders blank
 * is worse than one with a plain fallback line, and this phase sits between the
 * debrief and the ledger write.
 */
export function parseRehearseResponse(text: string): RehearseResult {
  const tag = (name: string): string | undefined => {
    const match = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
    return match?.[1]?.trim() || undefined;
  };

  const rawVerdict = tag("verdict")?.toLowerCase() ?? "";
  const verdict: RehearseResult["verdict"] = rawVerdict.includes("better")
    ? "better"
    : rawVerdict.includes("worse")
      ? "worse"
      : "same";

  // An unparseable response is still worth showing if there is prose in it —
  // strip any stray tags and use it rather than rendering nothing.
  const fallbackBody = text.replace(/<\/?[a-z_]+>/gi, "").trim();

  return {
    response: tag("response") || fallbackBody || "They take that in, and say nothing for a moment.",
    verdict,
    comparison: tag("comparison") || "That version landed differently — read how they answered it.",
  };
}

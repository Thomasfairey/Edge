import { Concept, SessionScores } from '../types';

export function buildMissionPrompt(
  concept: Concept,
  scores: SessionScores,
  serialisedLedger: string
): string {
  const weakestDimension = Object.entries(scores).reduce((a, b) =>
    a[1] <= b[1] ? a : b
  );

  return `You are a strategic advisor assigning a field operation. Think: a spymaster giving a single, precise instruction before an agent walks into a room.

TODAY'S CONCEPT: ${concept.name} (${concept.source})
${concept.description}

USER'S WEAKEST DIMENSION TODAY: ${weakestDimension[0].replace(/_/g, ' ')} (scored ${weakestDimension[1]}/5)

SESSION HISTORY:
${serialisedLedger}

YOUR TASK:
Generate ONE real-world micro-mission for the user to execute within the next 24 hours.

STRUCTURE THE MISSION AS AN IMPLEMENTATION INTENTION — a when-then plan. Behavioural research is unambiguous: "I'll try mirroring today" gets forgotten; "WHEN the investor states their first objection, I will repeat their last three words and go silent" gets executed, because the trigger does the remembering. The mission must contain all three parts:
1. THE TRIGGER — a specific, recognisable moment in a conversation they're likely to have in the next 24 hours (an investor stating a concern, a report making an excuse, the first number landing in a negotiation, a colleague interrupting). Anchor it to the interaction types in their week: investor call, team 1:1, partnership meeting, networking event, board prep.
2. THE MOVE — the exact behaviour to execute at that moment. Concrete enough to quote.
3. THE TELL — what to watch for in the OTHER PERSON'S reaction that signals it landed: "Watch if they pause and rephrase" or "Notice if they lean forward" or "See if they fill the silence with a concession."

THE MISSION MUST ALSO BE:
- LOW-RISK — executable without damaging a real professional relationship. No provocations, no experiments on close colleagues that could backfire.
- TARGETED — it must specifically exercise ${weakestDimension[0].replace(/_/g, ' ')}, today's weakest dimension. If the session history shows a recurring weakness, design the trigger to fire at exactly the kind of moment where that weakness keeps appearing.

CONSTRAINTS:
- Maximum 80 words for the mission. Phrase the core as "When [trigger], [move]" — then the tell.
- Then write "RATIONALE:" on a new line.
- Maximum 30 words for the rationale, connecting the mission to today's concept and the user's development need.
- No preamble. No "Here's your mission." Just the mission text, then RATIONALE: and the rationale.`;
}

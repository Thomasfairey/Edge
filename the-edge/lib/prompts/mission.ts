import { Concept, SessionScores } from '../types';
import { LifeContext, isSocialContext, primaryContextForConcept } from '../types';

export function buildMissionPrompt(
  concept: Concept,
  scores: SessionScores,
  serialisedLedger: string,
  context?: LifeContext
): string {
  const weakestDimension = Object.entries(scores).reduce((a, b) =>
    a[1] <= b[1] ? a : b
  );

  const isSocial = isSocialContext(context ?? primaryContextForConcept(concept));

  const personaLine = isSocial
    ? "You are a sharp social coach assigning a single, precise field experiment before the user next walks into a room full of people."
    : "You are a strategic advisor assigning a field operation. Think: a spymaster giving a single, precise instruction before an agent walks into a room.";

  const concreteExample = isSocial
    ? `not "try being more interesting" but "The next time someone asks what you do, skip the job title — instead answer with the one line you're genuinely excited about right now, and watch whether they ask a follow-up."`
    : `not "try using mirroring" but "In your next investor call, mirror the investor's exact phrasing when they state their concern, then pause for 3 full seconds before responding."`;

  const interactionTypes = isSocial
    ? "reference the kind of social moment the user is likely to have in the next day (a dinner, a party, meeting a friend's friends, a date, a coffee, a chat with a stranger in a queue, a group hangout)."
    : "reference the kind of meeting, call, or conversation the user is likely to have (investor call, team 1:1, partnership meeting, networking event, board prep).";

  const observableExample = isSocial
    ? `"Watch if they lean in and ask a follow-up" or "Notice if they light up" or "See if the conversation goes ten minutes past where it would have died."`
    : `"Watch if they pause and rephrase" or "Notice if the energy in the room shifts" or "See if they lean forward."`;

  const lowRiskLine = isSocial
    ? "the mission must be executable without straining a real friendship or making things awkward. No manipulative games, no experiments that could make someone feel used."
    : "the mission must be executable without damaging a real professional relationship. No provocations, no experiments on close colleagues that could backfire.";

  return `${personaLine}

TODAY'S CONCEPT: ${concept.name} (${concept.source})
${concept.description}

USER'S WEAKEST DIMENSION TODAY: ${weakestDimension[0].replace(/_/g, ' ')} (scored ${weakestDimension[1]}/5)

SESSION HISTORY:
${serialisedLedger}

YOUR TASK:
Generate ONE real-world micro-mission for the user to execute within the next 24 hours.

THE MISSION MUST BE:
1. CONCRETE — ${concreteExample}
2. TIED TO A SPECIFIC INTERACTION TYPE — ${interactionTypes}
3. OBSERVABLE — define what success looks like in terms of the OTHER PERSON'S reaction. ${observableExample}
4. LOW-RISK — ${lowRiskLine}
5. TARGETED — if the user scored low on ${weakestDimension[0].replace(/_/g, ' ')}, the mission should specifically exercise that dimension.

CONSTRAINTS:
- Maximum 80 words for the mission.
- Then write "RATIONALE:" on a new line.
- Maximum 30 words for the rationale, connecting the mission to today's concept and the user's development need.
- No preamble. No "Here's your mission." Just the mission text, then RATIONALE: and the rationale.`;
}

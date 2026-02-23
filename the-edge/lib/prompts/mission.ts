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

THE MISSION MUST BE:
1. CONCRETE — not "try using mirroring" but "In your next investor call, mirror the investor's exact phrasing when they state their concern, then pause for 3 full seconds before responding."
2. TIED TO A SPECIFIC INTERACTION TYPE — reference the kind of meeting, call, or conversation the user is likely to have (investor call, team 1:1, partnership meeting, networking event, board prep).
3. OBSERVABLE — define what success looks like in terms of the OTHER PERSON'S reaction. "Watch if they pause and rephrase" or "Notice if the energy in the room shifts" or "See if they lean forward."
4. LOW-RISK — the mission must be executable without damaging a real professional relationship. No provocations, no experiments on close colleagues that could backfire.
5. TARGETED — if the user scored low on ${weakestDimension[0].replace(/_/g, ' ')}, the mission should specifically exercise that dimension.

CONSTRAINTS:
- Maximum 80 words for the mission.
- Then write "RATIONALE:" on a new line.
- Maximum 30 words for the rationale, connecting the mission to today's concept and the user's development need.
- No preamble. No "Here's your mission." Just the mission text, then RATIONALE: and the rationale.`;
}

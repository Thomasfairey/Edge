import type { CheckinState } from "@/lib/checkin";

export function buildCheckinPrompt(
  previousMission: string,
  userOutcome: string,
  outcomeType: 'completed' | 'tried' | 'skipped',
  state?: CheckinState,
  commitment?: string | null
): string {
  // The old prompt knew only "completed / tried / skipped", which collapsed the
  // moment never arriving into the user ducking it. Those deserve opposite
  // responses, so the structured answers are used where they exist.
  const neverCameUp = state?.opportunity === false;
  const duckedIt = state?.opportunity === true && state.enacted === "no";

  const commitmentLine = commitment ? `\nTHEY SAID THEY WOULD DO IT: ${commitment}` : "";

  const situation = neverCameUp
    ? `WHAT HAPPENED: The trigger never occurred. They did not get the chance.

This is NOT a failure and must not be written as one. Do not imply they should have engineered the moment, do not tell them to look harder for opportunities, and do not express disappointment. A cue that did not arrive is a fact about their week, not about them. Acknowledge it briefly and move forward.`
    : duckedIt
      ? `WHAT HAPPENED: The moment came up and they did not take it.

That is an honest answer and worth more than a vague one. Do not scold — and equally, do not wave it away. Name the hesitation plainly and point forward.`
      : `WHAT HAPPENED: ${outcomeType === "completed" ? "They did it." : "They partly did it."}
WHAT THE OTHER PERSON DID: "${userOutcome || "not described"}"`;

  return `You are a sharp coach closing the loop on yesterday before today's session begins.

YESTERDAY'S MISSION: "${previousMission}"${commitmentLine}

${situation}

YOUR TASK:
Deliver exactly ONE sentence that closes yesterday and opens today.

CONSTRAINTS:
- Exactly 1 sentence. No more.
- No pleasantries. No "great job". No "I understand".
- If they described what the other person did, respond to THAT — the specific thing that happened — rather than to the fact that they completed a task.
- Warm but direct. Bridging tone — closing one loop, opening the next.
- After your sentence, add a newline then: [INSIGHT: a brief theory-connecting observation — link their field experience to a specific psychological mechanism, max 15 words]
- End with a final newline then: [CHECKIN_TYPE: ${outcomeType.toUpperCase()}]`;
}

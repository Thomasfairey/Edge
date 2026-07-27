import { Concept, SessionScores } from '../types';
import { LifeContext, isSocialContext, primaryContextForConcept } from '../types';
import { weakestDimension } from '@/lib/scoring-dimensions';

export function buildMissionPrompt(
  concept: Concept,
  scores: SessionScores,
  serialisedLedger: string,
  context?: LifeContext
): string {
  // The set names the keys in `scores`; the weakest one is what the mission
  // should exercise.
  const weakest = weakestDimension(scores, context ?? primaryContextForConcept(concept));
  const weakestLabel = weakest?.label ?? "overall execution";
  const weakestScore = weakest?.score ?? 3;

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

USER'S WEAKEST DIMENSION TODAY: ${weakestLabel} (scored ${weakestScore}/5)

SESSION HISTORY:
${serialisedLedger}

YOUR TASK:
Generate ONE real-world micro-mission for the user to execute within the next 24 hours.

THE MISSION MUST BE:
1. CONCRETE — ${concreteExample}
2. TIED TO A SPECIFIC INTERACTION TYPE — ${interactionTypes}
3. OBSERVABLE — define what success looks like in terms of the OTHER PERSON'S reaction. ${observableExample}
4. LOW-RISK — ${lowRiskLine}
5. TARGETED — if the user scored low on ${weakestLabel}, the mission should specifically exercise that dimension.

MANDATORY OUTPUT FORMAT — exactly these four lines, each on its own line, nothing before or after. No preamble, no "Here's your mission", no markdown:

CUE: When <the specific, recognisable moment that triggers this>
ACTION: I will <the single concrete thing to do in that moment>
TELL: <what to watch for in the other person>
RATIONALE: <why this, for this user, today>

WHY THIS SHAPE MATTERS — the CUE line is the part that decides whether any of this happens. A plan attached to a specific situational trigger gets acted on roughly twice as often as the same plan stated as a goal. So:
- CUE must name a moment the user will RECOGNISE while it is happening. "When someone asks what I do" is a cue. "When I'm at the party" is not — it is a location. "When I get the chance" is not a cue at all.
- CUE must be something likely to actually occur in the next 24 hours. Do not invent an occasion they would have to engineer.
- ACTION must be one behaviour, not a posture. "I will ask what the best part of their week was" is an action. "I will be more curious" is not.
- Write CUE and ACTION in the user's own voice — first person, the words they would think.

LENGTH:
- CUE: max 25 words. ACTION: max 30 words. TELL: max 20 words. RATIONALE: max 30 words.`;
}

export interface ParsedMission {
  /** The trigger, without the "When" stem. */
  cue: string;
  /** The behaviour, without the "I will" stem. */
  action: string;
  /** What to watch for in the other person. */
  tell: string;
  rationale: string;
  /** Everything composed into one line, which is what the ledger stores. */
  text: string;
}

/**
 * Parse the mission block.
 *
 * Never throws. A malformed response still yields a usable mission — the raw
 * text becomes the action — because this phase writes the ledger row and
 * failing here loses the whole session. Losing the if-then structure is a
 * degraded mission; losing the mission is a blank page, which has shipped
 * before.
 */
export function parseMission(raw: string): ParsedMission {
  const field = (name: string): string => {
    // Models bold these labels as `**CUE:**` about as often as `**CUE**:`, so
    // the asterisks have to be allowed on either side of the colon.
    const match = raw.match(
      new RegExp(`^\\s*\\*{0,2}\\s*${name}\\s*\\*{0,2}\\s*:\\s*\\*{0,2}\\s*(.+?)\\s*\\*{0,2}\\s*$`, "im")
    );
    return match?.[1]?.trim() ?? "";
  };

  // The model is asked to write "When ..." and "I will ..."; the UI supplies
  // those stems itself, so strip them rather than rendering "When When ...".
  const stripStem = (value: string, stem: RegExp): string => {
    const stripped = value.replace(stem, "").trim();
    return stripped.charAt(0).toLowerCase() + stripped.slice(1);
  };

  const rawCue = field("CUE");
  const rawAction = field("ACTION");
  const rawTell = field("TELL");
  const rationale = field("RATIONALE");

  // The card labels this "Watch for", and the model writes "Watch if they..."
  // about half the time, which composed to "Watch for: Watch if they...".
  const tell = rawTell.replace(/^watch\s+(?:for|if|whether)\s+/i, "").trim();

  const cue = rawCue ? stripStem(rawCue, /^when\s+/i) : "";
  const action = rawAction ? stripStem(rawAction, /^i\s+will\s+/i) : "";

  if (!cue || !action) {
    // Unstructured output: keep whatever prose came back so the user still has
    // something to do today.
    const fallbackIndex = raw.toUpperCase().indexOf("RATIONALE:");
    const body = (fallbackIndex !== -1 ? raw.slice(0, fallbackIndex) : raw)
      .replace(/^\s*\*?\*?(CUE|ACTION|TELL)\*?\*?\s*:\s*/gim, "")
      .trim();
    return {
      cue,
      action: action || body,
      tell,
      rationale:
        rationale ||
        (fallbackIndex !== -1 ? raw.slice(fallbackIndex + "RATIONALE:".length).trim() : ""),
      text: body || raw.trim(),
    };
  }

  const text = [`When ${cue}, I will ${action}.`, tell && `Watch for: ${tell}`]
    .filter(Boolean)
    .join(" ");

  return { cue, action, tell, rationale, text };
}

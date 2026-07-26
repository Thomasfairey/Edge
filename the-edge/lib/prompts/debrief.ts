import { Concept, CharacterArchetype } from '../types';
import { LifeContext, isSocialContext, primaryContextForConcept } from '../types';
import { dimensionSetFor } from '@/lib/scoring-dimensions';

export function buildDebriefPrompt(
  transcript: { role: string; content: string }[],
  concept: Concept,
  character: CharacterArchetype,
  ledgerCount: number,
  serialisedLedger: string,
  checkinContext?: string,
  context?: LifeContext
): string {
  const formattedTranscript = transcript
    .map((t, i) => `Turn ${Math.floor(i / 2) + 1} — ${t.role === 'assistant' ? character.name.toUpperCase() : 'USER'}: ${t.content}`)
    .join('\n\n');

  const longitudinalInstruction = ledgerCount >= 3
    ? `You have ${ledgerCount} prior sessions of data. ACTIVELY look for recurring behavioural patterns across sessions. When you identify a pattern, call it out with specific day references: "On Day X, you did the same thing when..." This longitudinal awareness is what makes you an elite coach, not a generic chatbot.

SESSION HISTORY:
${serialisedLedger}`
    : `This is session ${ledgerCount + 1}. You have fewer than 3 prior sessions. Focus ENTIRELY on this session's execution. Do NOT attempt to identify longitudinal patterns or make cross-session comparisons — there is insufficient data and any pattern you infer will be fabricated. Be deeply specific about THIS transcript.`;

  const checkinSection = checkinContext
    ? `\n\nFIELD MISSION UPDATE:\nThe user reported on yesterday's mission before this session: "${checkinContext}"\nConnect this field experience to their performance today where relevant — did they apply yesterday's learning?\n`
    : "";

  const isSocial = isSocialContext(context ?? primaryContextForConcept(concept));

  const personaBlock = isSocial
    ? `You are an elite charisma and communication coach. The kind who quietly trains actors, founders, and public figures on how to walk into a room and own it — and who tells them the truth about why they don't yet.

You are blunt. You are specific. You reference exact moments. You never give abstract advice like "be more confident" — you give forensic analysis like "In Turn 4, when they mentioned Kyoto, you moved straight to your own point instead of threading. That's where you lost them. You should have said Z because..."

You do not soften into flattery. You do not say "good effort." You are warm but honest — the reader wants to be genuinely magnetic, not comforted. They need the truth delivered with precision.`
    : `You are an elite coach for high-stakes professional conversations. The kind who tells people what nobody else in the building will.

You are blunt. You are specific. You reference exact moments. You never give abstract advice like "be more assertive" — you give forensic analysis like "In Turn 4, when they said X, you responded with Y. That was a defensive retreat. You should have said Z because..."

You do not soften. You do not encourage. You do not say "good effort." The user is experienced and does not need hand-holding. They need the truth delivered with surgical precision.`;

  // Dimensions come from the session's context, so a family conversation is
  // never scored on "frame control" and a date is never scored on whether the
  // user achieved their objective.
  const set = dimensionSetFor(context ?? primaryContextForConcept(concept));
  const dimensionBlock = set.dimensions
    .map((d) => {
      const detail = d.key === "technique_application"
        ? `Did the user deploy ${concept.name}? How effectively? Reference the specific turn where they used it (or failed to).`
        : d.key === "tactical_awareness"
        ? `Did the user recognise what the character was doing (${character.tactics.slice(0, 2).join(', ')})? Did they adapt? Reference specific turns.`
        : d.prompt;
      return `**${d.label.toUpperCase()}**\n1-2 sentences. ${detail}`;
    })
    .join('\n\n');

  return `${personaBlock}

TODAY'S CONCEPT: ${concept.name} (${concept.source})
${concept.description}

THE CHARACTER THEY FACED: ${character.name}
${character.description}
Tactics used: ${character.tactics.join(', ')}

${longitudinalInstruction}${checkinSection}

THE TRANSCRIPT:

${formattedTranscript}

ADDRESS THE USER DIRECTLY AS "YOU" THROUGHOUT.
Never refer to them in the third person, and never guess at their gender — a
debrief that says "she asked the question and then he skipped the read" is
talking about two people who are both the reader. Write "you asked", "you
skipped". The character is the only third party in this transcript.

YOUR TASK — deliver your analysis in this exact structure:

${dimensionBlock}

**THE REPLAY**
Identify 1-2 specific moments where a different choice would have changed the outcome. For each:
- State the exact turn and what was said
- Explain why it was suboptimal (1 sentence)
- Provide the EXACT alternative phrasing — the actual words they should have said
- The alternative must sound natural, not robotic. Something this specific user would realistically say.

SCORING RUBRIC — use this to assign scores. USE THE FULL RANGE. Do not default to 3s and 4s.

| Score | Meaning |
|-------|---------|
| 1 | Did not attempt. Showed no awareness of the dimension. Was completely passive or ignored the opportunity entirely. |
| 2 | Attempted but it backfired or was deployed incorrectly. The character exploited the attempt. The user may have made their position worse. |
| 3 | Competent but unremarkable. The technique was present but lacked precision, timing, or conviction. Missed at least one clear opportunity. This is the "average" score — most early sessions should cluster here. |
| 4 | Effective deployment with minor missed opportunities. The character was noticeably moved or disrupted. The user showed genuine skill. |
| 5 | Elite execution. The technique was deployed with precise timing, natural delivery, and measurable impact on the character's position. Would work ${isSocial ? 'on a real, hard-to-impress person at a real party' : 'in a real boardroom'}. RARE — a session averaging 4+ across all dimensions should happen less than 10% of the time. |

A CALIBRATION NOTE: If you find yourself giving 4s on everything, you are being too generous. The user WANTS hard scores. A 2 that teaches them something is worth more than a 4 that confirms nothing. Challenge yourself: for every 4 you give, ask "Would this genuinely work on a real version of this character?" If the answer is "maybe", it's a 3.

MANDATORY STRUCTURED OUTPUT — end your response with this EXACT block on new lines. The backend parses this programmatically. Do not modify the format, do not add commentary after it, do not wrap it in markdown code blocks:

---SCORES---
${set.dimensions.map((d) => `${d.key}: [1-5]`).join('\n')}
---LEDGER---
behavioral_weakness_summary: [Exactly 2 sentences. Be specific. Reference turns and patterns. This gets stored and shown to future sessions.]
key_moment: [Exactly 1 sentence. The single most important turn — what happened and what should have happened.]`;
}

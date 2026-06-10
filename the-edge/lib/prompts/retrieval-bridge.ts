import { Concept } from '../types';

/**
 * Retrieval question templates — rotated so the gate tests more than verbatim
 * definition recall (which is trivial seconds after reading the lesson).
 * Each targets a different level of processing:
 *  - application: generate the move in a concrete situation (transfer)
 *  - mechanism: explain WHY it works (elaboration)
 *  - discrimination: know when it BACKFIRES (boundary conditions)
 */
export const RETRIEVAL_QUESTION_TYPES = ['application', 'mechanism', 'discrimination'] as const;
export type RetrievalQuestionType = (typeof RETRIEVAL_QUESTION_TYPES)[number];

export function buildRetrievalQuestion(concept: Concept, type: RetrievalQuestionType): string {
  switch (type) {
    case 'application':
      return `Before we begin — picture the next high-stakes conversation in your calendar. In one or two sentences: what is the exact move you'd make to deploy ${concept.name}, and what reaction tells you it's landing?`;
    case 'mechanism':
      return `Before we begin — in one or two sentences, WHY does ${concept.name} work? Name the psychological mechanism, not just the tactic.`;
    case 'discrimination':
      return `Before we begin — in one or two sentences: when would ${concept.name} backfire? Describe a situation where deploying it would cost you, and what you'd watch for.`;
  }
}

/** Pick a question type — random rotation keeps the gate unpredictable. */
export function pickRetrievalQuestionType(): RetrievalQuestionType {
  return RETRIEVAL_QUESTION_TYPES[Math.floor(Math.random() * RETRIEVAL_QUESTION_TYPES.length)];
}

export function buildRetrievalBridgePrompt(concept: Concept, question?: string): string {
  const questionSection = question
    ? `THE QUESTION THEY WERE ASKED:\n"${question}"\n\nEvaluate their answer AGAINST THAT QUESTION — not against a generic definition. An accurate definition that dodges the question asked is PARTIAL at best.`
    : `They were asked to recall what the concept is and when to deploy it.`;

  return `You are a strict examiner. The user has just read a lesson on "${concept.name}" (${concept.source}).
Concept summary for your reference: ${concept.description}

${questionSection}

YOUR TASK:
Evaluate whether the user's answer demonstrates genuine, usable understanding — not just recognition of the term.

IF CORRECT (their answer is specific, mechanistically sound, and answers the question asked):
→ Reply with a 1-sentence acknowledgement that sharpens one detail of their answer, then end with exactly: "Let's go."

IF PARTIALLY CORRECT (right direction but vague, generic, or answers a different question):
→ Give a 1-sentence correction naming exactly what's missing. Do NOT include "Let's go."

IF WRONG OR VAGUE:
→ Give a 2-sentence correction with the key point they missed. Do NOT include "Let's go."

CONSTRAINTS:
- Your total response must be under 40 words.
- Never re-explain the full concept. The lesson already did that. You're testing recall, not re-teaching.
- ONLY end with "Let's go." if the answer demonstrates genuine understanding. This is the trigger for the frontend to advance — do not use it for wrong or partial answers.`;
}

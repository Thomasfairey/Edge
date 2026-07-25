import { Concept } from '../types';
import { LifeContext, isSocialContext, primaryContextForConcept } from '../types';

export function buildLessonPrompt(
  concept: Concept,
  isReview: boolean = false,
  context?: LifeContext
): string {
  const isSocial = isSocialContext(context ?? primaryContextForConcept(concept));

  const engineLine = isSocial
    ? "You are the Lesson Engine for The Edge — a daily training system for charisma, storytelling, and social presence."
    : "You are the Lesson Engine for The Edge — a daily training system for the conversations that decide things at work.";

  const audienceLine = isSocial
    ? "Write for a sharp, curious adult who wants to be more magnetic, interesting, and memorable in real social life — dinners, parties, dates, new friendships. Precise language, no filler, no self-help fluff or clichés."
    : "Write for an experienced professional: precise language, no filler, no condescension. The reader is well-read and can handle density.";

  const playExampleGuidance = isSocial
    ? `- Name real people and real moments wherever possible (great storytellers, charismatic public figures, memorable hosts, a vivid scene from real social life).
- The example must be so specific and vivid that the reader will recall it that evening at dinner or in a conversation.
- Show the setup, the move, and the effect on the room or the other person.
- BAD example: "A charismatic person told a good story and everyone liked them."
- GOOD example: "At a dinner in 1963, a young journalist asked Cary Grant not 'what's it like being famous' but 'what's the strangest thing a stranger has ever said to you?' Grant paused, delighted, and talked for twenty minutes. She never asked a script question again — because the novelty of the question is what unlocked the man."`
    : `- Name real people and real situations wherever possible (historical, business, political, intelligence).
- The example must be so specific and vivid that the reader will recall it 8 hours later during a meeting.
- Show the setup, the move, and the outcome.
- BAD example: "A CEO used anchoring in a negotiation to set a high price."
- GOOD example: "When Steve Jobs unveiled the iPad in 2010, he opened by displaying '$999' on screen — the price analysts had predicted. He let it sit for ten seconds. Then he dropped it to $499, and the audience gasped. The $999 was never the real price. It was the anchor. Every reviewer wrote that the iPad was 'surprisingly affordable' — a phrase Jobs had engineered by manipulating their reference point before they ever touched the device."`;

  const counterHeader = isSocial ? 'The Pitfall' : 'The Counter';
  const counterBody = isSocial
    ? `100-150 words. Show how this technique goes WRONG — the try-hard, performative, or overdone version that repels people instead of drawing them in. This section must do TWO things:
1. Show how to RECOGNISE the failure mode — what does it look like when someone (including the reader) overdoes this and kills the connection?
2. Show how to FIX it — the specific adjustment that makes it land as genuine rather than forced.
Do not be abstract. Give a scenario and the exact adjustment that rescues it.`
    : `100-150 words. An example of this SAME technique being used AGAINST someone. This section must do TWO things:
1. Show how to RECOGNISE the technique in the wild — what are the telltale signs someone is deploying this on you?
2. Show how to NEUTRALISE it — what is the specific counter-move?
Do not be abstract. Give a scenario and the exact response that defuses it.`;

  const proseTone = isSocial
    ? "Tone: dense, compelling, zero filler. Like the sharpest chapter of a Vanessa Van Edwards book. Warm but never soft, precise but never clinical."
    : "Tone: dense, compelling, zero filler. Like the best page of a Robert Greene book.";

  if (isReview) {
    const advancedPlayGuidance = isSocial
      ? "A DIFFERENT real-world example from the one used in their original lesson. This example should demonstrate a more sophisticated deployment — a layered application, a combination with another social skill, or a high-stakes moment (a first impression, a room to win over) where the technique was the decisive factor. Name real people and real situations."
      : "A DIFFERENT real-world example from the one used in their original lesson. This example should demonstrate a more sophisticated deployment of the technique — a layered application, a combination with another concept, or a high-stakes scenario where the technique was the decisive factor. Name real people and real situations.";

    return `${engineLine}

This is a REVIEW SESSION. The user has studied this concept before and the spaced repetition system has scheduled it for reinforcement.

CONCEPT TO REVIEW:
Name: ${concept.name}
Domain: ${concept.domain}
Source: ${concept.source}
Description: ${concept.description}

YOUR TASK:
Deliver a condensed review lesson in this EXACT two-part structure. Use these headers exactly as written.

## The Refresher
120-150 words. Skip the basics — the user knows the theory. Instead, deliver the ADVANCED nuance they probably missed the first time. The subtle distinction, the edge case, the counter-intuitive application. Reference the original source author but go deeper than the textbook explanation.

## The Advanced Play
130-200 words. ${advancedPlayGuidance}

ABSOLUTE CONSTRAINTS:
- Total output: 250-350 words. HARD LIMIT.
- Write in prose paragraphs. No bullet points. No numbered lists.
- Tone: dense, compelling, zero filler. The reader already knows this — make them see it differently.
- The reader should feel sharper, not lectured.`;
  }

  return `${engineLine}

TODAY'S CONCEPT:
Name: ${concept.name}
Domain: ${concept.domain}
Source: ${concept.source}
Description: ${concept.description}

YOUR TASK:
Deliver a micro-lesson on this concept following this EXACT three-part structure. Use these headers exactly as written.

## The Principle
100-150 words. Explain what this concept is and WHY it works — the psychological or social mechanism, not just the tactic. Attribution to the source author is mandatory. ${audienceLine}

## The Play
150-200 words. A vivid, SPECIFIC real-world example of this technique deployed effectively. Requirements:
${playExampleGuidance}

## ${counterHeader}
${counterBody}

ABSOLUTE CONSTRAINTS:
- Total output: 400-600 words. HARD LIMIT. Do not exceed 600 words under any circumstances.
- Write in prose paragraphs. No bullet points. No numbered lists.
- ${proseTone}
- The reader should feel sharper after reading this. Not lectured. Not patronised. Sharper.`;
}

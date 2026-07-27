import { Concept } from '../types';
import { LifeContext, isSocialContext, primaryContextForConcept } from '../types';

export function buildLessonPrompt(
  concept: Concept,
  isReview: boolean = false,
  context?: LifeContext,
  /** Which of this concept's sessions this is. 1 teaches it; 2 and 3 do not. */
  rep: number = 1
): string {
  const resolved = context ?? primaryContextForConcept(concept);
  const isSocial = isSocialContext(resolved);

  // Knowing only "social vs work" was not enough. For a source whose canonical
  // material is business — Carnegie above all — the model fell straight back to
  // salespeople and mechanical engineers in a session the user had explicitly
  // chosen Dating for. The setting has to be named, and business examples have
  // to be ruled out explicitly rather than merely not requested.
  const SETTING: Record<LifeContext, { audience: string; drawFrom: string; recallMoment: string }> = {
    dating: {
      audience: "someone who wants to be better on dates and in the early, uncertain part of romance",
      drawFrom: "dates, courtship, flirtation, the beginnings and endings of relationships",
      recallMoment: "on a date this weekend",
    },
    friends: {
      audience: "someone who wants to be a better friend, and to have closer ones",
      drawFrom: "friendships, long ones and new ones, and the ordinary moments that deepen or fail to deepen them",
      recallMoment: "the next time they see a friend",
    },
    groups: {
      audience: "someone who wants to be better in rooms full of people — parties, dinners, gatherings",
      drawFrom: "parties, dinners, gatherings, and the social dynamics of groups",
      recallMoment: "at the next gathering they walk into",
    },
    family: {
      audience: "someone who wants to handle their family better, including the conversations they have been avoiding",
      drawFrom: "families — parents, siblings, partners, and the long history between people who cannot walk away from each other",
      recallMoment: "the next time they are in a room with their family",
    },
    work: {
      audience: "an experienced professional who is well-read and can handle density",
      drawFrom: "business, politics, negotiation, intelligence, and history",
      recallMoment: "in a meeting later today",
    },
  };
  const setting = SETTING[resolved];

  const engineLine = isSocial
    ? "You are the Lesson Engine for The Edge — a daily training system for being genuinely good with people."
    : "You are the Lesson Engine for The Edge — a daily training system for the conversations that decide things at work.";

  const audienceLine = `Write for ${setting.audience}. Precise language, no filler, no condescension, no self-help clichés.`;

  const businessBan = isSocial
    ? `
- THIS SESSION IS ABOUT ${resolved.toUpperCase()}, NOT WORK. Do not use business, sales, negotiation, management or workplace examples, and do not describe the reader as a professional. If the source of this concept is best known for business writing, translate the idea into ${setting.drawFrom} rather than repeating their commercial framing — the reader chose this setting deliberately.
- Do not reach for careers as a source of detail either. "Ask what makes a gear system fail" is a work example wearing a social costume.`
    : "";

  const playExampleGuidance = isSocial
    ? `- Draw the example from ${setting.drawFrom}. Name real people and real moments where you can; a vivid invented scene is better than a real business one.
- The example must be so specific that the reader will recall it ${setting.recallMoment}.
- Show the setup, the move, and the effect on the other person.${businessBan}
- BAD example: "A charismatic person told a good story and everyone liked them."
- GOOD example: "At a dinner in 1963, a young journalist asked Cary Grant not 'what's it like being famous' but 'what's the strangest thing a stranger has ever said to you?' Grant paused, delighted, and talked for twenty minutes. She never asked a script question again — because the novelty of the question is what unlocked the man."`
    : `- Name real people and real situations wherever possible (historical, business, political, intelligence).
- The example must be so specific and vivid that the reader will recall it ${setting.recallMoment}.
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
120-150 words. Skip the basics — the user knows the theory. Restate the underlying mechanism in one sentence so it is fresh before they practise, then deliver the ADVANCED nuance they probably missed the first time. The subtle distinction, the edge case, the counter-intuitive application. Reference the original source author but go deeper than the textbook explanation.

## The Advanced Play
130-200 words. ${advancedPlayGuidance}

ABSOLUTE CONSTRAINTS:
- Total output: 250-350 words. HARD LIMIT.
- Write in prose paragraphs. No bullet points. No numbered lists.
- Tone: dense, compelling, zero filler. The reader already knows this — make them see it differently.
- The reader should feel sharper, not lectured.`;
  }

  // Sessions 2 and 3 of a concept must not re-teach it.
  //
  // The reader has had the full lesson and has already tried the technique on a
  // real scene — re-explaining at that point is the expertise-reversal effect in
  // action: the worked example that helped on day one actively gets in the way
  // once there is a schema to hang things on. It is also, straightforwardly,
  // what would make three sessions on one concept feel like the app repeating
  // itself. So the teaching fades and the practice grows.
  if (rep >= 3) {
    return `${engineLine}

THE CONCEPT: ${concept.name} (${concept.source})
${concept.description}

This is the reader's THIRD and final session on this concept. They have had the full lesson and practised it twice. They do not need teaching. They need pointing at the door.

YOUR TASK:
Write ONE short paragraph, 50-80 words, under this exact header:

## The Cue

State the technique as a single instruction they can hold in their head during the conversation that is about to start — the compressed version, the thing they say to themselves. Then one sentence on the failure mode they are most likely to fall into on a third attempt: getting mechanical with it, or over-applying it now that it is familiar.

ABSOLUTE CONSTRAINTS:
- 80 words maximum. HARD LIMIT.
- Do NOT restate the mechanism, the evidence, the source, or an example. They have all of it.
- No preamble. No "as you'll remember". Start with the instruction.
- Prose. No bullets, no lists.
- ${audienceLine}`;
  }

  if (rep === 2) {
    return `${engineLine}

THE CONCEPT: ${concept.name} (${concept.source})
${concept.description}

This is the reader's SECOND session on this concept. They had the full lesson yesterday and have practised it once, against a different person in a different situation. They are about to practise it again with someone new.

YOUR TASK:
Deliver a short refresher in this EXACT two-part structure. Use these headers exactly as written.

## The Reminder
50-70 words. The mechanism in one or two sentences — WHY this works on the other person, not what the move is. Nothing else. Assume they remember the technique and have forgotten why it functions, which is the part that decides whether they deploy it well or mechanically.

## Where It Slips
80-110 words. The specific way this technique degrades on a second attempt: the reader now knows the move and will be tempted to execute it as a move — visibly, on schedule, regardless of whether the moment called for it. Name what that looks like from the other side, and the adjustment that keeps it responsive rather than rehearsed. Give a concrete moment from ${setting.drawFrom}, not an abstraction.${businessBan}

ABSOLUTE CONSTRAINTS:
- Total output: 130-180 words. HARD LIMIT.
- Do NOT re-teach the concept, restate the evidence, or repeat yesterday's example.
- Prose paragraphs. No bullet points, no numbered lists.
- ${audienceLine}
- ${proseTone}`;
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
120-180 words. This section is the point of the whole session — the reader is about to practise this in a conversation, and they need to understand the mechanism before they do, not just the move.

Cover, in this order:
1. What the technique actually is, in one sentence.
2. WHY IT WORKS — the psychological or social mechanism underneath it. Name what is happening in the other person: what they are processing, what they cannot help responding to, what it costs them. This is mandatory and it is the part readers remember. "It builds rapport" is not a mechanism; "naming an emotion out loud engages the part of the brain that regulates it, so the feeling loses intensity the moment it is accurately labelled" is.
3. The evidence, attributed to ${concept.source} — the study, the finding, the observed pattern, or the body of work it comes from. Be specific about what was actually found where that is known.

${audienceLine}

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

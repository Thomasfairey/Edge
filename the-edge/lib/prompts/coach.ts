import { Concept } from '../types';

export function buildCoachPrompt(
  transcript: { role: string; content: string }[],
  concept: Concept
): string {
  const formattedTranscript = transcript
    .map((t) => `${t.role === 'assistant' ? 'CHARACTER' : 'USER'}: ${t.content}`)
    .join('\n\n');

  return `You are an elite tactical advisor. A spymaster watching a live operation through a one-way mirror.

The user is in a roleplay practising: ${concept.name} (${concept.description})

Here is the conversation so far:

${formattedTranscript}

YOUR TASK:
Provide exactly 2-3 tactical moves the user could make on their NEXT turn. For each move:
- State what it is in 3-5 words (the tactic name)
- Give the EXACT WORDS to say. Not a description of what to say. The actual sentence.

FORMAT — use exactly this:
1. [TACTIC]: "[Exact words to say]"
2. [TACTIC]: "[Exact words to say]"
3. [TACTIC]: "[Exact words to say]"

CONSTRAINTS:
- Maximum 150 words total.
- No preamble. No "Here's what I'd suggest." Just the numbered options.
- No encouragement. No "You're doing well." Just tactics.
- Each option must be a genuinely different strategic direction, not variations of the same move.
- At least one option should involve the day's concept (${concept.name}).`;
}

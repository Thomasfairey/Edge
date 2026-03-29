/**
 * Score calibration and validation service.
 *
 * Addresses the "scoring feels off" pain point with:
 * 1. Rubric-anchored scoring — explicit criteria per level per dimension
 * 2. Score validation — ensures AI-generated scores are within bounds
 * 3. Relative scoring context — provides user's rolling averages for comparison
 * 4. Score parsing — extracts structured scores from AI response text
 */

import { SessionScores, SCORE_DIMENSIONS } from "../types/domain.js";
import { ValidationError } from "../types/errors.js";

// ---------------------------------------------------------------------------
// Scoring rubric — embedded in debrief prompt
// ---------------------------------------------------------------------------

export const SCORING_RUBRIC = `
## Scoring Rubric — Use EXACTLY These Criteria

Score each dimension 1-5. You MUST cite a specific transcript turn to justify each score.

### Technique Application
1 = Did not attempt the day's concept at all
2 = Mentioned or attempted the concept but applied it incorrectly or at the wrong moment
3 = Applied the concept once with partial effectiveness — the right idea but clumsy execution
4 = Applied the concept effectively at least once — clear intent, good timing, visible impact
5 = Applied the concept multiple times with natural fluency — adapted it to the flow of conversation

### Tactical Awareness
1 = Did not recognise any of the character's tactics — responded reactively throughout
2 = Recognised one tactic but did not adjust approach — awareness without adaptation
3 = Recognised tactics and made one meaningful adjustment mid-conversation
4 = Read the character's strategy accurately and adapted approach multiple times
5 = Anticipated the character's moves before they deployed them — proactive, not reactive

### Frame Control
1 = The character controlled the frame throughout — the user accepted every premise
2 = Attempted to set a frame but lost it immediately when challenged
3 = Established a frame and held it for part of the conversation but conceded under pressure
4 = Set and maintained a strong frame throughout most of the exchange — recovered when challenged
5 = Dominated the frame from the start — redirected the character's frames and set new ones at will

### Emotional Regulation
1 = Became visibly reactive — defensive language, justification spirals, loss of composure
2 = Showed signs of reactivity (defensive tone, over-explanation) but partially recovered
3 = Maintained composure under moderate pressure — one wobble but self-corrected
4 = Remained composed and strategic throughout — did not take bait or react emotionally
5 = Used emotional composure as a deliberate tool — silence, calm, controlled responses that shifted power

### Strategic Outcome
1 = Did not achieve the session objective — the character achieved their goal instead
2 = Partial progress toward the objective but the character maintained the upper hand
3 = Achieved the objective partially — some movement but not a clear win
4 = Achieved the stated objective with a clear, demonstrable shift in the character's position
5 = Exceeded the objective — achieved the goal AND established a stronger strategic position for future interactions
`;

// ---------------------------------------------------------------------------
// Parse scores from AI response
// ---------------------------------------------------------------------------

/**
 * Extract scores from the structured block in the AI debrief response.
 * Expected format:
 * ---SCORES---
 * technique_application: 3
 * tactical_awareness: 4
 * ...
 * ---END_SCORES---
 */
export function parseScores(text: string): SessionScores | null {
  const scoresMatch = text.match(/---SCORES---\s*([\s\S]*?)\s*---END_SCORES---/);
  if (!scoresMatch) return null;

  const scoresBlock = scoresMatch[1];
  const scores: Partial<SessionScores> = {};

  for (const dim of SCORE_DIMENSIONS) {
    const match = scoresBlock.match(new RegExp(`${dim}:\\s*(\\d+)`));
    if (match) {
      const value = parseInt(match[1], 10);
      if (value >= 1 && value <= 5) {
        scores[dim] = value;
      }
    }
  }

  // Validate all dimensions are present
  if (SCORE_DIMENSIONS.every((d) => scores[d] !== undefined)) {
    return scores as SessionScores;
  }

  return null;
}

/**
 * Parse the ledger fields from the AI debrief response.
 */
export function parseLedgerFields(text: string): {
  behavioral_weakness_summary: string;
  key_moment: string;
} | null {
  const ledgerMatch = text.match(/---LEDGER---\s*([\s\S]*?)\s*---END_LEDGER---/);
  if (!ledgerMatch) return null;

  const block = ledgerMatch[1];
  // Use lookahead to capture multi-line values up to the next field or end of block
  const summaryMatch = block.match(/behavioral_weakness_summary:\s*(.+?)(?=\nkey_moment:)/s);
  const momentMatch = block.match(/key_moment:\s*(.+?)$/s);

  if (!summaryMatch || !momentMatch) return null;

  return {
    behavioral_weakness_summary: summaryMatch[1].trim(),
    key_moment: momentMatch[1].trim(),
  };
}

/**
 * Validate scores are within acceptable ranges.
 */
export function validateScores(scores: SessionScores): void {
  for (const dim of SCORE_DIMENSIONS) {
    const value = scores[dim];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new ValidationError(`Score ${dim} must be integer 1-5, got ${value}`);
    }
  }
}

/**
 * Calculate average score across all dimensions.
 */
export function averageScore(scores: SessionScores): number {
  const values = SCORE_DIMENSIONS.map((d) => scores[d]);
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * Generate rolling average context for the debrief prompt.
 * This helps the AI calibrate scores relative to the user's history.
 */
export function generateScoringContext(
  recentScores: Array<{ day: number; scores: SessionScores }>
): string {
  if (recentScores.length === 0) {
    return "This is the user's first session. Score based on absolute performance against the rubric.";
  }

  const averages: Record<string, number> = {};
  for (const dim of SCORE_DIMENSIONS) {
    const values = recentScores.map((s) => s.scores[dim]);
    averages[dim] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  const lines = SCORE_DIMENSIONS.map(
    (d) => `- ${d}: rolling avg ${averages[d]}`
  );

  return `## User's Rolling Averages (last ${recentScores.length} sessions)\n${lines.join("\n")}\n\nScore relative to the rubric but note significant improvements or regressions from these baselines.`;
}

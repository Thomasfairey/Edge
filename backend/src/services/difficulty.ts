/**
 * Adaptive difficulty service.
 *
 * Adjusts scenario difficulty (1-5) based on the user's rolling performance.
 * Uses a simple algorithm:
 * - Rolling average >= 4.0 → increase difficulty
 * - Rolling average <= 2.5 → decrease difficulty
 * - Otherwise → maintain current level
 *
 * Difficulty affects:
 * - Character assertiveness and tactical complexity
 * - Scenario pressure level
 * - Expected performance bar in scoring
 */

import { SessionScores, SCORE_DIMENSIONS } from "../types/domain.js";

const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
const DEFAULT_DIFFICULTY = 3;

/**
 * Calculate the appropriate difficulty for the next session
 * based on the user's recent performance history.
 */
export function calculateDifficulty(
  recentScores: Array<{ day: number; scores: SessionScores }>,
  currentDifficulty?: number
): number {
  if (recentScores.length < 2) {
    // Not enough data — use default
    return currentDifficulty ?? DEFAULT_DIFFICULTY;
  }

  // Calculate rolling average across all dimensions
  const rollingAvg = calculateRollingAverage(recentScores);
  const base = currentDifficulty ?? DEFAULT_DIFFICULTY;

  if (rollingAvg >= 4.0) {
    // High performer — increase challenge
    return Math.min(base + 1, MAX_DIFFICULTY);
  } else if (rollingAvg <= 2.5) {
    // Struggling — reduce pressure
    return Math.max(base - 1, MIN_DIFFICULTY);
  }

  return base;
}

/**
 * Calculate the rolling average across all dimensions from recent scores.
 */
function calculateRollingAverage(
  recentScores: Array<{ day: number; scores: SessionScores }>
): number {
  if (recentScores.length === 0) return 0;

  let total = 0;
  let count = 0;

  for (const entry of recentScores) {
    for (const dim of SCORE_DIMENSIONS) {
      total += entry.scores[dim];
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Generate a difficulty modifier string for the roleplay prompt.
 * This adjusts the character's behaviour based on difficulty level.
 */
export function difficultyModifier(difficulty: number): string {
  switch (difficulty) {
    case 1:
      return `## Difficulty: Level 1 (Foundation)
- Be moderately challenging but give the user openings to practise
- Deploy 1-2 tactics, not your full arsenal
- Respond positively to even partially effective technique application
- Keep pressure at a conversational level — no high-stakes escalation`;

    case 2:
      return `## Difficulty: Level 2 (Developing)
- Apply moderate pressure and deploy 2-3 tactics
- Give some openings but don't make it easy
- Respond realistically to technique application — partial credit for effort`;

    case 3:
      return `## Difficulty: Level 3 (Competent)
- Apply realistic pressure at a professional level
- Deploy your full range of tactics naturally
- Only concede when the user demonstrates genuine skill`;

    case 4:
      return `## Difficulty: Level 4 (Advanced)
- Apply significant pressure — this should feel like a real high-stakes interaction
- Actively counter the user's techniques when you recognise them
- Only concede when the user demonstrates sustained, sophisticated skill
- Escalate if the user's approach is weak`;

    case 5:
      return `## Difficulty: Level 5 (Elite)
- Maximum realistic pressure — this is the hardest version of this scenario
- Counter techniques proactively — anticipate what the user might try
- Do not concede easily under any circumstances
- Deploy your most sophisticated tactics
- Only yield to genuinely elite-level influence and persuasion`;

    default:
      return "";
  }
}

/**
 * Generate difficulty context for the debrief prompt.
 * This helps the AI calibrate scoring expectations to the difficulty level.
 */
export function difficultyContext(difficulty: number): string {
  if (difficulty <= 2) {
    return `\nNote: This was a difficulty ${difficulty}/5 scenario. Score against absolute performance but acknowledge the reduced difficulty when noting tactical achievements.`;
  }
  if (difficulty >= 4) {
    return `\nNote: This was a difficulty ${difficulty}/5 scenario. The character was highly assertive. Give appropriate credit for performance under elevated pressure — a 3 at difficulty 5 may represent stronger performance than a 4 at difficulty 2.`;
  }
  return "";
}

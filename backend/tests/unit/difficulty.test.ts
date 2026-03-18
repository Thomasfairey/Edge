/**
 * Unit tests for the adaptive difficulty service.
 */

import { describe, it, expect } from "vitest";
import {
  calculateDifficulty,
  difficultyModifier,
  difficultyContext,
} from "../../src/services/difficulty.js";
import type { SessionScores } from "../../src/types/domain.js";

function makeScores(avg: number): SessionScores {
  return {
    technique_application: avg,
    tactical_awareness: avg,
    frame_control: avg,
    emotional_regulation: avg,
    strategic_outcome: avg,
  };
}

describe("calculateDifficulty", () => {
  it("should return default when insufficient data", () => {
    expect(calculateDifficulty([])).toBe(3);
    expect(calculateDifficulty([{ day: 1, scores: makeScores(4) }])).toBe(3);
  });

  it("should increase difficulty for high performers", () => {
    const scores = [
      { day: 1, scores: makeScores(4) },
      { day: 2, scores: makeScores(5) },
      { day: 3, scores: makeScores(4) },
    ];
    expect(calculateDifficulty(scores, 3)).toBe(4);
  });

  it("should decrease difficulty for struggling users", () => {
    const scores = [
      { day: 1, scores: makeScores(2) },
      { day: 2, scores: makeScores(2) },
    ];
    expect(calculateDifficulty(scores, 3)).toBe(2);
  });

  it("should maintain difficulty for average performance", () => {
    const scores = [
      { day: 1, scores: makeScores(3) },
      { day: 2, scores: makeScores(3) },
    ];
    expect(calculateDifficulty(scores, 3)).toBe(3);
  });

  it("should not exceed maximum difficulty", () => {
    const scores = [
      { day: 1, scores: makeScores(5) },
      { day: 2, scores: makeScores(5) },
    ];
    expect(calculateDifficulty(scores, 5)).toBe(5);
  });

  it("should not go below minimum difficulty", () => {
    const scores = [
      { day: 1, scores: makeScores(1) },
      { day: 2, scores: makeScores(1) },
    ];
    expect(calculateDifficulty(scores, 1)).toBe(1);
  });

  it("should use default when no current difficulty provided", () => {
    expect(calculateDifficulty([], undefined)).toBe(3);
  });
});

describe("difficultyModifier", () => {
  it("should return prompt modifier for each level", () => {
    for (let level = 1; level <= 5; level++) {
      const modifier = difficultyModifier(level);
      expect(modifier).toContain("Difficulty");
      expect(modifier.length).toBeGreaterThan(50);
    }
  });

  it("should be easier at level 1 and harder at level 5", () => {
    const easy = difficultyModifier(1);
    const hard = difficultyModifier(5);
    expect(easy).toContain("Foundation");
    expect(hard).toContain("Elite");
  });
});

describe("difficultyContext", () => {
  it("should return context for low difficulty", () => {
    const context = difficultyContext(2);
    expect(context).toContain("reduced difficulty");
  });

  it("should return context for high difficulty", () => {
    const context = difficultyContext(4);
    expect(context).toContain("elevated pressure");
  });

  it("should return empty string for mid difficulty", () => {
    expect(difficultyContext(3)).toBe("");
  });
});

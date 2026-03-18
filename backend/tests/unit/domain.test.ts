/**
 * Unit tests for domain types and constants.
 */

import { describe, it, expect } from "vitest";
import {
  SCORE_DIMENSIONS,
  TIER_LIMITS,
  type SessionScores,
  type ConceptDomain,
} from "../../src/types/domain.js";

describe("SCORE_DIMENSIONS", () => {
  it("should have exactly 5 dimensions", () => {
    expect(SCORE_DIMENSIONS).toHaveLength(5);
  });

  it("should contain all expected dimensions", () => {
    expect(SCORE_DIMENSIONS).toContain("technique_application");
    expect(SCORE_DIMENSIONS).toContain("tactical_awareness");
    expect(SCORE_DIMENSIONS).toContain("frame_control");
    expect(SCORE_DIMENSIONS).toContain("emotional_regulation");
    expect(SCORE_DIMENSIONS).toContain("strategic_outcome");
  });
});

describe("TIER_LIMITS", () => {
  it("free tier should limit sessions", () => {
    expect(TIER_LIMITS.free.sessions_per_week).toBe(3);
  });

  it("free tier should restrict domains", () => {
    expect(TIER_LIMITS.free.domains).toHaveLength(2);
    expect(TIER_LIMITS.free.domains).toContain("Influence & Persuasion");
  });

  it("free tier should restrict characters", () => {
    expect(TIER_LIMITS.free.characters).toHaveLength(3);
  });

  it("free tier should disable premium features", () => {
    expect(TIER_LIMITS.free.features.trend_analysis).toBe(false);
    expect(TIER_LIMITS.free.features.mission_accountability).toBe(false);
    expect(TIER_LIMITS.free.features.spaced_repetition).toBe(false);
    expect(TIER_LIMITS.free.features.voice_mode).toBe(false);
  });

  it("pro tier should have unlimited sessions", () => {
    expect(TIER_LIMITS.pro.sessions_per_week).toBe(Infinity);
  });

  it("pro tier should have all domains", () => {
    expect(TIER_LIMITS.pro.domains).toBeNull();
  });

  it("pro tier should enable all features", () => {
    expect(TIER_LIMITS.pro.features.trend_analysis).toBe(true);
    expect(TIER_LIMITS.pro.features.mission_accountability).toBe(true);
    expect(TIER_LIMITS.pro.features.spaced_repetition).toBe(true);
    expect(TIER_LIMITS.pro.features.voice_mode).toBe(true);
  });
});

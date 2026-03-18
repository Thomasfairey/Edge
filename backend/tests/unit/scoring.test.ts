/**
 * Unit tests for the scoring service.
 */

import { describe, it, expect } from "vitest";
import {
  parseScores,
  parseLedgerFields,
  validateScores,
  averageScore,
  generateScoringContext,
} from "../../src/services/scoring.js";
import type { SessionScores } from "../../src/types/domain.js";

// ---------------------------------------------------------------------------
// parseScores
// ---------------------------------------------------------------------------

describe("parseScores", () => {
  it("should parse valid scores block", () => {
    const text = `Some debrief text here.

---SCORES---
technique_application: 3
tactical_awareness: 4
frame_control: 2
emotional_regulation: 5
strategic_outcome: 3
---END_SCORES---

More text after.`;

    const scores = parseScores(text);
    expect(scores).toEqual({
      technique_application: 3,
      tactical_awareness: 4,
      frame_control: 2,
      emotional_regulation: 5,
      strategic_outcome: 3,
    });
  });

  it("should return null when no scores block present", () => {
    const text = "Just a regular debrief without structured scores.";
    expect(parseScores(text)).toBeNull();
  });

  it("should return null when scores block is incomplete", () => {
    const text = `---SCORES---
technique_application: 3
tactical_awareness: 4
---END_SCORES---`;

    expect(parseScores(text)).toBeNull();
  });

  it("should reject scores outside 1-5 range", () => {
    const text = `---SCORES---
technique_application: 0
tactical_awareness: 6
frame_control: 3
emotional_regulation: 3
strategic_outcome: 3
---END_SCORES---`;

    expect(parseScores(text)).toBeNull();
  });

  it("should handle scores with extra whitespace", () => {
    const text = `---SCORES---
  technique_application:  3
  tactical_awareness:  4
  frame_control:  2
  emotional_regulation:  5
  strategic_outcome:  3
---END_SCORES---`;

    const scores = parseScores(text);
    expect(scores).not.toBeNull();
    expect(scores!.technique_application).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parseLedgerFields
// ---------------------------------------------------------------------------

describe("parseLedgerFields", () => {
  it("should parse valid ledger block", () => {
    const text = `Debrief content here.

---LEDGER---
behavioral_weakness_summary: Defaulted to defensive justification when challenged. Lost frame control by explaining rather than redirecting.
key_moment: Turn 4: Investor challenged unit economics and user responded with data dump instead of reframe.
---END_LEDGER---`;

    const fields = parseLedgerFields(text);
    expect(fields).not.toBeNull();
    expect(fields!.behavioral_weakness_summary).toContain("defensive justification");
    expect(fields!.key_moment).toContain("Turn 4");
  });

  it("should return null when no ledger block present", () => {
    expect(parseLedgerFields("No ledger here.")).toBeNull();
  });

  it("should return null when fields are missing", () => {
    const text = `---LEDGER---
behavioral_weakness_summary: Something here.
---END_LEDGER---`;

    expect(parseLedgerFields(text)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateScores
// ---------------------------------------------------------------------------

describe("validateScores", () => {
  it("should accept valid scores", () => {
    const scores: SessionScores = {
      technique_application: 1,
      tactical_awareness: 5,
      frame_control: 3,
      emotional_regulation: 2,
      strategic_outcome: 4,
    };
    expect(() => validateScores(scores)).not.toThrow();
  });

  it("should reject score below 1", () => {
    const scores: SessionScores = {
      technique_application: 0,
      tactical_awareness: 3,
      frame_control: 3,
      emotional_regulation: 3,
      strategic_outcome: 3,
    };
    expect(() => validateScores(scores)).toThrow();
  });

  it("should reject score above 5", () => {
    const scores: SessionScores = {
      technique_application: 6,
      tactical_awareness: 3,
      frame_control: 3,
      emotional_regulation: 3,
      strategic_outcome: 3,
    };
    expect(() => validateScores(scores)).toThrow();
  });

  it("should reject non-integer scores", () => {
    const scores: SessionScores = {
      technique_application: 3.5,
      tactical_awareness: 3,
      frame_control: 3,
      emotional_regulation: 3,
      strategic_outcome: 3,
    };
    expect(() => validateScores(scores)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// averageScore
// ---------------------------------------------------------------------------

describe("averageScore", () => {
  it("should calculate correct average", () => {
    const scores: SessionScores = {
      technique_application: 3,
      tactical_awareness: 4,
      frame_control: 2,
      emotional_regulation: 5,
      strategic_outcome: 1,
    };
    expect(averageScore(scores)).toBe(3);
  });

  it("should round to one decimal", () => {
    const scores: SessionScores = {
      technique_application: 3,
      tactical_awareness: 3,
      frame_control: 3,
      emotional_regulation: 3,
      strategic_outcome: 4,
    };
    expect(averageScore(scores)).toBe(3.2);
  });

  it("should handle all 5s", () => {
    const scores: SessionScores = {
      technique_application: 5,
      tactical_awareness: 5,
      frame_control: 5,
      emotional_regulation: 5,
      strategic_outcome: 5,
    };
    expect(averageScore(scores)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// generateScoringContext
// ---------------------------------------------------------------------------

describe("generateScoringContext", () => {
  it("should return first session message when no history", () => {
    const result = generateScoringContext([]);
    expect(result).toContain("first session");
  });

  it("should generate rolling averages from history", () => {
    const recentScores = [
      {
        day: 1,
        scores: {
          technique_application: 3,
          tactical_awareness: 4,
          frame_control: 2,
          emotional_regulation: 5,
          strategic_outcome: 3,
        },
      },
      {
        day: 2,
        scores: {
          technique_application: 4,
          tactical_awareness: 3,
          frame_control: 3,
          emotional_regulation: 4,
          strategic_outcome: 4,
        },
      },
    ];

    const result = generateScoringContext(recentScores);
    expect(result).toContain("Rolling Averages");
    expect(result).toContain("technique_application");
    expect(result).toContain("last 2 sessions");
  });
});

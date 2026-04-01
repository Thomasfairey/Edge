/**
 * Comprehensive unit tests for The Edge core library functions.
 *
 * Covers: validate.ts, types.ts, debrief parsing logic, SM-2 date math.
 * Uses Node.js built-in test runner (node:test + node:assert).
 * Run with: npx tsx lib/__tests__/core.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Imports from lib/validate.ts (using relative paths to avoid @/ alias issues)
// ---------------------------------------------------------------------------
import {
  validateTranscript as validateTranscriptStrict,
  validateText,
  validateScores as validateScoresStrict,
  validateConcept,
  validateCharacter,
  ValidationError,
} from "../validate";

// ---------------------------------------------------------------------------
// Imports from lib/types.ts
// ---------------------------------------------------------------------------
import {
  clampScore,
  validateScores as validateScoresSoft,
  isValidMessage,
  validateTranscript as validateTranscriptSoft,
  truncate,
  SCORE_KEYS as _SCORE_KEYS,
  type SessionScores,
  type Message,
} from "../types";

// ---------------------------------------------------------------------------
// Non-exported functions copied from app/api/debrief/route.ts for testing
// ---------------------------------------------------------------------------

const DEFAULT_SCORES: SessionScores = {
  technique_application: 3,
  tactical_awareness: 3,
  frame_control: 3,
  emotional_regulation: 3,
  strategic_outcome: 3,
};

function parseScores(text: string): SessionScores {
  const scoresMatch = text.match(
    /---SCORES---\s*([\s\S]*?)(?:---LEDGER---|$)/
  );
  if (!scoresMatch) {
    return { ...DEFAULT_SCORES };
  }

  const block = scoresMatch[1];

  const extract = (key: string): number => {
    const match = block.match(new RegExp(`${key}:\\s*(\\d+)`));
    if (!match) return 3;
    return clampScore(parseInt(match[1], 10));
  };

  return {
    technique_application: extract("technique_application"),
    tactical_awareness: extract("tactical_awareness"),
    frame_control: extract("frame_control"),
    emotional_regulation: extract("emotional_regulation"),
    strategic_outcome: extract("strategic_outcome"),
  };
}

function parseLedgerFields(text: string): {
  behavioralWeaknessSummary: string;
  keyMoment: string;
} {
  const ledgerMatch = text.match(/---LEDGER---\s*([\s\S]*?)(?:```|$)/);
  if (!ledgerMatch) {
    return {
      behavioralWeaknessSummary:
        "Unable to extract behavioural summary from debrief.",
      keyMoment: "Unable to extract key moment from debrief.",
    };
  }

  const block = ledgerMatch[1];

  const summaryMatch = block.match(
    /behavioral_weakness_summary:\s*([\s\S]*?)(?:key_moment:|$)/
  );
  const momentMatch = block.match(/key_moment:\s*([\s\S]*?)$/);

  return {
    behavioralWeaknessSummary:
      summaryMatch?.[1]?.trim() ||
      "Unable to extract behavioural summary.",
    keyMoment:
      momentMatch?.[1]?.trim() || "Unable to extract key moment.",
  };
}

function computeFallbackScores(
  transcript: Message[],
  commandsUsed: string[]
): SessionScores {
  const userTurns = transcript.filter((t) => t.role === "user").length;
  const turnCount = transcript.length;
  const usedCoach = commandsUsed.includes("/coach");
  const usedSkip = commandsUsed.includes("/skip");

  const base = Math.min(
    5,
    Math.max(
      1,
      2 + (userTurns > 4 ? 1 : 0) + (usedCoach ? 1 : 0) - (usedSkip ? 1 : 0)
    )
  );

  return {
    technique_application: Math.max(1, base - (turnCount < 4 ? 1 : 0)),
    tactical_awareness: base,
    frame_control: Math.max(1, base - (usedSkip ? 1 : 0)),
    emotional_regulation: Math.min(5, base + (userTurns > 6 ? 1 : 0)),
    strategic_outcome: Math.max(1, base - (turnCount < 6 ? 1 : 0)),
  };
}

// ---------------------------------------------------------------------------
// Non-exported addDays copied from lib/spaced-repetition.ts
// ---------------------------------------------------------------------------

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

// ===========================================================================
// 1. validate.ts -- ALL validators
// ===========================================================================

describe("validate.ts", () => {
  // -----------------------------------------------------------------------
  // validateTranscript (strict — throws on invalid input)
  // -----------------------------------------------------------------------
  describe("validateTranscript", () => {
    it("accepts a valid transcript array", () => {
      const transcript = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];
      const result = validateTranscriptStrict(transcript);
      assert.equal(result.length, 2);
      assert.equal(result[0].role, "user");
      assert.equal(result[1].content, "Hi there");
    });

    it("accepts an empty array", () => {
      const result = validateTranscriptStrict([]);
      assert.deepEqual(result, []);
    });

    it("throws when transcript exceeds max turns (100)", () => {
      const big = Array.from({ length: 101 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Turn ${i}`,
      }));
      assert.throws(
        () => validateTranscriptStrict(big),
        (err: unknown) =>
          err instanceof ValidationError && /maximum of 100/.test(err.message)
      );
    });

    it("throws on invalid role", () => {
      assert.throws(
        () => validateTranscriptStrict([{ role: "system", content: "hi" }]),
        (err: unknown) =>
          err instanceof ValidationError && /role/.test(err.message)
      );
    });

    it("throws on missing content", () => {
      assert.throws(
        () => validateTranscriptStrict([{ role: "user" }]),
        (err: unknown) =>
          err instanceof ValidationError && /content/.test(err.message)
      );
    });

    it("throws when content exceeds 5000 chars", () => {
      const long = { role: "user", content: "x".repeat(5001) };
      assert.throws(
        () => validateTranscriptStrict([long]),
        (err: unknown) =>
          err instanceof ValidationError &&
          /exceeds maximum length/.test(err.message)
      );
    });

    it("throws on non-array input", () => {
      assert.throws(
        () => validateTranscriptStrict("not an array"),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an array/.test(err.message)
      );
    });

    it("throws on null input", () => {
      assert.throws(
        () => validateTranscriptStrict(null),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an array/.test(err.message)
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateText
  // -----------------------------------------------------------------------
  describe("validateText", () => {
    it("accepts a valid string", () => {
      assert.equal(validateText("hello", "field"), "hello");
    });

    it("accepts an empty string", () => {
      assert.equal(validateText("", "field"), "");
    });

    it("throws when exceeding default max length (2000)", () => {
      assert.throws(
        () => validateText("x".repeat(2001), "myField"),
        (err: unknown) =>
          err instanceof ValidationError &&
          /myField/.test(err.message) &&
          /2000/.test(err.message)
      );
    });

    it("throws on non-string input", () => {
      assert.throws(
        () => validateText(123, "field"),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be a string/.test(err.message)
      );
    });

    it("respects a custom max length", () => {
      assert.equal(validateText("abc", "field", 10), "abc");
      assert.throws(
        () => validateText("abcdefghijk", "field", 10),
        (err: unknown) =>
          err instanceof ValidationError && /10/.test(err.message)
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateScores (strict — throws on invalid input)
  // -----------------------------------------------------------------------
  describe("validateScores", () => {
    const validScores = {
      technique_application: 4,
      tactical_awareness: 3,
      frame_control: 5,
      emotional_regulation: 2,
      strategic_outcome: 1,
    };

    it("accepts valid scores", () => {
      const result = validateScoresStrict(validScores);
      assert.deepEqual(result, validScores);
    });

    it("throws when a key is missing", () => {
      const partial = { ...validScores };
      delete (partial as Record<string, number>)["frame_control"];
      assert.throws(
        () => validateScoresStrict(partial),
        (err: unknown) =>
          err instanceof ValidationError &&
          /frame_control/.test(err.message)
      );
    });

    it("throws on out-of-range value (0)", () => {
      assert.throws(
        () =>
          validateScoresStrict({ ...validScores, technique_application: 0 }),
        (err: unknown) =>
          err instanceof ValidationError &&
          /technique_application/.test(err.message)
      );
    });

    it("throws on out-of-range value (6)", () => {
      assert.throws(
        () =>
          validateScoresStrict({ ...validScores, tactical_awareness: 6 }),
        (err: unknown) =>
          err instanceof ValidationError &&
          /tactical_awareness/.test(err.message)
      );
    });

    it("throws on non-integer value", () => {
      assert.throws(
        () =>
          validateScoresStrict({
            ...validScores,
            emotional_regulation: 3.5,
          }),
        (err: unknown) =>
          err instanceof ValidationError &&
          /emotional_regulation/.test(err.message)
      );
    });

    it("throws on non-object input", () => {
      assert.throws(
        () => validateScoresStrict("not an object"),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an object/.test(err.message)
      );
    });

    it("throws on null input", () => {
      assert.throws(
        () => validateScoresStrict(null),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an object/.test(err.message)
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateConcept
  // -----------------------------------------------------------------------
  describe("validateConcept", () => {
    const validConcept = {
      id: "c-1",
      name: "Mirroring",
      domain: "Negotiation",
      source: "Voss",
      description: "Repeat last words",
    };

    it("accepts a valid concept", () => {
      const result = validateConcept(validConcept);
      assert.equal(result.id, "c-1");
      assert.equal(result.name, "Mirroring");
    });

    it("throws when id is missing", () => {
      const { id: _id, ...rest } = validConcept;
      assert.throws(
        () => validateConcept(rest),
        (err: unknown) =>
          err instanceof ValidationError && /concept\.id/.test(err.message)
      );
    });

    it("throws when name is missing", () => {
      const { name: _name, ...rest } = validConcept;
      assert.throws(
        () => validateConcept(rest),
        (err: unknown) =>
          err instanceof ValidationError && /concept\.name/.test(err.message)
      );
    });

    it("throws when domain is missing", () => {
      const { domain: _domain, ...rest } = validConcept;
      assert.throws(
        () => validateConcept(rest),
        (err: unknown) =>
          err instanceof ValidationError &&
          /concept\.domain/.test(err.message)
      );
    });

    it("throws on empty string for id", () => {
      assert.throws(
        () => validateConcept({ ...validConcept, id: "" }),
        (err: unknown) =>
          err instanceof ValidationError && /concept\.id/.test(err.message)
      );
    });

    it("throws on empty string for name", () => {
      assert.throws(
        () => validateConcept({ ...validConcept, name: "" }),
        (err: unknown) =>
          err instanceof ValidationError && /concept\.name/.test(err.message)
      );
    });

    it("throws on non-object input", () => {
      assert.throws(
        () => validateConcept("string"),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an object/.test(err.message)
      );
    });

    it("throws on null input", () => {
      assert.throws(
        () => validateConcept(null),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an object/.test(err.message)
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateCharacter
  // -----------------------------------------------------------------------
  describe("validateCharacter", () => {
    const validChar = {
      id: "ch-1",
      name: "The Shark",
      description: "Aggressive negotiator",
      personality: "Bold and direct",
      communication_style: "Blunt",
      hidden_motivation: "Close the deal",
      pressure_points: ["time pressure"],
      tactics: ["anchoring"],
    };

    it("accepts a valid character", () => {
      const result = validateCharacter(validChar);
      assert.equal(result.id, "ch-1");
      assert.equal(result.name, "The Shark");
    });

    it("throws when id is missing", () => {
      const { id: _id, ...rest } = validChar;
      assert.throws(
        () => validateCharacter(rest),
        (err: unknown) =>
          err instanceof ValidationError &&
          /character\.id/.test(err.message)
      );
    });

    it("throws when name is missing", () => {
      const { name: _name, ...rest } = validChar;
      assert.throws(
        () => validateCharacter(rest),
        (err: unknown) =>
          err instanceof ValidationError &&
          /character\.name/.test(err.message)
      );
    });

    it("throws on non-object input", () => {
      assert.throws(
        () => validateCharacter(42),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an object/.test(err.message)
      );
    });

    it("throws on null input", () => {
      assert.throws(
        () => validateCharacter(null),
        (err: unknown) =>
          err instanceof ValidationError &&
          /must be an object/.test(err.message)
      );
    });
  });

  // -----------------------------------------------------------------------
  // ValidationError class
  // -----------------------------------------------------------------------
  describe("ValidationError", () => {
    it("is an instance of Error", () => {
      const err = new ValidationError("boom");
      assert.ok(err instanceof Error);
    });

    it("has name set to 'ValidationError'", () => {
      const err = new ValidationError("test");
      assert.equal(err.name, "ValidationError");
    });

    it("stores the provided message", () => {
      const err = new ValidationError("something went wrong");
      assert.equal(err.message, "something went wrong");
    });
  });
});

// ===========================================================================
// 2. types.ts -- runtime type guards
// ===========================================================================

describe("types.ts", () => {
  // -----------------------------------------------------------------------
  // clampScore
  // -----------------------------------------------------------------------
  describe("clampScore", () => {
    it("passes through values 1-5 unchanged", () => {
      for (let i = 1; i <= 5; i++) {
        assert.equal(clampScore(i), i);
      }
    });

    it("clamps 0 up to 1", () => {
      assert.equal(clampScore(0), 1);
    });

    it("clamps 6 down to 5", () => {
      assert.equal(clampScore(6), 5);
    });

    it("clamps large numbers down to 5", () => {
      assert.equal(clampScore(100), 5);
    });

    it("returns 3 for NaN", () => {
      assert.equal(clampScore(NaN), 3);
    });

    it("handles string numbers by parsing them", () => {
      assert.equal(clampScore("4"), 4);
      assert.equal(clampScore("1"), 1);
    });

    it("returns 3 for non-numeric strings", () => {
      assert.equal(clampScore("abc"), 3);
    });

    it("clamps negative numbers to 1", () => {
      assert.equal(clampScore(-5), 1);
    });

    it("rounds floats before clamping", () => {
      assert.equal(clampScore(2.7), 3);
      assert.equal(clampScore(4.4), 4);
    });
  });

  // -----------------------------------------------------------------------
  // validateScores (soft — returns null on invalid)
  // -----------------------------------------------------------------------
  describe("validateScores (soft)", () => {
    const valid = {
      technique_application: 4,
      tactical_awareness: 3,
      frame_control: 5,
      emotional_regulation: 2,
      strategic_outcome: 1,
    };

    it("returns scores for valid input", () => {
      const result = validateScoresSoft(valid);
      assert.ok(result !== null);
      assert.equal(result!.technique_application, 4);
    });

    it("returns null for null input", () => {
      assert.equal(validateScoresSoft(null), null);
    });

    it("returns null for undefined input", () => {
      assert.equal(validateScoresSoft(undefined), null);
    });

    it("returns null when a required key is missing", () => {
      const partial = {
        technique_application: 4,
        tactical_awareness: 3,
        // missing frame_control, emotional_regulation, strategic_outcome
      };
      assert.equal(validateScoresSoft(partial), null);
    });

    it("clamps out-of-range values instead of rejecting", () => {
      const outOfRange = {
        technique_application: 0,
        tactical_awareness: 10,
        frame_control: -1,
        emotional_regulation: 3,
        strategic_outcome: 5,
      };
      const result = validateScoresSoft(outOfRange);
      assert.ok(result !== null);
      assert.equal(result!.technique_application, 1); // 0 clamped to 1
      assert.equal(result!.tactical_awareness, 5); // 10 clamped to 5
      assert.equal(result!.frame_control, 1); // -1 clamped to 1
      assert.equal(result!.emotional_regulation, 3);
      assert.equal(result!.strategic_outcome, 5);
    });

    it("returns null for non-object input", () => {
      assert.equal(validateScoresSoft("string"), null);
      assert.equal(validateScoresSoft(42), null);
    });
  });

  // -----------------------------------------------------------------------
  // isValidMessage
  // -----------------------------------------------------------------------
  describe("isValidMessage", () => {
    it("returns true for a valid user message", () => {
      assert.ok(isValidMessage({ role: "user", content: "hello" }));
    });

    it("returns true for a valid assistant message", () => {
      assert.ok(isValidMessage({ role: "assistant", content: "hi" }));
    });

    it("returns false for an invalid role", () => {
      assert.equal(
        isValidMessage({ role: "system", content: "hello" }),
        false
      );
    });

    it("returns false when content is missing", () => {
      assert.equal(isValidMessage({ role: "user" }), false);
    });

    it("returns false when content exceeds MAX_INPUT_LENGTH (10000)", () => {
      assert.equal(
        isValidMessage({ role: "user", content: "x".repeat(10_001) }),
        false
      );
    });

    it("returns true for content at exactly MAX_INPUT_LENGTH", () => {
      assert.ok(
        isValidMessage({ role: "user", content: "x".repeat(10_000) })
      );
    });

    it("returns false for non-object input", () => {
      assert.equal(isValidMessage("not an object"), false);
      assert.equal(isValidMessage(null), false);
      assert.equal(isValidMessage(undefined), false);
    });

    it("returns false when content is a number", () => {
      assert.equal(isValidMessage({ role: "user", content: 123 }), false);
    });
  });

  // -----------------------------------------------------------------------
  // validateTranscript (soft — returns null on invalid)
  // -----------------------------------------------------------------------
  describe("validateTranscript (soft)", () => {
    it("returns messages for a valid transcript", () => {
      const t = [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ];
      const result = validateTranscriptSoft(t);
      assert.ok(result !== null);
      assert.equal(result!.length, 2);
    });

    it("returns null when exceeding MAX_TRANSCRIPT_LENGTH (100)", () => {
      const big = Array.from({ length: 101 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));
      assert.equal(validateTranscriptSoft(big), null);
    });

    it("returns null when a message is invalid", () => {
      const t = [
        { role: "user", content: "hi" },
        { role: "system", content: "bad" }, // invalid role
      ];
      assert.equal(validateTranscriptSoft(t), null);
    });

    it("returns null for null input", () => {
      assert.equal(validateTranscriptSoft(null), null);
    });

    it("returns null for non-array input", () => {
      assert.equal(validateTranscriptSoft("string"), null);
      assert.equal(validateTranscriptSoft(42), null);
    });

    it("returns empty array for empty input", () => {
      const result = validateTranscriptSoft([]);
      assert.ok(result !== null);
      assert.equal(result!.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // truncate
  // -----------------------------------------------------------------------
  describe("truncate", () => {
    it("returns the string unchanged if within limit", () => {
      assert.equal(truncate("hello"), "hello");
    });

    it("truncates string exceeding default max length (10000)", () => {
      const long = "a".repeat(10_001);
      const result = truncate(long);
      assert.equal(result.length, 10_000);
    });

    it("returns empty string for non-string input", () => {
      assert.equal(truncate(123), "");
      assert.equal(truncate(null), "");
      assert.equal(truncate(undefined), "");
    });

    it("respects a custom max length", () => {
      assert.equal(truncate("abcdef", 3), "abc");
    });

    it("returns empty string for empty input", () => {
      assert.equal(truncate(""), "");
    });
  });
});

// ===========================================================================
// 3. Debrief score parsing (inline copies of non-exported functions)
// ===========================================================================

describe("Debrief parsing", () => {
  // -----------------------------------------------------------------------
  // parseScores
  // -----------------------------------------------------------------------
  describe("parseScores", () => {
    it("parses a well-formed ---SCORES--- block", () => {
      const text = `Great work today.

---SCORES---
technique_application: 4
tactical_awareness: 3
frame_control: 5
emotional_regulation: 2
strategic_outcome: 4
---LEDGER---
behavioral_weakness_summary: Good effort.
key_moment: The opening exchange.`;

      const scores = parseScores(text);
      assert.equal(scores.technique_application, 4);
      assert.equal(scores.tactical_awareness, 3);
      assert.equal(scores.frame_control, 5);
      assert.equal(scores.emotional_regulation, 2);
      assert.equal(scores.strategic_outcome, 4);
    });

    it("returns defaults when ---SCORES--- block is missing", () => {
      const scores = parseScores("No structured output here.");
      assert.deepEqual(scores, DEFAULT_SCORES);
    });

    it("returns default 3 for missing keys", () => {
      const text = `---SCORES---
technique_application: 5
tactical_awareness: 4
---LEDGER---`;

      const scores = parseScores(text);
      assert.equal(scores.technique_application, 5);
      assert.equal(scores.tactical_awareness, 4);
      assert.equal(scores.frame_control, 3); // missing -> default
      assert.equal(scores.emotional_regulation, 3); // missing -> default
      assert.equal(scores.strategic_outcome, 3); // missing -> default
    });

    it("clamps scores out of range", () => {
      const text = `---SCORES---
technique_application: 0
tactical_awareness: 8
frame_control: 3
emotional_regulation: 3
strategic_outcome: 3
---LEDGER---`;

      const scores = parseScores(text);
      // Note: regex only matches \d+ so "0" becomes 0, clamped to 1
      // But "0" is technically a digit, so it gets parsed
      assert.equal(scores.technique_application, 1); // 0 -> clamped to 1
      assert.equal(scores.tactical_awareness, 5); // 8 -> clamped to 5
    });

    it("handles extra whitespace gracefully", () => {
      const text = `---SCORES---
  technique_application:   4
  tactical_awareness:  3
  frame_control:    5
  emotional_regulation:  2
  strategic_outcome: 1
---LEDGER---`;

      const scores = parseScores(text);
      assert.equal(scores.technique_application, 4);
      assert.equal(scores.tactical_awareness, 3);
      assert.equal(scores.frame_control, 5);
      assert.equal(scores.emotional_regulation, 2);
      assert.equal(scores.strategic_outcome, 1);
    });

    it("handles scores at end of text without ---LEDGER---", () => {
      const text = `---SCORES---
technique_application: 2
tactical_awareness: 3
frame_control: 4
emotional_regulation: 5
strategic_outcome: 1`;

      const scores = parseScores(text);
      assert.equal(scores.technique_application, 2);
      assert.equal(scores.tactical_awareness, 3);
      assert.equal(scores.frame_control, 4);
      assert.equal(scores.emotional_regulation, 5);
      assert.equal(scores.strategic_outcome, 1);
    });
  });

  // -----------------------------------------------------------------------
  // parseLedgerFields
  // -----------------------------------------------------------------------
  describe("parseLedgerFields", () => {
    it("parses a well-formed ---LEDGER--- block", () => {
      const text = `---SCORES---
technique_application: 4
---LEDGER---
behavioral_weakness_summary: Struggled with active listening. Missed several cues.
key_moment: When the counterpart revealed their deadline pressure.
\`\`\``;

      const result = parseLedgerFields(text);
      assert.equal(
        result.behavioralWeaknessSummary,
        "Struggled with active listening. Missed several cues."
      );
      assert.equal(
        result.keyMoment,
        "When the counterpart revealed their deadline pressure."
      );
    });

    it("returns fallback strings when ---LEDGER--- is missing", () => {
      const result = parseLedgerFields("No ledger here.");
      assert.equal(
        result.behavioralWeaknessSummary,
        "Unable to extract behavioural summary from debrief."
      );
      assert.equal(
        result.keyMoment,
        "Unable to extract key moment from debrief."
      );
    });

    it("handles partial fields with only summary", () => {
      const text = `---LEDGER---
behavioral_weakness_summary: Only this field is present.
\`\`\``;

      const result = parseLedgerFields(text);
      assert.equal(
        result.behavioralWeaknessSummary,
        "Only this field is present."
      );
      // key_moment missing from block, so fallback
      assert.equal(result.keyMoment, "Unable to extract key moment.");
    });

    it("handles partial fields with only key_moment", () => {
      const text = `---LEDGER---
key_moment: The critical exchange.
\`\`\``;

      const result = parseLedgerFields(text);
      // summary missing from block, so fallback
      assert.equal(
        result.behavioralWeaknessSummary,
        "Unable to extract behavioural summary."
      );
      assert.equal(result.keyMoment, "The critical exchange.");
    });

    it("handles ledger block at end of text without closing backticks", () => {
      const text = `---LEDGER---
behavioral_weakness_summary: Summary text here.
key_moment: Moment text here.`;

      const result = parseLedgerFields(text);
      assert.equal(result.behavioralWeaknessSummary, "Summary text here.");
      assert.equal(result.keyMoment, "Moment text here.");
    });
  });

  // -----------------------------------------------------------------------
  // computeFallbackScores
  // -----------------------------------------------------------------------
  describe("computeFallbackScores", () => {
    it("returns base 2 for minimal engagement (few turns, no commands)", () => {
      const transcript: Message[] = [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ];
      const scores = computeFallbackScores(transcript, []);
      // userTurns = 1, turnCount = 2, no coach, no skip
      // base = max(1, 2 + 0 + 0 - 0) = 2
      assert.equal(scores.tactical_awareness, 2); // base
      assert.equal(scores.technique_application, 1); // base - 1 (turnCount < 4)
      assert.equal(scores.strategic_outcome, 1); // base - 1 (turnCount < 6)
    });

    it("adds +1 for using /coach", () => {
      const transcript: Message[] = Array.from({ length: 6 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));
      // userTurns = 3, turnCount = 6, coach = true
      // base = max(1, 2 + 0 + 1 - 0) = 3
      const scores = computeFallbackScores(transcript, ["/coach"]);
      assert.equal(scores.tactical_awareness, 3);
    });

    it("subtracts 1 for using /skip", () => {
      const transcript: Message[] = Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));
      // userTurns = 5, turnCount = 10, skip = true
      // base = max(1, 2 + 1 + 0 - 1) = 2
      const scores = computeFallbackScores(transcript, ["/skip"]);
      assert.equal(scores.tactical_awareness, 2); // base
      assert.equal(scores.frame_control, 1); // base - 1 for skip
    });

    it("gives higher scores for more user engagement (>4 turns)", () => {
      const transcript: Message[] = Array.from({ length: 12 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));
      // userTurns = 6, turnCount = 12, no commands
      // base = max(1, 2 + 1 + 0 - 0) = 3
      const scores = computeFallbackScores(transcript, []);
      assert.equal(scores.tactical_awareness, 3);
      assert.equal(scores.technique_application, 3); // turnCount >= 4
      assert.equal(scores.strategic_outcome, 3); // turnCount >= 6
    });

    it("gives emotional_regulation +1 for >6 user turns", () => {
      const transcript: Message[] = Array.from({ length: 16 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));
      // userTurns = 8, turnCount = 16
      // base = max(1, 2 + 1 + 0 - 0) = 3
      const scores = computeFallbackScores(transcript, []);
      assert.equal(scores.emotional_regulation, 4); // base + 1
    });

    it("caps base at 5 even with coach + many turns", () => {
      const transcript: Message[] = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Turn ${i}`,
      }));
      // userTurns = 10, turnCount = 20, coach = true
      // base = min(5, max(1, 2 + 1 + 1 - 0)) = 4
      const scores = computeFallbackScores(transcript, ["/coach"]);
      assert.ok(scores.tactical_awareness <= 5);
      assert.ok(scores.emotional_regulation <= 5);
    });
  });
});

// ===========================================================================
// 4. SM-2 spaced repetition date math
// ===========================================================================

describe("SM-2 date math", () => {
  describe("addDays", () => {
    it("adds 1 day to a date", () => {
      assert.equal(addDays("2026-04-01", 1), "2026-04-02");
    });

    it("adds 7 days to a date", () => {
      assert.equal(addDays("2026-04-01", 7), "2026-04-08");
    });

    it("crosses a month boundary", () => {
      assert.equal(addDays("2026-01-30", 3), "2026-02-02");
    });

    it("crosses from April to May", () => {
      assert.equal(addDays("2026-04-28", 5), "2026-05-03");
    });

    it("crosses a year boundary", () => {
      assert.equal(addDays("2026-12-29", 5), "2027-01-03");
    });

    it("handles leap year (2028-02-28 + 1 = 2028-02-29)", () => {
      assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    });

    it("handles non-leap year (2026-02-28 + 1 = 2026-03-01)", () => {
      assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    });

    it("handles adding 0 days (returns same date)", () => {
      assert.equal(addDays("2026-06-15", 0), "2026-06-15");
    });

    it("handles adding a large number of days", () => {
      // 365 days from 2026-01-01
      assert.equal(addDays("2026-01-01", 365), "2027-01-01");
    });

    it("handles leap year day rollover (2028-02-29 + 1 = 2028-03-01)", () => {
      assert.equal(addDays("2028-02-29", 1), "2028-03-01");
    });
  });
});

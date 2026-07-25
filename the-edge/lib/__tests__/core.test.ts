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
  LIFE_CONTEXTS,
  SOCIAL_CONTEXTS,
  CONTEXT_LABELS,
  CONTEXT_BLURBS,
  DOMAIN_DEFAULT_CONTEXTS,
  isSocialContext,
  contextsForDomain,
  contextsForConcept,
  primaryContextForConcept,
  matchesContexts,
  resolveSessionContext,
  migrateLegacyTrack,
  normaliseContexts,
  type SessionScores,
  type Message,
  DISPOSITIONS,
  type LifeContext,
} from "../types";
import { CONCEPTS, selectNewConcept, conceptFromLedgerValue } from "../concepts";
import {
  chooseWithHistory,
  nextDisposition,
  type Picker,
} from "../selection";
import { buildScenarioPrompt, fallbackScenario } from "../prompts/scenario";
import {
  CHARACTERS,
  characterContexts,
  characterDisposition,
  charactersForContext,
  selectCharacter,
  characterIdFromName,
  dispositionsForNames,
} from "../characters";

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

// ===========================================================================
// 5. Life contexts (dating / friends / groups / family / work)
// ===========================================================================

describe("Life contexts", () => {
  describe("LIFE_CONTEXTS and SOCIAL_CONTEXTS", () => {
    it("contains exactly the five selectable contexts", () => {
      assert.deepEqual(
        [...LIFE_CONTEXTS].sort(),
        ["dating", "family", "friends", "groups", "work"]
      );
    });

    it("treats social contexts as everything except work", () => {
      assert.deepEqual([...SOCIAL_CONTEXTS].sort(), ["dating", "family", "friends", "groups"]);
      assert.ok(SOCIAL_CONTEXTS.every(isSocialContext));
      assert.equal(isSocialContext("work"), false);
    });

    it("gives every context a label and a blurb", () => {
      for (const c of LIFE_CONTEXTS) {
        assert.ok(CONTEXT_LABELS[c]?.length > 0, `${c} has no label`);
        assert.ok(CONTEXT_BLURBS[c]?.length > 0, `${c} has no blurb`);
      }
    });
  });

  describe("DOMAIN_DEFAULT_CONTEXTS", () => {
    it("maps every domain to at least one valid context", () => {
      for (const [domain, contexts] of Object.entries(DOMAIN_DEFAULT_CONTEXTS)) {
        assert.ok(contexts.length > 0, `${domain} has no contexts`);
        for (const c of contexts) {
          assert.ok(LIFE_CONTEXTS.includes(c), `${domain} maps to unknown context ${c}`);
        }
      }
    });

    it("no longer confines the relational domains to a social ghetto", () => {
      // These used to be track: "social" and so were invisible to work users.
      assert.ok(DOMAIN_DEFAULT_CONTEXTS["Charisma & Presence"].includes("work"));
      assert.ok(DOMAIN_DEFAULT_CONTEXTS["Storytelling & Narrative"].includes("work"));
    });

    it("opens the rapport and negotiation canon up to personal life", () => {
      // Carnegie and Voss are not work-only skills.
      assert.ok(DOMAIN_DEFAULT_CONTEXTS["Rapport & Relationship Engineering"].includes("family"));
      assert.ok(DOMAIN_DEFAULT_CONTEXTS["Negotiation"].includes("family"));
    });
  });

  describe("contextsForDomain", () => {
    it("returns the mapped contexts for known domains", () => {
      assert.deepEqual(contextsForDomain("Influence & Persuasion"), ["work"]);
    });

    it("defaults unknown/legacy domains to work so old ledger rows still select", () => {
      assert.deepEqual(contextsForDomain("Some Old Domain"), ["work"]);
      assert.deepEqual(contextsForDomain(""), ["work"]);
    });
  });

  describe("contextsForConcept", () => {
    it("prefers the concept's own contexts over the domain default", () => {
      const concept = { domain: "Negotiation" as const, contexts: ["dating" as const] };
      assert.deepEqual(contextsForConcept(concept), ["dating"]);
    });

    it("falls back to the domain default when contexts are absent or empty", () => {
      assert.deepEqual(contextsForConcept({ domain: "Power Dynamics" }), ["work"]);
      assert.deepEqual(contextsForConcept({ domain: "Power Dynamics", contexts: [] }), ["work"]);
    });
  });

  describe("primaryContextForConcept", () => {
    it("returns the first (representative) context", () => {
      assert.equal(primaryContextForConcept({ domain: "Charisma & Presence" }), "groups");
      assert.equal(primaryContextForConcept({ domain: "Negotiation" }), "work");
    });

    it("never returns undefined for unknown domains", () => {
      assert.equal(primaryContextForConcept({ domain: "Nonsense" as never }), "work");
    });
  });

  describe("matchesContexts (mirrors selectNewConcept's filter)", () => {
    const pool = [
      { id: "a", domain: "Negotiation" as const },
      { id: "b", domain: "Influence & Persuasion" as const },
      { id: "c", domain: "Charisma & Presence" as const },
      { id: "d", domain: "Storytelling & Narrative" as const },
    ];
    const inContext = (active: LifeContext[]) =>
      pool.filter((c) => matchesContexts(contextsForConcept(c), active));

    it("a groups-only user sees the relational concepts, not the boardroom ones", () => {
      assert.deepEqual(inContext(["groups"]).map((c) => c.id), ["c", "d"]);
    });

    it("a work-only user sees everything practisable at work", () => {
      assert.deepEqual(inContext(["work"]).map((c) => c.id), ["a", "b", "c", "d"]);
    });

    it("a family user sees negotiation but not Cialdini persuasion", () => {
      assert.deepEqual(inContext(["family"]).map((c) => c.id), ["a"]);
    });

    it("an empty active list is treated as no filter rather than no content", () => {
      assert.equal(inContext([]).length, pool.length);
    });
  });

  describe("resolveSessionContext", () => {
    const first = () => 0;

    it("picks from the overlap between the concept and the user's contexts", () => {
      assert.equal(resolveSessionContext(["work", "family"], ["family"], first), "family");
    });

    it("falls back to the concept's own contexts when there is no overlap", () => {
      // Better to run a slightly off-context session than to fail to start one.
      assert.equal(resolveSessionContext(["work"], ["dating"], first), "work");
    });

    it("never returns undefined for empty input", () => {
      assert.ok(LIFE_CONTEXTS.includes(resolveSessionContext([], [], first)));
      assert.ok(LIFE_CONTEXTS.includes(resolveSessionContext(undefined, ["dating"], first)));
    });
  });

  describe("migrateLegacyTrack", () => {
    it("maps the three old track values onto contexts", () => {
      assert.deepEqual(migrateLegacyTrack("professional"), ["work"]);
      assert.deepEqual([...migrateLegacyTrack("social")].sort(), [
        "dating",
        "family",
        "friends",
        "groups",
      ]);
      assert.equal(migrateLegacyTrack("both").length, LIFE_CONTEXTS.length);
    });

    it("defaults unknown values to the social contexts, not to work", () => {
      assert.deepEqual(migrateLegacyTrack(undefined), [...SOCIAL_CONTEXTS]);
      assert.deepEqual(migrateLegacyTrack("nonsense"), [...SOCIAL_CONTEXTS]);
    });
  });

  describe("normaliseContexts", () => {
    it("accepts a valid contexts array", () => {
      assert.deepEqual(normaliseContexts(["dating", "work"]), ["dating", "work"]);
    });

    it("dedupes and drops unknown values", () => {
      assert.deepEqual(normaliseContexts(["dating", "dating", "nope", 7]), ["dating"]);
    });

    it("falls back to the legacy track when contexts are missing or all invalid", () => {
      assert.deepEqual(normaliseContexts(undefined, "professional"), ["work"]);
      assert.deepEqual(normaliseContexts(["nope"], "professional"), ["work"]);
    });

    it("defaults to the social contexts when there is nothing to go on", () => {
      assert.deepEqual(normaliseContexts(undefined), [...SOCIAL_CONTEXTS]);
      assert.deepEqual(normaliseContexts(null), [...SOCIAL_CONTEXTS]);
    });

    it("never returns an empty list, which would empty the concept pool", () => {
      assert.ok(normaliseContexts([]).length > 0);
    });
  });
});

// ===========================================================================
// 6. Roleplay stage-direction stripping (for voice read-back)
// Inline copy of stripStageDirections from app/session/components/types.tsx
// (that module pulls in React/JSX, so it can't be imported by the node runner).
// ===========================================================================

function stripStageDirections(text: string): string {
  return text
    .replace(/\*[^*]*\*/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

describe("stripStageDirections (roleplay voice)", () => {
  it("removes a leading standalone stage direction and its blank line", () => {
    assert.equal(
      stripStageDirections("*glances toward the kitchen*\n\nUh-huh. So what do you do?"),
      "Uh-huh. So what do you do?"
    );
  });

  it("removes inline stage directions without joining words", () => {
    assert.equal(
      stripStageDirections("*looking over your shoulder* Mm, yeah, hey— *takes a sip* So what's your deal?"),
      "Mm, yeah, hey— So what's your deal?"
    );
  });

  it("collapses multiple stage-direction-only lines but keeps ellipses", () => {
    assert.equal(
      stripStageDirections("*looks at you, then glances away*\n\nHey. \n\n...sorry, you were saying something?"),
      "Hey.\n...sorry, you were saying something?"
    );
  });

  it("removes [bracketed] cues too", () => {
    assert.equal(stripStageDirections("[pauses] Right, where were we?"), "Right, where were we?");
  });

  it("returns empty string when the whole line is a stage direction", () => {
    assert.equal(stripStageDirections("*sips drink*"), "");
  });

  it("leaves ordinary dialogue untouched", () => {
    assert.equal(stripStageDirections("Yeah, whatever. You?"), "Yeah, whatever. You?");
  });
});

// ===========================================================================
// 7. Content library integrity and coverage
//
// The library is data, and data rots quietly: a duplicate id, a context with no
// characters in it, a domain nothing maps to. These are the checks that fail
// loudly when someone adds content by copy-paste.
// ===========================================================================

describe("Content library", () => {
  describe("concepts", () => {
    it("has unique ids", () => {
      const ids = CONCEPTS.map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, "duplicate concept id");
    });

    it("has a name, source and description on every concept", () => {
      for (const c of CONCEPTS) {
        assert.ok(c.name?.length > 0, `${c.id} has no name`);
        assert.ok(c.source?.length > 0, `${c.id} has no source`);
        assert.ok(c.description?.length > 40, `${c.id} has a thin description`);
      }
    });

    it("resolves every concept to at least one valid context", () => {
      for (const c of CONCEPTS) {
        const ctx = contextsForConcept(c);
        assert.ok(ctx.length > 0, `${c.id} resolves to no contexts`);
        for (const one of ctx) {
          assert.ok(LIFE_CONTEXTS.includes(one), `${c.id} declares unknown context ${one}`);
        }
      }
    });

    it("gives every life context something to teach", () => {
      for (const context of LIFE_CONTEXTS) {
        const available = CONCEPTS.filter((c) => contextsForConcept(c).includes(context));
        assert.ok(available.length >= 10, `${context} has only ${available.length} concepts`);
      }
    });

    it("is no longer majority-work — social life is the bulk of the curriculum", () => {
      const social = CONCEPTS.filter((c) =>
        contextsForConcept(c).some((ctx) => ctx !== "work")
      );
      assert.ok(
        social.length > CONCEPTS.length / 2,
        `only ${social.length}/${CONCEPTS.length} concepts are practisable outside work`
      );
    });

    it("covers the four social contexts deeply enough not to loop in a fortnight", () => {
      // 15 social concepts was the old ceiling and the reason it felt repetitive.
      for (const context of SOCIAL_CONTEXTS) {
        const available = CONCEPTS.filter((c) => contextsForConcept(c).includes(context));
        assert.ok(available.length > 15, `${context} has only ${available.length} concepts`);
      }
    });
  });

  describe("characters", () => {
    it("has unique ids", () => {
      const ids = CHARACTERS.map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, "duplicate character id");
    });

    it("gives every character a usable brief for the roleplay prompt", () => {
      for (const c of CHARACTERS) {
        assert.ok(c.personality?.length > 200, `${c.id} has a thin personality brief`);
        assert.ok(c.communication_style?.length > 0, `${c.id} has no communication style`);
        assert.ok(c.hidden_motivation?.length > 0, `${c.id} has no hidden motivation`);
        assert.ok(c.pressure_points?.length >= 3, `${c.id} has too few pressure points`);
        assert.ok(c.tactics?.length >= 3, `${c.id} has too few tactics`);
      }
    });

    it("declares a valid disposition and valid contexts", () => {
      for (const c of CHARACTERS) {
        assert.ok(
          DISPOSITIONS.includes(characterDisposition(c)),
          `${c.id} has unknown disposition`
        );
        for (const one of characterContexts(c)) {
          assert.ok(LIFE_CONTEXTS.includes(one), `${c.id} declares unknown context ${one}`);
        }
      }
    });

    it("populates every life context with enough cast to avoid repeats", () => {
      for (const context of LIFE_CONTEXTS) {
        const cast = charactersForContext(context);
        assert.ok(cast.length >= 5, `${context} has only ${cast.length} characters`);
      }
    });

    it("is not uniformly hostile — every social context has a warm character", () => {
      // Connecting with someone warm is a different skill from winning against
      // someone hostile, and the old cast could only train the second.
      for (const context of SOCIAL_CONTEXTS) {
        const warm = charactersForContext(context).filter(
          (c) => characterDisposition(c) === "warm"
        );
        assert.ok(warm.length > 0, `${context} has no warm characters`);
      }
    });

    it("still offers resistance in every social context", () => {
      for (const context of SOCIAL_CONTEXTS) {
        const hard = charactersForContext(context).filter(
          (c) => characterDisposition(c) !== "warm"
        );
        assert.ok(hard.length > 0, `${context} has no resistant or neutral characters`);
      }
    });
  });

  describe("selectCharacter", () => {
    const conceptIn = (context: LifeContext) =>
      CONCEPTS.find((c) => contextsForConcept(c).includes(context))!;

    it("only ever returns a character that belongs in the session's context", () => {
      for (const context of LIFE_CONTEXTS) {
        for (let i = 0; i < 40; i++) {
          const chosen = selectCharacter(conceptIn(context), context);
          assert.ok(
            characterContexts(chosen).includes(context),
            `${chosen.id} is not a ${context} character`
          );
        }
      }
    });

    it("avoids recently used characters", () => {
      const cast = charactersForContext("groups");
      const avoid = cast.slice(0, cast.length - 1).map((c) => c.id);
      const chosen = selectCharacter(conceptIn("groups"), "groups", { avoidIds: avoid });
      assert.equal(chosen.id, cast[cast.length - 1].id);
    });

    it("relaxes the avoid list rather than failing when it would empty the pool", () => {
      const all = CHARACTERS.map((c) => c.id);
      const chosen = selectCharacter(conceptIn("family"), "family", { avoidIds: all });
      assert.ok(chosen, "returned nothing when everything was excluded");
      assert.ok(characterContexts(chosen).includes("family"));
    });

    it("honours a preferred disposition when the context offers one", () => {
      for (let i = 0; i < 25; i++) {
        const chosen = selectCharacter(conceptIn("dating"), "dating", {
          preferDisposition: "warm",
        });
        assert.equal(characterDisposition(chosen), "warm");
      }
    });

    it("falls back to any disposition rather than failing when none matches", () => {
      // No warm characters exist for work; selection must still return someone.
      const chosen = selectCharacter(conceptIn("work"), "work", { preferDisposition: "warm" });
      assert.ok(chosen);
      assert.ok(characterContexts(chosen).includes("work"));
    });

    it("derives the context from the concept when none is passed", () => {
      const chosen = selectCharacter(conceptIn("work"));
      assert.ok(chosen, "returned nothing without an explicit context");
    });
  });
});

// ===========================================================================
// 8. History-aware selection
//
// The rule that matters most is the last one in each group: every constraint
// relaxes rather than failing. Returning nothing here means failing to start
// a session, which is strictly worse than a slightly repetitive one.
// ===========================================================================

describe("History-aware selection", () => {
  const first: Picker = () => 0;
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const idOf = (x: { id: string }) => x.id;

  describe("chooseWithHistory", () => {
    it("returns null only when there is nothing to choose from", () => {
      assert.equal(chooseWithHistory([], { idOf, recentIds: [], window: 3, pick: first }), null);
    });

    it("never repeats the most recent selection", () => {
      for (let i = 0; i < 50; i++) {
        const chosen = chooseWithHistory(items, { idOf, recentIds: ["a"], window: 1 });
        assert.notEqual(chosen!.id, "a");
      }
    });

    it("excludes everything inside the window", () => {
      for (let i = 0; i < 50; i++) {
        const chosen = chooseWithHistory(items, { idOf, recentIds: ["a", "b", "c"], window: 3 });
        assert.equal(chosen!.id, "d");
      }
    });

    it("prefers never-used items over merely older ones", () => {
      // "a" is outside the window but has been seen; "d" never has.
      const chosen = chooseWithHistory(items, {
        idOf,
        recentIds: ["b", "c", "a"],
        window: 2,
        pick: first,
      });
      assert.equal(chosen!.id, "d");
    });

    it("shrinks the window rather than returning nothing", () => {
      // Window of 4 would exclude the entire pool; it should relax to exclude
      // only the most recent and still return something.
      const chosen = chooseWithHistory(items, {
        idOf,
        recentIds: ["a", "b", "c", "d"],
        window: 4,
        pick: first,
      });
      assert.ok(chosen, "returned nothing when the window covered everything");
      assert.notEqual(chosen!.id, "a", "did not even avoid the most recent");
    });

    it("still returns something when the pool is a single item", () => {
      const one = [{ id: "only" }];
      const chosen = chooseWithHistory(one, { idOf, recentIds: ["only"], window: 3, pick: first });
      assert.equal(chosen!.id, "only");
    });

    it("ignores history entries that are not in the candidate pool", () => {
      const chosen = chooseWithHistory(items, {
        idOf,
        recentIds: ["gone", "retired"],
        window: 3,
        pick: first,
      });
      assert.equal(chosen!.id, "a");
    });
  });

  describe("nextDisposition", () => {
    it("prefers a disposition not seen in recent sessions", () => {
      const chosen = nextDisposition(["resistant", "resistant"], DISPOSITIONS, first);
      assert.notEqual(chosen, "resistant");
    });

    it("steers away from the most recent when all have been used", () => {
      for (let i = 0; i < 30; i++) {
        const chosen = nextDisposition(["warm", "neutral", "resistant"]);
        assert.notEqual(chosen, "warm", "repeated the most recent disposition");
      }
    });

    it("returns undefined only when nothing is available", () => {
      assert.equal(nextDisposition(["warm"], [], first), undefined);
    });

    it("copes with a single available disposition", () => {
      assert.equal(nextDisposition(["warm"], ["warm"], first), "warm");
    });
  });

  describe("selectNewConcept", () => {
    it("avoids the domains of the last few sessions", () => {
      const recent = CONCEPTS.filter((c) => c.domain === "Influence & Persuasion")
        .slice(0, 2)
        .map((c) => c.id);
      for (let i = 0; i < 30; i++) {
        const chosen = selectNewConcept(recent, ["work"]);
        assert.notEqual(chosen.domain, "Influence & Persuasion");
      }
    });

    it("only returns concepts practisable in the active contexts", () => {
      for (let i = 0; i < 40; i++) {
        const chosen = selectNewConcept([], ["dating"]);
        assert.ok(contextsForConcept(chosen).includes("dating"), `${chosen.id} is not a dating concept`);
      }
    });

    it("resets rather than failing once every in-context concept is used", () => {
      const allDating = CONCEPTS.filter((c) => contextsForConcept(c).includes("dating")).map(
        (c) => c.id
      );
      const chosen = selectNewConcept(allDating, ["dating"]);
      assert.ok(chosen, "returned nothing when the curriculum was exhausted");
      assert.ok(contextsForConcept(chosen).includes("dating"));
    });
  });

  describe("conceptFromLedgerValue", () => {
    it("resolves both concept ids and formatted ledger names", () => {
      assert.equal(conceptFromLedgerValue("mirroring")?.id, "mirroring");
      assert.equal(conceptFromLedgerValue("Mirroring (Voss)")?.id, "mirroring");
    });

    it("returns undefined for retired or unknown values", () => {
      assert.equal(conceptFromLedgerValue("no-such-concept"), undefined);
    });
  });

  describe("characterIdFromName", () => {
    it("maps a ledger character name back to its id", () => {
      assert.equal(characterIdFromName("The Sceptical Investor"), "sceptical-investor");
    });

    it("returns null for retired archetypes rather than throwing", () => {
      assert.equal(characterIdFromName("The Archetype That Was Deleted"), null);
    });

    it("silently drops unknown names when deriving dispositions", () => {
      assert.deepEqual(dispositionsForNames(["Nobody At All"]), []);
    });
  });
});

// ===========================================================================
// 9. Scenario generation
//
// The generator itself needs a model call, so these cover the parts that must
// hold without one: the prompt actually carries the avoid-list and the concept
// stays hidden, the parser tolerates whatever comes back, and the fallback is
// always usable.
// ===========================================================================

describe("Scenario generation", () => {
  const concept = CONCEPTS.find((c) => c.id === "reading-interest")!;
  const character = CHARACTERS.find((c) => c.id === "nervous-first-date")!;

  describe("buildScenarioPrompt", () => {
    it("names the character and the setting", () => {
      const prompt = buildScenarioPrompt(concept, character, "dating", "", []);
      assert.ok(prompt.includes(character.name));
      assert.ok(prompt.includes(character.hidden_motivation));
      assert.ok(prompt.includes(CONTEXT_LABELS.dating));
    });

    it("tells the model the concept must stay hidden", () => {
      // A scenario that telegraphs the skill being practised defeats the point.
      const prompt = buildScenarioPrompt(concept, character, "dating", "", []);
      assert.ok(prompt.includes(concept.name));
      assert.ok(/must NOT know/i.test(prompt));
    });

    it("passes recent scenarios through as an explicit avoid list", () => {
      const prompt = buildScenarioPrompt(concept, character, "dating", "", [
        "rooftop bar, character just left a bad meeting",
        "coffee shop, raining, character running late",
      ]);
      assert.ok(prompt.includes("rooftop bar, character just left a bad meeting"));
      assert.ok(prompt.includes("coffee shop, raining, character running late"));
      assert.ok(/do not repeat/i.test(prompt));
    });

    it("omits the avoid block entirely when there is no history", () => {
      const prompt = buildScenarioPrompt(concept, character, "dating", "", []);
      assert.equal(/do not repeat/i.test(prompt), false);
    });

    it("includes the bio when present and omits the section when not", () => {
      const withBio = buildScenarioPrompt(concept, character, "dating", "I'm a vet in Leeds.", []);
      assert.ok(withBio.includes("I'm a vet in Leeds."));
      const withoutBio = buildScenarioPrompt(concept, character, "dating", "", []);
      assert.equal(/ABOUT THE USER/.test(withoutBio), false);
    });

    it("varies its guidance by context rather than emitting one generic brief", () => {
      const prompts = LIFE_CONTEXTS.map((ctx) =>
        buildScenarioPrompt(concept, character, ctx, "", [])
      );
      assert.equal(new Set(prompts).size, LIFE_CONTEXTS.length);
    });
  });

  describe("fallbackScenario", () => {
    it("produces a usable scenario and summary for every context", () => {
      for (const context of LIFE_CONTEXTS) {
        const { scenario, summary } = fallbackScenario(concept, character, context);
        assert.ok(scenario.length > 80, `${context} fallback is too thin`);
        assert.ok(scenario.includes(character.name));
        assert.ok(summary.includes(context));
      }
    });

    it("derives a context from the concept when none is given", () => {
      const { scenario } = fallbackScenario(concept, character);
      assert.ok(scenario.length > 80);
    });
  });
});

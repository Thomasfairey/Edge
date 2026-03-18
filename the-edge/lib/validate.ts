/**
 * Input validation helpers for API routes.
 * Validates request bodies at the system boundary before passing to LLM or DB.
 */

import { Message } from "@/lib/types";

const MAX_TRANSCRIPT_TURNS = 100;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_TEXT_LENGTH = 2000;

/**
 * Validate and sanitise a transcript array.
 * Returns a clean array or throws with a descriptive message.
 */
export function validateTranscript(transcript: unknown): Message[] {
  if (!Array.isArray(transcript)) {
    throw new ValidationError("transcript must be an array");
  }
  if (transcript.length > MAX_TRANSCRIPT_TURNS) {
    throw new ValidationError(
      `transcript exceeds maximum of ${MAX_TRANSCRIPT_TURNS} turns`
    );
  }
  return transcript.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new ValidationError(`transcript[${i}] is not a valid message`);
    }
    const msg = item as Record<string, unknown>;
    if (msg.role !== "user" && msg.role !== "assistant") {
      throw new ValidationError(
        `transcript[${i}].role must be "user" or "assistant"`
      );
    }
    if (typeof msg.content !== "string") {
      throw new ValidationError(`transcript[${i}].content must be a string`);
    }
    if (msg.content.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(
        `transcript[${i}].content exceeds maximum length of ${MAX_MESSAGE_LENGTH}`
      );
    }
    return { role: msg.role as "user" | "assistant", content: msg.content };
  });
}

/**
 * Validate a text string within length bounds.
 */
export function validateText(
  value: unknown,
  fieldName: string,
  maxLength: number = MAX_TEXT_LENGTH
): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} exceeds maximum length of ${maxLength}`
    );
  }
  return value;
}

/**
 * Validate scores object — all values must be integers 1-5.
 */
export function validateScores(
  scores: unknown
): Record<string, number> {
  if (!scores || typeof scores !== "object") {
    throw new ValidationError("scores must be an object");
  }
  const required = [
    "technique_application",
    "tactical_awareness",
    "frame_control",
    "emotional_regulation",
    "strategic_outcome",
  ];
  const s = scores as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of required) {
    const val = s[key];
    if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 5) {
      throw new ValidationError(
        `scores.${key} must be an integer between 1 and 5`
      );
    }
    out[key] = val;
  }
  return out;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

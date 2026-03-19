/**
 * Input length validation for API routes.
 * Prevents abuse via oversized payloads that trigger expensive AI calls.
 */

/** Max characters for a single user message or text field */
export const MAX_TEXT_LENGTH = 5_000;

/** Max characters for mission/lesson text */
export const MAX_LONG_TEXT_LENGTH = 10_000;

/** Max number of messages in a transcript array */
export const MAX_TRANSCRIPT_LENGTH = 100;

/** Max characters per transcript message */
export const MAX_MESSAGE_LENGTH = 3_000;

/**
 * Validate that a string does not exceed the given length.
 * Returns an error message if invalid, or null if valid.
 */
export function validateStringLength(
  value: unknown,
  fieldName: string,
  maxLength: number = MAX_TEXT_LENGTH
): string | null {
  if (typeof value !== "string") return null; // let type checks handle non-strings
  if (value.length > maxLength) {
    return `${fieldName} exceeds maximum length of ${maxLength} characters`;
  }
  return null;
}

/**
 * Validate a transcript array: check array length and individual message lengths.
 * Returns an error message if invalid, or null if valid.
 */
export function validateTranscript(
  transcript: unknown
): string | null {
  if (!Array.isArray(transcript)) return null; // let type checks handle non-arrays
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return `Transcript exceeds maximum of ${MAX_TRANSCRIPT_LENGTH} messages`;
  }
  for (const msg of transcript) {
    if (msg && typeof msg.content === "string" && msg.content.length > MAX_MESSAGE_LENGTH) {
      return `Individual message exceeds maximum of ${MAX_MESSAGE_LENGTH} characters`;
    }
  }
  return null;
}

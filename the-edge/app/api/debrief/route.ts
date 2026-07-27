/**
 * Phase 3: Debrief — transcript analysis, scoring, and structured extraction.
 * POST { transcript: Message[], concept: Concept,
 *        character: CharacterArchetype, commandsUsed: string[],
 *        checkinContext?: string }
 * Returns { debriefContent: string, scores: SessionScores,
 *           behavioralWeaknessSummary: string, keyMoment: string }
 *
 * Uses streaming internally (generateResponseViaStream) to keep the
 * connection alive on Vercel during long generations.
 * Parses the ---SCORES--- and ---LEDGER--- structured output.
 * Reference: PRD Section 3.5
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponseViaStream, PHASE_CONFIG, CircuitBreakerOpenError } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildDebriefPrompt } from "@/lib/prompts/debrief";
import { getLedgerCount, serialiseForPrompt } from "@/lib/ledger";
import {
  CharacterArchetype,
  Concept,
  LifeContext,
  LIFE_CONTEXTS,
  Message,
  SessionScores,
  clampScore,
  primaryContextForConcept,
} from "@/lib/types";
import { dimensionKeys, dimensionSetFor } from "@/lib/scoring-dimensions";
import { parseRehearsalBlock, selectRehearsalCue } from "@/lib/rehearsal";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateTranscript, validateConcept, validateCharacter, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { logger, createRequestLogger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";
import { captureError } from "@/lib/error-reporting";

export const maxDuration = 60;

/** Neutral scores for the given set, used when parsing fails entirely. */
function defaultScores(setId: string): SessionScores {
  return Object.fromEntries(dimensionKeys(setId).map((key) => [key, 3]));
}

/**
 * Compute fallback scores from transcript data instead of blanket 3s.
 * Derives basic scores from turn count and command usage.
 */
function computeFallbackScores(
  transcript: Message[],
  commandsUsed: string[],
  setId: string
): SessionScores {
  const userTurns = transcript.filter((t) => t.role === "user").length;
  const turnCount = transcript.length;
  const usedCoach = commandsUsed.includes("/coach");
  const usedSkip = commandsUsed.includes("/skip");

  // Base: 2 for engagement, +1 if >4 user turns, +1 if used coach
  const base = Math.min(
    5,
    Math.max(1, 2 + (userTurns > 4 ? 1 : 0) + (usedCoach ? 1 : 0) - (usedSkip ? 1 : 0))
  );

  // Vary slightly across the set's dimensions, in declared order, so the
  // fallback isn't a flat row of identical numbers.
  const adjustments = [
    -(turnCount < 4 ? 1 : 0),
    0,
    -(usedSkip ? 1 : 0),
    userTurns > 6 ? 1 : 0,
    -(turnCount < 6 ? 1 : 0),
  ];
  const keys = dimensionKeys(setId);
  return Object.fromEntries(
    keys.map((key, i) => [
      key,
      Math.max(1, Math.min(5, base + (adjustments[i] ?? 0))),
    ])
  );
}

/**
 * Parse the ---SCORES--- block from debrief output.
 * Uses clampScore to ensure all values are valid 1-5.
 * Handles multiple formatting variations:
 * - Standard: "technique_application: 3"
 * - With spaces: "technique_application : 3"
 * - Abbreviated: "TA: 3" or "TA : 3"
 * - Markdown bold: "**technique_application**: 3"
 */
function parseScores(text: string, setId: string): SessionScores {
  // Try multiple delimiter patterns for the scores block
  const scoresMatch =
    text.match(/---\s*SCORES\s*---\s*([\s\S]*?)(?:---\s*LEDGER\s*---|$)/) ??
    text.match(/SCORES[:\s]*\n([\s\S]*?)(?:LEDGER|$)/i);

  if (!scoresMatch) {
    logger.warn("Could not find ---SCORES--- block, using defaults", { phase: "debrief" });
    return defaultScores(setId);
  }

  const block = scoresMatch[1];

  const extract = (key: string, ...aliases: string[]): number => {
    for (const k of [key, ...aliases]) {
      // Match "key: N", "key : N", "**key**: N", "**key** : N"
      const match = block.match(new RegExp(`\\*?\\*?${k}\\*?\\*?\\s*:\\s*(\\d+)`, "i"));
      if (match) return clampScore(parseInt(match[1], 10));
    }
    return 3;
  };

  // Match on the dimension key, or on its two-letter short form, which is what
  // the model tends to emit when it abbreviates.
  const set = dimensionSetFor(setId);
  return Object.fromEntries(
    set.dimensions.map((d) => [d.key, extract(d.key, d.short)])
  );
}

/**
 * Parse the ---LEDGER--- block from debrief output.
 * Handles variations in formatting (code fences, extra whitespace, bold markers).
 */
function parseLedgerFields(text: string): {
  behavioralWeaknessSummary: string;
  keyMoment: string;
} {
  const ledgerMatch =
    text.match(/---\s*LEDGER\s*---\s*([\s\S]*?)(?:```|$)/) ??
    text.match(/LEDGER[:\s]*\n([\s\S]*?)$/i);

  if (!ledgerMatch) {
    logger.warn("Could not find ---LEDGER--- block, using fallbacks", { phase: "debrief" });
    return {
      behavioralWeaknessSummary: "Unable to extract behavioural summary from debrief.",
      keyMoment: "Unable to extract key moment from debrief.",
    };
  }

  const block = ledgerMatch[1];

  // Handle "behavioral_weakness_summary:" or "**behavioral_weakness_summary**:"
  const summaryMatch = block.match(
    /\*?\*?behavioral_weakness_summary\*?\*?\s*:\s*([\s\S]*?)(?:\*?\*?key_moment\*?\*?\s*:|$)/i
  );
  const momentMatch = block.match(/\*?\*?key_moment\*?\*?\s*:\s*([\s\S]*?)$/i);

  return {
    behavioralWeaknessSummary: summaryMatch?.[1]?.trim() || "Unable to extract behavioural summary.",
    keyMoment: momentMatch?.[1]?.trim() || "Unable to extract key moment.",
  };
}

async function handlePost(req: NextRequest, userId: string | null) {
  const log = createRequestLogger(req, userId);
  const body = await req.json().catch(() => null);
  if (!body || !body.transcript || !body.concept || !body.character) {
    return NextResponse.json(
      { error: "Missing required fields: transcript, concept, character" },
      { status: 400 }
    );
  }

  let transcript: Message[];
  let concept: Concept;
  let character: CharacterArchetype;
  try {
    transcript = validateTranscript(body.transcript);
    concept = validateConcept(body.concept);
    character = validateCharacter(body.character);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const safeCommandsUsed = Array.isArray(body.commandsUsed)
    ? (body.commandsUsed as unknown[]).filter((c): c is string => typeof c === "string").slice(0, 20)
    : [];
  const checkinContext = typeof body.checkinContext === "string" ? body.checkinContext : undefined;

  // The session's life context names both the coaching tone and the scoring
  // dimensions. An absent or unknown value falls back to the concept's
  // representative context rather than failing the debrief.
  const sessionContext: LifeContext =
    typeof body.context === "string" && (LIFE_CONTEXTS as string[]).includes(body.context)
      ? (body.context as LifeContext)
      : primaryContextForConcept(concept);
  const dimensionSet = sessionContext;

  try {
    const [ledgerCount, serialisedLedger] = await Promise.all([
      getLedgerCount(userId),
      serialiseForPrompt(7, userId),
    ]);

    const debriefPrompt = buildDebriefPrompt(
      transcript,
      concept,
      character,
      ledgerCount,
      serialisedLedger,
      checkinContext,
      sessionContext
    );

    const systemPrompt = `${await buildPersistentContext(userId)}\n\n${debriefPrompt}`;

    // Use streaming internally to keep connection alive
    const debriefContent = await generateResponseViaStream(
      systemPrompt,
      [{ role: "user", content: "Deliver the debrief." }],
      PHASE_CONFIG.debrief
    );

    // Parse structured output
    const scores = parseScores(debriefContent, dimensionSet);
    const { behavioralWeaknessSummary, keyMoment } = parseLedgerFields(debriefContent);
    // The rehearsal phase replays this moment. Resolved against the transcript
    // rather than trusted verbatim — see lib/rehearsal.ts.
    const rehearsal = selectRehearsalCue(transcript, parseRehearsalBlock(debriefContent));

    log.info(
      `Scores (${dimensionSet}): ${dimensionSetFor(dimensionSet)
        .dimensions.map((d) => `${d.short}=${scores[d.key]}`)
        .join(" ")}`,
      { phase: "debrief" }
    );
    log.info(`Commands used: ${safeCommandsUsed.join(", ") || "none"}`, { phase: "debrief" });

    return NextResponse.json({
      debriefContent,
      scores,
      dimensionSet,
      behavioralWeaknessSummary,
      keyMoment,
      rehearsal,
    });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return NextResponse.json(
        { error: "Service temporarily busy", retryAfter: 30 },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    captureError(error, {
      phase: "debrief",
      source: "/api/debrief",
      userId,
      metadata: { concept: concept.name, turns: transcript.length },
    });

    // Fallback: compute scores from transcript data
    const fallbackScores = computeFallbackScores(transcript, safeCommandsUsed, dimensionSet);
    trackEvent({
      event: "debrief_fallback",
      userId,
      properties: { reason: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json({
      debriefContent: "Debrief generation failed. Scores have been estimated from your session activity.",
      scores: fallbackScores,
      dimensionSet,
      behavioralWeaknessSummary: "Unable to generate analysis due to connection timeout.",
      keyMoment: "Unable to identify key moment.",
      // No model output to nominate a moment, so take the last real exchange.
      // Losing the debrief is bad; losing the rehearsal as well is worse.
      rehearsal: selectRehearsalCue(transcript, {}),
    });
  }
}

export const POST = withRateLimit(withAuth(handlePost), 5);

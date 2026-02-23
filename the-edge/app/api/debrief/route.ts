/**
 * Phase 3: Debrief — transcript analysis, scoring, and structured extraction.
 * POST { transcript: Message[], concept: Concept,
 *        character: CharacterArchetype, commandsUsed: string[] }
 * Returns { debriefContent: string, scores: SessionScores,
 *           behavioralWeaknessSummary: string, keyMoment: string }
 *
 * Non-streaming — displayed as a full analysis block.
 * Parses the ---SCORES--- and ---LEDGER--- structured output.
 * Reference: PRD Section 3.5
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildDebriefPrompt } from "@/lib/prompts/debrief";
import { getLedgerCount, serialiseForPrompt } from "@/lib/ledger";
import { CharacterArchetype, Concept, Message, SessionScores } from "@/lib/types";

/** Default scores when parsing fails. */
const DEFAULT_SCORES: SessionScores = {
  technique_application: 3,
  tactical_awareness: 3,
  frame_control: 3,
  emotional_regulation: 3,
  strategic_outcome: 3,
};

/**
 * Parse the ---SCORES--- block from debrief output.
 * Uses regex — does NOT use a JSON parser.
 */
function parseScores(text: string): SessionScores {
  const scoresMatch = text.match(/---SCORES---\s*([\s\S]*?)(?:---LEDGER---|$)/);
  if (!scoresMatch) {
    console.warn("[debrief] Could not find ---SCORES--- block, using defaults");
    return { ...DEFAULT_SCORES };
  }

  const block = scoresMatch[1];

  const extract = (key: string): number => {
    const match = block.match(new RegExp(`${key}:\\s*(\\d)`));
    if (!match) return 3;
    const val = parseInt(match[1], 10);
    return val >= 1 && val <= 5 ? val : 3;
  };

  return {
    technique_application: extract("technique_application"),
    tactical_awareness: extract("tactical_awareness"),
    frame_control: extract("frame_control"),
    emotional_regulation: extract("emotional_regulation"),
    strategic_outcome: extract("strategic_outcome"),
  };
}

/**
 * Parse the ---LEDGER--- block from debrief output.
 * Extracts behavioral_weakness_summary and key_moment.
 */
function parseLedgerFields(text: string): {
  behavioralWeaknessSummary: string;
  keyMoment: string;
} {
  const ledgerMatch = text.match(/---LEDGER---\s*([\s\S]*?)(?:```|$)/);
  if (!ledgerMatch) {
    console.warn("[debrief] Could not find ---LEDGER--- block, using fallbacks");
    return {
      behavioralWeaknessSummary: "Unable to extract behavioural summary from debrief.",
      keyMoment: "Unable to extract key moment from debrief.",
    };
  }

  const block = ledgerMatch[1];

  const summaryMatch = block.match(
    /behavioral_weakness_summary:\s*([\s\S]*?)(?:key_moment:|$)/
  );
  const momentMatch = block.match(/key_moment:\s*([\s\S]*?)$/);

  return {
    behavioralWeaknessSummary: summaryMatch?.[1]?.trim() || "Unable to extract behavioural summary.",
    keyMoment: momentMatch?.[1]?.trim() || "Unable to extract key moment.",
  };
}

export async function POST(req: NextRequest) {
  const { transcript, concept, character, commandsUsed } = (await req.json()) as {
    transcript: Message[];
    concept: Concept;
    character: CharacterArchetype;
    commandsUsed: string[];
  };

  const ledgerCount = getLedgerCount();
  const serialisedLedger = serialiseForPrompt();

  const debriefPrompt = buildDebriefPrompt(
    transcript,
    concept,
    character,
    ledgerCount,
    serialisedLedger
  );

  const systemPrompt = `${buildPersistentContext()}\n\n${debriefPrompt}`;

  const debriefContent = await generateResponse(
    systemPrompt,
    [{ role: "user", content: "Deliver the debrief." }],
    PHASE_CONFIG.debrief
  );

  // Parse structured output
  const scores = parseScores(debriefContent);
  const { behavioralWeaknessSummary, keyMoment } = parseLedgerFields(debriefContent);

  // Log parsing results
  console.log(
    `[debrief] Scores: TA=${scores.technique_application} TW=${scores.tactical_awareness} FC=${scores.frame_control} ER=${scores.emotional_regulation} SO=${scores.strategic_outcome}`
  );
  console.log(`[debrief] Commands used: ${commandsUsed.join(", ") || "none"}`);

  return NextResponse.json({
    debriefContent,
    scores,
    behavioralWeaknessSummary,
    keyMoment,
  });
}

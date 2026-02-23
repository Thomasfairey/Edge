/**
 * Phase 4: Mission generation + ledger write.
 * POST { concept: Concept, character: CharacterArchetype,
 *        scores: SessionScores, behavioralWeaknessSummary: string,
 *        keyMoment: string, commandsUsed: string[],
 *        checkinOutcome: string | null }
 * Returns { mission: string, rationale: string, ledgerEntry: LedgerEntry }
 *
 * This is the FINAL phase. It assembles the complete LedgerEntry
 * from all data accumulated through the session and writes it to disk.
 * The mission_outcome field is left empty — it gets populated by
 * Phase 0 (Check-in) of the NEXT session.
 * Reference: PRD Section 3.6
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildMissionPrompt } from "@/lib/prompts/mission";
import { serialiseForPrompt, appendEntry, getLedgerCount } from "@/lib/ledger";
import {
  CharacterArchetype,
  Concept,
  LedgerEntry,
  SessionScores,
} from "@/lib/types";

export async function POST(req: NextRequest) {
  const {
    concept,
    character,
    scores,
    behavioralWeaknessSummary,
    keyMoment,
    commandsUsed,
    checkinOutcome,
  } = (await req.json()) as {
    concept: Concept;
    character: CharacterArchetype;
    scores: SessionScores;
    behavioralWeaknessSummary: string;
    keyMoment: string;
    commandsUsed: string[];
    checkinOutcome: string | null;
  };

  // Generate the mission
  const serialisedLedger = serialiseForPrompt();
  const missionPrompt = buildMissionPrompt(concept, scores, serialisedLedger);
  const systemPrompt = `${buildPersistentContext()}\n\n${missionPrompt}`;

  const rawMission = await generateResponse(
    systemPrompt,
    [{ role: "user", content: "Assign the mission." }],
    PHASE_CONFIG.mission
  );

  // Parse mission text and rationale (split on "RATIONALE:")
  const rationaleIndex = rawMission.toUpperCase().indexOf("RATIONALE:");
  let mission: string;
  let rationale: string;

  if (rationaleIndex !== -1) {
    mission = rawMission.slice(0, rationaleIndex).trim();
    rationale = rawMission.slice(rationaleIndex + "RATIONALE:".length).trim();
  } else {
    // Fallback if the model didn't follow format
    mission = rawMission.trim();
    rationale = "";
    console.warn("[mission] Could not parse RATIONALE: section from response");
  }

  // Assemble the complete ledger entry
  const day = getLedgerCount() + 1;

  const ledgerEntry: LedgerEntry = {
    day,
    date: new Date().toISOString().split("T")[0],
    concept: `${concept.name} (${concept.source})`,
    domain: concept.domain,
    character: character.name,
    difficulty: character.tactics.length, // rough proxy: more tactics = harder
    scores,
    behavioral_weakness_summary: behavioralWeaknessSummary,
    key_moment: keyMoment,
    mission,
    mission_outcome: "", // Populated by Phase 0 of the NEXT session
    commands_used: commandsUsed,
    session_completed: true,
  };

  // Write to disk
  appendEntry(ledgerEntry);
  console.log(`[mission] Day ${day} ledger entry written. Mission assigned.`);

  return NextResponse.json({ mission, rationale, ledgerEntry });
}

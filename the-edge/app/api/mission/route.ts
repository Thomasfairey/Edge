/**
 * Phase 4: Mission generation + ledger write + SR update.
 * POST { concept: Concept, character: CharacterArchetype,
 *        scores: SessionScores, behavioralWeaknessSummary: string,
 *        keyMoment: string, commandsUsed: string[],
 *        checkinOutcome: string | null }
 * Returns { mission: string, rationale: string, ledgerEntry: LedgerEntry }
 *
 * This is the FINAL phase. It assembles the complete LedgerEntry
 * from all data accumulated through the session and writes it to Supabase.
 * Also updates spaced repetition data for the session's concept.
 * Reference: PRD Section 3.6
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildMissionPrompt } from "@/lib/prompts/mission";
import { serialiseForPrompt, appendEntry, getLedgerCount } from "@/lib/ledger";
import { updateSREntry } from "@/lib/spaced-repetition";
import {
  CharacterArchetype,
  Concept,
  LedgerEntry,
  SessionScores,
  truncate,
} from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateScores, validateText, ValidationError } from "@/lib/validate";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.concept || !body.character || !body.scores) {
    return NextResponse.json(
      { error: "Missing required fields: concept, character, scores" },
      { status: 400 }
    );
  }

  try {
    body.scores = validateScores(body.scores);
    if (body.behavioralWeaknessSummary) {
      validateText(body.behavioralWeaknessSummary, "behavioralWeaknessSummary");
    }
    if (body.keyMoment) {
      validateText(body.keyMoment, "keyMoment");
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const concept = body.concept as Concept;
  const character = body.character as CharacterArchetype;
  const scores = body.scores as SessionScores;
  const behavioralWeaknessSummary = truncate(body.behavioralWeaknessSummary ?? "", 2000);
  const keyMoment = truncate(body.keyMoment ?? "", 2000);
  const commandsUsed = Array.isArray(body.commandsUsed)
    ? body.commandsUsed.filter((c: unknown) => typeof c === "string").slice(0, 20)
    : [];

  try {
    // Generate the mission
    const serialisedLedger = await serialiseForPrompt();
    const missionPrompt = buildMissionPrompt(concept, scores, serialisedLedger);
    const systemPrompt = `${await buildPersistentContext()}\n\n${missionPrompt}`;

    const rawMission = await generateResponse(
      systemPrompt,
      [{ role: "user", content: "Assign the mission." }],
      PHASE_CONFIG.mission
    );

    // Parse mission text and rationale (case-insensitive split on "RATIONALE:")
    const rationaleIndex = rawMission.toUpperCase().indexOf("RATIONALE:");
    let mission: string;
    let rationale: string;

    if (rationaleIndex !== -1) {
      mission = rawMission.slice(0, rationaleIndex).trim();
      rationale = rawMission.slice(rationaleIndex + "RATIONALE:".length).trim();
    } else {
      mission = rawMission.trim();
      rationale = "";
      console.warn("[mission] Could not parse RATIONALE: section from response");
    }

    // Assemble the complete ledger entry
    const day = (await getLedgerCount()) + 1;

    const ledgerEntry: LedgerEntry = {
      day,
      date: new Date().toISOString().split("T")[0],
      concept: `${concept.name} (${concept.source})`,
      domain: concept.domain,
      character: character.name,
      difficulty: Math.min(5, Math.max(1, character.tactics?.length ?? 3)),
      scores,
      behavioral_weakness_summary: behavioralWeaknessSummary,
      key_moment: keyMoment,
      mission,
      mission_outcome: "",
      commands_used: commandsUsed,
      session_completed: true,
    };

    // Write to Supabase
    await appendEntry(ledgerEntry);
    console.log(`[mission] Day ${day} ledger entry written. Mission assigned.`);

    // Update spaced repetition data
    try {
      await updateSREntry(concept.id, scores as unknown as { [key: string]: number });
      console.log(`[mission] SR entry updated for concept: ${concept.id}`);
    } catch (e) {
      console.warn("[mission] Failed to update SR entry:", e);
    }

    return NextResponse.json({ mission, rationale, ledgerEntry });
  } catch (error) {
    console.error("[mission] Error:", error);
    return NextResponse.json(
      { error: "Mission generation failed. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handlePost, 5);

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
import { generateResponse, PHASE_CONFIG, CircuitBreakerOpenError } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildMissionPrompt, parseMission } from "@/lib/prompts/mission";
import { serialiseForPrompt, appendEntry, getLedgerCount } from "@/lib/ledger";
import { updateSREntry } from "@/lib/spaced-repetition";
import {
  CharacterArchetype,
  Concept,
  LedgerEntry,
  LifeContext,
  LIFE_CONTEXTS,
  SessionScores,
  truncate,
  primaryContextForConcept,
} from "@/lib/types";
import { averageScore } from "@/lib/scoring-dimensions";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateScores, validateText, validateConcept, validateCharacter, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";

async function handlePost(req: NextRequest, userId: string | null) {
  const log = createRequestLogger(req, userId);
  const body = await req.json().catch(() => null);
  if (!body || !body.concept || !body.character || !body.scores) {
    return NextResponse.json(
      { error: "Missing required fields: concept, character, scores" },
      { status: 400 }
    );
  }

  const sessionContext: LifeContext | null =
    typeof body.context === "string" && (LIFE_CONTEXTS as string[]).includes(body.context)
      ? (body.context as LifeContext)
      : null;

  let concept: Concept;
  let character: CharacterArchetype;
  let dimensionSet: LifeContext;
  try {
    concept = validateConcept(body.concept);
    character = validateCharacter(body.character);
    // The set names which keys `scores` must carry, so it has to be resolved
    // before validation. Falls back to the concept's representative context so
    // a client that sends no context still validates against something sane.
    dimensionSet = sessionContext ?? primaryContextForConcept(concept);
    body.scores = validateScores(body.scores, dimensionSet);
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
  // validateScores already verified every key in the set is an integer 1-5
  const scores: SessionScores = body.scores as SessionScores;
  const behavioralWeaknessSummary = truncate(body.behavioralWeaknessSummary ?? "", 2000);
  const keyMoment = truncate(body.keyMoment ?? "", 2000);
  const scenarioSummary = body.scenarioSummary
    ? truncate(body.scenarioSummary, 300)
    : null;
  const commandsUsed = Array.isArray(body.commandsUsed)
    ? body.commandsUsed.filter((c: unknown) => typeof c === "string").slice(0, 20)
    : [];

  try {
    // Generate the mission
    const serialisedLedger = await serialiseForPrompt(7, userId);
    const missionPrompt = buildMissionPrompt(concept, scores, serialisedLedger, dimensionSet);
    const systemPrompt = `${await buildPersistentContext(userId)}\n\n${missionPrompt}`;

    const rawMission = await generateResponse(
      systemPrompt,
      [{ role: "user", content: "Assign the mission." }],
      PHASE_CONFIG.mission
    );

    // Missions are if-then plans: a trigger the user will recognise in the
    // moment, and one behaviour attached to it. parseMission never throws — a
    // malformed response degrades to plain prose rather than losing the row.
    const parsed = parseMission(rawMission);
    const mission = parsed.text;
    const rationale = parsed.rationale;
    if (!parsed.cue || !parsed.action) {
      log.warn("Mission came back without a cue/action pair", { phase: "mission" });
    }

    // Assemble the complete ledger entry
    const day = (await getLedgerCount(userId)) + 1;

    const ledgerEntry: LedgerEntry = {
      day,
      date: new Date().toISOString().split("T")[0],
      concept: `${concept.name} (${concept.source})`,
      domain: concept.domain,
      character: character.name,
      difficulty: Math.min(5, Math.max(1, character.tactics?.length ?? 3)),
      scores,
      dimension_set: dimensionSet,
      behavioral_weakness_summary: behavioralWeaknessSummary,
      key_moment: keyMoment,
      mission,
      mission_cue: parsed.cue || null,
      mission_action: parsed.action || null,
      mission_outcome: "",
      commands_used: commandsUsed,
      session_completed: true,
      // Provenance — what this session actually was, so future sessions can
      // avoid repeating the character and the situation.
      character_id: character.id ?? null,
      context: sessionContext ?? null,
      scenario_summary: scenarioSummary ?? null,
      shape_id: typeof body.shapeId === "string" ? body.shapeId : null,
    };

    // Write to Supabase
    await appendEntry(ledgerEntry, userId);
    log.info(`Day ${day} ledger entry written. Mission assigned.`, { phase: "mission" });

    // Track session completion
    const avg = averageScore(scores);
    trackEvent({
      event: "session_completed",
      userId,
      properties: {
        day,
        concept: concept.name,
        character: character.name,
        average_score: Math.round(avg * 10) / 10,
        commands_used: commandsUsed.join(","),
        used_coach: commandsUsed.includes("/coach"),
        used_skip: commandsUsed.includes("/skip"),
        used_reset: commandsUsed.includes("/reset"),
      },
    });

    // Update spaced repetition data
    try {
      const scoresRecord: { [key: string]: number } = { ...scores };
      await updateSREntry(concept.id, scoresRecord, userId);
      log.info(`SR entry updated for concept: ${concept.id}`, { phase: "mission" });
    } catch (e) {
      log.warn(`Failed to update SR entry: ${e instanceof Error ? e.message : "Unknown error"}`, { phase: "mission" });
    }

    return NextResponse.json({ mission, rationale, ledgerEntry, cue: parsed.cue, action: parsed.action, tell: parsed.tell });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return NextResponse.json(
        { error: "Service temporarily busy", retryAfter: 30 },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    log.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "mission" });
    return NextResponse.json(
      { error: "Mission generation failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
export const POST = withRateLimit(withAuth(handlePost), 5);

/**
 * Phase 2: Roleplay turn — streaming.
 * POST { concept: Concept, character?: CharacterArchetype, context?: LifeContext,
 *        transcript: Message[], userMessage: string | null }
 *
 * `character` is optional. When omitted (the opening turn) the server selects
 * one using recent ledger history and returns it in the X-Character header;
 * subsequent turns send it back so the character stays stable.
 *
 * - First turn (userMessage null, transcript empty): AI speaks first.
 * - Subsequent turns: appends userMessage to transcript and continues.
 *
 * Returns a streaming text response.
 * Scenario context is returned in the X-Scenario-Context header.
 *
 * This endpoint NEVER sees /coach, /reset, or /skip.
 * Reference: PRD Section 3.4
 */

import { NextRequest, NextResponse } from "next/server";
import { streamResponse, PHASE_CONFIG, CircuitBreakerOpenError } from "@/lib/anthropic";
import {
  buildRoleplayPrompt,
  buildScenarioContext,
} from "@/lib/prompts/roleplay";
import {
  CharacterArchetype,
  Concept,
  LifeContext,
  LIFE_CONTEXTS,
  Message,
  truncate,
  MAX_INPUT_LENGTH,
} from "@/lib/types";
import {
  selectCharacter,
  characterIdFromName,
  dispositionsForNames,
} from "@/lib/characters";
import { getRecentEntries } from "@/lib/ledger";
import { nextDisposition, HISTORY_WINDOWS } from "@/lib/selection";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateTranscript, validateText, validateConcept, validateCharacter, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";

/**
 * Pick a character the user hasn't just faced, in a disposition they haven't
 * just had. Both preferences relax inside selectCharacter when the context is
 * too small to honour them, and a ledger read failure degrades to plain
 * context-filtered selection rather than blocking the session.
 */
async function selectCharacterWithHistory(
  concept: Concept,
  context: LifeContext | undefined,
  userId: string | null
): Promise<CharacterArchetype> {
  let recentNames: string[] = [];
  try {
    const recent = await getRecentEntries(HISTORY_WINDOWS.character, userId);
    recentNames = recent.map((e) => e.character).filter(Boolean);
  } catch {
    // No history available — fall through to unconstrained selection.
  }

  const avoidIds = recentNames
    .map(characterIdFromName)
    .filter((id): id is string => id !== null);

  const preferDisposition = nextDisposition(
    dispositionsForNames(recentNames.slice(0, HISTORY_WINDOWS.disposition))
  );

  return selectCharacter(concept, context, { avoidIds, preferDisposition });
}

async function handlePost(req: NextRequest, _userId: string | null) {
  const log = createRequestLogger(req, _userId);
  const body = await req.json().catch(() => null);
  if (!body || !body.concept) {
    return NextResponse.json(
      { error: "Missing required field: concept" },
      { status: 400 }
    );
  }

  const sessionContext: LifeContext | undefined =
    typeof body.context === "string" && (LIFE_CONTEXTS as string[]).includes(body.context)
      ? (body.context as LifeContext)
      : undefined;

  let concept: Concept;
  let character: CharacterArchetype;
  let selectedHere = false;
  try {
    concept = validateConcept(body.concept);
    if (body.character) {
      // Mid-conversation turns send the character back so it stays stable.
      character = validateCharacter(body.character);
    } else {
      // Opening turn: choose here, where the ledger is, so selection can avoid
      // recently used characters and vary the emotional shape of the session.
      character = await selectCharacterWithHistory(concept, sessionContext, _userId);
      selectedHere = true;
    }
    if (body.transcript) body.transcript = validateTranscript(body.transcript);
    if (body.userMessage !== null && body.userMessage !== undefined) {
      validateText(body.userMessage, "userMessage");
    }
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  const userMessage = body.userMessage != null
    ? truncate(body.userMessage, MAX_INPUT_LENGTH)
    : null;
  const scenarioContext = body.scenarioContext
    ? truncate(body.scenarioContext, MAX_INPUT_LENGTH)
    : undefined;
  // body.transcript has been validated by validateTranscript above (returns Message[])
  const transcript: Message[] = body.transcript ?? [];

  try {
    // Generate or reuse scenario context
    const scenario = scenarioContext ?? buildScenarioContext(concept, character, sessionContext);

    const roleplayPrompt = buildRoleplayPrompt(concept, character, scenario);
    // Roleplay uses a lightweight context — the character doesn't need the full user bio
    const systemPrompt = roleplayPrompt;

    // Build the messages array for the API call
    let messages: Message[];

    if (userMessage === null && transcript.length === 0) {
      messages = [
        {
          role: "user",
          content: "[Session begins. You speak first. Deliver your opening line in character.]",
        },
      ];
    } else {
      messages = [...transcript];
      if (messages.length > 0 && messages[0].role === "assistant") {
        messages.unshift({
          role: "user",
          content: "[Session begins. You speak first. Deliver your opening line in character.]",
        });
      }
      if (userMessage !== null) {
        messages.push({ role: "user", content: userMessage });
      }
    }

    const stream = streamResponse(systemPrompt, messages, PHASE_CONFIG.roleplay);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Scenario-Context": encodeURIComponent(scenario),
        // Only present when the server chose the character, so the client can
        // adopt it and send it back on subsequent turns.
        ...(selectedHere
          ? { "X-Character": encodeURIComponent(JSON.stringify(character)) }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return NextResponse.json(
        { error: "Service temporarily busy", retryAfter: 30 },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    log.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "roleplay" });
    return NextResponse.json(
      { error: "Roleplay failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
export const POST = withRateLimit(withAuth(handlePost), 10);

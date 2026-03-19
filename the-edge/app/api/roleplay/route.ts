/**
 * Phase 2: Roleplay turn — streaming.
 * POST { concept: Concept, character: CharacterArchetype,
 *        transcript: Message[], userMessage: string | null }
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
import { streamResponse, PHASE_CONFIG } from "@/lib/anthropic";
import {
  buildRoleplayPrompt,
  buildScenarioContext,
} from "@/lib/prompts/roleplay";
import {
  CharacterArchetype,
  Concept,
  Message,
  truncate,
  MAX_INPUT_LENGTH,
} from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateTranscript, validateText, validateConcept, validateCharacter, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function handlePost(req: NextRequest, _userId: string | null) {
  const body = await req.json().catch(() => null);
  if (!body || !body.concept || !body.character) {
    return NextResponse.json(
      { error: "Missing required fields: concept, character" },
      { status: 400 }
    );
  }

  let concept: Concept;
  let character: CharacterArchetype;
  try {
    concept = validateConcept(body.concept);
    character = validateCharacter(body.character);
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
    const scenario = scenarioContext ?? buildScenarioContext(concept, character);

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
      },
    });
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "roleplay" });
    return NextResponse.json(
      { error: "Roleplay failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
export const POST = withRateLimit(withAuth(handlePost), 10);

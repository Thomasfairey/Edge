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
  validateTranscript,
  truncate,
  MAX_INPUT_LENGTH,
} from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.concept || !body.character) {
    return NextResponse.json(
      { error: "Missing required fields: concept, character" },
      { status: 400 }
    );
  }

  const concept = body.concept as Concept;
  const character = body.character as CharacterArchetype;
  const userMessage = body.userMessage != null
    ? truncate(body.userMessage, MAX_INPUT_LENGTH)
    : null;
  const scenarioContext = body.scenarioContext
    ? truncate(body.scenarioContext, MAX_INPUT_LENGTH)
    : undefined;

  // Validate transcript if provided
  const rawTranscript = body.transcript ?? [];
  const transcript = validateTranscript(rawTranscript);
  if (!transcript) {
    return NextResponse.json(
      { error: "Invalid transcript format" },
      { status: 400 }
    );
  }

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
    console.error("[roleplay] Error:", error);
    return NextResponse.json(
      { error: "Roleplay failed. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handlePost, 10);

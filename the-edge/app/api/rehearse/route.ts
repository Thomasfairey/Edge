/**
 * Rehearsal — the user's second attempt at the moment they handled worst.
 *
 * POST { concept, character, cue, originalReply, newReply }
 * Returns { response, verdict, comparison }
 *
 * `response` is the character reacting in voice, so the user sees a
 * consequence rather than a grade; `comparison` is the coach naming what
 * changed. See lib/prompts/rehearse.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG, CircuitBreakerOpenError } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildRehearsePrompt, parseRehearseResponse } from "@/lib/prompts/rehearse";
import { CharacterArchetype, Concept, truncate } from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateConcept, validateCharacter, validateText, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";
import { captureError } from "@/lib/error-reporting";

export const maxDuration = 30;

async function handlePost(req: NextRequest, userId: string | null) {
  const log = createRequestLogger(req, userId);
  const body = await req.json().catch(() => null);
  if (!body || !body.concept || !body.character || !body.newReply) {
    return NextResponse.json(
      { error: "Missing required fields: concept, character, newReply" },
      { status: 400 }
    );
  }

  let concept: Concept;
  let character: CharacterArchetype;
  try {
    concept = validateConcept(body.concept);
    character = validateCharacter(body.character);
    validateText(body.newReply, "newReply");
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const cue = truncate(body.cue, 2000);
  const originalReply = truncate(body.originalReply, 2000);
  const newReply = truncate(body.newReply, 2000);

  try {
    const rehearsePrompt = buildRehearsePrompt(
      concept,
      character,
      cue,
      originalReply,
      newReply
    );
    const systemPrompt = `${await buildPersistentContext(userId)}\n\n${rehearsePrompt}`;

    const raw = await generateResponse(
      systemPrompt,
      [{ role: "user", content: "React, then compare." }],
      PHASE_CONFIG.rehearse,
      25_000
    );

    const result = parseRehearseResponse(raw);
    log.info(`Rehearsal verdict: ${result.verdict}`, { phase: "rehearse" });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return NextResponse.json(
        { error: "Service temporarily busy", retryAfter: 30 },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    captureError(error, {
      phase: "rehearse",
      source: "/api/rehearse",
      userId,
      metadata: { concept: concept.name, character: character.name },
    });
    return NextResponse.json(
      { error: "Rehearsal failed. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(withAuth(handlePost), 10);

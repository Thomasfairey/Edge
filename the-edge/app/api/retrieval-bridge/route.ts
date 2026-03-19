/**
 * Retrieval Bridge API route.
 * Sits between Learn and Simulate — forces active recall before practice.
 *
 * POST { concept: Concept, userResponse?: string }
 * - No userResponse: returns the hardcoded question (no LLM call)
 * - With userResponse: evaluates via LLM, returns { response, ready }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildRetrievalBridgePrompt } from "@/lib/prompts/retrieval-bridge";
import { Concept, truncate } from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateText, validateConcept, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function handlePost(req: NextRequest, userId: string | null) {
  const body = await req.json().catch(() => null);
  if (!body || !body.concept) {
    return NextResponse.json(
      { error: "Missing required field: concept" },
      { status: 400 }
    );
  }

  let concept: Concept;
  try {
    concept = validateConcept(body.concept);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  const userResponse = body.userResponse ? truncate(body.userResponse, 5000) : undefined;

  // First call — return the question without an LLM call
  if (!userResponse) {
    const question = `Before we begin — in one sentence, what is ${concept.name} and when would you deploy it?`;
    return NextResponse.json({ response: question, ready: false });
  }

  // Validate user response length
  try {
    validateText(userResponse, "userResponse");
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  try {
    // Second call — evaluate the user's response via LLM
    const retrievalPrompt = buildRetrievalBridgePrompt(concept);
    const systemPrompt = `${await buildPersistentContext(userId)}\n\n${retrievalPrompt}`;

    const rawResponse = await generateResponse(
      systemPrompt,
      [{ role: "user", content: userResponse }],
      PHASE_CONFIG.checkin,
      12_000 // Must be < maxDuration (15s)
    );

    // Use case-insensitive check with boundary matching to avoid false positives
    const ready = /let[''\u2019]?s go/i.test(rawResponse);

    return NextResponse.json({ response: rawResponse, ready });
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "retrieval-bridge" });
    return NextResponse.json(
      { error: "Retrieval evaluation failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 15;
export const POST = withRateLimit(withAuth(handlePost), 10);

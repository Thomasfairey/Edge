/**
 * /coach mentor assist — parallel Haiku 4.5 endpoint.
 * POST { transcript: Message[], concept: Concept }
 * Returns { advice: string }
 *
 * COMPLETELY INDEPENDENT of the roleplay endpoint.
 * Reads the transcript but does not write to it.
 * The frontend calls this in parallel with the roleplay.
 * Reference: PRD Section 3.4 — Mid-Scenario Mentor Assist
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildCoachPrompt } from "@/lib/prompts/coach";
import { Concept, Message } from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { validateTranscript, validateConcept, ValidationError } from "@/lib/validate";
import { withAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function handlePost(req: NextRequest, _userId: string | null) {
  const body = await req.json().catch(() => null);
  if (!body || !body.transcript || !body.concept) {
    return NextResponse.json(
      { error: "Missing required fields: transcript, concept" },
      { status: 400 }
    );
  }

  let concept: Concept;
  try {
    body.transcript = validateTranscript(body.transcript);
    concept = validateConcept(body.concept);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const transcript: Message[] = body.transcript;

  try {
    const systemPrompt = buildCoachPrompt(transcript, concept);

    const advice = await generateResponse(
      systemPrompt,
      [{ role: "user", content: "What are my best moves right now?" }],
      PHASE_CONFIG.coach,
      12_000 // Must be < maxDuration (15s)
    );

    return NextResponse.json({ advice });
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "coach" });
    return NextResponse.json(
      { error: "Coach assist failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 15;
export const POST = withRateLimit(withAuth(handlePost), 10);

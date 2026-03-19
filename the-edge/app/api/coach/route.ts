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
import { validateTranscript, ValidationError } from "@/lib/validate";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.transcript || !body.concept) {
    return NextResponse.json(
      { error: "Missing required fields: transcript, concept" },
      { status: 400 }
    );
  }

  try {
    body.transcript = validateTranscript(body.transcript);
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const transcript = body.transcript as Message[];
  const concept = body.concept as Concept;

  try {
    const systemPrompt = buildCoachPrompt(transcript as Message[], concept);

    const advice = await generateResponse(
      systemPrompt,
      [{ role: "user", content: "What are my best moves right now?" }],
      PHASE_CONFIG.coach
    );

    return NextResponse.json({ advice });
  } catch (error) {
    console.error("[coach] Error:", error);
    return NextResponse.json(
      { error: "Coach assist failed. Please try again." },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(handlePost, 10);

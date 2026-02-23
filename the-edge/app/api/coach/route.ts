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

export async function POST(req: NextRequest) {
  const { transcript, concept } = (await req.json()) as {
    transcript: Message[];
    concept: Concept;
  };

  const systemPrompt = buildCoachPrompt(transcript, concept);

  const advice = await generateResponse(
    systemPrompt,
    [{ role: "user", content: "What are my best moves right now?" }],
    PHASE_CONFIG.coach
  );

  return NextResponse.json({ advice });
}

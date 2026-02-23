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
import { Concept } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { concept, userResponse } = (await req.json()) as {
    concept: Concept;
    userResponse?: string;
  };

  // First call — return the question without an LLM call
  if (!userResponse) {
    const question = `Before we begin — in one sentence, what is ${concept.name} and when would you deploy it?`;
    return NextResponse.json({ response: question, ready: false });
  }

  // Second call — evaluate the user's response via LLM
  const retrievalPrompt = buildRetrievalBridgePrompt(concept);
  const systemPrompt = `${buildPersistentContext()}\n\n${retrievalPrompt}`;

  const rawResponse = await generateResponse(
    systemPrompt,
    [{ role: "user", content: userResponse }],
    PHASE_CONFIG.gate
  );

  const ready = rawResponse.includes("Let's go.");

  return NextResponse.json({ response: rawResponse, ready });
}

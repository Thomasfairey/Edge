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

import { NextRequest } from "next/server";
import { streamResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import {
  buildRoleplayPrompt,
  buildScenarioContext,
} from "@/lib/prompts/roleplay";
import { CharacterArchetype, Concept, Message } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { concept, character, transcript, userMessage, scenarioContext } =
    (await req.json()) as {
      concept: Concept;
      character: CharacterArchetype;
      transcript: Message[];
      userMessage: string | null;
      scenarioContext?: string;
    };

  // Generate or reuse scenario context
  const scenario = scenarioContext ?? buildScenarioContext(concept, character);

  const roleplayPrompt = buildRoleplayPrompt(concept, character, scenario);
  const systemPrompt = `${buildPersistentContext()}\n\n${roleplayPrompt}`;

  // Build the messages array for the API call
  let messages: Message[];

  if (userMessage === null && transcript.length === 0) {
    // First turn — AI speaks first. Send a single user message to trigger
    // the opening line (the system prompt instructs the AI to open in character).
    messages = [
      {
        role: "user",
        content: "[Session begins. You speak first. Deliver your opening line in character.]",
      },
    ];
  } else {
    // Subsequent turn — append the new user message to the existing transcript.
    // Prepend the trigger message so the first message is always from "user"
    // (Anthropic API requires user-first message ordering).
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
}

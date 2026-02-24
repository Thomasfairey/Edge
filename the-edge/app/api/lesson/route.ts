/**
 * Phase 1: Micro-lesson generation.
 * POST { conceptId?: string, stream?: boolean }
 *
 * If stream=true (default): Returns streaming text with concept in X-Concept header.
 * If stream=false: Returns { concept, lessonContent } JSON (for pre-generation).
 *
 * Reference: PRD Section 3.3
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, streamResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildLessonPrompt } from "@/lib/prompts/lesson";
import { CONCEPTS, selectConcept } from "@/lib/concepts";
import { getCompletedConcepts } from "@/lib/ledger";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      conceptId?: string;
      stream?: boolean;
    };

    const shouldStream = body.stream !== false;

    // Resolve the concept: lookup by ID if provided, otherwise auto-select
    let concept;
    if (body.conceptId) {
      const found = CONCEPTS.find((c) => c.id === body.conceptId);
      if (!found) {
        return NextResponse.json(
          { error: `Concept not found: ${body.conceptId}` },
          { status: 400 }
        );
      }
      concept = found;
    } else {
      const completedIds = getCompletedConcepts();
      concept = selectConcept(completedIds);
    }

    const lessonPrompt = buildLessonPrompt(concept);
    const systemPrompt = `${buildPersistentContext()}\n\n${lessonPrompt}`;

    const userMessage = {
      role: "user" as const,
      content: `Deliver the micro-lesson for: ${concept.name} (${concept.source})`,
    };

    if (shouldStream) {
      const stream = streamResponse(systemPrompt, [userMessage], PHASE_CONFIG.lesson);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
          "X-Concept": encodeURIComponent(JSON.stringify(concept)),
        },
      });
    } else {
      // Non-streaming path (used for pre-generation)
      const lessonContent = await generateResponse(
        systemPrompt,
        [userMessage],
        PHASE_CONFIG.lesson
      );

      return NextResponse.json({ concept, lessonContent });
    }
  } catch (error) {
    console.error("[lesson] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate lesson. Please retry." },
      { status: 500 }
    );
  }
}

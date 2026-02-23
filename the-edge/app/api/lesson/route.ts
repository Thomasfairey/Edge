/**
 * Phase 1: Micro-lesson generation.
 * POST { conceptId?: string }
 * Returns { concept: Concept, lessonContent: string }
 * Non-streaming — lesson is displayed as a full block.
 * Reference: PRD Section 3.3
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildLessonPrompt } from "@/lib/prompts/lesson";
import { CONCEPTS, selectConcept } from "@/lib/concepts";
import { getCompletedConcepts } from "@/lib/ledger";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    conceptId?: string;
  };

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

  const lessonContent = await generateResponse(
    systemPrompt,
    [
      {
        role: "user",
        content: `Deliver the micro-lesson for: ${concept.name} (${concept.source})`,
      },
    ],
    PHASE_CONFIG.lesson
  );

  return NextResponse.json({ concept, lessonContent });
}

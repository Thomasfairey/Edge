/**
 * Phase 1: Micro-lesson generation.
 * POST { conceptId?: string, stream?: boolean }
 *
 * If stream=true (default): Returns streaming text with concept in X-Concept header.
 * If stream=false: Returns { concept, lessonContent } JSON (for pre-generation).
 *
 * Supports spaced repetition review sessions — returns X-Is-Review header.
 * Reference: PRD Section 3.3
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, streamResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildLessonPrompt } from "@/lib/prompts/lesson";
import { CONCEPTS, selectConcept } from "@/lib/concepts";
import { getCompletedConcepts } from "@/lib/ledger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function handlePost(req: NextRequest, userId: string | null) {
  const raw: unknown = await req.json().catch(() => ({}));
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  if (body.conceptId !== undefined && typeof body.conceptId !== "string") {
    return NextResponse.json(
      { error: "Invalid conceptId" },
      { status: 400 }
    );
  }

  const conceptId = typeof body.conceptId === "string" ? body.conceptId : undefined;
  const shouldStream = body.stream !== false;

  try {
    // Resolve the concept: lookup by ID if provided, otherwise auto-select
    let concept;
    let isReview = false;

    if (conceptId) {
      const found = CONCEPTS.find((c) => c.id === conceptId);
      if (!found) {
        return NextResponse.json(
          { error: `Concept not found: ${conceptId}` },
          { status: 400 }
        );
      }
      concept = found;
    } else {
      const completedIds = await getCompletedConcepts(userId);
      const result = await selectConcept(completedIds, userId);
      concept = result.concept;
      isReview = result.isReview;
    }

    const lessonPrompt = buildLessonPrompt(concept, isReview);
    const systemPrompt = `${await buildPersistentContext(userId)}\n\n${lessonPrompt}`;

    const userMessage = {
      role: "user" as const,
      content: isReview
        ? `Deliver the review lesson for: ${concept.name} (${concept.source})`
        : `Deliver the micro-lesson for: ${concept.name} (${concept.source})`,
    };

    if (shouldStream) {
      const stream = streamResponse(systemPrompt, [userMessage], PHASE_CONFIG.lesson);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-cache",
          "X-Concept": encodeURIComponent(JSON.stringify(concept)),
          "X-Is-Review": isReview ? "true" : "false",
        },
      });
    } else {
      const lessonContent = await generateResponse(
        systemPrompt,
        [userMessage],
        PHASE_CONFIG.lesson
      );

      return NextResponse.json({ concept, lessonContent, isReview });
    }
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "lesson" });
    return NextResponse.json(
      { error: "Lesson generation failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
export const POST = withRateLimit(withAuth(handlePost), 5);

/**
 * Check-in — mission accountability, called at end of session before new mission (Day 2+).
 * POST { previousMission: string, outcomeType: 'completed' | 'tried' | 'skipped', userOutcome?: string }
 * Returns { response: string, type: string, insight?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildCheckinPrompt } from "@/lib/prompts/checkin";
import { updateLastMissionOutcome } from "@/lib/ledger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { validateStringLength, MAX_TEXT_LENGTH, MAX_LONG_TEXT_LENGTH } from "@/lib/validate-input";

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.previousMission || !body.outcomeType) {
    return NextResponse.json(
      { error: "Missing required fields: previousMission, outcomeType" },
      { status: 400 }
    );
  }

  const { previousMission, outcomeType, userOutcome } = body as {
    previousMission: string;
    outcomeType: "completed" | "tried" | "skipped";
    userOutcome?: string;
  };

  const missionError = validateStringLength(previousMission, "previousMission", MAX_LONG_TEXT_LENGTH);
  if (missionError) {
    return NextResponse.json({ error: missionError }, { status: 400 });
  }
  const outcomeError = validateStringLength(userOutcome, "userOutcome", MAX_TEXT_LENGTH);
  if (outcomeError) {
    return NextResponse.json({ error: outcomeError }, { status: 400 });
  }

  // Validate outcomeType
  if (!["completed", "tried", "skipped"].includes(outcomeType)) {
    return NextResponse.json(
      { error: "outcomeType must be 'completed', 'tried', or 'skipped'" },
      { status: 400 }
    );
  }

  // Handle "skipped" — no API call needed
  if (outcomeType === "skipped") {
    await updateLastMissionOutcome("NOT EXECUTED");

    return NextResponse.json({
      response: "No problem. The mission you\u2019re about to get will give you a clean shot.",
      type: "SKIPPED",
    });
  }

  // Handle "completed" or "tried" — call LLM
  const checkinPrompt = buildCheckinPrompt(
    previousMission,
    userOutcome || "",
    outcomeType
  );
  const systemPrompt = `${await buildPersistentContext()}\n\n${checkinPrompt}`;

  const rawResponse = await generateResponse(
    systemPrompt,
    [{ role: "user", content: userOutcome || outcomeType }],
    PHASE_CONFIG.checkin
  );

  // Parse the [CHECKIN_TYPE: ...] tag
  const typeMatch = rawResponse.match(/\[CHECKIN_TYPE:\s*(\w+)\]/);
  const type = typeMatch?.[1] ?? outcomeType.toUpperCase();

  // Parse the [INSIGHT: ...] tag
  const insightMatch = rawResponse.match(/\[INSIGHT:\s*([^\]]+)\]/);
  const insight = insightMatch?.[1]?.trim() ?? undefined;

  // Strip tags from the display response
  const response = rawResponse
    .replace(/\[CHECKIN_TYPE:\s*\w+\]/, "")
    .replace(/\[INSIGHT:\s*[^\]]+\]/, "")
    .trim();

  // Update the most recent ledger entry's mission_outcome
  await updateLastMissionOutcome(userOutcome || outcomeType);

  return NextResponse.json({ response, type, insight });
}

export const POST = withRateLimit(withAuth(handlePost), 10);

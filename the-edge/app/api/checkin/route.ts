/**
 * Check-in — mission accountability, called at end of session before new mission (Day 2+).
 * POST { previousMission: string, outcomeType: 'completed' | 'tried' | 'skipped', userOutcome?: string }
 * Returns { response: string, type: string, insight?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildCheckinPrompt } from "@/lib/prompts/checkin";
import { getLedger } from "@/lib/ledger";
import { withRateLimit } from "@/lib/with-rate-limit";
import fs from "fs";
import path from "path";

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

  // Validate outcomeType
  if (!["completed", "tried", "skipped"].includes(outcomeType)) {
    return NextResponse.json(
      { error: "outcomeType must be 'completed', 'tried', or 'skipped'" },
      { status: 400 }
    );
  }

  // Handle "skipped" — no API call needed
  if (outcomeType === "skipped") {
    const entries = getLedger();
    if (entries.length > 0) {
      entries[entries.length - 1].mission_outcome = "NOT EXECUTED";
      const ledgerPath = path.join(process.cwd(), "data", "ledger.json");
      fs.writeFileSync(ledgerPath, JSON.stringify(entries, null, 2), "utf-8");
    }

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
  const systemPrompt = `${buildPersistentContext()}\n\n${checkinPrompt}`;

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
  const entries = getLedger();
  if (entries.length > 0) {
    entries[entries.length - 1].mission_outcome = userOutcome || outcomeType;
    const ledgerPath = path.join(process.cwd(), "data", "ledger.json");
    fs.writeFileSync(ledgerPath, JSON.stringify(entries, null, 2), "utf-8");
  }

  return NextResponse.json({ response, type, insight });
}

export const POST = withRateLimit(handlePost, 10);

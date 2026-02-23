/**
 * Phase 0: Check-in — accountability check with pill-based outcomes.
 * POST { previousMission: string, outcomeType: 'completed' | 'tried' | 'skipped', userOutcome?: string }
 * Returns { response: string, outcome: "EXECUTED" | "UNCLEAR" | "SKIPPED" }
 * Reference: PRD Section 3.2
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildCheckinPrompt } from "@/lib/prompts/checkin";
import { getLedger } from "@/lib/ledger";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const { previousMission, outcomeType, userOutcome } = (await req.json()) as {
    previousMission: string;
    outcomeType: "completed" | "tried" | "skipped";
    userOutcome?: string;
  };

  // Handle "skipped" — no API call needed
  if (outcomeType === "skipped") {
    // Update the most recent ledger entry's mission_outcome
    const entries = getLedger();
    if (entries.length > 0) {
      entries[entries.length - 1].mission_outcome = "NOT EXECUTED";
      const ledgerPath = path.join(process.cwd(), "data", "ledger.json");
      fs.writeFileSync(ledgerPath, JSON.stringify(entries, null, 2), "utf-8");
    }

    return NextResponse.json({
      response: "No worries. Let\u2019s learn.",
      outcome: "SKIPPED",
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
  const outcomeMatch = rawResponse.match(
    /\[CHECKIN_TYPE:\s*(EXECUTED|UNCLEAR)\]/
  );
  const outcome = (outcomeMatch?.[1] ?? "UNCLEAR") as "EXECUTED" | "UNCLEAR";

  // Strip the tag from the display response
  const response = rawResponse
    .replace(/\[CHECKIN_TYPE:\s*(EXECUTED|UNCLEAR)\]/, "")
    .trim();

  // Update the most recent ledger entry's mission_outcome
  const entries = getLedger();
  if (entries.length > 0) {
    entries[entries.length - 1].mission_outcome =
      outcome === "EXECUTED" ? (userOutcome || "Executed") : "UNCLEAR";
    const ledgerPath = path.join(process.cwd(), "data", "ledger.json");
    fs.writeFileSync(ledgerPath, JSON.stringify(entries, null, 2), "utf-8");
  }

  return NextResponse.json({ response, outcome });
}

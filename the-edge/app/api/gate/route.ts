/**
 * Phase 0: The Gate — accountability check.
 * POST { previousMission: string, userResponse: string }
 * Returns { response: string, outcome: "EXECUTED" | "UNCLEAR" | "NOT_EXECUTED" }
 * Reference: PRD Section 3.2
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildGatePrompt } from "@/lib/prompts/gate";
import { getLedger } from "@/lib/ledger";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const { previousMission, previousConcept, userResponse } = (await req.json()) as {
    previousMission: string;
    previousConcept?: string;
    userResponse: string;
  };

  const gatePrompt = buildGatePrompt(previousMission, previousConcept);
  const systemPrompt = `${buildPersistentContext()}\n\n${gatePrompt}`;

  const rawResponse = await generateResponse(
    systemPrompt,
    [{ role: "user", content: userResponse }],
    PHASE_CONFIG.gate
  );

  // Parse the [GATE_OUTCOME: ...] tag
  const outcomeMatch = rawResponse.match(
    /\[GATE_OUTCOME:\s*(EXECUTED|UNCLEAR|NOT_EXECUTED)\]/
  );
  const outcome = (outcomeMatch?.[1] ?? "UNCLEAR") as
    | "EXECUTED"
    | "UNCLEAR"
    | "NOT_EXECUTED";

  // Strip the tag from the display response
  const response = rawResponse
    .replace(/\[GATE_OUTCOME:\s*(EXECUTED|UNCLEAR|NOT_EXECUTED)\]/, "")
    .trim();

  // Update the most recent ledger entry's mission_outcome
  const entries = getLedger();
  if (entries.length > 0) {
    entries[entries.length - 1].mission_outcome =
      outcome === "NOT_EXECUTED" ? "NOT EXECUTED" : userResponse;
    const ledgerPath = path.join(process.cwd(), "data", "ledger.json");
    fs.writeFileSync(ledgerPath, JSON.stringify(entries, null, 2), "utf-8");
  }

  return NextResponse.json({ response, outcome });
}

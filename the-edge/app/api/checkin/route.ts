/**
 * Check-in — what actually happened with yesterday's mission.
 *
 * POST { previousMission, opportunity?, enacted?, outcome?, outcomeType?, userOutcome? }
 * Returns { response, type, insight? }
 *
 * The structured fields are preferred; `outcomeType`/`userOutcome` remain
 * accepted so a client mid-upgrade, or a session resumed from an older blob,
 * still checks in rather than erroring.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateResponse, PHASE_CONFIG, CircuitBreakerOpenError } from "@/lib/anthropic";
import { buildPersistentContext } from "@/lib/prompts/system-context";
import { buildCheckinPrompt } from "@/lib/prompts/checkin";
import { getLastEntry, updateLastMissionOutcome } from "@/lib/ledger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { truncate } from "@/lib/types";
import {
  CheckinState,
  Enactment,
  outcomeTypeFor,
  serialiseCheckin,
} from "@/lib/checkin";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";

const VALID_OUTCOME_TYPES = ["completed", "tried", "skipped"] as const;
const VALID_ENACTMENTS: Enactment[] = ["yes", "partly", "no"];

/**
 * Build the check-in state from whichever shape the client sent.
 *
 * A legacy `outcomeType` tells us what the user did but not whether they got
 * the chance, so `opportunity` stays null rather than being guessed — an
 * invented `false` would corrupt the enactment stats.
 */
function readState(body: Record<string, unknown>): CheckinState | null {
  if (typeof body.opportunity !== "boolean") return null;
  const enacted =
    typeof body.enacted === "string" && VALID_ENACTMENTS.includes(body.enacted as Enactment)
      ? (body.enacted as Enactment)
      : null;
  return {
    opportunity: body.opportunity,
    enacted: body.opportunity ? enacted : null,
    outcome: truncate(body.outcome ?? "", 5000),
  };
}

async function handlePost(req: NextRequest, userId: string | null) {
  const log = createRequestLogger(req, userId);
  const body = await req.json().catch(() => null);
  if (!body || !body.previousMission) {
    return NextResponse.json(
      { error: "Missing required field: previousMission" },
      { status: 400 }
    );
  }

  const previousMission = truncate(body.previousMission, 2000);
  const state = readState(body as Record<string, unknown>);

  let outcomeType: (typeof VALID_OUTCOME_TYPES)[number];
  let userOutcome: string;

  if (state) {
    outcomeType = outcomeTypeFor(state);
    userOutcome = state.outcome;
  } else {
    if (typeof body.outcomeType !== "string" ||
        !VALID_OUTCOME_TYPES.includes(body.outcomeType as (typeof VALID_OUTCOME_TYPES)[number])) {
      return NextResponse.json(
        { error: "Provide `opportunity`, or an outcomeType of 'completed', 'tried', or 'skipped'" },
        { status: 400 }
      );
    }
    outcomeType = body.outcomeType as (typeof VALID_OUTCOME_TYPES)[number];
    userOutcome = truncate(body.userOutcome ?? "", 5000);
  }

  const serialised = state ? serialiseCheckin(state) : userOutcome || "NOT EXECUTED";

  try {
    // The moment never arriving needs no model call, and the right response is
    // short and free of judgment. Everything else — including "I had the chance
    // and didn't take it" — gets a real one, because that answer is honest and
    // deserves more than a canned line.
    if (state?.opportunity === false) {
      await updateLastMissionOutcome(serialised, userId, {
        opportunity: false,
        enacted: null,
      });
      return NextResponse.json({
        response: "That one never got its moment — today’s will give you a cleaner shot.",
        type: "SKIPPED",
      });
    }

    // Legacy skip path: no structured answers, so nothing to record beyond the
    // fact that it did not happen.
    if (!state && outcomeType === "skipped") {
      await updateLastMissionOutcome("NOT EXECUTED", userId);
      return NextResponse.json({
        response: "No problem. The mission you’re about to get will give you a clean shot.",
        type: "SKIPPED",
      });
    }

    const lastEntry = await getLastEntry(userId).catch(() => null);

    const checkinPrompt = buildCheckinPrompt(
      previousMission,
      userOutcome || "",
      outcomeType,
      state ?? undefined,
      lastEntry?.mission_commitment ?? null
    );
    const systemPrompt = `${await buildPersistentContext(userId)}\n\n${checkinPrompt}`;

    const rawResponse = await generateResponse(
      systemPrompt,
      [{ role: "user", content: serialised }],
      PHASE_CONFIG.checkin
    );

    const typeMatch = rawResponse.match(/\[CHECKIN_TYPE:\s*(\w+)\]/);
    const type = typeMatch?.[1] ?? outcomeType.toUpperCase();

    const insightMatch = rawResponse.match(/\[INSIGHT:\s*([^\]]+)\]/);
    const insight = insightMatch?.[1]?.trim() ?? undefined;

    const response = rawResponse
      .replace(/\[CHECKIN_TYPE:\s*\w+\]/, "")
      .replace(/\[INSIGHT:\s*[^\]]+\]/, "")
      .trim();

    await updateLastMissionOutcome(
      serialised,
      userId,
      state ? { opportunity: state.opportunity, enacted: state.enacted } : undefined
    );

    return NextResponse.json({ response, type, insight });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      return NextResponse.json(
        { error: "Service temporarily busy", retryAfter: 30 },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    log.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "checkin" });
    return NextResponse.json(
      { error: "Check-in failed. Please try again." },
      { status: 500 }
    );
  }
}

export const maxDuration = 30;
export const POST = withRateLimit(withAuth(handlePost), 10);

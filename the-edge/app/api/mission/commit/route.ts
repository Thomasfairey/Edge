/**
 * Record when the user committed to running today's mission.
 *
 * POST { commitment: string } → { ok: true }
 *
 * The ledger row is written when the mission is generated, which is before the
 * user has chosen a when. This patches that choice onto the most recent row so
 * tomorrow's check-in can hold them to it — "you said tonight" is a materially
 * different question from "how did it go".
 */

import { NextRequest, NextResponse } from "next/server";
import { updateLastMissionCommitment } from "@/lib/ledger";
import { truncate } from "@/lib/types";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";

async function handlePost(req: NextRequest, userId: string | null) {
  const log = createRequestLogger(req, userId);
  const body = await req.json().catch(() => null);
  const commitment = truncate(body?.commitment, 120).trim();

  if (!commitment) {
    return NextResponse.json({ error: "Missing commitment" }, { status: 400 });
  }

  try {
    await updateLastMissionCommitment(commitment, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never fail the session over this — the commitment has already done most
    // of its work by being chosen.
    log.warn(
      `Failed to record mission commitment: ${error instanceof Error ? error.message : "unknown"}`,
      { phase: "mission" }
    );
    return NextResponse.json({ ok: false });
  }
}

export const POST = withRateLimit(withAuth(handlePost), 10);

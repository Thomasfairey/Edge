/**
 * POST /api/track — client-side analytics event ingestion.
 * Accepts { event, properties } and writes to analytics_events table.
 * Fire-and-forget from the client's perspective.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { trackEvent, type AnalyticsEvent } from "@/lib/analytics";

const VALID_EVENTS = new Set<AnalyticsEvent>([
  "session_started",
  "session_completed",
  "session_resumed",
  "phase_completed",
  "phase_skipped",
  "roleplay_turn",
  "command_used",
  "mission_outcome",
  "voice_used",
  "debrief_fallback",
  "retry_exhausted",
]);

async function handlePost(req: NextRequest, userId: string | null) {
  const body = await req.json().catch(() => null);
  if (!body?.event || !VALID_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const properties =
    body.properties && typeof body.properties === "object"
      ? body.properties
      : {};

  trackEvent({ event: body.event, userId, properties });

  return NextResponse.json({ ok: true });
}

export const POST = withRateLimit(withAuth(handlePost), 60);

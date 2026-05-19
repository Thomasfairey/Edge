/**
 * Lightweight analytics — tracks events to Supabase for V0 success metrics.
 *
 * Tracked events map to PRD Section 7.1 success criteria:
 * - session_started / session_completed → daily completion rate (26/30 target)
 * - phase_completed / phase_skipped → session completion rate (90%+ target)
 * - roleplay_turn → roleplay depth (6+ exchanges target)
 * - command_used → bailout rate (<20% target)
 * - mission_outcome → mission execution quality (60%+ target)
 * - voice_used → voice adoption metrics
 *
 * Fire-and-forget — never blocks the user flow.
 */

import { supabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export type AnalyticsEvent =
  | "session_started"
  | "session_completed"
  | "session_resumed"
  | "phase_completed"
  | "phase_skipped"
  | "roleplay_turn"
  | "command_used"
  | "mission_outcome"
  | "voice_used"
  | "debrief_fallback"
  | "circuit_breaker_trip"
  | "retry_exhausted";

interface EventPayload {
  event: AnalyticsEvent;
  userId?: string | null;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Track an analytics event. Server-only — imports the service-role Supabase client.
 * Browser code must use trackClientEvent from "@/lib/analytics-client" instead;
 * importing this module in a client bundle pulls supabaseAdmin and its env check
 * into the browser.
 */
export function trackEvent({ event, userId, properties }: EventPayload): void {
  Promise.resolve(
    supabaseAdmin
      .from("analytics_events")
      .insert({
        event,
        user_id: userId ?? null,
        properties: properties ?? {},
        created_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) {
          logger.warn(`Analytics write failed: ${error.message}`, { phase: "analytics" });
        }
      })
  ).catch(() => {});
}

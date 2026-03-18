/**
 * Status route — dashboard data for the home screen.
 */

import { Hono } from "hono";
import { createUserClient } from "../db/client.js";
import { authMiddleware, type AuthUser } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { getLastEntry, getRecentScores, getStreakCount } from "../services/ledger.js";
import { getSRSummary } from "../services/spaced-rep.js";
import { getProfile, getSessionsThisWeek } from "../services/user.js";
import type { StatusResponse } from "../types/api.js";
import type { AppEnv } from "../types/env.js";

const status = new Hono<AppEnv>();

status.use("*", authMiddleware, rateLimit(20));

/**
 * GET /v1/status
 */
status.get("/", async (c) => {
  const user = c.get("user") as AuthUser;
  const token = c.get("token") as string;
  const db = createUserClient(token);

  const [profile, lastEntry, recentScores, streakCount, srSummary, sessionsThisWeek] =
    await Promise.all([
      getProfile(db, user.id),
      getLastEntry(db, user.id),
      getRecentScores(db, user.id, 7),
      getStreakCount(db, user.id),
      getSRSummary(db, user.id),
      getSessionsThisWeek(db, user.id),
    ]);

  const dayNumber = lastEntry ? lastEntry.day + 1 : 1;

  const response: StatusResponse = {
    dayNumber,
    lastEntry: lastEntry
      ? {
          concept: lastEntry.concept,
          mission: lastEntry.mission,
          mission_outcome: lastEntry.mission_outcome,
          scores: lastEntry.scores,
        }
      : null,
    recentScores,
    streakCount,
    srSummary,
    sessionsThisWeek,
    tier: profile.subscription_tier as "free" | "pro",
  };

  return c.json({ success: true, data: response });
});

export default status;

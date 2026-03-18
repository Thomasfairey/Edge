/**
 * Profile management routes.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createUserClient } from "../db/client.js";
import { authMiddleware, type AuthUser } from "../middleware/auth.js";
import { getProfile, updateProfile, completeOnboarding } from "../services/user.js";
import { UpdateProfileSchema, OnboardingSchema } from "../types/api.js";
import type { AppEnv } from "../types/env.js";

const profile = new Hono<AppEnv>();

profile.use("*", authMiddleware);

/**
 * GET /v1/profile
 */
profile.get("/", async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const data = await getProfile(db, user.id);
  return c.json({ success: true, data });
});

/**
 * PUT /v1/profile
 */
profile.put("/", zValidator("json", UpdateProfileSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const updates = c.req.valid("json");
  const data = await updateProfile(db, user.id, updates);
  return c.json({ success: true, data });
});

/**
 * POST /v1/profile/onboarding
 */
profile.post("/onboarding", zValidator("json", OnboardingSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const profileData = c.req.valid("json");
  const data = await completeOnboarding(db, user.id, profileData);
  return c.json({ success: true, data });
});

export default profile;

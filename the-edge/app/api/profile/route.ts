/**
 * User profile API — GET and POST profile_data.
 * GET  /api/profile → { profileData: {...} | null, displayName: string }
 * POST /api/profile { profileData: {...} } → { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";

async function handleGet(req: NextRequest, userId: string | null) {
  if (!userId) {
    return NextResponse.json({ profileData: null, displayName: "" });
  }

  const supabase = createUserClient(req);
  const { data, error } = await supabase
    .from("profiles")
    .select("profile_data, display_name")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ profileData: null, displayName: "" });
  }

  return NextResponse.json({
    profileData: data.profile_data,
    displayName: data.display_name || "",
  });
}

async function handlePost(req: NextRequest, userId: string | null) {
  const log = createRequestLogger(req, userId);
  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.profileData || typeof body.profileData !== "object" || Array.isArray(body.profileData)) {
    return NextResponse.json({ error: "Missing profileData object" }, { status: 400 });
  }

  const profileData = body.profileData as Record<string, unknown>;

  // Reject obviously oversized payloads to keep DB row size bounded.
  // (The DB column is JSONB which has TOAST overflow but we want a clean fail.)
  let serialised: string;
  try {
    serialised = JSON.stringify(profileData);
  } catch {
    return NextResponse.json({ error: "profileData not serialisable" }, { status: 400 });
  }
  if (serialised.length > 16 * 1024) {
    return NextResponse.json({ error: "profileData too large (max 16KB)" }, { status: 413 });
  }

  // Allow-list: drop unknown fields rather than persisting arbitrary keys.
  const allowedKeys = ["bio", "feedbackStyle"] as const;
  const cleaned: Record<string, unknown> = {};
  for (const k of allowedKeys) {
    if (k in profileData) cleaned[k] = profileData[k];
  }
  if (Object.keys(cleaned).length === 0) {
    return NextResponse.json(
      { error: "profileData must contain at least one known field" },
      { status: 400 },
    );
  }

  // Validate expected fields
  if ("bio" in cleaned) {
    if (typeof cleaned.bio !== "string") {
      return NextResponse.json({ error: "bio must be a string" }, { status: 400 });
    }
    if (cleaned.bio.length > 2000) {
      return NextResponse.json({ error: "bio too long (max 2000 chars)" }, { status: 400 });
    }
  }
  if ("feedbackStyle" in cleaned) {
    if (typeof cleaned.feedbackStyle !== "string" ||
        !["direct", "balanced", "supportive"].includes(cleaned.feedbackStyle)) {
      return NextResponse.json({ error: "Invalid feedbackStyle" }, { status: 400 });
    }
  }

  const supabase = createUserClient(req);
  const { error } = await supabase
    .from("profiles")
    .update({ profile_data: cleaned })
    .eq("id", userId);

  if (error) {
    log.error(`Failed to update: ${error.message}`, { phase: "profile" });
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET = withRateLimit(withAuth(handleGet), 20);
export const POST = withRateLimit(withAuth(handlePost), 10);

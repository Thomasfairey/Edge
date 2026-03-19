/**
 * User profile API — GET and POST profile_data.
 * GET  /api/profile → { profileData: {...} | null, displayName: string }
 * POST /api/profile { profileData: {...} } → { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";

async function handleGet(_req: NextRequest, userId: string | null) {
  if (!userId) {
    return NextResponse.json({ profileData: null, displayName: "" });
  }

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
  if (!userId) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.profileData || typeof body.profileData !== "object") {
    return NextResponse.json({ error: "Missing profileData object" }, { status: 400 });
  }

  const { profileData } = body;

  // Validate expected fields
  if (profileData.bio && typeof profileData.bio !== "string") {
    return NextResponse.json({ error: "bio must be a string" }, { status: 400 });
  }
  if (profileData.bio && profileData.bio.length > 2000) {
    return NextResponse.json({ error: "bio too long (max 2000 chars)" }, { status: 400 });
  }
  if (profileData.feedbackStyle && !["direct", "balanced", "supportive"].includes(profileData.feedbackStyle)) {
    return NextResponse.json({ error: "Invalid feedbackStyle" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ profile_data: profileData })
    .eq("id", userId);

  if (error) {
    console.error("[profile] Failed to update:", error.message);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const GET = withRateLimit(withAuth(handleGet), 20);
export const POST = withRateLimit(withAuth(handlePost), 10);

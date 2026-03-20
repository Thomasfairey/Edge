/**
 * User profile management service.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { UserProfile } from "../types/domain.js";
import { NotFoundError } from "../types/errors.js";

export async function getProfile(
  db: SupabaseClient,
  userId: string
): Promise<UserProfile> {
  const { data, error } = await db
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new NotFoundError("User profile");
  }

  return data as UserProfile;
}

export async function updateProfile(
  db: SupabaseClient,
  userId: string,
  updates: Partial<Pick<UserProfile, "display_name" | "professional_context" | "communication_style" | "experience_level" | "goals">>
): Promise<UserProfile> {
  const { data, error } = await db
    .from("user_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("User profile");
  }

  return data as UserProfile;
}

export async function completeOnboarding(
  db: SupabaseClient,
  userId: string,
  profile: {
    display_name: string;
    professional_context: string;
    experience_level: string;
    goals: string[];
  }
): Promise<UserProfile> {
  const { data, error } = await db
    .from("user_profiles")
    .update({
      ...profile,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("User profile");
  }

  return data as UserProfile;
}

/**
 * Check if a user has exceeded their free tier session limit.
 * Counts completed sessions this week (phase === "complete"), not just started ones.
 * Week start is calculated in UTC (via ISO string split) to avoid DST edge cases.
 */
export async function getSessionsThisWeek(
  db: SupabaseClient,
  userId: string
): Promise<number> {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekStartStr = weekStart.toISOString().split("T")[0];

  // Count completed sessions this week, not just started ones
  const { count, error } = await db
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("date", weekStartStr)
    .eq("phase", "complete");

  if (error) return 0;
  return count ?? 0;
}

export async function incrementSessionCount(
  db: SupabaseClient,
  userId: string
): Promise<number> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekStartStr = weekStart.toISOString().split("T")[0];

  // Atomic upsert: INSERT ... ON CONFLICT DO UPDATE avoids read-then-write race
  const { data, error } = await db
    .from("session_usage")
    .upsert(
      { user_id: userId, week_start: weekStartStr, session_count: 1 },
      { onConflict: "user_id,week_start", ignoreDuplicates: false }
    )
    .select("session_count")
    .single();

  if (error) {
    // Fallback: if upsert doesn't work with increment, do it manually with a retry guard
    const { data: existing } = await db
      .from("session_usage")
      .select("session_count")
      .eq("user_id", userId)
      .eq("week_start", weekStartStr)
      .single();

    if (existing) {
      const { error: updateError } = await db
        .from("session_usage")
        .update({ session_count: existing.session_count + 1 })
        .eq("user_id", userId)
        .eq("week_start", weekStartStr)
        .eq("session_count", existing.session_count); // optimistic lock

      if (updateError) {
        throw new Error(`Failed to increment session count: ${updateError.message}`);
      }
      return existing.session_count + 1;
    } else {
      await db.from("session_usage").insert({
        user_id: userId,
        week_start: weekStartStr,
        session_count: 1,
      });
      return 1;
    }
  }

  return data?.session_count ?? 1;
}

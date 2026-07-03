/**
 * Layer 1: Persistent user context — injected into every API call.
 * Dynamically loads user profile from Supabase.
 * Falls back to a generic professional context if no profile_data exists,
 * and signals that onboarding is incomplete so the session can prompt for it.
 * Reference: PRD Section 4.2 — Layer 1
 */

import { serialiseForPrompt, getCompletedConcepts } from "@/lib/ledger";
import { supabase } from "@/lib/supabase";
import { TrackId } from "@/lib/types";

// ---------------------------------------------------------------------------
// Profile data types
// ---------------------------------------------------------------------------

export interface ProfileData {
  bio: string;
  feedbackStyle: "direct" | "balanced" | "supportive";
  /** Which training track the user has chosen. Defaults to "professional". */
  track?: TrackId;
}

// ---------------------------------------------------------------------------
// Profile fetching
// ---------------------------------------------------------------------------

async function getUserProfile(userId?: string | null): Promise<{ displayName: string; profileData: ProfileData | null }> {
  if (!userId) return { displayName: "", profileData: null };

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, profile_data")
    .eq("id", userId)
    .single();

  if (error || !data) return { displayName: "", profileData: null };

  return {
    displayName: data.display_name || "",
    profileData: data.profile_data as ProfileData | null,
  };
}

/**
 * Resolve just the user's chosen track for concept selection.
 * Defaults to "professional" for anonymous or legacy users.
 */
export async function getUserTrack(userId?: string | null): Promise<TrackId> {
  if (!userId) return "professional";
  const { profileData } = await getUserProfile(userId);
  return profileData?.track ?? "professional";
}

// ---------------------------------------------------------------------------
// Profile → prompt section
// ---------------------------------------------------------------------------

const FEEDBACK_LABELS: Record<string, string> = {
  direct: "Direct and blunt. No softening, no reassurance. Values candour over diplomacy.",
  balanced: "Balanced — clear and honest, but measured. Appreciates directness without harshness.",
  supportive: "Supportive — encouraging tone with constructive framing. Still honest, but warm.",
};

function buildUserSection(displayName: string, profileData: ProfileData): string {
  const feedbackDesc = FEEDBACK_LABELS[profileData.feedbackStyle] || FEEDBACK_LABELS.direct;

  return `YOUR USER:
- Name: ${displayName}
- Feedback style: ${feedbackDesc}

USER'S SELF-DESCRIPTION (use this to personalise scenarios, examples, and language):
${profileData.bio}`;
}

// ---------------------------------------------------------------------------
// Generic fallback — used when user has not completed profile setup
// ---------------------------------------------------------------------------

function buildGenericFallback(displayName: string, track: TrackId): string {
  const nameClause = displayName ? `- Name: ${displayName}\n` : "";
  const applicability = track === "social"
    ? `broadly applicable to someone navigating real social life — dinners, parties, dates,
new friendships — who wants to be more charismatic, interesting, and memorable.`
    : `broadly applicable to a senior professional navigating high-stakes business conversations.`;
  return `YOUR USER:
${nameClause}- Profile: Not yet completed. The user has not provided their bio or context.
- Feedback style: Direct and blunt. No softening, no reassurance. Values candour over diplomacy.

IMPORTANT: Because no user profile exists yet, keep scenarios, examples, and language
${applicability}
Avoid assumptions about their industry, role, or company. If the session feels generic,
that is expected — prompt the user to complete their profile for personalised sessions.`;
}

/** Resolve the user's chosen track, defaulting to professional for legacy profiles. */
function resolveTrack(profileData: ProfileData | null): TrackId {
  return profileData?.track ?? "professional";
}

const TRACK_INTRO: Record<TrackId, string> = {
  professional:
    "You are part of The Edge, an AI-powered daily influence training system for elite professionals.",
  social:
    "You are part of The Edge, an AI-powered daily training system for charisma, storytelling, and social presence — helping the user become more captivating, interesting, and memorable in real social life.",
  both:
    "You are part of The Edge, an AI-powered daily training system for both professional influence and social charisma — helping the user become more effective in high-stakes conversations and more captivating in social life.",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full persistent context string.
 * Dynamically loads user profile from Supabase.
 * Falls back to a generic professional context if no profile_data exists.
 */
export async function buildPersistentContext(userId?: string | null): Promise<string> {
  const [ledgerSummary, completedConcepts, profile] = await Promise.all([
    serialiseForPrompt(7, userId),
    getCompletedConcepts(userId),
    getUserProfile(userId),
  ]);

  const conceptsList =
    completedConcepts.length > 0
      ? completedConcepts.join(", ")
      : "None — this is Day 1.";

  const track = resolveTrack(profile.profileData);
  const userSection = profile.profileData
    ? buildUserSection(profile.displayName, profile.profileData)
    : buildGenericFallback(profile.displayName, track);

  return `${TRACK_INTRO[track]}

${userSection}

${ledgerSummary}

CONCEPTS COVERED TO DATE: ${conceptsList}`;
}

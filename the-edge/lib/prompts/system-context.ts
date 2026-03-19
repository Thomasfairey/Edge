/**
 * Layer 1: Persistent user context — injected into every API call.
 * Dynamically loads user profile from Supabase.
 * Falls back to a generic professional context if no profile_data exists,
 * and signals that onboarding is incomplete so the session can prompt for it.
 * Reference: PRD Section 4.2 — Layer 1
 */

import { serialiseForPrompt, getCompletedConcepts } from "@/lib/ledger";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Profile data types
// ---------------------------------------------------------------------------

export interface ProfileData {
  bio: string;
  feedbackStyle: "direct" | "balanced" | "supportive";
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

function buildGenericFallback(displayName: string): string {
  const nameClause = displayName ? `- Name: ${displayName}\n` : "";
  return `YOUR USER:
${nameClause}- Profile: Not yet completed. The user has not provided their bio or context.
- Feedback style: Direct and blunt. No softening, no reassurance. Values candour over diplomacy.

IMPORTANT: Because no user profile exists yet, keep scenarios, examples, and language
broadly applicable to a senior professional navigating high-stakes business conversations.
Avoid assumptions about their industry, role, or company. If the session feels generic,
that is expected — prompt the user to complete their profile for personalised sessions.`;
}

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

  const userSection = profile.profileData
    ? buildUserSection(profile.displayName, profile.profileData)
    : buildGenericFallback(profile.displayName);

  return `You are part of The Edge, an AI-powered daily influence training system for elite professionals.

${userSection}

${ledgerSummary}

CONCEPTS COVERED TO DATE: ${conceptsList}`;
}

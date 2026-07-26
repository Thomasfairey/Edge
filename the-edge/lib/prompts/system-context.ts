/**
 * Layer 1: Persistent user context — injected into every API call.
 * Dynamically loads user profile from Supabase.
 * Falls back to a generic description keyed off the user's life contexts if no
 * profile_data exists, and signals that onboarding is incomplete so the session
 * can prompt for it.
 * Reference: PRD Section 4.2 — Layer 1
 */

import { serialiseForPrompt, getCompletedConcepts } from "@/lib/ledger";
import { supabase } from "@/lib/supabase";
import {
  LifeContext,
  CONTEXT_LABELS,
  SOCIAL_CONTEXTS,
  normaliseContexts,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Profile data types
// ---------------------------------------------------------------------------

export interface ProfileData {
  bio: string;
  feedbackStyle: "direct" | "balanced" | "supportive";
  /** The life contexts the user wants to train in. Defaults to the social four. */
  contexts?: LifeContext[];
  /** Pre-context field, read only so existing profiles migrate cleanly. */
  track?: string;
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
 * Resolve the user's active life contexts for concept selection.
 * Anonymous users, and profiles predating the context model, get the social four.
 */
export async function getUserContexts(userId?: string | null): Promise<LifeContext[]> {
  if (!userId) return [...SOCIAL_CONTEXTS];
  const { profileData } = await getUserProfile(userId);
  return resolveContexts(profileData);
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

function buildGenericFallback(displayName: string, contexts: LifeContext[]): string {
  const nameClause = displayName ? `- Name: ${displayName}\n` : "";
  const onlyWork = contexts.length === 1 && contexts[0] === "work";
  const applicability = onlyWork
    ? `broadly applicable to someone navigating high-stakes conversations at work.`
    : `broadly applicable to an adult navigating real relationships — the people they date,
their friends, the rooms they walk into, and the family they can't walk away from.`;
  return `YOUR USER:
${nameClause}- Profile: Not yet completed. The user has not provided their bio or context.
- Feedback style: Direct and blunt. No softening, no reassurance. Values candour over diplomacy.

IMPORTANT: Because no user profile exists yet, keep scenarios, examples, and language
${applicability}
Avoid assumptions about their industry, role, or company. If the session feels generic,
that is expected — prompt the user to complete their profile for personalised sessions.`;
}

/** Resolve active contexts, migrating pre-context profiles on read. */
function resolveContexts(profileData: ProfileData | null): LifeContext[] {
  return normaliseContexts(profileData?.contexts, profileData?.track);
}

/**
 * The opening line of every prompt. The Edge is a system for being good with
 * people; work is one of the rooms that happens in, not the premise.
 */
function buildIntro(contexts: LifeContext[]): string {
  const base =
    "You are part of The Edge, a daily training system for being genuinely good with people — presence, conversation, storytelling, reading others, and handling the conversations that matter.";

  if (contexts.length === 1 && contexts[0] === "work") {
    return `${base}\n\nThis user is training specifically for professional situations: negotiation, stakeholders, pitching, and difficult colleagues.`;
  }

  const labels = contexts.map((c) => CONTEXT_LABELS[c].toLowerCase());
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
      : labels[0];

  return `${base}\n\nThis user is training for: ${list}. Keep scenarios, examples, and language rooted in those settings.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full persistent context string.
 * Dynamically loads user profile from Supabase.
 * Falls back to a generic, context-aware description if no profile_data exists.
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

  const contexts = resolveContexts(profile.profileData);
  const userSection = profile.profileData
    ? buildUserSection(profile.displayName, profile.profileData)
    : buildGenericFallback(profile.displayName, contexts);

  return `${buildIntro(contexts)}

${userSection}

${ledgerSummary}

CONCEPTS COVERED TO DATE: ${conceptsList}`;
}

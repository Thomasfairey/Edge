/**
 * Layer 1: Persistent user context — injected into all API calls.
 * Dynamically built from user profile + ledger history.
 * Replaces the hardcoded Tom Fairey profile from v0.
 */

import { UserProfile } from "../types/domain.js";

export function buildSystemContext(
  profile: UserProfile,
  ledgerSummary: string,
  completedConcepts: string[]
): string {
  return `## User Profile

Name: ${profile.display_name}
Experience Level: ${profile.experience_level}
Communication Preference: ${profile.communication_style}

### Professional Context
${profile.professional_context || "No professional context provided yet."}

### Goals
${profile.goals.length > 0 ? profile.goals.map((g) => `- ${g}`).join("\n") : "No specific goals set yet."}

### Concepts Covered (${completedConcepts.length} total)
${completedConcepts.length > 0 ? completedConcepts.join(", ") : "None yet — this is a new user."}

${ledgerSummary}

## Instructions
- Address the user by their first name: ${profile.display_name.split(" ")[0]}
- Calibrate feedback intensity to their experience level (${profile.experience_level})
- Reference their professional context when generating scenarios and missions
- Be direct and specific — no platitudes or generic coaching language`;
}

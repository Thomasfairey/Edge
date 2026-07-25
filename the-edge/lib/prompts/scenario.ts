/**
 * Scenario generation.
 *
 * Scenarios used to be ~20 hardcoded strings keyed by character id and domain.
 * Three social characters times four domains is twelve possible openings, which
 * is why the same evening kept recurring. Here a scenario is composed per
 * session from the concept, the character, the user's own life, and an explicit
 * list of recent scenarios to avoid.
 *
 * Generation is on the critical path for starting a roleplay, so it runs on the
 * fast model with a small token budget, and every failure path falls back to a
 * deterministic per-context template rather than blocking the session.
 */

import {
  CharacterArchetype,
  Concept,
  LifeContext,
  CONTEXT_LABELS,
  primaryContextForConcept,
} from "@/lib/types";
import { generateResponse, PHASE_CONFIG, CircuitBreakerOpenError } from "@/lib/anthropic";
import { logger } from "@/lib/logger";

export interface GeneratedScenario {
  /** The second-person brief injected into the roleplay system prompt. */
  scenario: string;
  /** One line stored on the ledger so later sessions can avoid repeating it. */
  summary: string;
}

/** Where a session in each context physically takes place. */
const CONTEXT_SETTINGS: Record<LifeContext, string> = {
  dating: "a date with the user, early enough that neither of you is certain about the other",
  friends: "somewhere you and the user can actually talk — a pub, a walk, one of your kitchens",
  groups: "a social gathering — a party, a dinner, a room with more conversations than seats",
  family: "the sort of setting where this comes up — a kitchen, a car, the end of a long visit",
  work: "a professional setting where you are meeting the user to discuss something relevant to your role",
};

const CONTEXT_TEXTURE: Record<LifeContext, string> = {
  dating: "Ground it in a specific place and a specific moment in the evening. Give the character a reason to be there and something on their mind that has nothing to do with the user.",
  friends: "Give the friendship a history — a specific shared thing, a specific gap, a reason tonight is happening at all.",
  groups: "Populate the room. Who else is there, what has just happened, what is the character in the middle of when the user arrives.",
  family: "Anchor it in something concrete and domestic, and in something older than tonight. Family scenes have a subject and a subtext, and the subtext is usually years old.",
  work: "Give it a specific commercial situation with real stakes on both sides.",
};

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

/**
 * Composed from the character's own brief. Used when generation fails, when the
 * circuit breaker is open, or when there is no API key. Deliberately plain —
 * its job is to keep the session running, not to be interesting.
 */
export function fallbackScenario(
  concept: Concept,
  character: CharacterArchetype,
  context?: LifeContext
): GeneratedScenario {
  const resolved = context ?? primaryContextForConcept(concept);
  return {
    scenario: `You are ${character.name}: ${character.description}\n\nYou are at ${CONTEXT_SETTINGS[resolved]}.\n\nBring your own mood and agenda into it. Your attention, warmth, and openness have to be earned — do not hand them over simply because the user is present and pleasant.`,
    summary: `${character.name}, ${resolved}, generic setting`,
  };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function buildScenarioPrompt(
  concept: Concept,
  character: CharacterArchetype,
  context: LifeContext,
  userBio: string,
  recentSummaries: string[]
): string {
  const avoidBlock =
    recentSummaries.length > 0
      ? `\n\nSCENARIOS THIS USER HAS ALREADY PRACTISED — do not repeat these situations, settings, or setups:\n${recentSummaries.map((s) => `- ${s}`).join("\n")}`
      : "";

  const bioBlock = userBio
    ? `\n\nABOUT THE USER (use it to make the scenario plausible for their actual life; do not name their employer or invent biographical facts):\n${userBio}`
    : "";

  return `You write the opening situation for a roleplay training scenario.

THE SETTING: ${CONTEXT_LABELS[context]} — ${CONTEXT_SETTINGS[context]}.

THE CHARACTER the user will face:
${character.name} — ${character.description}
Their hidden motivation: ${character.hidden_motivation}

WHAT THE USER IS SECRETLY PRACTISING: ${concept.name} — ${concept.description}
The character must NOT know this and the scenario must never hint at it. The situation should simply be one where that skill would help.${bioBlock}${avoidBlock}

YOUR TASK:
Write the scenario as a brief addressed to the character in the second person — "You are...", "You have just..." — telling them where they are, what has happened immediately before this moment, what they want, and what would have to happen for them to open up or give ground.

RULES:
- 80–120 words. No more.
- Be specific. A named bar, a particular Tuesday, a thing that happened forty minutes ago. Specificity is what stops these feeling generic.
- ${CONTEXT_TEXTURE[context]}
- Give the character something going on that has nothing to do with the user. Real people arrive mid-life, not mid-scene.
- Do not describe the user, give them a script, or state what they should do.
- No stage directions, no headings, no preamble. Just the brief.

Then on a new line write "SUMMARY:" followed by a single clause of at most 12 words identifying the situation, so it can be avoided in future (e.g. "birthday drinks, friend cancelled, character already three drinks in").`;
}

function parseScenario(raw: string, fallbackSummary: string): GeneratedScenario {
  const index = raw.toUpperCase().lastIndexOf("SUMMARY:");
  if (index === -1) {
    return { scenario: raw.trim(), summary: fallbackSummary };
  }
  const scenario = raw.slice(0, index).trim();
  const summary = raw.slice(index + "SUMMARY:".length).trim();
  // A scenario without a body is worse than no generation at all.
  if (scenario.length === 0) {
    return { scenario: raw.trim(), summary: fallbackSummary };
  }
  return { scenario, summary: summary || fallbackSummary };
}

/**
 * Compose a fresh scenario. Never throws — on any failure it returns the
 * deterministic fallback, because failing to produce a scenario means failing
 * to start the session.
 */
export async function generateScenario(
  concept: Concept,
  character: CharacterArchetype,
  context: LifeContext,
  userBio: string = "",
  recentSummaries: string[] = []
): Promise<GeneratedScenario> {
  const fallback = fallbackScenario(concept, character, context);

  try {
    const raw = await generateResponse(
      buildScenarioPrompt(concept, character, context, userBio, recentSummaries),
      [{ role: "user" as const, content: `Write the scenario for ${character.name}.` }],
      PHASE_CONFIG.scenario
    );

    if (!raw || raw.trim().length === 0) {
      logger.warn("Scenario generation returned nothing — using fallback", { phase: "scenario" });
      return fallback;
    }

    return parseScenario(raw, fallback.summary);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      logger.warn("Circuit breaker open — using fallback scenario", { phase: "scenario" });
    } else {
      logger.error(
        `Scenario generation failed: ${error instanceof Error ? error.message : "unknown"}`,
        { phase: "scenario" }
      );
    }
    return fallback;
  }
}

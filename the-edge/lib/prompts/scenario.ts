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

  // The bio describes the LEARNER, not the character. Saying so explicitly
  // matters: without it the model hands the learner's job and life to the
  // character — a first date who turns out to be the learner's own profession.
  const bioBlock = userBio
    ? `\n\nABOUT THE LEARNER — this is the OTHER PERSON in the scene, NOT ${character.name}:\n${userBio}\n\nUse this only to make the setting plausible for the kind of life the learner has. Do NOT give ${character.name} the learner's job, employer, or biography.`
    : "";

  return `You write the opening situation for a roleplay training scenario.

There are two people in this scene:
  • ${character.name} — the character. The brief you write is addressed TO them.
  • The learner — a real person practising a skill. In the brief they are only ever "they" or "the other person". Never name them, never describe their job, never say what they want.

THE SETTING: ${CONTEXT_LABELS[context]} — ${CONTEXT_SETTINGS[context]}.

THE CHARACTER YOU ARE BRIEFING:
${character.name} — ${character.description}
Their hidden motivation: ${character.hidden_motivation}

WHAT THE LEARNER IS SECRETLY PRACTISING: ${concept.name} — ${concept.description}
${character.name} must NOT know this and the brief must never hint at it. The situation should simply be one where that skill would help.${bioBlock}${avoidBlock}

YOUR TASK:
Write the brief in the second person, addressed to ${character.name}. Every "you" in what you write means ${character.name} and nobody else. Tell them where they are, what happened immediately before this moment, what they want, and what would have to happen for them to open up or give ground.

CRITICAL — GET THE ROLES THE RIGHT WAY ROUND:
${character.name} is ${character.description.charAt(0).toLowerCase() + character.description.slice(1)}
So if the scene involves a family member, a date, or a friend, ${character.name} IS that person — do not write the brief from the point of view of the person meeting them. Before you finish, re-read your first sentence and check that "you" is ${character.name}.

RULES:
- 80–120 words. No more.
- Be specific. A named bar, a particular Tuesday, a thing that happened forty minutes ago. Specificity is what stops these feeling generic.
- VARY THE MOMENT, not just the venue. Changing the name of the wine bar and leaving everything else identical produces the same scene twice — a user notices that on day two, and it is the fastest way to make this feel fake. Pick a different point in the encounter each time: mid-way through rather than the opening; the walk afterwards; a second or fifth meeting rather than a first; an interruption; one of them arriving late rather than early; standing rather than sitting; leaving rather than starting. Somebody arriving early at a bar and rehearsing an opener is one option among many, not the default.
- ${CONTEXT_TEXTURE[context]}
- Give ${character.name} something going on that has nothing to do with the learner. Real people arrive mid-life, not mid-scene.
- Vary where that preoccupation comes from, and outside a work setting do NOT default to their job. A boss, a project, a promotion turns a date into a work debrief. Reach instead for the rest of a life: a sibling who has not called back, a landlord, a diagnosis in the family, a friend's wedding they cannot afford, a flat they are about to lose, something they read that unsettled them, a habit they are trying to break.
- Do not describe the learner, give them a script, or state what they should do or want.
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

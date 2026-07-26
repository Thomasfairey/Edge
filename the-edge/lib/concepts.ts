/**
 * Concept taxonomy and selection logic.
 * 35+ concepts across 7 domains from the influence canon.
 * The LLM generates full lesson content at runtime; these definitions
 * provide the seed data and prompt injection context.
 * Reference: PRD Section 3.3, Appendix A
 */

import {
  Concept,
  ConceptDomain,
  LifeContext,
  SOCIAL_CONTEXTS,
  contextsForConcept,
  matchesContexts,
  resolveSessionContext,
} from "@/lib/types";
import { getDueReviews } from "@/lib/spaced-repetition";

// ---------------------------------------------------------------------------
// Master concept library — 5 per domain, 35 total
// ---------------------------------------------------------------------------

export const CONCEPTS: Concept[] = [
  // ── Influence & Persuasion (Cialdini) ──────────────────────────────────
  {
    id: "reciprocity",
    name: "Reciprocity",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "The obligation to return favours creates leverage before a request is ever made. Giving first — even something small — triggers an automatic compliance response.",
  },
  {
    id: "commitment-consistency",
    name: "Commitment & Consistency",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "Once someone takes a small public position, they feel compelled to act consistently with it. Getting a micro-commitment early locks in future compliance.",
  },
  {
    id: "social-proof",
    name: "Social Proof",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "People look to others' actions to determine their own, especially under uncertainty. The behaviour of similar others is the strongest signal.",
  },
  {
    id: "authority",
    name: "Authority",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "Perceived expertise and status markers dramatically increase compliance. Titles, credentials, and confident delivery trigger automatic deference.",
  },
  {
    id: "scarcity",
    name: "Scarcity",
    domain: "Influence & Persuasion",
    source: "Cialdini",
    description:
      "Limited availability increases perceived value and urgency to act. Loss of access is more motivating than potential gain.",
  },

  // ── Power Dynamics (Greene) ────────────────────────────────────────────
  {
    id: "never-outshine-master",
    name: "Law 1 — Never Outshine the Master",
    domain: "Power Dynamics",
    source: "Greene",
    description:
      "Making superiors feel intellectually or socially inferior triggers insecurity and retaliation. Always make those above you feel comfortably superior.",
  },
  {
    id: "conceal-intentions",
    name: "Law 3 — Conceal Your Intentions",
    domain: "Power Dynamics",
    source: "Greene",
    description:
      "Keeping your true goals opaque prevents others from preparing countermeasures. Use decoy desires and red herrings to throw people off the scent.",
  },
  {
    id: "court-attention",
    name: "Law 6 — Court Attention at All Costs",
    domain: "Power Dynamics",
    source: "Greene",
    description:
      "Visibility is power — being ignored is worse than being attacked. Everything is judged by its appearance; what is unseen counts for nothing.",
  },
  {
    id: "crush-enemy",
    name: "Law 15 — Crush Your Enemy Totally",
    domain: "Power Dynamics",
    source: "Greene",
    description:
      "A half-defeated enemy recovers and seeks revenge. If you leave even a single ember of opposition, it will eventually reignite. Total victory is the only safe outcome.",
  },
  {
    id: "discover-thumbscrew",
    name: "Law 33 — Discover Each Person's Thumbscrew",
    domain: "Power Dynamics",
    source: "Greene",
    description:
      "Everyone has a weakness, a gap in their armour. It is usually an insecurity, an uncontrollable emotion, or a secret need. Find it and you have leverage.",
  },

  // ── Negotiation (Voss) ─────────────────────────────────────────────────
  {
    id: "tactical-empathy",
    name: "Tactical Empathy",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Demonstrating understanding of the other side's perspective — without agreeing with it — creates psychological safety that opens them to influence.",
  },
  {
    id: "mirroring",
    name: "Mirroring",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Repeating the last 1–3 words of what someone said triggers unconscious elaboration and builds rapport. It makes the other person feel heard and encourages them to reveal more.",
  },
  {
    id: "labelling",
    name: "Labelling",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Naming the other person's emotion ('It seems like you're frustrated by...') defuses negative feelings and creates a sense of being deeply understood.",
  },
  {
    id: "calibrated-questions",
    name: "Calibrated Questions",
    domain: "Negotiation",
    source: "Voss",
    description:
      "'How' and 'What' questions give the illusion of control to the other party while steering the conversation. They force the counterpart to solve your problem.",
  },
  {
    id: "accusation-audit",
    name: "The Accusation Audit",
    domain: "Negotiation",
    source: "Voss",
    description:
      "Pre-emptively listing every negative thing the other side could think about you or your proposal neutralises objections before they crystallise into resistance.",
  },

  // ── Behavioural Psychology & Cognitive Bias (Kahneman) ─────────────────
  {
    id: "anchoring",
    name: "Anchoring Effect",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "The first number or frame presented disproportionately influences all subsequent judgments. Setting the anchor controls the entire negotiation range.",
  },
  {
    id: "framing",
    name: "Framing Effect",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "Identical information presented differently produces opposite decisions. A 90% survival rate and a 10% mortality rate are logically identical but emotionally divergent.",
  },
  {
    id: "loss-aversion",
    name: "Loss Aversion",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "Losses feel roughly twice as painful as equivalent gains feel good. Framing proposals in terms of what will be lost by inaction is more motivating than framing what will be gained.",
  },
  {
    id: "availability-heuristic",
    name: "Availability Heuristic",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "People judge probability by how easily examples come to mind, not by actual frequency. Vivid, recent, or emotionally charged events are massively overweighted.",
  },
  {
    id: "sunk-cost",
    name: "Sunk Cost Fallacy",
    domain: "Behavioural Psychology & Cognitive Bias",
    source: "Kahneman",
    description:
      "Prior investment — time, money, or effort — makes people continue failing courses of action to justify past decisions, even when quitting is clearly optimal.",
  },

  // ── Nonverbal Intelligence & Behavioural Profiling (Chase Hughes) ──────
  {
    id: "baseline-reading",
    name: "Baseline Behaviour Reading",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Chase Hughes",
    description:
      "Before you can detect deception or stress, you must establish someone's baseline: their normal posture, speech cadence, eye movement, and gesture patterns at rest.",
  },
  {
    id: "deviation-detection",
    name: "Deviation Detection",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Chase Hughes",
    description:
      "Meaningful behavioural shifts — speech rate changes, posture adjustments, gaze aversion — occur at moments of internal stress. The deviation is the signal, not the specific behaviour.",
  },
  {
    id: "authority-posture",
    name: "Authority Posture",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Chase Hughes",
    description:
      "Specific body positions — steepled fingers, asymmetric stance, controlled stillness, and deliberate spatial occupation — signal status and dominance to the limbic system before the conscious mind registers it.",
  },
  {
    id: "microexpression-clusters",
    name: "Microexpression Clusters",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Chase Hughes",
    description:
      "Fleeting facial expressions (40–500ms) reveal concealed emotions. Single microexpressions can be noise; clusters of 3+ signals within a 5-second window indicate genuine emotional leakage.",
  },
  {
    id: "ellipsis-model",
    name: "The Ellipsis Model",
    domain: "Nonverbal Intelligence & Behavioural Profiling",
    source: "Chase Hughes",
    description:
      "A comprehensive behavioural profiling framework that maps observable behaviour patterns to predictable responses, enabling you to anticipate and influence someone's next move.",
  },

  // ── Rapport & Relationship Engineering (Carnegie) ──────────────────────
  {
    id: "genuine-interest",
    name: "Genuine Interest Principle",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "Becoming genuinely interested in other people generates more influence in two months than trying to get others interested in you achieves in two years.",
  },
  {
    id: "name-recall",
    name: "Name Recall",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "A person's name is the sweetest and most important sound in any language to that person. Remembering and using it correctly builds instant rapport and signals respect.",
  },
  {
    id: "avoid-criticism",
    name: "Avoid Criticism",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "Direct criticism triggers defensive identity protection and shuts down receptivity. Any fool can criticise — it takes character to understand and redirect.",
  },
  {
    id: "talk-their-interests",
    name: "Talk in Terms of Their Interests",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "The royal road to influence is talking about what the other person values most. Reframe every proposal in terms of their goals, not yours.",
  },
  {
    id: "make-them-important",
    name: "Make Them Feel Important",
    domain: "Rapport & Relationship Engineering",
    source: "Carnegie",
    description:
      "The deepest principle in human nature is the craving to be appreciated. Sincere, specific recognition of someone's contribution creates loyalty that mere incentives cannot.",
  },

  // ── Dark Psychology & Coercive Technique Recognition ────────────────────
  {
    id: "gaslighting",
    name: "Gaslighting Recognition",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Zimbardo",
    description:
      "Systematic denial of another person's reality to destabilise their confidence and judgment. Recognise it by the pattern: your clear memory is repeatedly contradicted, and you begin to doubt yourself.",
  },
  {
    id: "darvo",
    name: "DARVO Pattern",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Zimbardo",
    description:
      "Deny, Attack, Reverse Victim and Offender. When confronted, the aggressor denies the behaviour, attacks the person confronting them, then claims to be the real victim.",
  },
  {
    id: "manufactured-urgency",
    name: "Manufactured Urgency",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Cialdini",
    description:
      "Creating artificial time pressure to bypass deliberate System 2 analysis and force impulsive System 1 compliance. Recognise it when deadlines appear suddenly with no structural justification.",
  },
  {
    id: "information-asymmetry",
    name: "Information Asymmetry Exploitation",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Greene",
    description:
      "Deliberately controlling what the other party knows to maintain strategic advantage. The person with more information controls the frame, the options, and the outcome.",
  },
  {
    id: "love-bombing-professional",
    name: "Love-Bombing in Professional Contexts",
    domain: "Dark Psychology & Coercive Technique Recognition",
    source: "Zimbardo",
    description:
      "Overwhelming someone with excessive praise, attention, and inclusion early in a professional relationship to create dependency and obligation before deploying control tactics.",
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SOCIAL TRACK
  // ═══════════════════════════════════════════════════════════════════════

  // ── Charisma & Presence (Van Edwards / Cabane) ─────────────────────────
  {
    id: "warmth-competence-balance",
    name: "Warmth & Competence Balance",
    domain: "Charisma & Presence",
    source: "Van Edwards",
    description:
      "Every first impression is read on two axes: warmth (can I trust you?) and competence (can I respect you?). Charisma is the rare person who signals both at once — most people accidentally lead with only one.",
  },
  {
    id: "charismatic-presence",
    name: "Charismatic Presence",
    domain: "Charisma & Presence",
    source: "Cabane",
    description:
      "Charisma is presence, power, and warmth combined — and it starts with presence: giving someone your complete, undistracted attention so they feel they are the only person in the room.",
  },
  {
    id: "nonverbal-warmth-cues",
    name: "Nonverbal Warmth Cues",
    domain: "Charisma & Presence",
    source: "Van Edwards",
    description:
      "Open torso, visible hands, a slow triple-nod, the eyebrow flash of recognition, and a genuine (eye-crinkling) smile are the physical signals that unlock trust before you say a word.",
  },
  {
    id: "vocal-power",
    name: "Vocal Power",
    domain: "Charisma & Presence",
    source: "Van Edwards",
    description:
      "How you say it outweighs what you say. Ending statements with a downward inflection signals confidence; question-inflection ('upspeak') leaks doubt. Strategic pauses and lower resonance command a room.",
  },
  {
    id: "intentional-first-impression",
    name: "The Intentional Entrance",
    domain: "Charisma & Presence",
    source: "Van Edwards",
    description:
      "The first few seconds set the frame for everything after. Keep hands visible, make eye contact before you speak, and lead with relaxed posture — the 'launch' most people fumble by looking down at their phone.",
  },

  // ── Storytelling & Narrative (Dicks / Duarte / Van Edwards) ────────────
  {
    id: "five-second-moment",
    name: "The Five-Second Moment",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "Every worthwhile story is really about one small moment of change — five seconds where something shifted inside you. Find that moment first; everything else is just the runway to it.",
  },
  {
    id: "narrative-tension",
    name: "Narrative Tension",
    domain: "Storytelling & Narrative",
    source: "Duarte",
    description:
      "Attention is held by an open gap between what is and what could be. Open a question the listener needs answered, then delay the resolution — tension, not information, is what keeps people leaning in.",
  },
  {
    id: "stakes-and-vulnerability",
    name: "Stakes & Vulnerability",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "People invest in a story only when something is at risk for the teller. Naming what you stood to lose — and admitting how you really felt — is what turns an anecdote into something people feel.",
  },
  {
    id: "hook-opening",
    name: "The Hook Opening",
    domain: "Storytelling & Narrative",
    source: "Van Edwards",
    description:
      "Start in motion — mid-scene, mid-action, or on an intriguing line — never with throat-clearing preamble like 'So this one time...'. The first sentence decides whether anyone stays for the rest.",
  },
  {
    id: "show-dont-summarise",
    name: "Show, Don't Summarise",
    domain: "Storytelling & Narrative",
    source: "Dicks",
    description:
      "Put the listener in the room with concrete, sensory detail rather than reporting the gist. A specific image ('he slid the cold coffee across the table') lands where an abstract summary ('the meeting was tense') evaporates.",
  },

  // ── Conversation & Memorability (Van Edwards / Carnegie) ───────────────
  {
    id: "conversational-spark",
    name: "The Conversational Spark",
    domain: "Conversation & Memorability",
    source: "Van Edwards",
    description:
      "Scripted openers ('what do you do?') produce scripted, forgettable answers. A novel question ('working on anything exciting lately?') triggers a small dopamine hit and makes you the person they remember from the room.",
  },
  {
    id: "threading",
    name: "Threading",
    domain: "Conversation & Memorability",
    source: "Van Edwards",
    description:
      "People drop 'free information' — details they care about — into what they say. Catching a thread and pulling it ('wait, you mentioned Kyoto — what took you there?') is how effortless, memorable conversation actually works.",
  },
  {
    id: "be-a-highlighter",
    name: "Be a Highlighter",
    domain: "Conversation & Memorability",
    source: "Van Edwards",
    description:
      "There are highlighters, who make people feel their best, and highlighters' opposite, who make people feel small. Actively looking for what to admire in someone — and saying it — is the most magnetic social habit there is.",
  },
  {
    id: "memorable-exit",
    name: "The Memorable Exit",
    domain: "Conversation & Memorability",
    source: "Van Edwards",
    description:
      "The peak-end rule means people remember an interaction by its emotional high and its final moment. Close on a genuine high note with a specific callback ('good luck with the Kyoto trip') instead of letting it fizzle.",
  },
  {
    id: "story-bank-and-signature",
    name: "Story Bank & Signature",
    domain: "Conversation & Memorability",
    source: "Van Edwards",
    description:
      "Charismatic people aren't improvising from nothing — they keep a small bank of go-to stories and a memorable self-introduction that goes beyond a job title, so they're never caught with a flat 'I'm fine, you?'.",
  },
];

// ---------------------------------------------------------------------------
// Concept selection
// ---------------------------------------------------------------------------

/**
 * Select the next concept for today's session.
 * Returns { concept, isReview, context } — when reviews are due, 30% chance of
 * review session. `context` is the single life context the session runs in, and
 * drives scenario generation, coaching tone, and scoring dimensions downstream.
 *
 * Rules:
 * 1. Only ever surface concepts practisable in one of the user's active contexts.
 * 2. Never repeat a concept already in completedIds.
 * 3. Prefer a different domain than the most recently completed concept
 *    (enforces breadth before depth).
 * 4. If all concepts in other domains are exhausted, allow same-domain.
 * 5. If ALL in-context concepts are exhausted, reset the pool and pick randomly.
 */
export async function selectConcept(
  completedIds: string[],
  userId?: string | null,
  contexts: LifeContext[] = SOCIAL_CONTEXTS
): Promise<{ concept: Concept; isReview: boolean; context: LifeContext }> {
  // Check for due reviews — 30% chance of review session.
  // Only surface a review the user can actually practise right now.
  try {
    const dueReviews = await getDueReviews(userId);
    if (dueReviews.length > 0 && Math.random() < 0.3) {
      for (const review of dueReviews) {
        const reviewConcept = CONCEPTS.find((c) => c.id === review.conceptId);
        if (reviewConcept && matchesContexts(contextsForConcept(reviewConcept), contexts)) {
          return {
            concept: reviewConcept,
            isReview: true,
            context: resolveSessionContext(contextsForConcept(reviewConcept), contexts),
          };
        }
      }
    }
  } catch {
    // SR not available — continue with normal selection
  }

  const concept = selectNewConcept(completedIds, contexts);
  return {
    concept,
    isReview: false,
    context: resolveSessionContext(contextsForConcept(concept), contexts),
  };
}

function selectNewConcept(completedIds: string[], contexts: LifeContext[] = SOCIAL_CONTEXTS): Concept {
  // completedIds may contain either concept IDs (e.g. "mirroring") or
  // formatted ledger names (e.g. "Mirroring (Voss)"). Match against both.
  const completedSet = new Set(completedIds);
  // Restrict the entire pool to the active contexts before anything else.
  const inContext = CONCEPTS.filter((c) => matchesContexts(contextsForConcept(c), contexts));
  // Guard: a context selection with no matching content must not wedge the app.
  const pool = inContext.length > 0 ? inContext : CONCEPTS;
  const available = pool.filter(
    (c) => !completedSet.has(c.id) && !completedSet.has(`${c.name} (${c.source})`)
  );

  // All in-context concepts exhausted — reset the pool (still in context)
  if (available.length === 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Determine the domain of the most recently completed concept
  let lastDomain: ConceptDomain | null = null;
  if (completedIds.length > 0) {
    const lastEntry = completedIds[completedIds.length - 1];
    const lastConcept = CONCEPTS.find(
      (c) => c.id === lastEntry || `${c.name} (${c.source})` === lastEntry
    );
    if (lastConcept) {
      lastDomain = lastConcept.domain;
    }
  }

  // Prefer a concept from a different domain
  if (lastDomain) {
    const differentDomain = available.filter((c) => c.domain !== lastDomain);
    if (differentDomain.length > 0) {
      return differentDomain[Math.floor(Math.random() * differentDomain.length)];
    }
  }

  // Fallback: pick from whatever is available
  return available[Math.floor(Math.random() * available.length)];
}

# THE EDGE — Complete Build Specification

Build a personal AI-powered influence training web app called "The Edge." This is a daily 10-minute session that teaches, simulates, debriefs, and deploys interpersonal influence techniques through AI-driven roleplay.

**Read this entire specification before writing any code.** Then build it section by section in order.

---

# SECTION 1: PROJECT SCAFFOLDING

**Tech stack — use exactly these, nothing else:**
- Next.js 14+ (App Router)
- TypeScript (strict mode)
- Tailwind CSS
- `@anthropic-ai/sdk` for LLM calls

**Do NOT install:** Any database ORM, auth library, testing framework, UI component library, state management library, or charting library. This is a single-user V0 — keep dependencies minimal.

**Folder structure:**
```
the-edge/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                # Home page (session launcher)
│   ├── session/
│   │   └── page.tsx            # Active session (all phases render here)
│   └── api/
│       ├── status/route.ts     # Home page data
│       ├── checkin/route.ts    # Mission check-in (end of session, Day 2+)
│       ├── lesson/route.ts     # Phase 1: Lesson
│       ├── retrieval/route.ts  # Retrieval bridge
│       ├── roleplay/route.ts   # Phase 2: Roleplay turns (streaming)
│       ├── coach/route.ts      # Phase 2: Mentor assist (Haiku)
│       ├── debrief/route.ts    # Phase 3: Debrief + scoring
│       └── mission/route.ts    # Phase 4: Mission generation + ledger write
├── lib/
│   ├── anthropic.ts            # Client singleton + helpers
│   ├── prompts/
│   │   ├── system-context.ts   # Persistent user context
│   │   ├── checkin.ts          # Mission check-in prompt
│   │   ├── lesson.ts           # Phase 1 prompt
│   │   ├── retrieval-bridge.ts # Retrieval bridge prompt
│   │   ├── roleplay.ts        # Phase 2 prompt + scenario context
│   │   ├── coach.ts            # Mentor prompt
│   │   ├── debrief.ts          # Phase 3 prompt (includes scoring rubric)
│   │   └── mission.ts          # Phase 4 prompt
│   ├── ledger.ts               # Nuance Ledger CRUD + serialisation
│   ├── concepts.ts             # Concept taxonomy + selection
│   ├── characters.ts           # Character archetypes
│   └── types.ts                # All shared types
├── data/
│   └── ledger.json             # Created at runtime
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service worker
│   ├── icon-192.png
│   └── icon-512.png
├── .env.local                  # ANTHROPIC_API_KEY=your-key-here
└── .env.example
```

**Root layout (`app/layout.tsx`):**
- Warm cream background `#FAF9F6`, plum-grey text `#2D2B3D`
- Set `background-color: #FAF9F6` on BOTH `<html>` and `<body>` to prevent white flash
- Import DM Sans from `next/font/google` — weights 400, 500, 600, 700
- `max-w-[720px] mx-auto px-4`
- No navigation bar
- PWA meta tags (see Section 6)
- Add `style={{ colorScheme: 'light' }}` to `<html>`

**Environment:**
- `.env.local` with `ANTHROPIC_API_KEY=your-key-here`
- `.env.example` as reference
- `.env.local` in `.gitignore`

**.gitignore must include:**
```
.env*
!.env.example
/data/
/.next/
/node_modules
```
The `/data/` entry is critical — `ledger.json` contains personal behavioral data that must never be committed.

Scaffold all files with placeholder exports, verify `npm run dev` renders without errors, then proceed to Section 2.

---

# SECTION 2: DATA LAYER

**File 1: `lib/types.ts`**

```typescript
export interface SessionScores {
  technique_application: number;  // 1-5
  tactical_awareness: number;     // 1-5
  frame_control: number;          // 1-5
  emotional_regulation: number;   // 1-5
  strategic_outcome: number;      // 1-5
}

export interface LedgerEntry {
  day: number;
  date: string;                   // ISO date
  concept: string;                // e.g., "Mirroring (Voss)"
  domain: string;                 // one of 7 taxonomy domains
  character: string;              // archetype name
  difficulty: number;             // 1-5
  scores: SessionScores;
  behavioral_weakness_summary: string;  // 2 sentences, AI-generated
  key_moment: string;             // most important roleplay turn
  mission: string;                // the deployed mission
  mission_outcome: string;        // qualitative extraction or "NOT EXECUTED"
  commands_used: string[];        // /coach, /reset, /skip, /done
  session_completed: boolean;
}

export interface Concept {
  id: string;
  name: string;
  domain: ConceptDomain;
  source: string;                 // attribution, e.g., "Cialdini"
  description: string;            // 1-2 sentence summary for prompt injection
}

export type ConceptDomain =
  | "Influence & Persuasion"
  | "Power Dynamics"
  | "Negotiation"
  | "Behavioural Psychology & Cognitive Bias"
  | "Nonverbal Intelligence & Behavioural Profiling"
  | "Rapport & Relationship Engineering"
  | "Dark Psychology & Coercive Technique Recognition";

export interface CharacterArchetype {
  id: string;
  name: string;
  description: string;
  personality: string;            // detailed personality for system prompt
  communication_style: string;
  hidden_motivation: string;
  pressure_points: string[];
  tactics: string[];              // techniques used against the user
}

export type SessionPhase = "lesson" | "retrieval" | "roleplay" | "debrief" | "mission";

// Maps internal phase values to display labels and visual phase indicator dots.
// "retrieval" falls under the "Learn" dot. "mission" falls under the "Deploy" dot.
export const PHASE_DISPLAY: Record<SessionPhase, { label: string; dotIndex: number }> = {
  lesson:    { label: "Learn",  dotIndex: 0 },
  retrieval: { label: "Learn",  dotIndex: 0 },
  roleplay:  { label: "Sim",    dotIndex: 1 },
  debrief:   { label: "Brief",  dotIndex: 2 },
  mission:   { label: "Deploy", dotIndex: 3 },
};

// The 4 visual phase dots shown in the phase indicator
export const VISUAL_PHASES = [
  { key: "lesson",   label: "Learn",  colour: "#B8D4E3" },
  { key: "roleplay", label: "Sim",    colour: "#F2C4C4" },
  { key: "debrief",  label: "Brief",  colour: "#C5B8E8" },
  { key: "mission",  label: "Deploy", colour: "#B8E0C8" },
] as const;

export interface SessionState {
  day: number;
  date: string;
  phase: SessionPhase;
  concept: Concept | null;
  character: CharacterArchetype | null;
  scenarioContext: string | null;
  roleplayTranscript: { role: "user" | "assistant"; content: string }[];
  coachMessages: string[];
  commandsUsed: string[];
  turnCount: number;
  completedPhases: SessionPhase[];
  checkinOutcome: string | null;
  checkinNeeded: boolean;
  checkinDone: boolean;
  lastMission: string | null;          // previous session's mission (for check-in display)
  lessonContent: string | null;
  retrievalQuestion: string | null;
  retrievalResponse: string | null;
  debriefContent: string | null;
  scores: SessionScores | null;
  behavioralWeaknessSummary: string | null;
  keyMoment: string | null;
  mission: string | null;
  rationale: string | null;
}
```

Export all types.

---

**File 2: `lib/ledger.ts`**

Implement:

1. `getLedger(): LedgerEntry[]` — Reads `data/ledger.json`. If file doesn't exist, creates it with `[]`. Handle errors gracefully (if corrupted JSON, log error, return `[]`).

2. `appendEntry(entry: LedgerEntry): void` — Appends entry and writes to disk.

3. `updateLastEntry(updates: Partial<LedgerEntry>): void` — Updates the most recent entry's fields (used by end-of-session check-in to set `mission_outcome` on the PREVIOUS session's entry).

4. `getLastEntry(): LedgerEntry | null` — Most recent entry, or null.

5. `serialiseForPrompt(count?: number): string` — Takes last `count` entries (default 7), serialises to clean markdown. Extract ONLY: `day`, `concept`, `behavioral_weakness_summary`, `mission_outcome`. Format:
   ```markdown
   ## Recent Session History
   - **Day 4 — Mirroring (Voss):** Defaulted to defensive data-dumping when challenged on unit economics. Lost frame control by justifying rather than redirecting. | Mission outcome: Used calibrated 'How' question with CFO — CFO shifted from interrogating to problem-solving.
   ```
   If empty, return `"No prior sessions recorded."`.

6. `getCompletedConcepts(): string[]` — Array of concept IDs from all entries.

7. `getLedgerCount(): number` — Total entries. Used for cold start guard (< 3 = no pattern analysis).

---

**File 3: `lib/concepts.ts`**

Create an array of **at least 42 concepts** (6+ per domain across all 7 domains). Each concept has: `id`, `name`, `domain`, `source`, `description` (1-2 sentences).

Example concepts per domain:
- **Influence & Persuasion (6):** Reciprocity, Commitment & Consistency, Social Proof, Authority, Scarcity, Liking (Cialdini)
- **Power Dynamics (6):** Law 1 — Never Outshine the Master, Law 3 — Conceal Your Intentions, Law 6 — Court Attention, Law 15 — Crush Your Enemy Totally, Law 33 — Discover Each Person's Thumbscrew, Law 48 — Assume Formlessness (Greene)
- **Negotiation (6):** Tactical Empathy, Mirroring, Labelling, Calibrated Questions, The Accusation Audit, The Ackerman Model (Voss)
- **Behavioural Psychology (6):** Anchoring Effect, Framing Effect, Loss Aversion, Availability Heuristic, Sunk Cost Fallacy, Peak-End Rule (Kahneman)
- **Nonverbal Intelligence (6):** Baseline Behaviour Reading, Deviation Detection, Authority Posture, Microexpression Clusters, The Ellipsis Model, Status Transactions (Chase Hughes / Johnstone)
- **Rapport & Relationship (6):** Genuine Interest Principle, Name Recall, Avoid Criticism, Talk in Terms of Their Interests, Make Them Feel Important, Strategic Vulnerability (Carnegie / Dreeke)
- **Dark Psychology (6):** Gaslighting Recognition, DARVO Pattern, Manufactured Urgency, Information Asymmetry Exploitation, Love-Bombing in Professional Contexts, Triangulation (recognition/defence framing)

**Concept overlap guard:** Tactical Empathy and Labelling, Mirroring and Calibrated Questions, and Reciprocity and Liking are overlapping concept clusters. `selectConcept()` should treat concepts in the same cluster as same-domain for diversity purposes — they should be separated by at least 7 days.

Implement:
- `selectConcept(completedIds: string[]): Concept` — Selects a random concept NOT in completedIds AND not from the same domain as the most recently completed concept (domain diversity). Also enforce cluster separation (see above). If all other-domain concepts exhausted, allow same-domain. If all exhausted, reset pool.

---

**File 4: `lib/characters.ts`**

Define exactly 6 character archetypes with RICH personality briefs — each brief should be 300-500 words covering personality, speech patterns, emotional triggers, and behavioral tells. These get injected into the roleplay system prompt and must sustain character consistency across 8+ turns.

1. **The Sceptical Investor** — Series A VC, 15 years in venture. Precise, clipped sentences. Interrupts. Tests conviction by attacking weakest points. Hidden motivation: wants to invest but needs founder conviction. Tactics: rapid-fire objections, deliberate silence, dismissive framing. Pressure points: fear of missing a breakout deal, competitive anxiety about other VCs, personal insecurity about their last failed bet.

2. **The Political Stakeholder** — Group Head of Innovation at a tier-1 bank. Corporate euphemisms, never commits. Hidden motivation: protecting internal empire and avoiding blame. Tactics: committee deferral, scope creep, manufactured complexity. Pressure points: fear of being seen as a blocker, anxiety about missing the innovation narrative, legacy concerns.

3. **The Resistant Report** — Senior team member underperforming by 40%. Charming, deflects with humour. Hidden motivation: knows they're underperforming but believes targets are unreasonable. Tactics: whataboutism, victimhood positioning, weaponising team morale. Pressure points: genuine desire to succeed, shame about performance, fear of termination.

4. **The Hostile Negotiator** — Chief Procurement Officer, FTSE 100. Creates artificial urgency and exploding offers. Hidden motivation: needs the deal but must show maximum concession extraction. Tactics: absurd anchoring, good cop/bad cop references, manufactured walk-away threats. Pressure points: internal pressure to close, budget deadline anxiety, fear of losing preferred vendor status.

5. **The Alpha Peer** — Technical co-founder who undermines commercial leadership. Uses data to override intuition. Hidden motivation: believes company should be product-led. Tactics: frame control via jargon, conversational interruption, strategic questioning implying incompetence. Pressure points: deep insecurity about business acumen, fear of irrelevance if company becomes sales-led, respect for genuine technical understanding.

6. **The Consultancy Gatekeeper** — Senior Partner, Big Four. Polished, measured, never rushed. Hidden motivation: interested but needs brand risk justification. Tactics: status signalling, conditional enthusiasm, excessive proof-point requests. Pressure points: client pressure to deliver AI strategy, fear of recommending a startup that fails, competitive anxiety about rival firms.

**Domain-to-Character Mapping:**

Define an explicit `DOMAIN_CHARACTER_MAP` constant:

```typescript
export const DOMAIN_CHARACTER_MAP: Record<string, string[]> = {
  "Influence & Persuasion":     ["the-sceptical-investor", "the-consultancy-gatekeeper", "the-political-stakeholder"],
  "Power Dynamics":             ["the-alpha-peer", "the-political-stakeholder", "the-hostile-negotiator"],
  "Negotiation":                ["the-hostile-negotiator", "the-sceptical-investor", "the-consultancy-gatekeeper"],
  "Behavioural Psychology & Cognitive Bias": ["the-sceptical-investor", "the-hostile-negotiator", "the-political-stakeholder"],
  "Nonverbal Intelligence & Behavioural Profiling": ["the-consultancy-gatekeeper", "the-alpha-peer", "the-political-stakeholder"],
  "Rapport & Relationship Engineering": ["the-resistant-report", "the-consultancy-gatekeeper", "the-political-stakeholder"],
  "Dark Psychology & Coercive Technique Recognition": ["the-hostile-negotiator", "the-alpha-peer", "the-resistant-report"],
};
```

Implement:
- `selectCharacter(concept: Concept): CharacterArchetype` — Selects a random character from the domain-appropriate pool using `DOMAIN_CHARACTER_MAP`. If no mapping exists for the domain, select from all characters.

---

# SECTION 3: AI INTEGRATION LAYER

**File 1: `lib/anthropic.ts`**

1. **Anthropic client singleton** from `@anthropic-ai/sdk`. Read `ANTHROPIC_API_KEY` from env. Throw clear error if missing.

2. **Model constants:**
   ```typescript
   export const MODELS = {
     PRIMARY: "claude-sonnet-4-5-20250929",
     FAST: "claude-haiku-4-5-20251001",
   } as const;
   ```

3. **Phase-specific configs:**
   ```typescript
   export const PHASE_CONFIG = {
     lesson:    { model: MODELS.PRIMARY, max_tokens: 1200, temperature: 0.8 },
     retrieval: { model: MODELS.PRIMARY, max_tokens: 120,  temperature: 0.6 },
     roleplay:  { model: MODELS.PRIMARY, max_tokens: 400,  temperature: 0.9 },
     coach:     { model: MODELS.FAST,    max_tokens: 300,  temperature: 0.7 },
     debrief:   { model: MODELS.PRIMARY, max_tokens: 1500, temperature: 0.6 },
     mission:   { model: MODELS.PRIMARY, max_tokens: 400,  temperature: 0.7 },
     checkin:   { model: MODELS.PRIMARY, max_tokens: 200,  temperature: 0.7 },
   } as const;
   ```

4. **Streaming helper:** `streamResponse(systemPrompt, messages, config)` → `ReadableStream`. Uses SDK streaming mode. Returns a `Response` with headers: `Content-Type: text/plain`, `Transfer-Encoding: chunked`, `Cache-Control: no-cache`. On errors: yield error message text in the stream (do not throw).

5. **Non-streaming helper:** `generateResponse(systemPrompt, messages, config)` → `Promise<string>`. Full response text.

Both helpers:
- Retry once on 429 with 2-second delay
- Timeout after 15 seconds with graceful error message
- Log phase name, model, approximate tokens to console

---

**File 2: `lib/prompts/system-context.ts`**

Export `buildPersistentContext(): string` returning:

```
You are part of The Edge, an AI-powered daily influence training system for elite professionals.

YOUR USER:
- Name: Tom Fairey
- Role: CEO and Founder at Presential AI
- Company: Presential AI — a London-based privacy infrastructure startup that enables enterprises to use LLMs safely through reversible semantic pseudonymisation. The company solves the core enterprise AI adoption blocker: organisations cannot feed sensitive data into LLMs without violating GDPR, financial regulation, and internal compliance policies. Presential's technology allows full LLM utilisation while maintaining complete data sovereignty. Early stage — currently fundraising, building the founding team, and securing first design partners. [REVIEW QUARTERLY — fundraise status may change]
- Current priority: Raising a seed round, signing first design partners in financial services and healthcare, and recruiting a founding CTO. [REVIEW QUARTERLY]
- Target clients: Tier-1 UK banks (Lloyds Banking Group, NatWest, Barclays), NHS trusts, insurance companies, and any regulated enterprise blocked from deploying LLMs due to data privacy constraints.
- Strategic partnerships: Targeting tier-1 consultancies (Accenture, Kyndryl, BCG, KPMG) as channel partners.
- Background: Previously CRO at UnlikelyAI (neurosymbolic AI for regulated industries). Founding CRO at Quantexa (scaled commercial team from 1 to 100+ globally). Former CRO at Suade Labs (regulatory technology). Founded Stakester (competitive gaming platform).
- Published author: "How Not To F*ck Up Your Startup" (Hachette, 2024). Former host of The Back Yourself Show podcast (120+ episodes).
- Communication style: Direct, no-nonsense, values candour over diplomacy. Comfortable in ambiguity and high-pressure environments.
- Education: Theology degree from Oxford, military service.
- Personal: Married, three children including a newborn. Time-poor.

KEY CONTEXT FOR SCENARIO DESIGN:
As a first-time CEO building from zero, Tom's daily landscape includes: pitching sceptical investors on a pre-revenue privacy infrastructure play, convincing enterprise prospects to be design partners for unproven technology, recruiting senior technical talent, managing the loneliness and pressure of early-stage founding, and leveraging his network and personal brand. His deep relationships in UK banking are his unfair advantage. His relative inexperience as a CEO (versus CRO) is his primary growth edge.

[DYNAMIC: Serialised Nuance Ledger]

CONCEPTS COVERED TO DATE: [DYNAMIC: completed concept names]
```

Call `serialiseForPrompt()` and `getCompletedConcepts()` to populate dynamic sections.

---

# SECTION 4: SYSTEM PROMPTS

**CRITICAL: Implement these prompts using the EXACT strings below. Do not modify, rephrase, or "improve" them.**

---

### `lib/prompts/checkin.ts`

This prompt is used at the END of the session, just before the new mission is deployed. The context is natural: "before I give you a new mission, how did the last one go?" The user has already invested 9 minutes and is engaged — this is not a blocker.

```typescript
export function buildCheckinPrompt(previousMission: string, userOutcome: string, outcomeType: 'completed' | 'tried' | 'skipped'): string {
  return `You are a concise executive coach wrapping up a training session. The user just completed today's roleplay and debrief. Now, before they receive their next mission, you're checking in on yesterday's.

YESTERDAY'S MISSION: "${previousMission}"

THE USER'S RESPONSE TYPE: ${outcomeType}
THE USER SAID: "${userOutcome}"

YOUR TASK:
Deliver exactly ONE sentence that bridges the old mission to the new one they're about to receive.

IF "completed" — Connect their field result to today's session. Be specific and sharp.
Example: "That pause shifted the power dynamic — and what you just practised today will let you stack that with a follow-up move."

IF "tried" — Acknowledge the attempt and sharpen observation.
Example: "Good execution. Next time, watch their breathing pace in the 3 seconds after — that's where the real tell is."

IF "skipped" — Brief, no judgment, forward-looking. The new mission is about to land — frame it as a fresh opportunity.
Example: "No problem. The mission you're about to get will give you a clean shot."

CONSTRAINTS:
- Exactly 1 sentence. No more.
- No pleasantries. No "great job." No "I understand."
- Warm but direct. Bridging tone — closing one loop, opening the next.
- End with a newline then: [CHECKIN_TYPE: ${outcomeType.toUpperCase()}]`;
}
```

---

### `lib/prompts/lesson.ts`

```typescript
import { Concept } from '../types';

export function buildLessonPrompt(concept: Concept): string {
  return `You are the Lesson Engine for The Edge — a daily influence training system for elite professionals.

TODAY'S CONCEPT:
Name: ${concept.name}
Domain: ${concept.domain}
Source: ${concept.source}
Description: ${concept.description}

YOUR TASK:
Deliver a micro-lesson on this concept following this EXACT three-part structure. Use these headers exactly as written.

## The Principle
100-150 words. Explain what this concept is and WHY it works — the psychological or neurological mechanism, not just the tactic. Attribution to the source author is mandatory. Write for a senior executive: precise language, no filler, no condescension. The reader has a theology degree from Oxford and has built multiple companies — they can handle density.

## The Play
150-200 words. A vivid, SPECIFIC real-world example of this technique deployed effectively. Requirements:
- Name real people and real situations wherever possible (historical, business, political, intelligence).
- The example must be so specific and vivid that the reader will recall it 8 hours later during a meeting.
- Show the setup, the move, and the outcome.
- BAD example: "A CEO used anchoring in a negotiation to set a high price."
- GOOD example: "When Steve Jobs unveiled the iPad in 2010, he opened by displaying '$999' on screen — the price analysts had predicted. He let it sit for ten seconds. Then he dropped it to $499, and the audience gasped. The $999 was never the real price. It was the anchor. Every reviewer wrote that the iPad was 'surprisingly affordable' — a phrase Jobs had engineered by manipulating their reference point before they ever touched the device."

## The Counter
100-150 words. An example of this SAME technique being used AGAINST someone. This section must do TWO things:
1. Show how to RECOGNISE the technique in the wild — what are the telltale signs someone is deploying this on you?
2. Show how to NEUTRALISE it — what is the specific counter-move?
Do not be abstract. Give a scenario and the exact response that defuses it.

ABSOLUTE CONSTRAINTS:
- Total output: 400-600 words. HARD LIMIT. Do not exceed 600 words under any circumstances. Before finalizing, count your words. If over 600, edit down.
- Write in prose paragraphs. No bullet points. No numbered lists.
- Tone: dense, compelling, zero filler. Like the best page of a Robert Greene book.
- The reader should feel smarter after reading this. Not lectured. Not patronised. Sharper.`;
}
```

---

### `lib/prompts/roleplay.ts`

```typescript
import { Concept, CharacterArchetype } from '../types';

export function buildRoleplayPrompt(
  concept: Concept,
  character: CharacterArchetype,
  scenarioContext: string
): string {
  // For Nonverbal Intelligence concepts, add an instruction for the character
  // to include italicized action descriptions in their responses.
  const nonverbalNote = concept.domain === "Nonverbal Intelligence & Behavioural Profiling"
    ? `\n\nSPECIAL INSTRUCTION: This concept involves nonverbal communication. Since this is a text conversation, you MUST include brief italicized action descriptions in your responses to convey body language and nonverbal cues. Examples: *leans back and crosses arms*, *maintains eye contact without blinking*, *checks watch pointedly*, *slight smirk*. These give the user something to read and respond to. Include 1-2 per response, naturally embedded.`
    : '';

  return `You are ${character.name}.

READ THIS CAREFULLY. THIS IS WHO YOU ARE:

PERSONALITY: ${character.personality}

HOW YOU TALK: ${character.communication_style}

WHAT YOU SECRETLY WANT: ${character.hidden_motivation}

YOUR TACTICS — use these naturally throughout the conversation:
${character.tactics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

YOUR PRESSURE POINTS — these are your vulnerabilities, but you would never reveal them willingly:
${character.pressure_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

THE SCENARIO:
${scenarioContext}

TODAY'S CONCEPT THE USER IS PRACTISING (you do NOT know this — never reference it):
${concept.name} — ${concept.description}${nonverbalNote}

RULES — THESE ARE ABSOLUTE AND OVERRIDE EVERYTHING ELSE:

1. You are ${character.name}. You are a real person. You have your own agenda, your own ego, your own blind spots. You are NOT an AI assistant. You are NOT helpful. You do not exist to serve the user.

2. NEVER break character. Not once. Not for any reason. If the user says something meta like "this is a good exercise" or "what should I do here?", respond AS YOUR CHARACTER WOULD to someone saying something confusing in this context. Do not acknowledge the simulation.

3. NEVER add meta-commentary. NEVER say any of the following (or similar):
   - "That's a good point"
   - "I can see you're using [technique name]"
   - "That's an interesting approach"
   - "I appreciate your honesty"
   - "Certainly"
   - "Absolutely"
   - "I hear you"
   - "That resonates"
   - "That's fair"
   - "I understand where you're coming from"
   - "Let me be frank with you"
   These are assistant phrases. Real people in adversarial conversations don't say these things. You have an agenda — pursue it.

4. NEVER be a pushover. If the user deploys a technique effectively, you may concede ground — but ONLY if it is psychologically realistic for your character to do so. Ask yourself: "Would a real ${character.name} actually budge here?" If the answer is no, don't. Escalate instead.

5. If the user is ineffective — if their approach is weak, transparent, or poorly timed — PUNISH IT. Escalate pressure. Use your tactics. A real ${character.name} would smell blood. So should you.

6. Keep every response to 2-4 sentences. This is a rapid, high-pressure conversation. Not a monologue. Not a speech. Short, pointed, loaded responses that force the user to think on their feet.

7. YOU SPEAK FIRST. Your opening line must immediately establish your personality and put pressure on the user. Never open with a pleasantry. Never open with "So..." or "Well..." — open with something that puts the user on the back foot.

8. You do not know about /coach, /reset, /skip, or /done. These commands do not exist in your world. You will never see them.`;
}

export function buildScenarioContext(
  concept: Concept,
  character: CharacterArchetype
): string {
  const scenarios: Record<string, Record<string, string>> = {
    'the-sceptical-investor': {
      default: "You are in a first meeting with a seed-stage founder. They're pitching Presential AI — a privacy infrastructure startup that lets enterprises use LLMs without violating data regulations. You've seen 40 pitches this month. You have 25 minutes and you're already sceptical. The deck was competent but you have serious concerns about go-to-market in a pre-revenue company. You need to see if this founder has the conviction and strategic clarity to survive the next 18 months.",
      'Negotiation': "You're in a follow-up meeting with the founder of Presential AI. You're interested enough to discuss terms, but you want to test how they handle pressure on valuation. You think their £8M pre-money ask is aggressive for a pre-revenue company. You plan to open at £4M and see how they respond.",
      'Influence & Persuasion': "You're at a VC dinner and the founder of Presential AI has cornered you for an informal pitch. You're mildly interested but you've heard the 'privacy for LLMs' thesis before and weren't convinced. They have about 5 minutes of your genuine attention before you move on.",
    },
    'the-political-stakeholder': {
      default: "You are the Group Head of Innovation at a major UK bank. The CEO of Presential AI has been referred to you by a mutual contact at Kyndryl. You've agreed to a 30-minute call to explore whether their privacy technology could solve your team's LLM deployment blockers. However, you're protective of your budget, your internal AI strategy, and your relationship with your existing vendors. You will not commit to anything today.",
      'Power Dynamics': "You're in a quarterly review meeting and the CEO of Presential AI is presenting the results of a small pilot. The results are good, but you're not ready to expand the engagement because doing so would mean admitting your previous vendor choice was wrong. You will find reasons to delay.",
      'Rapport & Relationship Engineering': "The CEO of Presential AI has invited you for coffee to discuss 'the broader AI landscape' — but you know they want to sell. You like them personally but your budget is committed for the quarter. See how they handle the social-professional boundary.",
    },
    'the-resistant-report': {
      default: "You are a senior sales hire at Presential AI — brought in 3 months ago to build the pipeline. Your numbers are 40% below target. The CEO has called a 1:1 to discuss performance. You know you're underperforming but you believe the targets were set before the product was ready, the ICP hasn't been validated, and you've been given insufficient marketing support. You like the CEO personally and don't want this to become confrontational.",
      'Rapport & Relationship Engineering': "The CEO has asked you for a casual Friday coffee. You suspect it's about your numbers but they haven't said so. You're ready with your 'everything is fine' persona. If they push, you'll deflect with charm and redirect to team morale issues.",
      'Dark Psychology & Coercive Technique Recognition': "Performance review time. You've prepared a presentation that reframes your pipeline miss as a 'market timing issue' and subtly implies the CEO's product decisions are the real problem. You plan to use emotional appeals about how hard you've been working to forestall any tough conversation.",
    },
    'the-hostile-negotiator': {
      default: "You are the Chief Procurement Officer at a FTSE 100 insurance company. Presential AI has been selected by your innovation team as the preferred vendor for an LLM privacy layer. Your job is to get the best possible commercial terms before signing. You plan to use every lever available: competitor references, budget constraints, timeline pressure, and scope reduction. The CEO of Presential AI is on the call and you want to see if they'll fold or hold.",
      'Negotiation': "You're in the final commercial negotiation with Presential AI. The deal is £150K/year. You want it at £90K. You have authority to go to £120K but you'll never reveal that. You plan to open with 'We've been told by finance that our maximum is £80K' and see how they react.",
      'Behavioural Psychology & Cognitive Bias': "You're renegotiating the renewal terms with Presential AI. You plan to anchor aggressively low, then use sunk cost framing ('We've already invested so much in this partnership') to make them feel they can't walk away. You know they need this renewal more than you do.",
    },
    'the-alpha-peer': {
      default: "You are a technical co-founder at an AI startup. You've been introduced to the CEO of Presential AI at a founder dinner and the conversation has turned to product strategy. You think commercial founders without deep technical backgrounds make bad CEO decisions in AI companies. You're going to test this one — subtly challenging their technical understanding, questioning their product architecture decisions, and seeing if they defer to you or hold their ground.",
      'Power Dynamics': "You're on a panel at an AI conference with the CEO of Presential AI. The moderator has just asked about the future of enterprise AI privacy. You plan to subtly frame the conversation so that your technical perspective dominates, positioning the other panellist as a 'sales guy' rather than a serious AI thinker.",
      'Influence & Persuasion': "You're at a startup founders' dinner. The CEO of Presential AI is pitching you on a potential technical advisory role. You're mildly interested but you want to establish that you'd be doing them a favour, not the other way around. Make them sell harder.",
    },
    'the-consultancy-gatekeeper': {
      default: "You are a Senior Partner at a Big Four consultancy. The CEO of Presential AI has requested a meeting to discuss a potential channel partnership. You're mildly interested — your clients keep asking about LLM privacy — but you're concerned about associating your brand with a pre-revenue startup. You need to see deep domain expertise, a clear integration path, and evidence that this won't embarrass you in front of a client.",
      'Influence & Persuasion': "The CEO of Presential AI has been referred by a mutual client. They want to present at your next client roundtable on AI privacy. You'd consider it, but only if they can demonstrate they won't waste your clients' time. Test their credibility.",
      'Power Dynamics': "You've run into the CEO of Presential AI at a Kyndryl event. They're trying to establish a peer dynamic with you but you represent a £20B firm and they represent a pre-revenue startup. You'll be polite but subtly remind them of the status differential.",
    },
  };

  const characterScenarios = scenarios[character.id] || scenarios['the-sceptical-investor'];
  const domainScenario = characterScenarios[concept.domain];
  const defaultScenario = characterScenarios['default'];

  return domainScenario || defaultScenario || "You are meeting with the CEO of Presential AI to discuss a business matter relevant to your role. You have your own agenda and are not easily persuaded.";
}
```

---

### `lib/prompts/coach.ts`

```typescript
import { Concept } from '../types';

export function buildCoachPrompt(
  transcript: { role: string; content: string }[],
  concept: Concept
): string {
  const formattedTranscript = transcript
    .map((t) => `${t.role === 'assistant' ? 'CHARACTER' : 'USER'}: ${t.content}`)
    .join('\n\n');

  return `You are an elite tactical advisor. A spymaster watching a live operation through a one-way mirror.

The user is in a roleplay practising: ${concept.name} (${concept.description})

Here is the conversation so far:

${formattedTranscript}

YOUR TASK:
Provide exactly 2-3 tactical moves the user could make on their NEXT turn. For each move:
- State what it is in 3-5 words (the tactic name)
- Give the EXACT WORDS to say. Not a description of what to say. The actual sentence.

FORMAT — use exactly this:
1. [TACTIC]: "[Exact words to say]"
2. [TACTIC]: "[Exact words to say]"
3. [TACTIC]: "[Exact words to say]"

CONSTRAINTS:
- Maximum 150 words total.
- No preamble. No "Here's what I'd suggest." Just the numbered options.
- No encouragement. No "You're doing well." Just tactics.
- Each option must be a genuinely different strategic direction, not variations of the same move.
- At least one option should involve the day's concept (${concept.name}).`;
}
```

---

### `lib/prompts/debrief.ts`

This prompt includes the full scoring rubric with explicit anchors.

```typescript
import { Concept, CharacterArchetype } from '../types';

export function buildDebriefPrompt(
  transcript: { role: string; content: string }[],
  concept: Concept,
  character: CharacterArchetype,
  ledgerCount: number,
  serialisedLedger: string
): string {
  const formattedTranscript = transcript
    .map((t, i) => `Turn ${Math.floor(i / 2) + 1} — ${t.role === 'assistant' ? character.name.toUpperCase() : 'USER'}: ${t.content}`)
    .join('\n\n');

  const longitudinalInstruction = ledgerCount >= 3
    ? `You have ${ledgerCount} prior sessions of data. ACTIVELY look for recurring behavioural patterns across sessions. When you identify a pattern, call it out with specific day references: "On Day X, you did the same thing when..." This longitudinal awareness is what makes you an elite coach, not a generic chatbot.

SESSION HISTORY:
${serialisedLedger}`
    : `This is session ${ledgerCount + 1}. You have fewer than 3 prior sessions. Focus ENTIRELY on this session's execution. Do NOT attempt to identify longitudinal patterns or make cross-session comparisons — there is insufficient data and any pattern you infer will be fabricated. Be deeply specific about THIS transcript.`;

  return `You are an elite executive coach. The kind who charges £2,000 per hour and tells CEOs what nobody else will.

You are blunt. You are specific. You reference exact moments. You never give abstract advice like "be more assertive" — you give forensic analysis like "In Turn 4, when they said X, you responded with Y. That was a defensive retreat. You should have said Z because..."

You do not soften. You do not encourage. You do not say "good effort." The user is a CEO and former CRO who has scaled companies globally. They do not need hand-holding. They need the truth delivered with surgical precision.

TODAY'S CONCEPT: ${concept.name} (${concept.source})
${concept.description}

THE CHARACTER THEY FACED: ${character.name}
${character.description}
Tactics used: ${character.tactics.join(', ')}

${longitudinalInstruction}

THE TRANSCRIPT:

${formattedTranscript}

YOUR TASK — deliver your analysis in this exact structure:

**TECHNIQUE APPLICATION**
1-2 sentences. Did the user deploy ${concept.name}? How effectively? Reference the specific turn where they used it (or failed to).

**TACTICAL AWARENESS**
1-2 sentences. Did the user recognise the character's tactics (${character.tactics.slice(0, 2).join(', ')})? Did they adapt? Reference specific turns.

**FRAME CONTROL**
1-2 sentences. Who owned the frame of this conversation? At what point did control shift (if it did)? Be specific.

**EMOTIONAL REGULATION**
1-2 sentences. Did the user stay strategic or become reactive? If the character provoked them, at which turn? What was the tell?

**STRATEGIC OUTCOME**
1-2 sentences. Did the user achieve their objective? Was the character moved from their opening position?

**THE REPLAY**
Identify 1-2 specific moments where a different choice would have changed the outcome. For each:
- State the exact turn and what was said
- Explain why it was suboptimal (1 sentence)
- Provide the EXACT alternative phrasing — the actual words they should have said
- The alternative must sound natural, not robotic. Something this specific user would realistically say.

SCORING RUBRIC — use this to assign scores. USE THE FULL RANGE. Do not default to 3s and 4s.

| Score | Meaning |
|-------|---------|
| 1 | Did not attempt. Showed no awareness of the dimension. Was completely passive or ignored the opportunity entirely. |
| 2 | Attempted but it backfired or was deployed incorrectly. The character exploited the attempt. The user may have made their position worse. |
| 3 | Competent but unremarkable. The technique was present but lacked precision, timing, or conviction. Missed at least one clear opportunity. This is the "average" score — most early sessions should cluster here. |
| 4 | Effective deployment with minor missed opportunities. The character was noticeably moved or disrupted. The user showed genuine skill. |
| 5 | Elite execution. The technique was deployed with precise timing, natural delivery, and measurable impact on the character's position. Would work in a real boardroom. RARE — a session averaging 4+ across all dimensions should happen less than 10% of the time. |

CALIBRATION NOTES:
- If you find yourself giving 4s on everything, you are being too generous. The user WANTS hard scores. A 2 that teaches them something is worth more than a 4 that confirms nothing.
- For every 4 you give, ask "Would this genuinely work on a real version of this character?" If the answer is "maybe", it's a 3.
- At least one dimension MUST score 3 or below unless every single turn in the transcript demonstrates genuine mastery. Sessions averaging 4+ should occur less than 10% of the time.

MANDATORY STRUCTURED OUTPUT — end your response with this EXACT block on new lines. The backend parses this programmatically. Do not modify the format, do not add commentary after it, do not wrap it in markdown code blocks. Replace each number with your actual 1-5 score:

---SCORES---
technique_application: 3
tactical_awareness: 2
frame_control: 3
emotional_regulation: 4
strategic_outcome: 2
---LEDGER---
behavioral_weakness_summary: [Exactly 2 sentences. Be specific. Reference turns and patterns. This gets stored and shown to future sessions.]
key_moment: [Exactly 1 sentence. The single most important turn — what happened and what should have happened.]`;
}
```

---

### `lib/prompts/mission.ts`

```typescript
import { Concept, SessionScores } from '../types';

export function buildMissionPrompt(
  concept: Concept,
  scores: SessionScores,
  serialisedLedger: string
): string {
  // 70% of the time target weakest dimension; 30% target a near-strength (4)
  // to reinforce emerging skills. If no dimension scored 4, always target weakest.
  const entries = Object.entries(scores) as [string, number][];
  const weakest = entries.reduce((a, b) => a[1] <= b[1] ? a : b);
  const nearStrengths = entries.filter(([, v]) => v === 4);
  const useNearStrength = nearStrengths.length > 0 && Math.random() < 0.3;
  const targetDimension = useNearStrength
    ? nearStrengths[Math.floor(Math.random() * nearStrengths.length)]
    : weakest;

  const targetLabel = targetDimension[0].replace(/_/g, ' ');
  const targetScore = targetDimension[1];
  const targetReason = useNearStrength
    ? `near-strength to reinforce (scored ${targetScore}/5)`
    : `weakest dimension (scored ${targetScore}/5)`;

  return `You are a strategic advisor assigning a field operation. Think: a spymaster giving a single, precise instruction before an agent walks into a room.

TODAY'S CONCEPT: ${concept.name} (${concept.source})
${concept.description}

USER'S TARGET DIMENSION: ${targetLabel} — ${targetReason}

SESSION HISTORY:
${serialisedLedger}

YOUR TASK:
Generate ONE real-world micro-mission for the user to execute within the next 24 hours.

THE MISSION MUST BE:
1. CONCRETE — not "try using mirroring" but "In your next investor call, mirror the investor's exact phrasing when they state their concern, then pause for 3 full seconds before responding."
2. TIED TO A SPECIFIC INTERACTION TYPE — reference the kind of meeting, call, or conversation the user is likely to have (investor call, team 1:1, partnership meeting, networking event, board prep).
3. OBSERVABLE — define what success looks like in terms of the OTHER PERSON'S reaction. "Watch if they pause and rephrase" or "Notice if the energy in the room shifts" or "See if they lean forward."
4. LOW-RISK — the mission must be executable without damaging a real professional relationship.
5. TARGETED — the mission should specifically exercise ${targetLabel}.

CONSTRAINTS:
- Maximum 80 words for the mission.
- Then write "RATIONALE:" on a new line.
- Maximum 30 words for the rationale, connecting the mission to today's concept and the user's development need.
- No preamble. No "Here's your mission." Just the mission text, then RATIONALE: and the rationale.`;
}
```

---

### `lib/prompts/retrieval-bridge.ts`

```typescript
import { Concept } from '../types';

export function buildRetrievalBridgePrompt(concept: Concept): string {
  return `You are a strict examiner. The user has just read a lesson on "${concept.name}" (${concept.source}).

YOUR TASK:
Ask the user ONE question that forces active recall. The question must require them to retrieve the concept from memory — not recognise it, RETRIEVE it.

FORMAT — ask exactly this:
"Before we begin — in one sentence, what is ${concept.name} and when would you deploy it?"

Then evaluate their response:

IF CORRECT (they demonstrate understanding of both what it is and when to use it):
→ Reply with exactly: "Clear. Let's go." and nothing else.

IF PARTIALLY CORRECT (they get the what but not the when, or vice versa):
→ Give a 1-sentence correction, then: "Now let's see if you can use it. Let's go."

IF WRONG OR VAGUE:
→ Give a 2-sentence correction with the key point they missed, then: "Hold that. You'll need it in 30 seconds. Let's go."

CONSTRAINTS:
- Your total response must be under 60 words.
- Never re-explain the full concept. The lesson already did that. You're testing recall, not re-teaching.
- End every response with "Let's go." — this is the trigger for the frontend to advance to the roleplay.`;
}
```

---

# SECTION 5: API ROUTES

Each route is in `app/api/[name]/route.ts`. All are POST except `/api/status` which is GET.

**Error handling for all routes:** Wrap the handler body in try/catch. On error, return `NextResponse.json({ error: "Brief description" }, { status: 500 })`. Log the full error to console.

---

**Route 1: `app/api/status/route.ts` (GET)**

Returns `{ dayNumber, lastEntry, recentScores[], streakCount }`.

- `dayNumber` = ledger count + 1 (sequential, not calendar-based).
- `recentScores` = scores from the last 7 entries (array of SessionScores objects).
- `streakCount` = consecutive days with entries (check dates; allow same-day and consecutive-day).
- `lastEntry` = most recent LedgerEntry or null (the frontend needs `lastEntry.mission` for end-of-session check-in display).

On error: return `{ dayNumber: 1, lastEntry: null, recentScores: [], streakCount: 0 }`.

---

**Route 2: `app/api/checkin/route.ts` — called at end of session, before mission (Day 2+ only)**

Request: `{ previousMission: string, outcomeType: "completed" | "tried" | "skipped", userOutcome: string }`

- If `"skipped"`: update previous entry's `mission_outcome` to `"NOT EXECUTED"`, return `{ response: "No problem. The mission you're about to get will give you a clean shot.", type: "SKIPPED" }` — no API call.
- If `"completed"` or `"tried"`: build check-in prompt, call `generateResponse()` with `PHASE_CONFIG.checkin`, parse `[CHECKIN_TYPE]` tag, update previous entry's `mission_outcome` with `userOutcome`.
- Return `{ response: string, type: string }`

On error: return `{ response: "Noted. Let's move to your next mission.", type: outcomeType.toUpperCase() }` (graceful fallback).

---

**Route 3: `app/api/lesson/route.ts`**

Request: `{ conceptId?: string }`

- Auto-select concept if none provided (via `selectConcept(getCompletedConcepts())`)
- Build lesson prompt + persistent context
- `generateResponse()` with `PHASE_CONFIG.lesson` (non-streaming)
- Return `{ concept, lessonContent }`

On error: return `{ error: "Failed to generate lesson. Please retry." }` with status 500.

---

**Route 4: `app/api/retrieval/route.ts`**

Request: `{ concept: Concept, userResponse?: string }`

- No `userResponse`: return the hardcoded question text, `ready: false` (no LLM call needed)
- With `userResponse`: build prompt, call `generateResponse()` with `PHASE_CONFIG.retrieval`, return `{ response, ready: boolean }` — `ready = true` when response `.toLowerCase().includes("let's go")` (case-insensitive check)

On error: return `{ response: "Let's move on. Let's go.", ready: true }` (skip retrieval on failure).

---

**Route 5: `app/api/roleplay/route.ts` — MUST STREAM**

Request: `{ concept, character, transcript, userMessage: string | null, scenarioContext?: string }`

- First turn (null userMessage, empty transcript): generate scenario context via `buildScenarioContext()`, build roleplay prompt, AI generates opening line. Return scenario context in `X-Scenario-Context` response header (URL-encoded).
- Subsequent turns: append userMessage to transcript, stream response with full transcript as messages array.
- Return streaming `Response` with headers: `Content-Type: text/plain`, `Transfer-Encoding: chunked`, `Cache-Control: no-cache`.
- On stream error mid-response: the partial text already sent remains visible. The frontend handles retry (see Section 6).

---

**Route 6: `app/api/coach/route.ts`**

Request: `{ transcript, concept }`

- Build coach prompt, call with `PHASE_CONFIG.coach` (Haiku, fast)
- Return `{ advice }`
- Independent of roleplay — reads but doesn't write to transcript

On error: return `{ advice: "Trust your instincts. Deploy the concept directly." }`.

---

**Route 7: `app/api/debrief/route.ts`**

Request: `{ transcript, concept, character, commandsUsed }`

- Get ledger count + serialised ledger
- Build debrief prompt with all params
- Parse `---SCORES---` section via these exact regex patterns:
  ```typescript
  const scoreRegex = /technique_application:\s*(\d)/;
  // ... same pattern for all 5 dimensions
  ```
  Extract single digit after the colon. If any score is missing or non-numeric, default that dimension to 3.
- Parse `---LEDGER---` section:
  ```typescript
  const bwsRegex = /behavioral_weakness_summary:\s*(.+)/;
  const kmRegex = /key_moment:\s*(.+)/;
  ```
  Extract everything after the colon on that line. If missing, use "Session analysis unavailable." / "No key moment identified."
- Strip everything from `---SCORES---` onward from the displayed debrief content.
- Return `{ debriefContent, scores, behavioralWeaknessSummary, keyMoment }`

On error: return default scores of 3 across all dimensions, empty debrief text with error message.

---

**Route 8: `app/api/mission/route.ts` — called AFTER check-in completes (or directly on Day 1)**

Request: `{ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, checkinOutcome }`

- Build mission prompt
- Parse mission/rationale split on "RATIONALE:" (case-insensitive)
- Assemble FULL `LedgerEntry` with all session data. Set `mission_outcome` to empty string (populated by the check-in at the END of the NEXT session)
- Call `appendEntry()`
- Return `{ mission, rationale, ledgerEntry }`

On error: return fallback mission: `{ mission: "Observe one interaction today where someone uses a persuasion technique. Name it internally.", rationale: "Observation builds pattern recognition." }`.

---

# SECTION 6: FRONTEND

## Design System

### Colours (exact values)

The design language is inspired by Tiimo: soft pastels, generous rounding, coloured card backgrounds (not white-on-white), warm and friendly but still sophisticated. Each session phase gets its own pastel colour for instant visual orientation.

```
Background:         #FAF9F6   (warm cream — not clinical white)
Surface:            #FFFFFF   (modals, input bars — pure white)
Border:             #F0EDE8   (very subtle warm grey)

Text primary:       #2D2B3D   (dark plum-grey — warm, not harsh)
Text secondary:     #8E8C99   (muted grey-purple)
Text tertiary:      #B5B3BD   (light grey — placeholders)

Phase colours (backgrounds for cards, used at ~15% opacity for tints):
  Learn:            #B8D4E3   (soft sky blue)
  Learn tint:       #E8F2F8   (light blue — card backgrounds during Learn phase)
  Simulate:         #F2C4C4   (soft coral/pink)
  Simulate tint:    #FBE8E8   (light pink — card backgrounds during Simulate phase)
  Debrief:          #C5B8E8   (soft lavender)
  Debrief tint:     #EDE8F5   (light lavender — card backgrounds during Debrief phase)
  Deploy:           #B8E0C8   (soft mint green)
  Deploy tint:      #E8F5ED   (light mint — mission card background)

Accent:             #6C63FF   (soft purple — primary interactive colour)
Accent light:       #EEEDFF   (very light purple — used for: session restored banner, selected pill ring states)

Score colours:
  High (4-5):       #6BC9A0   (soft green)
  Mid (3):          #F5C563   (warm golden yellow)
  Low (1-2):        #E88B8B   (soft coral red)

Coach panel:        #FFF8E7   (warm cream-yellow)

Shadow soft:        0 2px 12px rgba(0,0,0,0.04)   — used on all cards
Shadow elevated:    0 8px 24px rgba(0,0,0,0.06)   — used ONLY on: input bar, coach panel (explicit exceptions)
```

### Typography

Import **DM Sans** from `next/font/google` — weights 400, 500, 600, 700. This is a rounded, friendly sans-serif that matches the soft aesthetic.

```
Display (app title):    text-3xl font-bold tracking-tight
Heading:                text-xl font-semibold
Subheading:             text-lg font-medium
Body:                   text-base font-normal leading-relaxed (16px)
Label:                  text-sm font-medium text-secondary (NOT uppercase — Tiimo doesn't use uppercase labels)
Caption:                text-xs font-normal text-secondary
Scores:                 tabular-nums text-2xl font-bold (use DM Sans with tabular-nums, not font-mono)
```

### Visual Design Language (Tiimo-Inspired)

The core principle: **coloured backgrounds, super-soft rounding, no hard edges, no corporate gradients.** Cards don't sit on white with shadows — they sit on soft coloured backgrounds that tell you which phase you're in.

1. **Phase-coloured cards:** Every card takes a tinted background from its phase colour. Learn phase cards use `bg-[#E8F2F8]` (soft blue tint). Debrief cards use `bg-[#EDE8F5]` (soft lavender tint). Mission cards use `bg-[#E8F5ED]` (soft mint tint). This gives instant visual orientation — you know which phase you're in by colour alone.

2. **Super-rounded everything:** All cards: `rounded-3xl` (24px radius). All buttons: `rounded-2xl` (16px) or `rounded-full` for pills. All inputs: `rounded-2xl`. All chat bubbles: `rounded-3xl` with one corner reduced. Nothing has sharp corners.

3. **Soft shadows, not elevation hierarchy:** Use `shadow-[0_2px_12px_rgba(0,0,0,0.04)]` on cards. The elevated shadow (`shadow-[0_8px_24px_rgba(0,0,0,0.06)]`) is used ONLY on the input bar and coach panel — these need to float above content. Depth comes primarily from coloured backgrounds and whitespace.

4. **No gradients on buttons.** Primary buttons use solid `bg-[#6C63FF]` (accent purple) with white text, `rounded-2xl`, `py-4`. Active state: `active:scale-[0.97] transition-transform duration-150`. This is friendlier than corporate gradients.

5. **Coloured pill buttons for actions:** The check-in outcome pills and command buttons use distinct soft colours with rounded-full shape. "✓ Nailed it" = soft green bg. "~ Tried it" = soft yellow bg. "✕ Skip" = soft grey bg. Command icons use soft coloured circles.

6. **Score display as coloured circles:** Each score dimension is displayed as a number inside a soft coloured circle (colour = score level). Arranged in a horizontal row with generous spacing.

7. **Phase indicator as coloured dots:** Each phase dot uses its phase colour (blue, pink, lavender, green) instead of monochrome. Completed = filled with phase colour. Current = filled with gentle pulse animation (`scale(1) → scale(1.3) → scale(1), 2s ease-in-out infinite`). Future = outlined with phase colour at 30% opacity. Dots are 10px diameter with 8px gap. Separator below: `border-b border-[#F0EDE8]`.

8. **Progress ring (not arc):** On the home page, display a circular progress ring with the overall average score from the LATEST session. The ring uses the accent purple. Inside the ring: the average score as a large number. Below: a horizontal row of 5 small coloured circles showing individual dimension scores from the LATEST session (not rolling averages).

9. **Generous whitespace and padding:** Cards use `p-6`. Gap between cards: `gap-5`. The overall feel should be airy, not dense. White space is a design element, not wasted space.

10. **Friendly empty states:** On Day 1, instead of dashes and outlines, show a warm message: "Your first session" with a simple emoji (🌱) and "Let's begin" energy. Score circles show `–` in soft grey.

### Loading States

Every phase transition that involves an API call MUST show a contextual loading state. Each loading state consists of centred text in `text-sm text-secondary` with 3 animated pulsing dots below:

```css
@keyframes pulse-dot {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
.loading-dot { animation: pulse-dot 1.4s ease-in-out infinite; }
.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }
```

| Transition | Loading Text | Background |
|-----------|-------------|------------|
| Begin Session → Lesson | "Preparing today's lesson..." | Learn tint (#E8F2F8) |
| Retrieval → Roleplay | "Setting up scenario..." | Simulate tint (#FBE8E8) |
| Done/Skip → Debrief | "Analysing your performance..." | Debrief tint (#EDE8F5) |
| Check-in → Mission | "Assigning your mission..." | Deploy tint (#E8F5ED) |

Additionally, during roleplay before streaming begins: show a typing indicator (3 pulsing dots in a left-aligned character-bubble-shaped container, `bg-white rounded-3xl rounded-tl-lg p-3 w-16 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`).

### PWA Configuration

`public/manifest.json`: name "The Edge", `background_color: #FAF9F6`, `theme_color: #6C63FF`, standalone display. Generate 192px and 512px icons: rounded-square with soft purple (#6C63FF) background, white "E" in DM Sans bold. Service worker: versioned cache name (`edge-v1` — increment on each deployment), cache app shell (`/`, `/session`, `/manifest.json`, icons), DON'T cache API responses. Show offline banner when network unavailable.

### Global CSS (`app/globals.css`)

```css
input, textarea, select { font-size: 16px !important; }
html { height: -webkit-fill-available; }
body { min-height: 100dvh; min-height: -webkit-fill-available; overscroll-behavior: none; }
* { -webkit-tap-highlight-color: transparent; }
.chat-container { -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
.bottom-bar { padding-bottom: env(safe-area-inset-bottom, 0px); }
button, [role="button"], .phase-indicator { -webkit-user-select: none; user-select: none; }
.session-page { overscroll-behavior-y: contain; }

/* Phase transitions */
.phase-enter { opacity: 0; transform: translateY(8px); }
.phase-active { opacity: 1; transform: translateY(0); transition: all 300ms ease-out; }
.phase-exit { opacity: 0; transition: opacity 200ms ease-in; }

/* Phase dot pulse */
@keyframes phase-dot-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}

/* Confetti */
@keyframes confetti-drift {
  0% { opacity: 1; transform: translateY(0) translateX(var(--x, 0px)) scale(1); }
  100% { opacity: 0; transform: translateY(-80px) translateX(var(--x, 0px)) scale(0.5); }
}

/* Completion pop */
@keyframes completion-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}
```

---

## Home Page (`app/page.tsx`)

**Layout — warm, soft, inviting. Like opening Tiimo.**

```
┌──────────────────────────────┐
│                              │
│   the edge                   │  ← Lowercase, text-3xl font-bold, warm plum
│   Day 7 · 🔥 7-day streak   │  ← text-base text-secondary
│                              │
│     ┌──────────────────┐     │
│     │      3.4         │     │  ← Average of LATEST session's 5 scores
│     │    ◯ ring ◯      │     │     SVG circle, accent purple stroke
│     │                  │     │     Cream background inside ring
│     └──────────────────┘     │
│                              │
│   ● 3  ● 2  ● 4  ● 3  ● 3  │  ← Individual scores from LATEST session
│   TA   TW   FC   ER   SO    │     Each circle coloured by score level
│                              │
│  ┌──────────────────────┐    │
│  │   Begin session  →   │    │  ← Solid purple button, rounded-2xl
│  └──────────────────────┘    │
│                              │
└──────────────────────────────┘
```

- "the edge" in **lowercase** `text-3xl font-bold text-primary` (Tiimo uses lowercase brand text)
- "Day N · 🔥 N-day streak" on same line, `text-base text-secondary`
- **Progress ring:** SVG circle (160x160), stroke = accent purple (#6C63FF), stroke-width 8, rounded linecap. Fill percentage = average of the LATEST session's 5 dimension scores (e.g., 3.4/5 = 68%). Large number centred inside: `text-4xl font-bold text-primary`. Background inside ring: `fill: #FAF9F6`. Use `recentScores[recentScores.length - 1]` from the status API.
- **Score circles row:** 5 small circles (40x40), each containing the LATEST session's dimension score in `text-sm font-bold text-white`. Circle background coloured by score: soft green (#6BC9A0) for 4-5, golden (#F5C563) for 3, soft coral (#E88B8B) for 1-2. Labels below in `text-xs text-secondary`: TA, TW, FC, ER, SO.
- **Empty state (Day 1):** Ring at 0% with `–` inside. Score circles show `–` on soft grey backgrounds. Text: "🌱 Your first session" instead of streak. Warm, inviting, zero pressure.
- **Begin session** button: `w-full py-4 rounded-2xl text-lg font-semibold text-white bg-[#6C63FF]`. Active: `active:scale-[0.97]`. No gradient.
- **Offline state:** Track `navigator.onLine`. Cache status data to `localStorage['edge-status-cache']`. Show cached scores when offline. Disable button with "Offline" label, `opacity-40`.
- API: GET `/api/status` returns `{ dayNumber, lastEntry, recentScores[], streakCount }`

---

## Session Page (`app/session/page.tsx`)

### Session Initialization Sequence

When the session page mounts:

1. Check `localStorage['edge-session-state']` for a saved session. If found and < 30 minutes old: restore all state, show "Session restored" banner for 3 seconds (`bg-[#EEEDFF] text-[#6C63FF] text-sm h-7`), resume from saved phase.
2. If no saved session (or expired): call GET `/api/status` to get `dayNumber` and `lastEntry`. Store `lastEntry.mission` as `lastMission` (needed for check-in later). Set `checkinNeeded = dayNumber > 1 && lastEntry !== null`.
3. Call POST `/api/lesson` to fetch concept and lesson content.
4. Set phase to `"lesson"`, begin rendering.

### Session Persistence (localStorage)

- **Key:** `edge-session-state`
- **Save trigger:** After each phase transition and after each roleplay message (debounced). Do NOT save during loading states.
- **Serialized fields:** `phase`, `concept`, `character`, `scenarioContext`, `lessonContent`, `roleplayTranscript`, `turnCount`, `completedPhases`, `commandsUsed`, `checkinOutcome`, `checkinNeeded`, `checkinDone`, `lastMission`, `dayNumber`, `scores`, `debriefContent`, `behavioralWeaknessSummary`, `keyMoment`, `mission`, `rationale`, `timestamp` (Date.now()).
- **Restore logic:** Parse JSON, check `timestamp` is within 30 minutes. If valid, restore all fields. If expired, `localStorage.removeItem('edge-session-state')` and start fresh.
- **Clear trigger:** Call `localStorage.removeItem('edge-session-state')` in `completeSession()`.

### Phase Transition Table

Explicit state machine for phase advancement:

```
lesson      → (user taps "Ready to practice") → retrieval
retrieval   → (response contains "let's go", case-insensitive, after 1.5s pause) → roleplay
roleplay    → (user taps /done or /skip) → debrief
debrief     → (user taps "Continue"):
               if checkinNeeded && !checkinDone → show check-in card within deploy
               else → mission
checkin     → (user completes or skips check-in) → mission
mission     → (user taps "Session complete") → confetti → home (after 2s)
```

`/reset` during roleplay: clear transcript, reset turnCount, re-call `/api/roleplay` with null message. Log "reset" in commandsUsed. Show "Scenario reset" notice.

`/done` during roleplay: advance to debrief. Log "done" in commandsUsed. This signals a natural conclusion (distinct from `/skip` which signals early bailout). Both advance to debrief identically in V0.

`/skip` during roleplay: advance to debrief. Log "skip" in commandsUsed. Debrief analyses whatever transcript exists.

### Phase Indicator (sticky top)

```
🔵 Learn   ○ Sim   ○ Brief   ○ Deploy
────────────────────────────────────────  ← thin warm border, not gradient
```

4 dots (from VISUAL_PHASES constant). Each dot uses its own phase colour: Learn = sky blue (#B8D4E3), Simulate = coral (#F2C4C4), Debrief = lavender (#C5B8E8), Deploy = mint (#B8E0C8). Dot diameter: 10px. Gap between dots: 8px.

Completed = filled with phase colour at 100% opacity. Current = filled with `animation: phase-dot-pulse 2s ease-in-out infinite`. Future = outlined (`border: 2px solid`) with phase colour at 30% opacity, no fill. Labels: `text-sm font-medium`. Separator: `border-b border-[#F0EDE8]`. Total height: ~48px. `position: sticky; top: 0; z-index: 50; background: #FAF9F6`.

The background of the entire session page subtly shifts to match the current phase tint colour. Learn phase: body bg is `#E8F2F8`. Simulate: `#FBE8E8`. Debrief: `#EDE8F5`. Deploy: `#E8F5ED`. Transition between backgrounds: `transition: background-color 500ms ease`.

### Session Flow

The session always opens directly into Phase 1 (Learn). No check-in, no accountability wall, no friction. The app opens → you're learning. The mission check-in happens at the END, right before the new mission, where it makes contextual sense.

Day 1: Learn → Retrieval → Simulate → Debrief → Mission
Day 2+: Learn → Retrieval → Simulate → Debrief → Check-in → Mission

### Phase 1 — Learn (on light blue background #E8F2F8)

**Loading state:** "Preparing today's lesson..." with pulsing dots, centred on blue tint background.

**Loaded state:** Lesson in a soft blue card: `bg-[#E8F2F8] rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`. Section headers (`## The Principle`, `## The Play`, `## The Counter`): `text-sm font-medium text-[#5B8BA8]` (muted blue, not uppercase) with no underline — whitespace separates sections. Body: `text-base leading-relaxed text-primary`. Source attributions: `text-sm italic text-secondary`.

Bottom: solid purple button "Ready to practice →", `bg-[#6C63FF] text-white rounded-2xl py-4 w-full font-semibold`.

### Retrieval Bridge (sub-step of Learn, still under Learn phase dot)

After "Ready to practice →": lesson card fades out (200ms), retrieval card fades in (300ms). Card: `bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`. Question centred: `text-lg font-medium text-primary`. Input below: `bg-[#E8F2F8] rounded-2xl py-3 px-4 text-base border-none`. Auto-focus. After LLM evaluation: display response for 1.5 seconds, then auto-advance to Simulate.

### Phase 2 — Simulate (Chat, on light pink background #FBE8E8)

**Loading state:** "Setting up scenario..." with pulsing dots, centred on pink tint background (while first roleplay message loads).

**Typing indicator:** Before each AI response stream begins, show a left-aligned bubble shape with 3 pulsing dots: `bg-white rounded-3xl rounded-tl-lg p-3 w-16 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`. Remove when first stream token arrives.

Character bubbles: left-aligned, `bg-white rounded-3xl rounded-tl-lg p-4 max-w-[85%] shadow-[0_2px_12px_rgba(0,0,0,0.04)]`. User bubbles: right-aligned, `bg-[#F2C4C4]/50 rounded-3xl rounded-tr-lg p-4 max-w-[85%]` (50% opacity coral tint — visible in daylight). Character name label above first message only: `text-xs font-medium text-[#D4908F]` (muted coral).

**Chat bubble spacing:** `gap-3` (12px) between messages from different senders. `gap-1` (4px) between consecutive messages from the same sender.

**Input bar** fixed to bottom above keyboard. `bg-white rounded-t-3xl shadow-[0_8px_24px_rgba(0,0,0,0.06)] p-3 bottom-bar`. Input field: `<textarea>` with `bg-[#FBE8E8] rounded-2xl py-3 px-4 text-base border-none resize-none` — auto-grow from 1 row to max 4 rows. Send button: `bg-[#6C63FF] rounded-full w-11 h-11 text-white` (accent purple circle, white arrow).

**Command row:** 4 icon buttons in a row below input, evenly spaced. Each is a soft-coloured circle (44x44px) with `aria-label`:
- 💡 Coach: `bg-[#FFF8E7]` (warm cream) circle, `aria-label="Coach"`
- 🔄 Reset: `bg-[#E8F2F8]` (soft blue) circle, `aria-label="Reset"`
- ⏭ Skip: `bg-[#F0EDE8]` (warm grey) circle, `aria-label="Skip"`
- ✓ Done: `bg-[#E8F5ED]` (soft mint) circle, `aria-label="Done"`
- Each: `rounded-full`, `active:scale-[0.93]` with 150ms transition. Emoji centred at `text-lg`.

**Streaming:** Token-by-token via ReadableStream/TextDecoder. Auto-scroll chat to bottom if user is within 100px of bottom. If user scrolled beyond 100px from bottom, show "↓ New" pill: `bg-[#6C63FF] text-white rounded-full px-3 py-1 text-xs shadow-[0_2px_12px_rgba(0,0,0,0.04)]` — tapping scrolls to bottom and dismisses pill. Auto-focus input after stream completes.

**Coach panel (💡):** Slides up from bottom (`transform: translateY(100%) → translateY(0), 300ms ease-out`). Half-sheet: `bg-[#FFF8E7] rounded-t-3xl shadow-[0_8px_24px_rgba(0,0,0,0.06)] p-6` (warm cream yellow). "Mentor" label in `text-sm font-medium text-[#C4A24E]` (muted gold). Advice content in `text-base text-primary`. Dismiss: tap backdrop overlay, tap ✕ button (`text-secondary`), or swipe down from drag handle area (top 32px bar only — content area scrolls freely, no conflict). Chat remains visible behind (top 50%).

**Turn counter:** `text-xs text-secondary` centred below phase indicator: `Turn 3 / ~8`. A "turn" = one user message + one AI response (an exchange pair). After 8 turns: a soft inline card `bg-white/70 rounded-2xl px-4 py-2 text-sm text-secondary text-center`: "You can continue or tap ✓ when ready."

**Network error during roleplay:** Show inline message in chat area: "Connection lost. Tap to retry." as a `bg-[#FFF8E7] rounded-2xl px-4 py-2 text-sm text-[#C4A24E]` card with tap handler. Preserve the user's typed message.

### Phase 3 — Debrief (on light lavender background #EDE8F5)

**Loading state:** "Analysing your performance..." with pulsing dots, centred on lavender tint background.

**Score card** at top: `bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`. Five score circles in a horizontal row with generous spacing (`gap-4`). Each circle: 48x48, `rounded-full`, contains score number in `text-lg font-bold text-white`. Circle background coloured by score level: soft green (#6BC9A0) for 4-5, golden (#F5C563) for 3, soft coral (#E88B8B) for 1-2. Dimension labels below each in `text-xs text-secondary`.

Strip `---SCORES---` and `---LEDGER---` (and everything after) from displayed text.

**Analysis card:** `bg-[#EDE8F5] rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]` (soft lavender). Dimension headers: `text-sm font-medium text-[#7B6BA8]` (muted purple). Body: `text-base leading-relaxed text-primary`. The Replay section: `bg-white/60 rounded-2xl p-4 mt-4` (lighter inset card within lavender).

**Continue button:** `sticky bottom-0 pb-safe bg-[#EDE8F5]/90 backdrop-blur-sm pt-3 pb-4`. Button: solid purple "Continue →" `bg-[#6C63FF] text-white rounded-2xl py-4 w-full font-semibold`. This ensures the button is always visible even on long debriefs.

### Phase 4 — Deploy (Mission Check-In + New Mission, on light mint background #E8F5ED)

This phase has two steps on Day 2+ (just the mission on Day 1).

**Step 1: Yesterday's Mission Check-In (Day 2+ only)**

After the debrief, before the new mission loads, a card appears:

```
┌──────────────────────────────┐
│                              │
│  Before your next mission... │  ← text-sm text-secondary
│                              │
│  Yesterday you were asked to:│
│  "Mirror the investor's      │
│   exact phrasing when..."    │  ← Mission text from lastMission
│                              │
│  How did it go?              │
│                              │
│  [✓ Nailed it] [~ Tried] [✕]│  ← Coloured pill buttons
│                              │
│  ┌──────────────────────┐    │  ← Expands after ✓ or ~
│  │ What happened?       │    │
│  └──────────────────────┘    │
│                              │
│  "That pause shifted the..." │  ← 1-sentence AI response
│                              │
└──────────────────────────────┘
```

- Card: `bg-white rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`
- Three outcome buttons as pill-shaped toggles, `rounded-full px-5 py-3 text-sm font-medium`:
  - "✓ Nailed it" → `completed`: `bg-[#B8E0C8] text-[#2D6A4F]` (soft green pill)
  - "~ Tried it" → `tried`: `bg-[#F5E6B8] text-[#8B7024]` (soft golden pill)
  - "✕ Skip" → `skipped`: `bg-[#F0EDE8] text-[#8E8C99]` (warm grey pill)
- Selected pill gets `ring-2 ring-[#6C63FF]` to indicate selection.
- If ✓ or ~: text input slides open with auto-focus. Input: `bg-[#E8F5ED] rounded-2xl py-3 px-4 text-base`. After submit: call check-in API, show 1-sentence response in `text-sm italic text-secondary`, then after 2 seconds transition to mission card (fade out check-in 300ms, fade in mission 300ms).
- If ✕: card fades directly to mission card (300ms). No delay, no judgment. Log `mission_outcome: "NOT EXECUTED"`.
- On Day 1: skip straight to mission card (no check-in).

**Step 2: New Mission**

**Loading state:** "Assigning your mission..." with pulsing dots if API call is in progress.

"Your mission" label in `text-sm font-medium text-[#5A9A7A]` (muted green). Mission card: `bg-[#E8F5ED] rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]` (soft mint). Mission text: `text-lg font-medium text-primary leading-relaxed`. Rationale: `text-sm text-secondary` below a thin `border-t border-[#B8E0C8]/30` divider.

"Session complete ✓" button: `bg-[#6BC9A0] text-white rounded-2xl py-4 w-full font-semibold` (soft green). Active: `active:scale-[0.97]`. On tap: show "Day N complete ✓" with `animation: completion-pop 400ms ease` and CSS confetti (10 dots at 8px, using the 4 phase colours, each with random `--x` between -30px and 30px, `animation: confetti-drift 1.2s ease-out forwards`). After 2 seconds: `router.push('/')`.

### Connectivity

- Roleplay network error: inline retry card in chat (see Simulate section). Keep typed message.
- Other phases: "Reconnecting..." banner below phase indicator (`bg-[#FFF8E7] text-[#C4A24E] text-sm h-7`). `fetchWithRetry(url, options, maxRetries=5, delay=3000)` helper — on each retry show "Reconnecting... (attempt N/5)" in error state. After 5 failures: "No connection. Your progress is saved — continue when back online."
- Offline home: cached scores from localStorage, disabled BEGIN SESSION button.

### Mobile Interaction

- All touch targets ≥ 44px
- `active:scale-[0.97]` on all buttons
- Haptic: `navigator.vibrate(10)` on send/command/phase advance (feature-check, no-op if unavailable)
- `overscroll-behavior-y: contain` on session page
- `window.visualViewport` resize listener — on keyboard open, scroll chat to bottom
- `100dvh` for main container height
- `env(safe-area-inset-bottom)` on bottom bar (`.bottom-bar` class)
- Auto-scroll chat to bottom on new messages (if within 100px of bottom)
- Auto-focus input after stream completes and on phase transitions with input
- `history.replaceState` after each phase advance to prevent back-button phase re-entry

### Privacy

Phase indicator: short labels ("Learn", "Sim", "Brief", "Deploy"). App name only on home page. Looks like a generic chat app during session.

---

# SECTION 7: INTEGRATION TESTING

Start `npm run dev` and test:

**Test 1 — Day 1 Flow:**
1. Home page: "the edge" (lowercase), "Day 1", "🌱 Your first session", progress ring at 0% with `–`, score circles show `–` on grey
2. Verify warm cream background (#FAF9F6), DM Sans font loaded, no white flash on load
3. "Begin session" button is solid purple (#6C63FF), rounded-2xl
4. Begin Session → loading state "Preparing today's lesson..." with pulsing dots on light blue → lesson appears in soft blue card → "Ready to practice" → retrieval bridge → auto-advance to Simulate
5. Loading state "Setting up scenario..." briefly → typing indicator (3 dots in bubble) → AI streams first message. Background is light pink (#FBE8E8). Chat bubbles: character white with shadow, user soft coral tint (visibly distinct). Send 3-4 messages. Typing indicator shows before each AI response.
6. Tap 💡 → coach panel slides up (300ms) with warm cream bg (#FFF8E7), "Mentor" label, advice appears, dismiss works (tap backdrop / ✕ / swipe handle), roleplay unaffected
7. Tap ✓ → loading state "Analysing your performance..." on lavender → debrief with coloured score circles (green/gold/coral) in white card, analysis in lavender card, Replay in inset white card, no raw ---SCORES--- visible. Continue button is sticky at bottom.
8. Continue → background shifts to light mint (#E8F5ED). Deploy phase: NO check-in on Day 1, goes straight to mission card in soft mint (may show "Assigning your mission..." loading briefly)
9. "Session complete ✓" → completion-pop animation + confetti dots (phase colours) → home after 2s
10. Home shows "Day 2", progress ring has data (LATEST session average), score circles have colours and individual scores, streak shows "🔥 1-day streak"
11. `data/ledger.json` has 1 complete entry

**Test 2 — Day 2 Flow (check-in at end of session):**
1. Begin → Learn phase immediately (no check-in at start) → loading state visible
2. Complete Learn, Retrieval, Simulate, Debrief as normal — loading states visible at each transition
3. After Debrief → Deploy phase: check-in card appears showing yesterday's mission (from `lastMission`)
4. Tap "✓ Nailed it" → pill gets ring highlight → input slides open → type response → submit → 1-sentence AI response
5. After 2s pause: check-in card fades, "Assigning your mission..." loading, new mission card appears
6. "Session Complete" → confetti → home
7. Ledger now has 2 entries. First entry's `mission_outcome` populated with qualitative response.

**Test 3 — Check-In Skip Flow (end of session):**
1. Day 3 → complete Learn through Debrief
2. Deploy phase: check-in card appears → tap "✕ Skip"
3. Card fades directly to new mission. No delay, no judgment.
4. Previous entry's `mission_outcome` = "NOT EXECUTED"

**Test 4 — Edge Cases:**
- 🔄 Reset during roleplay: transcript clears, "Scenario reset" notice, fresh opening, "reset" in commandsUsed
- ⏭ Skip after 2 turns: debrief handles thin transcript
- ✓ Done after 8 turns: debrief handles full transcript, "done" in commandsUsed
- API failure: error message with retry option — verify retry works
- Malformed debrief output: defaults to scores of 3
- Phase indicator accuracy at every phase (correct dot filled/pulsing/outlined)
- Phase transition animations (fade out 200ms → fade in 300ms)
- **Mid-session browser refresh:** Close tab during roleplay. Reopen `/session` within 30 minutes. Verify: "Session restored" banner shows, phase indicator correct, transcript preserved, can continue sending messages. After 30 minutes: session discarded, fresh start.

**Test 5 — Visual (Tiimo-style design check):**
- Warm cream background (#FAF9F6) consistent everywhere — no stark white or dark backgrounds
- Phase background colours shift correctly: blue (#E8F2F8 Learn), pink (#FBE8E8 Simulate), lavender (#EDE8F5 Debrief), mint (#E8F5ED Deploy) — transitions are smooth (500ms)
- Score circle colours correct: soft green 4-5, golden 3, soft coral 1-2
- All cards use `rounded-3xl` and soft shadows — no sharp corners anywhere
- DM Sans font renders correctly (not Inter, not system font)
- Coach panel uses warm cream (#FFF8E7), not purple/indigo
- Progress ring renders on home page (even with 1 data point)
- Check-in outcome pills use distinct soft colours (green, golden, grey)
- Confetti animation on completion uses phase colours
- No gradient buttons anywhere — all solid colours
- No uppercase labels — all labels use sentence case
- **Loading states visible** at every phase transition (not blank screens)
- Typing indicator visible before each roleplay AI response
- Readable at 375px width
- User bubbles (50% coral tint) visibly distinct from character bubbles (white) in bright viewport

Fix all issues found. Describe each change.

---

# SECTION 8: UX/UI AUDIT

**You are now an independent UX auditor. You did NOT build this app. Break it.**

Primary context: CEO standing on a morning train, one hand, phone, daylight, spotty connectivity.

**Part 1 — First Impression:** Visual impact — does it feel warm, friendly, and premium like Tiimo? Or does it feel generic/corporate? Check: DM Sans rendering, warm cream background, rounded-3xl cards, soft phase colours. Progress ring empty state (Day 1) — does "🌱 Your first session" feel inviting or empty? Time to action (scroll to find button?). Load performance (any flash from white to cream?). PWA integrity.

**Part 2 — Transitions:** Session opens directly into Learn with loading state (zero friction on launch?). Learn → Retrieval → Simulate triple transition (natural momentum or jarring?). Debrief → Check-in → Mission flow at end of session (does the check-in card feel like a natural handoff, not a gate?). Loading indicators during ALL API calls — are they contextual and reassuring? "Continue →" always visible on long debriefs (sticky bottom)? Completion animation satisfying?

**Part 3 — Roleplay (Critical):** First message tension. Typing indicator before stream. Streaming quality (token-by-token, smooth?). Input auto-focus. Textarea auto-grow. Command buttons (44px, feedback, correct behaviour, aria-labels). Coach panel (half-sheet, dismiss options, speed, no scroll conflict). Chat scroll (auto + "↓ New" pill at 100px threshold). Message distinction in daylight (50% coral tint vs white). Turn counter format.

**Part 4 — Mobile:**
- 4.1 Keyboard: input bar above keyboard, layout smooth on open/close
- 4.2 Touch: right-thumb reachability, 44px targets
- 4.3 Viewport: safe areas, 100dvh, PWA standalone
- 4.4 Connectivity: offline retry, slow 3G degradation, reconnect banner
- 4.5 Session persistence: resume within 30 min (verify with browser close/reopen), discard after
- 4.6 Daylight readability: user bubble (50% coral tint) vs character bubble (white) distinction in bright light, phase background colour shifts visible or too subtle, score circle colours distinguishable

**Part 5 — Design Quality (Tiimo-inspired):** Card consistency — ALL cards using `rounded-3xl`, `shadow-soft`, `p-6`? Any outliers with sharp corners or heavy shadows? Phase colour consistency — does every card in a phase use the correct tint background (blue/pink/lavender/mint)? Or are there white cards that break the colour language? NO gradients anywhere — check that all buttons are solid colour. NO uppercase labels — verify everything is sentence case. Typography hierarchy — DM Sans rendering clean? Whitespace generous enough (Tiimo uses a LOT of space)? Accent purple (#6C63FF) used ONLY for interactive elements? Score circles correctly coloured? Phase background transition smooth (500ms) or jarring? Coach panel warm cream, not purple? Shadow-elevated used ONLY on input bar and coach panel? Any remnants of old design systems (indigo, gradients, Inter font, pentagon chart)?

**Part 6 — Integrity:** Swipe-back blocked (history.replaceState). Pull-to-refresh blocked (overscroll-behavior). Double-tap debounce. Ledger data complete after 2 sessions.

**Deliverable:** Issue log table (# | Part | Severity | Issue | Fix). Fix all Critical/Major immediately. List Minor as recommendations.

---

# SECTION 9: LEARNING DESIGN AUDIT

**You are an independent learning design specialist. PhD in educational psychology. You've designed training for military special forces and elite sales organisations.**

Read every prompt in `lib/prompts/`, `concepts.ts`, `characters.ts`, `ledger.ts`. Assess whether the implementation follows evidence-based learning science.

**Part 1 — Learning Architecture:**

1.1 **Bloom's Taxonomy:** Learn = Knowledge/Comprehension. Retrieval bridge = recall gate. Simulate = Application/Analysis. Debrief = Evaluation. Deploy = Synthesis. Verify each phase achieves its level.

1.2 **Ericsson's Deliberate Practice:** Well-defined task (does scenario state user's goal?). Immediate feedback (/coach on demand — sufficient?). Repetition (/reset available — but is it encouraged?). Progressive challenge (V0 is flat difficulty — what signals could drive adaptive difficulty in V1?).

1.3 **Spaced Repetition:** Daily 24-hour interval is good. But new concept daily with no revisiting = retention decay. Mission is one retrieval event — research suggests 3-5 needed. Note for V1: retrieval bridge could test concepts from 3 and 7 days ago alongside the new concept (interleaved retrieval). Interleaving via domain diversity — verify in `selectConcept()`.

1.4 **Kolb's Experiential Learning:** Current: Abstract Conceptualisation → Concrete Experience → Reflective Observation → Active Experimentation. Alternative "failure-first" order: Simulate first (fail without concept) → Learn (reveal concept) → Debrief → Deploy. Assess trade-off: more uncomfortable but potentially deeper learning.

**Part 2 — Prompt Quality:**

2.1 **Lesson:** Does it explain WHY (causal mechanism) not just WHAT? Are examples specific enough to be memorable 8 hours later? Does Counter teach both recognition AND neutralisation? Word count enforced (check for the "count your words" instruction)?

2.2 **Roleplay:** Character briefs sufficient for 8+ turn consistency? Difficulty calibrated (when to concede vs escalate)? Scenario designed so concept is genuinely useful? For Nonverbal Intelligence concepts: does the character include italicized action descriptions?

2.3 **Debrief:** Turn-level specificity demanded? Replay alternatives realistic (not idealised)? Scoring rubric anchored precisely enough for consistency? Hard constraint present ("at least one ≤3")?

2.4 **Mission:** Rate 3 generated missions on 1-5 specificity scale. Observable success indicators required? Risk calibrated (no relationship-damaging experiments)? Target dimension varies (70/30 weakest/near-strength)?

**Part 3 — Retention & Habit:**

3.1 **Habit Loop (Fogg/Clear):** Cue (notification system for V1?). Routine (genuinely 10 minutes?). Reward (session ending satisfying?).

3.2 **Variable Reward:** Concept unpredictability. Scenario variety. Score variability (does rubric allow full 1-5 range with hard constraint?).

3.3 **Check-In Design:** The check-in is positioned at the END of the session (after debrief, before new mission). Does this placement create enough psychological pull to report mission outcomes? The user has invested 9 minutes and the new mission is the reward on the other side — does this create a natural completion tendency (Zeigarnik effect)? Is the "✕ Skip" path truly frictionless? Is the transition from check-in card to new mission card smooth enough that it feels like one flow, not two separate interactions?

**Part 4 — Time Budget:**

| Phase | Budget | Estimated Actual | Over/Under |
|-------|--------|-----------------|------------|
| Learn + loading | 2 min | ~2.5 min (600 words + 3-5s API) | Slightly over |
| Retrieval | 15s | ~25s (read + type + evaluate) | Slightly over |
| Simulate + loading | 5 min | ~5 min (variable) | On target |
| Debrief + loading | 2 min | ~2.5 min (long analysis + 5-10s API) | Slightly over |
| Check-in + Deploy + loading | 45s | ~75s (pills + typing + 2 API calls) | Over |
| **Total** | **~10.5 min** | **~12 min** | ~1.5 min over |

Realistic sessions will run 11-13 minutes. The 10-minute target is aspirational but the overshoot is acceptable — the user will not be watching a clock.

**Deliverable:**

1. Assessment report with verdicts: ✅ PASS / ⚠️ IMPROVE / ❌ FAIL
2. Prioritised recommendations table: Rank | Change | Principle | Impact | Effort | Recommendation
3. Implement High Impact / Low Effort changes immediately. Describe High Impact / High Effort changes for V1.

---

*END OF SPECIFICATION — The Edge Master Build Prompt v2*

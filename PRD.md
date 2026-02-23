# THE EDGE
## AI-Powered Influence Mastery System
### Product Requirements Document — v0.3 (Final)

**Version:** 0.3 (V0 — Personal Prototype) — Approved for Development
**Author:** Tom Fairey, CRO — UnlikelyAI
**Date:** February 2026
**Classification:** Confidential

---

### Changelog

| Version | Change | Section | Summary |
|---------|--------|---------|---------|
| v0.2 | Nuance Ledger | 4.3, 4.4 | Replaced flat JSON with structured ledger containing AI-generated `behavioral_weakness_summary`. |
| v0.2 | Parallel /coach | 3.3, 4.2, 8.2 | Isolated `/coach` into separate Haiku 4.5 endpoint. Eliminates persona-switching latency. |
| v0.2 | Qualitative Mission Extraction | 3.5, 7.1 | Replaced binary self-report with qualitative extraction of observable reactions. |
| v0.2 | Bailout Commands | 3.3 | Added `/reset` and `/skip` for degenerate roleplay states. |
| v0.2 | Progression Visualisation | 5.1 | Promoted competency score display to P0. |
| **v0.3** | **Phase 0: The Accountability Gate** | **3.1, 3.6** | **Added mandatory mission accountability check before new content unlocks. Operant conditioning friction.** |
| **v0.3** | **Nuance Ledger Prompt Serialisation** | **4.4** | **Backend serialises ledger to clean markdown before injection. Eliminates token waste and formatting noise.** |
| **v0.3** | **Cold Start Hallucination Guard** | **3.4, 4.2** | **Conditional debrief instruction: no longitudinal pattern analysis until Day 4 (≥3 ledger entries).** |

---

## 1. Executive Summary

### 1.1 Elevator Pitch

The Edge is a daily AI-powered training system that builds elite-level influence, persuasion, and leadership skills through a 10-minute loop of micro-learning, immersive roleplay simulation, mentor debrief, and real-world mission deployment. It is the first product to combine the psychological canon of Cialdini, Greene, Voss, Carnegie, Kahneman, and Chase Hughes with an adaptive AI engine that simulates the user's actual professional world.

### 1.2 The Problem

High-performance professionals develop influence skills through decades of trial, error, and expensive executive coaching. The knowledge exists in books, but the practice environment does not. There is no safe space to rehearse a high-stakes negotiation, practise reading coercive techniques in real time, or stress-test a leadership approach before deploying it in a board meeting. The gap between knowing and doing is the most expensive gap in any career.

### 1.3 The Vision

To create the world's most effective influence training system — one that treats behavioural psychology, power dynamics, and persuasion as trainable skills with measurable progression, not innate talent. The Edge treats influence the way Duolingo treats language: daily practice, spaced repetition, progressive difficulty, and real-world application.

### 1.4 V0 Scope

V0 is a personal web application built exclusively for a single user (Tom Fairey, CRO at UnlikelyAI) to validate the core loop mechanic. The user's professional context is hardcoded into the system. Success criteria: 30 consecutive days of daily usage and subjective evidence of behavioural change in live professional situations. If validated, V0 informs the architecture of a commercial product.

---

## 2. Target Psychographics & Personas

### 2.1 V0 Primary User: Tom Fairey

The V0 user is the product's architect and sole tester. All personalisation is calibrated to this profile.

**Professional Context:**

- Chief Revenue Officer at UnlikelyAI (neurosymbolic AI, £25M raised, 35+ staff)
- Leading Series A fundraise targeting £35M at £40M pre-money valuation, April 2026
- Enterprise sales into tier-1 UK banks: Lloyds Banking Group, NatWest, Barclays
- Managing strategic partnerships with Accenture, Kyndryl, BCG, KPMG
- Advisory board roles at Flexa, Dressipi, Zensai, Memgraph
- Previous founding CRO at Quantexa (scaled 1 to 100+ globally)
- Author of "How Not To F*ck Up Your Startup" (Hachette), former host of The Back Yourself Show

**Psychological Profile:**

High agency, competitive, intellectually curious, time-poor. Values mastery over credentials. Comfortable with discomfort and direct feedback. Reads Greene, Cialdini, and Voss for function, not entertainment. Seeks edge, not reassurance.

### 2.2 Future Commercial Persona (Post-V0)

For reference only. The commercial product would target senior professionals (VP+ / founder / C-suite) in high-stakes environments: enterprise sales, M&A, fundraising, political advisory, legal negotiation, and executive leadership. Typical profile: 30–50, income £100k+, already reads in this domain, frustrated by the gap between theory and practice. Likely male-skewed initially due to category affinity, but the product should be designed gender-neutral.

---

## 3. The Core Loop & User Journeys

### 3.1 The Daily Architecture (5 Phases, ~10 Minutes)

Every session follows a five-phase loop. Phase 0 is an accountability gate that appears from Day 2 onward. The remaining four phases have strict time budgets to enforce the 10-minute discipline. The loop moves the user from accountability to knowledge to practice to deployment within a single session.

| Phase | Time | Description | Output |
|-------|------|-------------|--------|
| **0. The Gate** | 1 min | (Day 2+ only) User must account for yesterday's mission before new content unlocks. System asks for qualitative outcome — the specific observable reaction of the other person. If the mission was not executed, the user must explicitly acknowledge it. Mentor delivers a 1-sentence response, and the ledger is updated. | Mission outcome logged. Accountability friction established. |
| **1. Learn** | 2 min | AI presents a single psychological concept from the canon. Includes the principle, a real-world example, and a counter-example showing the technique being used against someone. | User understands one new or reinforced concept and can recognise it in the wild. |
| **2. Simulate** | 5 min | Multi-turn AI roleplay. The AI plays a character relevant to the user's professional world. The scenario requires application of the concept just learned. User can invoke `/coach`, `/reset`, or `/skip`. | User practises deploying the technique in a realistic, high-stakes simulation with adaptive AI responses. |
| **3. Debrief** | 2 min | AI mentor analyses the roleplay transcript. Scores performance across 5 dimensions. From Day 4 onward, makes specific callbacks to behavioural patterns from the Nuance Ledger. Generates ledger entry. | Concrete, actionable feedback. Nuance Ledger updated. |
| **4. Deploy** | 1 min | AI generates a specific real-world micro-mission for the day, calibrated to the user's context and the day's concept. | A single concrete action to execute within 24 hours. |

### 3.2 Phase 0 — The Gate (Accountability Check) [v0.3]

**From Day 2 onward**, Phase 0 is the mandatory first interaction of every session. The user cannot access the day's lesson until they have accounted for the previous day's mission.

**The Prompt:**

The system presents yesterday's mission verbatim and asks:

> *"Yesterday's mission: [mission text]. What was the exact reaction of the other person when you executed this? What shifted in the interaction?"*

**Three possible outcomes:**

1. **Executed with outcome:** The user describes the observable reaction. The mentor delivers a 1-sentence acknowledgment that connects the outcome to the underlying principle (e.g., *"That pause forced them to fill the silence — you shifted the status dynamic. Good."*). The `mission_outcome` field in the Nuance Ledger is populated with the user's qualitative response.

2. **Executed but unclear result:** The user describes the attempt but can't articulate the reaction. The mentor provides a 1-sentence reframe (e.g., *"The technique was deployed. Next time, watch their eye contact and speech pace immediately after — that's where the shift shows."*). Logged as executed, outcome noted as observational gap.

3. **Not executed:** The user must explicitly state they did not complete the mission — the system does not accept silence or deflection. The mentor delivers a single, blunt sentence (e.g., *"Noted. The gap between knowing and doing is where most people live permanently. Let's make today different."*). Logged as `mission_outcome: "NOT EXECUTED"` in the Nuance Ledger.

**Why this matters:** This is operant conditioning. The friction of having to confess non-execution creates a psychological cost that makes skipping the mission more uncomfortable than doing it. Over 30 days, this builds the habit of treating missions as non-optional commitments rather than suggestions.

**Phase 0 is skipped on Day 1** (no prior mission exists).

### 3.3 Phase 1 — Learn (Micro-Lesson Engine)

**Content Taxonomy**

The lesson engine draws from a structured concept library spanning the following domains. Concepts are served with variety as a priority — the system avoids clustering in a single domain and ensures the user encounters breadth before depth.

1. **Influence & Persuasion:** Cialdini's 7 principles, pre-suasion, social proof engineering, authority signalling, commitment escalation.
2. **Power Dynamics:** Greene's 48 Laws, Laws of Human Nature, strategic concealment, court politics, reputation management.
3. **Negotiation:** Voss tactical empathy, calibrated questions, mirroring, labelling, accusation audits, Ackerman bargaining, BATNA manipulation.
4. **Behavioural Psychology & Cognitive Bias:** Kahneman's System 1/System 2, anchoring, framing, loss aversion, availability heuristic, sunk cost exploitation.
5. **Nonverbal Intelligence & Behavioural Profiling:** Chase Hughes' Ellipsis Model, baseline deviation detection, authority body language, microexpression recognition cues, interrogation frameworks.
6. **Rapport & Relationship Engineering:** Carnegie's principles, active listening mechanics, strategic vulnerability, reciprocity loops, trust acceleration.
7. **Dark Psychology & Coercive Technique Recognition:** Gaslighting patterns, DARVO, love-bombing in professional contexts, manufactured urgency, information asymmetry exploitation. Framed for recognition and defence.

**Lesson Structure**

Each micro-lesson follows a fixed three-part structure delivered in approximately 400–600 words, optimised for a 2-minute read at professional reading speed:

- **The Principle:** A concise explanation of the concept with attribution to source material.
- **The Play:** A vivid, specific real-world example showing the technique deployed effectively. Drawn from business, politics, intelligence, or historical contexts.
- **The Counter:** An example of the same technique being used against someone, showing how to recognise and neutralise it.

### 3.4 Phase 2 — Simulate (Roleplay Engine)

**Architecture**

The roleplay engine is the core differentiator. It creates a multi-turn conversational simulation where the AI plays a single character and the user must navigate a scenario that requires application of the day's concept. The AI character responds dynamically to the user's approach, escalating or conceding based on realistic behavioural logic.

**Character Archetypes**

The system draws from a library of archetypes, each with distinct communication styles, motivations, and pressure points. Characters are mapped to the user's professional context. Examples for V0:

- **The Sceptical Investor:** A Series A VC who has heard every pitch. Demands specificity, punishes vagueness, respects confidence.
- **The Political Stakeholder:** A senior banking executive who speaks in corporate hedges, has hidden agendas, and evaluates everything through procurement risk.
- **The Resistant Report:** An underperforming team member who deflects accountability, uses emotional appeals, and tests boundaries.
- **The Hostile Negotiator:** A counterparty in a commercial deal who uses high-pressure tactics, artificial deadlines, and deliberate information asymmetry.
- **The Alpha Peer:** A co-founder or board member who subtly undermines through frame control, conversational dominance, and strategic interruption.
- **The Consultancy Gatekeeper:** A partner at a tier-1 firm who needs to be convinced the partnership is worth their brand risk.

**Mid-Scenario Mentor Assist (Parallel Architecture)**

At any point during the roleplay, the user can type `/coach` to receive real-time tactical guidance. This is implemented as a **parallel, asynchronous API call** to a separate Haiku 4.5 endpoint loaded only with the Mentor system prompt and the current roleplay transcript. This architecture provides three critical benefits: the primary Sonnet 4.5 roleplay context window is never interrupted or polluted with mentor-mode outputs; Haiku's lower latency delivers coaching in under 1 second; and the roleplay character state is preserved perfectly because the roleplay model never sees the coaching exchange.

The frontend displays the `/coach` response in a visually distinct panel (different background colour, labelled "MENTOR") while the roleplay chat remains in place. The user then continues the roleplay as normal.

**Bailout Commands**

Two additional commands handle degenerate roleplay states:

- **`/reset`** — Restarts the current scenario with the same concept and character archetype but a fresh conversation. Use when the roleplay has entered a logic loop or unproductive dead end.
- **`/skip`** — Ends the roleplay immediately and advances to the Debrief phase. The debrief analyses whatever transcript exists, even if incomplete.

Both commands are logged in session data to track scenario failure rates and inform character/scenario tuning.

**Scenario Difficulty Progression**

Scenarios are tagged with a difficulty level from 1–5. V0 launches with a flat difficulty curve (random selection across levels) to test which levels produce the most engagement and learning. Future versions will implement adaptive difficulty based on debrief scores.

### 3.5 Phase 3 — Debrief (Mentor Analysis)

After the roleplay concludes (either by natural resolution, a 5-minute time limit, or a `/skip` command), the AI switches to mentor mode and delivers a structured debrief. The debrief analyses the full roleplay transcript and scores performance across the following dimensions:

1. **Technique Application:** Did the user deploy the day's concept? How effectively?
2. **Tactical Awareness:** Did the user recognise the AI character's tactics and adjust?
3. **Frame Control:** Who controlled the conversation? Did the user set or accept the frame?
4. **Emotional Regulation:** Did the user remain composed under pressure, or did the AI successfully provoke a reactive response?
5. **Strategic Outcome:** Did the user achieve their stated objective in the scenario?

The debrief concludes with a "Replay" section: 1–2 specific moments where the user could have made a different choice, with the exact alternative phrasing provided.

**Behavioural Pattern Callbacks (Nuance Ledger Integration)**

The debrief prompt is injected with the serialised Nuance Ledger summary (see Section 4.4). The mentor is instructed to identify recurring behavioural patterns and make specific callbacks to previous sessions. For example: *"On Day 4, when the VC pressured you, you defaulted to defensive justification. You did the exact same thing today. This is becoming a pattern — you retreat to data when you should be controlling the frame."*

**Cold Start Guard [v0.3]:** The debrief system prompt includes a conditional instruction: *"If the Nuance Ledger contains fewer than 3 entries, focus entirely on the current session's execution. Provide detailed, session-specific feedback. Do not attempt to identify longitudinal behavioural patterns or make cross-session comparisons — there is insufficient data and any pattern you infer will be unreliable."* From Day 4 onward (≥3 prior entries), the full pattern-matching instruction activates.

### 3.6 Phase 4 — Deploy (Real-World Mission)

The final phase generates a single, concrete micro-mission for the user to execute in a real professional interaction within 24 hours. Missions are calibrated to the user's known context and the day's concept. Examples:

- "In your next investor call, deploy the labelling technique within the first 5 minutes. Identify the investor's emotional state and name it explicitly."
- "In your next internal meeting, deliberately use a 4-second pause after someone finishes speaking before you respond. Observe the shift in room dynamics."
- "Identify one person in today's interactions who is using manufactured urgency. Name the technique internally and choose not to react to the pressure."

The mission includes a brief rationale explaining why this specific action reinforces the day's learning. The mission outcome is captured in Phase 0 of the following day's session (see Section 3.2).

---

## 4. AI Core & Prompt Architecture

### 4.1 Model Selection

V0 uses two models in a split architecture:

- **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) — Primary model for Phase 0 accountability, micro-lessons, roleplay, debrief, and mission generation.
- **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — Dedicated to the `/coach` mentor assist endpoint. Also serves as a latency fallback for roleplay if Sonnet response time exceeds 3 seconds.

All model calls route through the Anthropic API.

### 4.2 System Prompt Architecture

The application uses a layered prompt architecture. The roleplay and mentor assist contexts are independent API call chains.

**Layer 1: Persistent Context (Injected into all calls)**

This layer contains the hardcoded user profile and is prepended to every API call. It includes:

- Full professional context (role, company, fundraise status, client relationships, partnership targets)
- Communication style preferences (direct, no-nonsense, values candour)
- Serialised Nuance Ledger summary — last 7 entries in clean markdown (see Section 4.4)
- Concepts covered to date (for de-duplication)

**Layer 2: Phase-Specific Persona**

- **Gate Mode (Sonnet):** Accountability coach persona. Receives yesterday's mission and the user's response. Delivers a single sentence — acknowledgment, reframe, or reprimand. Tone: direct, no softening. Logs outcome to Nuance Ledger.
- **Lesson Mode (Sonnet):** Expert instructor persona. Tone: authoritative, vivid, concise. Must include source attribution. Must follow the three-part structure (Principle/Play/Counter).
- **Roleplay Mode (Sonnet):** In-character persona with defined personality, communication style, hidden motivations, and tactical behaviours. Never breaks character. Roleplay context window is never polluted with mentor-mode content.
- **Mentor Assist Mode (Haiku — separate endpoint):** Receives the current roleplay transcript. Provides 2–3 specific tactical moves in under 150 words. Stateless relative to the roleplay.
- **Debrief Mode (Sonnet):** Elite executive coach persona. Blunt, specific, no platitudes. Receives full roleplay transcript plus serialised Nuance Ledger summary. **Conditional instruction: if fewer than 3 ledger entries exist, focus on current session only — do not fabricate longitudinal patterns.** Generates `behavioral_weakness_summary` and `key_moment` for the Nuance Ledger.
- **Mission Mode (Sonnet):** Strategic advisor persona. Generates one actionable mission grounded in the user's known schedule and relationships. Precise, time-bound.

**Layer 3: Session State**

Injected per-session: today's selected concept, the character brief for the roleplay, the full roleplay transcript (for debrief), Phase 0 outcome (if applicable), and any `/reset` or `/skip` events.

### 4.3 Context Window Management

The primary constraint is keeping the full roleplay transcript within the context window for the debrief phase. With Claude Sonnet 4.5's 200k token context window, this is not a V0 concern. A typical session will consume approximately 3,000–6,000 tokens across all phases. The persistent user context layer (including serialised Nuance Ledger) adds approximately 1,000–1,500 tokens. Total per-session budget: under 8,000 tokens including system prompts.

The `/coach` endpoint (Haiku) operates on a separate, smaller context: Mentor system prompt (~500 tokens) + roleplay transcript to date (~1,000–3,000 tokens).

### 4.4 The Nuance Ledger

The Nuance Ledger is a structured JSON log that captures behavioural nuance, not just scores. At the end of each session, the Debrief phase generates additional outputs that are appended to the ledger.

**Ledger Entry Schema:**

```json
{
  "day": 4,
  "date": "2026-02-25",
  "concept": "Mirroring (Voss)",
  "domain": "Negotiation",
  "character": "The Sceptical Investor",
  "difficulty": 3,
  "scores": {
    "technique_application": 3,
    "tactical_awareness": 4,
    "frame_control": 2,
    "emotional_regulation": 4,
    "strategic_outcome": 3
  },
  "behavioral_weakness_summary": "Defaulted to defensive data-dumping when the investor challenged unit economics. Lost frame control by justifying rather than redirecting. This mirrors Day 2 pattern of retreating to safety when status is threatened.",
  "key_moment": "Turn 4: Investor said 'Your CAC looks unsustainable.' User responded with a 45-second data justification instead of a calibrated question or reframe.",
  "mission": "Use a calibrated 'How' question when challenged on a metric in tomorrow's board prep.",
  "mission_outcome": "Asked 'How would you suggest we frame this for investors who focus on CAC?' — CFO paused, then started problem-solving with me instead of interrogating.",
  "commands_used": [],
  "session_completed": true
}
```

**Prompt Serialisation [v0.3]**

The raw JSON schema is **never passed directly to the LLM**. The backend includes a serialisation function that extracts only the fields relevant to coaching context and compiles them into a clean markdown string. This eliminates token waste from structural formatting, field names, and integer noise.

**Serialisation function output example (injected into Layer 1):**

```markdown
## Recent Session History (Last 7 Days)

- **Day 4 — Mirroring (Voss):** Defaulted to defensive data-dumping when
  challenged on unit economics. Lost frame control by justifying rather than
  redirecting. Mirrors Day 2 pattern of retreating to safety when status is
  threatened. | Mission: Used calibrated 'How' question with CFO — CFO shifted
  from interrogating to problem-solving.

- **Day 3 — Strategic Silence (Greene):** Struggled to maintain silence past
  2 seconds under direct questioning. Filled gaps with qualifiers that
  undermined authority positioning. | Mission: NOT EXECUTED.

- **Day 2 — Anchoring (Kahneman):** Successfully set a high anchor in the
  pricing discussion but abandoned the frame when pushback came. Pattern:
  strong opening, weak hold. | Mission: Anchored the meeting agenda before
  the client could — client followed the structure without pushback.
```

**Fields extracted per entry:** `day`, `concept`, `behavioral_weakness_summary`, `mission_outcome` (condensed).

**Fields excluded from prompt injection:** `date`, `character`, `difficulty`, `scores` (individual integers), `key_moment`, `commands_used`, `session_completed`. These are retained in the JSON file for dashboard rendering and analytics but do not need to consume prompt tokens.

This serialisation reduces the prompt footprint of 7 ledger entries from approximately 1,400 tokens (raw JSON) to approximately 500 tokens (clean markdown), while preserving all the behavioural nuance the debrief engine needs for pattern callbacks.

### 4.5 RAG Implementation (Deferred — Commercial Version)

In the commercial product, a vector database (Pinecone or Weaviate) will store the user's full session history and Nuance Ledger, enabling semantic retrieval of relevant past performance when generating scenarios and debriefs. V0 uses the Nuance Ledger JSON file as a stand-in. The RAG architecture will be specified in a separate technical design document if V0 validates.

### 4.6 Prompt Injection Mitigation

V0 has minimal prompt injection risk because the only user is the developer. For the commercial version, the roleplay input field is the primary attack surface. Mitigations will include: input sanitisation, system prompt instruction hierarchy enforcement, and a classifier layer that flags attempts to extract system prompts or alter persona behaviour. P0 concern for commercialisation, deferred for V0.

---

## 5. Functional Requirements

### 5.1 P0 — Must Have for V0 Launch

These features constitute the minimum viable daily loop. Without any one of these, the core mechanic cannot be tested.

| Priority | Feature | Complexity | Rationale |
|----------|---------|------------|-----------|
| **P0** | Daily session launcher — single entry point that initiates the 5-phase loop | Low | Core UX entry point |
| **P0** | Phase 0: The Gate — mandatory mission accountability check (Day 2+) | Low | Operant conditioning; mission execution driver |
| **P0** | Micro-lesson engine — generates concept lesson from taxonomy | Medium | Phase 1 of loop |
| **P0** | Roleplay engine — multi-turn chat with character persona | High | Phase 2 — core product |
| **P0** | `/coach` command — parallel Haiku endpoint for mentor assist | Medium | Key differentiator, latency-safe |
| **P0** | `/reset` and `/skip` bailout commands | Low | Handles degenerate scenarios |
| **P0** | Debrief engine — transcript analysis with scoring, cold start guard, and Nuance Ledger generation | Medium | Phase 3 of loop |
| **P0** | Mission generator — context-aware daily mission | Low | Phase 4 of loop |
| **P0** | Nuance Ledger — structured JSON persistence with behavioral summaries | Low | Longitudinal coaching memory |
| **P0** | Nuance Ledger serialisation — backend transforms JSON to clean markdown for prompt injection | Low | Token efficiency, prompt quality |
| **P0** | Concept tracking — prevents repeat concepts within 30-day window | Low | Ensures breadth |
| **P0** | Competency score display — visual output of 5-dimension scores with 7-day trend | Low | Loss-aversion retention trigger |

### 5.2 P1 — High Value, Post-Launch

| Priority | Feature | Complexity | Rationale |
|----------|---------|------------|-----------|
| **P1** | Progressive difficulty — adapts scenario difficulty based on debrief scores | Medium | Retention driver |
| **P1** | Concept spaced repetition — resurfaces poorly-scored concepts | Medium | Learning optimisation |
| **P1** | Session streak tracker — visual streak counter | Low | Habit formation |
| **P1** | Expanded debrief history dashboard — full historical view with filtering | Medium | Deep progress visibility |

### 5.3 P2 — Commercial Version Features

| Priority | Feature | Complexity | Rationale |
|----------|---------|------------|-----------|
| **P2** | User onboarding flow — 5-minute intake (role, goals, context) | Medium | Multi-user support |
| **P2** | RAG-based user memory — vector DB for full Nuance Ledger retrieval | High | Scale persistence |
| **P2** | Multi-party roleplay — simulated group dynamics | Very High | Advanced scenarios |
| **P2** | Ethical guardrails layer — content policy enforcement for app store | High | Distribution requirement |
| **P2** | Authentication & user management | Medium | Multi-user support |
| **P2** | Subscription billing integration | Medium | Monetisation |
| **P2** | Mobile-responsive PWA or native app | High | Distribution |

---

## 6. Ethical Guardrails & Abuse Prevention

### 6.1 V0 Position

V0 is a single-user personal tool with no public distribution. Ethical guardrails are not implemented in V0. The content library includes the full spectrum of psychological techniques, including coercive and manipulative patterns, framed through a recognition and defence lens. The user accepts full responsibility for application.

### 6.2 Commercialisation Requirements — The Dojo Framework

The guiding metaphor: a martial arts school teaches lethal techniques within a structured environment with rules. The app teaches the full spectrum of influence — including dark psychology — within a framework that emphasises recognition, defence, and ethical application.

1. **Content Framing:** All dark psychology content is presented through a dual lens: "How this works" and "How to detect and defend against this." The system never coaches a user to deploy coercive techniques against a specific named individual.
2. **Scenario Boundaries:** The roleplay engine will not generate scenarios involving: manipulation of vulnerable individuals, romantic/sexual manipulation, scenarios explicitly designed to cause psychological harm, or instructions targeting specific real people by name (other than the user themselves).
3. **Classifier Layer:** A lightweight intent classifier on user inputs within roleplay detects requests that cross from influence into abuse, and redirects to the recognition/defence framing.
4. **Terms of Service:** Clear user agreement that the tool is for professional development and self-defence, and that the user bears responsibility for ethical application.

---

## 7. Telemetry & Psychological Progression Metrics

### 7.1 V0 Success Criteria

The V0 validation period is 30 days.

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Daily completion rate | 26 of 30 days (87%) | Session log timestamps |
| Session completion rate | 90%+ sessions complete all 5 phases | Phase completion flags |
| Roleplay depth | Average 6+ exchanges per roleplay | Turn count per session |
| Debrief score trend | Positive trend over 30-day window | 5-dimension score average from Nuance Ledger |
| Mission execution quality | 60%+ missions produce qualitative outcome descriptions with specific observable reactions | Nuance Ledger `mission_outcome` field richness |
| Phase 0 accountability rate | < 15% of sessions log "NOT EXECUTED" for mission outcome | Nuance Ledger mission_outcome field |
| Behavioural pattern identification | Mentor identifies 3+ recurring patterns by Day 14 | Nuance Ledger `behavioral_weakness_summary` analysis |
| Subjective value | User reports behavioural change in 3+ real situations | Qualitative self-assessment |
| Bailout rate | < 20% of sessions use `/skip` or `/reset` | Command usage logs |

### 7.2 Skill Progression Model

The system tracks cumulative skill development across five competency dimensions. Each dimension is scored 1–5 per debrief and tracked over time. A simple visual display renders after each debrief and is accessible from the session launcher.

1. **Technique Repertoire:** Breadth of concepts the user can recognise and deploy.
2. **Tactical Flexibility:** Ability to adapt approach mid-conversation when initial strategy fails.
3. **Frame Dominance:** Consistency in setting and maintaining conversational frames under pressure.
4. **Emotional Composure:** Ability to remain strategic rather than reactive when provoked.
5. **Strategic Outcome Achievement:** Rate at which the user achieves their stated objective in simulations.

The visual display shows current scores, 7-day rolling average, and trend direction (↑ ↓ →) for each dimension.

### 7.3 Commercial Metrics (Post-V0)

For the commercial version: DAU/MAU ratio (target: 40%+), D1/D7/D30 retention, session frequency, time-to-first-value, NPS, churn rate, and conversion rate from free to paid tiers.

---

## 8. Technical Constraints & Known Risks

### 8.1 Technical Stack (V0)

- **Frontend:** Next.js or lightweight SPA (React). Minimal UI — the product is a conversation. The `/coach` response renders in a visually distinct mentor panel. Phase 0 renders as a distinct accountability prompt before the main loop.
- **Backend:** Node.js API routes or lightweight Express server. Handles prompt assembly, Nuance Ledger read/write/serialisation, and session orchestration.
- **LLM:** Anthropic API — Claude Sonnet 4.5 (primary), Claude Haiku 4.5 (parallel `/coach` endpoint and latency fallback).
- **Persistence:** Nuance Ledger as structured JSON file. No database in V0.
- **Hosting:** Vercel (frontend) + serverless functions, or a single VPS. Minimal infrastructure.

### 8.2 Latency Budget

| Phase | Model | Target Latency | Notes |
|-------|-------|---------------|-------|
| Phase 0: The Gate | Sonnet | < 2s | Single sentence response. Streaming optional. |
| Phase 1: Micro-lesson | Sonnet | < 3s | Can be pre-generated or cached. |
| Phase 2: Roleplay turn | Sonnet | < 2s | **Critical path.** Streaming mandatory. |
| Phase 2: `/coach` assist | Haiku (parallel) | < 1s | Separate endpoint. Does not block roleplay. |
| Phase 3: Debrief | Sonnet | < 5s | Acceptable — user expects analysis time. |
| Phase 4: Mission | Sonnet | < 2s | Short output. |

**Latency Fallback:** If Sonnet roleplay response time exceeds 3 seconds on two consecutive turns, the system falls back to Haiku for the remainder of the roleplay with a brief UI notification.

### 8.3 Cost Estimate (V0)

At one session per day for a single user:

| Phase | Estimated Tokens | Cost/Session |
|-------|-----------------|--------------|
| Phase 0: Gate | ~100 output | ~$0.0003 |
| Phase 1: Micro-lesson | ~500 output | ~$0.0015 |
| Phase 2: Roleplay (8 turns) | ~4,000 cumulative | ~$0.02 |
| Phase 2: /coach (1 call avg) | ~200 output (Haiku) | ~$0.0002 |
| Phase 3: Debrief + ledger | ~1,000 output | ~$0.006 |
| Phase 4: Mission | ~200 output | ~$0.001 |
| **Total** | | **~$0.03/session, ~$0.90/month** |

### 8.4 Known Risks & Mitigations

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Roleplay feels generic or predictable after 10 sessions | High | Medium | Expand character library, scenario mutations, randomised personality parameters |
| AI breaks character during roleplay | Medium | Medium | Strong system prompt constraints, few-shot examples, temperature tuning. `/coach` isolation eliminates persona contamination. |
| Debrief scoring inconsistent or arbitrary | Medium | Medium | Rubric-anchored scoring prompts with explicit criteria and example scores |
| Debrief hallucinates patterns on Days 1–3 | Medium | High | Cold start guard: no longitudinal analysis until ≥3 ledger entries (Day 4) |
| User abandons after initial novelty (Day 7–14) | High | High | Phase 0 accountability friction, Nuance Ledger callbacks, competency visualisation, mission tracking |
| Roleplay enters degenerate state | Medium | Medium | `/reset` and `/skip` commands. Bailout rate tracked as scenario quality metric. |
| Nuance Ledger summaries drift or become generic | Medium | Low | Debrief prompt requires specific turn references. Serialised format focuses on behavioural content. |
| Prompt token bloat from Nuance Ledger injection | Low | Low | Serialisation reduces 7 entries from ~1,400 to ~500 tokens. Only 3 fields extracted per entry. |
| Latency spikes degrade roleplay | Medium | Low | Streaming responses, Haiku fallback after 2 consecutive >3s turns |
| Concept library exhausted | Medium | Low | 200+ concepts across 7 domains. At 1/day, ~7 months minimum. |

---

## Appendix A: Concept Canon — Source Library

**Primary Sources:**

- **Robert Cialdini** — Influence: The Psychology of Persuasion; Pre-Suasion
- **Robert Greene** — The 48 Laws of Power; The Laws of Human Nature; The Art of Seduction; The 33 Strategies of War
- **Chris Voss** — Never Split the Difference
- **Dale Carnegie** — How to Win Friends and Influence People
- **Daniel Kahneman** — Thinking, Fast and Slow
- **Chase Hughes** — The Ellipsis Manual; The Behavioural Table of Elements

**Secondary Sources:**

- **Joe Navarro** — What Every BODY Is Saying (nonverbal intelligence, FBI interrogation)
- **Robin Dreeke** — The Code of Trust (FBI Behavioral Analysis Program, rapport building)
- **Robert Sapolsky** — Behave (neurobiological basis of decision-making under stress)
- **Nassim Nicholas Taleb** — Antifragile; The Black Swan (asymmetric risk, skin in the game)
- **Keith Johnstone** — Impro (status transactions, spontaneous interaction)
- **Philip Zimbardo** — The Lucifer Effect (authority dynamics, situational behaviour)
- **Gavin de Becker** — The Gift of Fear (threat recognition, intuitive threat assessment)

---

## Appendix B: Nuance Ledger — Full Schema Reference

```json
{
  "day": "integer — session number",
  "date": "string — ISO date",
  "concept": "string — concept name with attribution",
  "domain": "string — one of 7 content taxonomy domains",
  "character": "string — archetype name",
  "difficulty": "integer — 1-5",
  "scores": {
    "technique_application": "integer — 1-5",
    "tactical_awareness": "integer — 1-5",
    "frame_control": "integer — 1-5",
    "emotional_regulation": "integer — 1-5",
    "strategic_outcome": "integer — 1-5"
  },
  "behavioral_weakness_summary": "string — 2 sentences, AI-generated, specific with cross-session pattern references (from Day 4+)",
  "key_moment": "string — single most important turn, what happened vs. what should have happened",
  "mission": "string — the deployed real-world mission",
  "mission_outcome": "string — qualitative extraction from Phase 0 of next session, or 'NOT EXECUTED'",
  "commands_used": "array — /coach, /reset, /skip commands invoked",
  "session_completed": "boolean — did the user complete all phases"
}
```

**Prompt serialisation extracts only:** `day`, `concept`, `behavioral_weakness_summary`, `mission_outcome` → compiled to clean markdown bullet list (~500 tokens for 7 entries).

---

## Appendix C: Phase Flow Diagram

```
Day 1:                    Day 2+:
                          ┌─────────────────────┐
                          │  PHASE 0: THE GATE   │
                          │  Mission accountability│
                          │  → Log to Ledger      │
                          └──────────┬────────────┘
                                     │
┌─────────────────────┐              │
│  PHASE 1: LEARN     │◄─────────────┘
│  Micro-lesson        │
│  (Principle/Play/    │
│   Counter)           │
└──────────┬──────────┘
           │
┌──────────▼──────────┐     ┌──────────────────┐
│  PHASE 2: SIMULATE  │────▶│  /coach (Haiku)  │
│  Multi-turn roleplay │◄────│  Parallel endpoint│
│  (Sonnet)            │     └──────────────────┘
│                      │
│  /reset → restart    │
│  /skip  → debrief    │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  PHASE 3: DEBRIEF   │
│  Transcript analysis │
│  5-dimension scoring │
│  Nuance Ledger write │
│  (Cold start guard   │
│   if < 3 entries)    │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  PHASE 4: DEPLOY    │
│  Real-world mission  │
│  → Stored for        │
│    tomorrow's Gate   │
└─────────────────────┘
```

---

*END OF DOCUMENT — The Edge PRD v0.3 (Final) — Approved for Development — Confidential*

# THE EDGE — Changelog: v1 → v2

Every change made to the master build prompt, grouped by audit pass.

---

## Pass 1: Structural Integrity

- [🔴 FIX] Section 3, PHASE_CONFIG: Added `retrieval` config entry (`{ model: MODELS.PRIMARY, max_tokens: 120, temperature: 0.6 }`) — was borrowing `checkin` config implicitly
- [🔴 FIX] Section 1, Scaffolding: Added `data/` to `.gitignore` instruction — personal session data was not excluded from version control
- [🔴 FIX] Section 6, Session Page: Added full session initialization sequence — was completely absent, Claude Code would have guessed
- [🔴 FIX] Section 5, Route 1 + Section 6, Home Page: Clarified that progress ring shows average of LATEST session scores, score circles show individual LATEST scores, not rolling averages
- [🟡 FIX] Section 2, types.ts: Added missing fields to SessionState — `turnCount`, `completedPhases`, `behavioralWeaknessSummary`, `keyMoment`, `scenarioContext`, `retrievalQuestion`, `retrievalResponse`, `lastMission`, `checkinNeeded`
- [🟡 FIX] Section 2, types.ts: Added explicit phase display name mapping constant `PHASE_DISPLAY`
- [🟡 FIX] Section 5, Route 4: Specified "Let's go" detection as case-insensitive: `.toLowerCase().includes("let's go")`
- [🟡 FIX] Section 5, Route 7: Added explicit regex patterns for `---SCORES---` and `---LEDGER---` parsing
- [🟡 FIX] Section 6, Session Page: Added initialization step — call `/api/status` on mount to get `dayNumber` and `lastEntry.mission` for later check-in
- [🟡 FIX] Section 6, Session Page: Added localStorage persistence specification — key name, serialized fields, timestamp, restore logic, clear trigger
- [🟡 FIX] Section 5, All Routes: Added error handling specification — each route now has explicit failure behavior
- [🟡 FIX] Section 5, Route 1: Specified day numbering as sequential (ledger count + 1), not calendar-based

## Pass 2: System Prompt Quality

- [🔴 FIX] Section 4, roleplay.ts: Defined `/done` command explicitly — ends roleplay naturally, advances to debrief, logged as "done" in commandsUsed (distinct from `/skip` which implies early bailout)
- [🔴 FIX] Section 4, debrief.ts: Changed `---SCORES---` format from `technique_application: [1-5]` to concrete example `technique_application: 3` with note "Replace each number with your actual 1-5 score"
- [🔴 FIX] Section 4, roleplay.ts: Added note for Nonverbal Intelligence concepts — character should include written descriptions of body language and nonverbal cues in their responses (e.g., *leans back, crosses arms*) to give user something to read and respond to
- [🟡 FIX] Section 4, lesson.ts: Added word count enforcement instruction — "Before finalizing, count your words. If over 600, edit down."
- [🟡 FIX] Section 4, roleplay.ts Rule 3: Expanded banned phrases list — added "Certainly", "Absolutely", "I hear you", "That resonates", "That's fair", "I understand where you're coming from", "Let me be frank with you"
- [🟡 FIX] Section 4, roleplay.ts: Added domain-specific scenarios for Resistant Report (Rapport, Dark Psychology), Hostile Negotiator (Negotiation, Behavioural Psychology), and Consultancy Gatekeeper (Influence, Power Dynamics) — 6 new scenarios total
- [🟡 FIX] Section 2, characters.ts: Added explicit `DOMAIN_CHARACTER_MAP` constant — full mapping table for all 7 domains to 2-3 appropriate character IDs each
- [🟡 FIX] Section 4, debrief.ts: Added hard scoring constraint — "At least one dimension MUST score 3 or below unless every single turn in the transcript demonstrates genuine mastery. Sessions averaging 4+ should occur less than 10% of the time."
- [🟡 FIX] Section 4, mission.ts: Changed targeting strategy — 70% of the time target weakest dimension, 30% target a near-strength (score of 4) to reinforce emerging skills. Added logic description.
- [🟡 FIX] Section 4, retrieval-bridge.ts: Increased word limit from 40 to 60 words for correction paths
- [🟡 FIX] Section 3, system-context.ts: Added `[REVIEW QUARTERLY]` tag on time-sensitive bio fields (fundraise status, CTO recruitment, current priority)
- [🟡 FIX] Section 2, concepts.ts: Increased minimum concept count from 35 to 42 (6 per domain) for 30-day safety margin
- [🟡 FIX] Section 2, concepts.ts: Added note about overlap risk — flag Tactical Empathy/Labelling, Mirroring/Calibrated Questions, Reciprocity/Liking as same-cluster and ensure selectConcept() separates them by ≥7 days

## Pass 3: Visual Design

- [🔴 FIX] Section 6, Simulate chat: Changed user bubble opacity from `bg-[#F2C4C4]/30` to `bg-[#F2C4C4]/50` for daylight readability
- [🔴 FIX] Section 6, Design System: Standardized all card padding to `p-6` — fixed debrief score card from `p-5` to `p-6`, coach panel from `p-5` to `p-6`
- [🟡 FIX] Section 6, Design System: Increased phase tint saturation — Learn: `#EFF6FA` → `#E8F2F8`, Simulate: `#FDF2F2` → `#FBE8E8`, Debrief: `#F3F0FA` → `#EDE8F5`, Deploy: `#F0FAF4` → `#E8F5ED`
- [🟡 FIX] Section 6, Design System: Removed orphaned `#EEEDFF` from colour system, replaced with concrete usage note (session restored banner, selected pill states)
- [🟡 FIX] Section 6, Phase Indicator: Specified dot dimensions — 10px diameter, 8px gap, pulse animation: `scale(1) → scale(1.3) → scale(1), 2s ease-in-out infinite`
- [🟡 FIX] Section 6, Simulate: Specified chat bubble spacing — `gap-3` (12px) between consecutive messages, `gap-1` (4px) between same-sender consecutive messages
- [🟡 FIX] Section 6, Deploy: Specified confetti animation keyframes — `@keyframes confetti-drift { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-80px) scale(0.5); } }` duration 1.2s, 10 dots at 8px, phase colours, random horizontal spread via `translateX(var(--x))`
- [🟡 FIX] Section 6, Simulate: Specified coach panel animation — `transform: translateY(100%) → translateY(0), 300ms ease-out`
- [🟡 FIX] Section 6, Design System: Clarified shadow-elevated is permitted on input bar and coach panel as explicit exceptions to the "no aggressive shadow-elevated" guideline

## Pass 4: UX Flow & Interaction Design

- [🔴 FIX] Section 6, ALL phases: Added loading state specifications — contextual messages with animated dots for each phase transition:
  - Begin → Lesson: "Preparing today's lesson..." on light blue bg
  - Retrieval → Roleplay: "Setting up scenario..." on light pink bg
  - Done/Skip → Debrief: "Analysing your performance..." on light lavender bg
  - Check-in → Mission: "Assigning your mission..." on light mint bg
  - Each: centered text in `text-sm text-secondary` with 3 pulsing dots below
- [🟡 FIX] Section 6, Simulate: Added typing indicator — show pulsing "..." in a character bubble shape (left-aligned, white bg) before streaming begins
- [🟡 FIX] Section 6, Simulate: Changed input from `<input>` to `<textarea>` with auto-grow (min 1 row, max 4 rows), `resize-none`
- [🟡 FIX] Section 6, Debrief: Changed Continue button from inline to `sticky bottom-0` with `pb-safe` padding, visible without scrolling
- [🟡 FIX] Section 6, Simulate: Added `aria-label` to all 4 command buttons — "Coach", "Reset", "Skip", "Done"
- [🟡 FIX] Section 6, Simulate: Specified coach panel dismiss — swipe-to-dismiss only from drag handle area (top 32px), scroll freely in content area. Also: tap backdrop or tap ✕ button.
- [🟡 FIX] Section 6, Simulate: Specified auto-scroll threshold — "auto-scroll if user is within 100px of chat bottom; show '↓ New' pill if scrolled beyond 100px"
- [🟡 FIX] Section 6, Simulate: Changed "word-by-word" to "token-by-token via ReadableStream/TextDecoder"
- [🟡 FIX] Section 6, Simulate: Specified turn counter format — "Turn 3 / ~8" in `text-xs text-secondary`, where "turn" = one user message + one AI response (exchange pair)
- [🟡 FIX] Section 6, Session Page: Added phase transition state table — explicit mapping of "when X completes, if condition, advance to Y"

## Pass 5: Teaching Methodology

- [🟡 FIX] Section 9, Learning Audit: Added note about concept deployment gap — suggested V1 enhancement where character creates natural openings for the day's concept if user hasn't deployed it by turn 4
- [🟡 FIX] Section 9, Learning Audit: Added spaced repetition note for V1 — retrieval bridge could test a concept from 3 and 7 days ago alongside the new concept
- [🟡 FIX] Section 4, roleplay.ts: For Nonverbal Intelligence concepts, added instruction for character to include italicized action descriptions (e.g., *pauses, leans forward, narrows eyes*) giving user nonverbal cues to read and respond to in text format

## Pass 6: Technical Risks

- [🟡 FIX] Section 5, Route 5: Specified streaming details — `Content-Type: text/plain`, `Transfer-Encoding: chunked`, `Cache-Control: no-cache`. On stream error: show partial message with "Connection lost. Tap to retry." appended.
- [🟡 FIX] Section 6, Session Page: Added phase transition table with explicit conditions:
  ```
  lesson.complete → retrieval
  retrieval.ready → roleplay
  roleplay.done|skip → debrief
  debrief.complete + day > 1 → checkin-within-deploy
  debrief.complete + day == 1 → mission
  checkin.complete → mission
  mission.complete → home
  ```
- [🟡 FIX] Section 6, PWA: Specified versioned cache name (`edge-v1`) and noted: increment version on each deployment to bust cache
- [🟡 FIX] Section 1, Scaffolding: Added `data/` to `.gitignore` in the scaffolding instructions

## Pass 7: Testing

- [🟡 FIX] Section 7, Test 4: Added test for localStorage persistence — "Mid-session (during roleplay), close the browser tab. Reopen /session within 30 minutes. Verify: phase indicator correct, transcript preserved, can continue sending messages. After 30 minutes: session discarded, fresh start."
- [🟡 FIX] Section 7, Test 5: Added visual check for loading states — "Verify contextual loading messages appear during every phase transition (not blank screens)"

## Pass 8: Language & Clarity

- [🟡 FIX] Throughout: Replaced all ambiguous animation descriptions with exact keyframes and durations
- [🟡 FIX] Section 6: Added explicit "Session Initialization Sequence" subsection
- [🟡 FIX] Section 6: Added explicit "Loading States" subsection
- [🟡 FIX] Section 6: Added explicit "Phase Transition Table" subsection
- [🟢 NOTE] Section 6, Home Page: Score abbreviations (TA, TW, FC, ER, SO) remain unexplained — acceptable for V0 single-user but should add tooltips for commercial version
- [🟢 NOTE] Section 6, Scores: `font-mono tabular-nums` retained — minor aesthetic concern but functional for alignment
- [🟢 NOTE] Section 5, Route 3: Lesson could benefit from streaming for perceived performance — flagged for V1
- [🟢 NOTE] Section 6: Keyboard accessibility not addressed — acceptable for mobile-first V0

---

**Total changes:** 10 🔴 fixes, 37 🟡 fixes, 4 🟢 notes = **51 modifications to the spec.**

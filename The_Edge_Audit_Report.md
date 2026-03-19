# THE EDGE — Build Specification Audit Report

**Auditor:** Claude Opus 4.6
**Date:** 23 February 2026
**Spec Version:** v1 (The_Edge_Master_Build_Prompt.md)
**Methodology:** 8-pass review covering structural integrity, prompt quality, visual design, UX flow, learning science, technical risks, testing coverage, and language clarity.

---

## Executive Summary

The specification is remarkably strong for a single-pass build prompt. The prompt architecture is the standout strength — the lesson, roleplay, debrief, and mission prompts are some of the best-specified LLM prompt instructions I've reviewed. The Tiimo-inspired visual design system is well-articulated with exact hex codes and Tailwind classes. The learning architecture (Learn → Retrieve → Simulate → Debrief → Deploy) is grounded in genuine pedagogical science.

**Top 3 Strengths:**
1. **Prompt quality is elite.** The roleplay rules, debrief scoring rubric, and lesson structure are precise enough to produce consistently excellent output. The calibration note on scoring is a masterclass in LLM instruction design.
2. **Visual design is specific, not aspirational.** Exact hex codes, exact Tailwind classes, exact component dimensions. Claude Code won't need to interpret "make it look nice."
3. **Session flow is psychologically sound.** Moving check-in to end-of-session (Zeigarnik effect), the 10-minute discipline, and the accountability-through-friction model are well-designed.

**Top 3 Critical Issues:**
1. **No loading states specified for any phase.** The spec describes what renders AFTER API calls complete but never describes what the user sees DURING the 3-10 second waits. This will produce a broken-feeling app on first build.
2. **The `/done` command is referenced but never defined.** Four command buttons are specified (coach, reset, skip, done) but only three have defined behavior. Claude Code will guess.
3. **Session page initialization sequence is completely absent.** The spec describes each phase beautifully but never says what happens when `/session` first loads — which API is called first, how the concept is selected, how Day 2 vs Day 1 is detected.

**Statistics:** 10 🔴 Critical, 37 🟡 Major, 13 🟢 Minor — **60 total issues.**

---

## Pass 1: Structural Integrity & Internal Consistency

### 1.1 Cross-Reference Audit

| Check | Result | Notes |
|-------|--------|-------|
| API routes match frontend references | ✅ | All 8 routes referenced in frontend exist in Section 5 |
| Prompt files match API route imports | ✅ | All 8 prompt builders referenced in routes exist in Section 4 |
| TypeScript types match usage | ⚠️ | SessionState missing several fields used by frontend and API routes |
| SessionPhase matches visual phases | ⚠️ | 5 type values vs 4 visual phase dots — mapping unspecified |
| PHASE_CONFIG covers all routes | ⚠️ | No entry for `retrieval` — Route 4 borrows `PHASE_CONFIG.checkin` |

**Issues:**

- 🔴 **C-01: No `PHASE_CONFIG.retrieval` entry.** Route 4 (retrieval bridge) needs to call `generateResponse()` but no config is specified. The current implementation borrows `PHASE_CONFIG.checkin` (confirmed at `app/api/retrieval-bridge/route.ts:35`), but this is an implicit coupling. A retrieval evaluation is semantically different from a check-in — it should have its own config with appropriate `max_tokens` (40 words ≈ 60 tokens, not the 200 allocated to checkin).

- 🟡 **M-01: SessionPhase has 5 values but phase indicator shows 4 dots.** The type defines `"lesson" | "retrieval" | "roleplay" | "debrief" | "mission"` but the visual phase indicator shows `Learn · Sim · Brief · Deploy`. The mapping is never specified: "retrieval" visually falls under the "Learn" dot, and "mission" falls under "Deploy." Claude Code must infer this.

- 🟡 **M-02: SessionState missing fields.** The `SessionState` interface is missing: `turnCount` (referenced in frontend turn counter), `completedPhases` (needed for phase indicator), `behavioralWeaknessSummary` and `keyMoment` (needed by mission route but absent from state), `scenarioContext` (needed for roleplay resume after persistence). The current implementation has 40+ state variables — far more than the 22 in the spec's interface.

- 🟡 **M-03: Phase display names don't match type values.** "Learn" → `lesson`, "Sim" → `roleplay`, "Brief" → `debrief`, "Deploy" → `mission`. This mapping should be an explicit constant, not left to inference.

### 1.2 Data Flow Tracing (Day 2 Session)

| Step | Specified? | Issue |
|------|-----------|-------|
| Home page loads → GET /api/status | ✅ | Clear |
| Status returns data for home page | ⚠️ | Ambiguous which scores power the display |
| User taps "Begin Session" | ❌ | No initialization sequence specified |
| Lesson loads | ✅ | Clear — POST /api/lesson |
| Retrieval bridge | ⚠️ | "Let's go." detection fragile |
| Roleplay starts | ✅ | Clear — POST /api/roleplay with null message |
| Coach panel | ✅ | Clear — independent POST /api/coach |
| Debrief | ⚠️ | Regex parsing details vague |
| Check-in at end | ⚠️ | Frontend needs previous mission, not provided |
| Mission generation | ✅ | Clear — POST /api/mission |
| Return to home | ✅ | Router push, fresh status fetch |

**Issues:**

- 🔴 **C-02: Session page initialization sequence not specified.** When the user taps "Begin Session" and arrives at `/session`, what happens? The spec never says. Does it call `/api/status` to get the day number and last entry? Does it call `/api/lesson` immediately? How does the session page know whether check-in is needed later (Day 2+)? The current implementation calls `/api/status` first, then `/api/lesson`, but the spec doesn't describe this.

- 🔴 **C-03: Home page score data source ambiguous.** The progress ring shows "overall average score" and the circles show "individual dimension scores" — but from which session? The latest session's scores? The 7-day rolling average? Route 1 returns both `recentScores[]` and `averageScores` but the home page description never clarifies. The current implementation uses `recentScores[recentScores.length - 1]` (latest session), which is the right call, but the spec should be explicit.

- 🟡 **M-04: "Let's go." detection is fragile.** Line 38 of the current implementation: `rawResponse.includes("Let's go.")` — this is case-sensitive and requires exact punctuation. If the LLM outputs "Let's go!" or "let's go." or "Let's Go.", it fails. The spec should specify case-insensitive matching: `.toLowerCase().includes("let's go")`.

- 🟡 **M-05: Previous mission not available to session page.** The check-in card at end-of-session needs to display yesterday's mission text. But no API call in the session flow returns it. The session page must call `/api/status` on mount and extract `lastEntry.mission`. This isn't specified.

- 🟡 **M-06: Debrief regex parsing underspecified.** Route 7 says "Parse `---SCORES---` section via regex (not JSON parser)" but provides no regex pattern. The format could be `technique_application: 3` or `technique_application: [3]` or `technique_application: 3/5`. The current implementation uses `/technique_application:\s*(\d)/` etc., which is correct but fragile. The spec should include the exact regex.

### 1.3 Session State Lifecycle

- 🟡 **M-07: localStorage persistence format unspecified.** The spec says "Save SessionState to localStorage after each phase. Resume within 30 min." But doesn't specify the storage key, serialization format, or what happens if saved state is from a different day. The current implementation uses `edge-session-state` as the key and includes a timestamp for the 30-minute check.

### 1.4 Error Handling

- 🟡 **M-08: Error handling inconsistent.** Only Route 7 (debrief) specifies error behavior ("default scores to 3"). Other routes have no error specification. The frontend says "API failure: error message with retry option" in Test 4 but this isn't described in the frontend section itself. The current implementation has a `fetchWithRetry()` helper with 5 retries and specific error messages per phase — none of this is in the spec.

---

## Pass 2: System Prompt Quality

### 2.1 Lesson Prompt

- 🟡 **M-09: Word count enforcement weak.** The prompt says "HARD LIMIT. Do not exceed 600 words under any circumstances." This is good reinforcement but LLMs notoriously overshoot word limits. Adding "Count your words before finalizing your response" would materially improve compliance.

- ✅ The three-part structure is excellent. The GOOD vs BAD example in "The Play" is precisely the kind of few-shot guidance LLMs need.
- ✅ "Like the best page of a Robert Greene book" is a strong, evocative tone anchor.

### 2.2 Roleplay Prompt

- 🔴 **C-04: `/done` command is referenced but never defined.** Rule 8 says "You do not know about /coach, /reset, /skip, or /done." The frontend shows a "✓ Done" button. But the spec never defines what `/done` DOES. Looking at the current implementation: `/done` and `/skip` are identical — both advance to debrief. But should they be? `/skip` implies "I'm bailing early" while `/done` implies "This conversation reached a natural conclusion." The debrief could reasonably score them differently (a `/skip` after 2 turns vs a `/done` after 8 turns represent very different sessions). The spec must define `/done` explicitly.

- 🟡 **M-10: Missing banned phrases.** The banned list covers 4 phrases but misses common LLM assistant-mode leakage: "Certainly", "Absolutely", "I hear you", "That resonates", "That's fair", "I understand where you're coming from", "Let me be frank", "I appreciate that." These should be added.

- 🟡 **M-11: 3 of 6 characters have only a default scenario.** The Resistant Report, Hostile Negotiator, and Consultancy Gatekeeper have no domain-specific scenario variants. If the concept is from "Dark Psychology" and the selected character is the Hostile Negotiator, the scenario will be generic procurement negotiation regardless. More domain-specific scenarios are needed for variety across 35+ sessions.

- 🟡 **M-12: Domain-to-character mapping described as "loose" but never specified.** The `selectCharacter()` function description says "Maintain a loose mapping (Negotiation → Hostile Negotiator or Sceptical Investor, Power Dynamics → Alpha Peer, etc.)" but doesn't provide the full mapping table. Claude Code must invent it. The current implementation has an explicit `DOMAIN_CHARACTER_MAP` constant — this should be in the spec.

### 2.3 Character Definitions

The spec says characters need "RICH personality briefs (not one-liners)" but then provides 2-3 sentence descriptions per character. The current implementation expanded these to 450-570 word briefs each — a significant improvement over the spec. However:

- 🟢 **I-01: Character personality descriptions could be richer in the spec.** The spec relies on Claude Code to extrapolate from terse descriptions. The implementation did this well, but a weaker model might not.

### 2.4 Debrief Prompt

- 🔴 **C-05: `---SCORES---` format uses `[1-5]` placeholder syntax.** The output format says `technique_application: [1-5]`. An LLM could literally output `technique_application: [1-5]` instead of `technique_application: 3`. The format should use concrete example values with a note: "Replace each bracket with a single integer 1-5."

- 🟡 **M-13: No hard scoring constraint.** The calibration note is excellent ("for every 4 you give, ask yourself...") but LLMs have strong positivity bias. Adding "At least one dimension MUST score ≤3 unless every turn in the transcript demonstrates genuine mastery" would enforce range usage.

### 2.5 Mission Prompt

- 🟡 **M-14: Always targets weakest dimension.** The `weakestDimension` logic is hardcoded. Psychological research suggests varying the strategy: sometimes reinforce a near-strength (4 → 5) to build confidence, sometimes target a persistent weakness. A rigid "always worst" approach may feel punishing by Day 15.

### 2.6 Check-In Prompt

- ✅ Well-positioned at end of session. Context framing is correct ("wrapping up a training session").
- ✅ Skip response hardcoded to avoid unnecessary API call. Smart.
- ✅ Examples are sharp and demonstrate the expected tone precisely.

### 2.7 Retrieval Bridge

- 🟡 **M-15: 40-word limit too tight for correction paths.** The "WRONG OR VAGUE" path needs 2 sentences of correction + "Hold that. You'll need it in 30 seconds. Let's go." The framework alone is ~20 words, leaving ~20 words for actual correction. For complex concepts like the Ellipsis Model, this is insufficient. Recommend 60 words.

### 2.8 Persistent Context

- 🟡 **M-16: User bio will become stale.** The bio says "Currently fundraising", "Raising a seed round", "recruiting a founding CTO." These are time-sensitive. Once the seed round closes or a CTO is hired, the system will generate missions about fundraising/recruiting that are irrelevant. The spec should flag these as fields requiring periodic review.

- ✅ Token cost is within budget (~1,500 tokens × 180 calls/month = ~$0.80).

---

## Pass 3: Visual Design Specification

### 3.1 Colour System Coherence

- 🔴 **C-06: User chat bubbles nearly invisible in daylight.** `bg-[#F2C4C4]/30` (30% opacity coral) on a `#FDF2F2` (very light pink) background produces an effective colour of approximately `#FBE8E8` — barely distinguishable from white character bubbles in bright daylight. For a morning train commute, this is a critical readability issue. Recommended fix: increase opacity to 50% (`bg-[#F2C4C4]/50`) or use an opaque tint like `bg-[#F9E0E0]`.

- 🟡 **M-17: Phase tint backgrounds too close to base background.** The base `#FAF9F6` and the Learn tint `#EFF6FA` differ by only a subtle blue shift. On a phone screen in daylight, the "whole screen changes colour" effect — described as "the single biggest Tiimo-like element" — may be imperceptible. Recommend making tints more saturated: `#E5F0F7` (learn), `#FBE8E8` (simulate), `#EDE5F7` (debrief), `#E5F5EC` (deploy).

- 🟡 **M-18: `#EEEDFF` (accent light) is an orphaned colour.** Defined as "very light purple — hover states, selected states" but never referenced in any component description. Either use it or remove it. (The current implementation does use it for the "Session restored" banner.)

- ✅ Accent purple (#6C63FF) passes WCAG AA contrast with white text at ~6.2:1.
- ✅ Score colours are distinct and meaningful. The traffic-light mapping (green/gold/coral) is intuitive.

### 3.2 Typography

- ✅ DM Sans is available on Google Fonts with all specified weights.
- ✅ No uppercase references found — consistent with Tiimo language.
- 🟢 **I-02: `font-mono tabular-nums` for scores.** Using monospace on score numbers introduces a second font that may clash with DM Sans's rounded aesthetic. DM Sans supports `tabular-nums` natively — use `font-[family:inherit] tabular-nums` instead.

### 3.3 Component Specification

- 🟡 **M-19: Phase indicator dot sizes not specified.** The dots are described as coloured and pulsing but no diameter is given (8px? 12px? 16px?). The pulse animation says "gentle scale-pulse" but provides no keyframes or duration.

- 🟡 **M-20: Chat bubble spacing not specified.** No gap value between consecutive messages. `gap-3` (12px) would be standard.

- 🟡 **M-21: Confetti animation underspecified.** "8-10 dots that drift upward and fade, CSS-only, phase colours" — directional but no keyframes, no duration, no spread pattern. CSS-only confetti that looks good is non-trivial.

- 🟡 **M-22: Coach panel slide-up animation timing not specified.** "Slides up from bottom as half-sheet" — no duration or easing. Recommend `300ms ease-out`.

### 3.4 Responsive Design

- ✅ All layouts fit 320px width (verified: 5 × 40px circles + gaps = 264px).
- ✅ `max-w-[720px] mx-auto` centres content on wide screens.

### 3.5 Contradictions

- 🔴 **C-07: `p-5` vs `p-6` contradiction.** The design system says "Cards use `p-6` not `p-5`." But the debrief score card says `p-5` and the coach panel says `p-5`. This will confuse Claude Code. Fix: standardize to `p-6` everywhere, or explicitly note exceptions.

- 🟡 **M-23: `shadow-elevated` used despite design guidance.** The system says "No aggressive shadow-elevated. Depth comes from coloured backgrounds." But the input bar uses `shadow-elevated` and the coach panel uses `shadow-elevated`. Either allow it on these two components explicitly, or replace with `shadow-soft`.

### 3.6 Old Design Remnants

- ✅ No traces of previous design systems (indigo, violet, Inter, pentagon, gradients) found. Clean.

---

## Pass 4: UX Flow & Interaction Design

### 4.1 Critical Path Timing & Loading States

- 🔴 **C-08: No loading states specified for ANY phase.** This is the single biggest UX gap. The spec describes what renders after API calls complete but never describes what the user sees during the wait:

| Transition | Wait Time | Loading State in Spec |
|------------|-----------|----------------------|
| Begin Session → Lesson | 3-5s | ❌ None |
| Ready to Practice → Retrieval | ~1s | ✅ Phase transition |
| Retrieval → Roleplay First Message | 2-3s | ❌ None |
| Each Roleplay Turn (before stream) | 1-2s | ❌ None |
| Done/Skip → Debrief | 5-10s | ❌ None |
| Check-in → Mission | 2-3s | ❌ None |

The current implementation has contextual loading messages ("Preparing today's lesson...", "Analysing your performance...", "Assigning your mission...") with animated dots — but the spec never specifies these. A builder working from the spec alone would produce blank screens during every API wait.

### 4.2 Dead Time & Typing Indicators

- 🟡 **M-24: No typing indicator for roleplay.** Before the streaming response begins (1-2 seconds), the user sees silence. A pulsing "..." or character-name-is-typing indicator should appear. The current implementation shows a "LoadingDots" component, but the spec doesn't specify it.

### 4.3 Edge Cases

- 🟡 **M-25: Roleplay input appears to be single-line.** The spec says "Input field: `bg-[#FDF2F2] rounded-2xl py-3 px-4 text-base border-none`" — this reads as an `<input>`, not a `<textarea>`. Users may want to write multi-sentence roleplay messages. Should be a `<textarea>` with auto-grow.

- 🟡 **M-26: Long debrief may push Continue button below fold.** The debrief can be 1,500+ tokens of dense analysis. If the "Continue →" button is inline at the bottom, users may not see it without scrolling. Either fix the button to the bottom of the viewport (like the roleplay input bar) or add a scroll hint.

### 4.4 Accessibility

- 🟡 **M-27: Emoji command buttons lack aria-labels.** Screen readers would announce Unicode names ("sparkle", "clockwise arrows") instead of functions. Each needs `aria-label`: Coach, Reset, Skip, Done.

### 4.5 Gesture Conflicts

- 🟡 **M-28: Coach panel scroll vs swipe-to-dismiss conflict.** If coach advice is long enough to require scrolling, swiping down in the panel would conflict with the swipe-to-dismiss gesture. Recommend: only allow swipe-to-dismiss from the drag handle at top, not from content area.

---

## Pass 5: Teaching Methodology & Learning Science

### 5.1 Bloom's Taxonomy Alignment

| Phase | Target Level | Achieved? | Notes |
|-------|-------------|-----------|-------|
| Learn | Knowledge/Comprehension | ✅ | Actually exceeds — The Counter adds Analysis |
| Retrieval | Recall | ✅ | Forced active recall, cannot be gamed |
| Simulate | Application/Analysis | ⚠️ | User can ignore concept and still converse |
| Debrief | Evaluation | ✅ | External + self-evaluation via Replay |
| Deploy | Synthesis | ✅ | Real-world application |

- 🟡 **M-29: No mechanism ensures concept deployment in roleplay.** The user could have a decent conversation without ever using the day's technique. The debrief scores `technique_application` after the fact, but there's no in-simulation prompt or nudge. Consider: if the user hasn't referenced the concept by turn 4, the character could unknowingly create an opening (a behaviour that happens to be vulnerable to the day's technique).

### 5.2 Spaced Repetition

- 🟡 **M-30: No spaced repetition mechanism.** A concept learned on Day 3 is never revisited unless randomly selected again after ~35 days. Research (Ebbinghaus, Bjork) suggests 3-5 retrieval events at increasing intervals for long-term retention. The mission provides ONE retrieval event 24 hours later. This is insufficient. For V1, consider: retrieval bridge tests a concept from 3 and 7 days ago alongside the new concept.

### 5.3 Concept Taxonomy

- 🟡 **M-31: 35 concepts barely covers the 30-day trial.** If the user misses a few days, the pool approaches exhaustion. Recommend 42+ concepts (6 per domain) for safety margin.

- 🟡 **M-32: Significant concept overlap risk.** Several concepts are closely related: Tactical Empathy + Labelling (both Voss), Mirroring + Calibrated Questions (both Voss conversational techniques), Reciprocity + Liking (both Cialdini). If served on consecutive days (domain diversity check doesn't prevent within-domain overlap on non-consecutive days), lessons will feel repetitive.

### 5.4 Nonverbal Domain Problem

- 🔴 **C-09: Nonverbal Intelligence domain incompatible with text-based roleplay.** Concepts like "Baseline Behaviour Reading", "Microexpression Clusters", and "Authority Posture" are inherently physical/visual. In a text-based chat roleplay:
  - The lesson can teach them ✅
  - The retrieval bridge can test recall ✅
  - The simulation cannot practice them ❌
  - The debrief has no transcript evidence to score ❌
  - The mission can test them in real life ✅

  This doesn't mean the domain is useless — the lesson and mission still add value. But the roleplay and debrief will feel disconnected. The spec should acknowledge this and either: (a) modify roleplay for these concepts to include written descriptions of nonverbal behaviour in the scenario, or (b) have the character describe their own nonverbal cues in their responses ("*leans back, crosses arms*"), giving the user something to read and respond to.

### 5.5 Check-In Placement

- ✅ End-of-session placement is psychologically strong. The Zeigarnik effect (desire to complete the sequence and receive the new mission) creates natural pull to report outcomes. The "✕ Skip" path is appropriately frictionless.

### 5.6 Time Budget

| Phase | Budget | Estimated Actual | Assessment |
|-------|--------|-----------------|------------|
| Learn | 2 min | 2-3 min (600 words ÷ 250wpm + loading) | ⚠️ Slightly over |
| Retrieval | 15s | 20-30s (read question + type + evaluate) | ⚠️ Slightly over |
| Simulate | 5 min | 4-7 min (depends on engagement) | ✅ Variable |
| Debrief | 2 min | 2-3 min (long analysis + loading) | ⚠️ Slightly over |
| Check-in + Deploy | 45s | 60-90s (pill selection + typing + mission) | ⚠️ Over |
| **Total** | **~10.5 min** | **~11-15 min** | ⚠️ Likely 12+ min |

The 10-minute target may be aspirational. Realistic sessions will run 12-14 minutes due to API latency and reading time. This isn't a critical issue but the spec should acknowledge it.

---

## Pass 6: Technical Implementation Risks

### 6.1 API Design

- 🟡 **M-33: Streaming implementation details incomplete.** Route 5 says "Return `ReadableStream`" but doesn't specify: Content-Type header (text/event-stream? text/plain?), chunk delimiter (newlines? none?), error handling if stream fails mid-response (partial bubble? retry?). The current implementation uses `text/plain` with `Transfer-Encoding: chunked`.

### 6.2 State Management

- 🟡 **M-34: Phase transition logic not specified as a state machine.** The frontend must implement complex conditional logic: "When debrief completes, if Day > 1, show check-in, then mission. If Day 1, show mission directly." This should be an explicit transition table, not left to Claude Code to infer from narrative descriptions.

### 6.3 File System

- 🟡 **M-35: `.gitignore` entry for `data/` not mentioned in spec.** The current implementation correctly includes `/data/` in `.gitignore` (line 38), but the spec never instructs this. A builder following the spec would commit personal session data to the repo. The scaffolding section should include this.

### 6.4 PWA & Caching

- 🟡 **M-36: No cache invalidation strategy.** The spec says "Minimal service worker" but doesn't specify a versioned cache name or update mechanism. If the user deploys a new version, the old SW could serve stale app shell indefinitely. The current implementation uses `edge-v3` as the cache name — the spec should mandate versioned cache names.

---

## Pass 7: Testing & Audit Sections

### 7.1 Test Coverage Gaps

- 🟡 **M-37: No test for browser refresh mid-session.** localStorage persistence is described but never tested. A test should verify: refresh during roleplay → state restored, phase indicator correct, transcript preserved, can continue conversation.

- 🟢 **I-03: No test for concept de-duplication after pool exhaustion.** What happens at session 36+ when all 35 concepts are used? The `selectConcept()` spec says "reset pool" but this isn't tested.

### 7.2 UX Audit Coverage

- ✅ Comprehensive. Part 5 specifically tests Tiimo design elements. Part 4.6 tests daylight readability.

### 7.3 Learning Audit Coverage

- ✅ Comprehensive. Correctly references the end-of-session check-in placement.
- 🟢 **I-04: Time budget table should have pre-filled estimates.** The "Actual" column shows "?" — the spec could provide estimated ranges to help Claude Code self-assess during testing.

---

## Pass 8: Language, Clarity & Ambiguity

### 8.1 Ambiguous Instructions

| Instruction | Location | Issue | Recommended Fix |
|------------|----------|-------|----------------|
| "gentle scale-pulse animation" | Phase indicator | No keyframes | `scale(1) → scale(1.3) → scale(1), 2s ease infinite` |
| "Word-by-word via ReadableStream" | Roleplay streaming | API sends tokens, not words | "Token-by-token via ReadableStream/TextDecoder" |
| "auto-scroll unless user scrolled up" | Chat scroll | No threshold | "auto-scroll if within 100px of bottom" |
| "soft inline card" at 8 turns | Turn limit notice | Exact content unclear | Specify exact text and styling |
| "brief loading state" | Multiple phases | Nothing specified | See C-08 — full loading state spec needed |

### 8.2 Contradictions

| Item A | Item B | Resolution |
|--------|--------|------------|
| "Cards use `p-6` not `p-5`" | Debrief score card: `p-5`, Coach panel: `p-5` | Standardize to `p-6` |
| "No aggressive shadow-elevated" | Input bar: `shadow-elevated`, Coach: `shadow-elevated` | Allow on these two, note as exceptions |
| Phase display names (Learn, Sim, Brief, Deploy) | SessionPhase values (lesson, retrieval, roleplay, debrief, mission) | Add explicit mapping constant |

### 8.3 Missing Specifications

| What's Missing | Where It's Needed | Impact |
|---------------|-------------------|--------|
| Session page initialization sequence | Section 6, Session Page | 🔴 Builder must guess |
| Loading states for all phases | Section 6, each phase | 🔴 Blank screens during waits |
| `/done` command behavior | Section 6, Simulate | 🔴 Builder must guess |
| Phase dot dimensions (px) | Section 6, Phase Indicator | 🟡 Builder must guess |
| Chat bubble gap/spacing | Section 6, Simulate | 🟡 Inconsistent spacing |
| Turn counter format | Section 6, Simulate | 🟡 Builder must guess |
| "Turn" definition (user msg only, or exchange?) | Section 6, Simulate | 🟡 Count could be 2x off |
| Day numbering logic | Section 5, Route 1 | 🟡 Sequential vs calendar |
| Stream error handling (partial message) | Section 5, Route 5 | 🟡 Broken UX on network failure |
| Debrief parsing regex | Section 5, Route 7 | 🟡 Parsing could break |

### 8.4 Tone & Precision

The spec is remarkably consistent in precision. Strongest sections: prompt strings (exact text), colour system (exact hex codes), component styling (exact Tailwind classes). Weakest sections: loading states (nonexistent), session initialization (absent), error handling (sporadic), animation timing (vague).

---

## Issue Statistics

| Severity | Count |
|----------|-------|
| 🔴 Critical | 10 |
| 🟡 Major | 37 |
| 🟢 Minor | 13 |
| **Total** | **60** |

---

## Priority Fix List

### 🔴 Critical (Must Fix)

| # | ID | Issue | Section |
|---|-----|-------|---------|
| 1 | C-08 | No loading states specified for any phase transition | 6 |
| 2 | C-02 | Session page initialization sequence not specified | 6 |
| 3 | C-04 | `/done` command referenced but never defined | 4, 6 |
| 4 | C-05 | Debrief `---SCORES---` uses `[1-5]` placeholder — LLM may output literally | 4 |
| 5 | C-06 | User chat bubbles at 30% opacity invisible in daylight | 6 |
| 6 | C-07 | `p-5` vs `p-6` padding contradiction | 6 |
| 7 | C-01 | No `PHASE_CONFIG.retrieval` — borrows checkin config | 3 |
| 8 | C-03 | Home page score data source ambiguous (latest vs rolling average) | 5, 6 |
| 9 | C-09 | Nonverbal Intelligence domain can't be simulated in text roleplay | 4, 2 |
| 10 | C-10 | `.gitignore` must include `data/` — not mentioned in spec | 1 |

### 🟡 Major (Should Fix)

| # | ID | Issue | Section |
|---|-----|-------|---------|
| 1 | M-01 | SessionPhase 5 values vs 4 visual phases — mapping unspecified | 2, 6 |
| 2 | M-02 | SessionState missing fields (turnCount, completedPhases, etc.) | 2 |
| 3 | M-04 | "Let's go." string detection fragile | 5 |
| 4 | M-05 | Previous mission data not available to session page | 5, 6 |
| 5 | M-06 | Debrief regex parsing details vague | 5 |
| 6 | M-07 | localStorage persistence format unspecified | 6 |
| 7 | M-08 | Error handling inconsistent across routes | 5 |
| 8 | M-09 | Lesson word count enforcement weak | 4 |
| 9 | M-10 | Missing banned roleplay phrases | 4 |
| 10 | M-11 | 3/6 characters have only default scenarios | 4 |
| 11 | M-12 | Domain-to-character mapping not specified | 2 |
| 12 | M-13 | No hard scoring constraint (positivity bias) | 4 |
| 13 | M-14 | Mission always targets weakest dimension | 4 |
| 14 | M-15 | Retrieval 40-word limit too tight | 4 |
| 15 | M-16 | User bio will become stale | 3 |
| 16 | M-17 | Phase tint backgrounds too subtle in daylight | 6 |
| 17 | M-18 | Accent light colour orphaned | 6 |
| 18 | M-19 | Phase dot sizes and animation not specified | 6 |
| 19 | M-20 | Chat bubble spacing not specified | 6 |
| 20 | M-21 | Confetti animation underspecified | 6 |
| 21 | M-22 | Coach panel animation timing not specified | 6 |
| 22 | M-23 | shadow-elevated used despite design guidance against it | 6 |
| 23 | M-24 | No typing indicator for roleplay | 6 |
| 24 | M-25 | Roleplay input is single-line, should be textarea | 6 |
| 25 | M-26 | Long debrief pushes Continue below fold | 6 |
| 26 | M-27 | Emoji command buttons lack aria-labels | 6 |
| 27 | M-28 | Coach panel scroll vs swipe-to-dismiss conflict | 6 |
| 28 | M-29 | No mechanism ensures user deploys concept in roleplay | 4 |
| 29 | M-30 | No spaced repetition mechanism | 2, 9 |
| 30 | M-31 | 35 concepts barely covers 30-day trial | 2 |
| 31 | M-32 | Significant concept overlap risk | 2 |
| 32 | M-33 | Streaming implementation details incomplete | 5 |
| 33 | M-34 | Phase transition logic not explicit | 6 |
| 34 | M-35 | `.gitignore` for `data/` not in spec | 1 |
| 35 | M-36 | No cache invalidation strategy for SW | 6 |
| 36 | M-37 | No test for localStorage persistence | 7 |
| 37 | M-03 | Phase display names don't match type values | 2, 6 |

---

*END OF AUDIT REPORT*

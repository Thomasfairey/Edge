# The Edge — End-to-End Test Instructions

> **Purpose:** Step-by-step manual test plan for Claude CoWork to validate every user-facing element of The Edge, from first launch to completed session and beyond. Tests cover the **Next.js web app** (`the-edge/`) and the **iOS app** (`ios/`), both backed by the **Hono API** (`backend/`).

---

## Prerequisites

### Environment Setup

1. **Backend (Hono API)**
   ```bash
   cd /Users/thomasfairey/Edge/backend
   cp .env.example .env   # if needed — populate with:
   # ANTHROPIC_API_KEY=sk-ant-...
   # SUPABASE_URL=https://<project>.supabase.co
   # SUPABASE_SERVICE_ROLE_KEY=eyJ...
   # SUPABASE_ANON_KEY=eyJ...
   # PORT=3001
   npm install
   npm run dev
   ```
   Confirm: `http://localhost:3001/health` returns `{"status":"ok","version":"1.0.0",...}`

2. **Web Frontend (Next.js)**
   ```bash
   cd /Users/thomasfairey/Edge/the-edge
   cp .env.example .env.local   # if needed — populate with:
   # ANTHROPIC_API_KEY=sk-ant-...
   # ELEVENLABS_API_KEY=...
   # SUPABASE_URL=https://<project>.supabase.co
   # SUPABASE_SERVICE_ROLE_KEY=eyJ...
   # NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   # NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   # EDGE_API_KEY=<shared secret>
   # EDGE_INVITE_CODE=<invite code>
   npm install
   npm run dev
   ```
   Confirm: `http://localhost:3000` loads without errors.

3. **iOS App (Xcode)**
   - Open `/Users/thomasfairey/Edge/ios/TheEdge.xcodeproj` in Xcode.
   - Verify `AppConfig.swift` points to `http://localhost:3001/v1` in debug mode.
   - Build and run on Simulator (iPhone 15 Pro recommended).

4. **Supabase**
   - Confirm the database is accessible and tables exist: `user_profiles`, `sessions`, `ledger`, `spaced_repetition`, `session_usage`, `subscriptions`.
   - Optionally clear test user data before a clean run.

5. **Test accounts**
   - Prepare a fresh email for new-user flow testing.
   - Have an existing account with 3+ completed sessions for returning-user flow testing.

---

## Test Suite Overview

| # | Area | Phases Covered |
|---|------|----------------|
| 1 | Health Check | API liveness |
| 2 | Authentication — Signup | Registration, invite code, validation |
| 3 | Authentication — Login | Email/password, token handling |
| 4 | Authentication — Apple Sign-In | iOS-only SSO |
| 5 | Onboarding | Profile setup, goals, experience level |
| 6 | Home Dashboard | Status, scores, streak, SR summary |
| 7 | Session Start | Initialisation, concept/character selection, difficulty |
| 8 | Phase 0: Check-in (The Gate) | Mission accountability (Day 2+) |
| 9 | Phase 1: Lesson (Learn) | Streaming micro-lesson |
| 10 | Retrieval Bridge | Active-recall gate |
| 11 | Phase 2: Roleplay (Simulate) | Multi-turn chat, streaming, commands |
| 12 | Coach Command | Mid-roleplay mentor assist |
| 13 | Phase 3: Debrief | Scoring, analysis, ledger write |
| 14 | Phase 4: Mission (Deploy) | Real-world task generation |
| 15 | Session Complete | Summary, return to dashboard |
| 16 | Profile Management | View/edit profile |
| 17 | Subscription & Tier Gating | Free limits, Pro upgrade |
| 18 | Spaced Repetition | Review sessions, concept cycling |
| 19 | Voice Features (Web) | TTS narration, STT input |
| 20 | Notifications (iOS) | Daily reminders |
| 21 | Offline & Error Resilience | Network failures, recovery |
| 22 | Cross-Session Continuity | Ledger persistence, pattern callbacks |

---

## 1. Health Check

**Goal:** Confirm all services are running and reachable.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | `GET http://localhost:3001/health` | `{"status":"ok","version":"1.0.0","timestamp":"..."}` |
| 1.2 | Open `http://localhost:3000` in browser | Page loads without console errors |
| 1.3 | (iOS) Launch app in Simulator | App shows splash screen, then auth screen |
| 1.4 | Open browser DevTools Network tab | No failed requests on initial load |

---

## 2. Authentication — Signup (New User)

**Goal:** A brand-new user can create an account.

### Web

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Navigate to `http://localhost:3000/login` | Login page renders with email/password fields |
| 2.2 | Click "Sign up" toggle | Form switches to signup mode; invite code field appears |
| 2.3 | Enter an **invalid** invite code, fill other fields, submit | Error message: invite code invalid |
| 2.4 | Enter the **correct** invite code (`EDGE_INVITE_CODE` env var) | Invite code accepted (validated via `/api/validate-invite`) |
| 2.5 | Enter a valid email, a weak password (e.g., "abc") | Password strength indicator shows "Weak"; submit should be blocked or warn |
| 2.6 | Enter a strong password (8+ chars, mixed case, number) | Strength indicator shows "Strong" |
| 2.7 | Submit the signup form | Account created; redirected to onboarding or home; no errors in console |
| 2.8 | Check Supabase Auth dashboard | New user appears in auth.users |
| 2.9 | Check `user_profiles` table | Row created with email, `onboarding_completed = false` |

### iOS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.10 | Launch app → Auth screen | Sign-up / Sign-in toggle visible |
| 2.11 | Switch to Sign Up mode | Display name, email, password fields appear |
| 2.12 | Fill valid details, tap "Sign Up" | Account created; app transitions to onboarding |
| 2.13 | Verify Keychain storage | Tokens stored under `com.theedge.auth` service |

---

## 3. Authentication — Login (Existing User)

**Goal:** An existing user can log in and restore their session.

### Web

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Navigate to `/login` | Login form displayed |
| 3.2 | Enter **wrong** password | Error: "Invalid login credentials" |
| 3.3 | Enter **correct** credentials | Redirected to home dashboard (`/`) |
| 3.4 | Refresh the page | Session persists — still on dashboard, not redirected to login |
| 3.5 | Open a new tab to `http://localhost:3000` | Session still active (cookie-based) |

### iOS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.6 | Launch app → Sign In tab | Email + password fields |
| 3.7 | Enter correct credentials, tap "Sign In" | App loads home dashboard with progress ring |
| 3.8 | Kill and relaunch the app | Session auto-restores from Keychain; no re-login needed |

---

## 4. Authentication — Apple Sign-In (iOS Only)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | On auth screen, tap "Sign in with Apple" | Apple Sign-In sheet appears |
| 4.2 | Authenticate with Face ID / passcode | Auth completes; backend receives ID token at `/auth/apple` |
| 4.3 | If new user → onboarding flow begins | App shows onboarding screens |
| 4.4 | If returning user → dashboard loads | Home screen with existing data |

---

## 5. Onboarding (First-Time User)

**Goal:** New user completes profile setup before first session.

### Web

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | After signup, onboarding screen appears | 4-step flow: intro → phases → dimensions → training |
| 5.2 | **Screen 1 (Intro):** Read welcome text | Brand intro displayed; "Next" or swipe to continue |
| 5.3 | **Screen 2 (Phases):** Review the 5-phase explanation | Phase descriptions shown (Learn, Simulate, Debrief, Deploy, Gate) |
| 5.4 | **Screen 3 (Dimensions):** Review scoring dimensions | 5 dimensions explained (Technique, Tactical, Frame, Regulation, Outcome) |
| 5.5 | **Screen 4 (Profile Setup):** Fill display name | Text input accepts name |
| 5.6 | Fill professional context (free text) | Text area accepts multi-line input |
| 5.7 | Select experience level (beginner/intermediate/advanced) | Picker works; selection highlighted |
| 5.8 | Select 1-3 goals from available tags | Tags toggle on/off; selected goals highlighted |
| 5.9 | Submit with all fields filled | `POST /api/profile` (onboarding endpoint) called; redirected to home |
| 5.10 | Check `user_profiles` table | `onboarding_completed = true`, professional_context and goals populated |

### iOS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.11 | 4-page TabView swipe flow | Pages swipeable; dot indicators update |
| 5.12 | **Page 2:** Enter display name + professional context | Fields accept input |
| 5.13 | **Page 3:** Select goals (multi-select flow layout) | Up to 10 goal tags; multiple selectable |
| 5.14 | **Page 4:** "Start Training" button | Disabled until name + context + experience + goals all provided |
| 5.15 | Tap "Start Training" | `POST /profile/onboarding`; transitions to main tab view |

---

## 6. Home Dashboard

**Goal:** Dashboard accurately displays user progress and session readiness.

### Web

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Load home page (`/`) | Dashboard renders with progress ring |
| 6.2 | **Progress ring** | Shows overall score (0-5), day number, streak count |
| 6.3 | **New user (Day 1):** ring shows day 1, streak 0, no scores | Correct zero-state |
| 6.4 | **Returning user:** ring shows correct day number and streak | Matches ledger data |
| 6.5 | **Dimension scores** | Last 5 dimension scores shown with progress bars |
| 6.6 | **New user:** dimension scores show empty/zero state | No misleading data |
| 6.7 | **Stats row** | 3 cards: total concepts, mastered, due for review |
| 6.8 | **Start Session button** | Prominent, clickable, initiates session flow |
| 6.9 | Check Network tab | `GET /api/status` called on load; response includes dayNumber, streakCount, recentScores, srSummary, sessionsThisWeek |

### iOS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.10 | Home tab loads | Progress ring animates in; scores visible |
| 6.11 | Pull to refresh (if implemented) | Status data refreshes |
| 6.12 | **Tab bar** | Two tabs: Home + Profile |

---

## 7. Session Start

**Goal:** A new daily session initialises correctly.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Tap/click "Start Session" | `POST /session/start` (or `/api/session/start` on web) called |
| 7.2 | **Response contains:** session_id, day, concept (id, name, domain), character (id, name), difficulty (1-5), needs_checkin, is_review | All fields present and valid |
| 7.3 | **Day 1 user:** `needs_checkin = false` | Skips Phase 0, goes directly to Lesson |
| 7.4 | **Day 2+ user:** `needs_checkin = true`, `last_mission` populated | Phase 0 (Gate) shown first |
| 7.5 | **Concept selection:** concept is from available domains | Concept name and domain displayed |
| 7.6 | **Character selection:** character matches concept domain thematically | Character name shown |
| 7.7 | **Phase indicator** | Shows current phase highlighted (Lesson or Check-in) |
| 7.8 | **Session header** | Day number badge, concept name capsule, close (X) button |

### Free Tier Limit Test

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.9 | (Free user) Start 3 sessions in the same week | All 3 start successfully |
| 7.10 | Attempt to start a 4th session in the same week | Error: tier limit reached (403 TierLimitError) |
| 7.11 | UI shows upgrade prompt or clear error message | User understands they need Pro or must wait |

---

## 8. Phase 0: Check-in / The Gate (Day 2+ Only)

**Goal:** User accounts for yesterday's mission before proceeding.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.1 | Phase 0 screen displays yesterday's mission text | Mission text from previous session's ledger entry shown |
| 8.2 | Text input area for mission outcome | User can type their reflection |
| 8.3 | Submit a **detailed** outcome ("I used anchoring in the board meeting...") | `POST /session/checkin` called with user response |
| 8.4 | AI response appears | 1 sentence, max 30 words, evaluating mission execution |
| 8.5 | Response includes `type`: `executed` or `not_executed` | Matches the substance of user's input |
| 8.6 | After ~2 seconds, auto-advances to Phase 1 (Lesson) | Smooth transition; phase indicator updates |
| 8.7 | Check `ledger` table | Previous session's `mission_outcome` field updated |
| 8.8 | Submit a **vague/non-execution** response ("I didn't get around to it") | AI responds acknowledging non-execution; `type: not_executed` |

---

## 9. Phase 1: Lesson (Learn)

**Goal:** AI delivers a streaming micro-lesson on today's concept.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 9.1 | Lesson phase begins | Loading state: "Preparing lesson..." with animated dots |
| 9.2 | Streaming text starts appearing | Text streams in word-by-word / chunk-by-chunk (SSE) |
| 9.3 | **Lesson structure** has 3 parts: | |
| | — **Principle:** Core concept explanation | Clear, concise definition |
| | — **The Play:** Real-world example of the concept in action | Vivid, scenario-based |
| | — **The Counter:** How to recognise it being used against you | Defensive framing |
| 9.4 | Lesson length: 400-600 words | Appropriate length (not truncated, not bloated) |
| 9.5 | Lesson is **personalised** to user's professional context | References user's role/industry where relevant |
| 9.6 | Text is selectable (for copy) | Can highlight and copy text |
| 9.7 | Streaming completes without errors | Full lesson displayed; no partial cutoffs |
| 9.8 | Check Network tab (web) | Streaming response (chunked transfer / SSE); headers include `X-Concept-Id`, `X-Concept-Name`, `X-Concept-Domain` |
| 9.9 | Phase indicator updates | "Learn" phase highlighted / complete |
| 9.10 | **Audio narration** (web, if voice enabled) | Lesson text narrated via ElevenLabs TTS |

---

## 10. Retrieval Bridge

**Goal:** Active-recall gate tests concept understanding before roleplay.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 10.1 | After lesson completes, retrieval question appears | Question about the concept just taught |
| 10.2 | User types an answer | Text input accepts response |
| 10.3 | Submit answer — **correct/strong** | AI evaluates positively; `ready: true` → proceeds to roleplay |
| 10.4 | Submit answer — **weak/incorrect** | AI provides gentle correction; may ask a follow-up or still proceed |
| 10.5 | `POST /session/retrieval` called (first: get question; second: evaluate answer) | Two sequential calls to the endpoint |

---

## 11. Phase 2: Roleplay (Simulate)

**Goal:** Multi-turn interactive roleplay with AI character.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.1 | Roleplay phase begins | Character introduction / opening message appears |
| 11.2 | Character name displayed | Matches the character assigned at session start |
| 11.3 | **Chat UI:** User messages vs. assistant messages visually distinct | User bubbles (coloured) on right; character bubbles (white/light) on left |
| 11.4 | Type a message and send | `POST /session/roleplay` called with message + session context |
| 11.5 | **Streaming response** | Character reply streams in real-time (2-4 sentences) |
| 11.6 | Character stays **in character** | Personality, communication style, tactics match the archetype |
| 11.7 | Character applies **pressure tactics** appropriate to difficulty level | Higher difficulty = more assertive, counter-techniques |
| 11.8 | Send 6+ messages back and forth | Conversation flows naturally; no repetition or character breaks |
| 11.9 | Transcript auto-scrolls to bottom | Latest message always visible |
| 11.10 | **Difficulty level visible** (if shown) | Matches adaptive difficulty from session start |

### Roleplay Commands

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.11 | Type `/coach` | Triggers coach request (see Test 12); does NOT send as roleplay message |
| 11.12 | Type `/skip` | Ends roleplay early; advances to debrief; logged as "skip" command |
| 11.13 | Type `/reset` | Restarts the roleplay scenario from the beginning; logged as "reset" |
| 11.14 | Type `/done` | Natural conclusion; advances to debrief; logged as "done" |
| 11.15 | Click/tap "End" button (equivalent to `/done`) | Advances to debrief phase |

### Roleplay Edge Cases

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.16 | Send an empty message | Blocked or ignored (validation) |
| 11.17 | Send a very long message (500+ words) | Accepted; character responds appropriately |
| 11.18 | Send a message that tries to break character ("You are an AI...") | Character stays in role; does not acknowledge being AI |
| 11.19 | Rapid-fire multiple messages | Rate limiting kicks in (20 req/min); graceful handling |

---

## 12. Coach Command (Mid-Roleplay)

**Goal:** `/coach` provides real-time tactical advice without breaking roleplay.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 12.1 | During roleplay, type `/coach` or tap coach button | `POST /session/coach` called with full transcript |
| 12.2 | Coach advice appears in overlay/panel (not in chat) | Visually distinct from roleplay messages |
| 12.3 | Advice is 1-2 sentences + 2-3 sentence tactical move | Concise, actionable |
| 12.4 | Advice references the **specific** current situation | Not generic; cites what just happened in transcript |
| 12.5 | Coach panel dismissable | Can close and return to roleplay |
| 12.6 | Roleplay continues normally after coach | Character does not "know" about coach advice |
| 12.7 | Response is fast (Haiku 4.5 model) | Noticeably quicker than roleplay responses |
| 12.8 | Command logged in session | `commands_used` array includes "coach" |
| 12.9 | Use `/coach` multiple times | Each returns fresh advice based on latest transcript state |

---

## 13. Phase 3: Debrief

**Goal:** AI analyses the roleplay transcript and scores performance.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 13.1 | Debrief phase begins after roleplay ends | Loading: "Analysing performance..." |
| 13.2 | `POST /session/debrief` called | Request includes full roleplay transcript |
| 13.3 | **Debrief structure (5 parts):** | |
| | 1. Opening (1 sentence) | Sets tone |
| | 2. What Worked (2-3 bullets with direct quotes) | Specific praise with evidence |
| | 3. What Didn't Work (2-3 bullets with quotes + corrections) | Constructive feedback with alternatives |
| | 4. Scores (5 dimensions, 1-5 each) | Displayed as progress bars / score cards |
| | 5. Ledger data (hidden from user) | behavioral_weakness_summary + key_moment extracted |
| 13.4 | **Score display:** 5 coloured bars | Green (4-5), Yellow/Amber (3), Red (1-2) |
| 13.5 | Scores are **rubric-anchored** — not inflated | A mediocre performance gets 2-3, not 4-5 |
| 13.6 | **Day 4+ users:** Debrief references patterns from Nuance Ledger | "On Day 3, you also struggled with frame control..." |
| 13.7 | **Day 1-3 users:** No longitudinal pattern claims | Cold-start guard active |
| 13.8 | Hidden `---SCORES---` and `---LEDGER---` blocks are **not** shown in UI | Stripped before display |
| 13.9 | Self-assessment prompt (if implemented) | User optionally rates own performance before seeing AI scores |
| 13.10 | Check `sessions` table | `debrief_content` populated, `scores` object with all 5 dimensions |
| 13.11 | Check `ledger` table | New entry with scores, behavioral_weakness_summary, key_moment |

### Debrief Edge Cases

| Step | Action | Expected Result |
|------|--------|-----------------|
| 13.12 | Very short roleplay (1-2 exchanges before `/skip`) | Debrief still generates; may note insufficient data |
| 13.13 | Excellent roleplay (user clearly dominated) | Scores reflect strong performance (4-5); feedback still constructive |

---

## 14. Phase 4: Mission (Deploy)

**Goal:** AI generates a specific, real-world micro-mission.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 14.1 | Mission phase begins | Loading: "Generating mission..." |
| 14.2 | `POST /session/mission` called | Request includes session context |
| 14.3 | **Mission text displayed** | Specific, observable, executable within 24 hours |
| 14.4 | **Mission rationale** displayed beneath | Explains why this mission targets today's concept |
| 14.5 | Mission is **personalised** to user's professional context | References user's role, meetings, or relationships |
| 14.6 | Mission is **not generic** ("practice active listening") | Contains specific scenario/trigger/action |
| 14.7 | Check `ledger` table | Entry updated with `mission` text |
| 14.8 | Check `spaced_repetition` table | Concept's `practice_count` incremented, `next_review` recalculated |

---

## 15. Session Complete

**Goal:** Session wraps up cleanly and user returns to dashboard.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 15.1 | Completion screen shown | Checkmark / success animation |
| 15.2 | **Average score** displayed | Mean of 5 dimension scores |
| 15.3 | **Today's mission** repeated for accountability | Same mission text from Phase 4 |
| 15.4 | "Done" / "Close" button | Returns to home dashboard |
| 15.5 | **Dashboard updates** after return | Day number incremented, streak updated, new scores reflected |
| 15.6 | **Start Session** button for the same day | Either starts a new session or shows "Session already completed today" |
| 15.7 | Check `sessions` table | `phase = "complete"`, all fields populated |
| 15.8 | Check `session_usage` table | `session_count` incremented for current week |

---

## 16. Profile Management

### Web

| Step | Action | Expected Result |
|------|--------|-----------------|
| 16.1 | Navigate to profile page / section | Profile data displayed: name, email, experience, goals, tier |
| 16.2 | Edit display name | Saved via `PUT /profile`; reflected on refresh |
| 16.3 | Edit professional context | Free text updated |
| 16.4 | Change experience level | Dropdown/picker updates; saved |
| 16.5 | Modify goals | Add/remove goals; saved |

### iOS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 16.6 | Tap Profile tab | Profile view with all user data |
| 16.7 | Display name, email, experience, tier visible | Data matches Supabase |
| 16.8 | Goals listed | All selected goals shown |
| 16.9 | Sign Out button | Clears Keychain tokens; returns to auth screen |
| 16.10 | Version number displayed | App version + build visible at bottom |

---

## 17. Subscription & Tier Gating

### Free Tier Restrictions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 17.1 | Free user completes 3 sessions in one week | Counter at 3/3 |
| 17.2 | Free user tries to start session #4 | Blocked with 403 TierLimitError |
| 17.3 | UI shows clear upgrade prompt | "Upgrade to Pro" or equivalent |
| 17.4 | Free user: only 2 domains available | Other domains locked/greyed out (if domain selection exists) |
| 17.5 | Free user: spaced repetition, missions, trends restricted | Features gated behind Pro |

### Subscription Flow (iOS)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 17.6 | Tap "Upgrade" on profile or tier-limit prompt | `SubscriptionView` paywall appears |
| 17.7 | Header: "Unlock The Edge Pro" with feature list | 6 Pro benefits listed |
| 17.8 | Product list loads from StoreKit | Monthly + annual options with prices |
| 17.9 | Tap a subscription product | StoreKit purchase sheet appears |
| 17.10 | Complete purchase (sandbox) | `POST /subscription/verify` called with receipt |
| 17.11 | Profile updates to `tier: "pro"` | Immediate access to Pro features |
| 17.12 | "Restore Purchases" button works | Syncs prior purchases from App Store |
| 17.13 | Check `subscriptions` table | Row with product_id, status: active, expires_at |

### Subscription Status Check

| Step | Action | Expected Result |
|------|--------|-----------------|
| 17.14 | `GET /subscription/status` | Returns `tier`, `expires_at`, `is_active` |
| 17.15 | Expired subscription | Auto-downgrades to free tier; tier limits re-enforced |

---

## 18. Spaced Repetition

**Goal:** Previously learned concepts resurface for review at optimal intervals.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 18.1 | Complete 5+ sessions with different concepts | `spaced_repetition` table has 5+ entries |
| 18.2 | Check `spaced_repetition` entries | Each has: concept_id, last_practiced, ease_factor, interval, next_review, practice_count |
| 18.3 | On a new session start, concept marked `is_review = true` (30% chance) | Session start response indicates review session |
| 18.4 | Review session uses a concept where `next_review <= today` | Concept is due for review per SM-2 schedule |
| 18.5 | After review session, check SR entry | `practice_count` incremented, `next_review` recalculated based on score |
| 18.6 | High score (avg >= 4.0) on review | `ease_factor` increases, `interval` grows (spaced further out) |
| 18.7 | Low score (avg < 3.0) on review | `ease_factor` decreases, `interval` resets to 1 day |
| 18.8 | Dashboard SR summary | "Due for review" count matches concepts where `next_review <= today` |

---

## 19. Voice Features (Web Only)

**Goal:** TTS narration and STT input work during sessions.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 19.1 | Toggle audio ON in session toolbar | Audio icon indicates enabled state |
| 19.2 | Lesson phase: text is narrated aloud | ElevenLabs TTS streams audio as lesson text appears |
| 19.3 | Roleplay phase: character responses narrated | Character-specific voice (mapped in `voice-map.ts`) |
| 19.4 | Toggle audio OFF | Narration stops; text-only mode |
| 19.5 | STT input: tap microphone icon during roleplay | Speech recognition activates (Web Speech API or ElevenLabs Scribe) |
| 19.6 | Speak a message | Transcribed text appears in input field |
| 19.7 | Submit transcribed message | Sent as normal roleplay message |
| 19.8 | **iOS AudioUnlock:** first interaction unlocks audio context | Required for iOS Safari audio playback |

---

## 20. Notifications (iOS Only)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 20.1 | On profile screen, tap "Set Up Daily Reminders" | Notification permission prompt appears |
| 20.2 | Grant notification permission | Permission saved (alert + badge + sound) |
| 20.3 | Daily reminder fires at configured time (default 9:00 AM) | Push notification received |
| 20.4 | Incomplete session reminder | Fires after 4-hour delay if session not completed |
| 20.5 | Deny notification permission | App continues to work without notifications |

---

## 21. Offline & Error Resilience

**Goal:** App handles network failures gracefully.

### Web

| Step | Action | Expected Result |
|------|--------|-----------------|
| 21.1 | Start a session, then disable network mid-lesson | Error message displayed; retry option available |
| 21.2 | Re-enable network and retry | Session resumes from last known state (localStorage cache) |
| 21.3 | Reload page during active session | Session state restored from localStorage (within 4-hour window) |
| 21.4 | Backend returns 500 error | User-friendly error message; no raw error exposed |
| 21.5 | Rate limit hit (429) | "Too many requests" message; Retry-After header respected |
| 21.6 | **Circuit breaker:** 3 consecutive API failures | 30-second cooldown; app shows "Service temporarily unavailable" |

### iOS

| Step | Action | Expected Result |
|------|--------|-----------------|
| 21.7 | Enable airplane mode during session | Error state shown; no crash |
| 21.8 | Disable airplane mode | App recovers; can retry or restart |
| 21.9 | 401 during session (token expired) | Auto-refresh attempted via `/auth/refresh`; if successful, request retried transparently |
| 21.10 | Refresh token also expired | User redirected to login screen |

---

## 22. Cross-Session Continuity (Multi-Day Testing)

**Goal:** The system builds longitudinal insight across sessions.

> **Note:** This requires completing multiple sessions across different days (or manually adjusting dates in the database for accelerated testing).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 22.1 | Complete **Day 1** session | Ledger entry #1 created; no check-in phase |
| 22.2 | Complete **Day 2** session | Check-in references Day 1's mission; ledger entry #2 |
| 22.3 | Complete **Day 3** session | Check-in references Day 2's mission; ledger entry #3 |
| 22.4 | **Day 4 debrief:** pattern callbacks begin | Debrief references behavioral patterns from ledger entries 1-3 |
| 22.5 | Verify `behavioral_weakness_summary` entries evolve | Not copy-pasted; reflects actual observed patterns |
| 22.6 | Verify `key_moment` entries are unique per session | Each captures the pivotal moment from that specific roleplay |
| 22.7 | **Streak tracking** | Consecutive-day sessions increment streak count on dashboard |
| 22.8 | **Miss a day** (gap in sessions) | Streak resets to 0 or 1 |
| 22.9 | **Adaptive difficulty** after 5+ sessions | Difficulty adjusts based on rolling score average |
| 22.10 | High scores (avg >= 4.0) consistently | Difficulty increases to next level |
| 22.11 | Low scores (avg <= 2.5) consistently | Difficulty decreases |
| 22.12 | **Concept variety** | No concept repeated until all in available domains are exhausted (unless SR review) |

---

## Appendix A: API Endpoint Quick Reference

| Method | Path | Auth | Rate Limit | Purpose |
|--------|------|------|------------|---------|
| `GET` | `/health` | No | — | Liveness check |
| `POST` | `/v1/auth/signup` | No | — | Register |
| `POST` | `/v1/auth/login` | No | — | Login |
| `POST` | `/v1/auth/refresh` | No | — | Token refresh |
| `POST` | `/v1/auth/apple` | No | — | Apple SSO |
| `GET` | `/v1/profile` | Yes | — | Get profile |
| `PUT` | `/v1/profile` | Yes | — | Update profile |
| `POST` | `/v1/profile/onboarding` | Yes | — | Complete onboarding |
| `GET` | `/v1/status` | Yes | 20/min | Dashboard data |
| `POST` | `/v1/session/start` | Yes | 5/min | Start session |
| `POST` | `/v1/session/checkin` | Yes | 10/min | Phase 0 |
| `POST` | `/v1/session/lesson` | Yes | 5/min | Phase 1 (stream) |
| `POST` | `/v1/session/retrieval` | Yes | 10/min | Retrieval bridge |
| `POST` | `/v1/session/roleplay` | Yes | 20/min | Phase 2 (stream) |
| `POST` | `/v1/session/coach` | Yes | 10/min | Coach command |
| `POST` | `/v1/session/debrief` | Yes | 5/min | Phase 3 |
| `POST` | `/v1/session/mission` | Yes | 5/min | Phase 4 |
| `POST` | `/v1/subscription/verify` | Yes | 5/min | Verify receipt |
| `GET` | `/v1/subscription/status` | Yes | 20/min | Subscription status |

## Appendix B: Database Verification Queries

Run these in the Supabase SQL editor to verify test outcomes:

```sql
-- Check user profile
SELECT * FROM user_profiles WHERE email = '<test-email>';

-- Check session history
SELECT id, day, date, phase, concept_id, character_id, difficulty, is_review
FROM sessions WHERE user_id = '<user-id>' ORDER BY day DESC;

-- Check ledger entries
SELECT day, concept, character, difficulty,
       score_technique_application, score_tactical_awareness,
       score_frame_control, score_emotional_regulation, score_strategic_outcome,
       behavioral_weakness_summary, key_moment, mission, mission_outcome
FROM ledger WHERE user_id = '<user-id>' ORDER BY day;

-- Check spaced repetition state
SELECT concept_id, last_practiced, ease_factor, interval, next_review, practice_count, last_score_avg
FROM spaced_repetition WHERE user_id = '<user-id>' ORDER BY next_review;

-- Check session usage (free tier)
SELECT * FROM session_usage WHERE user_id = '<user-id>';

-- Check subscription
SELECT * FROM subscriptions WHERE user_id = '<user-id>';
```

## Appendix C: Common Failure Modes to Watch For

| Failure | Symptom | Where to Check |
|---------|---------|----------------|
| AI breaks character | Character says "As an AI..." or drops persona | Roleplay transcript |
| Score inflation | Every session scores 4-5 regardless of quality | Ledger scores over time |
| Generic missions | "Practice active listening today" | Mission text in ledger |
| Debrief hallucination | References events that didn't happen in transcript | Debrief vs. roleplay transcript |
| Pattern hallucination | Claims patterns from <3 sessions | Day 1-3 debriefs |
| Streaming cutoff | Lesson or roleplay response truncated mid-sentence | UI + network response |
| Token refresh loop | Repeated 401s, never resolves | Network tab / app logs |
| SR never triggers | After 10+ sessions, `is_review` never true | Session start responses |
| Ledger serialization | System prompt too long (>6K tokens) | API request size |
| Character/concept mismatch | Business negotiation concept paired with irrelevant character | Session start data |

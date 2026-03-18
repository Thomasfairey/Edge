# THE EDGE — System Architecture v1.0

## Commercial Product Architecture

**Target:** iOS App Store (native Swift/SwiftUI) → Android (Kotlin) post-launch
**Backend:** Dedicated TypeScript API (Hono) on Node.js
**Database:** Supabase (PostgreSQL + Auth + RLS)
**AI:** Anthropic Claude API (Sonnet 4.5 primary, Haiku 4.5 coaching)
**Monetisation:** Freemium + Subscription (StoreKit 2)

---

## Repository Structure

```
Edge/
├── backend/                    # Dedicated TypeScript API server
│   ├── src/
│   │   ├── index.ts           # Hono app entry point
│   │   ├── routes/            # API route handlers
│   │   │   ├── auth.ts        # Authentication endpoints
│   │   │   ├── session.ts     # Session lifecycle (all phases)
│   │   │   ├── lesson.ts      # Phase 1: micro-lesson
│   │   │   ├── roleplay.ts    # Phase 2: roleplay engine
│   │   │   ├── coach.ts       # /coach parallel endpoint
│   │   │   ├── debrief.ts     # Phase 3: scoring & ledger
│   │   │   ├── mission.ts     # Phase 4: mission generation
│   │   │   ├── checkin.ts     # Phase 0: accountability gate
│   │   │   ├── status.ts      # Dashboard data
│   │   │   └── subscription.ts # Subscription management
│   │   ├── middleware/        # Cross-cutting concerns
│   │   │   ├── auth.ts        # JWT verification middleware
│   │   │   ├── rate-limit.ts  # Per-user rate limiting
│   │   │   ├── error.ts       # Global error handler
│   │   │   └── logging.ts     # Structured request logging
│   │   ├── services/          # Business logic layer
│   │   │   ├── anthropic.ts   # Claude API wrapper
│   │   │   ├── ledger.ts      # Nuance Ledger operations
│   │   │   ├── spaced-rep.ts  # SM-2 spaced repetition
│   │   │   ├── scoring.ts     # Score calibration & validation
│   │   │   ├── user.ts        # User profile management
│   │   │   └── subscription.ts # Subscription validation
│   │   ├── prompts/           # System prompt templates
│   │   │   ├── system-context.ts  # Layer 1: dynamic user context
│   │   │   ├── lesson.ts
│   │   │   ├── roleplay.ts
│   │   │   ├── debrief.ts
│   │   │   ├── mission.ts
│   │   │   ├── checkin.ts
│   │   │   └── coach.ts
│   │   ├── content/           # Concept & character libraries
│   │   │   ├── concepts.ts    # Full concept taxonomy
│   │   │   └── characters.ts  # Character archetypes
│   │   ├── db/                # Database layer
│   │   │   ├── client.ts      # Supabase client
│   │   │   ├── schema.ts      # Type definitions matching DB
│   │   │   └── migrations/    # SQL migration files
│   │   ├── types/             # Shared TypeScript types
│   │   │   ├── api.ts         # Request/response types
│   │   │   ├── domain.ts      # Domain model types
│   │   │   └── errors.ts      # Error type definitions
│   │   └── utils/             # Shared utilities
│   │       ├── streaming.ts   # SSE streaming helpers
│   │       └── validation.ts  # Input validation (Zod)
│   ├── tests/                 # Test suite
│   │   ├── unit/
│   │   ├── integration/
│   │   └── fixtures/
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── ios/                       # Native iOS app (Phase 2)
│   └── TheEdge/
│       ├── TheEdge.xcodeproj
│       ├── App/
│       │   ├── TheEdgeApp.swift
│       │   └── ContentView.swift
│       ├── Views/             # SwiftUI views
│       │   ├── Home/
│       │   ├── Session/
│       │   ├── Onboarding/
│       │   ├── Profile/
│       │   └── Subscription/
│       ├── ViewModels/        # MVVM view models
│       ├── Models/            # Data models
│       ├── Services/          # API client, auth, StoreKit
│       ├── Components/        # Reusable UI components
│       └── Resources/         # Assets, colours, fonts
│
├── the-edge/                  # Existing Next.js web app (reference)
├── PRD.md                     # Product Requirements Document
└── ARCHITECTURE.md            # This file
```

---

## Architecture Decisions

### 1. Backend: Hono on Node.js

**Why Hono over Express/Fastify:**
- TypeScript-first with excellent type inference
- Middleware composition is cleaner and type-safe
- Built-in streaming support (critical for roleplay)
- ~6x faster than Express in benchmarks
- Lightweight (~14KB), fast cold starts
- Compatible with multiple runtimes (Node, Bun, Cloudflare Workers, Vercel)

### 2. Authentication: Supabase Auth

**Why Supabase Auth:**
- Already using Supabase for database — unified platform
- Built-in Apple Sign-In support (App Store requirement)
- Email/password + social auth out of the box
- JWT tokens that work with Row-Level Security
- Free tier generous enough for MVP

### 3. Database: PostgreSQL via Supabase with RLS

**Row-Level Security ensures:**
- Every query is automatically scoped to the authenticated user
- No data leaks between users even if application code has bugs
- Backend uses service role for admin operations only

### 4. iOS: SwiftUI + MVVM + Swift Concurrency

**Why native over cross-platform:**
- Best possible performance and feel for App Store
- Native haptics, animations, push notifications
- StoreKit 2 integration is Swift-only
- SwiftUI + async/await is the modern standard
- Apple favours native apps in review

### 5. API Design: RESTful with Versioning

**Endpoints follow:**
- `POST /v1/auth/signup` — Create account
- `POST /v1/auth/login` — Sign in
- `POST /v1/auth/apple` — Apple Sign-In
- `GET  /v1/status` — Dashboard data
- `POST /v1/session/checkin` — Phase 0
- `POST /v1/session/lesson` — Phase 1 (streaming)
- `POST /v1/session/roleplay` — Phase 2 (streaming)
- `POST /v1/session/coach` — /coach command
- `POST /v1/session/retrieval` — Retrieval bridge (active recall gate)
- `POST /v1/session/debrief` — Phase 3
- `POST /v1/session/mission` — Phase 4
- `GET  /v1/profile` — User profile
- `PUT  /v1/profile` — Update profile
- `POST /v1/subscription/verify` — Verify App Store receipt
- `GET  /v1/subscription/status` — Subscription status

---

## Database Schema v2

### Key Changes from v1:
1. **Users table** — replaces hardcoded profile
2. **RLS on all tables** — per-user data isolation
3. **Sessions table** — track session lifecycle
4. **Subscription tracking** — tier management
5. **Proper foreign keys and constraints**

See `backend/src/db/migrations/` for full SQL.

---

## Scoring Calibration Strategy

### Problem: Scores feel arbitrary
Current approach relies on AI to self-calibrate, which produces inconsistent results.

### Solution: Rubric-anchored scoring with exemplars

Each score level (1-5) per dimension gets:
1. **Explicit behavioral criteria** — what the user must demonstrate
2. **Example transcript excerpts** — showing what a 2 vs 4 looks like
3. **Relative scoring** — compare to user's own baseline (rolling average)
4. **Citation requirement** — AI must quote the specific turn justifying each score

### Implementation:
- Scoring rubric embedded in debrief prompt
- Self-assessment step added before AI debrief (builds metacognition)
- Score variance tracking — flag sessions where scores jump >2 points

---

## Content Variety Strategy

### Problem: Sessions feel repetitive after ~10 days

### Solution: Dynamic scenario composition

1. **Expand characters** to 12+ archetypes
2. **Scenario mutations** — same character, different contexts/stakes
3. **Difficulty progression** — adaptive based on rolling scores
4. **User weakness targeting** — scenarios that probe identified weak spots
5. **Character personality randomisation** — vary traits within archetype bounds

---

## Freemium Tier Design

### Free Tier:
- 3 sessions per week
- Access to 2 concept domains (Influence & Persuasion, Rapport)
- 3 character archetypes
- Basic scoring (no trend analysis)
- No mission accountability (Phase 0 disabled)

### Pro Tier:
- Unlimited daily sessions
- All 7+ concept domains
- All character archetypes
- Full scoring with trend analysis, sparklines, growth edge
- Mission accountability loop
- Spaced repetition system
- Priority API access (lower latency)
- Voice mode (TTS/STT)

---

## Development Phases

### Phase 0: Foundation (Weeks 1-3)
- [x] Architecture document
- [x] Backend project scaffold (Hono + TypeScript)
- [x] Database schema v2 with RLS (6 tables, full RLS policies, auto-triggers)
- [x] Authentication system (Supabase Auth — signup, login, Apple Sign-In, refresh)
- [x] User profile management (CRUD + onboarding flow)
- [x] Migrate core API routes from Next.js (all 5 phases + retrieval bridge)
- [x] Input validation (Zod schemas for all endpoints)
- [x] Error handling middleware (custom error hierarchy, global handler)
- [x] Rate limiting (per-user sliding window)
- [x] Structured logging (request logging middleware)
- [x] Unit tests for services (89 unit tests across 8 files)

### Phase 1: Quality & Content (Weeks 4-6)
- [x] Scoring calibration (rubric-anchored with explicit 1-5 criteria per dimension)
- [x] Self-assessment step (optional self-scores compared to AI debrief, gap analysis)
- [x] Expand to 12+ characters (12 archetypes with full personalities)
- [x] Dynamic scenario generation (domain-character mapping, random selection)
- [x] Adaptive difficulty (1-5 scale, auto-adjusts based on rolling performance)
- [x] Reliability hardening (retries, fallbacks, timeouts per phase)
- [x] Session persistence (DB via Supabase with RLS)
- [x] Integration tests (10 tests covering health, auth, route protection)

### Phase 2: iOS MVP (Weeks 7-12)
- [x] Xcode project + SwiftUI scaffold (11 Swift files, MVVM architecture)
- [x] API client layer (URLSession actor + async/await + streaming)
- [x] Authentication flow (Apple Sign-In + email/password)
- [x] Home dashboard (progress ring, dimension scores, streak, stats)
- [x] Session flow (all 5 phases with phase-specific views)
- [x] Streaming chat UI (ChatBubble, real-time roleplay)
- [x] Push notifications (daily reminders, session incomplete alerts)
- [x] Haptic feedback (light, medium, success, error)
- [x] Accessibility (VoiceOver labels, Dynamic Type support)
- [ ] TestFlight deployment (requires Apple Developer account)

### Phase 3: Monetisation & Launch (Weeks 13-16)
- [x] StoreKit 2 subscription integration (purchase, restore, transaction listener)
- [x] Server-side receipt validation (POST /v1/subscription/verify)
- [x] Free/Pro tier gating (TIER_LIMITS, session count enforcement)
- [ ] App Store assets (screenshots, preview)
- [ ] Privacy policy & terms
- [ ] App Store submission
- [ ] Analytics & crash reporting

### Phase 4: Growth (Post-Launch)
- [ ] A/B testing framework
- [ ] Android app (Kotlin/Jetpack Compose)
- [ ] Social features
- [ ] Enterprise tier
- [ ] Content partnerships

/**
 * Session lifecycle routes — manages all 5 phases of the daily loop.
 *
 * POST /v1/session/start     — Initialize a new session
 * POST /v1/session/checkin   — Phase 0: accountability gate
 * POST /v1/session/lesson    — Phase 1: micro-lesson (streaming)
 * POST /v1/session/roleplay  — Phase 2: roleplay turn (streaming)
 * POST /v1/session/coach     — /coach command (parallel)
 * POST /v1/session/debrief   — Phase 3: scoring & analysis
 * POST /v1/session/mission   — Phase 4: real-world mission
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { createUserClient } from "../db/client.js";
import { authMiddleware, type AuthUser } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import type { AppEnv } from "../types/env.js";
import {
  streamResponse,
  generateResponse,
  generateResponseViaStream,
  PHASE_CONFIG,
} from "../services/anthropic.js";
import {
  getLastEntry,
  getLedgerCount,
  serialiseForPrompt,
  getCompletedConcepts,
  appendEntry,
  updateLastMissionOutcome,
  getRecentScores,
} from "../services/ledger.js";
import { updateSREntry } from "../services/spaced-rep.js";
import { getProfile, getSessionsThisWeek, incrementSessionCount } from "../services/user.js";
import { selectConcept, CONCEPTS } from "../content/concepts.js";
import { selectCharacter, CHARACTERS } from "../content/characters.js";
import { buildSystemContext } from "../prompts/system-context.js";
import { SCORING_RUBRIC, parseScores, parseLedgerFields, generateScoringContext } from "../services/scoring.js";
import { CheckinSchema, RoleplayMessageSchema, CoachRequestSchema, DebriefRequestSchema, RetrievalBridgeSchema } from "../types/api.js";
import { TIER_LIMITS, type LedgerEntry, type SessionScores } from "../types/domain.js";
import { TierLimitError, ValidationError } from "../types/errors.js";
import { buildRetrievalBridgePrompt } from "../prompts/retrieval-bridge.js";
import { calculateDifficulty, difficultyModifier, difficultyContext } from "../services/difficulty.js";

const session = new Hono<AppEnv>();

session.use("*", authMiddleware);

// ---------------------------------------------------------------------------
// POST /v1/session/start — Initialize session
// ---------------------------------------------------------------------------

session.post("/start", rateLimit(5), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);

  const profile = await getProfile(db, user.id);

  // Check free tier limits
  if (profile.subscription_tier === "free") {
    const sessionsThisWeek = await getSessionsThisWeek(db, user.id);
    if (sessionsThisWeek >= TIER_LIMITS.free.sessions_per_week) {
      throw new TierLimitError(
        `Free tier allows ${TIER_LIMITS.free.sessions_per_week} sessions per week. Upgrade to Pro for unlimited.`
      );
    }
  }

  const lastEntry = await getLastEntry(db, user.id);
  const dayNumber = lastEntry ? lastEntry.day + 1 : 1;
  const needsCheckin = dayNumber > 1 && lastEntry !== null;

  // Select concept and character
  const completedIds = await getCompletedConcepts(db, user.id);
  const { concept, isReview } = await selectConcept(db, user.id, completedIds);
  const character = selectCharacter(concept);

  // Calculate adaptive difficulty based on recent performance
  const recentScoresForDifficulty = await getRecentScores(db, user.id, 5);
  const lastEntryDifficulty = lastEntry?.difficulty;
  const difficulty = calculateDifficulty(recentScoresForDifficulty, lastEntryDifficulty);

  // Create session record in DB
  const { data: sessionData, error } = await db
    .from("sessions")
    .insert({
      user_id: user.id,
      day: dayNumber,
      date: new Date().toISOString().split("T")[0],
      phase: needsCheckin ? "checkin" : "lesson",
      concept_id: concept.id,
      character_id: character.id,
      is_review: isReview,
      difficulty,
    })
    .select("id")
    .single();

  if (error) {
    throw new ValidationError(`Failed to create session: ${error.message}`);
  }

  // Increment usage counter
  await incrementSessionCount(db, user.id);

  return c.json({
    success: true,
    data: {
      session_id: sessionData.id,
      day: dayNumber,
      needs_checkin: needsCheckin,
      last_mission: lastEntry?.mission ?? null,
      concept: {
        id: concept.id,
        name: concept.name,
        domain: concept.domain,
        source: concept.source,
      },
      character: {
        id: character.id,
        name: character.name,
        description: character.description,
      },
      is_review: isReview,
      difficulty,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/session/checkin — Phase 0: Accountability Gate
// ---------------------------------------------------------------------------

session.post("/checkin", rateLimit(10), zValidator("json", CheckinSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const { mission_response } = c.req.valid("json");

  const lastEntry = await getLastEntry(db, user.id);
  if (!lastEntry) {
    return c.json({ success: true, data: { response: "No prior mission to check in on.", type: "skip" } });
  }

  const profile = await getProfile(db, user.id);
  const ledgerSummary = await serialiseForPrompt(db, user.id);
  const completedConcepts = await getCompletedConcepts(db, user.id);
  const systemContext = buildSystemContext(profile, ledgerSummary, completedConcepts);

  const checkinPrompt = `${systemContext}

## Phase 0: The Accountability Gate

You are an elite executive coach delivering a mission accountability check.

Yesterday's mission was: "${lastEntry.mission}"

The user's response about their mission execution:
"${mission_response}"

Analyse their response and deliver ONE sentence — maximum 30 words. Be:
- If executed with clear outcome: Acknowledge the specific shift they created. Connect to the underlying principle.
- If executed but unclear result: Provide a 1-sentence reframe on what to observe next time.
- If not executed: Blunt, one sentence. No softening. Make inaction uncomfortable.

Respond with ONLY the one-sentence response. No preamble, no labels.`;

  const response = await generateResponse(
    checkinPrompt,
    [{ role: "user", content: mission_response }],
    PHASE_CONFIG.checkin
  );

  // Update ledger with mission outcome
  await updateLastMissionOutcome(db, user.id, mission_response);

  // Determine response type
  const lowerResponse = mission_response.toLowerCase();
  const notExecuted = lowerResponse.includes("didn't") || lowerResponse.includes("not") || lowerResponse.includes("couldn't") || lowerResponse.includes("haven't");
  const type = notExecuted ? "not_executed" : "executed";

  return c.json({
    success: true,
    data: { response, type },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/session/lesson — Phase 1: Micro-Lesson (streaming)
// ---------------------------------------------------------------------------

session.post("/lesson", rateLimit(5), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);

  const body = await c.req.json();
  const sessionId = body.session_id;
  if (!sessionId) throw new ValidationError("session_id required");

  // Get session data
  const { data: sessionData } = await db
    .from("sessions")
    .select("concept_id, is_review")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!sessionData) throw new ValidationError("Session not found");

  const concept = CONCEPTS.find((c) => c.id === sessionData.concept_id);
  if (!concept) throw new ValidationError("Concept not found");

  const profile = await getProfile(db, user.id);
  const ledgerSummary = await serialiseForPrompt(db, user.id);
  const completedConcepts = await getCompletedConcepts(db, user.id);
  const systemContext = buildSystemContext(profile, ledgerSummary, completedConcepts);

  const reviewNote = sessionData.is_review
    ? `\n\nIMPORTANT: This is a REVIEW session. The user has practised this concept before. Reference their previous experience and focus on deepening understanding, not repeating basics.`
    : "";

  const lessonPrompt = `${systemContext}

## Phase 1: Micro-Lesson Engine

You are an elite instructor delivering a concise, high-impact lesson on a specific psychological concept.

### Today's Concept
**${concept.name}** (${concept.source}) — ${concept.domain}
${concept.description}${reviewNote}

### Lesson Structure (FOLLOW EXACTLY)

Deliver a 400-600 word lesson in three parts:

**THE PRINCIPLE**
Explain the concept with academic rigour but accessible language. Include the source attribution. Why does this work psychologically? What mechanism does it exploit?

**THE PLAY**
One vivid, specific real-world example of this technique deployed effectively. Draw from business, politics, intelligence, or historical contexts. Make it concrete — names, settings, dialogue if appropriate.

**THE COUNTER**
One example of the same technique being used AGAINST someone. Show how to recognise it in the wild and how to neutralise or deflect it.

### Style Notes
- Write for a ${profile.experience_level}-level practitioner
- No padding, no motivation, no "let's dive in"
- Start directly with the principle
- Use bold for key terms on first use
- Keep total length under 600 words`;

  const stream = streamResponse(
    lessonPrompt,
    [{ role: "user", content: `Teach me about ${concept.name}.` }],
    PHASE_CONFIG.lesson,
    async (fullLessonText) => {
      // Update session phase and persist lesson after streaming completes
      const { error: phaseErr } = await db.from("sessions")
        .update({ phase: "retrieval", lesson_content: fullLessonText })
        .eq("id", sessionId)
        .eq("user_id", user.id);
      if (phaseErr) {
        console.log(JSON.stringify({ level: "error", service: "session", operation: "lesson_phase_update", message: phaseErr.message, timestamp: new Date().toISOString() }));
      }
    }
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Concept-Id": concept.id,
      "X-Concept-Name": concept.name,
      "X-Concept-Domain": concept.domain,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/session/retrieval — Retrieval Bridge (between Learn and Simulate)
// ---------------------------------------------------------------------------

session.post("/retrieval", rateLimit(10), zValidator("json", RetrievalBridgeSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const { session_id, user_response } = c.req.valid("json");

  const { data: sessionData } = await db
    .from("sessions")
    .select("concept_id")
    .eq("id", session_id)
    .eq("user_id", user.id)
    .single();

  if (!sessionData) throw new ValidationError("Session not found");

  const concept = CONCEPTS.find((c) => c.id === sessionData.concept_id);
  if (!concept) throw new ValidationError("Concept not found");

  // First call — return the question without LLM call
  if (!user_response) {
    const question = `Before we begin — in one sentence, what is ${concept.name} and when would you deploy it?`;
    return c.json({ success: true, data: { response: question, ready: false } });
  }

  // Second call — evaluate via LLM
  const profile = await getProfile(db, user.id);
  const ledgerSummary = await serialiseForPrompt(db, user.id);
  const completedConcepts = await getCompletedConcepts(db, user.id);
  const systemContext = buildSystemContext(profile, ledgerSummary, completedConcepts);
  const retrievalPrompt = buildRetrievalBridgePrompt(concept);

  const response = await generateResponse(
    `${systemContext}\n\n${retrievalPrompt}`,
    [{ role: "user", content: user_response }],
    PHASE_CONFIG.checkin
  );

  const ready = response.includes("Let's go.");

  // Update session phase to roleplay
  if (ready) {
    const { error: phaseError } = await db
      .from("sessions")
      .update({ phase: "roleplay" })
      .eq("id", session_id)
      .eq("user_id", user.id);
    if (phaseError) throw new ValidationError(`Phase update failed: ${phaseError.message}`);
  }

  return c.json({ success: true, data: { response, ready } });
});

// ---------------------------------------------------------------------------
// POST /v1/session/roleplay — Phase 2: Roleplay Turn (streaming)
// ---------------------------------------------------------------------------

session.post("/roleplay", rateLimit(20), zValidator("json", RoleplayMessageSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const { message, session_id } = c.req.valid("json");

  // Get session data
  const { data: sessionData } = await db
    .from("sessions")
    .select("concept_id, character_id, roleplay_transcript, difficulty")
    .eq("id", session_id)
    .eq("user_id", user.id)
    .single();

  if (!sessionData) throw new ValidationError("Session not found");

  const concept = CONCEPTS.find((c) => c.id === sessionData.concept_id);
  const character = CHARACTERS.find((c) => c.id === sessionData.character_id);
  if (!concept || !character) throw new ValidationError("Concept or character not found");

  const profile = await getProfile(db, user.id);
  const sessionDifficulty = (sessionData.difficulty as number) ?? 3;

  // Build transcript for context
  const transcript = (sessionData.roleplay_transcript as Array<{ role: string; content: string }>) || [];
  const messages = [
    ...transcript.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message },
  ];

  const roleplayPrompt = `You are ${character.name}.

${character.personality}

## Communication Style
${character.communication_style}

## Hidden Motivation (DO NOT reveal directly — let it emerge through behaviour)
${character.hidden_motivation}

## Your Tactics (deploy these naturally, not all at once)
${character.tactics.map((t) => `- ${t}`).join("\n")}

## Scenario Context
The user (${profile.display_name}) is practising the concept of **${concept.name}** (${concept.source}).
Their professional context: ${profile.professional_context || "Senior professional in a high-stakes environment."}

${difficultyModifier(sessionDifficulty)}

## Rules
- NEVER break character
- NEVER acknowledge you are an AI or that this is a simulation
- Respond in 2-4 sentences maximum — this is a real-time conversation, not a monologue
- React naturally to the user's approach — escalate or concede based on realistic behavioural logic
- If the user deploys ${concept.name} effectively, show a realistic response to that technique
- If the user is ineffective, maintain or increase pressure`;

  // Append user message to transcript immediately
  const updatedTranscript = [...transcript, { role: "user", content: message }];

  const stream = streamResponse(roleplayPrompt, messages, PHASE_CONFIG.roleplay, async (fullAssistantResponse) => {
    // Persist both user message AND assistant response to session transcript
    const completeTranscript = [...updatedTranscript, { role: "assistant", content: fullAssistantResponse }];
    const { error: updateError } = await db.from("sessions")
      .update({ roleplay_transcript: completeTranscript })
      .eq("id", session_id)
      .eq("user_id", user.id);
    if (updateError) {
      console.log(JSON.stringify({ level: "error", service: "session", operation: "transcript_persist", message: updateError.message, timestamp: new Date().toISOString() }));
    }
  });

  // Save the user message immediately (assistant response saved in onComplete callback above)
  await db
    .from("sessions")
    .update({ roleplay_transcript: updatedTranscript })
    .eq("id", session_id)
    .eq("user_id", user.id);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Character": character.name,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/session/coach — /coach Command (parallel, Haiku)
// ---------------------------------------------------------------------------

session.post("/coach", rateLimit(10), zValidator("json", CoachRequestSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const { session_id, transcript } = c.req.valid("json");

  const { data: sessionData } = await db
    .from("sessions")
    .select("concept_id")
    .eq("id", session_id)
    .eq("user_id", user.id)
    .single();

  if (!sessionData) throw new ValidationError("Session not found");

  const concept = CONCEPTS.find((c) => c.id === sessionData.concept_id);

  const coachPrompt = `You are an elite influence coach providing real-time tactical advice during a roleplay simulation.

The user is practising: **${concept?.name ?? "unknown"}** (${concept?.source ?? "unknown"})

Review the transcript below and provide:
1. What the user is doing well (1 sentence)
2. What to try next — a specific tactical move with exact phrasing they could use (2-3 sentences)

Be direct. No preamble. Under 150 words total.`;

  const advice = await generateResponse(
    coachPrompt,
    transcript.map((m) => ({ role: m.role, content: m.content })),
    PHASE_CONFIG.coach
  );

  // Atomic append using raw SQL to avoid read-then-write race between concurrent /coach calls
  const { error: appendError } = await db.rpc("append_coach_message", {
    p_session_id: session_id,
    p_user_id: user.id,
    p_message: advice,
    p_command: "/coach",
  });

  // Fallback to read-then-write if RPC not available (e.g. function not yet deployed)
  if (appendError) {
    const { data: currentSession } = await db
      .from("sessions")
      .select("coach_messages, commands_used")
      .eq("id", session_id)
      .eq("user_id", user.id)
      .single();

    const existingCoach = (currentSession?.coach_messages as string[]) ?? [];
    const existingCommands = (currentSession?.commands_used as string[]) ?? [];

    await db
      .from("sessions")
      .update({
        coach_messages: [...existingCoach, advice],
        commands_used: [...new Set([...existingCommands, "/coach"])],
      })
      .eq("id", session_id)
      .eq("user_id", user.id);
  }

  return c.json({ success: true, data: { advice } });
});

// ---------------------------------------------------------------------------
// POST /v1/session/debrief — Phase 3: Scoring & Analysis
// ---------------------------------------------------------------------------

session.post("/debrief", rateLimit(5), zValidator("json", DebriefRequestSchema), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);
  const { session_id, self_assessment } = c.req.valid("json");

  const { data: sessionData } = await db
    .from("sessions")
    .select("concept_id, character_id, roleplay_transcript, commands_used, day, difficulty, phase")
    .eq("id", session_id)
    .eq("user_id", user.id)
    .single();

  if (!sessionData) throw new ValidationError("Session not found");

  if (sessionData.phase !== "roleplay") {
    throw new ValidationError(`Session not ready for debrief. Current phase: ${sessionData.phase}`);
  }

  const concept = CONCEPTS.find((c) => c.id === sessionData.concept_id);
  const character = CHARACTERS.find((c) => c.id === sessionData.character_id);
  const transcript = sessionData.roleplay_transcript as Array<{ role: string; content: string }>;
  const debriefDifficulty = (sessionData.difficulty as number) ?? 3;

  const profile = await getProfile(db, user.id);
  const ledgerSummary = await serialiseForPrompt(db, user.id);
  const completedConcepts = await getCompletedConcepts(db, user.id);
  const systemContext = buildSystemContext(profile, ledgerSummary, completedConcepts);
  const ledgerCount = await getLedgerCount(db, user.id);
  const recentScores = await getRecentScores(db, user.id, 7);
  const scoringContext = generateScoringContext(recentScores);

  const coldStartGuard = ledgerCount < 3
    ? "\n\nIMPORTANT: This user has fewer than 3 prior sessions. Focus ENTIRELY on the current session's execution. Do NOT attempt to identify longitudinal behavioural patterns or make cross-session comparisons — there is insufficient data."
    : "\n\nThe user has 3+ prior sessions. You SHOULD identify recurring behavioural patterns from the session history and make specific callbacks to previous sessions.";

  // Self-assessment integration — builds metacognition
  const selfAssessmentBlock = self_assessment
    ? `\n\n### User Self-Assessment (submitted before seeing your analysis)
The user scored themselves:
- Technique Application: ${self_assessment.technique_application}/5
- Tactical Awareness: ${self_assessment.tactical_awareness}/5
- Frame Control: ${self_assessment.frame_control}/5
- Emotional Regulation: ${self_assessment.emotional_regulation}/5
- Strategic Outcome: ${self_assessment.strategic_outcome}/5

IMPORTANT: Compare your scores to the user's self-assessment. If there is a significant gap (2+ points) on any dimension, explicitly call it out. If the user over-rated themselves, explain what they missed. If they under-rated themselves, acknowledge the skill they didn't recognise.`
    : "";

  const debriefPrompt = `${systemContext}

## Phase 3: Debrief — Forensic Performance Analysis

You are an elite executive coach delivering a forensic debrief of a roleplay simulation.

### Session Context
- Concept practised: ${concept?.name} (${concept?.source})
- Character faced: ${character?.name}
- Difficulty level: ${debriefDifficulty}/5
- Commands used: ${sessionData.commands_used?.join(", ") || "none"}
${difficultyContext(debriefDifficulty)}

### Roleplay Transcript
${transcript.map((m) => `**${m.role === "user" ? profile.display_name : character?.name ?? "Character"}:** ${m.content}`).join("\n\n")}

${SCORING_RUBRIC}

${scoringContext}
${coldStartGuard}
${selfAssessmentBlock}

### Required Output Format

Deliver your debrief in this exact structure:

1. **Opening** (1 sentence): Overall performance assessment — blunt, no softening.

2. **What Worked** (2-3 bullet points): Specific moments where the user was effective. Quote their exact words.

3. **What Didn't Work** (2-3 bullet points): Specific moments where the user was ineffective. Quote their exact words and provide the exact alternative phrasing they should have used.

4. **Scores** — Output in this exact format:
---SCORES---
technique_application: [1-5]
tactical_awareness: [1-5]
frame_control: [1-5]
emotional_regulation: [1-5]
strategic_outcome: [1-5]
---END_SCORES---

5. **Ledger Data** — Output in this exact format:
---LEDGER---
behavioral_weakness_summary: [2 sentences describing the user's primary behavioral weakness this session, with specific reference to transcript moments]
key_moment: [The single most important turn — what happened vs. what should have happened]
---END_LEDGER---

For EACH score, you MUST cite the specific transcript turn that justifies it.`;

  const debriefText = await generateResponseViaStream(
    debriefPrompt,
    [{ role: "user", content: "Debrief my performance." }],
    PHASE_CONFIG.debrief
  );

  // Parse scores and ledger fields
  const scores = parseScores(debriefText);
  const ledgerFields = parseLedgerFields(debriefText);

  // Validate that AI generated parseable scores — without them the ledger would be corrupted
  if (!scores) {
    throw new ValidationError(
      "AI failed to generate valid scores. Please retry the debrief."
    );
  }
  if (!ledgerFields) {
    throw new ValidationError(
      "AI failed to generate valid ledger data. Please retry the debrief."
    );
  }

  // Update session
  const { error: updateError } = await db
    .from("sessions")
    .update({
      phase: "mission",
      debrief_content: debriefText,
      scores,
    })
    .eq("id", session_id)
    .eq("user_id", user.id);

  if (updateError) {
    throw new ValidationError(`Failed to save debrief: ${updateError.message}`);
  }

  return c.json({
    success: true,
    data: {
      debrief: debriefText,
      scores,
      ledger_fields: ledgerFields,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/session/mission — Phase 4: Real-World Mission
// ---------------------------------------------------------------------------

session.post("/mission", rateLimit(5), async (c) => {
  const user = c.get("user") as AuthUser;
  const db = createUserClient(c.get("token") as string);

  const body = await c.req.json();
  const sessionId = body.session_id;
  if (!sessionId) throw new ValidationError("session_id required");

  const { data: sessionData } = await db
    .from("sessions")
    .select("concept_id, character_id, scores, day, debrief_content, roleplay_transcript, commands_used, difficulty")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!sessionData) throw new ValidationError("Session not found");

  const concept = CONCEPTS.find((c) => c.id === sessionData.concept_id);
  const character = CHARACTERS.find((c) => c.id === sessionData.character_id);
  const profile = await getProfile(db, user.id);
  const ledgerSummary = await serialiseForPrompt(db, user.id);
  const completedConcepts = await getCompletedConcepts(db, user.id);
  const systemContext = buildSystemContext(profile, ledgerSummary, completedConcepts);

  const missionPrompt = `${systemContext}

## Phase 4: Real-World Mission Deployment

Generate ONE specific, concrete micro-mission for the user to execute in a real professional interaction within the next 24 hours.

### Context
- Today's concept: ${concept?.name} (${concept?.source})
- The user's professional context: ${profile.professional_context || "Senior professional"}
- Their weak areas from today's debrief should inform the mission focus

### Mission Requirements
- Must be actionable within 24 hours
- Must relate to today's concept
- Must be specific enough that the outcome is observable
- Must include a brief rationale (1 sentence) explaining why this reinforces today's learning
- Under 100 words total

Format:
MISSION: [the specific action]
RATIONALE: [why this reinforces the learning]`;

  const missionText = await generateResponse(
    missionPrompt,
    [{ role: "user", content: "Generate my mission." }],
    PHASE_CONFIG.mission
  );

  // Extract mission text
  const missionMatch = missionText.match(/MISSION:\s*(.+?)(?:\nRATIONALE:|\n\n|$)/s);
  const rationaleMatch = missionText.match(/RATIONALE:\s*(.+?)$/s);
  const mission = missionMatch?.[1]?.trim() ?? missionText;
  const rationale = rationaleMatch?.[1]?.trim() ?? "";

  // Parse scores from session
  const scores = sessionData.scores as SessionScores | null;
  const debriefText = sessionData.debrief_content as string | null;
  const ledgerFields = debriefText ? parseLedgerFields(debriefText) : null;

  // Write ledger entry
  if (concept && character && scores) {
    const ledgerEntry: LedgerEntry = {
      day: sessionData.day,
      date: new Date().toISOString().split("T")[0],
      concept: `${concept.name} (${concept.source})`,
      domain: concept.domain,
      character: character.name,
      difficulty: (sessionData.difficulty as number) ?? 3,
      scores,
      behavioral_weakness_summary: ledgerFields?.behavioral_weakness_summary ?? "",
      key_moment: ledgerFields?.key_moment ?? "",
      mission,
      mission_outcome: "",
      commands_used: sessionData.commands_used ?? [],
      session_completed: true,
    };

    await appendEntry(db, user.id, ledgerEntry);

    // Update spaced repetition
    await updateSREntry(db, user.id, concept.id, scores as unknown as Record<string, number>);
  }

  // Mark session complete
  const { error: phaseError } = await db
    .from("sessions")
    .update({ phase: "complete", mission })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (phaseError) throw new ValidationError(`Phase update failed: ${phaseError.message}`);

  return c.json({
    success: true,
    data: { mission, rationale },
  });
});

export default session;

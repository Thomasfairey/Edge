"use client";

/**
 * Session page — manages the full daily loop.
 * Day 1:  Learn -> Retrieval -> Simulate -> Debrief -> Mission
 * Day 2+: Learn -> Retrieval -> Simulate -> Debrief -> Check-in -> Mission
 *
 * Tiimo-inspired: phase-coloured backgrounds, super-rounded cards, soft pastels,
 * emoji command circles, coloured score dots, confetti completion.
 *
 * All state management, API calls, and phase transitions live in useSession.
 * This file is purely rendering / JSX.
 */

import { useSession } from "./hooks/useSession";

// Components
import PhaseIndicator from "./components/PhaseIndicator";
import LessonPhase from "./components/LessonPhase";
import RetrievalPhase from "./components/RetrievalPhase";
import RoleplayPhase from "./components/RoleplayPhase";
import DebriefPhase from "./components/DebriefPhase";
import MissionPhase from "./components/MissionPhase";
import CheckinPhase from "./components/CheckinPhase";
import SessionToolbar from "./components/SessionToolbar";

// Shared helpers & constants
import {
  PHASE_BG,
  haptic,
  renderMarkdown,
  LoadingDots,
} from "./components/types";

// ---------------------------------------------------------------------------
// Main session component
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const s = useSession();

  const isRoleplay = s.currentPhase === "roleplay";
  const phaseBg = PHASE_BG[s.currentPhase] || "#FAF9F6";
  const phaseClass = s.phaseAnimation === "enter" ? "phase-enter" : s.phaseAnimation === "active" ? "phase-active" : "phase-exit";

  return (
    <div
      className="session-page flex flex-col h-dvh overflow-hidden phase-bg-transition"
      style={{ backgroundColor: phaseBg }}
    >
      {/* Phase indicator with exit button */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => s.setShowExitModal(true)}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-50 touch-target rounded-full"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Leave session"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <PhaseIndicator current={s.currentPhase} completed={s.completedPhases} />

        {/* Global voice toggle */}
        <button
          onClick={s.voice.toggleVoice}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-50 flex h-10 w-10 items-center justify-center rounded-full transition-all ${
            s.voice.voiceEnabled
              ? "bg-[var(--accent)] text-white"
              : "bg-[#F0EDE8] text-secondary"
          }`}
          aria-label={s.voice.voiceEnabled ? "Mute audio" : "Enable audio"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
            {s.voice.voiceEnabled ? (
              <>
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06Z" />
                <path d="M18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
              </>
            ) : (
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z" />
            )}
          </svg>
        </button>
      </div>

      {/* Offline banner */}
      {!s.online && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--coach-bg)", color: "var(--coach-muted)" }}>
          Offline &mdash; reconnecting...
        </div>
      )}

      {s.restored && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          Session restored
        </div>
      )}

      {/* Review session badge */}
      {s.isReviewSession && s.currentPhase === "lesson" && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          Review session
        </div>
      )}

      {/* Scrollable content */}
      <div ref={isRoleplay ? s.chatContainerRef : undefined} className="chat-container flex-1 overflow-y-auto px-4 sm:px-6">
        <div className={`mx-auto max-w-lg py-5 sm:py-8 ${phaseClass}`}>

          {s.error && (
            <div className="mb-5 card text-center">
              <p className="text-body" style={{ color: "var(--score-low)" }}>{s.error}</p>
              <div className="mt-4 flex items-center justify-center gap-5">
                <button onClick={s.retry} className="touch-target text-caption font-semibold underline" style={{ color: "var(--accent)" }}>
                  Retry
                </button>
                {s.canSkipDebrief && s.currentPhase === "debrief" && (
                  <button onClick={s.skipDebriefToMission} className="touch-target text-caption font-medium underline" style={{ color: "var(--text-secondary)" }}>
                    Skip to mission
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* ONBOARDING                                                      */}
          {/* ============================================================== */}
          {s.onboardingNeeded && (
            <div className="space-y-6 animate-fade-in-up">
              {s.onboardingStep === "bio" && (
                <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]">
                  <h2 className="text-xl font-semibold text-primary mb-2">
                    Welcome to The Edge{s.onboardingDisplayName ? `, ${s.onboardingDisplayName}` : ""}
                  </h2>
                  <p className="text-sm text-secondary mb-5">
                    Before we begin, tell me about yourself. Your role, your company,
                    what you&apos;re working on, and what you&apos;re trying to achieve.
                  </p>
                  <p className="text-xs text-tertiary mb-4">
                    This is used to personalise every scenario, lesson, and mission to your world.
                  </p>

                  <textarea
                    className="w-full rounded-2xl border border-[#E8E5E0] bg-[#FAF9F6] px-4 py-3 text-sm text-primary placeholder-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    rows={5}
                    placeholder="e.g. I'm the CEO of a fintech startup. We're raising our seed round and trying to sign our first enterprise clients in banking. I need to get better at high-stakes negotiations and investor pitches..."
                    value={s.onboardingBio}
                    onChange={(e) => s.setOnboardingBio(e.target.value)}
                    maxLength={2000}
                  />

                  <div className="flex items-center justify-between mt-3">
                    {s.voice.sttSupported && s.voice.voiceEnabled && (
                      <button
                        onClick={() => {
                          if (s.voice.state === "listening") {
                            s.voice.stopListening();
                          } else {
                            s.voice.startListening();
                          }
                        }}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                          s.voice.state === "listening"
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[#EEEDFF] text-[var(--accent)]"
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                          <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                        </svg>
                        {s.voice.state === "listening" ? "Listening..." : "Speak"}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (s.onboardingBio.trim().length >= 20) {
                          s.setOnboardingStep("style");
                          haptic();
                        }
                      }}
                      disabled={s.onboardingBio.trim().length < 20}
                      className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>

                  {s.voice.state === "listening" && s.voice.interimTranscript && (
                    <p className="mt-2 text-xs text-secondary italic">{s.voice.interimTranscript}</p>
                  )}
                </div>
              )}

              {s.onboardingStep === "style" && (
                <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]">
                  <h2 className="text-lg font-semibold text-primary mb-2">
                    How do you prefer feedback?
                  </h2>
                  <p className="text-sm text-secondary mb-5">
                    This shapes how The Edge speaks to you — in debriefs, coaching, and missions.
                  </p>

                  <div className="space-y-3">
                    {([
                      { value: "direct" as const, label: "Direct & blunt", desc: "No softening. Tell me exactly what I did wrong.", color: "#E88B8B" },
                      { value: "balanced" as const, label: "Balanced", desc: "Clear and honest, but measured. Direct without being harsh.", color: "#F5C563" },
                      { value: "supportive" as const, label: "Supportive", desc: "Encouraging with constructive framing. Still honest, but warm.", color: "#6BC9A0" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          haptic();
                          s.completeOnboarding(opt.value);
                        }}
                        className="w-full rounded-2xl border-2 border-[#E8E5E0] bg-[#FAF9F6] p-4 text-left transition-all hover:border-[var(--accent)]/30 active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                          <div>
                            <p className="text-sm font-semibold text-primary">{opt.label}</p>
                            <p className="text-xs text-secondary mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => s.setOnboardingStep("bio")}
                    className="mt-4 text-xs text-secondary underline"
                  >
                    Back
                  </button>
                </div>
              )}

              {s.onboardingStep === "saving" && (
                <div className="text-center py-8">
                  <p className="mb-2 text-sm text-secondary">Setting up your profile...</p>
                  <LoadingDots />
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* LEARN                                                           */}
          {/* ============================================================== */}
          {s.currentPhase === "lesson" && !s.onboardingNeeded && (
            <LessonPhase
              isLoading={s.isLoading}
              lessonContent={s.lessonContent}
              lessonStreaming={s.lessonStreaming}
              concept={s.concept}
              isReviewSession={s.isReviewSession}
              onboardingNeeded={s.onboardingNeeded}
              onLessonCardChange={s.onLessonCardChange}
              lessonCardAdvanceRef={s.lessonCardAdvanceRef}
              voice={s.voiceProps}
            />
          )}

          {/* ============================================================== */}
          {/* RETRIEVAL                                                       */}
          {/* ============================================================== */}
          {s.currentPhase === "retrieval" && (
            <RetrievalPhase
              isLoading={s.isLoading}
              retrievalQuestion={s.retrievalQuestion}
              retrievalResponse={s.retrievalResponse}
              retrievalReady={s.retrievalReady}
              inputValue={s.inputValue}
              setInputValue={s.setInputValue}
              submitRetrievalResponse={s.submitRetrievalResponse}
              startRoleplay={s.startRoleplay}
              voice={s.voiceProps}
            />
          )}

          {/* ============================================================== */}
          {/* SIMULATE                                                        */}
          {/* ============================================================== */}
          {s.currentPhase === "roleplay" && (
            <RoleplayPhase
              character={s.character}
              roleplayTranscript={s.roleplayTranscript}
              scenarioContext={s.scenarioContext}
              turnCount={s.turnCount}
              isLoading={s.isLoading}
              isStreaming={s.isStreaming}
              streamingText={s.streamingText}
              resetNotice={s.resetNotice}
              pendingRetry={s.pendingRetry}
              sendRoleplayMessage={s.sendRoleplayMessage}
              chatEndRef={s.chatEndRef}
            />
          )}

          {/* ============================================================== */}
          {/* DEBRIEF                                                         */}
          {/* ============================================================== */}
          {s.currentPhase === "debrief" && (
            <DebriefPhase
              isLoading={s.isLoading}
              debriefContent={s.debriefContent}
              scores={s.scores}
              previousScores={s.previousScores}
            />
          )}

          {/* ============================================================== */}
          {/* DEPLOY (check-in + mission)                                    */}
          {/* ============================================================== */}
          {s.currentPhase === "mission" && (
            <>
              <CheckinPhase
                checkinNeeded={s.checkinNeeded}
                checkinDone={s.checkinDone}
                checkinPillSelected={s.checkinPillSelected}
                setCheckinPillSelected={s.setCheckinPillSelected}
                checkinResponse={s.checkinResponse}
                lastMission={s.lastMission}
                isLoading={s.isLoading}
                mission={s.mission}
                inputValue={s.inputValue}
                setInputValue={s.setInputValue}
                submitCheckin={s.submitCheckin}
                voice={s.voiceProps}
              />

              {s.mission && !s.isLoading && !s.checkinResponse && (
                <MissionPhase
                  isLoading={s.isLoading}
                  mission={s.mission}
                  rationale={s.rationale}
                  scores={s.scores}
                  previousScores={s.previousScores}
                  concept={s.concept}
                  dayNumber={s.dayNumber}
                  keyMoment={s.keyMoment}
                  showConfetti={s.showConfetti}
                  completeSession={s.completeSession}
                  onDone={() => s.router.push("/")}
                />
              )}
            </>
          )}

        </div>
      </div>

      {/* ================================================================== */}
      {/* Sticky CTA (learn phase)                                            */}
      {/* ================================================================== */}
      {s.currentPhase === "lesson" && s.lessonContent && !s.isLoading && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.lesson, borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-lg">
            {s.lessonCardPos.current < s.lessonCardPos.total - 1 ? (
              <p className="py-3 text-center text-body" style={{ color: "var(--text-secondary)" }}>
                {s.lessonCardPos.current + 1} of {s.lessonCardPos.total} &mdash; swipe to continue
              </p>
            ) : (
              <button onClick={() => s.startRetrieval()} className="btn-primary animate-fade-in-up">
                Ready to practise &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Sticky continue button (debrief)                                    */}
      {/* ================================================================== */}
      {s.currentPhase === "debrief" && s.debriefContent && !s.isLoading && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.debrief, borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-lg">
            <button onClick={s.enterDeploy} className="btn-primary" style={{ backgroundColor: "var(--phase-debrief-muted)" }}>
              Your mission &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Fixed bottom bar (roleplay)                                         */}
      {/* ================================================================== */}
      <SessionToolbar
        isRoleplay={isRoleplay}
        completedRoleplay={s.completedPhases.has("roleplay")}
        inputValue={s.inputValue}
        setInputValue={s.setInputValue}
        inputRef={s.inputRef}
        isStreaming={s.isStreaming}
        isLoading={s.isLoading}
        voice={s.voiceProps}
        character={s.character}
        handleRoleplayInput={s.handleRoleplayInput}
        handleCoach={s.handleCoach}
        handleReset={s.handleReset}
        handleSkip={s.handleSkip}
        handleDone={s.handleDone}
      />

      {/* New message pill */}
      {s.showNewMessagePill && isRoleplay && (
        <button
          onClick={() => { s.chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); s.setShowNewMessagePill(false); }}
          className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-caption font-semibold"
          style={{ backgroundColor: "var(--accent)", color: "white", boxShadow: "var(--shadow-accent)" }}
        >
          &darr; New message
        </button>
      )}

      {/* ================================================================== */}
      {/* Floating voice indicator (non-roleplay phases)                      */}
      {/* ================================================================== */}
      {s.voice.voiceEnabled && !isRoleplay && s.voice.state === "speaking" && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-1.5 h-5 text-[var(--accent)]">
            <span className="voice-bar" />
            <span className="voice-bar" />
            <span className="voice-bar" />
          </div>
          <span className="text-sm font-medium text-secondary">Speaking...</span>
          <button
            onClick={s.voice.stopSpeaking}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0EDE8] text-secondary transition-transform active:scale-[0.93]"
            title="Stop"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* Exit confirmation modal                                             */}
      {/* ================================================================== */}
      {s.showExitModal && (
        <>
          <div className="fixed inset-0 z-[60] backdrop-blur-overlay" style={{ backgroundColor: "rgba(0,0,0,0.2)" }} onClick={() => s.setShowExitModal(false)} />
          <div className="fixed inset-x-5 top-1/2 z-[70] mx-auto max-w-sm -translate-y-1/2 card" style={{ padding: "28px 24px", boxShadow: "var(--shadow-elevated)" }}>
            <p className="text-lead font-semibold" style={{ color: "var(--text-primary)" }}>Leave session?</p>
            <p className="mt-2 mb-6 text-body" style={{ color: "var(--text-secondary)" }}>Your progress will be saved. You can resume within 30 minutes.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  s.saveSession();
                  s.router.push("/");
                }}
                className="btn-primary flex-1"
                style={{ backgroundColor: "var(--score-low)", color: "var(--score-low-text)", boxShadow: "none" }}
              >
                Leave
              </button>
              <button
                onClick={() => s.setShowExitModal(false)}
                className="btn-secondary flex-1"
              >
                Stay
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* Coach panel                                                         */}
      {/* ================================================================== */}
      {(s.coachAdvice || s.coachLoading) && (
        <>
          <div
            className="fixed inset-0 z-40 backdrop-blur-overlay sm:hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.1)" }}
            onClick={() => s.dismissCoach()}
          />
          <div
            className="fixed inset-x-0 bottom-0 top-[40%] z-50 overflow-y-auto p-6 sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:top-0 sm:w-80 sm:max-w-[90vw] sm:rounded-none"
            style={{
              backgroundColor: "var(--coach-bg)",
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              boxShadow: "var(--shadow-elevated)",
            }}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full sm:hidden" style={{ backgroundColor: "var(--border)" }} />
            <div className="mb-5 flex items-center justify-between">
              <span className="text-body font-semibold" style={{ color: "var(--coach-muted)" }}>Mentor</span>
              <button
                onClick={() => s.dismissCoach()}
                className="touch-target text-lead"
                style={{ color: "var(--text-secondary)" }}
              >
                &times;
              </button>
            </div>
            {s.coachLoading ? <LoadingDots /> : (
              <div className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{renderMarkdown(s.coachAdvice!)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

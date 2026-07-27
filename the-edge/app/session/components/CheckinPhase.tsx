"use client";

/**
 * Check-in — what actually happened with yesterday's mission.
 *
 * Three taps, in this order: did the moment come up, did you do it, what did
 * they do. The first question is the one that matters most. A mission whose
 * trigger never arrived is not a failure, and the old single "how did it go?"
 * with a Skip button gave the user no way to say so — every unrun mission
 * looked like the same thing.
 */

import type { VoiceProps } from "./types";
import { PHASE_BG, haptic, LoadingDots } from "./types";
import { checkinStep, type CheckinState, type Enactment } from "@/lib/checkin";

interface CheckinPhaseProps {
  checkinNeeded: boolean;
  checkinDone: boolean;
  checkin: CheckinState;
  setCheckin: (next: CheckinState) => void;
  checkinResponse: string | null;
  lastMission: string | null;
  lastCommitment: string | null;
  isLoading: boolean;
  mission: string | null;
  inputValue: string;
  setInputValue: (val: string) => void;
  submitCheckin: (state: CheckinState) => void;
  voice: VoiceProps;
}

const ENACTMENT_OPTIONS: { value: Enactment; label: string; tint: string; text: string }[] = [
  { value: "yes", label: "I did it", tint: "var(--phase-deploy)", text: "var(--score-high-text)" },
  { value: "partly", label: "Sort of", tint: "var(--score-mid-bg)", text: "var(--score-mid-text)" },
  { value: "no", label: "I didn’t", tint: "var(--border)", text: "var(--text-secondary)" },
];

function Choice({
  label,
  selected,
  tint,
  text,
  onClick,
}: {
  label: string;
  selected: boolean;
  tint: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => { haptic(); onClick(); }}
      aria-pressed={selected}
      className="flex-1 text-body font-semibold transition-all"
      style={{
        backgroundColor: selected ? tint : "var(--border)",
        color: selected ? text : "var(--text-secondary)",
        borderRadius: "var(--radius-md)",
        padding: "14px 16px",
        boxShadow: selected ? `0 0 0 2px ${text}` : "none",
      }}
    >
      {label}
    </button>
  );
}

export default function CheckinPhase({
  checkinNeeded,
  checkinDone,
  checkin,
  setCheckin,
  checkinResponse,
  lastMission,
  lastCommitment,
  isLoading,
  mission,
  inputValue,
  setInputValue,
  submitCheckin,
  voice,
}: CheckinPhaseProps) {
  const step = checkinStep(checkin);
  const showCard = checkinNeeded && !checkinDone && !isLoading && !mission;

  return (
    <>
      {showCard && (
        <div className="animate-fade-in-up space-y-5">
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="mb-1 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--phase-deploy-muted)" }}>Yesterday</p>
            <p className="mb-1 text-caption" style={{ color: "var(--text-secondary)" }}>
              You said you would{lastCommitment ? `, ${lastCommitment.toLowerCase()}` : ""}:
            </p>
            <p className="mb-5 text-body font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
              &ldquo;{lastMission}&rdquo;
            </p>

            {/*
              1. Did the moment come up? Asked first and asked separately,
              because not getting the chance is a fact about the week rather
              than about the user.
            */}
            <p className="mb-3 text-body font-medium" style={{ color: "var(--text-primary)" }}>
              Did the moment come up?
            </p>
            <div className="flex gap-3">
              <Choice
                label="Yes"
                selected={checkin.opportunity === true}
                tint="var(--phase-deploy)"
                text="var(--score-high-text)"
                onClick={() => setCheckin({ ...checkin, opportunity: true, enacted: null })}
              />
              <Choice
                label="Never came up"
                selected={checkin.opportunity === false}
                tint="var(--score-mid-bg)"
                text="var(--score-mid-text)"
                onClick={() => setCheckin({ ...checkin, opportunity: false, enacted: null, outcome: "" })}
              />
            </div>

            {/* 2. Did you do it? */}
            {checkin.opportunity === true && (
              <div className="mt-6 animate-fade-in-up">
                <p className="mb-3 text-body font-medium" style={{ color: "var(--text-primary)" }}>
                  Did you do it?
                </p>
                <div className="flex gap-3">
                  {ENACTMENT_OPTIONS.map((option) => (
                    <Choice
                      key={option.value}
                      label={option.label}
                      selected={checkin.enacted === option.value}
                      tint={option.tint}
                      text={option.text}
                      onClick={() => setCheckin({ ...checkin, enacted: option.value })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/*
              3. What did they do? Only asked when there was something for the
              other person to react to — "you didn't do it, how did they
              respond?" is a nonsense question.
            */}
            {step === "outcome" && (
              <div className="mt-6 animate-fade-in-up space-y-3">
                <p className="text-body font-medium" style={{ color: "var(--text-primary)" }}>
                  What did they do?
                </p>

                {voice.voiceEnabled && voice.state === "listening" ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="flex items-center gap-1.5 h-6 text-[var(--accent)]">
                      <span className="voice-bar" />
                      <span className="voice-bar" />
                      <span className="voice-bar" />
                    </div>
                    <p className="text-sm text-secondary">{voice.interimTranscript || "Listening..."}</p>
                    <button
                      onClick={voice.stopListening}
                      className="voice-listening flex h-12 w-12 items-center justify-center rounded-full text-white"
                      aria-label="Stop recording"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                        <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Did they lean in? Change the subject? Nothing?"
                      className="flex-1 rounded-2xl border-none px-4 py-3 text-base text-primary placeholder-tertiary outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                      style={{ backgroundColor: PHASE_BG.mission }}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitCheckin({ ...checkin, outcome: inputValue.trim() });
                      }}
                      autoFocus
                    />
                    {voice.voiceEnabled && !inputValue.trim() && (
                      <button
                        onClick={voice.startListening}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-transform active:scale-[0.97]"
                        title="Speak"
                        aria-label="Speak your answer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                          <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                          <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                {voice.micError && (
                  <p className="text-xs text-red-500 px-1">{voice.micError}</p>
                )}
              </div>
            )}

            {/* The free-text answer is optional — a tap is a complete check-in. */}
            {(step === "ready" || step === "outcome") && (
              <button
                onClick={() => { haptic(); submitCheckin({ ...checkin, outcome: inputValue.trim() }); }}
                className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
              >
                {step === "outcome" && !inputValue.trim() ? "Skip the detail" : "Continue"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Check-in response */}
      {checkinResponse && (
        <div className="animate-fade-in-up card text-center" style={{ padding: "24px" }}>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Mentor</p>
          <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{checkinResponse}</p>
        </div>
      )}

      {/* Loading mission */}
      {isLoading && !checkinResponse && (
        <div className="text-center py-8">
          <p className="text-body" style={{ color: "var(--text-secondary)" }}>Assigning your mission...</p>
          <LoadingDots />
        </div>
      )}
    </>
  );
}

"use client";

import type { VoiceProps } from "./types";
import { PHASE_BG, haptic, LoadingDots } from "./types";

interface CheckinPhaseProps {
  checkinNeeded: boolean;
  checkinDone: boolean;
  checkinPillSelected: "completed" | "tried" | null;
  setCheckinPillSelected: (val: "completed" | "tried" | null) => void;
  checkinResponse: string | null;
  lastMission: string | null;
  isLoading: boolean;
  mission: string | null;
  inputValue: string;
  setInputValue: (val: string) => void;
  submitCheckin: (outcomeType: "completed" | "tried" | "skipped", userOutcome?: string) => void;
  voice: VoiceProps;
}

export default function CheckinPhase({
  checkinNeeded,
  checkinDone,
  checkinPillSelected,
  setCheckinPillSelected,
  checkinResponse,
  lastMission,
  isLoading,
  mission,
  inputValue,
  setInputValue,
  submitCheckin,
  voice,
}: CheckinPhaseProps) {
  return (
    <>
      {/* Check-in card (Day 2+, before mission loads) */}
      {checkinNeeded && !checkinDone && !isLoading && !mission && (
        <div className="animate-fade-in-up space-y-5">
          <div className="card" style={{ padding: "28px 24px" }}>
            <p className="mb-1 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--phase-deploy-muted)" }}>Mission debrief</p>
            <p className="mb-1 text-caption" style={{ color: "var(--text-secondary)" }}>Yesterday you were asked to:</p>
            <p className="mb-5 text-body font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
              &ldquo;{lastMission}&rdquo;
            </p>
            <p className="mb-4 text-body font-medium" style={{ color: "var(--text-primary)" }}>How did it go?</p>

            {/* Outcome pills */}
            <div className="flex gap-3">
              <button
                onClick={() => { setCheckinPillSelected("completed"); haptic(); }}
                className={`flex-1 text-body font-semibold transition-all ${
                  checkinPillSelected === "completed" ? "animate-celebrate scale-[1.02]" : ""
                }`}
                style={{
                  backgroundColor: "var(--phase-deploy)",
                  color: "var(--score-high-text)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                  boxShadow: checkinPillSelected === "completed" ? "0 0 0 2px var(--score-high-text), 0 4px 12px rgba(107,201,160,0.3)" : "none",
                }}
              >
                &#9889; Nailed it
              </button>
              <button
                onClick={() => setCheckinPillSelected("tried")}
                className={`flex-1 text-body font-semibold transition-all ${
                  checkinPillSelected === "tried" ? "scale-[1.02]" : ""
                }`}
                style={{
                  backgroundColor: "var(--score-mid-bg)",
                  color: "var(--score-mid-text)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                  boxShadow: checkinPillSelected === "tried" ? "0 0 0 2px var(--score-mid-text), 0 4px 12px rgba(245,197,99,0.3)" : "none",
                }}
              >
                &#128075; Tried it
              </button>
              <button
                onClick={() => submitCheckin("skipped")}
                className="flex-1 text-body font-medium transition-transform"
                style={{
                  backgroundColor: "var(--border)",
                  color: "var(--text-secondary)",
                  borderRadius: "var(--radius-md)",
                  padding: "14px 16px",
                }}
              >
                Skip
              </button>
            </div>

            {/* Expandable input */}
            {checkinPillSelected && (
              <div className="mt-4 animate-fade-in-up space-y-3">
                <p className="text-center text-sm font-medium" style={{
                  color: checkinPillSelected === "completed" ? "#2D6A4F" : "#8B7024"
                }}>
                  {checkinPillSelected === "completed" ? "Nice work! Quick follow-up:" : "Good effort. Tell me more:"}
                </p>
                {/* Voice error banner for check-in */}
                {voice.micError && (
                  <div className="rounded-xl bg-[#FDF2F2] px-4 py-2.5 text-sm text-[#C4524B] text-center">
                    {voice.micError}
                  </div>
                )}
                {/* Voice listening state for check-in */}
                {voice.voiceEnabled && voice.state === "listening" && (
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
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                        <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                      </svg>
                    </button>
                  </div>
                )}

                {(!voice.voiceEnabled || voice.state !== "listening") && (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={checkinPillSelected === "completed" ? "What was the exact reaction?" : "What happened when you tried?"}
                        className="flex-1 rounded-2xl border-none px-4 py-3 text-base text-primary placeholder-tertiary outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                        style={{ backgroundColor: PHASE_BG.mission }}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) { submitCheckin(checkinPillSelected, inputValue.trim()); setInputValue(""); } }}
                        autoFocus
                      />
                      {voice.voiceEnabled && !inputValue.trim() && (
                        <button
                          onClick={voice.startListening}
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-transform active:scale-[0.97]"
                          title="Speak"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                            <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                            <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {voice.micError && (
                      <p className="text-xs text-red-500 px-1 -mt-1">{voice.micError}</p>
                    )}
                    <button
                      onClick={() => { if (inputValue.trim()) { submitCheckin(checkinPillSelected, inputValue.trim()); setInputValue(""); } }}
                      disabled={!inputValue.trim()}
                      className="w-full rounded-2xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                    >
                      Submit
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Check-in response */}
      {checkinResponse && (
        <div className="animate-fade-in-up card text-center">
          <p className="text-body leading-relaxed italic" style={{ color: "var(--text-secondary)" }}>{checkinResponse}</p>
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

"use client";

/**
 * Rehearse — the second go at the moment that went wrong.
 *
 * The debrief has just told the user what they should have done. This is where
 * they do it. The character's original line is shown verbatim, their own reply
 * greyed beneath it so the contrast is unavoidable, and the brief states the
 * principle without supplying the words — they have to write those themselves,
 * because writing them is the entire exercise.
 */

import type { VoiceProps, CharacterArchetype } from "./types";
import { LoadingDots, haptic } from "./types";
import type { RehearsalCue } from "@/lib/types";
import type { RehearseResult } from "@/lib/prompts/rehearse";

interface RehearsePhaseProps {
  isLoading: boolean;
  character: CharacterArchetype | null;
  rehearsalCue: RehearsalCue | null;
  rehearsalResult: RehearseResult | null;
  canRetryRehearsal: boolean;
  inputValue: string;
  setInputValue: (val: string) => void;
  submitRehearsal: (reply: string) => void;
  retryRehearsal: () => void;
  finishRehearsal: () => void;
  voice: VoiceProps;
}

const VERDICT_COPY: Record<RehearseResult["verdict"], { label: string; tint: string; text: string }> = {
  better: { label: "That landed", tint: "var(--score-high-bg)", text: "var(--score-high-text)" },
  same: { label: "Same move, new words", tint: "var(--score-mid-bg)", text: "var(--score-mid-text)" },
  worse: { label: "That went backwards", tint: "var(--score-low-bg)", text: "var(--score-low-text)" },
};

export default function RehearsePhase({
  isLoading,
  character,
  rehearsalCue,
  rehearsalResult,
  canRetryRehearsal,
  inputValue,
  setInputValue,
  submitRehearsal,
  retryRehearsal,
  finishRehearsal,
  voice,
}: RehearsePhaseProps) {
  if (!rehearsalCue) return null;

  const characterName = character?.name ?? "They";
  const submit = () => {
    if (inputValue.trim()) submitRehearsal(inputValue.trim());
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="text-center mb-1">
        <span className="badge" style={{ backgroundColor: "var(--phase-practise-tint, #FDF2F2)", color: "var(--text-secondary)" }}>
          Say it again
        </span>
      </div>

      {/* The moment, replayed */}
      <div className="card" style={{ padding: "24px" }}>
        <p className="mb-2 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {characterName} said
        </p>
        <p className="text-lead font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
          &ldquo;{rehearsalCue.cue}&rdquo;
        </p>

        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <p className="mb-1 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            What you said
          </p>
          <p className="text-body leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            &ldquo;{rehearsalCue.originalReply}&rdquo;
          </p>
        </div>
      </div>

      {/* The principle — deliberately not the phrasing */}
      <div className="card-tinted" style={{ backgroundColor: "var(--accent-soft)", padding: "18px 20px" }}>
        <p className="text-body font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
          {rehearsalCue.brief}
        </p>
        <p className="mt-2 text-caption" style={{ color: "var(--text-tertiary)" }}>
          Your words, not ours. Write what you&rsquo;d actually say.
        </p>
      </div>

      {/* The result of an attempt */}
      {rehearsalResult && (
        <div className="space-y-4 animate-fade-in-up">
          <div className="card" style={{ padding: "20px 24px" }}>
            <p className="mb-2 text-caption font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {characterName}
            </p>
            <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {rehearsalResult.response}
            </p>
          </div>

          <div
            className="card-tinted"
            style={{ backgroundColor: VERDICT_COPY[rehearsalResult.verdict].tint, padding: "18px 20px" }}
          >
            <p className="mb-1 text-body font-semibold" style={{ color: VERDICT_COPY[rehearsalResult.verdict].text }}>
              {VERDICT_COPY[rehearsalResult.verdict].label}
            </p>
            <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {rehearsalResult.comparison}
            </p>
          </div>

          <div className="space-y-3">
            {canRetryRehearsal && (
              <button onClick={retryRehearsal} className="btn-secondary w-full">
                Try that once more
              </button>
            )}
            <button onClick={finishRehearsal} className="btn-primary w-full">
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* The input */}
      {!rehearsalResult && (
        <div className="space-y-3">
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
            <>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={voice.voiceEnabled ? "Tap mic or type your reply..." : "What you'd say instead..."}
                  className="input-field flex-1"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  disabled={isLoading}
                  autoFocus
                />
                {voice.voiceEnabled && !inputValue.trim() && !isLoading && (
                  <button
                    onClick={voice.startListening}
                    className="touch-target flex-shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--accent)", color: "white" }}
                    title="Speak"
                    aria-label="Speak your reply"
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
              {isLoading ? (
                <div className="text-center py-2">
                  <LoadingDots />
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { haptic(); submit(); }}
                    disabled={!inputValue.trim()}
                    className="btn-primary w-full"
                    style={{
                      backgroundColor: inputValue.trim() ? "var(--accent)" : "var(--border)",
                      color: inputValue.trim() ? "white" : "var(--text-tertiary)",
                      boxShadow: inputValue.trim() ? "var(--shadow-accent)" : "none",
                    }}
                  >
                    Say it
                  </button>
                  {/* An escape hatch: nobody should be trapped by a moment they
                      don't want to replay. */}
                  <button
                    onClick={finishRehearsal}
                    className="w-full text-caption"
                    style={{ color: "var(--text-tertiary)", padding: "8px" }}
                  >
                    Skip this
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

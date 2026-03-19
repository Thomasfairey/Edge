"use client";

import type { VoiceProps } from "./types";
import { LoadingDots } from "./types";

interface RetrievalPhaseProps {
  isLoading: boolean;
  retrievalQuestion: string | null;
  retrievalResponse: string | null;
  retrievalReady: boolean;
  inputValue: string;
  setInputValue: (val: string) => void;
  submitRetrievalResponse: (response: string) => void;
  startRoleplay: () => void;
  voice: VoiceProps;
}

export default function RetrievalPhase({
  isLoading,
  retrievalQuestion,
  retrievalResponse,
  retrievalReady,
  inputValue,
  setInputValue,
  submitRetrievalResponse,
  startRoleplay,
  voice,
}: RetrievalPhaseProps) {
  return (
    <>
      {isLoading && !retrievalQuestion && (
        <div className="text-center">
          <p className="mb-2 text-sm text-secondary">One moment...</p>
          <LoadingDots />
        </div>
      )}

      {retrievalQuestion && (
        <div className="space-y-5 animate-challenge">
          <div className="text-center mb-1">
            <span className="badge" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
              Quick check
            </span>
          </div>
          <div className="card" style={{ padding: "24px" }}>
            <p className="text-center text-lead font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {retrievalQuestion}
            </p>
          </div>

          {retrievalResponse && (
            <div className="animate-fade-in-up card-tinted text-center" style={{ backgroundColor: "var(--accent-soft)", padding: "24px" }}>
              <p className="mb-1 text-body font-semibold" style={{ color: "var(--accent)" }}>Solid recall</p>
              <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{retrievalResponse}</p>
            </div>
          )}

          {!retrievalResponse && (
            <div className="space-y-3">
              {voice.micError && (
                <div className="rounded-xl bg-[#FDF2F2] px-4 py-2.5 text-sm text-[#C4524B] text-center">
                  {voice.micError}
                </div>
              )}
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
                      placeholder={voice.voiceEnabled ? "Tap mic or type..." : "Your answer..."}
                      className="input-field flex-1"
                      style={{ backgroundColor: "var(--phase-learn-tint)" }}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) { submitRetrievalResponse(inputValue.trim()); setInputValue(""); } }}
                      disabled={isLoading}
                      autoFocus
                    />
                    {voice.voiceEnabled && !inputValue.trim() && !isLoading && (
                      <button
                        onClick={voice.startListening}
                        className="touch-target flex-shrink-0 rounded-full"
                        style={{ backgroundColor: "var(--accent)", color: "white" }}
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
                    onClick={() => { if (inputValue.trim()) { submitRetrievalResponse(inputValue.trim()); setInputValue(""); } }}
                    disabled={isLoading || !inputValue.trim()}
                    className={inputValue.trim() ? "btn-primary" : "btn-primary"}
                    style={{
                      backgroundColor: inputValue.trim() ? "var(--accent)" : "var(--border)",
                      color: inputValue.trim() ? "white" : "var(--text-tertiary)",
                      boxShadow: inputValue.trim() ? "var(--shadow-accent)" : "none",
                    }}
                  >
                    {isLoading ? "Evaluating..." : "Submit"}
                  </button>
                </>
              )}
            </div>
          )}

          {retrievalResponse && !retrievalReady && (
            <button onClick={() => startRoleplay()} className="btn-primary">
              Continue to practice &rarr;
            </button>
          )}
        </div>
      )}
    </>
  );
}

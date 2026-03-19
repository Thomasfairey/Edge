"use client";

import type { CharacterArchetype, VoiceProps } from "./types";
import { LoadingDots } from "./types";

interface SessionToolbarProps {
  isRoleplay: boolean;
  completedRoleplay: boolean;
  inputValue: string;
  setInputValue: (val: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isStreaming: boolean;
  isLoading: boolean;
  voice: VoiceProps;
  character: CharacterArchetype | null;
  handleRoleplayInput: (value: string) => void;
  handleCoach: () => void;
  handleReset: () => void;
  handleSkip: () => void;
  handleDone: () => void;
}

export default function SessionToolbar({
  isRoleplay,
  completedRoleplay,
  inputValue,
  setInputValue,
  inputRef,
  isStreaming,
  isLoading,
  voice,
  character,
  handleRoleplayInput,
  handleCoach,
  handleReset,
  handleSkip,
  handleDone,
}: SessionToolbarProps) {
  if (!isRoleplay || completedRoleplay) return null;

  return (
    <div className="flex-shrink-0 bottom-bar bg-white px-4 pt-3 shadow-[var(--shadow-elevated)]" style={{ borderRadius: "var(--radius-xl) var(--radius-xl) 0 0" }}>

      {/* Voice listening state */}
      {voice.voiceEnabled && voice.state === "listening" && (
        <div className="flex flex-col items-center gap-3 mb-2 py-2">
          <div className="flex items-center gap-1.5 h-6 text-[var(--accent)]">
            <span className="voice-bar" />
            <span className="voice-bar" />
            <span className="voice-bar" />
          </div>
          <p className="text-sm text-secondary">
            {voice.interimTranscript || "Listening..."}
          </p>
          <button
            onClick={voice.stopListening}
            className="voice-listening flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-[0.93]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
              <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
              <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
            </svg>
          </button>
        </div>
      )}

      {/* Voice processing state */}
      {voice.voiceEnabled && voice.state === "processing" && (
        <div className="flex flex-col items-center gap-2 mb-2 py-2">
          <LoadingDots />
          <p className="text-sm text-secondary">{voice.interimTranscript || "Processing..."}</p>
        </div>
      )}

      {/* Voice error feedback */}
      {voice.micError && (
        <div className="mb-2 px-3 py-2 rounded-2xl text-center text-xs font-medium" style={{ backgroundColor: "#FFF8E7", color: "#C4A24E" }}>
          {voice.micError}
        </div>
      )}

      {/* Voice speaking state */}
      {voice.voiceEnabled && voice.state === "speaking" && (
        <div className="flex flex-col items-center gap-3 mb-2 py-2">
          <div className="flex items-center gap-1.5 h-6 text-[#D4908F]">
            <span className="voice-bar" />
            <span className="voice-bar" />
            <span className="voice-bar" />
          </div>
          <p className="text-sm text-secondary">{character?.name} is speaking...</p>
          <button
            onClick={() => { voice.stopSpeaking(); }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FDF2F2] text-[#D4908F] transition-transform active:scale-[0.93] voice-speaking"
            title="Stop speaking"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Normal text input */}
      {(!voice.voiceEnabled || (voice.state !== "listening" && voice.state !== "speaking" && voice.state !== "processing")) && (
        <div className="flex items-end gap-2 mb-2">
          <textarea
            ref={inputRef}
            placeholder={voice.voiceEnabled ? "Tap mic or type..." : "Type your response..."}
            rows={1}
            className="input-field flex-1 resize-none"
            style={{ backgroundColor: "var(--phase-simulate-tint)", maxHeight: "6rem", borderRadius: "var(--radius-md)" }}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 96) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && inputValue.trim() && !isStreaming) {
                e.preventDefault();
                handleRoleplayInput(inputValue);
              }
            }}
            disabled={isStreaming || isLoading}
          />

          {/* Mic button */}
          {voice.voiceEnabled && !inputValue.trim() && !isStreaming && !isLoading && (
            <button
              onClick={voice.startListening}
              className="touch-target rounded-full"
              style={{ backgroundColor: "var(--accent)", color: "white" }}
              title="Speak"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
              </svg>
            </button>
          )}

          {/* Send button */}
          {(!voice.voiceEnabled || inputValue.trim() || isStreaming || isLoading) && (
            <button
              onClick={() => { if (inputValue.trim() && !isStreaming) handleRoleplayInput(inputValue); }}
              disabled={isStreaming || isLoading || !inputValue.trim()}
              className="touch-target rounded-full disabled:opacity-40"
              style={{ backgroundColor: "var(--accent)", color: "white" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.637a.75.75 0 0 0 0-1.4L3.105 2.289Z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Mic error message */}
      {voice.micError && (
        <p className="text-xs text-red-500 text-center px-2 -mt-1 mb-1">{voice.micError}</p>
      )}

      {/* Command toolbar */}
      <div className="flex items-center justify-between px-1 pb-2">
        {/* Left: Assistance tools */}
        <div className="flex items-center gap-3">
          {voice.sttSupported && (
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={voice.toggleVoice}
                className="touch-target rounded-full transition-all"
                style={{
                  backgroundColor: voice.voiceEnabled ? "var(--accent)" : "var(--border)",
                  color: voice.voiceEnabled ? "white" : "var(--text-secondary)",
                  boxShadow: voice.voiceEnabled ? "var(--shadow-accent)" : "none",
                }}
                title={voice.voiceEnabled ? "Voice on" : "Voice off"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  {voice.voiceEnabled ? (
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
              <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Voice</span>
            </div>
          )}
          <div className="flex flex-col items-center gap-1">
            <button onClick={handleCoach} className="touch-target rounded-full text-lead" style={{ backgroundColor: "var(--coach-bg)" }} title="Coach">
              &#128161;
            </button>
            <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Hint</span>
          </div>
        </div>

        {/* Center: Session controls */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <button onClick={handleReset} className="touch-target rounded-full text-body" style={{ backgroundColor: "var(--border)" }} title="Reset">
              &#128260;
            </button>
            <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Reset</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={handleSkip} className="touch-target rounded-full text-body" style={{ backgroundColor: "var(--border)" }} title="Skip">
              &#9197;
            </button>
            <span className="text-caption" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Skip</span>
          </div>
        </div>

        {/* Right: Primary action */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={handleDone}
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-lead font-bold"
            style={{ backgroundColor: "var(--score-high)", color: "white", boxShadow: "0 3px 12px rgba(107,201,160,0.3)" }}
            title="Done"
          >
            &#10003;
          </button>
          <span className="text-caption font-medium" style={{ fontSize: 10, color: "var(--score-high-text)" }}>Done</span>
        </div>
      </div>
    </div>
  );
}

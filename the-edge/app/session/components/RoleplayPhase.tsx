"use client";

import { useState } from "react";
import type { CharacterArchetype, Message } from "./types";
import { characterEmoji } from "./types";

// ---------------------------------------------------------------------------
// PersonaLine sub-component
// ---------------------------------------------------------------------------

function PersonaLine({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="mt-1 text-left pl-10 w-full"
    >
      <p className={`text-[11px] text-tertiary transition-all duration-200 ${expanded ? "" : "truncate"}`}>
        {description}
      </p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RoleplayPhaseProps {
  character: CharacterArchetype | null;
  roleplayTranscript: Message[];
  scenarioContext: string | null;
  turnCount: number;
  isLoading: boolean;
  isStreaming: boolean;
  streamingText: string;
  resetNotice: boolean;
  pendingRetry: string | null;
  sendRoleplayMessage: (msg: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// RoleplayPhase
// ---------------------------------------------------------------------------

export default function RoleplayPhase({
  character,
  roleplayTranscript,
  scenarioContext,
  turnCount,
  isLoading,
  isStreaming,
  streamingText,
  resetNotice,
  pendingRetry,
  sendRoleplayMessage,
  chatEndRef,
}: RoleplayPhaseProps) {
  return (
    <>
      {/* Character persona card */}
      {character && roleplayTranscript.length === 0 && (
        <div className="mb-5 animate-challenge">
          <div className="card" style={{ padding: "28px 24px" }}>
            <div className="text-center mb-5">
              <div
                className="inline-flex h-16 w-16 items-center justify-center rounded-full text-3xl mb-3"
                style={{ backgroundColor: "var(--phase-simulate-tint)" }}
              >
                {characterEmoji(character.id)}
              </div>
              <p className="text-lead font-bold" style={{ color: "var(--text-primary)" }}>{character.name}</p>
              <p className="mt-1 text-body leading-snug" style={{ color: "var(--text-secondary)" }}>{character.description}</p>
            </div>

            <div className="flex gap-2 justify-center flex-wrap mb-5">
              {character.tactics.slice(0, 2).map((t, i) => (
                <span key={i} className="badge" style={{ backgroundColor: "var(--score-low-bg)", color: "var(--score-low-text)", fontSize: 12, padding: "4px 12px" }}>
                  {t.length > 30 ? t.slice(0, 30) + "\u2026" : t}
                </span>
              ))}
            </div>

            {scenarioContext && (
              <div style={{ backgroundColor: "var(--phase-simulate-tint)", borderRadius: "var(--radius-md)", padding: "14px 16px" }}>
                <p className="text-caption font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--phase-simulate-muted)" }}>Scene</p>
                <p className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{scenarioContext}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{characterEmoji(character?.id)}</span>
            <span className="text-caption font-medium" style={{ color: "var(--text-secondary)" }}>{character?.name ?? "Character"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: 6, height: 6,
                  backgroundColor: i < Math.max(1, Math.ceil(turnCount / 2)) ? "var(--phase-simulate)" : "var(--border-subtle)",
                  transform: i < Math.max(1, Math.ceil(turnCount / 2)) ? "scale(1)" : "scale(0.8)",
                  transition: "all 300ms ease",
                }}
              />
            ))}
          </div>
        </div>
        {character?.description && roleplayTranscript.length > 0 && (
          <PersonaLine description={character.description} />
        )}
      </div>

      {resetNotice && (
        <p className="mb-2 text-center text-xs text-secondary animate-pulse">Same concept. Fresh start.</p>
      )}

      <div className="space-y-3.5 pb-4" role="log" aria-live="polite">
        {roleplayTranscript.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end pl-10" : "justify-start pr-10 gap-2.5"} animate-fade-in-up`}>
            {msg.role === "assistant" && (
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body mt-1"
                style={{ backgroundColor: "var(--phase-simulate-tint)" }}
              >
                {characterEmoji(character?.id)}
              </div>
            )}
            <div
              className="text-body leading-relaxed"
              style={{
                padding: "14px 18px",
                borderRadius: msg.role === "user" ? "var(--radius-xl) var(--radius-xl) 8px var(--radius-xl)" : "var(--radius-xl) var(--radius-xl) var(--radius-xl) 8px",
                backgroundColor: msg.role === "user" ? "var(--accent)" : "var(--surface)",
                color: msg.role === "user" ? "var(--text-inverted)" : "var(--text-primary)",
                boxShadow: msg.role === "user" ? "0 2px 10px rgba(90,82,224,0.18)" : "var(--shadow-soft)",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isStreaming && streamingText && (
          <div className="flex justify-start pr-10 gap-2.5" aria-live="polite">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body mt-1"
              style={{ backgroundColor: "var(--phase-simulate-tint)" }}
            >
              {characterEmoji(character?.id)}
            </div>
            <div
              className="max-w-[80%] text-body leading-relaxed"
              style={{
                padding: "14px 18px",
                borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) 8px",
                backgroundColor: "var(--surface)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              {streamingText}
              <span className="inline-block animate-pulse" style={{ color: "var(--accent)" }}>|</span>
            </div>
          </div>
        )}

        {isLoading && !isStreaming && (
          <div className="flex justify-start gap-2.5">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-body mt-1"
              style={{ backgroundColor: "var(--phase-simulate-tint)" }}
            >
              {characterEmoji(character?.id)}
            </div>
            <div style={{ padding: "16px 18px", borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) 8px", backgroundColor: "var(--surface)", boxShadow: "var(--shadow-soft)" }}>
              <div className="flex items-center gap-2">
                <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(212,144,143,0.5)" }} />
                <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(212,144,143,0.5)" }} />
                <span className="loading-dot h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "rgba(212,144,143,0.5)" }} />
              </div>
            </div>
          </div>
        )}

        {pendingRetry && (
          <div className="flex justify-center">
            <button
              onClick={() => sendRoleplayMessage(pendingRetry)}
              className="touch-target rounded-full px-5 py-2.5 text-caption font-semibold"
              style={{ backgroundColor: "var(--coach-bg)", color: "var(--coach-muted)" }}
            >
              Connection lost. Tap to retry &rarr;
            </button>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {Math.ceil(turnCount / 2) >= 8 && (
        <div className="mb-2 text-center text-caption" style={{ backgroundColor: "rgba(255,255,255,0.7)", borderRadius: "var(--radius-md)", padding: "10px 16px", color: "var(--text-secondary)" }}>
          You can continue or tap &#10003; when ready
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import type { Concept, VoiceProps } from "./types";
import { splitLessonSections, renderMarkdown, LoadingDots } from "./types";

// ---------------------------------------------------------------------------
// LessonCards — swipeable card stack
// ---------------------------------------------------------------------------

function LessonCards({
  sections,
  isStreaming,
  onCardChange,
  onSetCardRef,
  onSpeak,
  onStopSpeaking,
  isSpeaking,
}: {
  sections: { title: string; content: string }[];
  isStreaming: boolean;
  onCardChange?: (current: number, total: number) => void;
  onSetCardRef?: React.MutableRefObject<((card: number) => void) | null>;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
  isSpeaking?: boolean;
}) {
  const [currentCard, setCurrentCard] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoPlaySpokenCard = useRef(-1);

  useEffect(() => {
    const t = setTimeout(() => setShowSwipeHint(false), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    onCardChange?.(currentCard, sections.length);
  }, [currentCard, sections.length, onCardChange]);

  useEffect(() => {
    if (onSetCardRef) {
      onSetCardRef.current = (card: number) => {
        if (card >= 0 && card < sections.length) setCurrentCard(card);
      };
      return () => { onSetCardRef.current = null; };
    }
  }, [onSetCardRef, sections.length]);

  useEffect(() => {
    if (!autoPlay || !onSpeak || isStreaming) return;
    if (currentCard > autoPlaySpokenCard.current) {
      autoPlaySpokenCard.current = currentCard;
      const section = sections[currentCard];
      if (section) {
        onSpeak(`${section.title}. ${section.content}`);
      }
    }
  }, [autoPlay, currentCard, sections, onSpeak, isStreaming]);

  useEffect(() => {
    if (!autoPlay) return;
    if (!isSpeaking && autoPlaySpokenCard.current === currentCard && currentCard < sections.length - 1) {
      const t = setTimeout(() => setCurrentCard((c) => c + 1), 600);
      return () => clearTimeout(t);
    }
    if (!isSpeaking && autoPlaySpokenCard.current === currentCard && currentCard === sections.length - 1) {
      const t = setTimeout(() => setAutoPlay(false), 0);
      return () => clearTimeout(t);
    }
  }, [isSpeaking, autoPlay, currentCard, sections.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentCard < sections.length - 1) {
        setCurrentCard((c) => c + 1);
      } else if (diff < 0 && currentCard > 0) {
        setCurrentCard((c) => c - 1);
      }
    }
  };

  const handleListenCard = () => {
    if (isSpeaking) {
      onStopSpeaking?.();
      setAutoPlay(false);
      return;
    }
    const section = sections[currentCard];
    if (section && onSpeak) {
      onSpeak(`${section.title}. ${section.content}`);
    }
  };

  const handleAutoPlayAll = () => {
    if (autoPlay) {
      setAutoPlay(false);
      onStopSpeaking?.();
      return;
    }
    autoPlaySpokenCard.current = -1;
    setCurrentCard(0);
    setAutoPlay(true);
  };

  const section = sections[currentCard];
  if (!section) return null;

  const hasMore = currentCard < sections.length - 1;

  return (
    <div className="relative">
      {hasMore && (
        <div
          className="absolute right-0 top-0 bottom-0 w-3 rounded-r-3xl z-10 pointer-events-none"
          style={{
            background: "linear-gradient(to left, rgba(90,82,224,0.08), transparent)",
          }}
        />
      )}

      <div
        className="select-text overflow-y-auto relative"
        style={{
          backgroundColor: "var(--phase-learn-tint)",
          borderRadius: "var(--radius-xl)",
          padding: "24px",
          boxShadow: "var(--shadow-soft)",
          maxHeight: "calc(100dvh - 220px)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--phase-learn-muted)" }} />
            <h2 className="text-caption font-semibold uppercase tracking-widest" style={{ color: "var(--phase-learn-muted)" }}>{section.title}</h2>
          </div>

          {onSpeak && !isStreaming && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleListenCard}
                className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all active:scale-[0.95] ${
                  isSpeaking && !autoPlay
                    ? "bg-[var(--accent)] text-white"
                    : "bg-white/80 text-[#5B8BA8] hover:bg-white"
                }`}
                title={isSpeaking ? "Stop" : "Listen to this section"}
              >
                {isSpeaking && !autoPlay ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06ZM15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
                  </svg>
                )}
                {isSpeaking && !autoPlay ? "Stop" : "Listen"}
              </button>

              <button
                onClick={handleAutoPlayAll}
                className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all active:scale-[0.95] ${
                  autoPlay
                    ? "bg-[var(--accent)] text-white shadow-[0_2px_8px_rgba(90,82,224,0.3)]"
                    : "bg-white/80 text-[#5B8BA8] hover:bg-white"
                }`}
                title={autoPlay ? "Stop auto-play" : "Listen to full lesson"}
              >
                {autoPlay ? (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                  </svg>
                )}
                {autoPlay ? "Stop" : "Play all"}
              </button>
            </div>
          )}
        </div>

        {autoPlay && (
          <div className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-[#EEEDFF] py-2">
            <div className="flex items-center gap-1 h-4 text-[var(--accent)]">
              <span className="voice-bar" />
              <span className="voice-bar" />
              <span className="voice-bar" />
            </div>
            <span className="text-xs font-medium text-[var(--accent)]">
              Playing lesson — {currentCard + 1} of {sections.length}
            </span>
          </div>
        )}

        <div className="space-y-1" aria-live="polite">
          {renderMarkdown(section.content, "lesson")}
          {isStreaming && currentCard === sections.length - 1 && (
            <span className="inline-block animate-pulse text-[var(--accent)]">|</span>
          )}
        </div>

        {currentCard === 0 && showSwipeHint && sections.length > 1 && (
          <div
            className="mt-4 text-center text-xs text-[var(--accent)] transition-opacity duration-1000"
            style={{ opacity: showSwipeHint ? 0.8 : 0 }}
          >
            Swipe to continue &rarr;
          </div>
        )}

        <div className="sticky bottom-0 pt-3 pb-1" style={{ background: "linear-gradient(transparent, var(--phase-learn-tint) 40%)" }}>
          <div className="flex items-center justify-center gap-2">
            {sections.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentCard(i)}
                aria-label={`Go to page ${i + 1} of ${sections.length}`}
                aria-current={i === currentCard ? "true" : undefined}
                className="touch-target"
                style={{ minWidth: 28 }}
              >
                <div
                  className="rounded-full transition-all"
                  style={{
                    height: 8,
                    width: i === currentCard ? 28 : 8,
                    backgroundColor: i === currentCard ? "var(--accent)" : "var(--phase-learn)",
                  }}
                />
              </button>
            ))}
            {!isStreaming && (
              <span className="ml-2 text-caption" style={{ color: "var(--text-tertiary)" }}>
                {currentCard + 1} / {sections.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LessonPhase
// ---------------------------------------------------------------------------

interface LessonPhaseProps {
  isLoading: boolean;
  lessonContent: string | null;
  lessonStreaming: boolean;
  concept: Concept | null;
  isReviewSession: boolean;
  onboardingNeeded: boolean;
  onLessonCardChange: (current: number, total: number) => void;
  lessonCardAdvanceRef: React.MutableRefObject<((card: number) => void) | null>;
  voice: VoiceProps;
}

export default function LessonPhase({
  isLoading,
  lessonContent,
  lessonStreaming,
  concept,
  isReviewSession,
  onboardingNeeded,
  onLessonCardChange,
  lessonCardAdvanceRef,
  voice,
}: LessonPhaseProps) {
  if (onboardingNeeded) return null;

  return (
    <>
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-body" style={{ color: "var(--text-secondary)" }}>Preparing today&apos;s lesson...</p>
          <LoadingDots />
        </div>
      )}

      {lessonContent && !isLoading && (
        <>
          {concept && (
            <div className="mb-5">
              <div className="flex items-center gap-2.5">
                <span className="badge" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
                  {concept.domain}
                </span>
                {isReviewSession && (
                  <span className="badge" style={{ backgroundColor: "var(--score-mid-bg)", color: "var(--score-mid-text)" }}>
                    Review
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-heading font-semibold" style={{ color: "var(--text-primary)" }}>
                {concept.name}
                <span className="ml-2 text-caption font-normal italic" style={{ color: "var(--text-secondary)" }}>({concept.source})</span>
              </h2>
            </div>
          )}

          <LessonCards
            sections={splitLessonSections(lessonContent)}
            isStreaming={lessonStreaming}
            onCardChange={onLessonCardChange}
            onSetCardRef={lessonCardAdvanceRef}
            onSpeak={voice.speakDirect}
            onStopSpeaking={voice.stopSpeaking}
            isSpeaking={voice.state === "speaking"}
          />
        </>
      )}
    </>
  );
}

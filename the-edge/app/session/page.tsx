"use client";

/**
 * Session page — manages the full 5-phase daily loop.
 * Gate → Learn → Simulate → Debrief → Deploy
 *
 * All session state lives in React state. Each API call receives
 * only the data it needs. No server-side session.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  SessionPhase,
  Concept,
  CharacterArchetype,
  SessionScores,
  Message,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Phase indicator
// ---------------------------------------------------------------------------

const PHASES: { key: SessionPhase; label: string }[] = [
  { key: "gate", label: "GATE" },
  { key: "lesson", label: "LEARN" },
  { key: "roleplay", label: "SIMULATE" },
  { key: "debrief", label: "DEBRIEF" },
  { key: "mission", label: "DEPLOY" },
];

function PhaseIndicator({
  current,
  completed,
  skipGate,
}: {
  current: SessionPhase;
  completed: Set<SessionPhase>;
  skipGate: boolean;
}) {
  const phases = skipGate ? PHASES.filter((p) => p.key !== "gate") : PHASES;
  return (
    <div className="mb-8 flex items-center justify-center gap-1 text-[10px] font-mono tracking-wider sm:gap-2 sm:text-xs">
      {phases.map((p, i) => {
        // During retrieval, LEARN stays highlighted with a pulse
        const isActive = p.key === current || (current === "retrieval" && p.key === "lesson");
        const isPulsing = current === "retrieval" && p.key === "lesson";
        const isDone = completed.has(p.key);
        return (
          <span key={p.key} className="flex items-center gap-2">
            {i > 0 && <span className="text-border">&rarr;</span>}
            <span
              className={
                isActive
                  ? `text-accent font-bold${isPulsing ? " animate-pulse" : ""}`
                  : isDone
                    ? "text-success"
                    : "text-secondary/40"
              }
            >
              {isDone ? "\u2713 " : ""}
              {p.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------------

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-4">
      <span className="loading-dot h-2 w-2 rounded-full bg-secondary" />
      <span className="loading-dot h-2 w-2 rounded-full bg-secondary" />
      <span className="loading-dot h-2 w-2 rounded-full bg-secondary" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simple markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={key++}
          className="mb-2 mt-6 text-lg font-bold text-foreground first:mt-0"
        >
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="mb-2 mt-4 text-base font-semibold text-foreground">
          {line.slice(4)}
        </h3>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      // Handle bold (**text**) inline
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key++} className="text-sm leading-relaxed text-foreground/90">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={i} className="font-semibold text-foreground">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            )
          )}
        </p>
      );
    }
  }
  return elements;
}

// ---------------------------------------------------------------------------
// Score color helper
// ---------------------------------------------------------------------------

function scoreColorClass(score: number): string {
  if (score >= 4) return "text-success";
  if (score === 3) return "text-amber";
  return "text-accent";
}

// ---------------------------------------------------------------------------
// Main session component
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const router = useRouter();

  // Session state
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>("gate");
  const [completedPhases, setCompletedPhases] = useState<Set<SessionPhase>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skipGate, setSkipGate] = useState(false);
  const submittingRef = useRef(false);

  // Data accumulated through the session
  const [dayNumber, setDayNumber] = useState(1);
  const [lastMission, setLastMission] = useState<string | null>(null);
  const [gateOutcome, setGateOutcome] = useState<string | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [character, setCharacter] = useState<CharacterArchetype | null>(null);
  const [lessonContent, setLessonContent] = useState<string | null>(null);
  const [scenarioContext, setScenarioContext] = useState<string | null>(null);
  const [roleplayTranscript, setRoleplayTranscript] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [coachAdvice, setCoachAdvice] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [commandsUsed, setCommandsUsed] = useState<string[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [debriefContent, setDebriefContent] = useState<string | null>(null);
  const [scores, setScores] = useState<SessionScores | null>(null);
  const [behavioralWeaknessSummary, setBehavioralWeaknessSummary] = useState("");
  const [keyMoment, setKeyMoment] = useState("");
  const [mission, setMission] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [gateResponse, setGateResponse] = useState<string | null>(null);

  // Retrieval bridge state
  const [retrievalQuestion, setRetrievalQuestion] = useState<string | null>(null);
  const [retrievalResponse, setRetrievalResponse] = useState<string | null>(null);
  const [retrievalReady, setRetrievalReady] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [resetNotice, setResetNotice] = useState(false);

  // Smart auto-scroll: only scroll if user is already at/near bottom
  const isNearBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isNearBottom()) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isNearBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [roleplayTranscript, streamingText, scrollToBottom]);

  // Replace history state on phase change to prevent back-button re-entry
  useEffect(() => {
    window.history.replaceState(null, "", `/session?phase=${currentPhase}`);
  }, [currentPhase]);

  // Auto-focus input after streaming completes
  useEffect(() => {
    if (!isStreaming && currentPhase === "roleplay") {
      inputRef.current?.focus();
    }
  }, [isStreaming, currentPhase]);

  // ---------------------------------------------------------------------------
  // Initialization — check if Day 1 (skip gate) or Day 2+ (show gate)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        setDayNumber(data.dayNumber);
        if (!data.lastEntry) {
          // Day 1 — skip gate, go straight to lesson
          setSkipGate(true);
          setCurrentPhase("lesson");
          fetchLesson();
        } else {
          // Day 2+ — show gate
          setLastMission(data.lastEntry.mission);
          setIsLoading(false);
        }
      })
      .catch(() => {
        setSkipGate(true);
        setCurrentPhase("lesson");
        fetchLesson();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Phase transition helper
  // ---------------------------------------------------------------------------

  function advancePhase(from: SessionPhase, to: SessionPhase) {
    setCompletedPhases((prev) => new Set([...prev, from]));
    setCurrentPhase(to);
    setError(null);
  }

  // ---------------------------------------------------------------------------
  // Phase 0: Gate
  // ---------------------------------------------------------------------------

  async function submitGate(userResponse: string) {
    if (!lastMission || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousMission: lastMission, userResponse }),
      });

      if (!res.ok) throw new Error("Gate API failed");
      const data = await res.json();

      setGateResponse(data.response);
      setGateOutcome(data.outcome);
      setIsLoading(false);

      // Auto-advance after 2 seconds
      setTimeout(() => {
        advancePhase("gate", "lesson");
        fetchLesson();
      }, 2000);
    } catch {
      setError("Failed to submit. Try again.");
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 1: Lesson
  // ---------------------------------------------------------------------------

  async function fetchLesson() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Lesson API failed");
      const data = await res.json();

      setConcept(data.concept);
      setLessonContent(data.lessonContent);
      setIsLoading(false);
    } catch {
      setError("Failed to load lesson. Try again.");
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 1.5: Retrieval Bridge
  // ---------------------------------------------------------------------------

  async function startRetrieval() {
    if (!concept) return;
    advancePhase("lesson", "retrieval");
    setIsLoading(true);

    try {
      const res = await fetch("/api/retrieval-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });

      if (!res.ok) throw new Error("Retrieval bridge API failed");
      const data = await res.json();

      setRetrievalQuestion(data.response);
      setIsLoading(false);
    } catch {
      setError("Failed to load retrieval question. Try again.");
      setIsLoading(false);
    }
  }

  async function submitRetrievalResponse(userResponse: string) {
    if (!concept || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);

    try {
      const res = await fetch("/api/retrieval-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, userResponse }),
      });

      if (!res.ok) throw new Error("Retrieval bridge API failed");
      const data = await res.json();

      setRetrievalResponse(data.response);
      setRetrievalReady(data.ready);
      setIsLoading(false);
      submittingRef.current = false;

      // Auto-advance to roleplay after 1.5s when ready
      if (data.ready) {
        setTimeout(() => {
          startRoleplay();
        }, 1500);
      }
    } catch {
      setError("Failed to evaluate response. Try again.");
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Roleplay
  // ---------------------------------------------------------------------------

  async function startRoleplay() {
    if (!concept) return;

    // Select character via the concepts module mapping
    const { selectCharacter } = await import("@/lib/characters");
    const char = selectCharacter(concept);
    setCharacter(char);

    advancePhase("retrieval", "roleplay");
    setIsLoading(true);

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          character: char,
          transcript: [],
          userMessage: null,
        }),
      });

      if (!res.ok) throw new Error("Roleplay API failed");

      // Read scenario context from header
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) setScenarioContext(decodeURIComponent(sc));

      // Stream the opening line
      await streamRoleplayResponse(res, []);
    } catch {
      setError("Failed to start roleplay. Try again.");
      setIsLoading(false);
    }
  }

  async function sendRoleplayMessage(userMessage: string) {
    if (!concept || !character || isStreaming || submittingRef.current) return;
    submittingRef.current = true;

    const updatedTranscript: Message[] = [
      ...roleplayTranscript,
      { role: "user", content: userMessage },
    ];
    setRoleplayTranscript(updatedTranscript);
    setTurnCount((prev) => prev + 1);
    setInputValue("");

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          character,
          transcript: updatedTranscript,
          userMessage: null, // already appended to transcript
          scenarioContext,
        }),
      });

      if (!res.ok) throw new Error("Roleplay API failed");
      await streamRoleplayResponse(res, updatedTranscript);
    } catch {
      setError("Failed to get response. Try again.");
      submittingRef.current = false;
    }
  }

  async function streamRoleplayResponse(
    res: Response,
    currentTranscript: Message[]
  ) {
    setIsStreaming(true);
    setStreamingText("");
    setIsLoading(false);

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      setStreamingText(fullText);
    }

    // Add the complete response to transcript
    setRoleplayTranscript([
      ...currentTranscript,
      { role: "assistant", content: fullText },
    ]);
    setStreamingText("");
    setIsStreaming(false);
    setTurnCount((prev) => prev + 1);
    submittingRef.current = false;
  }

  async function handleCoach() {
    if (!concept || roleplayTranscript.length === 0) return;
    setCoachAdvice(null);
    setCoachLoading(true);
    setCommandsUsed((prev) =>
      prev.includes("/coach") ? prev : [...prev, "/coach"]
    );

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: roleplayTranscript, concept }),
      });

      if (!res.ok) throw new Error("Coach API failed");
      const data = await res.json();
      setCoachAdvice(data.advice);
    } catch {
      setCoachAdvice("Coach unavailable right now. Trust your instincts.");
    } finally {
      setCoachLoading(false);
    }
  }

  function handleReset() {
    setCommandsUsed((prev) => [...prev, "/reset"]);
    setRoleplayTranscript([]);
    setTurnCount(0);
    setStreamingText("");
    setCoachAdvice(null);
    setCoachLoading(false);
    setResetNotice(true);
    setTimeout(() => setResetNotice(false), 3000);
    startRoleplayFresh();
  }

  async function startRoleplayFresh() {
    if (!concept || !character) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          character,
          transcript: [],
          userMessage: null,
        }),
      });

      if (!res.ok) throw new Error("Roleplay API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) setScenarioContext(decodeURIComponent(sc));
      await streamRoleplayResponse(res, []);
    } catch {
      setError("Failed to reset scenario.");
      setIsLoading(false);
    }
  }

  function handleSkip() {
    setCommandsUsed((prev) => [...prev, "/skip"]);
    advancePhase("roleplay", "debrief");
    fetchDebrief();
  }

  function handleDone() {
    advancePhase("roleplay", "debrief");
    fetchDebrief();
  }

  function handleRoleplayInput(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "/coach") {
      handleCoach();
      setInputValue("");
    } else if (trimmed === "/reset") {
      handleReset();
      setInputValue("");
    } else if (trimmed === "/skip") {
      handleSkip();
      setInputValue("");
    } else if (trimmed === "/done") {
      handleDone();
      setInputValue("");
    } else {
      sendRoleplayMessage(value.trim());
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Debrief
  // ---------------------------------------------------------------------------

  async function fetchDebrief() {
    if (!concept || !character) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: roleplayTranscript,
          concept,
          character,
          commandsUsed,
        }),
      });

      if (!res.ok) throw new Error("Debrief API failed");
      const data = await res.json();

      // Strip the ---SCORES--- and ---LEDGER--- blocks from display
      let displayContent = data.debriefContent;
      const scoresIdx = displayContent.indexOf("---SCORES---");
      if (scoresIdx !== -1) {
        displayContent = displayContent.slice(0, scoresIdx).trim();
      }

      setDebriefContent(displayContent);
      setScores(data.scores);
      setBehavioralWeaknessSummary(data.behavioralWeaknessSummary);
      setKeyMoment(data.keyMoment);
      setIsLoading(false);
    } catch {
      setError("Failed to generate debrief. Try again.");
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Mission
  // ---------------------------------------------------------------------------

  async function fetchMission() {
    if (!concept || !character || !scores) return;
    advancePhase("debrief", "mission");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          character,
          scores,
          behavioralWeaknessSummary,
          keyMoment,
          commandsUsed,
          gateOutcome,
        }),
      });

      if (!res.ok) throw new Error("Mission API failed");
      const data = await res.json();

      setMission(data.mission);
      setRationale(data.rationale);
      setIsLoading(false);
    } catch {
      setError("Failed to generate mission. Try again.");
      setIsLoading(false);
    }
  }

  function completeSession() {
    setCompletedPhases((prev) => new Set([...prev, "mission"]));
    setTimeout(() => router.push("/"), 2000);
  }

  // ---------------------------------------------------------------------------
  // Error retry
  // ---------------------------------------------------------------------------

  function retry() {
    setError(null);
    if (currentPhase === "gate") setIsLoading(false);
    else if (currentPhase === "lesson") fetchLesson();
    else if (currentPhase === "retrieval") startRetrieval();
    else if (currentPhase === "roleplay") startRoleplayFresh();
    else if (currentPhase === "debrief") fetchDebrief();
    else if (currentPhase === "mission" && concept && character && scores)
      fetchMission();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const SCORE_DIMENSIONS: { key: keyof SessionScores; label: string }[] = [
    { key: "technique_application", label: "Technique Application" },
    { key: "tactical_awareness", label: "Tactical Awareness" },
    { key: "frame_control", label: "Frame Control" },
    { key: "emotional_regulation", label: "Emotional Regulation" },
    { key: "strategic_outcome", label: "Strategic Outcome" },
  ];

  return (
    <div className="min-h-[85vh]">
      <PhaseIndicator
        current={currentPhase}
        completed={completedPhases}
        skipGate={skipGate}
      />

      {/* Error display */}
      {error && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-center">
          <p className="text-sm text-accent">{error}</p>
          <button
            onClick={retry}
            className="mt-2 text-xs font-semibold text-accent underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* PHASE 0: GATE                                                    */}
      {/* ================================================================ */}
      {currentPhase === "gate" && (
        <div className="mx-auto max-w-lg">
          {lastMission && !gateResponse && (
            <>
              {/* Yesterday's mission */}
              <div className="mb-6 rounded-lg border-l-4 border-accent bg-surface p-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-secondary">
                  Yesterday&apos;s Mission
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {lastMission}
                </p>
              </div>

              {/* Input */}
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="What happened when you executed this?"
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-secondary/60 outline-none focus:border-accent/50"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inputValue.trim()) {
                      submitGate(inputValue.trim());
                    }
                  }}
                  disabled={isLoading}
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (inputValue.trim()) submitGate(inputValue.trim());
                  }}
                  disabled={isLoading || !inputValue.trim()}
                  className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                >
                  {isLoading ? "Submitting..." : "Submit"}
                </button>
              </div>
            </>
          )}

          {/* Gate response */}
          {gateResponse && (
            <div className="text-center">
              <p className="text-sm leading-relaxed text-secondary italic">
                {gateResponse}
              </p>
              <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-border">
                <div className="h-full animate-[gate-progress_2s_ease-in-out_forwards] rounded-full bg-accent" />
              </div>
            </div>
          )}

          {isLoading && !gateResponse && <LoadingDots />}
        </div>
      )}

      {/* ================================================================ */}
      {/* PHASE 1: LEARN                                                   */}
      {/* ================================================================ */}
      {currentPhase === "lesson" && (
        <div className="mx-auto max-w-lg">
          {isLoading && (
            <div className="text-center">
              <p className="mb-2 text-sm text-secondary">
                Preparing today&apos;s lesson...
              </p>
              <LoadingDots />
            </div>
          )}

          {lessonContent && !isLoading && (
            <>
              {/* Concept badge */}
              {concept && (
                <div className="mb-6">
                  <span className="inline-block rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-secondary">
                    {concept.domain}
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-foreground">
                    {concept.name}
                    <span className="ml-2 text-sm font-normal text-secondary">
                      ({concept.source})
                    </span>
                  </h2>
                </div>
              )}

              {/* Lesson content */}
              <div className="mb-8 space-y-0">{renderMarkdown(lessonContent)}</div>

              {/* Advance button */}
              <button
                onClick={startRetrieval}
                className="w-full rounded-lg bg-accent px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              >
                Ready to Practice &rarr;
              </button>
            </>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* PHASE 1.5: RETRIEVAL BRIDGE                                      */}
      {/* ================================================================ */}
      {currentPhase === "retrieval" && (
        <div className="mx-auto max-w-lg">
          {isLoading && !retrievalQuestion && (
            <div className="text-center">
              <p className="mb-2 text-sm text-secondary">
                One moment...
              </p>
              <LoadingDots />
            </div>
          )}

          {retrievalQuestion && (
            <div className="space-y-6">
              {/* Question */}
              <p className="text-center text-lg font-medium leading-relaxed text-foreground">
                {retrievalQuestion}
              </p>

              {/* Evaluation response */}
              {retrievalResponse && (
                <div className="text-center">
                  <p className="text-sm leading-relaxed text-secondary italic">
                    {retrievalResponse}
                  </p>
                  {retrievalReady && (
                    <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-border">
                      <div className="h-full animate-[gate-progress_1.5s_ease-in-out_forwards] rounded-full bg-accent" />
                    </div>
                  )}
                </div>
              )}

              {/* Input — only show if not yet answered or if not ready */}
              {!retrievalResponse && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Your answer..."
                    className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-secondary/60 outline-none focus:border-accent/50"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && inputValue.trim()) {
                        submitRetrievalResponse(inputValue.trim());
                        setInputValue("");
                      }
                    }}
                    disabled={isLoading}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (inputValue.trim()) {
                        submitRetrievalResponse(inputValue.trim());
                        setInputValue("");
                      }
                    }}
                    disabled={isLoading || !inputValue.trim()}
                    className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                  >
                    {isLoading ? "Evaluating..." : "Submit"}
                  </button>
                </div>
              )}

              {/* Manual advance if not ready after evaluation */}
              {retrievalResponse && !retrievalReady && (
                <button
                  onClick={startRoleplay}
                  className="w-full rounded-lg bg-accent px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  Continue to Practice &rarr;
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* PHASE 2: SIMULATE                                                */}
      {/* ================================================================ */}
      {currentPhase === "roleplay" && (
        <div className="relative mx-auto max-w-lg">
          {/* Turn counter */}
          <div className="mb-4 flex items-center justify-between text-xs font-mono text-secondary">
            <span>{character?.name ?? "Character"}</span>
            <span>Turn {Math.max(1, Math.ceil(turnCount / 2))} of ~8</span>
          </div>

          {/* Reset notice */}
          {resetNotice && (
            <p className="mb-2 text-center text-xs text-secondary animate-pulse">
              Same concept. Fresh start.
            </p>
          )}

          {/* Chat messages */}
          <div ref={chatContainerRef} className="mb-4 max-h-[55vh] space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-3">
            {roleplayTranscript.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent/15 text-foreground border border-accent/20"
                      : "bg-surface text-foreground/90"
                  }`}
                >
                  {i === 0 && msg.role === "assistant" && (
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                      {character?.name}
                    </p>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Streaming text */}
            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-surface/60 px-4 py-3 text-sm leading-relaxed text-foreground/90">
                  {roleplayTranscript.length === 0 && (
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                      {character?.name}
                    </p>
                  )}
                  {streamingText}
                  <span className="inline-block animate-pulse text-accent">
                    |
                  </span>
                </div>
              </div>
            )}

            {isLoading && !isStreaming && (
              <div className="py-2">
                <p className="mb-2 text-xs text-secondary">
                  {roleplayTranscript.length === 0
                    ? `Setting up scenario with ${character?.name ?? "character"}...`
                    : `${character?.name ?? "Character"} is thinking...`}
                </p>
                <LoadingDots />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Turn 8+ prompt */}
          {Math.ceil(turnCount / 2) >= 8 && (
            <p className="mb-2 text-center text-xs text-secondary">
              You can continue or type{" "}
              <span className="font-mono text-accent">/done</span> to wrap up
            </p>
          )}

          {/* Chat input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type your response... (/coach /done /skip /reset)"
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-secondary/40 outline-none focus:border-accent/50"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue.trim() && !isStreaming) {
                  handleRoleplayInput(inputValue);
                }
              }}
              disabled={isStreaming || isLoading}
              autoFocus
            />
            <button
              onClick={() => {
                if (inputValue.trim() && !isStreaming) {
                  handleRoleplayInput(inputValue);
                }
              }}
              disabled={isStreaming || isLoading || !inputValue.trim()}
              className="rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          </div>

          {/* Coach panel — slide-in from right */}
          {(coachAdvice || coachLoading) && (
            <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-[90vw] overflow-y-auto border-l border-border bg-accent-blue p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                  Mentor
                </span>
                <button
                  onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
                  className="text-sm text-secondary hover:text-foreground"
                >
                  &times;
                </button>
              </div>
              {coachLoading ? (
                <LoadingDots />
              ) : (
                <div className="text-sm leading-relaxed text-foreground/90">
                  {renderMarkdown(coachAdvice!)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* PHASE 3: DEBRIEF                                                 */}
      {/* ================================================================ */}
      {currentPhase === "debrief" && (
        <div className="mx-auto max-w-lg">
          {isLoading && (
            <div className="text-center">
              <p className="mb-2 text-sm text-secondary">
                Analysing your performance...
              </p>
              <LoadingDots />
            </div>
          )}

          {debriefContent && !isLoading && (
            <>
              {/* Debrief analysis */}
              <div className="mb-8 space-y-0">{renderMarkdown(debriefContent)}</div>

              {/* Score card */}
              {scores && (
                <div className="mb-8 rounded-lg border border-border bg-surface p-5">
                  <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
                    Session Scores
                  </h3>
                  <div className="space-y-3">
                    {SCORE_DIMENSIONS.map(({ key, label }) => {
                      const score = scores[key];
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-sm text-foreground">
                            {label}
                          </span>
                          <div className="flex items-center gap-3">
                            <span
                              className={`font-mono text-2xl font-bold ${scoreColorClass(score)}`}
                            >
                              {score}
                            </span>
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-border">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  score >= 4
                                    ? "bg-success"
                                    : score === 3
                                      ? "bg-amber"
                                      : "bg-accent"
                                }`}
                                style={{ width: `${(score / 5) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Advance button */}
              <button
                onClick={fetchMission}
                className="w-full rounded-lg bg-accent px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
              >
                Continue &rarr;
              </button>
            </>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* PHASE 4: DEPLOY                                                  */}
      {/* ================================================================ */}
      {currentPhase === "mission" && (
        <div className="mx-auto max-w-lg">
          {isLoading && (
            <div className="text-center">
              <p className="mb-2 text-sm text-secondary">
                Assigning your mission...
              </p>
              <LoadingDots />
            </div>
          )}

          {mission && !isLoading && (
            <>
              {/* Mission card */}
              <div className="mb-6 rounded-lg border-t-4 border-accent bg-surface p-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                  Your Mission
                </p>
                <p className="text-base leading-relaxed text-foreground">
                  {mission}
                </p>
              </div>

              {/* Rationale */}
              {rationale && (
                <p className="mb-8 text-sm leading-relaxed text-secondary italic">
                  {rationale}
                </p>
              )}

              {/* Complete button */}
              {!completedPhases.has("mission") ? (
                <button
                  onClick={completeSession}
                  className="w-full rounded-lg border border-border bg-surface px-6 py-4 text-base font-semibold text-foreground transition-all hover:bg-surface/80"
                >
                  Session Complete
                </button>
              ) : (
                <div className="space-y-4 text-center">
                  <p className="text-sm font-semibold text-success">
                    Day {dayNumber} complete.
                  </p>

                  {/* Session summary */}
                  {scores && (
                    <div className="rounded-lg border border-border bg-surface p-4 text-left">
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
                        Session Summary
                      </p>
                      {concept && (
                        <p className="mb-2 text-xs text-secondary">
                          Concept: <span className="text-foreground">{concept.name}</span>
                        </p>
                      )}
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-secondary">Average Score</span>
                        <span className={`font-mono font-bold ${scoreColorClass(
                          Math.round(
                            (scores.technique_application + scores.tactical_awareness +
                             scores.frame_control + scores.emotional_regulation +
                             scores.strategic_outcome) / 5
                          )
                        )}`}>
                          {((scores.technique_application + scores.tactical_awareness +
                             scores.frame_control + scores.emotional_regulation +
                             scores.strategic_outcome) / 5).toFixed(1)}/5
                        </span>
                      </div>
                      {(() => {
                        const dims = SCORE_DIMENSIONS.map(d => ({ ...d, score: scores[d.key] }));
                        const strongest = dims.reduce((a, b) => b.score > a.score ? b : a);
                        const weakest = dims.reduce((a, b) => b.score < a.score ? b : a);
                        return (
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-secondary">Strongest</span>
                              <span className="text-success">{strongest.label} ({strongest.score}/5)</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-secondary">Focus area</span>
                              <span className="text-accent">{weakest.label} ({weakest.score}/5)</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <p className="text-xs text-secondary">
                    See you tomorrow.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

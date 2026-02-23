"use client";

/**
 * Session page — manages the full 5-phase daily loop.
 * Gate → Learn → Simulate → Debrief → Deploy
 *
 * Mobile-first: full-height flex, fixed bottom input, quick command pills,
 * bottom-sheet coach, keyboard handling, connectivity retry, localStorage persistence.
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
// Constants
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "edge-session-state";
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

const PHASES: { key: SessionPhase; label: string; abbr: string }[] = [
  { key: "gate", label: "GATE", abbr: "G" },
  { key: "lesson", label: "LEARN", abbr: "L" },
  { key: "roleplay", label: "SIMULATE", abbr: "S" },
  { key: "debrief", label: "DEBRIEF", abbr: "De" },
  { key: "mission", label: "DEPLOY", abbr: "Go" },
];

// ---------------------------------------------------------------------------
// Haptic utility
// ---------------------------------------------------------------------------

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

// ---------------------------------------------------------------------------
// Fetch with retry (for non-streaming endpoints)
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5,
  delay = 3000,
  onAttempt?: (attempt: number) => void
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      onAttempt?.(i);
      const res = await fetch(url, options);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e as Error;
      if (i < maxRetries) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Online status hook
// ---------------------------------------------------------------------------

function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

// ---------------------------------------------------------------------------
// Phase indicator — sticky, abbreviated on mobile
// ---------------------------------------------------------------------------

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
    <div className="sticky top-0 z-50 flex h-10 items-center justify-center gap-1 bg-background font-mono text-[10px] tracking-wider sm:gap-2 sm:text-xs">
      {phases.map((p, i) => {
        const isActive = p.key === current || (current === "retrieval" && p.key === "lesson");
        const isPulsing = current === "retrieval" && p.key === "lesson";
        const isDone = completed.has(p.key);
        return (
          <span key={p.key} className="flex items-center gap-1 sm:gap-2">
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
              <span className="sm:hidden">{p.abbr}</span>
              <span className="hidden sm:inline">{p.label}</span>
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
        <h2 key={key++} className="mb-2 mt-6 text-lg font-bold text-foreground first:mt-0">
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
  const online = useOnlineStatus();

  // Session state
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>("gate");
  const [completedPhases, setCompletedPhases] = useState<Set<SessionPhase>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skipGate, setSkipGate] = useState(false);
  const submittingRef = useRef(false);
  const [restored, setRestored] = useState(false);

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

  // Roleplay retry
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);

  // New message pill
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [resetNotice, setResetNotice] = useState(false);

  // ---------------------------------------------------------------------------
  // Smart auto-scroll
  // ---------------------------------------------------------------------------

  const isNearBottom = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (isNearBottom()) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowNewMessagePill(false);
    }
  }, [isNearBottom]);

  useEffect(() => {
    if (isNearBottom()) {
      scrollToBottom();
    } else if (roleplayTranscript.length > 0) {
      setShowNewMessagePill(true);
    }
  }, [roleplayTranscript, streamingText, scrollToBottom, isNearBottom]);

  // Dismiss new message pill when user scrolls to bottom
  // Re-run when entering roleplay (chatContainerRef attaches only in roleplay)
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
        setShowNewMessagePill(false);
      }
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [currentPhase]);

  // Keyboard handling — scroll to bottom when virtual keyboard opens
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => {
      if (vv.height < window.innerHeight * 0.75) {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", handler);
    return () => vv.removeEventListener("resize", handler);
  }, []);

  // Replace history state on phase change
  useEffect(() => {
    window.history.replaceState(null, "", `/session?phase=${currentPhase}`);
  }, [currentPhase]);

  // Auto-focus input after streaming completes
  useEffect(() => {
    if (!isStreaming && currentPhase === "roleplay") {
      inputRef.current?.focus();
    }
  }, [isStreaming, currentPhase]);

  // Auto-dismiss restored banner
  useEffect(() => {
    if (restored) {
      const t = setTimeout(() => setRestored(false), 3000);
      return () => clearTimeout(t);
    }
  }, [restored]);

  // ---------------------------------------------------------------------------
  // Session persistence (localStorage)
  // ---------------------------------------------------------------------------

  function saveSession() {
    try {
      const state = {
        phase: currentPhase,
        concept,
        character,
        lessonContent,
        transcript: roleplayTranscript,
        turnCount,
        completedPhases: Array.from(completedPhases),
        commandsUsed,
        gateOutcome,
        skipGate,
        dayNumber,
        scenarioContext,
        debriefContent,
        scores,
        behavioralWeaknessSummary,
        keyMoment,
        mission,
        rationale,
        timestamp: Date.now(),
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
  }

  // Save after phase transitions and content loads
  useEffect(() => {
    if (!isLoading && currentPhase !== "gate") {
      saveSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase, roleplayTranscript.length, turnCount, debriefContent, scores, mission]);

  // ---------------------------------------------------------------------------
  // Initialization — try restore, else check status
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Try to restore saved session
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Date.now() - saved.timestamp < SESSION_MAX_AGE_MS) {
          setCurrentPhase(saved.phase);
          setConcept(saved.concept);
          setCharacter(saved.character);
          setLessonContent(saved.lessonContent);
          setRoleplayTranscript(saved.transcript || []);
          setTurnCount(saved.turnCount || 0);
          setCompletedPhases(new Set(saved.completedPhases || []));
          setCommandsUsed(saved.commandsUsed || []);
          setGateOutcome(saved.gateOutcome);
          setSkipGate(saved.skipGate ?? false);
          setDayNumber(saved.dayNumber || 1);
          setScenarioContext(saved.scenarioContext || null);
          if (saved.debriefContent) setDebriefContent(saved.debriefContent);
          if (saved.scores) setScores(saved.scores);
          if (saved.behavioralWeaknessSummary) setBehavioralWeaknessSummary(saved.behavioralWeaknessSummary);
          if (saved.keyMoment) setKeyMoment(saved.keyMoment);
          if (saved.mission) setMission(saved.mission);
          if (saved.rationale) setRationale(saved.rationale);
          setIsLoading(false);
          setRestored(true);
          return;
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    } catch {}

    // Normal init — fetch status
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        setDayNumber(data.dayNumber);
        if (!data.lastEntry) {
          setSkipGate(true);
          setCurrentPhase("lesson");
          fetchLesson();
        } else {
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
    haptic();
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
      submittingRef.current = false;

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
      const res = await fetchWithRetry(
        "/api/lesson",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        5, 3000,
        (attempt) => { if (attempt > 1) setError(`Reconnecting... (attempt ${attempt}/5)`); }
      );

      const data = await res.json();
      setConcept(data.concept);
      setLessonContent(data.lessonContent);
      setError(null);
      setIsLoading(false);
    } catch {
      setError("No connection. Your progress is saved \u2014 continue when back online.");
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
      const res = await fetchWithRetry(
        "/api/retrieval-bridge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept }) },
        5, 3000,
        (attempt) => { if (attempt > 1) setError(`Reconnecting... (attempt ${attempt}/5)`); }
      );

      const data = await res.json();
      setRetrievalQuestion(data.response);
      setError(null);
      setIsLoading(false);
    } catch {
      setError("No connection. Your progress is saved \u2014 continue when back online.");
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

      if (data.ready) {
        setTimeout(() => { startRoleplay(); }, 1500);
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

    const { selectCharacter } = await import("@/lib/characters");
    const char = selectCharacter(concept);
    setCharacter(char);

    advancePhase("retrieval", "roleplay");
    setIsLoading(true);

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character: char, transcript: [], userMessage: null }),
      });

      if (!res.ok) throw new Error("Roleplay API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) setScenarioContext(decodeURIComponent(sc));
      await streamRoleplayResponse(res, []);
    } catch {
      setError("Failed to start roleplay. Try again.");
      setIsLoading(false);
    }
  }

  async function sendRoleplayMessage(userMessage: string) {
    if (!concept || !character || isStreaming || submittingRef.current) return;
    submittingRef.current = true;
    setPendingRetry(null);

    const updatedTranscript: Message[] = [
      ...roleplayTranscript,
      { role: "user", content: userMessage },
    ];
    setRoleplayTranscript(updatedTranscript);
    setTurnCount((prev) => prev + 1);
    setInputValue("");
    haptic();

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          character,
          transcript: updatedTranscript,
          userMessage: null,
          scenarioContext,
        }),
      });

      if (!res.ok) throw new Error("Roleplay API failed");
      await streamRoleplayResponse(res, updatedTranscript);
    } catch {
      // Revert optimistic update, offer retry
      setRoleplayTranscript(roleplayTranscript);
      setTurnCount((prev) => prev - 1);
      setPendingRetry(userMessage);
      submittingRef.current = false;
    }
  }

  async function streamRoleplayResponse(res: Response, currentTranscript: Message[]) {
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

    setRoleplayTranscript([...currentTranscript, { role: "assistant", content: fullText }]);
    setStreamingText("");
    setIsStreaming(false);
    setTurnCount((prev) => prev + 1);
    submittingRef.current = false;
  }

  async function handleCoach() {
    if (!concept || roleplayTranscript.length === 0) return;
    setCoachAdvice(null);
    setCoachLoading(true);
    setCommandsUsed((prev) => prev.includes("/coach") ? prev : [...prev, "/coach"]);
    haptic();

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
    haptic();
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
        body: JSON.stringify({ concept, character, transcript: [], userMessage: null }),
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
    haptic();
    advancePhase("roleplay", "debrief");
    fetchDebrief();
  }

  function handleDone() {
    haptic();
    advancePhase("roleplay", "debrief");
    fetchDebrief();
  }

  function handleRoleplayInput(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "/coach") { handleCoach(); setInputValue(""); }
    else if (trimmed === "/reset") { handleReset(); setInputValue(""); }
    else if (trimmed === "/skip") { handleSkip(); setInputValue(""); }
    else if (trimmed === "/done") { handleDone(); setInputValue(""); }
    else { sendRoleplayMessage(value.trim()); }
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Debrief
  // ---------------------------------------------------------------------------

  async function fetchDebrief() {
    if (!concept || !character) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchWithRetry(
        "/api/debrief",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: roleplayTranscript, concept, character, commandsUsed }),
        },
        5, 3000,
        (attempt) => { if (attempt > 1) setError(`Reconnecting... (attempt ${attempt}/5)`); }
      );

      const data = await res.json();

      let displayContent = data.debriefContent;
      const scoresIdx = displayContent.indexOf("---SCORES---");
      if (scoresIdx !== -1) {
        displayContent = displayContent.slice(0, scoresIdx).trim();
      }

      setDebriefContent(displayContent);
      setScores(data.scores);
      setBehavioralWeaknessSummary(data.behavioralWeaknessSummary);
      setKeyMoment(data.keyMoment);
      setError(null);
      setIsLoading(false);
    } catch {
      setError("No connection. Your progress is saved \u2014 continue when back online.");
      setIsLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Mission
  // ---------------------------------------------------------------------------

  async function fetchMission() {
    if (!concept || !character || !scores || submittingRef.current) return;
    submittingRef.current = true;
    advancePhase("debrief", "mission");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchWithRetry(
        "/api/mission",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, gateOutcome }),
        },
        5, 3000,
        (attempt) => { if (attempt > 1) setError(`Reconnecting... (attempt ${attempt}/5)`); }
      );

      const data = await res.json();
      setMission(data.mission);
      setRationale(data.rationale);
      setError(null);
      setIsLoading(false);
      submittingRef.current = false;
    } catch {
      setError("No connection. Your progress is saved \u2014 continue when back online.");
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  const sessionCompletedRef = useRef(false);
  function completeSession() {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;
    setCompletedPhases((prev) => new Set([...prev, "mission"]));
    clearSession();
    haptic();
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
    else if (currentPhase === "mission" && concept && character && scores) fetchMission();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const SCORE_DIMENSIONS: { key: keyof SessionScores; label: string; abbr: string }[] = [
    { key: "technique_application", label: "Technique Application", abbr: "TA" },
    { key: "tactical_awareness", label: "Tactical Awareness", abbr: "TW" },
    { key: "frame_control", label: "Frame Control", abbr: "FC" },
    { key: "emotional_regulation", label: "Emotional Regulation", abbr: "ER" },
    { key: "strategic_outcome", label: "Strategic Outcome", abbr: "SO" },
  ];

  const isRoleplay = currentPhase === "roleplay";

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ overscrollBehaviorY: "contain" }}>
      {/* Sticky phase indicator */}
      <PhaseIndicator current={currentPhase} completed={completedPhases} skipGate={skipGate} />

      {/* Offline banner */}
      {!online && (
        <div className="flex h-6 items-center justify-center bg-amber/20 text-xs font-mono text-amber">
          Offline
        </div>
      )}

      {/* Restored session notice */}
      {restored && (
        <div className="flex h-6 items-center justify-center bg-accent-blue/30 text-xs font-mono text-secondary">
          Session restored
        </div>
      )}

      {/* Scrollable content area */}
      <div ref={isRoleplay ? chatContainerRef : undefined} className="flex-1 overflow-y-auto scroll-touch px-4 sm:px-6">
        <div className="mx-auto max-w-lg py-4 sm:py-8">

          {/* Error display */}
          {error && (
            <div className="mb-6 rounded-lg border border-accent/30 bg-accent/10 p-4 text-center">
              <p className="text-sm text-accent">{error}</p>
              <button
                onClick={retry}
                className="mt-2 min-h-[44px] text-xs font-semibold text-accent underline active:scale-95"
              >
                Retry
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* PHASE 0: GATE                                                   */}
          {/* ============================================================== */}
          {currentPhase === "gate" && (
            <>
              {lastMission && !gateResponse && (
                <>
                  <div className="mb-6 rounded-lg border-l-4 border-accent bg-surface p-4">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-secondary">
                      Yesterday&apos;s Mission
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {lastMission}
                    </p>
                  </div>

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
                      onClick={() => { if (inputValue.trim()) submitGate(inputValue.trim()); }}
                      disabled={isLoading || !inputValue.trim()}
                      className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity active:scale-95 disabled:opacity-40"
                    >
                      {isLoading ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                </>
              )}

              {gateResponse && (
                <div className="text-center">
                  <p className="text-sm leading-relaxed text-secondary italic">{gateResponse}</p>
                  <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-border">
                    <div className="h-full animate-[gate-progress_2s_ease-in-out_forwards] rounded-full bg-accent" />
                  </div>
                </div>
              )}

              {isLoading && !gateResponse && <LoadingDots />}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 1: LEARN                                                  */}
          {/* ============================================================== */}
          {currentPhase === "lesson" && (
            <>
              {isLoading && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-secondary">Preparing today&apos;s lesson...</p>
                  <LoadingDots />
                </div>
              )}

              {lessonContent && !isLoading && (
                <>
                  {concept && (
                    <div className="mb-6">
                      <span className="inline-block rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-secondary">
                        {concept.domain}
                      </span>
                      <h2 className="mt-2 text-xl font-bold text-foreground">
                        {concept.name}
                        <span className="ml-2 text-sm font-normal text-secondary">({concept.source})</span>
                      </h2>
                    </div>
                  )}

                  <div className="select-text mb-8 space-y-0">{renderMarkdown(lessonContent)}</div>

                  <button
                    onClick={startRetrieval}
                    className="w-full rounded-lg bg-accent px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-95"
                  >
                    Ready to Practice &rarr;
                  </button>
                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 1.5: RETRIEVAL BRIDGE                                     */}
          {/* ============================================================== */}
          {currentPhase === "retrieval" && (
            <>
              {isLoading && !retrievalQuestion && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-secondary">One moment...</p>
                  <LoadingDots />
                </div>
              )}

              {retrievalQuestion && (
                <div className="space-y-6">
                  <p className="text-center text-lg font-medium leading-relaxed text-foreground">
                    {retrievalQuestion}
                  </p>

                  {retrievalResponse && (
                    <div className="text-center">
                      <p className="text-sm leading-relaxed text-secondary italic">{retrievalResponse}</p>
                      {retrievalReady && (
                        <div className="mx-auto mt-4 h-1 w-32 overflow-hidden rounded-full bg-border">
                          <div className="h-full animate-[gate-progress_1.5s_ease-in-out_forwards] rounded-full bg-accent" />
                        </div>
                      )}
                    </div>
                  )}

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
                        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-opacity active:scale-95 disabled:opacity-40"
                      >
                        {isLoading ? "Evaluating..." : "Submit"}
                      </button>
                    </div>
                  )}

                  {retrievalResponse && !retrievalReady && (
                    <button
                      onClick={startRoleplay}
                      className="w-full rounded-lg bg-accent px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-95"
                    >
                      Continue to Practice &rarr;
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 2: SIMULATE                                               */}
          {/* ============================================================== */}
          {currentPhase === "roleplay" && (
            <>
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

              {/* Chat messages — flow directly in scrollable area */}
              <div className="space-y-3 pb-4">
                {roleplayTranscript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-4 py-3 text-base leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-2xl rounded-tr-sm bg-accent/10 border border-accent/20 text-foreground"
                          : "rounded-2xl rounded-tl-sm bg-surface text-foreground/90"
                      }`}
                    >
                      {i === 0 && msg.role === "assistant" && (
                        <p className="mb-1 text-xs uppercase tracking-wider text-secondary">
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
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface/60 px-4 py-3 text-base leading-relaxed text-foreground/90">
                      {roleplayTranscript.length === 0 && (
                        <p className="mb-1 text-xs uppercase tracking-wider text-secondary">
                          {character?.name}
                        </p>
                      )}
                      {streamingText}
                      <span className="inline-block animate-pulse text-accent">|</span>
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

                {/* Retry on network error */}
                {pendingRetry && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => { sendRoleplayMessage(pendingRetry); }}
                      className="min-h-[44px] rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent active:scale-95"
                    >
                      Connection lost. Tap to retry &rarr;
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Turn 8+ prompt */}
              {Math.ceil(turnCount / 2) >= 8 && (
                <p className="mb-2 text-center text-xs text-secondary">
                  You can continue or type <span className="font-mono text-accent">/done</span> to wrap up
                </p>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 3: DEBRIEF                                                */}
          {/* ============================================================== */}
          {currentPhase === "debrief" && (
            <>
              {isLoading && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-secondary">Analysing your performance...</p>
                  <LoadingDots />
                </div>
              )}

              {debriefContent && !isLoading && (
                <>
                  <div className="select-text mb-8 space-y-0">{renderMarkdown(debriefContent)}</div>

                  {scores && (
                    <div className="mb-8 rounded-lg border border-border bg-surface p-5">
                      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
                        Session Scores
                      </h3>
                      <div className="space-y-3">
                        {SCORE_DIMENSIONS.map(({ key, label }) => {
                          const score = scores[key];
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm text-foreground">{label}</span>
                              <div className="flex items-center gap-3">
                                <span className={`font-mono text-2xl font-bold ${scoreColorClass(score)}`}>
                                  {score}
                                </span>
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-border">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      score >= 4 ? "bg-success" : score === 3 ? "bg-amber" : "bg-accent"
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

                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 4: DEPLOY                                                 */}
          {/* ============================================================== */}
          {currentPhase === "mission" && (
            <>
              {isLoading && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-secondary">Assigning your mission...</p>
                  <LoadingDots />
                </div>
              )}

              {mission && !isLoading && (
                <>
                  <div className="mb-6 rounded-lg border-t-4 border-accent bg-surface p-6">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Your Mission
                    </p>
                    <p className="text-base leading-relaxed text-foreground">{mission}</p>
                  </div>

                  {rationale && (
                    <p className="mb-8 text-sm leading-relaxed text-secondary italic">{rationale}</p>
                  )}

                  {!completedPhases.has("mission") ? (
                    <button
                      onClick={completeSession}
                      className="w-full rounded-lg border border-border bg-surface px-6 py-4 text-base font-semibold text-foreground transition-all hover:bg-surface/80 active:scale-95"
                    >
                      Session Complete
                    </button>
                  ) : (
                    <div className="space-y-4 text-center">
                      <p className="text-sm font-semibold text-success">Day {dayNumber} complete.</p>

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

                      <p className="text-xs text-secondary">See you tomorrow.</p>
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </div>

      {/* ================================================================== */}
      {/* Sticky continue button (debrief only)                              */}
      {/* ================================================================== */}
      {currentPhase === "debrief" && debriefContent && !isLoading && (
        <div className="border-t border-border bg-background px-4 pb-safe pt-3 pb-3">
          <div className="mx-auto max-w-lg">
            <button
              onClick={fetchMission}
              className="w-full rounded-lg bg-accent px-6 py-4 text-base font-semibold text-white transition-all hover:brightness-110 active:scale-95"
            >
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Fixed bottom input bar (roleplay only)                             */}
      {/* ================================================================== */}
      {isRoleplay && !completedPhases.has("roleplay") && (
        <div className="border-t border-border bg-background px-4 pb-safe pt-2">
          {/* Quick command pills (mobile only) */}
          <div className="mb-2 flex gap-2 sm:hidden">
            {[
              { label: "/c", handler: handleCoach },
              { label: "/r", handler: handleReset },
              { label: "/s", handler: handleSkip },
              { label: "/d", handler: handleDone },
            ].map(({ label, handler }) => (
              <button
                key={label}
                onClick={handler}
                className="min-h-[44px] min-w-[44px] rounded-full border border-border bg-surface px-3 font-mono text-xs text-secondary active:scale-95"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Input + send */}
          <div className="flex gap-2 pb-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type your response..."
              className="flex-1 rounded-full border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-secondary/40 outline-none focus:border-accent/50"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue.trim() && !isStreaming) {
                  handleRoleplayInput(inputValue);
                }
              }}
              disabled={isStreaming || isLoading}
            />
            <button
              onClick={() => {
                if (inputValue.trim() && !isStreaming) {
                  handleRoleplayInput(inputValue);
                }
              }}
              disabled={isStreaming || isLoading || !inputValue.trim()}
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-accent text-white transition-opacity active:scale-95 disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.637a.75.75 0 0 0 0-1.4L3.105 2.289Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* "New message" pill */}
      {showNewMessagePill && isRoleplay && (
        <button
          onClick={() => {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
            setShowNewMessagePill(false);
          }}
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-mono text-accent shadow-lg active:scale-95"
        >
          &darr; New message
        </button>
      )}

      {/* ================================================================== */}
      {/* Coach panel — bottom sheet on mobile, side panel on desktop         */}
      {/* ================================================================== */}
      {(coachAdvice || coachLoading) && (
        <>
          {/* Backdrop (mobile) */}
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
          />

          {/* Panel */}
          <div className="fixed inset-x-0 bottom-0 top-1/2 z-50 overflow-y-auto rounded-t-2xl border-t border-border bg-accent-blue p-6 shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:top-0 sm:w-80 sm:max-w-[90vw] sm:rounded-none sm:border-l sm:border-t-0">
            {/* Drag handle (mobile) */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/20 sm:hidden" />

            <div className="mb-4 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/70">
                Mentor
              </span>
              <button
                onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-secondary hover:text-foreground active:scale-95"
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
        </>
      )}
    </div>
  );
}

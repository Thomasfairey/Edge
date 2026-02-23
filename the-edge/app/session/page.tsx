"use client";

/**
 * Session page — manages the full 6-phase daily loop.
 * Check-in → Learn → Retrieval → Simulate → Debrief → Deploy
 *
 * Light theme: white cards, indigo/violet gradients, Inter font.
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

const PHASES: { key: SessionPhase; label: string }[] = [
  { key: "checkin", label: "Check-in" },
  { key: "lesson", label: "Learn" },
  { key: "roleplay", label: "Simulate" },
  { key: "debrief", label: "Debrief" },
  { key: "mission", label: "Deploy" },
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
// Phase indicator — dots + gradient accent line
// ---------------------------------------------------------------------------

function PhaseIndicator({
  current,
  completed,
  skipCheckin,
}: {
  current: SessionPhase;
  completed: Set<SessionPhase>;
  skipCheckin: boolean;
}) {
  const phases = skipCheckin ? PHASES.filter((p) => p.key !== "checkin") : PHASES;
  const currentIdx = phases.findIndex(
    (p) => p.key === current || (current === "retrieval" && p.key === "lesson")
  );

  return (
    <div className="sticky top-0 z-50 bg-background pt-3 pb-2">
      {/* Dots row */}
      <div className="flex items-center justify-center gap-3 mb-2">
        {phases.map((p, i) => {
          const isActive = p.key === current || (current === "retrieval" && p.key === "lesson");
          const isDone = completed.has(p.key);
          const isPulsing = current === "retrieval" && p.key === "lesson";

          return (
            <div key={p.key} className="flex flex-col items-center gap-1">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  isDone
                    ? "bg-success"
                    : isActive
                      ? `bg-accent ${isPulsing ? "pulse-dot-indicator" : ""}`
                      : "bg-border"
                }`}
              />
              <span
                className={`text-[9px] font-medium tracking-wider uppercase ${
                  isActive ? "text-accent" : isDone ? "text-success" : "text-tertiary"
                }`}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Gradient accent line showing progress */}
      <div className="h-[3px] w-full bg-border/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${((currentIdx + 1) / phases.length) * 100}%`,
            background: "linear-gradient(90deg, var(--accent), var(--accent-violet))",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------------

function LoadingDots() {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      <span className="loading-dot h-2 w-2 rounded-full bg-accent/60" />
      <span className="loading-dot h-2 w-2 rounded-full bg-accent/60" />
      <span className="loading-dot h-2 w-2 rounded-full bg-accent/60" />
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
        <h2 key={key++} className="mb-2 mt-6 text-lg font-semibold text-primary first:mt-0">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="mb-2 mt-4 text-base font-medium text-primary">
          {line.slice(4)}
        </h3>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key++} className="text-sm leading-relaxed text-secondary">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={i} className="font-semibold text-primary">
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
  if (score === 3) return "text-warning";
  return "text-danger";
}

// ---------------------------------------------------------------------------
// Main session component
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const router = useRouter();
  const online = useOnlineStatus();

  // Session state
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>("checkin");
  const [completedPhases, setCompletedPhases] = useState<Set<SessionPhase>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skipCheckin, setSkipCheckin] = useState(false);
  const submittingRef = useRef(false);
  const [restored, setRestored] = useState(false);

  // Data accumulated through the session
  const [dayNumber, setDayNumber] = useState(1);
  const [lastMission, setLastMission] = useState<string | null>(null);
  const [checkinOutcome, setCheckinOutcome] = useState<string | null>(null);
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
  const [checkinResponse, setCheckinResponse] = useState<string | null>(null);

  // Checkin pill state — expand input for "Nailed it" / "Tried it"
  const [checkinPillSelected, setCheckinPillSelected] = useState<"completed" | "tried" | null>(null);

  // Retrieval bridge state
  const [retrievalQuestion, setRetrievalQuestion] = useState<string | null>(null);
  const [retrievalResponse, setRetrievalResponse] = useState<string | null>(null);
  const [retrievalReady, setRetrievalReady] = useState(false);

  // Roleplay retry
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);

  // New message pill
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  // Phase transition animation
  const [phaseAnimation, setPhaseAnimation] = useState<"enter" | "active" | "exit">("active");

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
        checkinOutcome,
        skipCheckin,
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
    if (!isLoading && currentPhase !== "checkin") {
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
          setCheckinOutcome(saved.checkinOutcome);
          setSkipCheckin(saved.skipCheckin ?? false);
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
          setSkipCheckin(true);
          setCurrentPhase("lesson");
          fetchLesson();
        } else {
          setLastMission(data.lastEntry.mission);
          setIsLoading(false);
        }
      })
      .catch(() => {
        setSkipCheckin(true);
        setCurrentPhase("lesson");
        fetchLesson();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Phase transition helper with animation
  // ---------------------------------------------------------------------------

  function advancePhase(from: SessionPhase, to: SessionPhase) {
    setPhaseAnimation("exit");
    setTimeout(() => {
      setCompletedPhases((prev) => new Set([...prev, from]));
      setCurrentPhase(to);
      setError(null);
      setPhaseAnimation("enter");
      haptic();
      setTimeout(() => setPhaseAnimation("active"), 50);
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Phase 0: Check-in
  // ---------------------------------------------------------------------------

  async function submitCheckin(outcomeType: "completed" | "tried" | "skipped", userOutcome?: string) {
    if (!lastMission || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousMission: lastMission, outcomeType, userOutcome }),
      });

      if (!res.ok) throw new Error("Check-in API failed");
      const data = await res.json();

      setCheckinResponse(data.response);
      setCheckinOutcome(data.outcome);
      setIsLoading(false);
      submittingRef.current = false;

      setTimeout(() => {
        advancePhase("checkin", "lesson");
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
          body: JSON.stringify({ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, checkinOutcome }),
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
    if (currentPhase === "checkin") setIsLoading(false);
    else if (currentPhase === "lesson") fetchLesson();
    else if (currentPhase === "retrieval") startRetrieval();
    else if (currentPhase === "roleplay") startRoleplayFresh();
    else if (currentPhase === "debrief") fetchDebrief();
    else if (currentPhase === "mission" && concept && character && scores) fetchMission();
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

  const isRoleplay = currentPhase === "roleplay";

  const phaseClass =
    phaseAnimation === "enter" ? "phase-enter" :
    phaseAnimation === "active" ? "phase-active" :
    "phase-exit";

  return (
    <div className="session-page flex flex-col h-dvh overflow-hidden">
      {/* Sticky phase indicator */}
      <PhaseIndicator current={currentPhase} completed={completedPhases} skipCheckin={skipCheckin} />

      {/* Offline banner */}
      {!online && (
        <div className="flex h-7 items-center justify-center bg-warning/10 text-xs font-medium text-warning">
          Offline — reconnecting...
        </div>
      )}

      {/* Restored session notice */}
      {restored && (
        <div className="flex h-7 items-center justify-center bg-accent-light text-xs font-medium text-accent">
          Session restored
        </div>
      )}

      {/* Scrollable content area */}
      <div ref={isRoleplay ? chatContainerRef : undefined} className="chat-container flex-1 overflow-y-auto px-4 sm:px-6">
        <div className={`mx-auto max-w-lg py-4 sm:py-8 ${phaseClass}`}>

          {/* Error display */}
          {error && (
            <div className="card mb-6 border border-danger/20 text-center">
              <p className="text-sm text-danger">{error}</p>
              <button
                onClick={retry}
                className="mt-2 min-h-[44px] text-xs font-semibold text-accent underline active:scale-95"
              >
                Retry
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* PHASE 0: CHECK-IN                                              */}
          {/* ============================================================== */}
          {currentPhase === "checkin" && (
            <>
              {lastMission && !checkinResponse && !isLoading && (
                <div className="space-y-6">
                  {/* Mission card */}
                  <div className="card">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Yesterday&apos;s Mission
                    </p>
                    <p className="text-sm leading-relaxed text-primary">
                      {lastMission}
                    </p>
                  </div>

                  {/* Outcome pills */}
                  <div className="space-y-3">
                    <p className="text-center text-sm font-medium text-secondary">
                      How did it go?
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setCheckinPillSelected("completed")}
                        className={`flex-1 rounded-xl py-3.5 text-sm font-semibold transition-all active:scale-95 ${
                          checkinPillSelected === "completed"
                            ? "bg-accent text-white shadow-md"
                            : "border border-border bg-surface text-primary hover:border-accent/30"
                        }`}
                      >
                        Nailed it
                      </button>
                      <button
                        onClick={() => setCheckinPillSelected("tried")}
                        className={`flex-1 rounded-xl py-3.5 text-sm font-semibold transition-all active:scale-95 ${
                          checkinPillSelected === "tried"
                            ? "bg-accent text-white shadow-md"
                            : "border border-border bg-surface text-primary hover:border-accent/30"
                        }`}
                      >
                        Tried it
                      </button>
                      <button
                        onClick={() => submitCheckin("skipped")}
                        className="flex-1 rounded-xl border border-border bg-surface py-3.5 text-sm font-medium text-tertiary transition-all active:scale-95 hover:border-accent/30"
                      >
                        Skip
                      </button>
                    </div>
                  </div>

                  {/* Expandable input for "Nailed it" / "Tried it" */}
                  {checkinPillSelected && (
                    <div className="animate-sparkle space-y-3">
                      <input
                        type="text"
                        placeholder={
                          checkinPillSelected === "completed"
                            ? "What was the exact reaction?"
                            : "What happened when you tried?"
                        }
                        className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-primary placeholder-tertiary outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && inputValue.trim()) {
                            submitCheckin(checkinPillSelected, inputValue.trim());
                          }
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (inputValue.trim()) {
                            submitCheckin(checkinPillSelected, inputValue.trim());
                          }
                        }}
                        disabled={!inputValue.trim()}
                        className="btn-gradient w-full py-3.5 text-sm disabled:opacity-40"
                      >
                        Submit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Check-in response — fade out to lesson */}
              {checkinResponse && (
                <div className="card text-center">
                  <p className="text-sm leading-relaxed text-secondary italic">{checkinResponse}</p>
                  <div className="gradient-line mx-auto mt-4 w-32 overflow-hidden rounded-full opacity-0" style={{ animation: "gate-progress 2s ease-in-out forwards" }} />
                </div>
              )}

              {isLoading && !checkinResponse && <LoadingDots />}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 1: LEARN                                                 */}
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
                      <span className="inline-block rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent">
                        {concept.domain}
                      </span>
                      <h2 className="mt-3 text-xl font-semibold text-primary">
                        {concept.name}
                        <span className="ml-2 text-sm font-normal text-tertiary">({concept.source})</span>
                      </h2>
                    </div>
                  )}

                  <div className="card select-text mb-8">
                    <div className="space-y-0">{renderMarkdown(lessonContent)}</div>
                  </div>

                  <button
                    onClick={startRetrieval}
                    className="btn-gradient w-full py-4 text-base"
                  >
                    Ready to Practice &rarr;
                  </button>
                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 1.5: RETRIEVAL BRIDGE                                    */}
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
                  <div className="card">
                    <p className="text-center text-lg font-medium leading-relaxed text-primary">
                      {retrievalQuestion}
                    </p>
                  </div>

                  {retrievalResponse && (
                    <div className="card text-center">
                      <p className="text-sm leading-relaxed text-secondary italic">{retrievalResponse}</p>
                      {retrievalReady && (
                        <div className="gradient-line mx-auto mt-4 w-32 overflow-hidden rounded-full opacity-0" style={{ animation: "gate-progress 1.5s ease-in-out forwards" }} />
                      )}
                    </div>
                  )}

                  {!retrievalResponse && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Your answer..."
                        className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-sm text-primary placeholder-tertiary outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
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
                        className="btn-gradient w-full py-3.5 text-sm disabled:opacity-40"
                      >
                        {isLoading ? "Evaluating..." : "Submit"}
                      </button>
                    </div>
                  )}

                  {retrievalResponse && !retrievalReady && (
                    <button
                      onClick={startRoleplay}
                      className="btn-gradient w-full py-4 text-base"
                    >
                      Continue to Practice &rarr;
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* PHASE 2: SIMULATE                                              */}
          {/* ============================================================== */}
          {currentPhase === "roleplay" && (
            <>
              {/* Turn counter */}
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-secondary">{character?.name ?? "Character"}</span>
                <span className="rounded-full bg-accent-light px-2.5 py-0.5 text-[10px] font-medium text-accent">
                  Turn {Math.max(1, Math.ceil(turnCount / 2))} / ~8
                </span>
              </div>

              {/* Reset notice */}
              {resetNotice && (
                <p className="mb-2 text-center text-xs text-secondary animate-pulse">
                  Same concept. Fresh start.
                </p>
              )}

              {/* Chat messages */}
              <div className="space-y-3 pb-4">
                {roleplayTranscript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] px-4 py-3 text-[15px] leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-2xl rounded-tr-sm bg-accent-light text-primary"
                          : "rounded-2xl rounded-tl-sm bg-surface text-primary shadow-sm"
                      }`}
                    >
                      {i === 0 && msg.role === "assistant" && (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
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
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface px-4 py-3 text-[15px] leading-relaxed text-primary shadow-sm">
                      {roleplayTranscript.length === 0 && (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
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
                      className="min-h-[44px] rounded-full border border-warning/30 bg-warning/10 px-4 py-2 text-xs font-medium text-warning active:scale-95"
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
          {/* PHASE 3: DEBRIEF                                               */}
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
                  <div className="card select-text mb-6">
                    <div className="space-y-0">{renderMarkdown(debriefContent)}</div>
                  </div>

                  {scores && (
                    <div className="card mb-8">
                      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
                        Session Scores
                      </h3>
                      <div className="space-y-3">
                        {SCORE_DIMENSIONS.map(({ key, label }) => {
                          const score = scores[key];
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm text-primary">{label}</span>
                              <div className="flex items-center gap-3">
                                <span className={`font-mono text-lg font-bold ${scoreColorClass(score)}`}>
                                  {score}
                                </span>
                                <div className="h-2 w-20 overflow-hidden rounded-full bg-border/50">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${(score / 5) * 100}%`,
                                      background: score >= 4
                                        ? "var(--success)"
                                        : score === 3
                                          ? "var(--warning)"
                                          : "var(--danger)",
                                    }}
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
          {/* PHASE 4: DEPLOY                                                */}
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
                  {/* Mission card with gradient left border */}
                  <div className="relative mb-6 overflow-hidden rounded-2xl bg-surface p-6" style={{ boxShadow: "var(--shadow-elevated)" }}>
                    <div className="absolute inset-y-0 left-0 w-1" style={{ background: "linear-gradient(180deg, var(--accent), var(--accent-violet))" }} />
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                      Your Mission
                    </p>
                    <p className="text-base leading-relaxed text-primary">{mission}</p>
                  </div>

                  {rationale && (
                    <p className="mb-8 text-sm leading-relaxed text-tertiary italic">{rationale}</p>
                  )}

                  {!completedPhases.has("mission") ? (
                    <button
                      onClick={completeSession}
                      className="w-full rounded-xl bg-success py-4 text-base font-semibold text-white transition-all active:scale-95"
                    >
                      Session Complete
                    </button>
                  ) : (
                    <div className="animate-sparkle space-y-4 text-center">
                      <p className="text-lg font-semibold text-success">Day {dayNumber} complete.</p>

                      {scores && (
                        <div className="card text-left">
                          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-secondary">
                            Session Summary
                          </p>
                          {concept && (
                            <p className="mb-2 text-xs text-secondary">
                              Concept: <span className="font-medium text-primary">{concept.name}</span>
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
                                  <span className="text-danger">{weakest.label} ({weakest.score}/5)</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <p className="text-sm text-tertiary">See you tomorrow.</p>
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
              className="btn-gradient w-full py-4 text-base"
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
        <div className="bottom-bar border-t border-border bg-background px-4 pt-2">
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
                className="min-h-[44px] min-w-[44px] rounded-full border border-border bg-surface px-3 font-mono text-xs text-secondary active:scale-95 hover:border-accent/30"
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
              className="flex-1 rounded-full border border-border bg-surface px-4 py-3 text-sm text-primary placeholder-tertiary outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
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
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full text-white transition-all active:scale-95 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-violet))" }}
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
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-xs font-medium text-white shadow-lg active:scale-95"
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
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm sm:hidden"
            onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
          />

          {/* Panel */}
          <div className="fixed inset-x-0 bottom-0 top-1/2 z-50 overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-6 shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:top-0 sm:w-80 sm:max-w-[90vw] sm:rounded-none sm:border-l sm:border-t-0">
            {/* Drag handle (mobile) */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />

            <div className="mb-4 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
                Mentor
              </span>
              <button
                onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-lg text-tertiary hover:text-primary active:scale-95"
              >
                &times;
              </button>
            </div>
            {coachLoading ? (
              <LoadingDots />
            ) : (
              <div className="text-sm leading-relaxed text-secondary">
                {renderMarkdown(coachAdvice!)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

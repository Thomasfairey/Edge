"use client";

/**
 * Session page — manages the full daily loop.
 * Day 1:  Learn → Retrieval → Simulate → Debrief → Mission
 * Day 2+: Learn → Retrieval → Simulate → Debrief → Check-in → Mission
 *
 * Tiimo-inspired: phase-coloured backgrounds, super-rounded cards, soft pastels,
 * emoji command circles, coloured score dots, confetti completion.
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
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

const PHASES: { key: SessionPhase; label: string; color: string }[] = [
  { key: "lesson", label: "Learn", color: "#B8D4E3" },
  { key: "roleplay", label: "Sim", color: "#F2C4C4" },
  { key: "debrief", label: "Brief", color: "#C5B8E8" },
  { key: "mission", label: "Deploy", color: "#B8E0C8" },
];

const PHASE_BG: Record<string, string> = {
  lesson: "#EFF6FA",
  retrieval: "#EFF6FA",
  roleplay: "#FDF2F2",
  debrief: "#F3F0FA",
  mission: "#F0FAF4",
};

const PHASE_TINT: Record<string, string> = {
  lesson: "#EFF6FA",
  retrieval: "#EFF6FA",
  roleplay: "#FDF2F2",
  debrief: "#F3F0FA",
  mission: "#F0FAF4",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haptic(ms = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

function scoreCircleColor(score: number): string {
  if (score >= 4) return "#6BC9A0";
  if (score === 3) return "#F5C563";
  return "#E88B8B";
}

function scoreTextColor(score: number): string {
  if (score >= 4) return "#1A5C3A"; // dark green on green bg
  if (score === 3) return "#6B4F00"; // dark amber on gold bg
  return "#7A2020"; // dark red on coral bg
}

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
// Phase indicator — coloured dots per phase
// ---------------------------------------------------------------------------

function PhaseIndicator({
  current,
  completed,
}: {
  current: SessionPhase;
  completed: Set<SessionPhase>;
}) {
  return (
    <div className="flex-shrink-0 z-50 bg-[var(--background)] pt-3 pb-2 border-b border-[#F0EDE8]">
      <div className="flex items-center justify-center gap-5">
        {PHASES.map((p) => {
          const isActive = p.key === current || (current === "retrieval" && p.key === "lesson");
          const isDone = completed.has(p.key);

          return (
            <div key={p.key} className="flex flex-col items-center gap-1.5">
              <div
                className={`h-3 w-3 rounded-full transition-all ${isActive ? "phase-dot-active" : ""}`}
                style={{
                  backgroundColor: isDone || isActive ? p.color : "transparent",
                  border: isDone || isActive ? "none" : `2px solid ${p.color}4D`,
                }}
              />
              <span
                className={`text-sm font-medium ${
                  isActive ? "text-primary" : isDone ? "text-secondary" : "text-secondary"
                }`}
              >
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading dots
// ---------------------------------------------------------------------------

function LoadingDots() {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      <span className="loading-dot h-2 w-2 rounded-full bg-[#5A52E0]/50" />
      <span className="loading-dot h-2 w-2 rounded-full bg-[#5A52E0]/50" />
      <span className="loading-dot h-2 w-2 rounded-full bg-[#5A52E0]/50" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="mb-2 mt-5 text-sm font-medium text-[#5B8BA8] first:mt-0">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="mb-2 mt-4 text-sm font-medium text-[#5B8BA8]">
          {line.slice(4)}
        </h3>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key++} className="text-base leading-relaxed text-primary">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={i} className="font-semibold">
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
// Lesson section splitter — parses "## The Principle", "## The Play", "## The Counter"
// ---------------------------------------------------------------------------

function splitLessonSections(text: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const pattern = /^## (The (?:Principle|Play|Counter))/gm;
  const headings: { title: string; index: number }[] = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    headings.push({ title: match[1], index: match.index });
  }

  if (headings.length === 0) {
    return [{ title: "Lesson", content: text }];
  }

  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index + headings[i].title.length + 3; // skip "## Title\n"
    const end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    sections.push({
      title: headings[i].title,
      content: text.slice(start, end).trim(),
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Swipeable lesson cards component
// ---------------------------------------------------------------------------

function LessonCards({
  sections,
  isStreaming,
}: {
  sections: { title: string; content: string }[];
  isStreaming: boolean;
}) {
  const [currentCard, setCurrentCard] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

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

  const section = sections[currentCard];
  if (!section) return null;

  return (
    <div>
      <div
        className="select-text rounded-3xl p-6 shadow-[var(--shadow-soft)] overflow-y-auto"
        style={{ backgroundColor: "#EFF6FA", maxHeight: "calc(100dvh - 220px)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <h2 className="mb-3 text-sm font-medium text-[#5B8BA8]">{section.title}</h2>
        <div className="space-y-0">
          {renderMarkdown(section.content)}
          {isStreaming && currentCard === sections.length - 1 && (
            <span className="inline-block animate-pulse text-[#5A52E0]">|</span>
          )}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {sections.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentCard(i)}
            className={`h-2 rounded-full transition-all ${
              i === currentCard ? "w-6 bg-[#5A52E0]" : "w-2 bg-[#B8D4E3]"
            }`}
            style={{ minHeight: 8, minWidth: 8 }}
          />
        ))}
        <span className="ml-2 text-xs text-secondary">
          {currentCard + 1} / {sections.length}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debrief markdown renderer (lavender styling)
// ---------------------------------------------------------------------------

function renderDebriefMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ") || line.startsWith("**") && line.endsWith("**")) {
      const header = line.startsWith("## ") ? line.slice(3) : line.slice(2, -2);
      elements.push(
        <h2 key={key++} className="mb-2 mt-5 text-sm font-medium text-[#5B4B88] first:mt-0">
          {header}
        </h2>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={key++} className="text-base leading-relaxed text-primary">
          {parts.map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={i} className="font-semibold">
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
// Confetti component
// ---------------------------------------------------------------------------

function Confetti() {
  const colors = ["#B8D4E3", "#F2C4C4", "#C5B8E8", "#B8E0C8"];
  const dots = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${10 + Math.random() * 80}%`,
    delay: `${Math.random() * 0.4}s`,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((dot) => (
        <div
          key={dot.id}
          className="confetti-dot"
          style={{
            backgroundColor: dot.color,
            left: dot.left,
            bottom: "40%",
            animationDelay: dot.delay,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main session component
// ---------------------------------------------------------------------------

export default function SessionPage() {
  const router = useRouter();
  const online = useOnlineStatus();

  // Session state
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>("lesson");
  const [completedPhases, setCompletedPhases] = useState<Set<SessionPhase>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [restored, setRestored] = useState(false);

  // Data
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

  // Check-in state (within deploy phase)
  const [checkinNeeded, setCheckinNeeded] = useState(false);
  const [checkinDone, setCheckinDone] = useState(false);
  const [checkinPillSelected, setCheckinPillSelected] = useState<"completed" | "tried" | null>(null);
  const [checkinResponse, setCheckinResponse] = useState<string | null>(null);

  // Retrieval bridge
  const [retrievalQuestion, setRetrievalQuestion] = useState<string | null>(null);
  const [retrievalResponse, setRetrievalResponse] = useState<string | null>(null);
  const [retrievalReady, setRetrievalReady] = useState(false);

  // Roleplay retry
  const [pendingRetry, setPendingRetry] = useState<string | null>(null);
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);

  // Phase animation
  const [phaseAnimation, setPhaseAnimation] = useState<"enter" | "active" | "exit">("active");

  // Completion
  const [showConfetti, setShowConfetti] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [resetNotice, setResetNotice] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // ---------------------------------------------------------------------------
  // Auto-scroll
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
    if (isNearBottom()) { scrollToBottom(); }
    else if (roleplayTranscript.length > 0) { setShowNewMessagePill(true); }
  }, [roleplayTranscript, streamingText, scrollToBottom, isNearBottom]);

  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const h = () => { if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) setShowNewMessagePill(false); };
    el.addEventListener("scroll", h, { passive: true });
    return () => el.removeEventListener("scroll", h);
  }, [currentPhase]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const h = () => { if (vv.height < window.innerHeight * 0.75) chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
    vv.addEventListener("resize", h);
    return () => vv.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", `/session?phase=${currentPhase}`);
  }, [currentPhase]);

  useEffect(() => {
    if (!isStreaming && currentPhase === "roleplay") inputRef.current?.focus();
  }, [isStreaming, currentPhase]);

  useEffect(() => {
    if (restored) { const t = setTimeout(() => setRestored(false), 3000); return () => clearTimeout(t); }
  }, [restored]);

  // ---------------------------------------------------------------------------
  // Session persistence
  // ---------------------------------------------------------------------------

  function saveSession() {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        phase: currentPhase, concept, character, lessonContent,
        transcript: roleplayTranscript, turnCount,
        completedPhases: Array.from(completedPhases), commandsUsed,
        checkinOutcome, checkinNeeded, checkinDone,
        dayNumber, scenarioContext, debriefContent, scores,
        behavioralWeaknessSummary, keyMoment, mission, rationale,
        lastMission, coachAdvice, timestamp: Date.now(),
      }));
    } catch {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
  }

  useEffect(() => {
    if (!isLoading) saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase, roleplayTranscript.length, turnCount, debriefContent, scores, mission, checkinDone, coachAdvice]);

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (Date.now() - s.timestamp < SESSION_MAX_AGE_MS) {
          setCurrentPhase(s.phase); setConcept(s.concept); setCharacter(s.character);
          setLessonContent(s.lessonContent); setRoleplayTranscript(s.transcript || []);
          setTurnCount(s.turnCount || 0); setCompletedPhases(new Set(s.completedPhases || []));
          setCommandsUsed(s.commandsUsed || []); setCheckinOutcome(s.checkinOutcome);
          setCheckinNeeded(s.checkinNeeded ?? false); setCheckinDone(s.checkinDone ?? false);
          setDayNumber(s.dayNumber || 1); setScenarioContext(s.scenarioContext || null);
          if (s.debriefContent) setDebriefContent(s.debriefContent);
          if (s.scores) setScores(s.scores);
          if (s.behavioralWeaknessSummary) setBehavioralWeaknessSummary(s.behavioralWeaknessSummary);
          if (s.keyMoment) setKeyMoment(s.keyMoment);
          if (s.mission) setMission(s.mission);
          if (s.rationale) setRationale(s.rationale);
          if (s.lastMission) setLastMission(s.lastMission);
          if (s.coachAdvice) setCoachAdvice(s.coachAdvice);
          setIsLoading(false); setRestored(true); return;
        } else { localStorage.removeItem(SESSION_STORAGE_KEY); }
      }
    } catch {}

    // Always start with lesson — fetch status to check if checkin needed later
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        setDayNumber(data.dayNumber);
        if (data.lastEntry) {
          setLastMission(data.lastEntry.mission);
          setCheckinNeeded(true);
        }
        fetchLesson();
      })
      .catch(() => { fetchLesson(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Phase transition
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
  // Phase 1: Lesson
  // ---------------------------------------------------------------------------

  const [lessonStreaming, setLessonStreaming] = useState(false);

  async function fetchLesson() {
    setIsLoading(true);
    setError(null);

    // Check for pre-generated lesson in localStorage
    try {
      const cached = localStorage.getItem("edge-pregenerated-lesson");
      if (cached) {
        const parsed = JSON.parse(cached);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.date === today && parsed.concept && parsed.lessonContent) {
          setConcept(parsed.concept);
          setLessonContent(parsed.lessonContent);
          setIsLoading(false);
          localStorage.removeItem("edge-pregenerated-lesson");
          return;
        }
        localStorage.removeItem("edge-pregenerated-lesson");
      }
    } catch {}

    // Stream the lesson
    try {
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Extract concept from header
      const conceptHeader = res.headers.get("X-Concept");
      if (conceptHeader) {
        setConcept(JSON.parse(decodeURIComponent(conceptHeader)));
      }

      // Stream the lesson content
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream body");

      const decoder = new TextDecoder();
      let fullText = "";
      setLessonStreaming(true);
      setIsLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setLessonContent(fullText);
      }

      setLessonContent(fullText);
      setLessonStreaming(false);
    } catch {
      setLessonStreaming(false);
      setError("Couldn\u2019t load your session \u2014 your connection might be patchy. Tap to retry.");
      setIsLoading(false);
    }
  }

  // Pre-generate tomorrow's lesson after session completion
  function pregenerateTomorrowsLesson() {
    try {
      fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: false }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.concept && data.lessonContent) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            localStorage.setItem(
              "edge-pregenerated-lesson",
              JSON.stringify({
                date: tomorrow.toISOString().slice(0, 10),
                concept: data.concept,
                lessonContent: data.lessonContent,
              })
            );
          }
        })
        .catch(() => {}); // Silent failure for pre-generation
    } catch {}
  }

  // ---------------------------------------------------------------------------
  // Retrieval Bridge
  // ---------------------------------------------------------------------------

  async function startRetrieval() {
    if (!concept) return;
    advancePhase("lesson", "retrieval");
    setIsLoading(true);
    try {
      const res = await fetchWithRetry(
        "/api/retrieval-bridge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept }) },
        5, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/5)`); }
      );
      const data = await res.json();
      setRetrievalQuestion(data.response);
      setError(null); setIsLoading(false);
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, userResponse }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      setRetrievalResponse(data.response);
      setRetrievalReady(data.ready);
      setIsLoading(false); submittingRef.current = false;
      if (data.ready) setTimeout(() => startRoleplay(), 1500);
    } catch {
      setError("Failed to evaluate response. Try again.");
      setIsLoading(false); submittingRef.current = false;
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character: char, transcript: [], userMessage: null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
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
    const updated: Message[] = [...roleplayTranscript, { role: "user", content: userMessage }];
    setRoleplayTranscript(updated);
    setTurnCount((p) => p + 1);
    setInputValue("");
    haptic();
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character, transcript: updated, userMessage: null, scenarioContext }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      await streamRoleplayResponse(res, updated);
    } catch {
      setRoleplayTranscript(roleplayTranscript);
      setTurnCount((p) => p - 1);
      setPendingRetry(userMessage);
      submittingRef.current = false;
    }
  }

  async function streamRoleplayResponse(res: Response, currentTranscript: Message[]) {
    setIsStreaming(true); setStreamingText(""); setIsLoading(false);
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      setStreamingText(fullText);
    }
    setRoleplayTranscript([...currentTranscript, { role: "assistant", content: fullText }]);
    setStreamingText(""); setIsStreaming(false);
    setTurnCount((p) => p + 1);
    submittingRef.current = false;
  }

  async function handleCoach() {
    if (!concept || roleplayTranscript.length === 0) return;
    setCoachAdvice(null); setCoachLoading(true);
    setCommandsUsed((p) => p.includes("/coach") ? p : [...p, "/coach"]);
    haptic();
    try {
      const res = await fetch("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: roleplayTranscript, concept }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      setCoachAdvice(data.advice);
    } catch { setCoachAdvice("Coach unavailable right now. Trust your instincts."); }
    finally { setCoachLoading(false); }
  }

  function handleReset() {
    setCommandsUsed((p) => [...p, "/reset"]);
    setRoleplayTranscript([]); setTurnCount(0);
    setStreamingText(""); setCoachAdvice(null); setCoachLoading(false);
    setResetNotice(true); haptic();
    setTimeout(() => setResetNotice(false), 3000);
    startRoleplayFresh();
  }

  async function startRoleplayFresh() {
    if (!concept || !character) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character, transcript: [], userMessage: null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) setScenarioContext(decodeURIComponent(sc));
      await streamRoleplayResponse(res, []);
    } catch { setError("Failed to reset."); setIsLoading(false); }
  }

  function handleSkip() {
    setCommandsUsed((p) => [...p, "/skip"]); haptic();
    advancePhase("roleplay", "debrief"); fetchDebrief();
  }

  function handleDone() {
    haptic(); advancePhase("roleplay", "debrief"); fetchDebrief();
  }

  function handleRoleplayInput(value: string) {
    const t = value.trim().toLowerCase();
    if (t === "/coach") { handleCoach(); setInputValue(""); }
    else if (t === "/reset") { handleReset(); setInputValue(""); }
    else if (t === "/skip") { handleSkip(); setInputValue(""); }
    else if (t === "/done") { handleDone(); setInputValue(""); }
    else { sendRoleplayMessage(value.trim()); }
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Debrief
  // ---------------------------------------------------------------------------

  const [debriefRetryCount, setDebriefRetryCount] = useState(0);
  const [canSkipDebrief, setCanSkipDebrief] = useState(false);

  async function fetchDebrief() {
    if (!concept || !character) return;
    setIsLoading(true); setError(null);
    try {
      const res = await fetchWithRetry(
        "/api/debrief",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: roleplayTranscript, concept, character, commandsUsed }) },
        3, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/3)`); }
      );
      const data = await res.json();
      let display = data.debriefContent;
      const idx = display.indexOf("---SCORES---");
      if (idx !== -1) display = display.slice(0, idx).trim();
      setDebriefContent(display);
      setScores(data.scores);
      setBehavioralWeaknessSummary(data.behavioralWeaknessSummary);
      setKeyMoment(data.keyMoment);
      setError(null); setIsLoading(false);
      setDebriefRetryCount(0);
    } catch {
      const newCount = debriefRetryCount + 1;
      setDebriefRetryCount(newCount);
      if (newCount >= 2) {
        setCanSkipDebrief(true);
        setError("Couldn\u2019t generate your debrief. Tap to retry or skip to mission.");
      } else {
        setError("Couldn\u2019t generate your debrief \u2014 tap to retry.");
      }
      setIsLoading(false);
    }
  }

  function skipDebriefToMission() {
    // Use default scores
    setScores({ technique_application: 3, tactical_awareness: 3, frame_control: 3, emotional_regulation: 3, strategic_outcome: 3 });
    setDebriefContent("Debrief unavailable due to connection issues. Default scores applied.");
    setBehavioralWeaknessSummary("Unable to generate analysis.");
    setKeyMoment("Unable to identify key moment.");
    setCanSkipDebrief(false);
    setError(null);
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Deploy (check-in + mission)
  // ---------------------------------------------------------------------------

  function enterDeploy() {
    advancePhase("debrief", "mission");
    // If day 2+, show check-in first. Otherwise go straight to mission.
    if (checkinNeeded && !checkinDone) {
      setIsLoading(false);
    } else {
      fetchMission();
    }
  }

  async function submitCheckin(outcomeType: "completed" | "tried" | "skipped", userOutcome?: string) {
    if (!lastMission || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousMission: lastMission, outcomeType, userOutcome }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("Check-in API failed");
      const data = await res.json();
      setCheckinResponse(data.response);
      setCheckinOutcome(data.type);
      setCheckinDone(true);
      setIsLoading(false);
      submittingRef.current = false;
      // After check-in, auto-advance to mission
      setTimeout(() => { setCheckinResponse(null); fetchMission(); }, 2000);
    } catch {
      setError("Failed to submit. Try again.");
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  const [missionRetryCount, setMissionRetryCount] = useState(0);

  async function fetchMission() {
    if (!concept || !character || !scores || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true); setError(null);
    try {
      const res = await fetchWithRetry(
        "/api/mission",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, checkinOutcome }) },
        3, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/3)`); }
      );
      const data = await res.json();
      setMission(data.mission); setRationale(data.rationale);
      setError(null); setIsLoading(false);
      submittingRef.current = false;
      setMissionRetryCount(0);
    } catch {
      const newCount = missionRetryCount + 1;
      setMissionRetryCount(newCount);
      if (newCount >= 2) {
        // Use fallback mission
        setMission("Practice today\u2019s technique in your next conversation. Notice what happens when you use it deliberately.");
        setRationale("Observation builds pattern recognition.");
        setError(null);
      } else {
        setError("Couldn\u2019t load your mission \u2014 tap to retry.");
      }
      setIsLoading(false); submittingRef.current = false;
    }
  }

  const sessionCompletedRef = useRef(false);
  function completeSession() {
    if (sessionCompletedRef.current) return;
    sessionCompletedRef.current = true;
    setCompletedPhases((p) => new Set([...p, "mission"]));
    setShowConfetti(true);
    clearSession(); haptic();
    // Pre-generate tomorrow's lesson in the background
    pregenerateTomorrowsLesson();
  }

  function retry() {
    setError(null);
    if (currentPhase === "lesson") fetchLesson();
    else if (currentPhase === "retrieval") startRetrieval();
    else if (currentPhase === "roleplay") startRoleplayFresh();
    else if (currentPhase === "debrief") fetchDebrief();
    else if (currentPhase === "mission" && concept && character && scores) fetchMission();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const SCORE_DIMS: { key: keyof SessionScores; label: string }[] = [
    { key: "technique_application", label: "TA" },
    { key: "tactical_awareness", label: "TW" },
    { key: "frame_control", label: "FC" },
    { key: "emotional_regulation", label: "ER" },
    { key: "strategic_outcome", label: "SO" },
  ];

  const isRoleplay = currentPhase === "roleplay";
  const phaseBg = PHASE_BG[currentPhase] || "#FAF9F6";
  const phaseClass = phaseAnimation === "enter" ? "phase-enter" : phaseAnimation === "active" ? "phase-active" : "phase-exit";

  return (
    <div
      className="session-page flex flex-col h-dvh overflow-hidden phase-bg-transition"
      style={{ backgroundColor: phaseBg }}
    >
      {/* Phase indicator with exit button */}
      <div className="flex-shrink-0 relative">
        <button
          onClick={() => setShowExitModal(true)}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-50 flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-transform active:scale-[0.92]"
          aria-label="Leave session"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <PhaseIndicator current={currentPhase} completed={completedPhases} />
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="flex-shrink-0 flex h-7 items-center justify-center text-xs font-medium text-[#C4A24E]" style={{ backgroundColor: "#FFF8E7" }}>
          Offline &mdash; reconnecting...
        </div>
      )}

      {restored && (
        <div className="flex-shrink-0 flex h-7 items-center justify-center bg-[#EEEDFF] text-xs font-medium text-[#5A52E0]">
          Session restored
        </div>
      )}

      {/* Scrollable content */}
      <div ref={isRoleplay ? chatContainerRef : undefined} className="chat-container flex-1 overflow-y-auto px-4 sm:px-6">
        <div className={`mx-auto max-w-lg py-5 sm:py-8 ${phaseClass}`}>

          {error && (
            <div className="mb-5 rounded-3xl bg-white p-5 text-center shadow-[var(--shadow-soft)]">
              <p className="text-sm text-[#E88B8B]">{error}</p>
              <div className="mt-3 flex items-center justify-center gap-4">
                <button onClick={retry} className="min-h-[44px] text-xs font-medium text-[#5A52E0] underline active:scale-[0.97]">
                  Retry
                </button>
                {canSkipDebrief && currentPhase === "debrief" && (
                  <button onClick={skipDebriefToMission} className="min-h-[44px] text-xs font-medium text-secondary underline active:scale-[0.97]">
                    Skip to mission
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* LEARN                                                           */}
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
                    <div className="mb-4">
                      <span className="inline-block rounded-full bg-[#EEEDFF] px-3 py-1 text-xs font-medium text-[#5A52E0]">
                        {concept.domain}
                      </span>
                      <h2 className="mt-3 text-xl font-semibold text-primary">
                        {concept.name}
                        <span className="ml-2 text-sm font-normal italic text-secondary">({concept.source})</span>
                      </h2>
                    </div>
                  )}

                  <LessonCards
                    sections={splitLessonSections(lessonContent)}
                    isStreaming={lessonStreaming}
                  />
                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* RETRIEVAL                                                       */}
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
                <div className="space-y-5">
                  <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]">
                    <p className="text-center text-lg font-medium leading-relaxed text-primary">
                      {retrievalQuestion}
                    </p>
                  </div>

                  {retrievalResponse && (
                    <div className="rounded-3xl bg-white p-6 text-center shadow-[var(--shadow-soft)]">
                      <p className="text-sm leading-relaxed text-secondary italic">{retrievalResponse}</p>
                    </div>
                  )}

                  {!retrievalResponse && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Your answer..."
                        className="w-full rounded-2xl border-none px-4 py-3 text-base text-primary placeholder-tertiary outline-none focus:ring-2 focus:ring-[#5A52E0]/20"
                        style={{ backgroundColor: PHASE_TINT.lesson }}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) { submitRetrievalResponse(inputValue.trim()); setInputValue(""); } }}
                        disabled={isLoading}
                        autoFocus
                      />
                      <button
                        onClick={() => { if (inputValue.trim()) { submitRetrievalResponse(inputValue.trim()); setInputValue(""); } }}
                        disabled={isLoading || !inputValue.trim()}
                        className="w-full rounded-2xl bg-[#5A52E0] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                      >
                        {isLoading ? "Evaluating..." : "Submit"}
                      </button>
                    </div>
                  )}

                  {retrievalResponse && !retrievalReady && (
                    <button
                      onClick={() => startRoleplay()}
                      className="w-full rounded-2xl bg-[#5A52E0] py-4 text-base font-semibold text-white transition-transform active:scale-[0.97]"
                    >
                      Continue to practice &rarr;
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* SIMULATE                                                        */}
          {/* ============================================================== */}
          {currentPhase === "roleplay" && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-secondary">{character?.name ?? "Character"}</span>
                <span className="text-xs text-secondary">Turn {Math.max(1, Math.ceil(turnCount / 2))} / ~8</span>
              </div>

              {resetNotice && (
                <p className="mb-2 text-center text-xs text-secondary animate-pulse">Same concept. Fresh start.</p>
              )}

              <div className="space-y-3 pb-4">
                {roleplayTranscript.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] p-4 text-base leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-3xl rounded-tr-lg"
                          : "rounded-3xl rounded-tl-lg bg-white shadow-[var(--shadow-soft)]"
                      }`}
                      style={msg.role === "user" ? { backgroundColor: "rgba(242,196,196,0.3)" } : undefined}
                    >
                      {i === 0 && msg.role === "assistant" && (
                        <p className="mb-1 text-xs font-medium" style={{ color: "#D4908F" }}>
                          {character?.name}
                        </p>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isStreaming && streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-3xl rounded-tl-lg bg-white p-4 text-base leading-relaxed shadow-[var(--shadow-soft)]">
                      {roleplayTranscript.length === 0 && (
                        <p className="mb-1 text-xs font-medium" style={{ color: "#D4908F" }}>{character?.name}</p>
                      )}
                      {streamingText}
                      <span className="inline-block animate-pulse text-[#5A52E0]">|</span>
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

                {pendingRetry && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => sendRoleplayMessage(pendingRetry)}
                      className="min-h-[44px] rounded-full px-4 py-2 text-xs font-medium active:scale-[0.97]"
                      style={{ backgroundColor: "#FFF8E7", color: "#C4A24E" }}
                    >
                      Connection lost. Tap to retry &rarr;
                    </button>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {Math.ceil(turnCount / 2) >= 8 && (
                <div className="mb-2 rounded-2xl bg-white/70 px-4 py-2 text-center text-sm text-secondary">
                  You can continue or tap &#10003; when ready
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* DEBRIEF                                                         */}
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
                  {/* Score circles */}
                  {scores && (
                    <div className="mb-5 rounded-3xl bg-white p-5 shadow-[var(--shadow-soft)]">
                      <div className="flex items-center justify-center gap-5">
                        {SCORE_DIMS.map(({ key, label }) => {
                          const s = scores[key];
                          return (
                            <div key={key} className="flex flex-col items-center gap-1.5">
                              <div
                                className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                                style={{ backgroundColor: scoreCircleColor(s), color: scoreTextColor(s) }}
                              >
                                {s}
                              </div>
                              <span className="text-xs text-secondary">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Analysis card */}
                  <div className="select-text mb-5 rounded-3xl p-6 shadow-[var(--shadow-soft)]" style={{ backgroundColor: PHASE_TINT.debrief }}>
                    <div className="space-y-0">{renderDebriefMarkdown(debriefContent)}</div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* DEPLOY (check-in + mission)                                     */}
          {/* ============================================================== */}
          {currentPhase === "mission" && (
            <>
              {/* Check-in card (Day 2+, before mission loads) */}
              {checkinNeeded && !checkinDone && !isLoading && !mission && (
                <div className="animate-fade-in-up space-y-5">
                  <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]">
                    <p className="mb-3 text-sm text-secondary">Before your next mission...</p>
                    <p className="mb-1 text-sm text-secondary">Yesterday you were asked to:</p>
                    <p className="mb-5 text-base font-medium leading-relaxed text-primary">
                      &ldquo;{lastMission}&rdquo;
                    </p>
                    <p className="mb-4 text-sm font-medium text-primary">How did it go?</p>

                    {/* Outcome pills */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setCheckinPillSelected("completed")}
                        className={`flex-1 rounded-full px-4 py-3 text-sm font-medium transition-transform active:scale-[0.97] ${
                          checkinPillSelected === "completed" ? "ring-2 ring-[#5A52E0]" : ""
                        }`}
                        style={{ backgroundColor: "#B8E0C8", color: "#2D6A4F" }}
                      >
                        &#10003; Nailed it
                      </button>
                      <button
                        onClick={() => setCheckinPillSelected("tried")}
                        className={`flex-1 rounded-full px-4 py-3 text-sm font-medium transition-transform active:scale-[0.97] ${
                          checkinPillSelected === "tried" ? "ring-2 ring-[#5A52E0]" : ""
                        }`}
                        style={{ backgroundColor: "#F5E6B8", color: "#8B7024" }}
                      >
                        ~ Tried it
                      </button>
                      <button
                        onClick={() => submitCheckin("skipped")}
                        className="flex-1 rounded-full px-4 py-3 text-sm font-medium transition-transform active:scale-[0.97]"
                        style={{ backgroundColor: "#F0EDE8", color: "#8E8C99" }}
                      >
                        &#10005; Skip
                      </button>
                    </div>

                    {/* Expandable input */}
                    {checkinPillSelected && (
                      <div className="mt-4 animate-fade-in-up space-y-3">
                        <input
                          type="text"
                          placeholder={checkinPillSelected === "completed" ? "What was the exact reaction?" : "What happened when you tried?"}
                          className="w-full rounded-2xl border-none px-4 py-3 text-base text-primary placeholder-tertiary outline-none focus:ring-2 focus:ring-[#5A52E0]/20"
                          style={{ backgroundColor: PHASE_TINT.mission }}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && inputValue.trim()) submitCheckin(checkinPillSelected, inputValue.trim()); }}
                          autoFocus
                        />
                        <button
                          onClick={() => { if (inputValue.trim()) submitCheckin(checkinPillSelected, inputValue.trim()); }}
                          disabled={!inputValue.trim()}
                          className="w-full rounded-2xl bg-[#5A52E0] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                        >
                          Submit
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Check-in response (brief display before mission) */}
              {checkinResponse && (
                <div className="animate-fade-in-up rounded-3xl bg-white p-6 text-center shadow-[var(--shadow-soft)]">
                  <p className="text-sm leading-relaxed text-secondary italic">{checkinResponse}</p>
                </div>
              )}

              {/* Loading mission */}
              {isLoading && !checkinResponse && (
                <div className="text-center">
                  <p className="mb-2 text-sm text-secondary">Assigning your mission...</p>
                  <LoadingDots />
                </div>
              )}

              {/* Mission card */}
              {mission && !isLoading && !checkinResponse && (
                <div className="animate-fade-in-up relative">
                  <p className="mb-3 text-sm font-medium" style={{ color: "#5A9A7A" }}>Your mission</p>

                  <div className="mb-5 rounded-3xl p-6 shadow-[var(--shadow-soft)]" style={{ backgroundColor: PHASE_TINT.mission }}>
                    <p className="text-lg font-medium leading-relaxed text-primary">{mission}</p>
                    {rationale && (
                      <>
                        <div className="my-4 border-t" style={{ borderColor: "rgba(184,224,200,0.3)" }} />
                        <p className="text-sm text-secondary">{rationale}</p>
                      </>
                    )}
                  </div>

                  {!showConfetti ? (
                    <button
                      onClick={completeSession}
                      className="w-full rounded-2xl py-4 text-base font-semibold text-white transition-transform active:scale-[0.97]"
                      style={{ backgroundColor: "#6BC9A0" }}
                    >
                      Session complete &#10003;
                    </button>
                  ) : (
                    <div className="animate-fade-in-up space-y-5">
                      {/* Completion card */}
                      <div className="rounded-3xl p-6 shadow-[var(--shadow-soft)]" style={{ backgroundColor: "#E8F5ED" }}>
                        <p className="mb-1 text-center text-xl font-semibold text-primary animate-completion">
                          Session complete
                        </p>
                        <p className="mb-5 text-center text-sm text-secondary">
                          Day {dayNumber} &middot; {concept?.name}
                        </p>

                        {/* Key takeaway */}
                        {keyMoment && (
                          <div className="mb-5 rounded-2xl bg-white/60 px-4 py-3">
                            <p className="text-sm font-medium text-secondary">Key takeaway</p>
                            <p className="mt-1 text-sm leading-relaxed text-primary">{keyMoment}</p>
                          </div>
                        )}

                        {/* Scores */}
                        {scores && (
                          <div className="mb-5">
                            <div className="flex items-center justify-center gap-3">
                              {SCORE_DIMS.map(({ key, label }) => {
                                const s = scores[key];
                                return (
                                  <div key={key} className="flex flex-col items-center gap-1">
                                    <div
                                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                                      style={{ backgroundColor: scoreCircleColor(s), color: scoreTextColor(s) }}
                                    >
                                      {s}
                                    </div>
                                    <span className="text-[10px] text-secondary">{label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Mission reminder */}
                        {mission && (
                          <div className="mb-4 rounded-2xl bg-white/60 px-4 py-3">
                            <p className="text-sm font-medium text-[#5A9A7A]">Your mission today</p>
                            <p className="mt-1 text-sm leading-relaxed text-primary">{mission}</p>
                          </div>
                        )}

                        {/* Share button */}
                        <button
                          onClick={() => {
                            const text = `The Edge - Day ${dayNumber}\nConcept: ${concept?.name}\nScores: ${scores ? Object.values(scores).join(", ") : "-"}\nMission: ${mission || "-"}`;
                            if (navigator.share) {
                              navigator.share({ text }).catch(() => {});
                            } else {
                              navigator.clipboard.writeText(text).catch(() => {});
                            }
                          }}
                          className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#B8E0C8] py-2.5 text-sm font-medium text-[#5A9A7A] transition-transform active:scale-[0.97]"
                        >
                          Share summary
                        </button>
                      </div>

                      {/* Done button */}
                      <button
                        onClick={() => router.push("/")}
                        className="w-full rounded-2xl py-4 text-base font-semibold text-white transition-transform active:scale-[0.97]"
                        style={{ backgroundColor: "#5A52E0" }}
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* ================================================================== */}
      {/* Sticky CTA (learn phase)                                            */}
      {/* ================================================================== */}
      {currentPhase === "lesson" && lessonContent && !isLoading && (
        <div className="flex-shrink-0 border-t border-[#F0EDE8] px-4 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.lesson }}>
          <div className="mx-auto max-w-lg">
            <button
              onClick={() => startRetrieval()}
              className="w-full rounded-2xl bg-[#5A52E0] py-4 text-base font-semibold text-white transition-transform active:scale-[0.97]"
            >
              Ready to practise &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Sticky continue button (debrief)                                    */}
      {/* ================================================================== */}
      {currentPhase === "debrief" && debriefContent && !isLoading && (
        <div className="flex-shrink-0 border-t border-[#F0EDE8] px-4 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.debrief }}>
          <div className="mx-auto max-w-lg">
            <button
              onClick={enterDeploy}
              className="w-full rounded-2xl bg-[#5A52E0] py-4 text-base font-semibold text-white transition-transform active:scale-[0.97]"
            >
              Continue &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Fixed bottom bar (roleplay)                                         */}
      {/* ================================================================== */}
      {isRoleplay && !completedPhases.has("roleplay") && (
        <div className="flex-shrink-0 bottom-bar rounded-t-3xl bg-white px-3 pt-3 shadow-[var(--shadow-elevated)]">
          {/* Input + send */}
          <div className="flex items-end gap-2 mb-2">
            <textarea
              ref={inputRef}
              placeholder="Type your response..."
              rows={1}
              className="flex-1 rounded-2xl border-none px-4 py-3 text-base text-primary placeholder-tertiary outline-none resize-none focus:ring-2 focus:ring-[#5A52E0]/20"
              style={{ backgroundColor: PHASE_TINT.roleplay, maxHeight: "6rem" }}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                // Auto-grow
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
            <button
              onClick={() => { if (inputValue.trim() && !isStreaming) handleRoleplayInput(inputValue); }}
              disabled={isStreaming || isLoading || !inputValue.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#5A52E0] text-white transition-transform active:scale-[0.97] disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.637a.75.75 0 0 0 0-1.4L3.105 2.289Z" />
              </svg>
            </button>
          </div>

          {/* Command circles row */}
          <div className="flex items-center justify-center gap-4 pb-2">
            <button onClick={handleCoach} className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform active:scale-[0.93]" style={{ backgroundColor: "#FFF8E7" }} title="Coach">
              &#128161;
            </button>
            <button onClick={handleReset} className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform active:scale-[0.93]" style={{ backgroundColor: "#EFF6FA" }} title="Reset">
              &#128260;
            </button>
            <button onClick={handleSkip} className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform active:scale-[0.93]" style={{ backgroundColor: "#F0EDE8" }} title="Skip">
              &#9197;
            </button>
            <button onClick={handleDone} className="flex h-11 w-11 items-center justify-center rounded-full text-lg transition-transform active:scale-[0.93]" style={{ backgroundColor: "#F0FAF4" }} title="Done">
              &#10003;
            </button>
          </div>
        </div>
      )}

      {/* New message pill */}
      {showNewMessagePill && isRoleplay && (
        <button
          onClick={() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); setShowNewMessagePill(false); }}
          className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#5A52E0] px-3 py-1 text-xs font-medium text-white shadow-[var(--shadow-soft)] active:scale-[0.97]"
        >
          &darr; New
        </button>
      )}

      {/* ================================================================== */}
      {/* Exit confirmation modal                                             */}
      {/* ================================================================== */}
      {showExitModal && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/20" onClick={() => setShowExitModal(false)} />
          <div className="fixed inset-x-4 top-1/2 z-[70] mx-auto max-w-sm -translate-y-1/2 rounded-3xl bg-white p-6 shadow-[var(--shadow-elevated)]">
            <p className="mb-1 text-base font-semibold text-primary">Leave session?</p>
            <p className="mb-5 text-sm text-secondary">Your progress will be saved. You can resume within 30 minutes.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  saveSession();
                  router.push("/");
                }}
                className="flex-1 rounded-2xl bg-[#E88B8B] py-3.5 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
              >
                Leave
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="flex-1 rounded-2xl border border-[#F0EDE8] bg-white py-3.5 text-sm font-semibold text-primary transition-transform active:scale-[0.97]"
              >
                Stay
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* Coach panel — warm cream bottom sheet                               */}
      {/* ================================================================== */}
      {(coachAdvice || coachLoading) && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/10 sm:hidden"
            onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
          />
          <div
            className="fixed inset-x-0 bottom-0 top-1/2 z-50 overflow-y-auto rounded-t-3xl p-5 shadow-[var(--shadow-elevated)] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:top-0 sm:w-80 sm:max-w-[90vw] sm:rounded-none sm:border-l sm:border-[#F0EDE8]"
            style={{ backgroundColor: "#FFF8E7" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#E0DED8] sm:hidden" />
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: "#C4A24E" }}>Mentor</span>
              <button
                onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-lg text-secondary hover:text-primary active:scale-[0.97]"
              >
                &times;
              </button>
            </div>
            {coachLoading ? <LoadingDots /> : (
              <div className="text-base leading-relaxed text-primary">{renderMarkdown(coachAdvice!)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

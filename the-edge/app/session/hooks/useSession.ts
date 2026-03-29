"use client";

/**
 * useSession — all session state, API calls, persistence, and phase transitions.
 * Extracted from page.tsx to keep rendering separate from logic.
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
import { useVoice } from "@/app/hooks/useVoice";
import { haptic, cleanForSpeech, splitLessonSections } from "../components/types";
import type { VoiceProps } from "../components/types";
import { fetchWithRequestId } from "@/lib/fetch-with-request-id";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "edge-session-state";
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
const MENTOR_VOICE_ID = "__mentor__";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ABBREV_MAP: Record<string, keyof SessionScores> = {
  TA: "technique_application", TW: "tactical_awareness",
  FC: "frame_control", ER: "emotional_regulation", SO: "strategic_outcome",
};

function normaliseScores(scores: Record<string, number> | null): SessionScores | null {
  if (!scores) return null;
  if ("technique_application" in scores) return scores as unknown as SessionScores;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(scores)) {
    out[ABBREV_MAP[k] ?? k] = v;
  }
  return out as unknown as SessionScores;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5,
  delay = 3000,
  onAttempt?: (attempt: number) => void
): Promise<Response> {
  const { fetchWithRequestId: fetchR } = await import("@/lib/fetch-with-request-id");
  // Extract signal to create a fresh timeout per attempt — reusing the same
  // AbortSignal.timeout across retries causes all retries after the first to
  // abort immediately because the original signal has already timed out.
  const { signal, ...restOptions } = options;
  const timeoutMs = (signal as ReturnType<typeof AbortSignal.timeout> | undefined) ? 30000 : 0;
  let lastError: Error | null = null;
  for (let i = 1; i <= maxRetries; i++) {
    try {
      onAttempt?.(i);
      const res = await fetchR(url, {
        ...restOptions,
        signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : signal,
      });
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
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    queueMicrotask(() => setOnline(navigator.onLine));
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSession() {
  const router = useRouter();
  const online = useOnlineStatus();

  // =========================================================================
  // State
  // =========================================================================

  // Cross-tab session lock
  const tabId = useRef(crypto.randomUUID());
  const [sessionLocked, setSessionLocked] = useState(false);

  useEffect(() => {
    try {
      const channel = new BroadcastChannel('edge-session-lock');
      channel.onmessage = (event) => {
        if (event.data?.type === 'session-claimed' && event.data.tabId !== tabId.current) {
          setSessionLocked(true);
          // Cancel any in-flight requests from this tab
          abortRef.current?.abort();
          abortRef.current = new AbortController();
        }
      };
      return () => { channel.close(); };
    } catch {
      // BroadcastChannel not available (e.g. some WebView contexts) — cross-tab locking disabled
    }
  }, []);

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
  const [checkinUserText, setCheckinUserText] = useState<string | null>(null);
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
  const [isReviewSession, setIsReviewSession] = useState(false);
  const [previousScores, setPreviousScores] = useState<SessionScores | null>(null);

  // Check-in state
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

  // Lesson streaming
  const [lessonStreaming, setLessonStreaming] = useState(false);

  // Completion
  const [showConfetti, setShowConfetti] = useState(false);

  // Onboarding
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<"bio" | "style" | "saving">("bio");
  const [onboardingBio, setOnboardingBio] = useState("");
  const [onboardingDisplayName, setOnboardingDisplayName] = useState("");

  // Abort in-flight requests on unmount
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // UI refs & state
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [resetNotice, setResetNotice] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // Lesson card position
  const [lessonCardPos, setLessonCardPos] = useState<{ current: number; total: number }>({ current: 0, total: 999 });
  const onLessonCardChange = useCallback((current: number, total: number) => {
    setLessonCardPos({ current, total });
  }, []);

  // Debrief retry — use refs to avoid stale closure issues on rapid retry
  const debriefRetryCountRef = useRef(0);
  const [debriefRetryCount, setDebriefRetryCount] = useState(0);
  const [canSkipDebrief, setCanSkipDebrief] = useState(false);

  // Mission retry
  const missionRetryCountRef = useRef(0);
  const [missionRetryCount, setMissionRetryCount] = useState(0);

  // =========================================================================
  // Voice (STT + TTS)
  // =========================================================================

  const voiceSpeakEndActionRef = useRef<(() => void) | null>(null);
  const handleSpeakEnd = useCallback(() => {
    if (voiceSpeakEndActionRef.current) {
      const action = voiceSpeakEndActionRef.current;
      voiceSpeakEndActionRef.current = null;
      setTimeout(action, 300);
    }
  }, []);

  const voiceAutoSubmitRef = useRef<string | null>(null);
  const voiceAutoSubmitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const voice = useVoice({
    onTranscript: useCallback((text: string) => {
      if (text.trim()) {
        setInputValue(text);
        voiceAutoSubmitRef.current = text.trim();
        // Clear stale auto-submit after 10s to prevent ghost submissions
        if (voiceAutoSubmitTimeout.current) clearTimeout(voiceAutoSubmitTimeout.current);
        voiceAutoSubmitTimeout.current = setTimeout(() => {
          voiceAutoSubmitRef.current = null;
        }, 10000);
      }
    }, []),
    onSpeakEnd: handleSpeakEnd,
    characterId: character?.id,
  });

  const voiceProps: VoiceProps = {
    state: voice.state,
    voiceEnabled: voice.voiceEnabled,
    sttSupported: voice.sttSupported,
    ttsSupported: voice.ttsSupported,
    toggleVoice: voice.toggleVoice,
    startListening: voice.startListening,
    stopListening: voice.stopListening,
    speak: voice.speak,
    speakDirect: voice.speakDirect,
    stopSpeaking: voice.stopSpeaking,
    interimTranscript: voice.interimTranscript,
    micError: voice.micError,
    clearMicError: voice.clearMicError,
  };

  // Stable refs for voice functions — avoids stale closures in useEffect deps
  const voiceSpeakRef = useRef(voice.speak);
  const voiceStartListeningRef = useRef(voice.startListening);
  voiceSpeakRef.current = voice.speak;
  voiceStartListeningRef.current = voice.startListening;

  // Lesson card advance ref (passed to LessonPhase component)
  const lessonCardAdvanceRef = useRef<((card: number) => void) | null>(null);

  // =========================================================================
  // Session persistence
  // =========================================================================

  function saveSession() {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        phase: currentPhase, concept, character, lessonContent,
        transcript: roleplayTranscript, turnCount,
        completedPhases: Array.from(completedPhases), commandsUsed,
        checkinOutcome, checkinNeeded, checkinDone, checkinUserText,
        dayNumber, scenarioContext, debriefContent, scores,
        behavioralWeaknessSummary, keyMoment, mission, rationale,
        lastMission, coachAdvice, isReviewSession, previousScores,
        retrievalQuestion, retrievalResponse, retrievalReady,
        timestamp: Date.now(),
      }));
    } catch {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch {}
  }

  // saveSession is a closure that reads all state at call time. Adding it as a dep would
  // cause infinite loops (it's redefined every render). Instead we list the specific state
  // values whose changes should trigger a save.
  useEffect(() => {
    if (!isLoading) saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhase, lessonContent, roleplayTranscript.length, turnCount, debriefContent, scores, mission, checkinDone, coachAdvice, behavioralWeaknessSummary, keyMoment, rationale, isLoading]);

  // =========================================================================
  // Phase transition
  // =========================================================================

  const VALID_TRANSITIONS: Record<string, string[]> = {
    lesson: ["retrieval"],
    retrieval: ["roleplay"],
    roleplay: ["debrief"],
    debrief: ["mission"],
    mission: [],
  };

  function advancePhase(from: SessionPhase, to: SessionPhase) {
    const allowed = VALID_TRANSITIONS[from];
    if (allowed && !allowed.includes(to)) {
      console.warn(`[session] Invalid phase transition: ${from} → ${to}`);
      return; // Block invalid transition
    }
    voice.stopSpeaking();
    setPhaseAnimation("exit");
    setInputValue("");
    setTimeout(() => {
      setCompletedPhases((prev) => new Set([...prev, from]));
      setCurrentPhase(to);
      setError(null);
      setPhaseAnimation("enter");
      haptic();
      setTimeout(() => setPhaseAnimation("active"), 80);
    }, 280);
  }

  // =========================================================================
  // Phase 1: Lesson
  // =========================================================================

  async function fetchLesson() {
    if (sessionLocked) { setError("Session is active in another tab."); return; }
    setIsLoading(true);
    setError(null);

    // Claim session across tabs
    try {
      const channel = new BroadcastChannel('edge-session-lock');
      channel.postMessage({ type: 'session-claimed', tabId: tabId.current });
      channel.close();
    } catch {}


    try {
      const cached = localStorage.getItem("edge-pregenerated-lesson");
      if (cached) {
        const parsed = JSON.parse(cached);
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.date === today && parsed.concept && parsed.lessonContent) {
          setConcept(parsed.concept);
          setLessonContent(parsed.lessonContent);
          setIsReviewSession(parsed.isReview ?? false);
          setIsLoading(false);
          localStorage.removeItem("edge-pregenerated-lesson");
          return;
        }
        localStorage.removeItem("edge-pregenerated-lesson");
      }
    } catch {}

    try {
      const res = await fetchWithRequestId("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const conceptHeader = res.headers.get("X-Concept");
      if (conceptHeader) {
        try {
          setConcept(JSON.parse(decodeURIComponent(conceptHeader)));
        } catch {
          console.warn("[session] Failed to parse X-Concept header");
        }
      }

      const isReview = res.headers.get("X-Is-Review") === "true";
      setIsReviewSession(isReview);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream body");

      const decoder = new TextDecoder();
      let fullText = "";
      setLessonStreaming(true);
      setIsLoading(false);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          setLessonContent(fullText);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        throw e;
      }

      setLessonContent(fullText);
      setLessonStreaming(false);

      // Detect truncated or error responses
      if (fullText.length < 50 || fullText.includes("[System:")) {
        setError("Lesson may be incomplete. Tap to retry.");
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setLessonStreaming(false);
      setError("Couldn\u2019t load your session \u2014 your connection might be patchy. Tap to retry.");
      setIsLoading(false);
    }
  }

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
                isReview: data.isReview ?? false,
              })
            );
          }
        })
        .catch(() => {});
    } catch {}
  }

  // =========================================================================
  // Retrieval Bridge
  // =========================================================================

  async function startRetrieval() {
    if (!concept) return;
    advancePhase("lesson", "retrieval");
    setIsLoading(true);
    try {
      const res = await fetchWithRetry(
        "/api/retrieval-bridge",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept }),
          signal: AbortSignal.timeout(30000) },
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
      const res = await fetchWithRequestId("/api/retrieval-bridge", {
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

  // =========================================================================
  // Phase 2: Roleplay
  // =========================================================================

  async function startRoleplay() {
    if (!concept) return;
    const { selectCharacter } = await import("@/lib/characters");
    const char = selectCharacter(concept);
    setCharacter(char);
    advancePhase("retrieval", "roleplay");
    setIsLoading(true);
    try {
      const res = await fetchWithRequestId("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character: char, transcript: [], userMessage: null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) {
        try { setScenarioContext(decodeURIComponent(sc)); } catch { /* malformed header */ }
      }
      await streamRoleplayResponse(res, []);
    } catch {
      setError("Failed to start roleplay. Try again.");
      setIsLoading(false);
    }
  }

  async function sendRoleplayMessage(userMessage: string) {
    if (sessionLocked) { setError("Session is active in another tab."); return; }
    if (!concept || !character || isStreaming || submittingRef.current) return;
    submittingRef.current = true;
    setPendingRetry(null);
    const updated: Message[] = [...roleplayTranscript, { role: "user", content: userMessage }];
    setRoleplayTranscript(updated);
    setTurnCount((p) => p + 1);
    setInputValue("");
    haptic();
    try {
      const res = await fetchWithRequestId("/api/roleplay", {
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
    if (!reader) { setIsStreaming(false); submittingRef.current = false; return; }
    const decoder = new TextDecoder();
    let fullText = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setStreamingText(fullText);
      }
      setRoleplayTranscript([...currentTranscript, { role: "assistant", content: fullText }]);
      setTurnCount((p) => p + 1);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Partial text recovered — still add it to transcript if we got anything
      if (fullText.length > 0) {
        setRoleplayTranscript([...currentTranscript, { role: "assistant", content: fullText }]);
      }
      setError("Connection lost mid-response. Tap to retry.");
    } finally {
      setStreamingText(""); setIsStreaming(false);
      submittingRef.current = false;
    }
  }

  async function handleCoach() {
    if (sessionLocked) { setError("Session is active in another tab."); return; }
    if (!concept || roleplayTranscript.length === 0) return;
    const conceptSnapshot = concept.id;
    setCoachAdvice(null); setCoachLoading(true);
    setCommandsUsed((p) => p.includes("/coach") ? p : [...p, "/coach"]);
    haptic();
    try {
      const res = await fetchWithRequestId("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: roleplayTranscript, concept }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const data = await res.json();
      // Discard stale advice if concept changed during the request
      if (concept?.id !== conceptSnapshot) { setCoachLoading(false); return; }
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
      const res = await fetchWithRequestId("/api/roleplay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept, character, transcript: [], userMessage: null }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error("API failed");
      const sc = res.headers.get("X-Scenario-Context");
      if (sc) {
        try { setScenarioContext(decodeURIComponent(sc)); } catch { /* malformed header */ }
      }
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
    voiceAutoSubmitRef.current = null; // Cancel pending voice auto-submit on manual send
    const t = value.trim().toLowerCase();
    if (t === "/coach") { handleCoach(); setInputValue(""); }
    else if (t === "/reset") { handleReset(); setInputValue(""); }
    else if (t === "/skip") { handleSkip(); setInputValue(""); }
    else if (t === "/done") { handleDone(); setInputValue(""); }
    else { sendRoleplayMessage(value.trim()); }
  }

  // =========================================================================
  // Phase 3: Debrief
  // =========================================================================

  async function fetchDebrief() {
    if (sessionLocked) { setError("Session is active in another tab."); return; }
    if (!concept || !character) return;
    setIsLoading(true); setError(null);
    try {
      const res = await fetchWithRetry(
        "/api/debrief",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: roleplayTranscript,
            concept,
            character,
            commandsUsed,
            checkinContext: checkinUserText || undefined,
          }),
          signal: AbortSignal.timeout(65000) },
        3, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/3)`); }
      );
      const data = await res.json();
      let display = data.debriefContent || "";
      if (!display) throw new Error("Missing debrief content");
      const idx = display.indexOf("---SCORES---");
      if (idx !== -1) display = display.slice(0, idx).trim();
      setDebriefContent(display);
      setScores(normaliseScores(data.scores));
      setBehavioralWeaknessSummary(data.behavioralWeaknessSummary);
      setKeyMoment(data.keyMoment);
      setError(null); setIsLoading(false);
      debriefRetryCountRef.current = 0;
      setDebriefRetryCount(0);
    } catch {
      debriefRetryCountRef.current += 1;
      const newCount = debriefRetryCountRef.current;
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
    setScores({ technique_application: 3, tactical_awareness: 3, frame_control: 3, emotional_regulation: 3, strategic_outcome: 3 });
    setDebriefContent("Debrief unavailable due to connection issues. Default scores applied.");
    setBehavioralWeaknessSummary("Unable to generate analysis.");
    setKeyMoment("Unable to identify key moment.");
    setCanSkipDebrief(false);
    setError(null);
    // Advance to mission phase — without this, user gets stuck on debrief screen
    enterDeploy();
  }

  // =========================================================================
  // Phase 4: Deploy (check-in + mission)
  // =========================================================================

  function enterDeploy() {
    advancePhase("debrief", "mission");
    if (checkinNeeded && !checkinDone) {
      setIsLoading(false);
    } else {
      fetchMission();
    }
  }

  async function submitCheckin(outcomeType: "completed" | "tried" | "skipped", userOutcome?: string) {
    if (sessionLocked) { setError("Session is active in another tab."); return; }
    if (!lastMission || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    setInputValue("");
    if (userOutcome) setCheckinUserText(userOutcome);
    try {
      const res = await fetchWithRequestId("/api/checkin", {
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
      setTimeout(() => { setCheckinResponse(null); fetchMission(); }, 3500);
    } catch {
      setError("Failed to submit. Try again.");
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  async function fetchMission() {
    if (sessionLocked) { setError("Session is active in another tab."); return; }
    if (!concept || !character || !scores || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true); setError(null);
    try {
      const res = await fetchWithRetry(
        "/api/mission",
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, checkinOutcome }),
          signal: AbortSignal.timeout(30000) },
        3, 3000, (a) => { if (a > 1) setError(`Reconnecting... (attempt ${a}/3)`); }
      );
      const data = await res.json();
      setMission(data.mission); setRationale(data.rationale);
      setError(null); setIsLoading(false);
      submittingRef.current = false;
      missionRetryCountRef.current = 0;
      setMissionRetryCount(0);
    } catch {
      missionRetryCountRef.current += 1;
      const newCount = missionRetryCountRef.current;
      setMissionRetryCount(newCount);
      if (newCount >= 2) {
        const fallbacks: Record<string, { mission: string; rationale: string }[]> = {
          "Influence & Persuasion": [
            { mission: "In your next conversation, give something of value before making any request. Note how the dynamic shifts.", rationale: "Reciprocity primes compliance before you ask." },
            { mission: "Get one person to agree with a small, specific statement today. Watch how it shapes their subsequent behaviour.", rationale: "Micro-commitments cascade into larger concessions." },
          ],
          "Power Dynamics": [
            { mission: "In your next meeting, speak last. Observe how others position themselves when the floor is open.", rationale: "Silence is a power move that forces others to reveal their hand." },
            { mission: "Identify who holds the real decision-making power in your next group interaction. Note how authority flows.", rationale: "Reading power structures is the first step to navigating them." },
          ],
          "Negotiation": [
            { mission: "Name the other person\u2019s likely concern before they raise it. Watch how it changes the tone.", rationale: "Tactical empathy disarms resistance before it forms." },
            { mission: "In your next negotiation, anchor first with a specific number or position. Observe how it shapes the range.", rationale: "The first number spoken becomes the gravitational centre." },
          ],
          "Behavioural Psychology & Cognitive Bias": [
            { mission: "Notice one decision today where you or someone else chose the default option. Ask why.", rationale: "Awareness of status quo bias is the first step to overriding it." },
            { mission: "Frame one request today as an avoidance of loss rather than a pursuit of gain. Note the difference.", rationale: "Loss aversion drives decisions twice as powerfully as equivalent gains." },
          ],
          "Nonverbal Intelligence & Behavioural Profiling": [
            { mission: "In your next conversation, match the other person\u2019s speaking pace for two minutes. Notice the rapport shift.", rationale: "Pace-matching signals unconscious alignment." },
            { mission: "Observe one person\u2019s baseline behaviour today, then note when they deviate. What triggered the shift?", rationale: "Deviations from baseline reveal stress, deception, or genuine interest." },
          ],
          "Rapport & Relationship Engineering": [
            { mission: "Ask one person an open question about their work today and listen without interrupting for 60 seconds.", rationale: "Sustained attention is the rarest gift in a distracted world." },
            { mission: "Mirror back one person\u2019s exact words today instead of paraphrasing. Note their reaction.", rationale: "Exact mirroring creates a deeper sense of being understood." },
          ],
          "Dark Psychology & Coercive Technique Recognition": [
            { mission: "Identify one moment today where someone used urgency to pressure a decision. Pause before responding.", rationale: "Recognising manufactured urgency is the first line of defence." },
            { mission: "Notice one attempt to shift blame or responsibility in a conversation today. Name it internally.", rationale: "Pattern recognition neutralises manipulation before it takes hold." },
          ],
        };
        const domain = concept?.domain || "";
        const pool = fallbacks[domain] || [
          { mission: "Apply today\u2019s technique deliberately in your next conversation. Observe the other person\u2019s response.", rationale: "Deliberate practice with observation accelerates mastery." },
        ];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        setMission(pick.mission);
        setRationale(pick.rationale);
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

  // =========================================================================
  // Onboarding
  // =========================================================================

  async function completeOnboarding(feedbackStyle: "direct" | "balanced" | "supportive") {
    setOnboardingStep("saving");
    try {
      const res = await fetchWithRequestId("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileData: {
            bio: onboardingBio.trim(),
            feedbackStyle,
          },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setOnboardingNeeded(false);
      fetchLesson();
    } catch {
      setError("Couldn't save your profile. Tap retry.");
      setOnboardingStep("style");
    }
  }

  // =========================================================================
  // Voice effects
  // =========================================================================

  // Process auto-submit after voice transcript arrives
  // Note: handler functions (handleRoleplayInput, submitRetrievalResponse, submitCheckin) are
  // intentionally excluded from deps — they are called imperatively via ref guard, not reactively.
  useEffect(() => {
    if (voiceAutoSubmitRef.current && !isStreaming && !isLoading) {
      const text = voiceAutoSubmitRef.current;
      voiceAutoSubmitRef.current = null;
      if (onboardingNeeded && onboardingStep === "bio") {
        setOnboardingBio(text);
        setInputValue("");
      } else if (currentPhase === "roleplay") {
        handleRoleplayInput(text);
      } else if (currentPhase === "retrieval" && retrievalQuestion && !retrievalResponse) {
        submitRetrievalResponse(text);
        setInputValue("");
      } else if (currentPhase === "mission" && checkinPillSelected && !checkinDone) {
        submitCheckin(checkinPillSelected, text);
        setInputValue("");
      }
    }
    // Handler functions (handleRoleplayInput, submitRetrievalResponse, submitCheckin) are
    // intentionally excluded — they're called imperatively via the voiceAutoSubmitRef guard,
    // not reactively. Including them would trigger re-renders without purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, isStreaming, isLoading, currentPhase, onboardingNeeded, onboardingStep, retrievalQuestion, retrievalResponse, checkinPillSelected, checkinDone]);

  // Auto-speak AI roleplay responses when voice mode is on
  const lastSpokenIndex = useRef(-1);
  useEffect(() => {
    if (!voice.voiceEnabled || !voice.ttsSupported) return;
    if (currentPhase !== "roleplay") return;
    const lastMsg = roleplayTranscript[roleplayTranscript.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      roleplayTranscript.length - 1 > lastSpokenIndex.current
    ) {
      lastSpokenIndex.current = roleplayTranscript.length - 1;
      voiceSpeakRef.current(lastMsg.content);
    }
  }, [roleplayTranscript, currentPhase, voice.voiceEnabled, voice.ttsSupported]);

  // Auto-speak lesson content when voice mode is on
  const lessonSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "lesson") return;
    if (!lessonContent || isLoading || lessonStreaming) return;
    if (lessonSpokenRef.current === lessonContent) return;
    lessonSpokenRef.current = lessonContent;

    const sections = splitLessonSections(lessonContent);
    let currentIdx = 0;

    function speakNextCard() {
      if (currentIdx < sections.length) {
        const cardText = sections[currentIdx].title + ". " + sections[currentIdx].content;
        if (currentIdx < sections.length - 1) {
          const nextIdx = currentIdx + 1;
          voiceSpeakEndActionRef.current = () => {
            lessonCardAdvanceRef.current?.(nextIdx);
            currentIdx = nextIdx;
            speakNextCard();
          };
        } else {
          voiceSpeakEndActionRef.current = null;
        }
        voiceSpeakRef.current(cardText, MENTOR_VOICE_ID);
      }
    }

    speakNextCard();
  }, [lessonContent, currentPhase, voice.voiceEnabled, isLoading, lessonStreaming]);

  // Auto-speak retrieval question
  const retrievalSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "retrieval") return;
    if (!retrievalQuestion || retrievalSpokenRef.current === retrievalQuestion) return;
    retrievalSpokenRef.current = retrievalQuestion;
    voiceSpeakEndActionRef.current = () => voiceStartListeningRef.current();
    voiceSpeakRef.current(retrievalQuestion, MENTOR_VOICE_ID);
  }, [retrievalQuestion, currentPhase, voice.voiceEnabled]);

  // Auto-speak retrieval response (feedback)
  const retrievalFeedbackSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "retrieval") return;
    if (!retrievalResponse || retrievalFeedbackSpokenRef.current === retrievalResponse) return;
    retrievalFeedbackSpokenRef.current = retrievalResponse;
    voiceSpeakRef.current(retrievalResponse, MENTOR_VOICE_ID);
  }, [retrievalResponse, currentPhase, voice.voiceEnabled]);

  // Auto-speak debrief content
  const debriefSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "debrief") return;
    if (!debriefContent || isLoading || debriefSpokenRef.current === debriefContent) return;
    debriefSpokenRef.current = debriefContent;
    voiceSpeakRef.current(debriefContent, MENTOR_VOICE_ID);
  }, [debriefContent, currentPhase, voice.voiceEnabled, isLoading]);

  // Auto-speak mission content
  const missionSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "mission") return;
    if (!mission || isLoading || missionSpokenRef.current === mission) return;
    missionSpokenRef.current = mission;
    const fullText = mission + (rationale ? ". " + rationale : "");
    voiceSpeakRef.current(fullText, MENTOR_VOICE_ID);
  }, [mission, rationale, currentPhase, voice.voiceEnabled, isLoading]);

  // Auto-speak check-in response
  const checkinResponseSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "mission") return;
    if (!checkinResponse || checkinResponseSpokenRef.current === checkinResponse) return;
    checkinResponseSpokenRef.current = checkinResponse;
    voiceSpeakRef.current(checkinResponse, MENTOR_VOICE_ID);
  }, [checkinResponse, currentPhase, voice.voiceEnabled]);

  // Auto-start listening after TTS finishes (conversational phases)
  const prevVoiceState = useRef(voice.state);
  useEffect(() => {
    const isConversationalPhase = currentPhase === "roleplay" || currentPhase === "retrieval";
    if (
      prevVoiceState.current === "speaking" &&
      voice.state === "idle" &&
      voice.voiceEnabled &&
      isConversationalPhase &&
      !isStreaming &&
      !isLoading
    ) {
      const t = setTimeout(() => voiceStartListeningRef.current(), 400);
      prevVoiceState.current = voice.state;
      return () => clearTimeout(t);
    }
    prevVoiceState.current = voice.state;
  }, [voice.state, voice.voiceEnabled, currentPhase, isStreaming, isLoading]);

  // Auto-narrate scenario context when entering roleplay
  const scenarioSpokenRef = useRef(false);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "roleplay") return;
    if (!scenarioContext || scenarioSpokenRef.current) return;
    if (roleplayTranscript.length > 0) return;
    scenarioSpokenRef.current = true;
    const intro = character
      ? `You're about to speak with ${character.name}. ${cleanForSpeech(scenarioContext)}`
      : cleanForSpeech(scenarioContext);
    voiceSpeakRef.current(intro, MENTOR_VOICE_ID);
  }, [scenarioContext, currentPhase, voice.voiceEnabled, roleplayTranscript.length, character]);

  // =========================================================================
  // Auto-scroll
  // =========================================================================

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

  // =========================================================================
  // URL & focus management
  // =========================================================================

  useEffect(() => {
    window.history.replaceState(null, "", `/session?phase=${currentPhase}`);
  }, [currentPhase]);

  useEffect(() => {
    if (!isStreaming && currentPhase === "roleplay") inputRef.current?.focus();
  }, [isStreaming, currentPhase]);

  useEffect(() => {
    if (restored) { const t = setTimeout(() => setRestored(false), 3000); return () => clearTimeout(t); }
  }, [restored]);

  // =========================================================================
  // Init
  // =========================================================================

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
          setCheckinUserText(s.checkinUserText ?? null);
          setDayNumber(s.dayNumber || 1); setScenarioContext(s.scenarioContext || null);
          if (s.debriefContent) setDebriefContent(s.debriefContent);
          if (s.scores) setScores(normaliseScores(s.scores));
          if (s.behavioralWeaknessSummary) setBehavioralWeaknessSummary(s.behavioralWeaknessSummary);
          if (s.keyMoment) setKeyMoment(s.keyMoment);
          if (s.mission) setMission(s.mission);
          if (s.rationale) setRationale(s.rationale);
          if (s.lastMission) setLastMission(s.lastMission);
          if (s.coachAdvice) setCoachAdvice(s.coachAdvice);
          if (s.isReviewSession) setIsReviewSession(s.isReviewSession);
          if (s.previousScores) setPreviousScores(normaliseScores(s.previousScores));
          if (s.retrievalQuestion) setRetrievalQuestion(s.retrievalQuestion);
          if (s.retrievalResponse) setRetrievalResponse(s.retrievalResponse);
          if (s.retrievalReady) setRetrievalReady(s.retrievalReady);
          setIsLoading(false); setRestored(true);
          // If restored to retrieval phase without a question, re-fetch it
          if (s.phase === "retrieval" && !s.retrievalQuestion && s.concept) {
            setConcept(s.concept);
            setTimeout(() => {
              setIsLoading(true);
              fetchWithRequestId("/api/retrieval-bridge", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ concept: s.concept }),
                signal: AbortSignal.timeout(30000),
              }).then(r => r.json()).then(d => {
                setRetrievalQuestion(d.response);
                setIsLoading(false);
              }).catch(() => {
                setError("Couldn\u2019t reload retrieval question. Tap to retry.");
                setIsLoading(false);
              });
            }, 100);
          }
          return;
        } else { localStorage.removeItem(SESSION_STORAGE_KEY); }
      }
    } catch {}

    Promise.all([
      fetch("/api/status").then((r) => r.json()).catch(() => null),
      fetch("/api/profile").then((r) => r.json()).catch(() => null),
    ]).then(([statusData, profileData]) => {
        if (statusData) {
          setDayNumber(statusData.dayNumber);
          if (statusData.lastEntry) {
            setLastMission(statusData.lastEntry.mission);
            setCheckinNeeded(true);
            if (statusData.lastEntry.scores) {
              setPreviousScores(normaliseScores(statusData.lastEntry.scores));
            }
          }
        }

        if (profileData && !profileData.profileData) {
          setOnboardingNeeded(true);
          setOnboardingDisplayName(profileData.displayName || "");
          setIsLoading(false);
          return;
        }

        fetchLesson();
      })
      .catch(() => { fetchLesson(); });
     
  }, []);

  // =========================================================================
  // Return
  // =========================================================================

  return {
    // Navigation
    router,

    // Network
    online,

    // Cross-tab lock
    sessionLocked,

    // Session state
    currentPhase,
    completedPhases,
    isLoading,
    error,
    restored,
    phaseAnimation,

    // Data
    dayNumber,
    lastMission,
    checkinOutcome,
    concept,
    character,
    lessonContent,
    scenarioContext,
    roleplayTranscript,
    streamingText,
    isStreaming,
    coachAdvice,
    coachLoading,
    dismissCoach: () => { setCoachAdvice(null); setCoachLoading(false); },
    turnCount,
    debriefContent,
    scores,
    previousScores,
    behavioralWeaknessSummary,
    keyMoment,
    mission,
    rationale,
    isReviewSession,

    // Check-in
    checkinNeeded,
    checkinDone,
    checkinPillSelected,
    setCheckinPillSelected,
    checkinResponse,

    // Retrieval
    retrievalQuestion,
    retrievalResponse,
    retrievalReady,

    // Roleplay
    pendingRetry,
    showNewMessagePill,
    setShowNewMessagePill,
    resetNotice,

    // Lesson
    lessonStreaming,
    lessonCardPos,
    onLessonCardChange,
    lessonCardAdvanceRef,

    // Completion
    showConfetti,

    // Onboarding
    onboardingNeeded,
    onboardingStep,
    setOnboardingStep,
    onboardingBio,
    setOnboardingBio,
    onboardingDisplayName,

    // Debrief
    canSkipDebrief,

    // UI
    chatEndRef,
    chatContainerRef,
    inputRef,
    inputValue,
    setInputValue,
    showExitModal,
    setShowExitModal,

    // Voice
    voice,
    voiceProps,

    // Actions
    saveSession,
    startRetrieval,
    submitRetrievalResponse,
    startRoleplay,
    sendRoleplayMessage,
    handleRoleplayInput,
    handleCoach,
    handleReset,
    handleSkip,
    handleDone,
    fetchDebrief,
    skipDebriefToMission,
    enterDeploy,
    submitCheckin,
    fetchMission,
    completeSession,
    completeOnboarding,
    retry,
  };
}

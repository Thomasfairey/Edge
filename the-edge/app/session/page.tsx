"use client";

/**
 * Session page — manages the full daily loop.
 * Day 1:  Learn -> Retrieval -> Simulate -> Debrief -> Mission
 * Day 2+: Learn -> Retrieval -> Simulate -> Debrief -> Check-in -> Mission
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
import { useVoice } from "@/app/hooks/useVoice";

// Components
import PhaseIndicator from "./components/PhaseIndicator";
import LessonPhase from "./components/LessonPhase";
import RetrievalPhase from "./components/RetrievalPhase";
import RoleplayPhase from "./components/RoleplayPhase";
import DebriefPhase from "./components/DebriefPhase";
import MissionPhase from "./components/MissionPhase";
import CheckinPhase from "./components/CheckinPhase";
import SessionToolbar from "./components/SessionToolbar";

// Shared helpers & constants
import {
  PHASE_BG,
  haptic,
  cleanForSpeech,
  splitLessonSections,
  renderMarkdown,
  LoadingDots,
} from "./components/types";
import type { VoiceProps } from "./components/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "edge-session-state";
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours

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

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [resetNotice, setResetNotice] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // ---------------------------------------------------------------------------
  // Voice (STT + TTS)
  // ---------------------------------------------------------------------------

  const voiceSpeakEndActionRef = useRef<(() => void) | null>(null);
  const handleSpeakEnd = useCallback(() => {
    if (voiceSpeakEndActionRef.current) {
      const action = voiceSpeakEndActionRef.current;
      voiceSpeakEndActionRef.current = null;
      setTimeout(action, 300);
    }
  }, []);

  const voice = useVoice({
    onTranscript: useCallback((text: string) => {
      if (text.trim()) {
        setInputValue(text);
        voiceAutoSubmitRef.current = text.trim();
      }
    }, []),
    onSpeakEnd: handleSpeakEnd,
    characterId: character?.id,
  });

  const MENTOR_VOICE_ID = "__mentor__";
  const voiceAutoSubmitRef = useRef<string | null>(null);

  // Build voice props to pass to child components
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

  // Process auto-submit after voice transcript arrives
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, isStreaming, isLoading, currentPhase, retrievalQuestion, retrievalResponse, checkinPillSelected, checkinDone]);

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
      voice.speak(lastMsg.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleplayTranscript, currentPhase, voice.voiceEnabled]);

  // Auto-speak lesson content when voice mode is on
  const lessonSpokenRef = useRef<string | null>(null);
  const lessonCardAdvanceRef = useRef<((card: number) => void) | null>(null);
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
        voice.speak(cardText, MENTOR_VOICE_ID);
      }
    }

    speakNextCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonContent, currentPhase, voice.voiceEnabled, isLoading, lessonStreaming]);

  // Auto-speak retrieval question
  const retrievalSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "retrieval") return;
    if (!retrievalQuestion || retrievalSpokenRef.current === retrievalQuestion) return;
    retrievalSpokenRef.current = retrievalQuestion;
    voiceSpeakEndActionRef.current = () => voice.startListening();
    voice.speak(retrievalQuestion, MENTOR_VOICE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrievalQuestion, currentPhase, voice.voiceEnabled]);

  // Auto-speak retrieval response (feedback)
  const retrievalFeedbackSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "retrieval") return;
    if (!retrievalResponse || retrievalFeedbackSpokenRef.current === retrievalResponse) return;
    retrievalFeedbackSpokenRef.current = retrievalResponse;
    voice.speak(retrievalResponse, MENTOR_VOICE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retrievalResponse, currentPhase, voice.voiceEnabled]);

  // Auto-speak debrief content
  const debriefSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "debrief") return;
    if (!debriefContent || isLoading || debriefSpokenRef.current === debriefContent) return;
    debriefSpokenRef.current = debriefContent;
    voice.speak(debriefContent, MENTOR_VOICE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debriefContent, currentPhase, voice.voiceEnabled, isLoading]);

  // Auto-speak mission content
  const missionSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "mission") return;
    if (!mission || isLoading || missionSpokenRef.current === mission) return;
    missionSpokenRef.current = mission;
    const fullText = mission + (rationale ? ". " + rationale : "");
    voice.speak(fullText, MENTOR_VOICE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission, rationale, currentPhase, voice.voiceEnabled, isLoading]);

  // Auto-speak check-in response
  const checkinResponseSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voice.voiceEnabled || currentPhase !== "mission") return;
    if (!checkinResponse || checkinResponseSpokenRef.current === checkinResponse) return;
    checkinResponseSpokenRef.current = checkinResponse;
    voice.speak(checkinResponse, MENTOR_VOICE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const t = setTimeout(() => voice.startListening(), 400);
      prevVoiceState.current = voice.state;
      return () => clearTimeout(t);
    }
    prevVoiceState.current = voice.state;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    voice.speak(intro, MENTOR_VOICE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioContext, currentPhase, voice.voiceEnabled, roleplayTranscript.length, character]);

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
        checkinOutcome, checkinNeeded, checkinDone, checkinUserText,
        dayNumber, scenarioContext, debriefContent, scores,
        behavioralWeaknessSummary, keyMoment, mission, rationale,
        lastMission, coachAdvice, isReviewSession, previousScores,
        timestamp: Date.now(),
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
          setIsLoading(false); setRestored(true); return;
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

  // ---------------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------------

  async function completeOnboarding(feedbackStyle: "direct" | "balanced" | "supportive") {
    setOnboardingStep("saving");
    try {
      const res = await fetch("/api/profile", {
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

  // ---------------------------------------------------------------------------
  // Phase transition
  // ---------------------------------------------------------------------------

  function advancePhase(from: SessionPhase, to: SessionPhase) {
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

  // ---------------------------------------------------------------------------
  // Phase 1: Lesson
  // ---------------------------------------------------------------------------

  const [lessonCardPos, setLessonCardPos] = useState<{ current: number; total: number }>({ current: 0, total: 999 });
  const onLessonCardChange = useCallback((current: number, total: number) => {
    setLessonCardPos({ current, total });
  }, []);

  async function fetchLesson() {
    setIsLoading(true);
    setError(null);

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
      const res = await fetch("/api/lesson", {
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
      let display = data.debriefContent;
      const idx = display.indexOf("---SCORES---");
      if (idx !== -1) display = display.slice(0, idx).trim();
      setDebriefContent(display);
      setScores(normaliseScores(data.scores));
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
    setInputValue("");
    if (userOutcome) setCheckinUserText(userOutcome);
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
      setTimeout(() => { setCheckinResponse(null); fetchMission(); }, 3500);
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
          body: JSON.stringify({ concept, character, scores, behavioralWeaknessSummary, keyMoment, commandsUsed, checkinOutcome }),
          signal: AbortSignal.timeout(30000) },
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
          className="absolute left-1 top-1/2 -translate-y-1/2 z-50 touch-target rounded-full"
          style={{ color: "var(--text-secondary)" }}
          aria-label="Leave session"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        <PhaseIndicator current={currentPhase} completed={completedPhases} />

        {/* Global voice toggle */}
        <button
          onClick={voice.toggleVoice}
          className={`absolute right-2 top-1/2 -translate-y-1/2 z-50 flex h-10 w-10 items-center justify-center rounded-full transition-all ${
            voice.voiceEnabled
              ? "bg-[var(--accent)] text-white"
              : "bg-[#F0EDE8] text-secondary"
          }`}
          aria-label={voice.voiceEnabled ? "Mute audio" : "Enable audio"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
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
      </div>

      {/* Offline banner */}
      {!online && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--coach-bg)", color: "var(--coach-muted)" }}>
          Offline &mdash; reconnecting...
        </div>
      )}

      {restored && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          Session restored
        </div>
      )}

      {/* Review session badge */}
      {isReviewSession && currentPhase === "lesson" && (
        <div className="flex-shrink-0 flex h-8 items-center justify-center text-caption font-medium" style={{ backgroundColor: "var(--accent-soft)", color: "var(--accent)" }}>
          Review session
        </div>
      )}

      {/* Scrollable content */}
      <div ref={isRoleplay ? chatContainerRef : undefined} className="chat-container flex-1 overflow-y-auto px-4 sm:px-6">
        <div className={`mx-auto max-w-lg py-5 sm:py-8 ${phaseClass}`}>

          {error && (
            <div className="mb-5 card text-center">
              <p className="text-body" style={{ color: "var(--score-low)" }}>{error}</p>
              <div className="mt-4 flex items-center justify-center gap-5">
                <button onClick={retry} className="touch-target text-caption font-semibold underline" style={{ color: "var(--accent)" }}>
                  Retry
                </button>
                {canSkipDebrief && currentPhase === "debrief" && (
                  <button onClick={skipDebriefToMission} className="touch-target text-caption font-medium underline" style={{ color: "var(--text-secondary)" }}>
                    Skip to mission
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* ONBOARDING                                                      */}
          {/* ============================================================== */}
          {onboardingNeeded && (
            <div className="space-y-6 animate-fade-in-up">
              {onboardingStep === "bio" && (
                <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]">
                  <h2 className="text-xl font-semibold text-primary mb-2">
                    Welcome to The Edge{onboardingDisplayName ? `, ${onboardingDisplayName}` : ""}
                  </h2>
                  <p className="text-sm text-secondary mb-5">
                    Before we begin, tell me about yourself. Your role, your company,
                    what you&apos;re working on, and what you&apos;re trying to achieve.
                  </p>
                  <p className="text-xs text-tertiary mb-4">
                    This is used to personalise every scenario, lesson, and mission to your world.
                  </p>

                  <textarea
                    className="w-full rounded-2xl border border-[#E8E5E0] bg-[#FAF9F6] px-4 py-3 text-sm text-primary placeholder-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                    rows={5}
                    placeholder="e.g. I'm the CEO of a fintech startup. We're raising our seed round and trying to sign our first enterprise clients in banking. I need to get better at high-stakes negotiations and investor pitches..."
                    value={onboardingBio}
                    onChange={(e) => setOnboardingBio(e.target.value)}
                    maxLength={2000}
                  />

                  <div className="flex items-center justify-between mt-3">
                    {voice.sttSupported && voice.voiceEnabled && (
                      <button
                        onClick={() => {
                          if (voice.state === "listening") {
                            voice.stopListening();
                          } else {
                            voice.startListening();
                          }
                        }}
                        className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition-all ${
                          voice.state === "listening"
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[#EEEDFF] text-[var(--accent)]"
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                          <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                        </svg>
                        {voice.state === "listening" ? "Listening..." : "Speak"}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (onboardingBio.trim().length >= 20) {
                          setOnboardingStep("style");
                          haptic();
                        }
                      }}
                      disabled={onboardingBio.trim().length < 20}
                      className="rounded-2xl bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>

                  {voice.state === "listening" && voice.interimTranscript && (
                    <p className="mt-2 text-xs text-secondary italic">{voice.interimTranscript}</p>
                  )}
                </div>
              )}

              {onboardingStep === "style" && (
                <div className="rounded-3xl bg-white p-6 shadow-[var(--shadow-soft)]">
                  <h2 className="text-lg font-semibold text-primary mb-2">
                    How do you prefer feedback?
                  </h2>
                  <p className="text-sm text-secondary mb-5">
                    This shapes how The Edge speaks to you — in debriefs, coaching, and missions.
                  </p>

                  <div className="space-y-3">
                    {([
                      { value: "direct" as const, label: "Direct & blunt", desc: "No softening. Tell me exactly what I did wrong.", color: "#E88B8B" },
                      { value: "balanced" as const, label: "Balanced", desc: "Clear and honest, but measured. Direct without being harsh.", color: "#F5C563" },
                      { value: "supportive" as const, label: "Supportive", desc: "Encouraging with constructive framing. Still honest, but warm.", color: "#6BC9A0" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          haptic();
                          completeOnboarding(opt.value);
                        }}
                        className="w-full rounded-2xl border-2 border-[#E8E5E0] bg-[#FAF9F6] p-4 text-left transition-all hover:border-[var(--accent)]/30 active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                          <div>
                            <p className="text-sm font-semibold text-primary">{opt.label}</p>
                            <p className="text-xs text-secondary mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setOnboardingStep("bio")}
                    className="mt-4 text-xs text-secondary underline"
                  >
                    Back
                  </button>
                </div>
              )}

              {onboardingStep === "saving" && (
                <div className="text-center py-8">
                  <p className="mb-2 text-sm text-secondary">Setting up your profile...</p>
                  <LoadingDots />
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* LEARN                                                           */}
          {/* ============================================================== */}
          {currentPhase === "lesson" && !onboardingNeeded && (
            <LessonPhase
              isLoading={isLoading}
              lessonContent={lessonContent}
              lessonStreaming={lessonStreaming}
              concept={concept}
              isReviewSession={isReviewSession}
              onboardingNeeded={onboardingNeeded}
              onLessonCardChange={onLessonCardChange}
              lessonCardAdvanceRef={lessonCardAdvanceRef}
              voice={voiceProps}
            />
          )}

          {/* ============================================================== */}
          {/* RETRIEVAL                                                       */}
          {/* ============================================================== */}
          {currentPhase === "retrieval" && (
            <RetrievalPhase
              isLoading={isLoading}
              retrievalQuestion={retrievalQuestion}
              retrievalResponse={retrievalResponse}
              retrievalReady={retrievalReady}
              inputValue={inputValue}
              setInputValue={setInputValue}
              submitRetrievalResponse={submitRetrievalResponse}
              startRoleplay={startRoleplay}
              voice={voiceProps}
            />
          )}

          {/* ============================================================== */}
          {/* SIMULATE                                                        */}
          {/* ============================================================== */}
          {currentPhase === "roleplay" && (
            <RoleplayPhase
              character={character}
              roleplayTranscript={roleplayTranscript}
              scenarioContext={scenarioContext}
              turnCount={turnCount}
              isLoading={isLoading}
              isStreaming={isStreaming}
              streamingText={streamingText}
              resetNotice={resetNotice}
              pendingRetry={pendingRetry}
              sendRoleplayMessage={sendRoleplayMessage}
              chatEndRef={chatEndRef}
            />
          )}

          {/* ============================================================== */}
          {/* DEBRIEF                                                         */}
          {/* ============================================================== */}
          {currentPhase === "debrief" && (
            <DebriefPhase
              isLoading={isLoading}
              debriefContent={debriefContent}
              scores={scores}
              previousScores={previousScores}
            />
          )}

          {/* ============================================================== */}
          {/* DEPLOY (check-in + mission)                                    */}
          {/* ============================================================== */}
          {currentPhase === "mission" && (
            <>
              <CheckinPhase
                checkinNeeded={checkinNeeded}
                checkinDone={checkinDone}
                checkinPillSelected={checkinPillSelected}
                setCheckinPillSelected={setCheckinPillSelected}
                checkinResponse={checkinResponse}
                lastMission={lastMission}
                isLoading={isLoading}
                mission={mission}
                inputValue={inputValue}
                setInputValue={setInputValue}
                submitCheckin={submitCheckin}
                voice={voiceProps}
              />

              {mission && !isLoading && !checkinResponse && (
                <MissionPhase
                  isLoading={isLoading}
                  mission={mission}
                  rationale={rationale}
                  scores={scores}
                  previousScores={previousScores}
                  concept={concept}
                  dayNumber={dayNumber}
                  keyMoment={keyMoment}
                  showConfetti={showConfetti}
                  completeSession={completeSession}
                  onDone={() => router.push("/")}
                />
              )}
            </>
          )}

        </div>
      </div>

      {/* ================================================================== */}
      {/* Sticky CTA (learn phase)                                            */}
      {/* ================================================================== */}
      {currentPhase === "lesson" && lessonContent && !isLoading && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.lesson, borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-lg">
            {lessonCardPos.current < lessonCardPos.total - 1 ? (
              <p className="py-3 text-center text-body" style={{ color: "var(--text-secondary)" }}>
                {lessonCardPos.current + 1} of {lessonCardPos.total} &mdash; swipe to continue
              </p>
            ) : (
              <button onClick={() => startRetrieval()} className="btn-primary animate-fade-in-up">
                Ready to practise &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Sticky continue button (debrief)                                    */}
      {/* ================================================================== */}
      {currentPhase === "debrief" && debriefContent && !isLoading && (
        <div className="flex-shrink-0 px-5 pt-3 pb-3 pb-safe" style={{ backgroundColor: PHASE_BG.debrief, borderTop: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-lg">
            <button onClick={enterDeploy} className="btn-primary" style={{ backgroundColor: "var(--phase-debrief-muted)" }}>
              Your mission &rarr;
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Fixed bottom bar (roleplay)                                         */}
      {/* ================================================================== */}
      <SessionToolbar
        isRoleplay={isRoleplay}
        completedRoleplay={completedPhases.has("roleplay")}
        inputValue={inputValue}
        setInputValue={setInputValue}
        inputRef={inputRef}
        isStreaming={isStreaming}
        isLoading={isLoading}
        voice={voiceProps}
        character={character}
        handleRoleplayInput={handleRoleplayInput}
        handleCoach={handleCoach}
        handleReset={handleReset}
        handleSkip={handleSkip}
        handleDone={handleDone}
      />

      {/* New message pill */}
      {showNewMessagePill && isRoleplay && (
        <button
          onClick={() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); setShowNewMessagePill(false); }}
          className="fixed bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-caption font-semibold"
          style={{ backgroundColor: "var(--accent)", color: "white", boxShadow: "var(--shadow-accent)" }}
        >
          &darr; New message
        </button>
      )}

      {/* ================================================================== */}
      {/* Floating voice indicator (non-roleplay phases)                      */}
      {/* ================================================================== */}
      {voice.voiceEnabled && !isRoleplay && voice.state === "speaking" && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full bg-white px-5 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
          <div className="flex items-center gap-1.5 h-5 text-[var(--accent)]">
            <span className="voice-bar" />
            <span className="voice-bar" />
            <span className="voice-bar" />
          </div>
          <span className="text-sm font-medium text-secondary">Speaking...</span>
          <button
            onClick={voice.stopSpeaking}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0EDE8] text-secondary transition-transform active:scale-[0.93]"
            title="Stop"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* Exit confirmation modal                                             */}
      {/* ================================================================== */}
      {showExitModal && (
        <>
          <div className="fixed inset-0 z-[60] backdrop-blur-overlay" style={{ backgroundColor: "rgba(0,0,0,0.2)" }} onClick={() => setShowExitModal(false)} />
          <div className="fixed inset-x-5 top-1/2 z-[70] mx-auto max-w-sm -translate-y-1/2 card" style={{ padding: "28px 24px", boxShadow: "var(--shadow-elevated)" }}>
            <p className="text-lead font-semibold" style={{ color: "var(--text-primary)" }}>Leave session?</p>
            <p className="mt-2 mb-6 text-body" style={{ color: "var(--text-secondary)" }}>Your progress will be saved. You can resume within 30 minutes.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  saveSession();
                  router.push("/");
                }}
                className="btn-primary flex-1"
                style={{ backgroundColor: "var(--score-low)", color: "var(--score-low-text)", boxShadow: "none" }}
              >
                Leave
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="btn-secondary flex-1"
              >
                Stay
              </button>
            </div>
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* Coach panel                                                         */}
      {/* ================================================================== */}
      {(coachAdvice || coachLoading) && (
        <>
          <div
            className="fixed inset-0 z-40 backdrop-blur-overlay sm:hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.1)" }}
            onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
          />
          <div
            className="fixed inset-x-0 bottom-0 top-[40%] z-50 overflow-y-auto p-6 sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:top-0 sm:w-80 sm:max-w-[90vw] sm:rounded-none"
            style={{
              backgroundColor: "var(--coach-bg)",
              borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
              boxShadow: "var(--shadow-elevated)",
            }}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full sm:hidden" style={{ backgroundColor: "var(--border)" }} />
            <div className="mb-5 flex items-center justify-between">
              <span className="text-body font-semibold" style={{ color: "var(--coach-muted)" }}>Mentor</span>
              <button
                onClick={() => { setCoachAdvice(null); setCoachLoading(false); }}
                className="touch-target text-lead"
                style={{ color: "var(--text-secondary)" }}
              >
                &times;
              </button>
            </div>
            {coachLoading ? <LoadingDots /> : (
              <div className="text-body leading-relaxed" style={{ color: "var(--text-primary)" }}>{renderMarkdown(coachAdvice!)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

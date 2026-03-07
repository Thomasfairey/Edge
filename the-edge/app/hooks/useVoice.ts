"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Web Speech API type shims (not all TS libs include these)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionShim extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface UseVoiceOptions {
  /** Called when speech recognition produces a final transcript */
  onTranscript?: (text: string) => void;
  /** Language for recognition (default: "en-GB") */
  lang?: string;
  /** Whether TTS is enabled (default: true) */
  ttsEnabled?: boolean;
  /** Character archetype ID — determines which ElevenLabs voice is used */
  characterId?: string;
}

interface UseVoiceReturn {
  /** Current voice state */
  state: VoiceState;
  /** Whether the browser supports speech recognition */
  sttSupported: boolean;
  /** TTS is always supported via ElevenLabs API */
  ttsSupported: boolean;
  /** Whether voice mode is active (persisted toggle) */
  voiceEnabled: boolean;
  /** Toggle voice mode on/off */
  toggleVoice: () => void;
  /** Start listening for speech */
  startListening: () => void;
  /** Stop listening */
  stopListening: () => void;
  /** Speak text aloud via ElevenLabs TTS */
  speak: (text: string) => void;
  /** Stop any current speech */
  stopSpeaking: () => void;
  /** Interim (partial) transcript while listening */
  interimTranscript: string;
  /** User-facing error message (auto-clears after a few seconds) */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const VOICE_PREF_KEY = "edge-voice-enabled";
const AUDIO_UNLOCKED_KEY = "edge-audio-unlocked";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { onTranscript, lang = "en-GB", ttsEnabled = true, characterId } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionShim | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const characterIdRef = useRef(characterId);
  const audioUnlockedRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  onTranscriptRef.current = onTranscript;
  characterIdRef.current = characterId;

  // Feature detection
  const sttSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  // TTS is always supported since we use server-side ElevenLabs
  const ttsSupported = true;

  // Show error to user and auto-clear after 4 seconds
  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 4000);
  }, []);

  // Unlock audio playback on first user interaction (mobile browsers require this)
  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    silent.play().then(() => {
      silent.pause();
      audioUnlockedRef.current = true;
      try { sessionStorage.setItem(AUDIO_UNLOCKED_KEY, "true"); } catch {}
    }).catch(() => {
      // Still locked — will retry on next interaction
    });
  }, []);

  // Restore preference from localStorage; default to ON for new users
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved === null) {
        // First visit — enable voice by default
        setVoiceEnabled(true);
        localStorage.setItem(VOICE_PREF_KEY, "true");
      } else {
        setVoiceEnabled(saved === "true");
      }
    } catch {
      setVoiceEnabled(true);
    }
  }, []);

  // Unlock audio on any user interaction (needed for mobile autoplay policy)
  useEffect(() => {
    const handler = () => unlockAudio();
    document.addEventListener("touchstart", handler, { once: true });
    document.addEventListener("click", handler, { once: true });
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("click", handler);
    };
  }, [unlockAudio]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_PREF_KEY, String(next));
      } catch {}
      // If disabling, stop everything
      if (!next) {
        recognitionRef.current?.stop();
        abortRef.current?.abort();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current = null;
        }
        setState("idle");
        setInterimTranscript("");
      }
      return next;
    });
    // Any toggle is a user gesture — unlock audio
    unlockAudio();
  }, [unlockAudio]);

  // -------------------------------------------------------------------------
  // Speech Recognition (STT) — browser Web Speech API
  // -------------------------------------------------------------------------

  const startListening = useCallback(() => {
    if (!sttSupported) {
      showError("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    // Stop any previous recognition instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }

    // Stop any current audio playback
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showError("Speech recognition is not available.");
      return;
    }

    const recognition: SpeechRecognitionShim = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState("listening");
      setInterimTranscript("");
      setError(null);
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (finalText) {
        setInterimTranscript("");
        setState("processing");
        onTranscriptRef.current?.(finalText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      const err = event.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        showError("Microphone access denied. Please allow microphone permission in your browser settings.");
      } else if (err === "network") {
        showError("Speech recognition requires an internet connection.");
      } else if (err !== "no-speech" && err !== "aborted") {
        console.warn("[useVoice] recognition error:", err);
        showError("Speech recognition error. Please try again.");
      }
      setState("idle");
      setInterimTranscript("");
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    recognition.onend = () => {
      setState((prev) => (prev === "listening" ? "idle" : prev));
      setInterimTranscript("");
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.warn("[useVoice] Failed to start recognition:", err);
      showError("Could not start microphone. Please check permissions and try again.");
      setState("idle");
      recognitionRef.current = null;
    }

    // User tapped mic — unlock audio for future TTS
    unlockAudio();
  }, [sttSupported, lang, showError, unlockAudio]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
    setInterimTranscript("");
  }, []);

  // -------------------------------------------------------------------------
  // Speech Synthesis (TTS) — ElevenLabs via /api/tts
  // -------------------------------------------------------------------------

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !voiceEnabled) return;
      if (!text || text.trim().length === 0) return;

      // Abort any in-flight TTS request
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setState("speaking");

      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          characterId: characterIdRef.current,
        }),
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`TTS API error: ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (controller.signal.aborted) return;

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          audio.onended = () => {
            setState("idle");
            URL.revokeObjectURL(url);
            audioRef.current = null;
          };

          audio.onerror = () => {
            console.warn("[useVoice] audio playback error");
            showError("Audio playback failed. Try tapping the screen first.");
            setState("idle");
            URL.revokeObjectURL(url);
            audioRef.current = null;
          };

          audio.play().catch((err) => {
            console.warn("[useVoice] audio play blocked:", err.message);
            showError("Tap anywhere on the screen to enable audio, then try again.");
            setState("idle");
            URL.revokeObjectURL(url);
            audioRef.current = null;
          });
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          console.warn("[useVoice] TTS fetch error:", err.message);
          showError("Voice synthesis failed. Check your connection.");
          setState("idle");
        });
    },
    [ttsEnabled, voiceEnabled, showError]
  );

  const stopSpeaking = useCallback(() => {
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setState((prev) => (prev === "speaking" ? "idle" : prev));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  return {
    state,
    sttSupported,
    ttsSupported,
    voiceEnabled,
    toggleVoice,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    interimTranscript,
    error,
  };
}

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
  /** Whether any form of speech recognition is supported (native or MediaRecorder fallback) */
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
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const VOICE_PREF_KEY = "edge-voice-enabled";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasNativeSpeechRecognition(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

function hasMediaRecorder(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window;
}

/** Detect iOS Safari for audio workarounds */
function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

/** Pick a supported MIME type for MediaRecorder */
function getRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  // Safari supports mp4/aac, Chrome/Firefox support webm/opus
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "audio/webm";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { onTranscript, lang = "en-GB", ttsEnabled = true, characterId } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionShim | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const characterIdRef = useRef(characterId);
  onTranscriptRef.current = onTranscript;
  characterIdRef.current = characterId;

  // MediaRecorder refs for fallback STT
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Pre-warmed Audio element ref for Safari autoplay compliance
  const warmAudioRef = useRef<HTMLAudioElement | null>(null);

  // Feature detection
  const nativeSTT = hasNativeSpeechRecognition();
  const fallbackSTT = hasMediaRecorder();
  const sttSupported = nativeSTT || fallbackSTT;
  const ttsSupported = true;

  // Restore preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved === "true") setVoiceEnabled(true);
    } catch {}
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_PREF_KEY, String(next));
      } catch {}
      // If enabling on iOS Safari, warm up the audio element during this user gesture
      if (next && isIOSSafari()) {
        try {
          const audio = new Audio();
          audio.muted = true;
          audio.play().then(() => { audio.pause(); }).catch(() => {});
          warmAudioRef.current = audio;
        } catch {}
      }
      // If disabling, stop everything
      if (!next) {
        recognitionRef.current?.stop();
        mediaRecorderRef.current?.stop();
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
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
  }, []);

  // -------------------------------------------------------------------------
  // Speech Recognition (STT) — native Web Speech API
  // -------------------------------------------------------------------------

  const startNativeListening = useCallback(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition: SpeechRecognitionShim = new SR();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setState("listening");
      setInterimTranscript("");
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
      if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[useVoice] recognition error:", event.error);
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
    recognition.start();
  }, [lang]);

  // -------------------------------------------------------------------------
  // Speech Recognition (STT) — MediaRecorder fallback (iOS Safari etc.)
  // -------------------------------------------------------------------------

  const startFallbackListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = getRecorderMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop mic access
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 1000) {
          // Too short / empty recording
          setState("idle");
          setInterimTranscript("");
          return;
        }

        setState("processing");
        setInterimTranscript("Transcribing...");

        try {
          const formData = new FormData();
          formData.append("audio", blob, `recording.${mimeType.includes("mp4") ? "mp4" : "webm"}`);

          const res = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error(`STT API error: ${res.status}`);

          const data = await res.json();
          const text = (data.text ?? "").trim();

          setInterimTranscript("");

          if (text) {
            onTranscriptRef.current?.(text);
          } else {
            setState("idle");
          }
        } catch (err) {
          console.warn("[useVoice] fallback STT error:", err);
          setState("idle");
          setInterimTranscript("");
        }
      };

      recorder.onerror = () => {
        console.warn("[useVoice] MediaRecorder error");
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        setState("idle");
        setInterimTranscript("");
      };

      recorder.start();
      setState("listening");
      setInterimTranscript("");
    } catch (err) {
      console.warn("[useVoice] mic access error:", err);
      setState("idle");
      setInterimTranscript("");
    }
  }, []);

  // -------------------------------------------------------------------------
  // Unified start/stop listening
  // -------------------------------------------------------------------------

  const startListening = useCallback(() => {
    if (!sttSupported) return;

    // Stop any current audio playback
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (nativeSTT) {
      startNativeListening();
    } else {
      startFallbackListening();
    }
  }, [sttSupported, nativeSTT, startNativeListening, startFallbackListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    // Don't set idle here for MediaRecorder — onstop handler will transition through "processing"
    if (nativeSTT) {
      setState("idle");
      setInterimTranscript("");
    }
  }, [nativeSTT]);

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

          // On iOS Safari, reuse the pre-warmed audio element to satisfy autoplay
          let audio: HTMLAudioElement;
          if (isIOSSafari() && warmAudioRef.current) {
            audio = warmAudioRef.current;
            audio.muted = false;
            audio.src = url;
          } else {
            audio = new Audio(url);
          }

          audioRef.current = audio;

          audio.onended = () => {
            setState("idle");
            URL.revokeObjectURL(url);
            audioRef.current = null;
          };

          audio.onerror = () => {
            console.warn("[useVoice] audio playback error");
            setState("idle");
            URL.revokeObjectURL(url);
            audioRef.current = null;
          };

          // For Safari: use load() + play() pattern
          audio.load();
          audio.play().catch((err) => {
            console.warn("[useVoice] audio play blocked:", err.message);
            setState("idle");
            URL.revokeObjectURL(url);
            audioRef.current = null;
          });
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          console.warn("[useVoice] TTS fetch error:", err.message);
          setState("idle");
        });
    },
    [ttsEnabled, voiceEnabled]
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
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
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
  };
}

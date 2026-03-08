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
  /** Whether any form of speech recognition is supported */
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
  /** User-facing error message when mic fails (null = no error) */
  micError: string | null;
  /** Clear the mic error */
  clearMicError: () => void;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const VOICE_PREF_KEY = "edge-voice-enabled";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectNativeSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

function detectMicAccess(): boolean {
  if (typeof navigator === "undefined") return false;
  return !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
}

/** Encode Float32Array PCM samples to a WAV Blob at 16-bit 16kHz mono */
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const targetRate = 16000;
  const ratio = sampleRate / targetRate;
  const newLength = Math.floor(samples.length / ratio);
  const downsampled = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    downsampled[i] = samples[Math.floor(i * ratio)];
  }

  const buffer = new ArrayBuffer(44 + downsampled.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + downsampled.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, downsampled.length * 2, true);

  let offset = 44;
  for (let i = 0; i < downsampled.length; i++) {
    const s = Math.max(-1, Math.min(1, downsampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { onTranscript, lang = "en-GB", ttsEnabled = true, characterId } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Use state for feature detection so it's correct after hydration
  const [sttSupported, setSttSupported] = useState(false);
  const [nativeSTT, setNativeSTT] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionShim | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const characterIdRef = useRef(characterId);
  onTranscriptRef.current = onTranscript;
  characterIdRef.current = characterId;

  // Web Audio API refs for mic recording fallback
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingChunksRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);

  const ttsSupported = true;

  // Run feature detection on client only (after hydration)
  useEffect(() => {
    const native = detectNativeSpeechRecognition();
    const mic = detectMicAccess();
    setNativeSTT(native);
    setSttSupported(native || mic);
  }, []);

  // Restore voice preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved === "true") setVoiceEnabled(true);
    } catch {}
  }, []);

  const clearMicError = useCallback(() => setMicError(null), []);

  // Auto-clear mic errors after 5 seconds
  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(null), 5000);
    return () => clearTimeout(t);
  }, [micError]);

  // Cleanup helper for mic recording
  const cleanupRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_PREF_KEY, String(next));
      } catch {}
      if (!next) {
        recognitionRef.current?.stop();
        cleanupRecording();
        abortRef.current?.abort();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current = null;
        }
        setState("idle");
        setInterimTranscript("");
        setMicError(null);
      }
      return next;
    });
  }, [cleanupRecording]);

  // -------------------------------------------------------------------------
  // Speech Recognition (STT) — native Web Speech API
  // -------------------------------------------------------------------------

  const startNativeListening = useCallback(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMicError("Speech recognition not supported on this browser.");
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
      setMicError(null);
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
      if (event.error === "not-allowed") {
        setMicError("Microphone access denied. Check your browser settings.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[useVoice] recognition error:", event.error);
        setMicError(`Speech recognition error: ${event.error}`);
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
      console.warn("[useVoice] recognition.start() failed:", err);
      setMicError("Could not start speech recognition. Try again.");
      setState("idle");
    }
  }, [lang]);

  // -------------------------------------------------------------------------
  // Speech Recognition (STT) — getUserMedia + Web Audio API fallback
  // Records raw PCM via ScriptProcessorNode, encodes to WAV, sends to /api/stt
  // Works on iOS Safari 11+ (no MediaRecorder dependency)
  // -------------------------------------------------------------------------

  const startFallbackListening = useCallback(async () => {
    // Check if getUserMedia is actually available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError("Microphone not available on this browser. Try opening in Safari.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      /* eslint-enable @typescript-eslint/no-explicit-any */

      if (!AC) {
        setMicError("Audio not supported on this browser.");
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioContext = new AC();
      audioContextRef.current = audioContext;

      // On iOS Safari, AudioContext starts suspended and must be resumed
      // during a user gesture. This function is called from a click handler.
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Double-check it actually resumed
      if (audioContext.state !== "running") {
        setMicError("Could not start audio. Tap the mic button again.");
        stream.getTracks().forEach((t) => t.stop());
        audioContext.close().catch(() => {});
        audioContextRef.current = null;
        return;
      }

      const source = audioContext.createMediaStreamSource(stream);

      // ScriptProcessorNode: deprecated but universally supported (including iOS Safari).
      // Buffer size 4096 gives ~93ms chunks at 44.1kHz.
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      recordingChunksRef.current = [];
      isRecordingRef.current = true;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        recordingChunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setState("listening");
      setInterimTranscript("");
      setMicError(null);
    } catch (err: unknown) {
      const error = err as Error & { name?: string };
      console.warn("[useVoice] mic access error:", error);

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Go to Settings \u2192 Safari \u2192 Microphone to allow.");
      } else if (error.name === "NotFoundError") {
        setMicError("No microphone found on this device.");
      } else if (error.name === "NotSupportedError" || error.name === "TypeError") {
        // This happens in iOS PWA (WKWebView) where getUserMedia exists but doesn't work
        setMicError("Microphone not supported in this mode. Open in Safari instead of the home screen app.");
      } else {
        setMicError("Could not access microphone. Please try again.");
      }
      setState("idle");
      setInterimTranscript("");
    }
  }, []);

  const stopFallbackListening = useCallback(async () => {
    if (!isRecordingRef.current) return;

    const sampleRate = audioContextRef.current?.sampleRate ?? 44100;
    isRecordingRef.current = false;

    const chunks = recordingChunksRef.current;
    recordingChunksRef.current = [];
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);

    cleanupRecording();

    if (totalLength < sampleRate * 0.3) {
      // Less than 0.3 seconds — too short, probably accidental tap
      setState("idle");
      setInterimTranscript("");
      return;
    }

    const allSamples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      allSamples.set(chunk, offset);
      offset += chunk.length;
    }

    setState("processing");
    setInterimTranscript("Transcribing...");

    try {
      const wavBlob = encodeWAV(allSamples, sampleRate);
      const formData = new FormData();
      formData.append("audio", wavBlob, "recording.wav");

      const res = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (res.status === 429) {
        setMicError("Too many requests. Wait a moment and try again.");
        setState("idle");
        setInterimTranscript("");
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Unknown error" }));
        console.warn("[useVoice] STT API error:", res.status, errData);
        setMicError("Transcription failed. Please try again.");
        setState("idle");
        setInterimTranscript("");
        return;
      }

      const data = await res.json();
      const text = (data.text ?? "").trim();

      setInterimTranscript("");

      if (text) {
        onTranscriptRef.current?.(text);
      } else {
        setState("idle");
        // No error — just didn't detect speech
      }
    } catch (err) {
      console.warn("[useVoice] fallback STT error:", err);
      setMicError("Connection error. Check your internet and try again.");
      setState("idle");
      setInterimTranscript("");
    }
  }, [cleanupRecording]);

  // -------------------------------------------------------------------------
  // Unified start/stop listening
  // -------------------------------------------------------------------------

  const startListening = useCallback(() => {
    // Clear any previous error
    setMicError(null);

    // Stop any current audio playback
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (nativeSTT) {
      startNativeListening();
    } else if (detectMicAccess()) {
      startFallbackListening();
    } else {
      setMicError("Microphone not available on this browser.");
    }
  }, [nativeSTT, startNativeListening, startFallbackListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setState("idle");
      setInterimTranscript("");
    }
    if (isRecordingRef.current) {
      stopFallbackListening();
    }
  }, [stopFallbackListening]);

  // -------------------------------------------------------------------------
  // Speech Synthesis (TTS) — ElevenLabs via /api/tts
  // -------------------------------------------------------------------------

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !voiceEnabled) return;
      if (!text || text.trim().length === 0) return;

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
          const audio = new Audio();
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

          audio.src = url;
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
      isRecordingRef.current = false;
      cleanupRecording();
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
  }, [cleanupRecording]);

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
    micError,
    clearMicError,
  };
}

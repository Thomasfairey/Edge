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

/** Check if getUserMedia is available (for mic recording fallback). Works on iOS Safari 11+. */
function hasMicAccess(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/** Detect iOS for audio workarounds */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Encode Float32Array PCM samples to a WAV Blob at 16-bit 16kHz mono */
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  // Downsample to 16kHz for smaller upload and faster transcription
  const targetRate = 16000;
  const ratio = sampleRate / targetRate;
  const newLength = Math.floor(samples.length / ratio);
  const downsampled = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    downsampled[i] = samples[Math.floor(i * ratio)];
  }

  const buffer = new ArrayBuffer(44 + downsampled.length * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + downsampled.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);           // chunk size
  view.setUint16(20, 1, true);            // PCM format
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, targetRate, true);    // sample rate
  view.setUint32(28, targetRate * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample
  writeStr(36, "data");
  view.setUint32(40, downsampled.length * 2, true);

  // Write PCM samples
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
  const workletNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recordingChunksRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);

  // Feature detection
  const nativeSTT = hasNativeSpeechRecognition();
  const fallbackSTT = hasMicAccess();
  const sttSupported = nativeSTT || fallbackSTT;
  const ttsSupported = true;

  // Restore preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved === "true") setVoiceEnabled(true);
    } catch {}
  }, []);

  // Cleanup helper for mic recording
  const cleanupRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
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
      // If disabling, stop everything
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
  // Speech Recognition (STT) — getUserMedia + Web Audio API fallback
  // Records raw PCM via ScriptProcessorNode, encodes to WAV, sends to /api/stt
  // Works on iOS Safari 11+ (no MediaRecorder dependency)
  // -------------------------------------------------------------------------

  const startFallbackListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      mediaStreamRef.current = stream;

      // Use webkitAudioContext for older iOS Safari
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const audioContext = new AC();
      audioContextRef.current = audioContext;

      // On iOS Safari, the AudioContext starts in "suspended" state and must
      // be resumed inside a user-gesture call stack. Since startFallbackListening
      // is called from a click handler, this resume() should work.
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessorNode (deprecated but universally supported including iOS Safari)
      // Buffer size 4096 gives ~93ms chunks at 44.1kHz
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      workletNodeRef.current = processor;
      recordingChunksRef.current = [];
      isRecordingRef.current = true;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy the buffer since it gets reused
        recordingChunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setState("listening");
      setInterimTranscript("");
    } catch (err) {
      console.warn("[useVoice] mic access error:", err);
      setState("idle");
      setInterimTranscript("");
    }
  }, []);

  const stopFallbackListening = useCallback(async () => {
    if (!isRecordingRef.current) return;

    const sampleRate = audioContextRef.current?.sampleRate ?? 44100;
    isRecordingRef.current = false;

    // Concatenate all recorded chunks
    const chunks = recordingChunksRef.current;
    recordingChunksRef.current = [];
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);

    cleanupRecording();

    if (totalLength < sampleRate * 0.5) {
      // Less than 0.5 seconds of audio — too short
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
  }, [cleanupRecording]);

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

          // Set src and use load()+play() for Safari compatibility
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
  };
}

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  whenAudioUnlocked,
  playOnSharedAudio,
  stopSharedAudio,
  notifyAudioBlocked,
} from "@/app/components/AudioUnlock";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { TextToSpeechPlugin } from "@capacitor-community/text-to-speech";

// ---------------------------------------------------------------------------
// Capacitor detection
// ---------------------------------------------------------------------------

const isNative = Capacitor.isNativePlatform();

// Register the native TTS plugin directly rather than importing the package
// index, whose top-level `window.speechSynthesis` warm-up throws during the
// Next.js SSR prerender. registerPlugin is lazy and SSR-safe; the web impl
// (which touches window) is only instantiated in the browser, never on the
// server and never on native.
const TextToSpeech = registerPlugin<TextToSpeechPlugin>("TextToSpeech", {
  web: () =>
    import("@capacitor-community/text-to-speech/dist/esm/web").then(
      (m) => new m.TextToSpeechWeb()
    ),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface UseVoiceOptions {
  /** Called when speech recognition produces a final transcript */
  onTranscript?: (text: string) => void;
  /** Called when TTS finishes speaking */
  onSpeakEnd?: () => void;
  /** Language for recognition (default: "en-GB") */
  lang?: string;
  /** Whether TTS is enabled (default: true) */
  ttsEnabled?: boolean;
  /** Character archetype ID — determines which ElevenLabs voice is used */
  characterId?: string;
}

interface UseVoiceReturn {
  state: VoiceState;
  /** Whether any form of speech recognition is supported */
  sttSupported: boolean;
  ttsSupported: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  startListening: () => void;
  stopListening: () => void;
  /** Speak text aloud via ElevenLabs TTS. Optional voiceOverride uses a different characterId for this call. */
  speak: (text: string, voiceOverride?: string) => void;
  /** Speak text regardless of voiceEnabled — for lesson audio mode */
  speakDirect: (text: string, voiceOverride?: string) => void;
  /** Stop any current speech */
  stopSpeaking: () => void;
  interimTranscript: string;
  /** User-facing error message when mic fails (null = no error) */
  micError: string | null;
  /** Clear the mic error */
  clearMicError: () => void;
  /** True on iPhone/iPad — callers must drive listening from a user gesture */
  isIOS: boolean;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const VOICE_PREF_KEY = "edge-voice-enabled";

/** Banner shown when iOS blocks playback — cleared as soon as a retry plays */
const AUDIO_BLOCKED_MSG = "Tap the screen to turn on audio, then continue.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports as MacIntel; distinguish by multi-touch capability.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function detectNativeSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  // iOS WebKit advertises webkitSpeechRecognition but the underlying service
  // is blocked by Apple — calling .start() always errors with
  // "service-not-allowed". Force the MediaRecorder → /api/stt fallback path
  // so iPhone/iPad users get working transcription via ElevenLabs Scribe.
  if (detectIOS()) return false;
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
  const { onTranscript, onSpeakEnd, lang = "en-GB", ttsEnabled = true, characterId } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Hydration-safe feature detection (avoids SSR mismatch)
  const [sttSupported, setSttSupported] = useState(false);
  const [nativeSTT, setNativeSTT] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const characterIdRef = useRef(characterId);
  onTranscriptRef.current = onTranscript;
  onSpeakEndRef.current = onSpeakEnd;
  characterIdRef.current = characterId;

  // Web Audio API refs for mic recording fallback (iOS Safari)
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordingChunksRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);

  // Native speech recognition ref
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const recognitionRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Generation counter for native TTS — lets a newer speak()/stop() cancel the
  // callbacks of an earlier native speak that is still resolving.
  const nativeSpeakGenRef = useRef(0);

  const ttsSupported = true;

  // Run feature detection on client only (after hydration) — prevents SSR mismatch
  useEffect(() => {
    // Web Speech API is desktop-only here (detectNativeSpeechRecognition is
    // false on iOS). The Capacitor community speech-recognition plugin is NOT
    // SPM-compatible, so the native app uses the same server STT path
    // (MediaRecorder -> /api/stt) as mobile Safari.
    const webSpeech = detectNativeSpeechRecognition();
    const mic = detectMicAccess();
    setNativeSTT(webSpeech);
    setSttSupported(webSpeech || mic);
    setIsIOS(detectIOS());
  }, []);

  // Restore preference from localStorage (default: disabled)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved === "true") setVoiceEnabled(true);
    } catch {}
  }, []);

  const clearMicError = useCallback(() => setMicError(null), []);

  // Auto-clear mic errors after 8 seconds
  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(null), 8000);
    return () => clearTimeout(t);
  }, [micError]);

  // Cleanup helper for mic recording (iOS Safari fallback)
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

  // Audio unlock is handled by the AudioUnlock component in root layout.
  // It creates a singleton Audio element, unlocks it on first user gesture,
  // and exports helpers (whenAudioUnlocked, playOnSharedAudio, stopSharedAudio)
  // that this hook uses for Safari-compatible TTS playback.

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_PREF_KEY, String(next));
      } catch {}
      if (!next) {
        // Stop everything when disabling
        mediaRecorderRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recognitionRef.current?.stop();
        cleanupRecording();
        abortRef.current?.abort();
        if (isNative) {
          nativeSpeakGenRef.current++;
          TextToSpeech.stop().catch(() => {});
        }
        stopSharedAudio();
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

    const recognition = new SR();
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
        setState("idle");
        onTranscriptRef.current?.(finalText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setMicError("Microphone access denied. Check your browser settings.");
      } else if (event.error === "service-not-allowed") {
        // Should not reach here on iOS (detectIOS gate routes around native
        // STT) but handle defensively for any browser that blocks the speech
        // service at the platform level.
        console.warn("[useVoice] recognition service blocked by platform");
        setMicError("Voice input not available on this browser. Try typing instead.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        console.warn("[useVoice] recognition error:", event.error);
        setMicError("Voice input failed. Try again or type instead.");
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
      setState("idle");
    };

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
  // Speech Recognition (STT) — MediaRecorder + server-side ElevenLabs Scribe
  // -------------------------------------------------------------------------

  const startMediaRecorderListening = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Voice input not supported on this device");
      return;
    }

    setMicError(null);

    // Stop any current audio playback
    abortRef.current?.abort();
    stopSharedAudio();

    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop the microphone stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 1000) {
          // Too short — probably no speech
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
            signal: AbortSignal.timeout(15000),
          });

          if (res.status === 429) {
            setMicError("Too many requests. Wait a moment and try again.");
            setState("idle");
            setInterimTranscript("");
            return;
          }

          if (!res.ok) {
            throw new Error(`STT API error: ${res.status}`);
          }

          const data = await res.json();
          const text = data.text?.trim();

          if (text) {
            setInterimTranscript("");
            onTranscriptRef.current?.(text);
          } else {
            setInterimTranscript("");
            setMicError("Couldn\u2019t hear that \u2014 try again");
          }
        } catch (err) {
          console.warn("[useVoice] transcription error:", err);
          setInterimTranscript("");
          setMicError("Transcription failed \u2014 try again");
        }

        setState("idle");
      };

      recorder.onerror = () => {
        console.warn("[useVoice] recorder error");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState("idle");
        setInterimTranscript("");
        setMicError("Recording failed");
      };

      recorder.start(250); // Collect chunks every 250ms
      setState("listening");
      setInterimTranscript("Listening...");
    } catch (err) {
      console.warn("[useVoice] getUserMedia error:", err);
      setState("idle");

      // Provide helpful error messages
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setMicError("Microphone access denied \u2014 check your browser settings");
        } else if (err.name === "NotFoundError") {
          setMicError("No microphone found");
        } else {
          setMicError("Microphone not available");
        }
      } else {
        setMicError("Could not access microphone");
      }
    }
  }, []);

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

    // *** CRITICAL iOS Safari fix ***
    // AudioContext MUST be created and resumed SYNCHRONOUSLY in the user
    // gesture (button click) call stack — BEFORE any `await`. If we await
    // getUserMedia first, the user gesture expires and iOS Safari refuses
    // to start the AudioContext (it stays "suspended" forever).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (!AC) {
      setMicError("Audio not supported on this browser.");
      return;
    }

    // Create AudioContext synchronously in the click handler
    const audioContext = new AC();
    audioContextRef.current = audioContext;

    // Resume synchronously — still within user gesture call stack
    // (the first await hasn't happened yet)
    const resumePromise = audioContext.resume();

    try {
      // Now we can await — user gesture already unlocked the AudioContext
      await resumePromise;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      // Verify AudioContext is running
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
      // Clean up AudioContext on any failure
      audioContext.close().catch(() => {});
      audioContextRef.current = null;

      const error = err as Error & { name?: string };
      console.warn("[useVoice] mic access error:", error);

      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Go to Settings \u2192 Safari \u2192 Microphone to allow.");
      } else if (error.name === "NotFoundError") {
        setMicError("No microphone found on this device.");
      } else if (error.name === "NotSupportedError" || error.name === "TypeError") {
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
        signal: AbortSignal.timeout(15000),
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
    stopSharedAudio();

    if (nativeSTT) {
      // Desktop browser Web Speech API (Chrome/Edge)
      startNativeListening();
    } else if (typeof MediaRecorder !== "undefined" && detectMicAccess()) {
      // Native app + modern mobile Safari → server STT (ElevenLabs Scribe)
      startMediaRecorderListening();
    } else if (detectMicAccess()) {
      // Older iOS Safari fallback — no MediaRecorder, use Web Audio API
      startFallbackListening();
    } else {
      setMicError("Microphone not available on this device.");
    }
  }, [nativeSTT, startNativeListening, startMediaRecorderListening, startFallbackListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setState("idle");
      setInterimTranscript("");
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // This triggers onstop -> transcription
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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

  const speakInternal = useCallback(
    (text: string, voiceOverride?: string) => {
      if (!text || text.trim().length === 0) return;

      // Cancel any in-flight fetch (but don't touch the audio element yet —
      // it may still be finishing its unlock play)
      abortRef.current?.abort();
      setState("speaking");

      // Native app: use the OS speech synthesiser (AVSpeechSynthesizer on iOS).
      // Bypasses the web audio-unlock dance entirely — no user gesture, no
      // singleton Audio element, no network round-trip. Reliable read-back on
      // device. Trade-off: OS voice instead of the ElevenLabs character voices
      // (which still play on the web build).
      if (isNative) {
        const gen = ++nativeSpeakGenRef.current;
        TextToSpeech.stop().catch(() => {});
        TextToSpeech.speak({
          text,
          lang,
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0,
          category: "playback",
        })
          .then(() => {
            if (gen !== nativeSpeakGenRef.current) return;
            setState("idle");
            onSpeakEndRef.current?.();
          })
          .catch((err) => {
            if (gen !== nativeSpeakGenRef.current) return;
            console.warn("[useVoice] native TTS error:", err?.message ?? err);
            setState("idle");
          });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      // Fetch TTS audio first — runs in parallel with any pending unlock
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          characterId: voiceOverride ?? characterIdRef.current,
        }),
        signal: controller.signal,
      })
        .then((res) => {
          // Genuine API errors (400/429/502) come back as JSON — they must NOT
          // fall through to the auth-redirect check below, or a transient
          // ElevenLabs hiccup shows a bogus "Session expired" banner.
          if (!res.ok) throw new Error(`TTS API error: ${res.status}`);
          // An expired Supabase session makes the middleware redirect
          // POST /api/tts -> 307 /login -> 200 HTML. res.ok would be true and
          // res.blob() would hand back an HTML document that we'd silently try
          // to "play" as audio. Detect the redirect / non-audio body instead.
          const contentType = res.headers.get("content-type") ?? "";
          if (res.redirected || !contentType.includes("audio")) {
            throw new Error("tts-auth-redirect");
          }
          return res.blob();
        })
        .then((blob) => {
          if (controller.signal.aborted) return;

          const url = URL.createObjectURL(blob);

          // Play on the SAME element unlocked by the gesture. Defined as a
          // named fn so we can re-run it as the retry after a blocked playback.
          const playUrl = () => {
            if (controller.signal.aborted) {
              URL.revokeObjectURL(url);
              return;
            }

            const { audio, played } = playOnSharedAudio(url);

            // If this is the retry after a blocked playback, the "tap the
            // screen" banner is now stale — drop it as soon as audio starts.
            played.then(() => {
              setMicError((prev) => (prev === AUDIO_BLOCKED_MSG ? null : prev));
            }).catch(() => {});

            audio.onended = () => {
              setState("idle");
              URL.revokeObjectURL(url);
              onSpeakEndRef.current?.();
            };

            audio.onerror = () => {
              console.warn("[useVoice] audio playback error");
              setState("idle");
              URL.revokeObjectURL(url);
            };

            played.catch((err: Error & { name?: string }) => {
              // A newer speak() superseded this one — not an error.
              if (err?.name === "AbortError") return;
              // iOS refused playback despite the unlock. Re-arm the unlock and
              // tell the user how to recover, instead of failing silently.
              console.warn("[useVoice] playback blocked:", err?.message);
              setState("idle");
              setMicError(AUDIO_BLOCKED_MSG);
              notifyAudioBlocked(playUrl);
            });
          };

          // Runs immediately if unlocked, else queues until the next gesture.
          whenAudioUnlocked(playUrl);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setState("idle");
          if (err.message === "tts-auth-redirect") {
            // Actionable: the session lapsed. Surface it rather than swallow.
            console.warn("[useVoice] TTS auth redirect — session likely expired");
            setMicError("Session expired — refresh the page to restore audio.");
            return;
          }
          // Other fetch errors are best-effort: the text always renders, and
          // auto-fired triggers can race the auth cookie / audio-unlock and
          // recover on the next call, so don't surface a banner for those.
          console.warn("[useVoice] TTS fetch error:", err.message);
        });
    },
    [lang]
  );

  const speak = useCallback(
    (text: string, voiceOverride?: string) => {
      if (!ttsEnabled || !voiceEnabled) return;
      speakInternal(text, voiceOverride);
    },
    [ttsEnabled, voiceEnabled, speakInternal]
  );

  /** Speak regardless of voiceEnabled — for lesson audio mode */
  const speakDirect = useCallback(
    (text: string, voiceOverride?: string) => {
      if (!ttsEnabled) return;
      speakInternal(text, voiceOverride);
    },
    [ttsEnabled, speakInternal]
  );

  const stopSpeaking = useCallback(() => {
    abortRef.current?.abort();
    if (isNative) {
      nativeSpeakGenRef.current++;
      TextToSpeech.stop().catch(() => {});
    }
    stopSharedAudio();
    setState((prev) => (prev === "speaking" ? "idle" : prev));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
      isRecordingRef.current = false;
      cleanupRecording();
      abortRef.current?.abort();
      if (isNative) TextToSpeech.stop().catch(() => {});
      stopSharedAudio();
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
    speakDirect,
    stopSpeaking,
    interimTranscript,
    micError,
    clearMicError,
    isIOS,
  };
}

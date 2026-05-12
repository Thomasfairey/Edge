"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  whenAudioUnlocked,
  playOnSharedAudio,
  stopSharedAudio,
  primeOnGesture,
  isAudioUnlocked,
} from "@/app/components/AudioUnlock";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

/**
 * useVoice — STT (microphone → text) and TTS (text → speech).
 *
 * Capture paths (auto-selected):
 *   - Capacitor native iOS/Android → @capacitor-community/speech-recognition
 *   - iOS Safari / iOS PWA / WebKit → AudioContext + ScriptProcessor → WAV → /api/stt
 *   - Other modern browsers → MediaRecorder (webm/opus) → /api/stt
 *
 * Playback: ElevenLabs streaming MP3 via /api/tts, piped to the singleton
 * <audio> element unlocked by AudioUnlock. Robust to play() rejection (state
 * always returns to "idle"), aborts in-flight requests on new speak(), and
 * never leaves the UI hung.
 */

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

const isNative = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

/** True on iOS (Safari, WKWebView, PWA). */
function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as Mac with touch support
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function hasMediaDevices(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

/**
 * Pick the best supported MediaRecorder MIME type, or null if the recorder
 * is unavailable / no candidate type works. We deliberately prefer WAV-PCM
 * via AudioContext on iOS (see below) because iOS Safari's `audio/mp4`
 * fragments aren't always reassemblable into a valid file for STT.
 */
function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceState = "idle" | "listening" | "processing" | "speaking";

interface UseVoiceOptions {
  onTranscript?: (text: string) => void;
  onSpeakEnd?: () => void;
  lang?: string;
  ttsEnabled?: boolean;
  characterId?: string;
}

interface UseVoiceReturn {
  state: VoiceState;
  sttSupported: boolean;
  ttsSupported: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string, voiceOverride?: string) => void;
  speakDirect: (text: string, voiceOverride?: string) => void;
  stopSpeaking: () => void;
  interimTranscript: string;
  micError: string | null;
  clearMicError: () => void;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const VOICE_PREF_KEY = "edge-voice-enabled";

// ---------------------------------------------------------------------------
// WAV encoder (Float32 → 16-bit PCM mono @ 16kHz). Used by iOS path.
// ---------------------------------------------------------------------------

const TARGET_SAMPLE_RATE = 16000;

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  // Downsample to 16kHz (mono) via simple decimation. Good enough for STT.
  let downsampled: Float32Array;
  if (sampleRate === TARGET_SAMPLE_RATE) {
    downsampled = samples;
  } else {
    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    const newLength = Math.floor(samples.length / ratio);
    downsampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      // Average a window of samples for very basic anti-alias filtering.
      const start = Math.floor(i * ratio);
      const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      let n = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j];
        n++;
      }
      downsampled[i] = n > 0 ? sum / n : 0;
    }
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
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, downsampled.length * 2, true);

  let offset = 44;
  for (let i = 0; i < downsampled.length; i++) {
    const s = Math.max(-1, Math.min(1, downsampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    onTranscript,
    onSpeakEnd,
    lang = "en-GB",
    ttsEnabled = true,
    characterId,
  } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Feature detection (after hydration to avoid SSR mismatch).
  const [sttSupported, setSttSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Refs for capture state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef<string>("");
  const streamRef = useRef<MediaStream | null>(null);

  // iOS Web Audio capture path
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);

  // TTS request state
  const ttsAbortRef = useRef<AbortController | null>(null);
  const speakSeqRef = useRef(0);

  // Stable callback refs
  const onTranscriptRef = useRef(onTranscript);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const characterIdRef = useRef(characterId);
  onTranscriptRef.current = onTranscript;
  onSpeakEndRef.current = onSpeakEnd;
  characterIdRef.current = characterId;

  const ttsSupported = true;

  // -------------------------------------------------------------------------
  // Hydration-safe detection
  // -------------------------------------------------------------------------

  useEffect(() => {
    const ios = detectIOS();
    setIsIOS(ios);
    setSttSupported(isNative || hasMediaDevices());
  }, []);

  // -------------------------------------------------------------------------
  // Persist voice preference
  // -------------------------------------------------------------------------

  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_PREF_KEY);
      if (saved === "true") setVoiceEnabled(true);
    } catch {}
  }, []);

  // -------------------------------------------------------------------------
  // Mic error: auto-clear after 8s
  // -------------------------------------------------------------------------

  const clearMicError = useCallback(() => setMicError(null), []);

  useEffect(() => {
    if (!micError) return;
    const t = setTimeout(() => setMicError(null), 8000);
    return () => clearTimeout(t);
  }, [micError]);

  // -------------------------------------------------------------------------
  // Cleanup helpers
  // -------------------------------------------------------------------------

  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const teardownIOSCapture = useCallback(() => {
    isRecordingRef.current = false;
    try {
      processorRef.current?.disconnect();
    } catch {}
    processorRef.current = null;
    try {
      sourceNodeRef.current?.disconnect();
    } catch {}
    sourceNodeRef.current = null;
    // Leave AudioContext open and re-use across recordings to avoid the
    // "AudioContext was not allowed to start" issue on subsequent attempts.
  }, []);

  const teardownMediaRecorder = useCallback(() => {
    const rec = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (rec) {
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {}
    }
  }, []);

  const fullStop = useCallback(() => {
    teardownIOSCapture();
    teardownMediaRecorder();
    stopMediaStream();
    recorderChunksRef.current = [];
    recordedChunksRef.current = [];
  }, [teardownIOSCapture, teardownMediaRecorder, stopMediaStream]);

  // -------------------------------------------------------------------------
  // Toggle
  // -------------------------------------------------------------------------

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(VOICE_PREF_KEY, String(next));
      } catch {}
      if (!next) {
        // Disabling: stop everything
        ttsAbortRef.current?.abort();
        ttsAbortRef.current = null;
        stopSharedAudio();
        if (isNative) {
          try {
            SpeechRecognition.stop().catch(() => {});
            SpeechRecognition.removeAllListeners();
          } catch {}
        }
        fullStop();
        setState("idle");
        setInterimTranscript("");
        setMicError(null);
      } else {
        // Enabling: prime audio unlock so the very first TTS plays.
        primeOnGesture();
      }
      return next;
    });
  }, [fullStop]);

  // -------------------------------------------------------------------------
  // STT — Capacitor native
  // -------------------------------------------------------------------------

  const startCapacitorListening = useCallback(async () => {
    ttsAbortRef.current?.abort();
    stopSharedAudio();
    setMicError(null);

    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        setMicError("Microphone permission denied. Allow it in Settings.");
        setState("idle");
        return;
      }
    } catch (err) {
      console.warn("[useVoice] capacitor permission error:", err);
      setMicError("Could not request microphone permission.");
      setState("idle");
      return;
    }

    setState("listening");
    setInterimTranscript("");

    try {
      SpeechRecognition.removeAllListeners();
      SpeechRecognition.addListener("partialResults", (data: { matches: string[] }) => {
        if (data.matches?.[0]) setInterimTranscript(data.matches[0]);
      });

      const result = await SpeechRecognition.start({
        language: lang,
        partialResults: true,
        popup: false,
      });

      const text = result.matches?.[0]?.trim() ?? "";
      setInterimTranscript("");
      if (text) {
        setState("processing");
        onTranscriptRef.current?.(text);
      }
      setState("idle");
    } catch (err) {
      console.warn("[useVoice] capacitor recognition error:", err);
      setMicError("Speech recognition failed. Please try again.");
      setState("idle");
      setInterimTranscript("");
    } finally {
      try {
        SpeechRecognition.removeAllListeners();
      } catch {}
    }
  }, [lang]);

  const stopCapacitorListening = useCallback(async () => {
    try {
      await SpeechRecognition.stop();
    } catch {}
    try {
      SpeechRecognition.removeAllListeners();
    } catch {}
    setState("idle");
    setInterimTranscript("");
  }, []);

  // -------------------------------------------------------------------------
  // STT — iOS AudioContext path (Float32 → WAV → /api/stt)
  // -------------------------------------------------------------------------

  const startIOSCapture = useCallback(async () => {
    if (!hasMediaDevices()) {
      setMicError("Microphone not available on this browser.");
      return false;
    }

    type ACCtor = typeof AudioContext;
    const W = window as unknown as {
      AudioContext?: ACCtor;
      webkitAudioContext?: ACCtor;
    };
    const AC = W.AudioContext || W.webkitAudioContext;
    if (!AC) {
      setMicError("Audio not supported on this browser.");
      return false;
    }

    // *** iOS Safari requires AudioContext to be created/resumed
    // SYNCHRONOUSLY in the user-gesture call stack — BEFORE any await. ***
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      try {
        ctx = new AC();
      } catch (err) {
        console.warn("[useVoice] AudioContext ctor failed:", err);
        setMicError("Audio not supported on this browser.");
        return false;
      }
      audioCtxRef.current = ctx;
    }
    // Fire resume() synchronously. Don't await yet.
    const resumeP = ctx.state !== "running" ? ctx.resume() : Promise.resolve();

    try {
      await resumeP;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      if (ctx.state !== "running") {
        // Still suspended after async work — the gesture was lost.
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setMicError("Tap the mic button again to start recording.");
        return false;
      }

      const source = ctx.createMediaStreamSource(stream);
      // Buffer 4096 ≈ 93ms at 44.1kHz. Mono in, mono out.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      recordedChunksRef.current = [];
      isRecordingRef.current = true;

      processor.onaudioprocess = (e) => {
        if (!isRecordingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        // Copy (input buffer is reused across events)
        recordedChunksRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      sourceNodeRef.current = source;
      processorRef.current = processor;
      return true;
    } catch (err) {
      const e = err as Error & { name?: string };
      console.warn("[useVoice] ios capture start failed:", e);
      stopMediaStream();
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Allow it in Settings → Safari → Microphone.");
      } else if (e.name === "NotFoundError") {
        setMicError("No microphone found on this device.");
      } else if (e.name === "NotReadableError") {
        setMicError("Microphone is in use by another app. Close it and try again.");
      } else if (e.name === "SecurityError" || e.name === "TypeError") {
        setMicError("Microphone requires a secure context (HTTPS). Open in Safari.");
      } else {
        setMicError("Could not access microphone. Please try again.");
      }
      return false;
    }
  }, [stopMediaStream]);

  // -------------------------------------------------------------------------
  // Transcription HTTP call (hoisted before consumers to keep deps clean)
  // -------------------------------------------------------------------------

  const sendForTranscription = useCallback(async (blob: Blob, filename: string) => {
    const form = new FormData();
    form.append("audio", blob, filename);

    let res: Response;
    try {
      res = await fetch("/api/stt", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const e = err as Error;
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        setMicError("Transcription timed out. Check your connection.");
      } else {
        setMicError("Connection error. Check your internet and try again.");
      }
      setState("idle");
      setInterimTranscript("");
      return;
    }

    if (res.status === 429) {
      setMicError("Too many requests. Wait a moment and try again.");
      setState("idle");
      setInterimTranscript("");
      return;
    }

    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        detail = data?.error ?? "";
      } catch {}
      console.warn(`[useVoice] STT ${res.status}:`, detail);
      setMicError(
        res.status === 401
          ? "Voice transcription not configured."
          : "Transcription unavailable. Try typing instead.",
      );
      setState("idle");
      setInterimTranscript("");
      return;
    }

    let data: { text?: string } = {};
    try {
      data = await res.json();
    } catch {}
    const text = (data.text ?? "").trim();
    setInterimTranscript("");

    if (text) {
      onTranscriptRef.current?.(text);
    } else {
      setMicError("Couldn't hear that — try again.");
    }
    setState("idle");
  }, []);

  const stopIOSCaptureAndTranscribe = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    const ctx = audioCtxRef.current;
    const sampleRate = ctx?.sampleRate ?? 44100;
    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];

    teardownIOSCapture();
    stopMediaStream();

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    // Less than 0.3s of audio is almost certainly an accidental tap.
    if (totalLength < sampleRate * 0.3) {
      setState("idle");
      setInterimTranscript("");
      return;
    }

    const all = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }

    setState("processing");
    setInterimTranscript("Transcribing...");

    try {
      const wav = encodeWAV(all, sampleRate);
      await sendForTranscription(wav, "recording.wav");
    } catch (err) {
      console.warn("[useVoice] ios transcribe error:", err);
      setMicError("Transcription failed — please try again.");
      setState("idle");
      setInterimTranscript("");
    }
  }, [stopMediaStream, teardownIOSCapture, sendForTranscription]);

  // -------------------------------------------------------------------------
  // STT — MediaRecorder path (non-iOS browsers)
  // -------------------------------------------------------------------------

  const startMediaRecorder = useCallback(async () => {
    if (!hasMediaDevices()) {
      setMicError("Microphone not available on this browser.");
      return false;
    }
    const mime = pickRecorderMime();
    if (!mime) {
      setMicError("Audio recording not supported on this browser.");
      return false;
    }

    setMicError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;
      recorderMimeRef.current = mime;
      recorderChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recorderChunksRef.current.push(e.data);
      };

      recorder.onerror = (e) => {
        console.warn("[useVoice] recorder error:", e);
        stopMediaStream();
        mediaRecorderRef.current = null;
        setState("idle");
        setInterimTranscript("");
        setMicError("Recording failed. Please try again.");
      };

      recorder.start(); // No timeslice: one blob delivered on stop()
      return true;
    } catch (err) {
      const e = err as Error & { name?: string };
      console.warn("[useVoice] getUserMedia error:", e);
      stopMediaStream();
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMicError("Microphone access denied — check your browser settings.");
      } else if (e.name === "NotFoundError") {
        setMicError("No microphone found.");
      } else if (e.name === "NotReadableError") {
        setMicError("Microphone is in use by another app.");
      } else {
        setMicError("Could not access microphone.");
      }
      return false;
    }
  }, [stopMediaStream]);

  const stopMediaRecorderAndTranscribe = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;

    const mime = recorderMimeRef.current || "audio/webm";
    const stopPromise = new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(recorderChunksRef.current, { type: mime });
        recorderChunksRef.current = [];
        resolve(blob);
      };
    });

    try {
      if (rec.state !== "inactive") rec.stop();
    } catch {}

    mediaRecorderRef.current = null;

    const blob = await stopPromise;
    stopMediaStream();

    // Very short recording — discard
    if (blob.size < 1000) {
      setState("idle");
      setInterimTranscript("");
      return;
    }

    setState("processing");
    setInterimTranscript("Transcribing...");

    const ext = mime.includes("webm")
      ? "webm"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("mp4")
          ? "mp4"
          : "audio";

    try {
      await sendForTranscription(blob, `recording.${ext}`);
    } catch (err) {
      console.warn("[useVoice] transcribe error:", err);
      setMicError("Transcription failed — please try again.");
      setState("idle");
      setInterimTranscript("");
    }
  }, [stopMediaStream, sendForTranscription]);

  // -------------------------------------------------------------------------
  // Unified start/stop
  // -------------------------------------------------------------------------

  const startListening = useCallback(() => {
    setMicError(null);

    // Make sure any in-flight TTS yields the mic
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    stopSharedAudio();
    setState((prev) => (prev === "speaking" ? "idle" : prev));

    if (isNative) {
      void startCapacitorListening();
      return;
    }

    if (isIOS) {
      // iOS: AudioContext + ScriptProcessor (synchronous unlock requirement).
      // We can't `await` here because we need the AudioContext to be created
      // inside the user gesture call stack. startIOSCapture handles this
      // (it returns a promise but creates+resumes ctx synchronously).
      setState("listening");
      setInterimTranscript("");
      void startIOSCapture().then((ok) => {
        if (!ok) {
          setState("idle");
          setInterimTranscript("");
        }
      });
      return;
    }

    // Other browsers: MediaRecorder
    setState("listening");
    setInterimTranscript("Listening...");
    void startMediaRecorder().then((ok) => {
      if (!ok) {
        setState("idle");
        setInterimTranscript("");
      }
    });
  }, [isIOS, startCapacitorListening, startIOSCapture, startMediaRecorder]);

  const stopListening = useCallback(() => {
    if (isNative) {
      void stopCapacitorListening();
      return;
    }
    if (isIOS && isRecordingRef.current) {
      void stopIOSCaptureAndTranscribe();
      return;
    }
    if (mediaRecorderRef.current) {
      void stopMediaRecorderAndTranscribe();
      return;
    }
    // Nothing to stop — make sure UI doesn't hang
    setState("idle");
    setInterimTranscript("");
  }, [isIOS, stopCapacitorListening, stopIOSCaptureAndTranscribe, stopMediaRecorderAndTranscribe]);

  // -------------------------------------------------------------------------
  // TTS
  // -------------------------------------------------------------------------

  const speakInternal = useCallback(
    (text: string, voiceOverride?: string) => {
      const trimmed = text?.trim();
      if (!trimmed) return;

      // Cancel any in-flight TTS request before starting a new one.
      ttsAbortRef.current?.abort();
      const controller = new AbortController();
      ttsAbortRef.current = controller;

      // Increment sequence: if a newer speak supersedes this one, ignore late
      // resolves/onended events.
      speakSeqRef.current += 1;
      const mySeq = speakSeqRef.current;

      // Make sure audio is primed
      primeOnGesture();
      setState("speaking");

      const finishIdle = () => {
        if (mySeq !== speakSeqRef.current) return;
        setState((prev) => (prev === "speaking" ? "idle" : prev));
      };

      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          characterId: voiceOverride ?? characterIdRef.current,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`TTS API error: ${res.status}`);
          // Buffer to blob: streaming directly to <audio> is fragile across
          // browsers (Safari especially). A small wait is worth reliability.
          return res.blob();
        })
        .then((blob) => {
          if (controller.signal.aborted || mySeq !== speakSeqRef.current) return;
          const url = URL.createObjectURL(blob);

          // Run once unlocked; runs immediately if already unlocked.
          whenAudioUnlocked(() => {
            if (controller.signal.aborted || mySeq !== speakSeqRef.current) {
              try {
                URL.revokeObjectURL(url);
              } catch {}
              return;
            }

            playOnSharedAudio(url, {
              onEnded: () => {
                if (mySeq !== speakSeqRef.current) return;
                finishIdle();
                onSpeakEndRef.current?.();
              },
              onError: (err) => {
                console.warn("[useVoice] playback error:", err);
                finishIdle();
                // Don't surface a noisy error — caller may try again.
              },
            });
          });

          // Safety: if we never get unlocked (e.g. user never interacts),
          // clear the state after a generous timeout so the UI isn't stuck.
          window.setTimeout(() => {
            if (!isAudioUnlocked() && mySeq === speakSeqRef.current) {
              finishIdle();
            }
          }, 15_000);
        })
        .catch((err: Error) => {
          if (err.name === "AbortError") return;
          console.warn("[useVoice] TTS fetch error:", err.message);
          if (mySeq === speakSeqRef.current) {
            setMicError("Voice playback unavailable.");
            finishIdle();
          }
        });
    },
    [],
  );

  const speak = useCallback(
    (text: string, voiceOverride?: string) => {
      if (!ttsEnabled || !voiceEnabled) return;
      speakInternal(text, voiceOverride);
    },
    [ttsEnabled, voiceEnabled, speakInternal],
  );

  const speakDirect = useCallback(
    (text: string, voiceOverride?: string) => {
      if (!ttsEnabled) return;
      speakInternal(text, voiceOverride);
    },
    [ttsEnabled, speakInternal],
  );

  const stopSpeaking = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    stopSharedAudio();
    // Bump sequence so any late-resolving fetch is ignored.
    speakSeqRef.current += 1;
    setState((prev) => (prev === "speaking" ? "idle" : prev));
  }, []);

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      ttsAbortRef.current?.abort();
      ttsAbortRef.current = null;
      stopSharedAudio();
      if (isNative) {
        try {
          SpeechRecognition.stop().catch(() => {});
          SpeechRecognition.removeAllListeners();
        } catch {}
      }
      isRecordingRef.current = false;
      try {
        processorRef.current?.disconnect();
      } catch {}
      try {
        sourceNodeRef.current?.disconnect();
      } catch {}
      processorRef.current = null;
      sourceNodeRef.current = null;
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
        } catch {}
        mediaRecorderRef.current = null;
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
    speakDirect,
    stopSpeaking,
    interimTranscript,
    micError,
    clearMicError,
  };
}

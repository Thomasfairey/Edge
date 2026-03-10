"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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
  state: VoiceState;
  sttSupported: boolean;
  ttsSupported: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  /** Speak text regardless of voiceEnabled — for lesson audio mode */
  speakDirect: (text: string) => void;
  stopSpeaking: () => void;
  interimTranscript: string;
  /** Error message for user display */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const VOICE_PREF_KEY = "edge-voice-enabled";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { onTranscript, ttsEnabled = true, characterId } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const characterIdRef = useRef(characterId);
  onTranscriptRef.current = onTranscript;
  characterIdRef.current = characterId;

  // Feature detection — MediaRecorder is widely supported including iOS PWA
  const sttSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

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
      if (!next) {
        // Stop everything when disabling
        mediaRecorderRef.current?.stop();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        abortRef.current?.abort();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
          audioRef.current = null;
        }
        setState("idle");
        setInterimTranscript("");
        setError(null);
      }
      return next;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Speech Recognition (STT) — MediaRecorder + server-side ElevenLabs Scribe
  // -------------------------------------------------------------------------

  const startListening = useCallback(async () => {
    if (!sttSupported) {
      setError("Voice input not supported on this device");
      return;
    }

    setError(null);

    // Stop any current audio playback
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

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
            setError("Couldn\u2019t hear that \u2014 try again");
            setTimeout(() => setError(null), 3000);
          }
        } catch (err) {
          console.warn("[useVoice] transcription error:", err);
          setInterimTranscript("");
          setError("Transcription failed \u2014 try again");
          setTimeout(() => setError(null), 3000);
        }

        setState("idle");
      };

      recorder.onerror = () => {
        console.warn("[useVoice] recorder error");
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setState("idle");
        setInterimTranscript("");
        setError("Recording failed");
        setTimeout(() => setError(null), 3000);
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
          setError("Microphone access denied \u2014 check your browser settings");
        } else if (err.name === "NotFoundError") {
          setError("No microphone found");
        } else {
          setError("Microphone not available");
        }
      } else {
        setError("Could not access microphone");
      }
      setTimeout(() => setError(null), 5000);
    }
  }, [sttSupported]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop(); // This triggers onstop -> transcription
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setState("idle");
      setInterimTranscript("");
    }
  }, []);

  // -------------------------------------------------------------------------
  // Speech Synthesis (TTS) — ElevenLabs via /api/tts
  // -------------------------------------------------------------------------

  const speakInternal = useCallback(
    (text: string) => {
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
          const audio = new Audio(url);
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
    []
  );

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !voiceEnabled) return;
      speakInternal(text);
    },
    [ttsEnabled, voiceEnabled, speakInternal]
  );

  /** Speak regardless of voiceEnabled — for lesson audio mode */
  const speakDirect = useCallback(
    (text: string) => {
      if (!ttsEnabled) return;
      speakInternal(text);
    },
    [ttsEnabled, speakInternal]
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
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
    speakDirect,
    stopSpeaking,
    interimTranscript,
    error,
  };
}

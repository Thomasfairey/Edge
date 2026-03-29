/**
 * STT API route — transcribes audio using ElevenLabs Scribe.
 *
 * POST /api/stt
 * Body: multipart form with `audio` file
 * Returns: { text: string }
 *
 * Used as a fallback for browsers without native Web Speech API (e.g. iOS Safari).
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withAuth } from "@/lib/auth";
import { createRequestLogger } from "@/lib/logger";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB — ElevenLabs limit

async function handler(req: NextRequest, _userId: string | null): Promise<Response> {
  const log = createRequestLogger(req, _userId);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured", fallback: "text" },
      { status: 500 }
    );
  }

  let audioBlob: Blob;
  try {
    const formData = await req.formData();
    const file = formData.get("audio");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }
    audioBlob = file;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (audioBlob.size === 0) {
    return NextResponse.json({ error: "Empty audio file" }, { status: 400 });
  }

  // Limit audio size to prevent abuse (stricter than ElevenLabs 25MB limit)
  if (audioBlob.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }

  try {
    // Preserve the original filename/extension from the client (e.g. recording.wav, recording.mp4)
    const originalName = audioBlob instanceof File ? audioBlob.name : "recording.webm";

    // Use ElevenLabs Speech-to-Text (Scribe)
    const form = new FormData();
    form.append("file", audioBlob, originalName);
    form.append("model_id", "scribe_v1");
    form.append("language_code", "eng");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body: form,
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error(`ElevenLabs error ${response.status}: ${errorText}`, { phase: "stt" });
      if (response.status === 401) {
        log.error("API key missing speech_to_text permission — regenerate key in ElevenLabs dashboard", { phase: "stt" });
      }
      return NextResponse.json(
        { error: response.status === 401
          ? "Voice transcription not configured"
          : "Transcription service unavailable", fallback: "text" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text = data.text?.trim() || "";

    log.info(`transcribed ${audioBlob.size} bytes -> "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`, { phase: "stt" });

    return NextResponse.json({ text });
  } catch (error) {
    log.error(`error: ${error instanceof Error ? error.message : "Unknown error"}`, { phase: "stt" });
    return NextResponse.json(
      { error: "Transcription failed", fallback: "text" },
      { status: 502 }
    );
  }
}

// Rate limit: 15 requests per minute, auth required
export const POST = withRateLimit(withAuth(handler), 15);

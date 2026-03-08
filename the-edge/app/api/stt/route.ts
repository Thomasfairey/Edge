/**
 * STT API route — transcribes audio using ElevenLabs Scribe.
 *
 * POST /api/stt
 * Body: multipart/form-data with "audio" file field
 * Returns: { text: string }
 *
 * Used as a fallback for browsers without native Web Speech API (e.g. iOS Safari).
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";

async function handler(req: NextRequest): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const audioFile = formData.get("audio");
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json(
      { error: "audio file is required" },
      { status: 400 }
    );
  }

  try {
    // Preserve the original filename/extension from the client (e.g. recording.wav, recording.mp4)
    const originalName = audioFile instanceof File ? audioFile.name : "audio.wav";
    const body = new FormData();
    body.append("file", audioFile, originalName);
    body.append("model_id", "scribe_v1");
    body.append("language_code", "eng");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[stt] ElevenLabs error ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `ElevenLabs STT error: ${response.status}` },
        { status: 502 }
      );
    }

    const result = await response.json();
    const text = result.text ?? "";

    console.log(`[stt] transcribed ${text.length} chars`);

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[stt] fetch error:", error);
    return NextResponse.json(
      { error: "Failed to connect to ElevenLabs STT" },
      { status: 502 }
    );
  }
}

// Rate limit: 15 requests per minute
export const POST = withRateLimit(handler, 15);

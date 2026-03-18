/**
 * STT API route — transcribes audio using ElevenLabs Scribe.
 *
 * POST /api/stt
 * Body: multipart form with `audio` file
 * Returns: { text: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB — ElevenLabs limit

async function handler(req: NextRequest): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
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

  if (audioBlob.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE / 1024 / 1024}MB.` },
      { status: 400 }
    );
  }

  try {
    // Use ElevenLabs Speech-to-Text (Scribe)
    const form = new FormData();
    form.append("file", audioBlob, "recording.webm");
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
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[stt] ElevenLabs error ${response.status}: ${errorText}`);
      if (response.status === 401) {
        console.error("[stt] API key missing speech_to_text permission — regenerate key in ElevenLabs dashboard");
      }
      return NextResponse.json(
        { error: response.status === 401
          ? "Voice transcription not configured — API key needs STT permission"
          : `Transcription failed: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text = data.text?.trim() || "";

    console.log(`[stt] transcribed ${audioBlob.size} bytes -> "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`);

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[stt] error:", error);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 502 }
    );
  }
}

export const POST = withRateLimit(handler, 15);

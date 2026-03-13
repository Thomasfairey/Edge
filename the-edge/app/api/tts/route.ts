/**
 * TTS API route — proxies text to ElevenLabs for speech synthesis.
 *
 * POST /api/tts
 * Body: { text: string, characterId?: string }
 * Returns: streaming audio/mpeg
 *
 * - Server-side proxy keeps the API key safe
 * - Streams audio chunks for instant playback (no waiting for full generation)
 * - Maps character archetype to a distinct ElevenLabs voice
 * - Uses eleven_flash_v2_5 model for lowest latency (~75ms TTFB)
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/with-rate-limit";
import { getVoiceForCharacter, ELEVENLABS_MODEL } from "@/lib/voice-map";

async function handler(req: NextRequest): Promise<Response> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  let text: string;
  let characterId: string | undefined;

  try {
    const body = await req.json();
    text = body.text;
    characterId = body.characterId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Clean text for more natural speech
  const cleaned = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // remove bold markdown
    .replace(/[#_~`]/g, "")               // remove markdown chars
    .replace(/\n+/g, " ")                 // newlines to spaces
    .trim();

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "text is empty after cleaning" }, { status: 400 });
  }

  const voice = getVoiceForCharacter(characterId ?? "");

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: cleaned,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.45,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error(`[tts] ElevenLabs error ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `ElevenLabs API error: ${response.status}` },
        { status: 502 }
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "No audio stream returned" },
        { status: 502 }
      );
    }

    console.log(
      `[tts] voice=${voice.voiceName} | character=${characterId ?? "default"} | chars=${cleaned.length}`
    );

    // Stream the audio directly to the client
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Voice-Name": voice.voiceName,
      },
    });
  } catch (error) {
    console.error("[tts] fetch error:", error);
    return NextResponse.json(
      { error: "Failed to connect to ElevenLabs" },
      { status: 502 }
    );
  }
}

// Rate limit: 30 requests per minute (narration across all phases + roleplay)
export const POST = withRateLimit(handler, 30);

/**
 * Character archetype → ElevenLabs voice mapping.
 *
 * Each character gets a distinct voice that matches their personality.
 * Uses ElevenLabs pre-made voices from the voice library.
 *
 * Model: eleven_flash_v2_5 (75ms TTFB, optimised for conversational latency)
 */

export const ELEVENLABS_MODEL = "eleven_flash_v2_5";

export interface VoiceMapping {
  voiceId: string;
  voiceName: string;
}

/**
 * Map of character archetype ID → ElevenLabs voice.
 *
 * Voice selections:
 * - Marcus Chen (sceptical-investor): George — authoritative, measured British male
 * - Victoria Hartley-Ross (political-stakeholder): Charlotte — polished, warm British female
 * - Jamie Walker (resistant-report): Charlie — friendly, casual British voice
 * - Richard Ashworth (hostile-negotiator): Liam — deep, commanding British male
 * - Dr. Priya Mehta (alpha-peer): Aria — precise, confident female
 * - Jonathan Ashby (consultancy-gatekeeper): Daniel — refined, Oxbridge-inflected male
 */
export const CHARACTER_VOICE_MAP: Record<string, VoiceMapping> = {
  "sceptical-investor": {
    voiceId: "JBFqnCBsd6RMkjVDRZzb",  // George
    voiceName: "George",
  },
  "political-stakeholder": {
    voiceId: "XB0fDUnXU5powFXDhCwa",  // Charlotte
    voiceName: "Charlotte",
  },
  "resistant-report": {
    voiceId: "IKne3meq5aSn9XLyUdCD",  // Charlie
    voiceName: "Charlie",
  },
  "hostile-negotiator": {
    voiceId: "TX3LPaxmHKxFdv7VOQHJ",  // Liam
    voiceName: "Liam",
  },
  "alpha-peer": {
    voiceId: "9BWtsMINqrJLrRacOk9x",  // Aria
    voiceName: "Aria",
  },
  "consultancy-gatekeeper": {
    voiceId: "onwK4e9ZLuTAKqWW03F9",  // Daniel
    voiceName: "Daniel",
  },
};

/** Default voice when character not found in map */
export const DEFAULT_VOICE: VoiceMapping = {
  voiceId: "onwK4e9ZLuTAKqWW03F9",  // Daniel
  voiceName: "Daniel",
};

export function getVoiceForCharacter(characterId: string): VoiceMapping {
  return CHARACTER_VOICE_MAP[characterId] ?? DEFAULT_VOICE;
}

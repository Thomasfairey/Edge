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
 * All voices are British or British-adjacent. No voice ID is reused.
 *
 * Voice selections:
 * - Marcus Chen (sceptical-investor): George — measured, warm British male narration
 * - Victoria Hartley-Ross (political-stakeholder): Lily — warm, polished British female
 * - Jamie Walker (resistant-report): Archer — friendly, charming young British male
 * - Richard Ashworth (hostile-negotiator): Daniel — authoritative, commanding British male
 * - Dr. Priya Mehta (alpha-peer): Alice — confident, precise British female
 * - Jonathan Ashby (consultancy-gatekeeper): Callum — intense, polished transatlantic male
 */
export const CHARACTER_VOICE_MAP: Record<string, VoiceMapping> = {
  "sceptical-investor": {
    voiceId: "JBFqnCBsd6RMkjVDRZzb",  // George — British, warm, measured
    voiceName: "George",
  },
  "political-stakeholder": {
    voiceId: "pFZP5JQG7iQjIQuC4Bku",  // Lily — British, warm, middle-aged
    voiceName: "Lily",
  },
  "resistant-report": {
    voiceId: "L0Dsvb3SLTyegXwtm47J",  // Archer — British, friendly, charming, thirties
    voiceName: "Archer",
  },
  "hostile-negotiator": {
    voiceId: "onwK4e9ZLuTAKqWW03F9",  // Daniel — British, authoritative, commanding
    voiceName: "Daniel",
  },
  "alpha-peer": {
    voiceId: "Xb7hH8MSUJpSbSDYk0k2",  // Alice — British, confident, precise
    voiceName: "Alice",
  },
  "consultancy-gatekeeper": {
    voiceId: "N2lVS1w4EtoT3dr4eOWO",  // Callum — Transatlantic, polished, intense
    voiceName: "Callum",
  },
};

/** Default voice when character not found in map */
export const DEFAULT_VOICE: VoiceMapping = {
  voiceId: "JBFqnCBsd6RMkjVDRZzb",  // George
  voiceName: "George",
};

export function getVoiceForCharacter(characterId: string): VoiceMapping {
  return CHARACTER_VOICE_MAP[characterId] ?? DEFAULT_VOICE;
}

// Narration voices. Keys must match "voices" in audio.config.json (scripts/generate-audio.mjs renders every clip per voice).
export const VOICES = [
  { id: 'heart', name: 'Heart', blurb: 'Clear · American' },
  { id: 'michael', name: 'Michael', blurb: 'Warm · American' },
] as const;

export type VoiceId = (typeof VOICES)[number]['id'];
export const DEFAULT_VOICE: VoiceId = 'heart';

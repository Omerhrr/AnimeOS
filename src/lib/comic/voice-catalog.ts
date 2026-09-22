// ─────────────────────────────────────────────────────────────
// TTS VOICE CATALOG (shared client + server)
//
// The render API, the sound timeline and the artist roster all pick
// voices from this one list so casting options never drift between
// the UI and the server.
// ─────────────────────────────────────────────────────────────

export interface VoiceOption {
  id: string;
  blurb: string;
}

export const VOICES: VoiceOption[] = [
  { id: "tongtong", blurb: "Warm, gentle" },
  { id: "chuichui", blurb: "Bright, playful" },
  { id: "xiaochen", blurb: "Calm, steady" },
  { id: "jam", blurb: "British, refined" },
  { id: "kazi", blurb: "Clear, neutral" },
  { id: "douji", blurb: "Natural, flowing" },
  { id: "luodo", blurb: "Expressive, resonant" },
];

const VOICE_IDS = new Set(VOICES.map((v) => v.id));

/** True when the value is a concrete voice id from the catalog. */
export function isVoiceId(v: unknown): v is string {
  return typeof v === "string" && VOICE_IDS.has(v);
}

export function voiceById(id: string | null | undefined): VoiceOption {
  return VOICES.find((v) => v.id === id) ?? VOICES[4];
}

/** Deterministic default casting: the same speaker always lands on the same voice. */
export function defaultVoiceFor(speaker: string): string {
  let h = 2166136261;
  for (let i = 0; i < speaker.length; i++) {
    h ^= speaker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return VOICES[(h >>> 0) % VOICES.length].id;
}

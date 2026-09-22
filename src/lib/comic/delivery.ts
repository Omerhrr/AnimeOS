// ─────────────────────────────────────────────────────────────
// CHARACTER-STATE VOICE DELIVERY
//
// A VOICE cue's take is performed in the speaker's current
// character state, not a flat read. The character's episode-
// resolved state label (CharacterState rows, e.g. "Battle-damaged
// (temple fight)") classifies into a delivery profile that bends
// the TTS performance: speed multiplier plus light punctuation
// shaping. Both the live dialog and the server import this module
// so the catalog never drifts between client and API.
// ─────────────────────────────────────────────────────────────

export type DeliveryId = "NEUTRAL" | "EXCITED" | "INJURED";

export interface DeliveryProfile {
  id: DeliveryId;
  label: string;
  blurb: string;
  speedMul: number; // multiplies the base voice speed
}

export const DELIVERIES: DeliveryProfile[] = [
  { id: "NEUTRAL", label: "Neutral", blurb: "Even, composed read", speedMul: 1.0 },
  { id: "EXCITED", label: "Excited", blurb: "Quickened, bright, exclamatory", speedMul: 1.18 },
  { id: "INJURED", label: "Injured", blurb: "Strained, labored, trailing", speedMul: 0.82 },
];

const DELIVERY_BY_ID = new Map(DELIVERIES.map((d) => [d.id, d]));

export function deliveryProfile(id: string | null | undefined): DeliveryProfile {
  return (id && DELIVERY_BY_ID.get(id as DeliveryId)) || DELIVERY_BY_ID.get("NEUTRAL")!;
}

/** True when the value is a concrete delivery id (not AUTO). */
export function isDeliveryId(v: unknown): v is DeliveryId {
  return typeof v === "string" && DELIVERY_BY_ID.has(v as DeliveryId);
}

// Keyword classifier: which delivery a state label implies.
// Ordered: injury beats excitement when both appear.
const INJURED_RE =
  /injur|wound|battle.?damag|hurt|blood|bleed|bruise|broken|fracture|poison|scarred|limp|bandag/i;
const EXCITED_RE =
  /excit|thrill|triumph|elated|ecsta|euphor|furious|rage|wrath|breakthrough|ascend|surge|awakened|empowered|exhilarat/i;

/** Classify a character-state label into a delivery, or null when nothing matches. */
export function classifyStateDelivery(label: string): DeliveryId | null {
  if (!label) return null;
  if (INJURED_RE.test(label)) return "INJURED";
  if (EXCITED_RE.test(label)) return "EXCITED";
  return null;
}

/**
 * Light performance shaping so the TTS read leans into the state:
 * excited lines land on an exclamation, injured lines trail off.
 * Lines with terminal punctuation are left untouched.
 */
export function shapeLineForDelivery(text: string, delivery: DeliveryId): string {
  const t = text.trim();
  if (/[.!?…]$/.test(t)) return t;
  if (delivery === "EXCITED") return `${t}!`;
  if (delivery === "INJURED") return `${t}...`;
  return t;
}

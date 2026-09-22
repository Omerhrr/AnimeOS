import {
  deliveryProfile, isDeliveryId, shapeLineForDelivery,
} from "@/lib/comic/delivery";
import { dialogueDeliveryForCue } from "@/lib/comic/dialogue";
import {
  resolveAutoDelivery, resolveVoiceCast, type ResolvedCast, type ResolvedDelivery,
} from "@/lib/ai/voice-casting";

// ─────────────────────────────────────────────────────────────
// TAKE PLAN (shared by the render API and the direction diff)
//
// One module decides WHAT a voice take will be made of: who speaks
// (per-artist voice casting), how the line is played (delivery
// chain: request override > dialogue-line delivery > cue standing
// direction > episode-resolved character state) and at what speed.
// The same inputs collapse into a compact signature (voiceSig) that
// is stamped on the cue at render time - the per-episode direction
// diff re-resolves the plan and re-renders only takes whose
// signature moved.
// ─────────────────────────────────────────────────────────────

export type DeliverySource = "auto" | "manual" | "direction" | "line";

/** Compact snapshot of the inputs a take was rendered with. */
export interface TakeSig {
  t: string; // speakable text (hashed, case/space normalized)
  v: string; // TTS voice id
  d: string; // delivery profile id
  s: number; // base speed (delivery multiplier excluded)
}

/** 32-bit FNV-1a, base36 - stable across server restarts. */
export function hashText(text: string): string {
  let h = 2166136261;
  const norm = text.trim().toLowerCase();
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function buildTakeSig(text: string, voiceId: string, deliveryId: string, baseSpeed: number): TakeSig {
  return { t: hashText(text), v: voiceId, d: deliveryId, s: Math.round(baseSpeed * 100) / 100 };
}

export function parseTakeSig(raw: string | null | undefined): TakeSig | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TakeSig>;
    if (typeof v.t !== "string" || typeof v.v !== "string" || typeof v.d !== "string") return null;
    return { t: v.t, v: v.v, d: v.d, s: Number.isFinite(Number(v.s)) ? Number(v.s) : 1 };
  } catch {
    return null;
  }
}

/** Fields where a stored take diverges from what a render would do now. */
export function sigChanges(stored: TakeSig, current: TakeSig): string[] {
  const out: string[] = [];
  if (stored.t !== current.t) out.push("text");
  if (stored.v !== current.v) out.push("voice");
  if (stored.d !== current.d) out.push("delivery");
  if (Math.abs(stored.s - current.s) > 0.001) out.push("speed");
  return out;
}

/** Minimal cue shape needed to plan a take (Prisma rows satisfy this). */
export interface TakePlanCue {
  label: string;
  voiceDelivery: string | null;
  voiceSpeed: number | null;
  shot: { dialogue: string | null } | null;
}

export interface TakeOverrides {
  voice?: unknown;
  speed?: unknown;
  delivery?: unknown;
}

export interface TakePlan {
  speaker: string;
  text: string; // speakable text before delivery shaping
  spoken: string; // after shaping (exclamation / trailing read)
  cast: ResolvedCast;
  delivery: ResolvedDelivery & { source: DeliverySource };
  baseSpeed: number;
  speed: number; // effective: base x delivery multiplier
  sig: TakeSig;
}

/** "Speaker: line" split used everywhere a VOICE cue is interpreted. */
export function splitCueLabel(label: string): { speaker: string; text: string } {
  if (label.includes(": ")) {
    const sep = label.indexOf(": ");
    return { speaker: label.slice(0, sep).trim(), text: label.slice(sep + 2).trim() };
  }
  return { speaker: "", text: label.trim() };
}

/**
 * Resolve everything a voice take needs for one cue. Throws
 * VoicePlanError when the cue has no speakable text (the caller maps
 * that to a client error).
 */
export async function resolveTakePlan(
  cue: TakePlanCue,
  projectId: string,
  episodeNumber: number | null,
  overrides: TakeOverrides = {},
): Promise<TakePlan> {
  const { speaker, text } = splitCueLabel(cue.label);
  if (!text) throw new VoicePlanError("Cue label has no speakable text");
  if (text.length > 1024) throw new VoicePlanError(`Line is ${text.length} chars, TTS accepts up to 1024`);

  // WHO speaks: request override > cast artist on the character > hash default
  const cast = await resolveVoiceCast(speaker, projectId, overrides.voice);

  // HOW it is played: the delivery chain, most specific first
  let delivery: ResolvedDelivery & { source: DeliverySource };
  if (isDeliveryId(overrides.delivery)) {
    delivery = { id: overrides.delivery, source: "manual", stateLabel: null };
  } else {
    // line-level direction inside the shot outranks scene-level standing direction
    const lineDelivery = dialogueDeliveryForCue(cue.shot?.dialogue ?? null, cue.label);
    if (lineDelivery) {
      delivery = { id: lineDelivery, source: "line", stateLabel: null };
    } else if (isDeliveryId(cue.voiceDelivery)) {
      // a pinned standing direction is its own source: no state attribution
      delivery = { id: cue.voiceDelivery, source: "direction", stateLabel: null };
    } else {
      delivery = await resolveAutoDelivery(speaker, episodeNumber, projectId);
    }
  }
  const profile = deliveryProfile(delivery.id);

  // the delivery bends the performance; the plan keeps the user's base
  // speed so re-renders never compound the multiplier
  const speedNum = Number(overrides.speed);
  const baseSpeed = Number.isFinite(speedNum) ? Math.min(2, Math.max(0.5, speedNum)) : Math.min(2, Math.max(0.5, cue.voiceSpeed ?? 1));
  const speed = Math.min(2, Math.max(0.5, Math.round(baseSpeed * profile.speedMul * 100) / 100));

  return {
    speaker,
    text,
    spoken: shapeLineForDelivery(text, profile.id),
    cast,
    delivery,
    baseSpeed,
    speed,
    sig: buildTakeSig(text, cast.voiceId, profile.id, baseSpeed),
  };
}

export class VoicePlanError extends Error {}

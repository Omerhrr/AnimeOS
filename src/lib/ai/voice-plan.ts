import {
  deliveryProfile, isDeliveryId, shapeLineForDelivery,
} from "@/lib/comic/delivery";
import { dialogueDeliveryForCue } from "@/lib/comic/dialogue";
import { isVoiceId } from "@/lib/comic/voice-catalog";
import {
  resolveStatePerformance, resolveVoiceCast,
  type ResolvedCast, type ResolvedDelivery, type ResolvedHints, type ResolvedVariant,
} from "@/lib/ai/voice-casting";

// ─────────────────────────────────────────────────────────────
// TAKE PLAN (shared by the render API and the direction diff)
//
// One module decides WHAT a voice take will be made of: who speaks
// (per-artist voice casting), how the line is played (delivery
// chain: request override > dialogue-line delivery > cue standing
// direction > episode-resolved character state) and at what pace and
// pitch (state speed/pitch hints bend both). The same inputs collapse
// into a compact signature (voiceSig) that is stamped on the cue at
// render time - the per-episode direction diff re-resolves the plan
// and re-renders only takes whose signature moved.
// ─────────────────────────────────────────────────────────────

export type DeliverySource = "auto" | "manual" | "direction" | "line";

/** Compact snapshot of the inputs a take was rendered with. */
export interface TakeSig {
  t: string; // speakable text (hashed, case/space normalized)
  v: string; // TTS voice id
  d: string; // delivery profile id
  s: number; // base speed (delivery + state hint multipliers excluded)
  sh: number; // state speed hint multiplier (1 = none)
  p: number; // state pitch factor (1 = natural pitch)
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

export function buildTakeSig(
  text: string,
  voiceId: string,
  deliveryId: string,
  baseSpeed: number,
  speedHint = 1,
  pitch = 1,
): TakeSig {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { t: hashText(text), v: voiceId, d: deliveryId, s: r2(baseSpeed), sh: r2(speedHint), p: r2(pitch) };
}

export function parseTakeSig(raw: string | null | undefined): TakeSig | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TakeSig>;
    if (typeof v.t !== "string" || typeof v.v !== "string" || typeof v.d !== "string") return null;
    // sh/p default to 1 so takes stamped before the hint fields existed
    // only diff once a hint is actually active on their state
    return {
      t: v.t,
      v: v.v,
      d: v.d,
      s: Number.isFinite(Number(v.s)) ? Number(v.s) : 1,
      sh: Number.isFinite(Number(v.sh)) ? Number(v.sh) : 1,
      p: Number.isFinite(Number(v.p)) ? Number(v.p) : 1,
    };
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
  if (Math.abs((stored.sh ?? 1) - current.sh) > 0.001) out.push("speedHint");
  if (Math.abs((stored.p ?? 1) - current.p) > 0.001) out.push("pitch");
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
  variant: ResolvedVariant | null; // state voice variant overriding the cast voice for this line
  hints: ResolvedHints | null; // state speed/pitch hints bending the performance
  voiceId: string; // effective voice: variant when active, else the cast voice
  delivery: ResolvedDelivery & { source: DeliverySource };
  baseSpeed: number;
  speed: number; // effective: base x delivery multiplier x state speed hint
  pitch: number; // effective pitch factor (1 = natural pitch)
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

  // state performance: delivery + voice variant from the speaker's
  // episode-resolved states (one lookup for both)
  const performance = await resolveStatePerformance(speaker, episodeNumber, projectId);
  // an explicit request override performs with the requested voice; a
  // state variant otherwise outranks the cast voice while it is effective
  const variant = isVoiceId(overrides.voice) ? null : performance.variant;
  const voiceId = variant?.voiceId ?? cast.voiceId;

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
      delivery = performance.delivery;
    }
  }
  const profile = deliveryProfile(delivery.id);

  // the delivery and the state speed hint bend the performance; the
  // plan keeps the user's base speed so re-renders never compound
  // multipliers into the stored base
  const speedNum = Number(overrides.speed);
  const baseSpeed = Number.isFinite(speedNum) ? Math.min(2, Math.max(0.5, speedNum)) : Math.min(2, Math.max(0.5, cue.voiceSpeed ?? 1));
  const hintSpeed = performance.hints?.speed ?? 1;
  const speed = Math.min(2, Math.max(0.5, Math.round(baseSpeed * profile.speedMul * hintSpeed * 100) / 100));
  const pitch = performance.hints?.pitch ?? 1;

  return {
    speaker,
    text,
    spoken: shapeLineForDelivery(text, profile.id),
    cast,
    variant,
    hints: performance.hints,
    voiceId,
    delivery,
    baseSpeed,
    speed,
    pitch,
    sig: buildTakeSig(text, voiceId, profile.id, baseSpeed, hintSpeed, pitch),
  };
}

export class VoicePlanError extends Error {}

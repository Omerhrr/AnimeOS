/**
 * expressions - THE FACE PERFORMS THE BEAT (iteration 84, Layer A).
 *
 * The measured cast gap survived the palette AND the silhouette AND
 * the sculpt AND the grade because the FACE never performed: the
 * brows drifted, the eyes blinked, the mouth opened - but the face
 * itself held one neutral mask from the first frame to the last, and
 * the vision model's own notes kept reading the proxy as a mannequin.
 * A face that cannot perform cannot act.
 *
 * This module is the EXPRESSION LIBRARY: eight code-authored
 * expression clips (the Layer A plan's "expression clips in code" -
 * emotion label -> bounded channel combination + timing curve), and
 * the compiler that picks one from the SHOT'S OWN DRAMA: the shot
 * description's verbs ("roars", "smiles", "tears", "gasp") and the
 * pose pair the director staged. No new database column, no new tool
 * - the drama already lives on the shot; the library reads it.
 *
 * Laws of the module:
 *  - bounded: every library value lands inside EXPRESSION_BOUNDS;
 *    a wild clip is clamped on BOTH sides of the wire (the worker
 *    re-clamps against the same bounds - one law, two runtimes);
 *  - CALM is the alive baseline: at envelope zero the face is never
 *    dead - it keeps the barely-there cheek and corner lift that
 *    separates a living face from a mannequin's mask (the sheet's
 *    canonical face is calm, so identity stays honest);
 *  - performed, never painted: the clip RIDES the pose channels
 *    (brow/eye/mouth compose additively with POSE_FACE) and drives
 *    four head-mesh shape keys (browKnit, cheekRaise, mouthCorner,
 *    jawOpen) - mesh moves, the rig anchors stay;
 *  - timed like a performance: attack (ease into the emotion),
 *    hold, release (ease back to calm) - deterministic per frame;
 *  - identity honest: a derived clip carries intensity 0.6 (a
 *    performed read, not a mask) - the sheet's neutral likeness is
 *    never overwritten by a scowl the shot never asked for.
 */

import { createHash } from "node:crypto";

// ── the library ──

export type ExpressionEmotion =
  | "calm"
  | "alert"
  | "resolve"
  | "anger"
  | "grief"
  | "joy"
  | "fear"
  | "surprise";

export const EXPRESSION_EMOTIONS: readonly ExpressionEmotion[] = [
  "calm", "alert", "resolve", "anger", "grief", "joy", "fear", "surprise",
];

/**
 * One expression's bounded pose: the three RIG channel deltas
 * (brow in library units - the worker scales by 14 degrees, + =
 * inner ends up; squint lowers the lids multiplicatively; mouthFloor
 * is the openness floor) plus the four HEAD SHAPE KEY weights
 * (knit/cheek/corner/jaw - corner is signed: + up, - down).
 */
export interface ExpressionPose {
  brow: number; // -1..1 (+ = inner brow up)
  squint: number; // 0..1 (lid lowering)
  mouthFloor: number; // 0..1 (openness floor)
  knit: number; // 0..1 (browKnit shape key)
  cheek: number; // 0..1 (cheekRaise shape key)
  corner: number; // -1..1 (mouthCorner shape key, + = up)
  jaw: number; // 0..1 (jawOpen shape key)
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const EXPRESSION_BOUNDS: Record<keyof ExpressionPose, [number, number]> = {
  brow: [-1, 1],
  squint: [0, 1],
  mouthFloor: [0, 1],
  knit: [0, 1],
  cheek: [0, 1],
  corner: [-1, 1],
  jaw: [0, 1],
};

/** The four head-mesh shape keys the worker sculpts (fixed names). */
export const EXPRESSION_SHAPES: readonly string[] = [
  "browKnit", "cheekRaise", "mouthCorner", "jawOpen",
];

/**
 * CALM - the alive baseline every frame returns to. Never all
 * zeros: the barely-there lift keeps the face off the mannequin's
 * mask while staying sheet-true (the canonical sheet is calm).
 */
export const EXPRESSION_CALM: ExpressionPose = {
  brow: 0,
  squint: 0.06,
  mouthFloor: 0,
  knit: 0,
  cheek: 0.1,
  corner: 0.08,
  jaw: 0,
};

/**
 * The library: eight emotions a donghua beat actually calls for,
 * authored in code (the Layer A expression-clip law). anger knits
 * the brow and pulls the corners down; joy lifts cheeks and
 * corners; grief keeps the inner brow up while the corners fall;
 * surprise drops the jaw; resolve is the cultivator's still fury.
 */
export const EXPRESSION_LIBRARY: Record<ExpressionEmotion, ExpressionPose> = {
  calm: EXPRESSION_CALM,
  alert: { brow: 0.35, squint: 0.0, mouthFloor: 0.05, knit: 0.0, cheek: 0.08, corner: 0.0, jaw: 0.05 },
  resolve: { brow: -0.3, squint: 0.3, mouthFloor: 0.1, knit: 0.35, cheek: 0.05, corner: -0.12, jaw: 0.05 },
  anger: { brow: -0.7, squint: 0.45, mouthFloor: 0.25, knit: 0.7, cheek: 0.0, corner: -0.5, jaw: 0.12 },
  grief: { brow: 0.45, squint: 0.35, mouthFloor: 0.1, knit: 0.3, cheek: 0.0, corner: -0.55, jaw: 0.05 },
  joy: { brow: 0.1, squint: 0.3, mouthFloor: 0.2, knit: 0.0, cheek: 0.6, corner: 0.7, jaw: 0.1 },
  fear: { brow: 0.55, squint: 0.0, mouthFloor: 0.15, knit: 0.15, cheek: 0.0, corner: -0.3, jaw: 0.25 },
  surprise: { brow: 0.8, squint: 0.0, mouthFloor: 0.3, knit: 0.0, cheek: 0.1, corner: 0.05, jaw: 0.35 },
};

// ── the clip: emotion + intensity + timing ──

export interface ExpressionClip {
  emotion: ExpressionEmotion;
  intensity: number; // 0..1 (derived clips carry 0.6 - performed, not a mask)
  attackMs: number; // ease into the emotion
  releaseMs: number; // ease back to calm
  derived: boolean; // true = read from the shot's own drama
  source: string; // the word / pose hint that named the emotion
}

export const EXPRESSION_DERIVED_INTENSITY = 0.6;
export const EXPRESSION_ATTACK_DEFAULT = 240;
export const EXPRESSION_RELEASE_DEFAULT = 480;
/** The timing bounds the worker re-clamps against (one law). */
export const EXPRESSION_TIMING_BOUNDS: Record<"attackMs" | "releaseMs", [number, number]> = {
  attackMs: [120, 800],
  releaseMs: [200, 1200],
};

function clampCh(key: keyof ExpressionPose, v: number): number {
  const [lo, hi] = EXPRESSION_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
}

function clampMs(key: "attackMs" | "releaseMs", v: number): number {
  const [lo, hi] = EXPRESSION_TIMING_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)));
}

// ── THE DRAMA IS ALREADY ON THE SHOT (pure derivation) ──
//
// The description's verbs name the emotion; the staged pose pair
// hints when the description is quiet. The scan mirrors
// parseSilhouetteShape's word law: lowercased substring matching,
// first hit wins in the table's order (the sharper emotion reads
// first), silence lands calm.

const EMOTION_WORDS: Array<[ExpressionEmotion, string[]]> = [
  ["anger", ["roar", "snarl", "fury", "furious", "rage", "wrath", "glares", "scowl", "snaps", "anger"]],
  ["grief", ["grief", "tears", "weep", "mourn", "sorrow", "sob", "mourning"]],
  ["joy", ["smile", "laugh", "grin", "delight", "joy", "beams"]],
  ["surprise", ["shock", "stunned", "gasp", "astonish", "startle", "disbelief"]],
  ["fear", ["fear", "dread", "terror", "tremble", "flinch"]],
  ["resolve", ["resolve", "determination", "steels", "vow", "oath", "draws", "unsheathes"]],
  ["alert", ["wary", "alert", "senses", "listens", "watches"]],
];

/** The pose pair's hints (the director's staging speaks too). */
const EMOTION_POSES: Array<[ExpressionEmotion, string[]]> = [
  ["fear", ["FALL"]],
  ["resolve", ["LUNGE", "SLASH", "BLOCK", "DRAW", "CAST"]],
];

/**
 * THE FACE PERFORMS THE BEAT (pure): derive the shot's expression
 * clip from the shot's own drama - the description's verbs first,
 * the pose pair's staging second, calm when the shot is quiet.
 * Deterministic: the same shot always lands the same clip.
 */
export function deriveExpression(
  description: string | null | undefined,
  poseStart: string | null | undefined,
  poseEnd: string | null | undefined,
): ExpressionClip {
  const note = (description ?? "").toLowerCase();
  for (const [emotion, words] of EMOTION_WORDS) {
    for (const w of words) {
      if (note.includes(w)) {
        return {
          emotion,
          intensity: EXPRESSION_DERIVED_INTENSITY,
          attackMs: EXPRESSION_ATTACK_DEFAULT,
          releaseMs: EXPRESSION_RELEASE_DEFAULT,
          derived: true,
          source: `word: ${w}`,
        };
      }
    }
  }
  for (const [emotion, poses] of EMOTION_POSES) {
    for (const p of poses) {
      if ((poseStart ?? "").toUpperCase().includes(p) || (poseEnd ?? "").toUpperCase().includes(p)) {
        return {
          emotion,
          intensity: EXPRESSION_DERIVED_INTENSITY,
          attackMs: EXPRESSION_ATTACK_DEFAULT,
          releaseMs: EXPRESSION_RELEASE_DEFAULT,
          derived: true,
          source: `pose: ${p.toLowerCase()}`,
        };
      }
    }
  }
  return {
    emotion: "calm",
    intensity: EXPRESSION_DERIVED_INTENSITY,
    attackMs: EXPRESSION_ATTACK_DEFAULT,
    releaseMs: EXPRESSION_RELEASE_DEFAULT,
    derived: true,
    source: "quiet shot",
  };
}

/**
 * Compile the clip the payload rides (pure): the derived law above,
 * with an explicit override (a future direction column) winning when
 * it carries a known emotion. Timing is clamped on both sides; a
 * wild intensity clamps into 0..1.
 */
export function parseExpressionClip(
  description: string | null | undefined,
  poseStart: string | null | undefined,
  poseEnd: string | null | undefined,
  explicit?: { emotion?: unknown; intensity?: unknown } | null,
): ExpressionClip {
  const clip = deriveExpression(description, poseStart, poseEnd);
  if (explicit && typeof explicit.emotion === "string") {
    const named = explicit.emotion.trim().toLowerCase();
    if ((EXPRESSION_EMOTIONS as readonly string[]).includes(named)) {
      const intensity = typeof explicit.intensity === "number" && Number.isFinite(explicit.intensity)
        ? Math.round(Math.min(1, Math.max(0, explicit.intensity)) * 1000) / 1000
        : clip.intensity;
      return { ...clip, emotion: named as ExpressionEmotion, intensity, derived: false, source: "directed" };
    }
  }
  return clip;
}

// ── the timing curve (pure, deterministic per frame) ──

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** The performance envelope at tSec: 0 -> 1 through the attack,
 * hold, 1 -> 0 through the release. A clip shorter than its own
 * timing degrades to a full hold (a beat always performs). */
export function expressionEnvelope(clip: ExpressionClip, tSec: number, durationSec: number): number {
  const dur = Math.max(0.1, durationSec);
  const t = Math.min(Math.max(0, tSec), dur);
  const attack = clip.attackMs / 1000;
  const release = clip.releaseMs / 1000;
  if (attack + release >= dur) {
    // the timing does not fit the beat: ease in over the first
    // third, hold, ease out over the last third
    const third = dur / 3;
    if (t < third) return easeInOutCubic(t / third);
    if (t > dur - third) return easeInOutCubic((dur - t) / third);
    return 1;
  }
  if (t < attack) return easeInOutCubic(t / attack);
  if (t > dur - release) return easeInOutCubic(Math.max(0, (dur - t) / release));
  return 1;
}

/** The full blended weights at tSec: calm at envelope zero, the
 * library pose scaled by intensity at envelope one. Every channel
 * lands inside the bounds. */
export function expressionAt(clip: ExpressionClip, tSec: number, durationSec: number): ExpressionPose {
  const env = expressionEnvelope(clip, tSec, durationSec);
  const target = EXPRESSION_LIBRARY[clip.emotion] ?? EXPRESSION_CALM;
  const mix = (k: keyof ExpressionPose): number =>
    clampCh(k, EXPRESSION_CALM[k] * (1 - env) + target[k] * clip.intensity * env);
  return {
    brow: mix("brow"),
    squint: mix("squint"),
    mouthFloor: mix("mouthFloor"),
    knit: mix("knit"),
    cheek: mix("cheek"),
    corner: mix("corner"),
    jaw: mix("jaw"),
  };
}

// ── the evidence (deterministic, mirrored in the worker) ──

/**
 * The clip's DETERMINISTIC hash (16 hex) - the same formula the
 * worker runs (f"{...}" formatting mirrored), so a render state's
 * hash can be proven against the TS law. Bump the version when the
 * library's shapes change meaning.
 */
export function expressionHash(clip: {
  emotion: string;
  intensity: number;
  attackMs: number;
  releaseMs: number;
}): string {
  const spec = `84|${clip.emotion}|${clip.intensity.toFixed(3)}|${clip.attackMs}|${clip.releaseMs}|v1`;
  // sha256 over the spec, first 16 hex - identical to Python's
  // hashlib.sha256(spec.encode()).hexdigest()[:16]
  return createHash("sha256").update(spec, "utf8").digest("hex").slice(0, 16);
}

/** The evidence block the render state names (pure). */
export function expressionEvidence(clip: ExpressionClip, durationSec: number): {
  emotion: ExpressionEmotion;
  intensity: number;
  attackMs: number;
  releaseMs: number;
  derived: boolean;
  source: string;
  shapes: readonly string[];
  samples: Array<{ at: number; weights: ExpressionPose }>;
  hash: string;
} {
  const stamps = [0.22, 0.4, 0.62].map((f) => Math.round(durationSec * f * 1000) / 1000);
  return {
    emotion: clip.emotion,
    intensity: clip.intensity,
    attackMs: clip.attackMs,
    releaseMs: clip.releaseMs,
    derived: clip.derived,
    source: clip.source,
    shapes: EXPRESSION_SHAPES,
    samples: stamps.map((at) => ({ at, weights: expressionAt(clip, at, durationSec) })),
    hash: expressionHash(clip),
  };
}

/** One honest line for logs/events. */
export function expressionLine(clip: ExpressionClip): string {
  if (clip.emotion === "calm" && !clip.derived) return "performs: calm (directed)";
  return `performs: ${clip.emotion} @ ${clip.intensity.toFixed(2)} (attack ${clip.attackMs}ms, release ${clip.releaseMs}ms; ${clip.derived ? `read from the shot's own drama - ${clip.source}` : "directed"})`;
}

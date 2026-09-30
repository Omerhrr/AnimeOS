/**
 * wrinkle - THE FACE CREASES WHEN IT ACTS (iteration 93, Layer A -
 * the wrinkle-map slice the ledger named last of the Layer A rest).
 *
 * Iteration 90 carved the head at depth, 91 made the skin alive, 92
 * made the mouth speak in the mesh - and the expression program
 * still deformed the carved mesh SHADING-BLIND: the furrow the brow
 * knit digs, the fold the cheek raise lifts, the pull the mouth
 * corner drags exist only as deep-mesh geometry the light heads
 * cannot resolve. A scowl performed on a light head reads smooth
 * exactly where a face should crease.
 *
 * This module is the WRINKLE LAW, the expression edition of the
 * carve's own bake law (sculpt deep, bake down, render light):
 *   - at the hero build, each WRINKLE-BEARING expression shape is
 *     evaluated at full weight on BOTH the deep carve and the light
 *     proxy (the large move cancels between the two surfaces; what
 *     remains is exactly the shading detail the light mesh loses -
 *     the crease, not the bone move), and baked selected-to-active
 *     through the same spherical UVs into a tangent-space NORMAL map
 *     per shape, cached beside the carve's bake;
 *   - every level below WEARS the set into the same graded tree -
 *     each wrinkle normal through its own Normal Map node whose
 *     Strength is DRIVEN LIVE by the shape's expression weight every
 *     frame (the furrow deepens as the scowl deepens, rests when the
 *     face rests);
 *   - the corner map wears by the ABSOLUTE weight - both the smile's
 *     and the frown's pull crease the same masses at this stylization;
 *   - jawOpen earns NO map (a bone move the shape key already carries
 *     at every resolution - named, not forgotten);
 *   - the hero renders the creases as real geometry (no double
 *     count) - a level without the cached set renders unwrinkled,
 *     honestly named.
 *
 * Laws of the module:
 *  - deterministic: the same face profile always lands the same
 *    wrinkle key (wrinkleKeyHash mirrors the worker bit-exactly -
 *    one law, two runtimes);
 *  - bounded: the live strength is the base strength scaled by the
 *    clamped weight, never wild;
 *  - honest: a missing map is a rest, never a faked crease.
 */

import { createHash } from "node:crypto";

// ── the set ──

/** The three expression shapes that earn a wrinkle map (fixed names,
 * the worker's sculpt order). jawOpen is EXCLUDED - a bone move, not
 * a skin crease. */
export const WRINKLE_SHAPES = ["browKnit", "cheekRaise", "mouthCorner"] as const;

export type WrinkleShape = (typeof WRINKLE_SHAPES)[number];

/** The base strength the live weight scales (mirrors the worker). */
export const WRINKLE_STRENGTH = 0.85;

/** The bounds the driven Strength never leaves (mirrors the worker). */
export const WRINKLE_STRENGTH_BOUNDS: [number, number] = [0.0, 1.2];

/** The bake weight - the set bakes at FULL expression (the crease at
 * its deepest; the live weight scales the wear, never the bake). */
export const WRINKLE_BAKE_WEIGHT = 1.0;

/**
 * The driven strength for a live shape weight: the base strength
 * scaled by the clamped absolute weight (the corner map wears by
 * |weight| - both the smile's and the frown's pull). Mirrored in the
 * worker's wrinkle_strength_for.
 */
export function wrinkleStrengthFor(weight: number): number {
  const w = Number.isFinite(weight) ? Math.min(1, Math.max(-1, weight)) : 0;
  const s = WRINKLE_STRENGTH * Math.abs(w);
  return Math.min(WRINKLE_STRENGTH_BOUNDS[1], Math.max(WRINKLE_STRENGTH_BOUNDS[0], s));
}

// ── the key ──

/** The face profile factors the wrinkle key hashes (the carve's own
 * inputs - the creases belong to the same face the carve dug). */
export interface WrinkleKeySource {
  jawTaper: number;
  chinFwd: number;
  browFwd: number;
  cheekOut: number;
  noseLen: number;
}

/**
 * The DETERMINISTIC wrinkle key - sha256-16 over the face profile's
 * own factors, versioned 93 (the carve's 90-key stays the carve's;
 * the caches are independent sets over the same face). Mirrored
 * bit-exactly in the worker (head_bake.wrinkle_key).
 */
export function wrinkleKeyHash(f: WrinkleKeySource): string {
  const key = `93|${f.jawTaper.toFixed(3)}|${f.chinFwd.toFixed(3)}|${f.browFwd.toFixed(3)}|${f.cheekOut.toFixed(3)}|${f.noseLen.toFixed(3)}|v1`;
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

// ── the evidence ──

/** The baked/worn wrinkle set as the render state names it. */
export interface WrinkleEvidence {
  worn: boolean; // the set spliced into the render tree
  baked: boolean; // the set written by THIS build (the hero only)
  key: string;
  shapes: readonly string[];
  strength: number; // the base strength the live weights scale
  fingerprints?: Record<string, string>; // per-shape sha256-16 (the baked set)
  note?: string; // the honest skip when the set is absent
}

/**
 * The wrinkle set as one ledger line (the render state reports it).
 */
export function wrinkleLine(e: WrinkleEvidence): string {
  if (!e.worn && !e.baked) {
    return `expression wrinkles: unwrinkled (${e.note ?? "no cached set"})`;
  }
  const how = e.baked ? "baked down" : "worn";
  return `expression wrinkles: ${how} (${e.shapes.length} maps, key ${e.key}, strength ${e.strength.toFixed(2)} driven by the live weights)`;
}

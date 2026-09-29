/**
 * skin-depth - THE SKIN IS ALIVE (iteration 91, Layer A - the surface
 * depth slice the Layer A remainder named).
 *
 * Iteration 90 carved the head at depth (the geometry slice); the
 * closeup's identity readings stayed at the floor because the largest
 * closeup surface - the SKIN - still reads as CG PLASTIC: the graded
 * tree (iteration 83) carries a flat 0.14 token subsurface and no
 * top layer, so light bounces off the face like lacquered resin
 * instead of scattering through it. Real skin is a LAYERED medium:
 * light enters, scatters red furthest (the hemoglobin), and leaves
 * softened - pale skin shows the bleed at the ears and the nose
 * rims, deep skin keeps it tight and warm - and the T-zone carries
 * an oily top sheen over the diffusion.
 *
 * This module derives the bounded SKIN DEPTH from the sheet read's
 * OWN skinTone hex (the same dye decision the grade already carries,
 * now expressed in the skin's physics): the hex's luminance sets the
 * SUBSURFACE weight and the scatter scale (pale bleeds visibly, deep
 * stays tight), the red surplus warms the radius triplet's reach,
 * and the saturation drives the COAT pair (a vivid stylized dye is a
 * younger, glossier read; a washed one is matte). The worker grades
 * the skin tree with it - subsurface beneath, the carve's baked
 * normal above - and names the evidence, hash-proven.
 *
 * Laws of the module:
 *  - bounded: every factor lands inside SKIN_DEPTH_BOUNDS; the
 *    worker re-clamps against the same bounds on BOTH sides of the
 *    wire (one law, two runtimes);
 *  - honest: `fields` names ONLY what the hex itself described (the
 *    pale end, the tight end, the warm radius, the porcelain coat);
 *  - deterministic: the same hex always lands the same depth,
 *    hash-proven (skinDepthHash mirrors the worker bit-exactly);
 *  - framing-INDEPENDENT: the skin answers the BODY, not the lens -
 *    unlike the carve and the groom LOD, every framing of a face
 *    carries the same depth (the wide shot's skin is the same skin).
 */

import { createHash } from "node:crypto";

// ── the depth ──

export interface SkinDepth {
  weight: number; // 0.1..0.55 - the subsurface weight (pale = high)
  radius: number; // 0.55..1.25 - the radius triplet's reach (red furthest)
  scale: number; // 0.3..0.7 - the scatter scale multiplier
  coat: number; // 0.04..0.22 - the T-zone coat layer weight
  coatRough: number; // 0.22..0.6 - the coat's highlight spread
  fields: string[]; // the traits the hex itself described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const SKIN_DEPTH_BOUNDS: Record<Exclude<keyof SkinDepth, "fields">, [number, number]> = {
  weight: [0.1, 0.55],
  radius: [0.55, 1.25],
  scale: [0.3, 0.7],
  coat: [0.04, 0.22],
  coatRough: [0.22, 0.6],
};

/** The house defaults (a missing hex keeps the neutral mid-dye depth). */
export const SKIN_DEPTH_BASE: Omit<SkinDepth, "fields"> = {
  weight: 0.38,
  radius: 1.0,
  scale: 0.5,
  coat: 0.1,
  coatRough: 0.38,
};

export interface SkinDepthSource {
  skinTone?: string | null;
}

const clampB = (key: Exclude<keyof SkinDepth, "fields">, v: number): number => {
  const [lo, hi] = SKIN_DEPTH_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
};

function parseHex(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * THE SKIN IS ALIVE (pure): derive the bounded depth from the sheet's
 * own skinTone hex. The luminance sets the subsurface weight and the
 * scatter scale (pale skin bleeds visibly, deep skin stays tight),
 * the red surplus widens the radius triplet's warm reach, and the
 * saturation drives the coat pair (vivid dye = the glossier, younger
 * sheen; washed dye = matte). `fields` names ONLY what the hex
 * described. Deterministic: the same hex always lands the same depth.
 */
export function parseSkinDepth(src: SkinDepthSource): SkinDepth {
  const s: SkinDepth = { ...SKIN_DEPTH_BASE, fields: [] };
  const hex = parseHex(src.skinTone);
  if (!hex) return s;
  const { r, g, b } = hex;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  const redBias = Math.max(0, (r - (g + b) / 2) / 0.5);
  // the subsurface: pale skin bleeds visibly, deep skin stays tight
  s.weight = clampB("weight", 0.16 + (lum - 0.35) * 0.5);
  // the radius triplet's reach: the red surplus warms the scatter
  s.radius = clampB("radius", 0.62 + (lum - 0.5) * 0.55 + redBias * 0.3);
  // the scatter scale rides the same luminance law
  s.scale = clampB("scale", 0.32 + (lum - 0.5) * 0.42);
  // the coat pair: a vivid stylized dye glosses, a washed one mattes
  s.coat = clampB("coat", 0.04 + sat * 0.16);
  s.coatRough = clampB("coatRough", 0.55 - sat * 0.28);
  // the fields name what the hex described
  if (s.weight >= 0.42) s.fields.push("pale bleed");
  if (s.weight <= 0.24) s.fields.push("tight bleed");
  if (redBias >= 0.2) s.fields.push("warm radius");
  if (s.coat >= 0.17) s.fields.push("porcelain coat");
  return s;
}

/** The depth as one ledger line (the render state reports it). */
export function skinDepthLine(s: SkinDepth): string {
  const from = s.fields.length > 0 ? `named by the hex: ${s.fields.join(", ")}` : "the hex's own read";
  return `skin depth: sss ${s.weight.toFixed(2)}, radius ${s.radius.toFixed(2)}, scale ${s.scale.toFixed(2)}, coat ${s.coat.toFixed(2)} @ ${s.coatRough.toFixed(2)} (${from})`;
}

/** The DETERMINISTIC skin-depth hash - mirrored bit-exactly in the worker. */
export function skinDepthHash(s: SkinDepth): string {
  const key = `91|${s.weight.toFixed(3)}|${s.radius.toFixed(3)}|${s.scale.toFixed(3)}|${s.coat.toFixed(3)}|${s.coatRough.toFixed(3)}|v1`;
  // sha256 over the key, first 16 hex - identical to Python's
  // hashlib.sha256(key.encode()).hexdigest()[:16]
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

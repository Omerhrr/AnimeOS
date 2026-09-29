/**
 * hair-shade - THE HAIR SHADES LIKE HAIR (iteration 89, the deeper
 * groom pass / true curve hair).
 *
 * The groom (iteration 85) grows guide-fitted STRANDS - mesh tubes
 * under DIRECTION - and the surface grade (iteration 58) dyes them
 * with the sheet's own hexes through a roughness + glint tree. That
 * is cloth logic on hair: a tube shaded like fabric still reads as
 * fabric. Real hair shades like HAIR - light tunnels the strand,
 * the dye sits in the cortex, and the color the eye reads is
 * ABSORPTION: melanin concentration + the pheomelanin redness, not
 * a base-color albedo. And the strands themselves read best as TRUE
 * CURVES - the film-standard representation the hair BSDF was built
 * for - while wide framings keep the cheap mesh cards.
 *
 * This module derives the bounded HAIR SHADE from the sheet read's
 * OWN hairColor hex (the same dye decision the grade already carries,
 * now expressed in the hair physics): the hex's luminance sets the
 * MELANIN concentration (dark dye = high melanin), its red surplus
 * sets the PHEOMELANIN redness (auburn warms, raven stays cold), and
 * the roughness pair follows the melanin (dark hair glosses, pale
 * hair dulls). The worker grows the TRUE CURVE strands under the
 * same groom direction, shades them with the Principled Hair BSDF
 * from this profile, and names the evidence - hash-proven.
 *
 * Laws of the module:
 *  - bounded: every factor lands inside HAIR_SHADE_BOUNDS; the
 *    worker re-clamps against the same bounds on BOTH sides of the
 *    wire (one law, two runtimes);
 *  - honest: `fields` names ONLY what the hex itself described (the
 *    dark end, the red end, the pale end);
 *  - deterministic: the same hex always lands the same shade,
 *    hash-proven (hairShadeHash mirrors the worker bit-exactly).
 */

import { createHash } from "node:crypto";

// ── the shade ──

export interface HairShade {
  melanin: number; // 0..1 - the dye concentration (dark = high)
  redness: number; // 0..1 - the pheomelanin shift (auburn = high)
  radial: number; // 0..1 - the radial roughness (the cuticle spread)
  longitudinal: number; // 0..1 - the longitudinal roughness (along the strand)
  fields: string[]; // the traits the hex itself described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const HAIR_SHADE_BOUNDS: Record<Exclude<keyof HairShade, "fields">, [number, number]> = {
  melanin: [0, 1],
  redness: [0, 1],
  radial: [0.1, 0.7],
  longitudinal: [0.1, 0.7],
};

/** The house defaults (a missing hex keeps a neutral mid-brown dye). */
export const HAIR_SHADE_BASE: Omit<HairShade, "fields"> = {
  melanin: 0.65,
  redness: 0.12,
  radial: 0.34,
  longitudinal: 0.44,
};

export interface HairShadeSource {
  hairColor?: string | null;
}

const round3 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

function parseHex(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * THE HAIR SHADES LIKE HAIR (pure): derive the bounded shade from the
 * sheet's own hairColor hex. The luminance sets the melanin (dark =
 * high), the red surplus sets the pheomelanin redness, the roughness
 * pair follows the melanin (dark glosses, pale dulls). `fields` names
 * ONLY what the hex described. Deterministic: the same hex always
 * lands the same shade.
 */
export function parseHairShade(src: HairShadeSource): HairShade {
  const s: HairShade = { ...HAIR_SHADE_BASE, fields: [] };
  const hex = parseHex(src.hairColor);
  if (!hex) return s;
  const { r, g, b } = hex;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // the melanin: dark dye = high concentration (the luminance carries it)
  s.melanin = round3(1.0 - lum * 1.15);
  // the pheomelanin: the red surplus over the cool channels
  s.redness = round3(Math.max(0, (r - (g + b) / 2) / 0.5));
  // the roughness pair follows the dye (dark hair glosses, pale dulls)
  s.radial = round3(0.5 - 0.24 * s.melanin + 0.08 * s.redness);
  s.longitudinal = round3(0.52 - 0.18 * s.melanin + 0.06 * s.redness);
  // the fields name what the hex described
  if (s.melanin > 0.72) s.fields.push("dark dye");
  else if (s.melanin < 0.3) s.fields.push("pale dye");
  if (s.redness > 0.25) s.fields.push("warm red");
  // clamp the law
  s.melanin = Math.min(HAIR_SHADE_BOUNDS.melanin[1], Math.max(HAIR_SHADE_BOUNDS.melanin[0], s.melanin));
  s.redness = Math.min(HAIR_SHADE_BOUNDS.redness[1], Math.max(HAIR_SHADE_BOUNDS.redness[0], s.redness));
  s.radial = Math.min(HAIR_SHADE_BOUNDS.radial[1], Math.max(HAIR_SHADE_BOUNDS.radial[0], s.radial));
  s.longitudinal = Math.min(HAIR_SHADE_BOUNDS.longitudinal[1], Math.max(HAIR_SHADE_BOUNDS.longitudinal[0], s.longitudinal));
  return s;
}

/** The shade as one ledger line (the render state reports it). */
export function hairShadeLine(s: HairShade): string {
  const from = s.fields.length > 0 ? `named by the hex: ${s.fields.join(", ")}` : "the hex's own read";
  return `hair shade: melanin ${s.melanin.toFixed(2)}, redness ${s.redness.toFixed(2)}, radial ${s.radial.toFixed(2)}, longitudinal ${s.longitudinal.toFixed(2)} (${from})`;
}

/** The DETERMINISTIC hair-shade hash - mirrored bit-exactly in the worker. */
export function hairShadeHash(s: HairShade): string {
  const key = `89|${s.melanin.toFixed(3)}|${s.redness.toFixed(3)}|${s.radial.toFixed(3)}|${s.longitudinal.toFixed(3)}|v1`;
  // sha256 over the key, first 16 hex - identical to Python's
  // hashlib.sha256(key.encode()).hexdigest()[:16]
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

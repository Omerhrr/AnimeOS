/**
 * comp - THE FRAME IS FINISHED IN COMP (iteration 86, Layer D).
 *
 * The measured cast gap survived the palette, the silhouette, the
 * sculpt, the grade, the performance AND the groom because the FRAME
 * itself was still raw: a FINAL render left the compositor with one
 * bloom + one fixed room grade (iteration 73's law), and a PREVIEW
 * render - the pixels the identity loop actually MEASURES - left it
 * with nothing at all. A raw frame reads low-poly no matter what the
 * geometry under it says; the depth was never fogged, the edges were
 * never finished, the light never shafted, and the color script was
 * the same neutral room for a moonlit ridge and a tribulation sky.
 *
 * This module compiles the SHOT'S OWN DRAMA into a bounded COMP
 * PROFILE (the same one-law-two-runtimes pattern as the silhouette,
 * the face, the materials, the expression and the groom): the
 * shot's lighting words pick the color script (moonlight,
 * tribulation, dawn, or the neutral donghua room), the scene's own
 * fog and lightning numbers push the depth mist and the light
 * shafts, the description's action verbs raise the speed streaks
 * and the chromatic edge, and the framing owns the vignette. The
 * worker builds the compositor graph from it on BOTH modes - the
 * preview is the promise: what the loop measures is what ships.
 *
 * Laws of the module:
 *  - bounded: every factor lands inside COMP_PROFILE_BOUNDS; the
 *    worker re-clamps against the same bounds on BOTH sides of the
 *    wire (one law, two runtimes);
 *  - honest: `fields` names ONLY the traits the shot's own words
 *    and scene numbers described - a quiet shot keeps the house
 *    defaults with an honest empty list;
 *  - deterministic: the same shot always lands the same profile,
 *    hash-proven (compHash mirrors the worker bit-exactly);
 *  - supersession: iteration 73's "PREVIEW never grades" is
 *    reversed by law - a comp the measuring loop cannot see is
 *    wasted comp.
 */

import { createHash } from "node:crypto";

// ── the profile ──

export interface CompProfile {
  mist: number; // 0..1 depth fog strength (the Z read)
  chroma: number; // 0..1 chromatic aberration at the edges
  vignette: number; // 0..1 the edge falloff
  speed: number; // 0..1 motion streaks (the vector blur)
  beams: number; // 0..1 light shafts (the glare streaks)
  grain: number; // 0..1 film grain (the delivery skin)
  lut: string; // moonlight | tribulation | dawn | neutral
  fields: string[]; // the traits the shot's own words described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const COMP_PROFILE_BOUNDS: Record<keyof Omit<CompProfile, "lut" | "fields">, [number, number]> = {
  mist: [0, 1],
  chroma: [0, 1],
  vignette: [0, 1],
  speed: [0, 1],
  beams: [0, 1],
  grain: [0, 1],
};

/** The house defaults (a quiet shot still leaves the compositor finished). */
export const COMP_BASE: Omit<CompProfile, "lut" | "fields"> = {
  mist: 0.12,
  chroma: 0.08,
  vignette: 0.15,
  speed: 0.04,
  beams: 0.04,
  grain: 0.3,
};

/** The four color scripts. Neutral IS the iteration-73 donghua room grade. */
export interface CompLut {
  lift: [number, number, number, number];
  gain: [number, number, number, number];
  sat: number;
  mistTint: [number, number, number, number];
}

export const COMP_LUT_NAMES: readonly string[] = ["moonlight", "tribulation", "dawn", "neutral"];

export const COMP_LUTS: Record<string, CompLut> = {
  moonlight: {
    lift: [0.97, 1.0, 1.05, 1.0],
    gain: [0.94, 0.99, 1.1, 1.0],
    sat: 1.0,
    mistTint: [0.24, 0.29, 0.44, 1.0],
  },
  tribulation: {
    lift: [1.0, 0.96, 1.03, 1.0],
    gain: [1.08, 0.97, 1.0, 1.0],
    sat: 1.12,
    mistTint: [0.3, 0.24, 0.38, 1.0],
  },
  dawn: {
    lift: [1.02, 0.99, 0.96, 1.0],
    gain: [1.08, 1.02, 0.94, 1.0],
    sat: 1.06,
    mistTint: [0.55, 0.44, 0.34, 1.0],
  },
  neutral: {
    lift: [0.98, 0.985, 1.02, 1.0],
    gain: [1.03, 1.0, 0.965, 1.0],
    sat: 1.06,
    mistTint: [0.36, 0.4, 0.46, 1.0],
  },
};

export interface CompSource {
  description?: string | null;
  lighting?: string | null;
  shotType?: string | null;
  fogDensity?: number | null;
  lightningIntensity?: number | null;
}

const round3 = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/**
 * THE FRAME IS FINISHED IN COMP (pure): read the shot's own drama
 * into a bounded comp profile. The LIGHTING words pick the color
 * script (the description's words fill in when the lighting is
 * quiet), the scene's fog and lightning numbers push the mist and
 * the shafts, the action verbs raise the streaks and the chroma,
 * the close framing owns the vignette. `fields` names ONLY what the
 * shot itself said. Deterministic: the same shot always lands the
 * same profile.
 */
export function parseCompProfile(src: CompSource): CompProfile {
  const prof: CompProfile = { ...COMP_BASE, lut: "neutral", fields: [] };
  const lighting = (src.lighting ?? "").toLowerCase();
  const desc = (src.description ?? "").toLowerCase();
  const push = (key: keyof Omit<CompProfile, "lut" | "fields">, v: number, field: string) => {
    prof[key] = round3(Math.max(prof[key], v));
    if (!prof.fields.includes(field)) prof.fields.push(field);
  };
  const add = (key: keyof Omit<CompProfile, "lut" | "fields">, delta: number, field: string) => {
    prof[key] = round3(prof[key] + delta);
    if (!prof.fields.includes(field)) prof.fields.push(field);
  };
  const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

  // the color script: the lighting's own words, the description's as fallback
  if (has(lighting, "moonlit", "night", "midnight", "dark", "shadowed", "moon")) {
    prof.lut = "moonlight";
    prof.fields.push("moonlight");
  } else if (has(lighting, "tribulation", "lightning", "thunder", "storm", "heavenly", "calamity", "skyfire")) {
    prof.lut = "tribulation";
    prof.fields.push("tribulation");
  } else if (has(lighting, "dawn", "sunrise", "morning", "sunset", "dusk", "golden")) {
    prof.lut = "dawn";
    prof.fields.push("dawn");
  } else if (has(desc, "moonlit", "night", "midnight", "dark", "moon")) {
    prof.lut = "moonlight";
    prof.fields.push("moonlight");
  } else if (has(desc, "tribulation", "lightning", "thunder", "storm", "heavenly", "calamity", "skyfire")) {
    prof.lut = "tribulation";
    prof.fields.push("tribulation");
  } else if (has(desc, "dawn", "sunrise", "morning", "sunset", "dusk", "golden")) {
    prof.lut = "dawn";
    prof.fields.push("dawn");
  }

  // the depth mist rides the scene's own fog number
  if (typeof src.fogDensity === "number" && src.fogDensity > 0.03) {
    add("mist", 0.5 * Math.min(1, Math.max(0, src.fogDensity)), "fog");
  }

  // the action verbs own the streaks (and the chromatic edge follows)
  if (has(desc, "slash", "dash", "charge", "leap", "strike", "roar", "explode", "collide")) {
    push("speed", 0.55, "speed");
    push("chroma", 0.3, "speed");
  }

  // the light shafts: named beams, or the scene's own lightning
  if (has(desc, "rays", "shafts", "beams", "piercing light")) {
    push("beams", 0.5, "beams");
  }
  if (typeof src.lightningIntensity === "number" && src.lightningIntensity > 0.25) {
    push("beams", 0.15 + 0.45 * Math.min(1, Math.max(0, src.lightningIntensity)), "lightning");
  }

  // the vignette: the close framing owns it, the dread words deepen it
  const st = (src.shotType ?? "").toUpperCase();
  if (st === "CLOSEUP" || st === "EXTREME_CLOSEUP") add("vignette", 0.2, "closeup");
  if (has(desc, "terror", "despair", "dread", "last stand")) add("vignette", 0.15, "dread");

  // an unknown lut name can never ride the wire
  if (!COMP_LUT_NAMES.includes(prof.lut)) prof.lut = "neutral";
  return prof;
}

/** The comp as one ledger line (the render state reports it). */
export function compProfileLine(prof: CompProfile): string {
  const from = prof.fields.length > 0 ? `named by the shot: ${prof.fields.join(", ")}` : "house defaults";
  return `comp: ${prof.lut} LUT, mist ${prof.mist.toFixed(2)}, chroma ${prof.chroma.toFixed(2)}, speed ${prof.speed.toFixed(2)}, beams ${prof.beams.toFixed(2)} (${from})`;
}

/** The DETERMINISTIC comp hash - mirrored bit-exactly in the worker. */
export function compHash(prof: CompProfile): string {
  const f = (v: number) => v.toFixed(3);
  const key = `86|${f(prof.mist)}|${f(prof.chroma)}|${f(prof.vignette)}|${f(prof.speed)}|${f(prof.beams)}|${f(prof.grain)}|${prof.lut}|v1`;
  // sha256 over the key, first 16 hex - identical to Python's
  // hashlib.sha256(key.encode()).hexdigest()[:16]
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

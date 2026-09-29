/**
 * adherence - THE DNA ADHERES TO THE SHEET (iteration 80).
 *
 * Frontier 1, deeper: the measured cast gap (avg 8% against the 70%
 * shipping bar, iteration 79) traced to a build law - the 3D proxy was
 * compiled from REGEX GUESSES over the design text while the canonical
 * model sheet (the very pixels identity is scored against) never told
 * the builder what the character actually looks like. The sheet's
 * PALETTE pulled the materials 35% (THE SHEET DRESSES THE RENDER), but
 * hair style, hair color, weapon and build stayed guesses.
 *
 * This module closes the loop from the sheet's other half: the sheet's
 * own pixels are READ by the vision model into structured BUILD DNA -
 * hair style + exact hexes per material role + weapon + build + beard -
 * cached on the character (Character.sheetDna), and the render path
 * compiles every detected cast member's DNA THROUGH that read: the
 * sheet's truth wins, the regex fills what the sheet does not show.
 * A proxy built from its sheet's own measured DNA is a proxy that
 * resembles its sheet.
 *
 * Laws of the module:
 *  - staleness: a cached read is valid only while sheetUrl matches the
 *    character's current canonical sheet - a re-sheet invalidates it;
 *  - honest: a field the sheet does not show clearly is null and the
 *    regex DNA fills it; a failed read is named, never faked;
 *  - deterministic persistence: the same raw verdict always lands the
 *    same SheetDnaRead (pure parser, exported for the E2E);
 *  - bounded pulls: an adherent build's palette conformance pulls
 *    harder (0.75) than a guess build's (0.35) - the sheet read is
 *    already truth, so the remaining drift is closed, not cosied to;
 *  - THE SILHOUETTE SHAPES THE MESH (iteration 81): the read's
 *    silhouette sentence compiles into a bounded shaping profile
 *    (height/shoulders/torso/sleeves/skirt/hair) the worker sculpts
 *    the proxy's MESH with - the outline matches the sheet, not just
 *    the palette. A guess build keeps the neutral figure.
 *  - THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82): the head is
 *    a real sculpted mesh (jaw taper, chin, brow ridge, cheekbones,
 *    nose wedge, skull dome, ears) - never an assembled sphere - and
 *    the read's faceShape field modulates the sculpt through a
 *    bounded face profile. A sheet that names no face shape keeps
 *    the neutral sculpt (the donghua default face), honestly named.
 *  - THE SURFACE IS GRADED, NOT PAINTED (iteration 83): every
 *    material is a layered surface - skin carries subsurface,
 *    roughness breakup, warm zones and a fresnel rim; cloth carries
 *    the gradient ramp, the sheen and the weave; hair carries the
 *    tinted glint - compiled from the read's OWN measured hexes
 *    (skinTone / robeColor / hairColor) into a bounded material
 *    profile. The flat base color reads as plastic: a palette on a
 *    mannequin is still a mannequin, so the surface answers the
 *    sheet the way the mesh does.
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import type { CharacterDesignDna, HairStyle, WeaponType, Build } from "@/lib/animation/design";
import { parseGroomProfile, groomProfileLine, type GroomProfile } from "@/lib/blender/groom";
import { parseHairShade, hairShadeLine, type HairShade } from "@/lib/blender/hair-shade";

export interface SheetDnaRead {
  sheetUrl: string; // the sheet this read came from (the staleness key)
  readAt: string; // ISO timestamp of the read
  hairStyle: HairStyle | null;
  hairColor: string | null; // exact hex sampled from the sheet
  robeColor: string | null;
  robeAccent: string | null;
  bootsColor: string | null;
  skinTone: string | null;
  weaponType: WeaponType | null;
  build: Build | null;
  beard: boolean | null;
  silhouette: string | null; // one sentence: silhouette + signature props
  faceShape: FaceShape | null; // THE FACE IS SCULPTED: the read's face family
}

export const SHEET_DNA_HAIR_STYLES: readonly HairStyle[] = ["topknot", "ponytail", "braid", "long", "short"];
export const SHEET_DNA_WEAPON_TYPES: readonly WeaponType[] = ["sword", "spear", "staff", "none"];
export const SHEET_DNA_BUILDS: readonly Build[] = ["lean", "sturdy", "heavy"];
export const SHEET_DNA_FACE_SHAPES: readonly FaceShape[] = ["oval", "round", "angular"];

export type FaceShape = "oval" | "round" | "angular";

// ── THE FACE IS SCULPTED, NOT ASSEMBLED (iteration 82, Frontier 1 deeper) ──
//
// The measured cast gap survived the palette AND the silhouette
// because the head itself was an assembled sphere: box brows on a
// ball reads MANNEQUIN, and no palette fixes a mannequin. The head is
// now a real sculpted mesh, and the sheet read's faceShape field
// modulates the sculpt through a bounded profile - the same one-law-
// two-runtimes pattern as the silhouette. The bounds are tight on
// purpose: a face hint sculpts the likeness, it never redesigns it,
// and the eye/face rig anchors stay where the v3.x contract expects
// them (the worker sculpts MESH, never the rig empties).

/** The palette pull an ADHERENT build answers to (the repair law). */
export const ADHERENT_CONFORM_FACTOR = 0.75;
/** The palette pull a guess build keeps (THE SHEET DRESSES THE RENDER). */
export const GUESS_CONFORM_FACTOR = 0.35;

// ── THE SILHOUETTE SHAPES THE MESH (iteration 81, Frontier 1 deeper) ──
//
// A palette can dress a body whose OUTLINE still disagrees with the
// sheet - the measured cast gap survived iteration 80's DNA merge
// because the proxy's silhouette was the builder's default. The sheet
// read already carries a silhouette SENTENCE ("tall, broad-shouldered
// swordswoman, flowing sleeves"); this module reads that sentence into
// a bounded shaping profile the worker sculpts the mesh with. The
// factors are tight on purpose: a silhouette hint bends the figure,
// it never redesigns it - and the rig anchors stay where the framing
// math expects them (the worker scales MESH, never joints).

export interface SilhouetteShape {
  height: number; // crown presence (head/neck/hair mass), 0.92..1.12
  shoulders: number; // shoulder span + sleeve top width, 0.82..1.25
  torso: number; // torso/chest/hips bulk, 0.85..1.2
  sleeves: number; // sleeve length + flare, 0.9..1.35
  skirt: number; // skirt panel drop + flare, 0.9..1.3
  hair: number; // hair mass scale, 0.75..1.5
  fields: string[]; // the traits the sheet's own silhouette note named
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const SILHOUETTE_SHAPE_BOUNDS: Record<keyof Omit<SilhouetteShape, "fields">, [number, number]> = {
  height: [0.92, 1.12],
  shoulders: [0.82, 1.25],
  torso: [0.85, 1.2],
  sleeves: [0.9, 1.35],
  skirt: [0.9, 1.3],
  hair: [0.75, 1.5],
};

/** The shaping priors a build field implies when the note is silent. */
export const SILHOUETTE_BUILD_PRIORS: Record<string, Partial<SilhouetteShape>> = {
  lean: { shoulders: 0.92, torso: 0.92 },
  sturdy: { shoulders: 1.08, torso: 1.08 },
  heavy: { shoulders: 1.16, torso: 1.15 },
};

function clampBound(key: keyof Omit<SilhouetteShape, "fields">, v: number): number {
  const [lo, hi] = SILHOUETTE_SHAPE_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
}

/**
 * THE SILHOUETTE SHAPES THE MESH (pure): read the sheet's silhouette
 * sentence into a bounded shaping profile. The build field sets the
 * base prior; the note's own words push each trait (every push lands
 * inside the bounds); `fields` names ONLY the traits the note itself
 * described - a note that says nothing leaves the prior figure and an
 * honest empty list. Deterministic: the same sentence always lands
 * the same shape.
 */
export function parseSilhouetteShape(silhouette: string | null | undefined, build: string | null | undefined): SilhouetteShape {
  const prior = (build && SILHOUETTE_BUILD_PRIORS[build.trim().toLowerCase()]) || {};
  const shape: SilhouetteShape = {
    height: 1.0,
    shoulders: prior.shoulders ?? 1.0,
    torso: prior.torso ?? 1.0,
    sleeves: 1.0,
    skirt: 1.0,
    hair: 1.0,
    fields: [],
  };
  const note = (silhouette ?? "").toLowerCase();
  if (!note.trim()) return shape;
  const has = (...words: Array<string | RegExp>) =>
    words.some((w) => (typeof w === "string" ? note.includes(w) : w.test(note)));
  const push = (key: keyof Omit<SilhouetteShape, "fields">, delta: number, field: string) => {
    shape[key] = clampBound(key, shape[key] + delta);
    if (!shape.fields.includes(field)) shape.fields.push(field);
  };
  // vertical presence
  if (has("tall", "towering", "lofty", "imposing")) push("height", 0.07, "tall");
  if (has("petite", "diminutive")) push("height", -0.06, "petite");
  // upper-body frame
  if (has("broad", "muscular", "powerful", "barrel-chested", "wide-shouldered", "broad-shouldered")) push("shoulders", 0.13, "broad-shouldered");
  if (has("slender", "willowy", "slim", "narrow", "thin", "svelte")) push("shoulders", -0.08, "slender");
  if (has("heavyset", "stocky", "burly")) push("shoulders", 0.1, "heavyset");
  // torso bulk
  if (has("broad", "muscular", "powerful", "heavyset", "stocky", "burly", "barrel-chested")) push("torso", 0.1, "broad-shouldered");
  if (has("slender", "willowy", "slim", "svelte")) push("torso", -0.07, "slender");
  if (has("robes billow", "billowing")) push("torso", 0.05, "billowing robes");
  // sleeves
  if (has("flowing sleeves", "wide sleeves", "wide-sleeved", "long sleeves", "billowing sleeves", "loose sleeves")) push("sleeves", 0.22, "flowing sleeves");
  if (has("fitted sleeves", "close-fitting")) push("sleeves", -0.08, "fitted sleeves");
  // skirt / robe drop
  if (has("flowing robe", "long robe", "trailing robe", "flowing skirt", "long skirt", "sweeping robe", "floor-length")) push("skirt", 0.2, "flowing robes");
  // hair mass - the note may put a color between the length and the
  // noun ("long black hair"), or describe the mass itself
  if (has("long hair", "flowing hair", "flowing mane", "cascading", "waist-length", "mane of", "voluminous", /\blong\b[^.;]{0,24}\bhair\b/, /\bhair\b[^.;]{0,24}\blong\b/, /\blong\b[^.;]{0,24}\b(ponytail|braid|mane)\b/)) push("hair", 0.32, "long hair");
  if (has("short hair", "cropped", "close-cropped", "buzz")) push("hair", -0.22, "short hair");
  return shape;
}

/** The shaping as one ledger line (the repair pass reports it). */
export function silhouetteShapeLine(shape: SilhouetteShape): string {
  const applied = (Object.keys(SILHOUETTE_SHAPE_BOUNDS) as Array<keyof Omit<SilhouetteShape, "fields">>)
    .filter((k) => Math.abs(shape[k] - 1.0) > 0.001)
    .map((k) => `${k} ${shape[k].toFixed(2)}`);
  if (applied.length === 0) return "neutral silhouette (the sheet described no shape)";
  const from = shape.fields.length > 0 ? `named by the sheet: ${shape.fields.join(", ")}` : "from the build prior";
  return `shaped: ${applied.join(", ")} (${from})`;
}

/** The face profile the sculpt answers to (all factors bounded). */
export interface FaceProfile {
  jawTaper: number; // jaw width kept toward the chin, 0.55..0.9
  chinFwd: number; // chin forward push, 0..0.05
  browFwd: number; // brow ridge forward push, 0..0.03
  cheekOut: number; // cheekbone outward push, 0..0.045
  noseLen: number; // nose wedge length factor, 0.7..1.4
  eyeScale: number; // eye scale, 0.85..1.25
  fields: string[]; // what the sheet's own read described
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const FACE_PROFILE_BOUNDS: Record<keyof Omit<FaceProfile, "fields">, [number, number]> = {
  jawTaper: [0.55, 0.9],
  chinFwd: [0, 0.05],
  browFwd: [0, 0.03],
  cheekOut: [0, 0.045],
  noseLen: [0.7, 1.4],
  eyeScale: [0.85, 1.25],
};

/** The sculpt priors a faceShape field implies (the donghua families).
 * oval is the NEUTRAL sculpt - the default face a sheetless build keeps. */
export const FACE_SHAPE_PRIORS: Record<FaceShape, Omit<FaceProfile, "fields">> = {
  oval: { jawTaper: 0.74, chinFwd: 0.028, browFwd: 0.014, cheekOut: 0.022, noseLen: 1.0, eyeScale: 1.05 },
  round: { jawTaper: 0.84, chinFwd: 0.016, browFwd: 0.008, cheekOut: 0.034, noseLen: 0.86, eyeScale: 1.14 },
  angular: { jawTaper: 0.64, chinFwd: 0.042, browFwd: 0.024, cheekOut: 0.014, noseLen: 1.12, eyeScale: 0.96 },
};

function clampFace(key: keyof Omit<FaceProfile, "fields">, v: number): number {
  const [lo, hi] = FACE_PROFILE_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
}

/**
 * THE FACE IS SCULPTED, NOT ASSEMBLED (pure): compile the read's
 * faceShape (plus the build's nudge) into a bounded face profile the
 * worker sculpts the head mesh with. The head is ALWAYS sculpted - a
 * sheet that names no face shape keeps the neutral (oval) sculpt with
 * an honest empty fields list; a named shape sets its prior; the
 * build nudges the jaw. Deterministic: the same inputs land the same
 * profile. Every factor lands inside the bounds.
 */
export function parseFaceProfile(faceShape: string | null | undefined, build: string | null | undefined): FaceProfile {
  const named = typeof faceShape === "string" && (SHEET_DNA_FACE_SHAPES as readonly string[]).includes(faceShape.trim().toLowerCase());
  const prior = FACE_SHAPE_PRIORS[named ? (faceShape!.trim().toLowerCase() as FaceShape) : "oval"];
  const fields: string[] = [];
  if (named) fields.push(`${faceShape!.trim().toLowerCase()} face`);
  const prof: FaceProfile = {
    jawTaper: prior.jawTaper,
    chinFwd: prior.chinFwd,
    browFwd: prior.browFwd,
    cheekOut: prior.cheekOut,
    noseLen: prior.noseLen,
    eyeScale: prior.eyeScale,
    fields,
  };
  const b = (build ?? "").trim().toLowerCase();
  if (b === "lean") {
    prof.jawTaper = clampFace("jawTaper", prof.jawTaper - 0.03);
    if (named) fields.push("lean jaw");
  } else if (b === "heavy") {
    prof.jawTaper = clampFace("jawTaper", prof.jawTaper + 0.04);
    prof.cheekOut = clampFace("cheekOut", prof.cheekOut + 0.006);
    if (named) fields.push("heavy jaw");
  }
  return prof;
}

/** The face profile as one ledger line (the repair pass reports it). */
export function faceProfileLine(prof: FaceProfile): string {
  if (prof.fields.length === 0) return "sculpted: neutral face (the sheet named no face shape)";
  const nums = `jaw ${prof.jawTaper.toFixed(2)}, chin ${prof.chinFwd.toFixed(3)}, brow ${prof.browFwd.toFixed(3)}, eye ${prof.eyeScale.toFixed(2)}`;
  return `sculpted: ${prof.fields[0]} (${nums}; named by the sheet)`;
}

// ── THE SURFACE IS GRADED, NOT PAINTED (iteration 83, Frontier 1 deeper) ──
//
// The measured cast gap survived the palette AND the silhouette AND
// the sculpt because the SURFACE was still flat: one Principled BSDF,
// one base color, one roughness scalar - the vision model's own re-
// score notes named it ("low-poly 3D mannequin", a MATERIAL gap, not
// a geometry one). The surface is now graded: skin is layered
// (subsurface + roughness breakup + warm zones + fresnel rim), cloth
// is ramped (shadow/high derived from the same dye + sheen + weave),
// hair carries the tinted glint. The profile compiles from the
// sheet read's own measured hexes - the SAME law that owns the mesh
// owns the dye. The bounds are tight on purpose: a material hint
// grades the likeness, it never redesigns it.

export interface MaterialProfile {
  skinSss: number; // subsurface radius scale, 0.6..1.4
  skinRough: number; // base skin roughness, 0.35..0.65
  skinWarmth: number; // warm-zone color push, 0..0.3
  rim: number; // fresnel rim lift (skin + cloth), 0..0.35
  clothRamp: number; // shadow/high contrast from the dye, 0..0.5
  clothSheen: number; // fabric edge sheen, 0..0.6
  clothWeave: number; // procedural weave bump, 0..0.5
  hairRough: number; // hair roughness, 0.2..0.5
  fields: string[]; // the hexes the sheet read itself owns
}

/** The bounds the worker re-clamps against (one law, two runtimes). */
export const MATERIAL_PROFILE_BOUNDS: Record<keyof Omit<MaterialProfile, "fields">, [number, number]> = {
  skinSss: [0.6, 1.4],
  skinRough: [0.35, 0.65],
  skinWarmth: [0, 0.3],
  rim: [0, 0.35],
  clothRamp: [0, 0.5],
  clothSheen: [0, 0.6],
  clothWeave: [0, 0.5],
  hairRough: [0.2, 0.5],
};

/** The neutral grade: the default surface a sheetless build keeps
 * (the head is always sculpted, the surface is always graded - the
 * flat plastic mannequin was a pipeline defect, not a sheet trait). */
export const MATERIAL_NEUTRAL: Omit<MaterialProfile, "fields"> = {
  skinSss: 1.0,
  skinRough: 0.45,
  skinWarmth: 0.15,
  rim: 0.2,
  clothRamp: 0.25,
  clothSheen: 0.35,
  clothWeave: 0.25,
  hairRough: 0.3,
};

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function hexLum(hex: string): number {
  const [r, g, b] = hexToRgb01(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexSat(hex: string): number {
  const [r, g, b] = hexToRgb01(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function hexWarm(hex: string): boolean {
  const [r, , b] = hexToRgb01(hex);
  return r > b + 0.06;
}

function clampMat(key: keyof Omit<MaterialProfile, "fields">, v: number): number {
  const [lo, hi] = MATERIAL_PROFILE_BOUNDS[key];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 1000) / 1000;
}

/**
 * THE SURFACE IS GRADED, NOT PAINTED (pure): compile the read's own
 * measured hexes into a bounded material profile the worker grades
 * the materials with. Lighter skin scatters more visibly (bigger sss
 * radius); a warm skin tone pushes the zones harder; a dark robe
 * needs more shadow/high separation to read; dark hair keeps a
 * tighter glint. `fields` names ONLY the hexes the read itself owns
 * - a read that landed no colors keeps the neutral grade with an
 * honest empty list. Deterministic: the same hexes always land the
 * same profile. Every factor lands inside the bounds.
 */
export function parseMaterialProfile(skinTone: string | null | undefined, robeColor: string | null | undefined, hairColor: string | null | undefined): MaterialProfile {
  const prof: MaterialProfile = { ...MATERIAL_NEUTRAL, fields: [] };
  if (typeof skinTone === "string" && HEX_RE.test(skinTone.trim())) {
    prof.fields.push("skinTone");
    const L = hexLum(skinTone.trim());
    prof.skinSss = clampMat("skinSss", L >= 0.68 ? 1.3 : L >= 0.45 ? 1.05 : 0.8);
    prof.skinRough = clampMat("skinRough", hexWarm(skinTone.trim()) ? 0.48 : 0.42);
    prof.skinWarmth = clampMat("skinWarmth", hexWarm(skinTone.trim()) ? 0.22 : 0.12);
  }
  if (typeof robeColor === "string" && HEX_RE.test(robeColor.trim())) {
    prof.fields.push("robeColor");
    const L = hexLum(robeColor.trim());
    const S = hexSat(robeColor.trim());
    prof.clothRamp = clampMat("clothRamp", L < 0.25 ? 0.4 : S > 0.3 ? 0.32 : 0.24);
    prof.clothSheen = clampMat("clothSheen", S > 0.3 ? 0.45 : 0.35);
  }
  if (typeof hairColor === "string" && HEX_RE.test(hairColor.trim())) {
    prof.fields.push("hairColor");
    prof.hairRough = clampMat("hairRough", hexLum(hairColor.trim()) < 0.2 ? 0.26 : 0.34);
  }
  return prof;
}

/** The material profile as one ledger line (the repair pass reports it). */
export function materialProfileLine(prof: MaterialProfile): string {
  if (prof.fields.length === 0) return "graded: neutral materials (the sheet read landed no colors)";
  const nums = `skin sss ${prof.skinSss.toFixed(2)} rough ${prof.skinRough.toFixed(2)} rim ${prof.rim.toFixed(2)}; cloth ramp ${prof.clothRamp.toFixed(2)} sheen ${prof.clothSheen.toFixed(2)}`;
  return `graded: ${nums} (named by the sheet: ${prof.fields.join(", ")})`;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function hexOrNull(v: unknown): string | null {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim().toLowerCase() : null;
}

function enumOrNull<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as T) : null;
}

/**
 * Parse the vision model's sheet read into a SheetDnaRead (pure):
 * strict JSON (fences tolerated), enum-validated, hex-validated - a
 * field the model garbled lands null (the regex DNA fills it) rather
 * than poisoning the build.
 */
export function parseSheetDna(raw: string, sheetUrl: string): SheetDnaRead | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const beardRaw = body.beard;
  const faceRaw = body.faceShape;
  return {
    sheetUrl,
    readAt: new Date().toISOString(),
    hairStyle: enumOrNull<HairStyle>(body.hairStyle, SHEET_DNA_HAIR_STYLES),
    hairColor: hexOrNull(body.hairColor),
    robeColor: hexOrNull(body.robeColor),
    robeAccent: hexOrNull(body.robeAccent),
    bootsColor: hexOrNull(body.bootsColor),
    skinTone: hexOrNull(body.skinTone),
    weaponType: enumOrNull<WeaponType>(body.weaponType, SHEET_DNA_WEAPON_TYPES),
    build: enumOrNull<Build>(body.build, SHEET_DNA_BUILDS),
    beard: typeof beardRaw === "boolean" ? beardRaw : null,
    silhouette: typeof body.silhouette === "string" && body.silhouette.trim() ? body.silhouette.trim().slice(0, 200) : null,
    faceShape: enumOrNull<FaceShape>(faceRaw, SHEET_DNA_FACE_SHAPES),
  };
}

/** The vision prompt for ONE sheet read (the model answers strict JSON). */
export function sheetDnaPrompt(name: string): string {
  return [
    `You are a character designer reading the canonical model sheet of ${name} to extract build DNA for a 3D proxy figure.`,
    "Image 1 is the model sheet (a turnaround of the character).",
    'Read it into STRICT JSON only, no markdown fences: {"hairStyle": "topknot|ponytail|braid|long|short", "hairColor": "#rrggbb", "robeColor": "#rrggbb", "robeAccent": "#rrggbb", "bootsColor": "#rrggbb", "skinTone": "#rrggbb", "weaponType": "sword|spear|staff|none", "build": "lean|sturdy|heavy", "beard": true, "faceShape": "oval|round|angular", "silhouette": "one sentence on the silhouette and signature props"}',
    "Sample every color as an exact hex from the sheet's pixels. Use null for any field the sheet does not show clearly. weaponType none means no weapon visible. faceShape is the face family the sheet draws (oval / round / angular) - judge the jaw line, cheekbones and chin.",
  ].join("\n");
}

/** The cached-read staleness law (pure): valid only for the same sheet. */
export function sheetDnaFresh(cached: string | null | undefined, currentSheetUrl: string | null | undefined): SheetDnaRead | null {
  if (!cached || !currentSheetUrl) return null;
  try {
    const read = JSON.parse(cached) as SheetDnaRead;
    if (!read || typeof read !== "object" || read.sheetUrl !== currentSheetUrl) return null;
    return read;
  } catch {
    return null;
  }
}

/**
 * Read ONE character's sheet into build DNA with the REAL vision
 * model (one call over the canonical sheet PNG). A fresh cached read
 * for the SAME sheet is returned without a new call unless refresh.
 * The read persists on Character.sheetDna (the staleness key is the
 * sheet URL - a re-sheet invalidates the cache by law).
 */
export async function readSheetDna(
  characterId: string,
  opts?: { refresh?: boolean },
): Promise<{ ok: true; dna: SheetDnaRead; source: "cached" | "read" } | { ok: false; error: string }> {
  const ch = await db.character.findUnique({ where: { id: characterId } });
  if (!ch) return { ok: false, error: "Character not found" };
  if (!ch.modelSheetUrl) return { ok: false, error: `${ch.name} has no canonical model sheet - generate one first (generate_model_sheet)` };
  if (!opts?.refresh) {
    const fresh = sheetDnaFresh(ch.sheetDna, ch.modelSheetUrl);
    if (fresh) return { ok: true, dna: fresh, source: "cached" };
  }
  const data = publicImageAsDataUrl(ch.modelSheetUrl);
  if (!data) return { ok: false, error: `${ch.name}'s model sheet is missing on disk` };
  let raw = "";
  try {
    const zai = await ZAI.create();
    const res = (await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: sheetDnaPrompt(ch.name) },
            { type: "image_url", image_url: { url: data } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    raw = res.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "sheet DNA read failed" };
  }
  const dna = parseSheetDna(raw, ch.modelSheetUrl);
  if (!dna) return { ok: false, error: `sheet DNA read returned unparsable verdict: ${raw.slice(0, 120)}` };
  await db.character.update({ where: { id: ch.id }, data: { sheetDna: JSON.stringify(dna) } });
  return { ok: true, dna, source: "read" };
}

/**
 * The ADHERENCE MERGE (pure): the sheet's measured DNA wins over the
 * regex guesses field by field; a null (the sheet did not show it)
 * keeps the regex value. The source line records both halves so the
 * build's audit trail names what came from the sheet and what stayed
 * a guess. The conformance factor rides the result: an adherent build
 * pulls 0.75, a guess build 0.35.
 */
export function adherentDna(
  base: CharacterDesignDna,
  read: SheetDnaRead | null,
): CharacterDesignDna & { sheetFields: string[]; conformFactor: number; silhouetteShape?: SilhouetteShape; faceShape?: FaceShape; faceProfile?: FaceProfile; materialProfile?: MaterialProfile; groomProfile?: GroomProfile; hairShade?: HairShade } {
  if (!read) return { ...base, sheetFields: [], conformFactor: GUESS_CONFORM_FACTOR };
  const sheetFields: string[] = [];
  const pick = <T>(sheetVal: T | null | undefined, guessVal: T, field: string): T => {
    if (sheetVal === null || sheetVal === undefined) return guessVal;
    sheetFields.push(field);
    return sheetVal;
  };
  const faceShape = read.faceShape ?? null;
  return {
    ...base,
    hairStyle: pick(read.hairStyle, base.hairStyle, "hairStyle"),
    hairColor: pick(read.hairColor, base.hairColor, "hairColor"),
    robeColor: pick(read.robeColor, base.robeColor, "robeColor"),
    robeAccent: pick(read.robeAccent, base.robeAccent, "robeAccent"),
    skinTone: pick(read.skinTone, base.skinTone, "skinTone"),
    weaponType: pick(read.weaponType, base.weaponType, "weaponType"),
    build: pick(read.build, base.build, "build"),
    beard: pick(read.beard, base.beard, "beard"),
    source: `${base.source} [sheet-read ${read.readAt}: ${read.silhouette ?? "no silhouette note"}]`.slice(0, 500),
    sheetFields,
    conformFactor: sheetFields.length > 0 ? ADHERENT_CONFORM_FACTOR : GUESS_CONFORM_FACTOR,
    // THE SILHOUETTE SHAPES THE MESH: an adherent build rides the
    // sheet's own silhouette sentence as a bounded shaping profile
    // (the worker sculpts the mesh with it); a guess build keeps the
    // neutral figure (no silhouetteShape on the wire at all).
    silhouetteShape: parseSilhouetteShape(read.silhouette, read.build),
    // THE FACE IS SCULPTED, NOT ASSEMBLED: the read's face family
    // modulates the head sculpt through a bounded profile. The head
    // is always sculpted now - a read that names no face shape keeps
    // the neutral sculpt, honestly named in the profile's fields.
    ...(faceShape ? { faceShape } : {}),
    faceProfile: parseFaceProfile(faceShape, read.build ?? base.build),
    // THE SURFACE IS GRADED, NOT PAINTED: the read's own measured
    // hexes grade the materials through a bounded profile (an
    // adherent build always rides one; the surface is never flat
    // plastic again - a read that landed no colors keeps the neutral
    // grade, honestly named in the profile's fields).
    materialProfile: parseMaterialProfile(read.skinTone, read.robeColor, read.hairColor),
    // THE HAIR IS GROOMED: the read's own silhouette sentence directs
    // the hair's groom through a bounded profile (an adherent build
    // always rides one - the style prior sets the base, the note's
    // words push the traits; a guess build keeps the volumes with no
    // profile on the wire at all).
    groomProfile: parseGroomProfile(read.silhouette, read.hairStyle ?? base.hairStyle),
    // iteration 89 THE HAIR SHADES LIKE HAIR: the hex's own dye physics
    hairShade: parseHairShade({ hairColor: read.hairColor ?? base.hairColor }),
  };
}

/** One honest line for logs/events: which fields the sheet owns now. */
export function adherenceLine(name: string, merged: ReturnType<typeof adherentDna>): string {
  if (merged.sheetFields.length === 0) return `${name}: guess build (regex DNA only) - the sheet read landed nothing usable`;
  const shape = merged.silhouetteShape ? `; ${silhouetteShapeLine(merged.silhouetteShape)}` : "";
  const face = merged.faceProfile ? `; ${faceProfileLine(merged.faceProfile)}` : "";
  const materials = merged.materialProfile ? `; ${materialProfileLine(merged.materialProfile)}` : "";
  const groom = merged.groomProfile ? `; ${groomProfileLine(merged.groomProfile)}` : "";
  const shade = merged.hairShade ? `; ${hairShadeLine(merged.hairShade)}` : "";
  return `${name}: sheet-adherent build (${merged.sheetFields.join(", ")} from the sheet read; palette pull ${merged.conformFactor}${shape}${face}${materials}${groom}${shade})`;
}

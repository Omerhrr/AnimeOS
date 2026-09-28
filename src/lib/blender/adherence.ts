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
 */

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import type { CharacterDesignDna, HairStyle, WeaponType, Build } from "@/lib/animation/design";

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
}

export const SHEET_DNA_HAIR_STYLES: readonly HairStyle[] = ["topknot", "ponytail", "braid", "long", "short"];
export const SHEET_DNA_WEAPON_TYPES: readonly WeaponType[] = ["sword", "spear", "staff", "none"];
export const SHEET_DNA_BUILDS: readonly Build[] = ["lean", "sturdy", "heavy"];

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
  };
}

/** The vision prompt for ONE sheet read (the model answers strict JSON). */
export function sheetDnaPrompt(name: string): string {
  return [
    `You are a character designer reading the canonical model sheet of ${name} to extract build DNA for a 3D proxy figure.`,
    "Image 1 is the model sheet (a turnaround of the character).",
    'Read it into STRICT JSON only, no markdown fences: {"hairStyle": "topknot|ponytail|braid|long|short", "hairColor": "#rrggbb", "robeColor": "#rrggbb", "robeAccent": "#rrggbb", "bootsColor": "#rrggbb", "skinTone": "#rrggbb", "weaponType": "sword|spear|staff|none", "build": "lean|sturdy|heavy", "beard": true, "silhouette": "one sentence on the silhouette and signature props"}',
    "Sample every color as an exact hex from the sheet's pixels. Use null for any field the sheet does not show clearly. weaponType none means no weapon visible.",
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
): CharacterDesignDna & { sheetFields: string[]; conformFactor: number; silhouetteShape?: SilhouetteShape } {
  if (!read) return { ...base, sheetFields: [], conformFactor: GUESS_CONFORM_FACTOR };
  const sheetFields: string[] = [];
  const pick = <T>(sheetVal: T | null | undefined, guessVal: T, field: string): T => {
    if (sheetVal === null || sheetVal === undefined) return guessVal;
    sheetFields.push(field);
    return sheetVal;
  };
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
  };
}

/** One honest line for logs/events: which fields the sheet owns now. */
export function adherenceLine(name: string, merged: ReturnType<typeof adherentDna>): string {
  if (merged.sheetFields.length === 0) return `${name}: guess build (regex DNA only) - the sheet read landed nothing usable`;
  const shape = merged.silhouetteShape ? `; ${silhouetteShapeLine(merged.silhouetteShape)}` : "";
  return `${name}: sheet-adherent build (${merged.sheetFields.join(", ")} from the sheet read; palette pull ${merged.conformFactor}${shape})`;
}

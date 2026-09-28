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
 *    already truth, so the remaining drift is closed, not cosied to.
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
): CharacterDesignDna & { sheetFields: string[]; conformFactor: number } {
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
  };
}

/** One honest line for logs/events: which fields the sheet owns now. */
export function adherenceLine(name: string, merged: ReturnType<typeof adherentDna>): string {
  if (merged.sheetFields.length === 0) return `${name}: guess build (regex DNA only) - the sheet read landed nothing usable`;
  return `${name}: sheet-adherent build (${merged.sheetFields.join(", ")} from the sheet read; palette pull ${merged.conformFactor})`;
}

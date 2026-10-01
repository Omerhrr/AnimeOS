/**
 * character-asset - THE CHARACTER IS ONE ASSET (AnimeOS 5.0,
 * iteration 95, the master-asset slice).
 *
 * Eighty-plus iterations built the character piece by piece - the
 * sheet read that owns the hexes (80), the silhouette that shapes
 * the mesh (81), the sculpted face (82), the graded surface (83),
 * the groom (85), the carve at depth (90), the living skin (91),
 * the speaking mesh (92), the creasing face (93), the hero strands
 * (94) - and every piece carried its own deterministic proof. What
 * the production never had was THE OBJECT: no first-class thing
 * named what the character IS, so the container (the versioned
 * .blend) stood in for the truth and every consumer re-derived the
 * pieces from the wire alone.
 *
 * This module compiles the CharacterAsset MANIFEST: the ten sections
 * that gather what the character is - canonicalIdentity, baseMesh,
 * sculptLayers, maps, materials, facialRig, groom, wardrobe, lod,
 * validationProfile - from the sheet read's own DNA, by one pure
 * law, under one DETERMINISTIC MASTER HASH (sha256-16, versioned
 * 95, mirrored bit-exactly in the worker). The BlenderAsset stays
 * the container; the manifest is the production abstraction.
 *
 * Laws of the module:
 *  - the manifest NAMES what the wire declared - a section the
 *    sheet read did not earn is named absent, never invented;
 *  - the master hash covers the WIRE TRUTH (the DNA fields and the
 *    profiles as declared), never the per-shot resolutions - the
 *    counts, the tiers and the worn keys ride the render evidence
 *    as fields, never inside the key;
 *  - the LENS RESOLVES, NEVER REWRITES: the same master hash at
 *    every framing (the LOD law is a section of the manifest, the
 *    shot's tier is the evidence's business);
 *  - the validation profile's judge is THE READINGS (rule 69): an
 *    asset is COMPILED until the identity readings clear the bar -
 *    no structural proof validates a face.
 */

import { createHash } from "node:crypto";

// ── the manifest law ──

/** The manifest law's version tag (bumped when the law itself moves).
 *  95 -> 106: THE FIGURE IS CRAFTED, NOT ASSEMBLED - the craft law
 *  changed how the base mesh is BUILT (beveled organic boxes, rounded
 *  capsule fingers, 24-segment curved primitives), so every library
 *  asset re-builds with the crafted meshes; a craft change is an
 *  asset change, and the master hash moves with it.
 *  106 -> 107: THE TRIAD - the surface (the sheet's range rides the
 *  cloth ramp), the face (the hair cap opens, the features step out
 *  of the skull, the deep relief answers the framing) and the
 *  presence (the measured-subject framing) all change how the ASSET
 *  is built and surfaced, so the library assets re-build again: a
 *  law that changes the pixels is an asset change. */
export const CHARACTER_ASSET_LAW_VERSION = 107;

/** The manifest schema version (bumped when the manifest shape moves). */
export const CHARACTER_ASSET_MANIFEST_VERSION = 1;

/** The ten sections, in the order the ledger names them. */
export const CHARACTER_ASSET_SECTIONS: readonly string[] = [
  "canonicalIdentity",
  "baseMesh",
  "sculptLayers",
  "maps",
  "materials",
  "facialRig",
  "groom",
  "wardrobe",
  "lod",
  "validationProfile",
];

/** The section's honest record: its law, and whether the sheet read
 *  earned it (a guess build names the absent sections too). */
export interface CharacterAssetSection {
  name: string;
  law: string;
  present: boolean;
}

/** The wire-shaped input (structural: the adherentDna result and the
 *  worker's wire DNA both satisfy it). */
export interface CharacterAssetInput {
  name?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  robeColor?: string | null;
  robeAccent?: string | null;
  skinTone?: string | null;
  weaponType?: string | null;
  bladeColor?: string | null;
  build?: string | null;
  beard?: boolean | null;
  sheetFields?: string[];
  conformFactor?: number;
  silhouetteShape?: {
    height: number; shoulders: number; torso: number; sleeves: number; skirt: number; hair: number;
    fields?: string[];
  } | null;
  faceShape?: string | null;
  faceProfile?: {
    jawTaper: number; chinFwd: number; browFwd: number; cheekOut: number; noseLen: number; eyeScale: number;
    fields?: string[];
  } | null;
  materialProfile?: {
    skinSss: number; skinRough: number; skinWarmth: number; rim: number;
    clothRamp: number; clothSheen: number; clothWeave: number; hairRough: number;
    fields?: string[];
  } | null;
  hairShade?: {
    melanin: number; redness: number; radial: number; longitudinal: number;
    fields?: string[];
  } | null;
  skinDepth?: {
    weight: number; radius: number; scale: number; coat: number; coatRough: number;
    fields?: string[];
  } | null;
  groomProfile?: {
    sweep: number; flow: number; flyaway: number; taper: number;
    fields?: string[];
  } | null;
}

export interface CharacterAssetManifest {
  manifestVersion: number;
  lawVersion: number;
  name: string;
  hash: string;
  sections: CharacterAssetSection[];
  presentCount: number;
  sheetOwned: string[];
  validation: {
    bar: number;
    judge: "readings";
    rule: 69;
  };
}

// ── the canonical key formatting (mirrored bit-exactly in the worker) ──

/** A string field: trimmed, or "-" when empty. */
function st(v: unknown): string {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim();
  return s ? s : "-";
}

/** A hex field: trimmed + lowercased (the read's case is honest
 *  noise; the derivation is case-insensitive and so is the key). */
function hx(v: unknown): string {
  if (v === null || v === undefined) return "-";
  const s = String(v).trim().toLowerCase();
  return s ? s : "-";
}

/** A factor: three decimals, or "-" when not a finite number. */
function f3(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  return v.toFixed(3);
}

/** A trait list: "+"-joined, or "-" when empty. */
function fl(v: unknown): string {
  if (!Array.isArray(v)) return "-";
  const parts = v.map((s) => String(s).trim()).filter(Boolean);
  return parts.length > 0 ? parts.join("+") : "-";
}

function beardToken(v: unknown): string {
  return v ? "beard" : "clean";
}

function profileToken(prefix: string, prof: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!prof || typeof prof !== "object") return `${prefix}:-`;
  const parts = keys.map((k) => f3(prof[k]));
  return `${prefix}:${parts.join(",")}`;
}

/**
 * The DETERMINISTIC master key - the wire truth, canonicalized:
 * the identity fields, the conformance, and every profile the
 * sheet read compiled, absent ones named "-". Mirrored bit-exactly
 * in the worker (character_asset_hash). The per-shot resolutions
 * (the tiers, the worn keys, the counts) are NEVER inside the key.
 */
export function characterAssetKey(dna: CharacterAssetInput): string {
  const sf = fl(dna.sheetFields ?? []);
  const sh = profileToken(
    "sh",
    dna.silhouetteShape as Record<string, unknown> | null | undefined,
    ["height", "shoulders", "torso", "sleeves", "skirt", "hair"],
  );
  const fc = profileToken(
    "fc",
    dna.faceProfile as Record<string, unknown> | null | undefined,
    ["jawTaper", "chinFwd", "browFwd", "cheekOut", "noseLen", "eyeScale"],
  );
  const mt = profileToken(
    "mt",
    dna.materialProfile as Record<string, unknown> | null | undefined,
    ["skinSss", "skinRough", "skinWarmth", "rim", "clothRamp", "clothSheen", "clothWeave", "hairRough"],
  );
  const hs = profileToken(
    "hs",
    dna.hairShade as Record<string, unknown> | null | undefined,
    ["melanin", "redness", "radial", "longitudinal"],
  );
  const sd = profileToken(
    "sd",
    dna.skinDepth as Record<string, unknown> | null | undefined,
    ["weight", "radius", "scale", "coat", "coatRough"],
  );
  const gr = profileToken(
    "gr",
    dna.groomProfile as Record<string, unknown> | null | undefined,
    ["sweep", "flow", "flyaway", "taper"],
  );
  return [
    "107",
    st(dna.name),
    st(dna.hairStyle),
    hx(dna.hairColor),
    hx(dna.robeColor),
    hx(dna.robeAccent),
    hx(dna.skinTone),
    st(dna.weaponType),
    hx(dna.bladeColor),
    st(dna.build),
    beardToken(dna.beard),
    st(dna.faceShape),
    f3(dna.conformFactor ?? 0.35),
    sf,
    sh,
    fc,
    mt,
    hs,
    sd,
    gr,
    "v1",
  ].join("|");
}

/**
 * The DETERMINISTIC master hash - sha256-16 over the canonical key.
 * The same wire truth always lands the same hash, on both runtimes.
 */
export function characterAssetHash(dna: CharacterAssetInput): string {
  return createHash("sha256").update(characterAssetKey(dna), "utf8").digest("hex").slice(0, 16);
}

// ── the manifest compiler ──

/**
 * THE CHARACTER IS ONE ASSET (pure): compile the manifest from the
 * wire truth. Every section names its law and whether the sheet
 * read earned it; the validation profile carries the release floor
 * and names THE READINGS as its judge (rule 69). Deterministic.
 */
export function compileCharacterAsset(dna: CharacterAssetInput, bar: number): CharacterAssetManifest {
  const present = (ok: boolean): boolean => ok;
  const sections: CharacterAssetSection[] = [
    {
      name: "canonicalIdentity",
      law: "the sheet read's own fields own the hexes, the style, the build (rule 55)",
      present: present(true),
    },
    {
      name: "baseMesh",
      law: "the silhouette sentence shapes the mesh (rule 56)",
      present: present(!!dna.silhouetteShape),
    },
    {
      name: "sculptLayers",
      law: "the face family sculpts the head, the carve's planes at depth (rules 57, 65)",
      present: present(!!dna.faceProfile),
    },
    {
      name: "maps",
      law: "the spherical-UV bake worn below the hero (tangent normal + cavity, rule 65) and the wrinkle set the expression drives (rule 68)",
      present: present(!!dna.faceProfile),
    },
    {
      name: "materials",
      law: "the hexes grade the surface (rule 58): the melanin dye (rule 64), the living skin depth (rule 66)",
      present: present(!!dna.materialProfile),
    },
    {
      name: "facialRig",
      law: "seven shape keys (browKnit, cheekRaise, mouthCorner, jawOpen, mouthWide, mouthRound, lipPress) driven live by the expression and speech programs (rules 59, 67, 68)",
      present: present(true),
    },
    {
      name: "groom",
      law: "the strand LOD: hero / standard / cards by framing (rules 60, 64, 69)",
      present: present(!!dna.groomProfile),
    },
    {
      name: "wardrobe",
      law: "the garment truth the DNA owns: robe, accent, weapon, blade energy",
      present: present(true),
    },
    {
      name: "lod",
      law: "the lens RESOLVES the asset per shot - the close framings earn the hero carve and the hero strands, the middle the standard, the wide the cards; the asset never moves with the lens",
      present: present(true),
    },
    {
      name: "validationProfile",
      law: "the release floor judged by THE READINGS (rule 69): COMPILED until the readings clear the bar - no structural proof validates a face",
      present: present(true),
    },
  ];
  const sheetOwned = Array.isArray(dna.sheetFields) ? dna.sheetFields.filter((f) => typeof f === "string" && f.trim()) : [];
  const hash = characterAssetHash(dna);
  return {
    manifestVersion: CHARACTER_ASSET_MANIFEST_VERSION,
    lawVersion: CHARACTER_ASSET_LAW_VERSION,
    name: st(dna.name) === "-" ? "unnamed" : String(dna.name).trim(),
    hash,
    sections,
    presentCount: sections.filter((s) => s.present).length,
    sheetOwned,
    validation: { bar, judge: "readings", rule: 69 },
  };
}

/** The manifest as one honest ledger line (the store reports it). */
export function characterAssetLine(m: CharacterAssetManifest): string {
  return `character asset ${m.name}: master ${m.hash}, ${m.presentCount}/${m.sections.length} sections compiled${
    m.sheetOwned.length > 0 ? ` (the sheet read owns ${m.sheetOwned.join(", ")})` : " (guess build - the sheet read earned nothing)"
  }, validated by the readings at bar ${Math.round(m.validation.bar * 100)}% (rule ${m.validation.rule})`;
}

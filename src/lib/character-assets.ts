/**
 * character-assets - the CharacterAsset store (AnimeOS 5.0,
 * iteration 95). The pure manifest law lives in
 * blender/character-asset.ts; this module lands it as a FIRST-CLASS
 * OBJECT: one versioned row per cast member, keyed
 * (projectId, characterId), versioned by the deterministic master
 * hash - the same hash compiles to the same version (idempotent),
 * a moved hash re-versions the asset honestly. The validation
 * profile is written by the identity repair pass: the readings
 * (rule 69) are the judge, so an asset is COMPILED until its
 * member's readings clear the bar, VALIDATED when they do.
 */

import { db } from "@/lib/db";
import {
  compileCharacterAsset,
  characterAssetHash,
  characterAssetLine,
  type CharacterAssetInput,
  type CharacterAssetManifest,
} from "@/lib/blender/character-asset";

export interface CharacterAssetUpsertResult {
  characterAssetId: string;
  name: string;
  masterHash: string;
  version: number;
  moved: boolean; // the master hash changed - the asset re-versioned
  created: boolean;
  line: string;
  manifest: CharacterAssetManifest;
}

/**
 * Compile the manifest from the member's wire DNA and land it: a
 * first render creates the asset at version 1; a render whose DNA
 * compiles the SAME master hash touches nothing (design once,
 * render many); a MOVED hash re-versions the asset (version + 1)
 * and resets the validation standing to COMPILED - a changed asset
 * is unproven until the readings say otherwise. The render path
 * never throws on this: a store hiccup degrades to an absent row,
 * named by the caller.
 */
export async function upsertCharacterAsset(
  projectId: string,
  characterId: string,
  name: string,
  dna: CharacterAssetInput,
  bar: number,
): Promise<CharacterAssetUpsertResult> {
  const manifest = compileCharacterAsset(dna, bar);
  const existing = await db.characterAsset.findUnique({
    where: { projectId_characterId: { projectId, characterId } },
  });

  if (!existing) {
    const row = await db.characterAsset.create({
      data: {
        projectId,
        characterId,
        name: manifest.name,
        version: 1,
        status: "COMPILED",
        masterHash: manifest.hash,
        manifest: JSON.stringify(manifest),
        bar,
      },
    });
    return {
      characterAssetId: row.id,
      name: manifest.name,
      masterHash: manifest.hash,
      version: 1,
      moved: false,
      created: true,
      line: characterAssetLine(manifest),
      manifest,
    };
  }

  if (existing.masterHash === manifest.hash) {
    // design once, render many: the same asset, untouched
    return {
      characterAssetId: existing.id,
      name: manifest.name,
      masterHash: manifest.hash,
      version: existing.version,
      moved: false,
      created: false,
      line: characterAssetLine(manifest),
      manifest,
    };
  }

  const version = existing.version + 1;
  const row = await db.characterAsset.update({
    where: { id: existing.id },
    data: {
      name: manifest.name,
      version,
      status: "COMPILED",
      masterHash: manifest.hash,
      manifest: JSON.stringify(manifest),
      bar,
      lastReadings: null,
      validatedAt: null,
    },
  });
  return {
    characterAssetId: row.id,
    name: manifest.name,
    masterHash: manifest.hash,
    version,
    moved: true,
    created: false,
    line: characterAssetLine(manifest),
    manifest,
  };
}

// ── the validation profile (the readings are the judge, rule 69) ──

export interface CharacterAssetReadings {
  at: string; // ISO timestamp of the pass that judged
  source: string; // the identity source the readings ran at (RENDER)
  bar: number;
  before: { average: number | null; worst: number | null };
  after: { standing: string; average: number | null; worst: number | null; worstRef: string | null };
  verdict: string; // the member verdict the honest set named
  shots: Array<{ ref: string; before: number; after: number | null; verdict: string }>;
}

/**
 * Write the readings onto the member's asset row: the validation
 * profile's judge is the readings, so the row names the verdicts
 * the honest ledger earned and flips to VALIDATED only when the
 * standing after the pass clears the bar. A member with no asset
 * row yet is honestly skipped (the asset compiles on the render
 * path; a production that never rendered has nothing to validate).
 */
export async function recordCharacterAssetReadings(
  projectId: string,
  characterId: string,
  readings: CharacterAssetReadings,
): Promise<{ ok: boolean; note: string }> {
  const row = await db.characterAsset.findUnique({
    where: { projectId_characterId: { projectId, characterId } },
  });
  if (!row) return { ok: false, note: "no CharacterAsset row yet - the readings judged nothing" };
  const cleared = readings.after.standing !== "BELOW" && readings.after.standing !== "ABSENT";
  await db.characterAsset.update({
    where: { id: row.id },
    data: {
      lastReadings: JSON.stringify(readings),
      status: cleared ? "VALIDATED" : "COMPILED",
      ...(cleared ? { validatedAt: new Date(readings.at) } : {}),
    },
  });
  return {
    ok: true,
    note: cleared
      ? `validated by the readings: ${readings.after.standing} at bar ${Math.round(readings.bar * 100)}%`
      : `still compiled: ${readings.after.standing} at bar ${Math.round(readings.bar * 100)}% - the gap is named, never averaged away`,
  };
}

/** The master hash of a member's stored asset row (null when absent). */
export async function characterAssetHashFor(
  projectId: string,
  characterId: string,
): Promise<{ hash: string | null; version: number | null; status: string | null }> {
  const row = await db.characterAsset.findUnique({
    where: { projectId_characterId: { projectId, characterId } },
  });
  return row ? { hash: row.masterHash, version: row.version, status: row.status } : { hash: null, version: null, status: null };
}

// re-exported so callers import one module's surface
export { characterAssetHash, compileCharacterAsset };

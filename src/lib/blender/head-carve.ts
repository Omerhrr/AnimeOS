/**
 * head-carve - THE HEAD IS CARVED AT DEPTH (iteration 90, Layer A -
 * the geometry slice the measured cast gap named: the loop's own
 * readings landed at the fidelity floor because the closeup still
 * read "a featureless, low-poly 3D model" - a 642-vertex head under
 * a closeup lens IS low-poly, no palette or grade outranks it).
 *
 * The carve answers the FRAMING (the groom's LOD law, head edition),
 * BUDGETED BY THE MEASURED RENDER COST (the memory-scaling probe:
 * this Blender build's full-scene render holds ~170KB per head
 * vertex through the depsgraph/Cycles sync - a 10k-vertex head
 * peaked at 2.4GB against this machine's 4GB cgroup and OOMed; the
 * hero carve is budgeted at the level the pipeline survives):
 *   - the close framings earn the HERO CARVE - subdivisions 5,
 *     2,562 vertices, sculpted with the full 23-plane set (the
 *     base eight + the fifteen hero planes) and BAKED DOWN;
 *   - every level below keeps the LIGHT HEAD - subdivisions 4, the
 *     642-vertex law the rig contract has ridden since iteration 82
 *     - and WEARS the hero bake (the depth the light mesh cannot
 *     carry, it wears).
 *
 * And the depth BAKES DOWN: the hero carve is baked (selected to
 * active, hi -> lo) into a tangent-space NORMAL map + a cavity (AO)
 * map cached by the DETERMINISTIC bake key - a sha256-16 over the
 * face profile's own factors - so the reduced and light heads WEAR
 * the hero carve's detail. Sculpt deep, bake down, render light.
 * The displacement stays REAL (the hero mesh IS the displacement);
 * the normal + cavity pair carries the depth to every level below.
 *
 * Laws of the module:
 *  - bounded: the depth tiers are three named levels, never a wild
 *    number;
 *  - deterministic: the same framing always lands the same depth;
 *    the same face profile always lands the same bake key (the
 *    worker mirrors headBakeKeyHash bit-exactly - one law, two
 *    runtimes);
 *  - honest: the planes are NAMED, and a level without the cached
 *    bake renders unbaked (the wide head honest until a hero carve
 *    writes the cache).
 */

import { createHash } from "node:crypto";

export type HeadDepth = 4 | 5;

/** The framing tiers the groom's LOD law already owns (mirrored). */
export function headDepthFactor(shotType: string | null | undefined): HeadDepth {
  const st = String(shotType ?? "").toUpperCase();
  if (st === "CLOSEUP" || st === "EXTREME_CLOSEUP" || st === "MCU") return 5;
  return 4;
}

/**
 * The anatomical plane set the deep carve sculpts (the base eight
 * laws since iteration 82 stay; nine to seventeen are the hero
 * planes). NAMES ONLY - the numbers live in the worker's carve.
 */
export const HEAD_PLANES_BASE = [
  "jaw taper",
  "chin",
  "brow ridge",
  "eye sockets",
  "cheekbones",
  "nose wedge",
  "occiput",
  "ears",
] as const;

export const HEAD_PLANES_DEEP = [
  "nose bridge",
  "nose tip",
  "nostril wings",
  "philtrum",
  "upper lip",
  "cupid's bow",
  "lower lip",
  "lip line",
  "upper eyelids",
  "lower lids",
  "tear ducts",
  "nasolabial creases",
  "temple hollows",
  "jawline edge",
  "chin ball",
] as const;

/** The planes a carve at the named depth applies (named, in order). */
export function headPlanesFor(depth: HeadDepth): string[] {
  return depth >= 5 ? [...HEAD_PLANES_BASE, ...HEAD_PLANES_DEEP] : [...HEAD_PLANES_BASE];
}

/** The face profile factors the bake key hashes (the worker's carve inputs). */
export interface HeadBakeKeySource {
  jawTaper: number;
  chinFwd: number;
  browFwd: number;
  cheekOut: number;
  noseLen: number;
}

/**
 * The DETERMINISTIC bake key - sha256-16 over the face profile's own
 * factors (NOT the mesh: the cache must be shared by every depth of
 * the same face, and a 5-level mesh hashes differently from a 6).
 * Mirrored bit-exactly in the worker (head_bake.bake_key).
 */
export function headBakeKeyHash(f: HeadBakeKeySource): string {
  const key = `90|${f.jawTaper.toFixed(3)}|${f.chinFwd.toFixed(3)}|${f.browFwd.toFixed(3)}|${f.cheekOut.toFixed(3)}|${f.noseLen.toFixed(3)}|v1`;
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

/** The bake evidence the worker rides on the sculpt state. */
export interface HeadBakeEvidence {
  normal: string;
  cavity: string;
  size: number;
  fingerprint: string; // the saved normal map's sha256-16
  key: string;
}

/** The carve as one ledger line (the render state reports it). */
export function headCarveLine(depth: HeadDepth, planes: number, bake: HeadBakeEvidence | null): string {
  const d = depth >= 5 ? "hero carve (subdivisions 5)" : "light head (subdivisions 4)";
  const b = bake ? `; baked down (${bake.size}px normal + cavity, key ${bake.key})` : "; unbaked";
  return `head carved at depth: ${d}, ${planes} planes${b}`;
}

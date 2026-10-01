/**
 * craft - THE FIGURE IS CRAFTED, NOT ASSEMBLED (iteration 106, the
 * gate's remaining work order).
 *
 * The binding put the sheets' colors, silhouette and face families
 * on the pixels, but the vision scorer still read the figure as "a
 * low-poly 3D robot": the designed body's ORGANIC parts were raw
 * hard-edged primitives - brows, mouth, skirt panels, sash tail,
 * palms and fingers were un-smoothed CUBES, the limbs 16-segment
 * cylinders, the fingers square robotic segments. No palette fixes
 * a blocky read, so the builder now CRAFTS every part the audience
 * reads as cloth or skin:
 *
 *   - a BEVEL softens every organic box's edges (the hard 90-degree
 *     edge line that reads "robot"), angle-limited, smooth-shaded;
 *   - the fingers grow as ROUNDED CAPSULES instead of boxes (the
 *     square-segment hand was the loudest machine tell);
 *   - every curved primitive the camera reads lifts its resolution
 *     (cylinders and cones to 24 segments).
 *
 * The RIG CONTRACT rides untouched: the craft moves MESH only - the
 * anchor empties, the pivots, the head sculpt's proven faceHash, the
 * shape keys and the framing math keep their coordinates.
 *
 * The DETERMINISTIC craft hash (sha256-16 over the canonical law
 * key, versioned 106) is mirrored bit-exactly in the worker's
 * craft_hash - one law, two runtimes - and the law's version STAMPS
 * the character asset key (95 -> 106), so the library assets
 * RE-BUILD with the crafted meshes: a craft change is an asset
 * change, the pixels must get it on the asset path too.
 */

import { createHash } from "node:crypto";

export const CRAFT_LAW_VERSION = 106;

/** The bevel width per organic part family (mesh-local units). */
export const CRAFT_BEVELS: Record<string, number> = {
  brow: 0.0025,
  mouth: 0.0022,
  skirt: 0.006,
  sashTail: 0.004,
  palm: 0.0025,
  finger: 0.0012,
  thumb: 0.0012,
  guard: 0.002,
  blade: 0.0008,
};

export const CRAFT_BEVEL_SEGMENTS = 2;

/** The curved primitives the camera reads lift to this many segments. */
export const CRAFT_CYL_SEGMENTS = 24;

export function craftKey(): string {
  const parts = Object.entries(CRAFT_BEVELS)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v.toFixed(4)}`)
    .join(",");
  return `${CRAFT_LAW_VERSION}|bevel:${parts}|seg:${CRAFT_BEVEL_SEGMENTS}|cyl:${CRAFT_CYL_SEGMENTS}|v1`;
}

export function craftHash(): string {
  return createHash("sha256").update(craftKey()).digest("hex").slice(0, 16);
}

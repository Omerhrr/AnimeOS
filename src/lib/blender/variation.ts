import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// VARIATION PRESETS (the fourth design law, beside MATERIAL,
// LIGHTING and MOTION - iteration 53)
//
// A designed asset that repeats itself is a wallpaper. Production
// sets need sixty rocks that are NOT one rock copied sixty times:
// real Blender GEOMETRY NODES scatter instances with seeded jitter
// across a carrier surface (SCATTER) or lay them along a
// deterministic spine (ARRAY). A variation PRESET is the named,
// reusable layout law of the studio: design_variation registers
// one (DesignPreset kind VARIATION), and blender_asset_build with
// variation:<name> attaches the REAL GN tree inside the .blend
// (bridges/blender/variation_nodes.py) - the modifier travels to
// every render, deterministic because the seed is law.
// ─────────────────────────────────────────────────────────────

export type VariationKind = "scatter" | "array";

export interface VariationSpec {
  name: string;
  variation: VariationKind;
  count: number; // scatter: instances across the carrier; array: steps on the spine
  seed: number;
  scaleJitter: number; // 0..1 - per-instance size spread
  rotJitter: number; // 0..1 - per-instance pose spread (full Z circle at 1)
  spread: number; // array only: positional jitter along the spine (0..1)
  layout: "line" | "grid"; // array only
  carrier: string | null; // object name hint (the surface receiving instances)
  source: string | null; // object name hint (the piece being instanced)
}

export const VARIATION_KINDS: VariationKind[] = ["scatter", "array"];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Validate + normalize a design_variation registration into the spec
 * JSON the Blender variation builder consumes. Returns an error string
 * or the ready-to-persist spec. */
export function compileVariationSpec(input: {
  name: string;
  variation: string;
  count?: number | null;
  seed?: number | null;
  scaleJitter?: number | null;
  rotJitter?: number | null;
  spread?: number | null;
  layout?: string | null;
  carrier?: string | null;
  source?: string | null;
}): { ok: true; spec: VariationSpec } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  const variation = String(input.variation ?? "").trim().toLowerCase();
  if (!VARIATION_KINDS.includes(variation as VariationKind)) {
    return { ok: false, error: `unknown variation "${variation}" - allowed: ${VARIATION_KINDS.join(", ")}` };
  }
  const count = Math.round(clamp(Number(input.count ?? (variation === "scatter" ? 40 : 8)), 1, 400));
  const seed = Math.round(clamp(Number(input.seed ?? 7), 0, 65535));
  const scaleJitter = clamp(Number(input.scaleJitter ?? 0.35), 0, 1);
  const rotJitter = clamp(Number(input.rotJitter ?? 0.8), 0, 1);
  const spread = clamp(Number(input.spread ?? 0.25), 0, 1);
  const layoutRaw = String(input.layout ?? "line").toLowerCase();
  const layout: "line" | "grid" = layoutRaw === "grid" ? "grid" : "line";
  const carrier = String(input.carrier ?? "").trim() || null;
  const source = String(input.source ?? "").trim() || null;
  return {
    ok: true,
    spec: { name, variation: variation as VariationKind, count, seed, scaleJitter, rotJitter, spread, layout, carrier, source },
  };
}

/** The default variation per asset kind (the fix pass bakes this):
 * an environment breathes through a rock scatter; props and
 * creatures get an honest NEUTRAL default (no fake ground scatter on
 * a sword) - the audit only demands variation of environments. */
export const DEFAULT_VARIATION_BY_KIND: Record<string, VariationSpec | null> = {
  ENVIRONMENT: {
    name: "(default environment scatter)",
    variation: "scatter",
    count: 48,
    seed: 42,
    scaleJitter: 0.4,
    rotJitter: 0.9,
    spread: 0,
    layout: "line",
    carrier: null,
    source: null,
  },
  CHARACTER: null,
  PROP: null,
  CREATURE: null,
};

/** Write the spec file the builder's --variation flag consumes. */
export function writeVariationSpec(spec: VariationSpec, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "variation.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

/** The variation JSON for an asset's meta audit trail. */
export function variationMetaEntry(spec: VariationSpec, summary: Record<string, unknown> | null): Record<string, unknown> {
  return {
    name: spec.name,
    variation: spec.variation,
    count: spec.count,
    seed: spec.seed,
    ...(summary ?? {}),
  };
}

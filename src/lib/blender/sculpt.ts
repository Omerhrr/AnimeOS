import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// SCULPT + RETOPOLOGY SPECS (the sixth design law, iteration 55)
//
// A deterministic builder makes clean, regular surfaces - and a
// production-grade asset is FINISHED: terrain that rolls, hides
// with striation, robes with folds. A sculpt PRESET is the named,
// reusable surface law of the studio: layered, seeded value-noise
// displacement carved along the normals (swell / fold / grain over
// an applied subdivision), deterministic because the seed is law -
// the same spec always carves the same surface. The retopo pass is
// the topology budget: collapse-decimate toward the kind's triangle
// budget and VERIFY the shape survived (bbox drift <= 5%).
//
// design_sculpt registers one (DesignPreset kind SCULPT);
// blender_asset_build with sculpt:<name> carves it into the .blend;
// blender_retopo runs the budget pass on demand; the audit weighs
// the surface (SCULPT) and the budget (TOPOLOGY).
// ─────────────────────────────────────────────────────────────

export type SculptLayerKind = "swell" | "fold" | "grain";

export interface SculptLayer {
  kind: SculptLayerKind;
  intensity: number; // 0..2 multiplier over the layer's base amplitude
  scale: number; // noise frequency in object units (higher = finer)
}

export interface SculptSpec {
  name: string;
  layers: SculptLayer[];
  subdivision: number; // 0..3 - the subsurf level applied BEFORE carving
  seed: number; // the seed law: same spec + seed = same surface
  parts: string[]; // name-pattern filters (empty = every mesh)
}

export interface RetopoSpec {
  budget: number; // the kind's triangle budget (collapse target)
  parts: string[]; // name-pattern filters (empty = every mesh)
}

export const SCULPT_LAYER_KINDS: SculptLayerKind[] = ["swell", "fold", "grain"];

const DEFAULT_SCALE_BY_KIND: Record<SculptLayerKind, number> = {
  swell: 1.4,
  fold: 4.5,
  grain: 14.0,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Validate + normalize a design_sculpt registration into the spec
 * JSON the Blender sculpt pass consumes. Returns an error string or
 * the ready-to-persist spec. */
export function compileSculptSpec(input: {
  name: string;
  layers: unknown; // array of {kind, intensity?, scale?}
  subdivision?: number | null;
  seed?: number | null;
  parts?: string[] | string | null;
}): { ok: true; spec: SculptSpec } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };

  const rawLayers = Array.isArray(input.layers) ? input.layers : null;
  if (!rawLayers || rawLayers.length === 0) {
    return { ok: false, error: "layers must be a non-empty JSON array of {kind: swell | fold | grain, intensity?, scale?}" };
  }
  if (rawLayers.length > 6) {
    return { ok: false, error: "at most 6 layers - a surface is carved in passes, not buried" };
  }
  const layers: SculptLayer[] = [];
  for (const raw of rawLayers) {
    const row = raw as Record<string, unknown>;
    const kind = String(row?.kind ?? "").trim().toLowerCase();
    if (!SCULPT_LAYER_KINDS.includes(kind as SculptLayerKind)) {
      return { ok: false, error: `unknown layer kind "${kind}" - allowed: ${SCULPT_LAYER_KINDS.join(", ")}` };
    }
    const intensity = clamp(Number(row?.intensity ?? 1), 0, 2);
    const scale = clamp(Number(row?.scale ?? DEFAULT_SCALE_BY_KIND[kind as SculptLayerKind]), 0.05, 60);
    layers.push({ kind: kind as SculptLayerKind, intensity, scale });
  }
  const subdivision = Math.round(clamp(Number(input.subdivision ?? 1), 0, 3));
  const seed = Math.round(clamp(Number(input.seed ?? 7), 0, 65535));
  const partsRaw = input.parts === undefined || input.parts === null
    ? []
    : typeof input.parts === "string"
      ? input.parts.split(",").map((p) => p.trim()).filter(Boolean)
      : input.parts;
  const parts = (Array.isArray(partsRaw) ? partsRaw : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 12);
  return { ok: true, spec: { name, layers, subdivision, seed, parts } };
}

/** Validate a retopo budget. The pass itself is an operation, not a
 * named law - but the budget is still clamped at the boundary. */
export function compileRetopoSpec(input: {
  budget?: number | null;
  parts?: string[] | string | null;
}): { ok: true; spec: RetopoSpec } | { ok: false; error: string } {
  const budget = Math.round(clamp(Number(input.budget ?? 20_000), 200, 2_000_000));
  const partsRaw = input.parts === undefined || input.parts === null
    ? []
    : typeof input.parts === "string"
      ? input.parts.split(",").map((p) => p.trim()).filter(Boolean)
      : input.parts;
  const parts = (Array.isArray(partsRaw) ? partsRaw : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 12);
  return { ok: true, spec: { budget, parts } };
}

/** Triangle budgets per asset kind: the topology law. A sculpt pass
 * legitimately GROWS a mesh (subdivision); the budget is what keeps
 * growth honest - over budget is a TOPOLOGY issue, not a vibe. */
export const DEFAULT_RETOPO_BUDGET: Record<string, number> = {
  CHARACTER: 80_000,
  ENVIRONMENT: 120_000,
  PROP: 20_000,
  CREATURE: 60_000,
};

/** The default sculpt per asset kind (the fix pass bakes this):
 * environments get terrain, creatures get hide, characters get
 * robe folds; props stay honest (their finish is bevels + runes,
 * the DETAIL criterion's job). */
export const DEFAULT_SCULPT_BY_KIND: Record<string, SculptSpec | null> = {
  ENVIRONMENT: {
    name: "(default terrain sculpt)",
    layers: [
      { kind: "swell", intensity: 1.0, scale: 1.2 },
      { kind: "fold", intensity: 0.8, scale: 3.6 },
      { kind: "grain", intensity: 0.6, scale: 12.0 },
    ],
    subdivision: 1,
    seed: 42,
    parts: [],
  },
  CREATURE: {
    name: "(default hide sculpt)",
    layers: [
      { kind: "fold", intensity: 0.9, scale: 5.0 },
      { kind: "grain", intensity: 0.7, scale: 16.0 },
    ],
    subdivision: 1,
    seed: 19,
    parts: [],
  },
  CHARACTER: {
    name: "(default robe sculpt)",
    layers: [
      { kind: "fold", intensity: 0.7, scale: 6.0 },
    ],
    subdivision: 1,
    seed: 11,
    parts: ["Robe", "Skirt", "Sleeve", "Sash", "Cape", "Cloth"],
  },
  PROP: null,
};

/** Write the spec file the builder's --sculpt / --retopo flag consumes. */
export function writeSculptSpec(spec: SculptSpec, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "sculpt.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

export function writeRetopoSpec(spec: RetopoSpec, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "retopo.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

/** The sculpt JSON for an asset's meta audit trail. */
export function sculptMetaEntry(spec: SculptSpec, summary: Record<string, unknown> | null): Record<string, unknown> {
  return {
    name: spec.name,
    layerCount: spec.layers.length,
    subdivision: spec.subdivision,
    seed: spec.seed,
    ...(summary ?? {}),
    applied: true,
  };
}

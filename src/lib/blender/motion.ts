import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// MOTION PRESETS (the third design law, beside MATERIAL/LIGHTING)
//
// A production-grade asset is not a statue: the serpent slithers,
// the raptor's wings beat, the sword hovers while its runes breathe.
// A motion PRESET is the named, reusable performance of the studio:
// design_motion registers one (DesignPreset kind MOTION), and
// blender_asset_build with motion:<name> bakes it as a REAL armature
// + looping Action inside the asset's .blend (motion_rig.py) and
// renders the animated preview loop that proves it.
// ─────────────────────────────────────────────────────────────

export type MotionKind = "PROP" | "CREATURE";

export const MOTIONS_BY_KIND: Record<MotionKind, string[]> = {
  PROP: ["hover", "spin", "pulse", "hover-spin"],
  CREATURE: ["slither", "flap", "walk", "prowl", "breathe", "idle"],
};

/** The default performance per archetype (the fix pass bakes this). */
export const DEFAULT_MOTION_BY_ARCHETYPE: Record<string, string> = {
  prop: "hover",
  serpent: "slither",
  bird: "flap",
  quadruped: "walk",
  generic: "breathe",
};

export interface MotionSpec {
  name: string;
  motion: string;
  speed: number;
  amplitude: number;
  cycleFrames: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Validate + normalize a design_motion registration into the spec
 * JSON the Blender motion rig consumes. Returns an error string or
 * the ready-to-persist spec. */
export function compileMotionSpec(input: {
  name: string;
  kind: string;
  motion: string;
  speed?: number | null;
  amplitude?: number | null;
  cycleFrames?: number | null;
}): { ok: true; spec: MotionSpec } | { ok: false; error: string } {
  const kind = String(input.kind ?? "").toUpperCase() as MotionKind;
  if (kind !== "PROP" && kind !== "CREATURE") {
    return { ok: false, error: "kind must be PROP or CREATURE - a character performs through the directed pose system, an environment is static by design" };
  }
  const motion = String(input.motion ?? "").trim().toLowerCase();
  if (!MOTIONS_BY_KIND[kind].includes(motion)) {
    return { ok: false, error: `unknown ${kind} motion "${motion}" - allowed: ${MOTIONS_BY_KIND[kind].join(", ")}` };
  }
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  const speed = clamp(Number(input.speed ?? 1), 0.2, 3);
  const amplitude = clamp(Number(input.amplitude ?? 1), 0.2, 3);
  const cycleFrames = Math.round(clamp(Number(input.cycleFrames ?? 24), 16, 48));
  return { ok: true, spec: { name, motion, speed, amplitude, cycleFrames } };
}

/** Write the spec file the builder's --motion flag consumes. */
export function writeMotionSpec(spec: MotionSpec, dir: string, size: number, archetype: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "motion.json");
  fs.writeFileSync(file, JSON.stringify({ ...spec, size, archetype }, null, 2));
  return file;
}

/** The motion JSON for an asset's meta audit trail. */
export function motionMetaEntry(spec: MotionSpec): Record<string, unknown> {
  return { name: spec.name, motion: spec.motion, speed: spec.speed, amplitude: spec.amplitude, cycleFrames: spec.cycleFrames };
}

import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// DIRECTED FX (iteration 56) - THE BEATS IGNITE
//
// The camera performs the beats (the motion grammar), the cloth and
// hair RIDE the beats (the secondary motion rig), and now the WORLD
// answers them. A directed FX program is a named, seeded recipe the
// worker compiles into REAL emissive geometry driven per frame by
// the SAME beat clock as the camera and the springs:
//
//   TRAIL  - the weapon's energy ribbon: an emissive fan at the
//            blade whose sweep and glow track the pose velocity
//            (a fast slash flares the trail, a hold fades it).
//   BURST  - the impact: a shockwave ring plus emissive shards that
//            ignite at each bound beat's boundary, expand and fade.
//   AURA   - the qi shell: an emissive torus at the figure's waist
//            breathing with the beat's wind call - the same driver
//            the cloth hangs from - over a slow fixed phase.
//   MOTES  - the air itself: a seeded scatter of tiny emissive
//            points drifting through the volume, their sway and
//            rise scaling with the beat's wind.
//
// Programs ride the grammar by INDEX (the beat numbers they answer)
// or ALL; a BURST fires when the playhead ENTERS a bound beat, so
// the impact lands where the cut lands. Colors default to the
// hero's energy color, so a production's qi stays its own.
//
// The vocabulary mirrors the worker's fx pass
// (bridges/blender/fx_pass.py) exactly - the compiler refuses
// anything the worker cannot perform.
// ─────────────────────────────────────────────────────────────

export const FX_KINDS = ["TRAIL", "BURST", "AURA", "MOTES"] as const;

export type FxKind = (typeof FX_KINDS)[number];

export interface FxProgram {
  kind: FxKind;
  color?: string | null; // hex RGB; null = the hero's energy color
  intensity?: number; // 0..1 (default 0.7)
  beats?: number[] | "ALL"; // which grammar beat indices it answers (0-based); default ALL
  note?: string | null;
}

export interface FxSpec {
  name: string;
  programs: FxProgram[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/** Validate + normalize an FX spec: 1..6 programs, known kinds, hex
 * colors, clamped intensity, beat bindings that are "ALL" or indices
 * 0..11 (the worker bounds-checks against the shot's actual grammar
 * and skips a program whose every binding is out of range - honestly,
 * in the state). A color the worker cannot parse is refused here -
 * a typo never reaches a shoot. */
export function compileFxSpec(input: {
  name: string;
  programs: unknown;
}): { ok: true; spec: FxSpec } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  let raw: unknown[] = [];
  if (typeof input.programs === "string") {
    try {
      raw = JSON.parse(input.programs) as unknown[];
    } catch {
      return { ok: false, error: "programs must be a JSON array of {kind, color?, intensity?, beats?}" };
    }
  } else if (Array.isArray(input.programs)) {
    raw = input.programs;
  } else {
    return { ok: false, error: "programs must be a JSON array of {kind, color?, intensity?, beats?}" };
  }
  if (raw.length < 1) {
    return { ok: false, error: "an fx program needs at least 1 effect - an empty spectacle is set_shot_fx's job to clear" };
  }
  if (raw.length > 6) {
    return { ok: false, error: "an fx program carries at most 6 effects - more is not spectacle, it is noise" };
  }
  const parsed: FxProgram[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i] as Record<string, unknown>;
    const kind = String(p?.kind ?? "").trim().toUpperCase() as FxKind;
    if (!(FX_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: `program ${i + 1}: unknown kind "${String(p?.kind ?? "")}" - the worker performs: ${FX_KINDS.join(", ")}` };
    }
    let color: string | null = null;
    if (p?.color !== undefined && p?.color !== null && p?.color !== "") {
      const c = String(p.color).trim();
      if (!HEX_RE.test(c)) {
        return { ok: false, error: `program ${i + 1} (${kind}): color must be a hex RGB like #7dd3fc (or omit it to ride the hero's energy color)` };
      }
      color = c.startsWith("#") ? c : `#${c}`;
    }
    let intensity = 0.7;
    if (p?.intensity !== undefined && p?.intensity !== null && p?.intensity !== "") {
      const v = Number(p.intensity);
      if (!Number.isFinite(v)) {
        return { ok: false, error: `program ${i + 1} (${kind}): intensity must be a number 0..1` };
      }
      intensity = clamp01(v);
    }
    let beats: number[] | "ALL" = "ALL";
    if (p?.beats !== undefined && p?.beats !== null && p?.beats !== "" && p?.beats !== "ALL") {
      if (!Array.isArray(p.beats)) {
        return { ok: false, error: `program ${i + 1} (${kind}): beats must be "ALL" or an array of 0-based grammar beat indices` };
      }
      const idxs: number[] = [];
      for (const b of p.beats) {
        const n = Number(b);
        if (!Number.isInteger(n) || n < 0 || n > 11) {
          return { ok: false, error: `program ${i + 1} (${kind}): beat indices must be integers 0..11 (got ${String(b)})` };
        }
        idxs.push(n);
      }
      beats = Array.from(new Set(idxs)).sort((a, b) => a - b);
    }
    parsed.push({
      kind,
      color,
      intensity,
      beats,
      note: p?.note ? String(p.note).slice(0, 140) : null,
    });
  }
  return { ok: true, spec: { name, programs: parsed } };
}

/** The built-in spectacle language - always available by name, the
 * same way the built-in grammars are. Each is a complete answer the
 * world gives the beats. */
export const BUILT_IN_FX: FxSpec[] = [
  {
    name: "The Slash",
    programs: [
      { kind: "TRAIL", intensity: 0.9, note: "the blade draws a ribbon of light through the move" },
      { kind: "BURST", intensity: 0.8, note: "the cut lands - the air breaks at the beat boundary" },
    ],
  },
  {
    name: "Cultivator's Aura",
    programs: [
      { kind: "AURA", intensity: 0.65, note: "the qi shell breathes with the wind call" },
      { kind: "MOTES", intensity: 0.45, note: "spirit dust hangs in the volume" },
    ],
  },
  {
    name: "The Aftermath",
    programs: [
      { kind: "MOTES", intensity: 0.35, note: "the dust settles over what is left" },
    ],
  },
  {
    name: "Storm Break",
    programs: [
      { kind: "BURST", intensity: 0.9, note: "the thunderclap lands on the cut" },
      { kind: "AURA", intensity: 0.7, note: "the storm's charge rides the shell" },
      { kind: "MOTES", intensity: 0.5, note: "rain-light drifts through the hold" },
    ],
  },
];

/** Resolve a built-in fx program by name (case-insensitive). */
export function findBuiltInFx(name: string): FxSpec | null {
  const n = name.trim().toLowerCase();
  return BUILT_IN_FX.find((f) => f.name.toLowerCase() === n) ?? null;
}

/** Serialize a spec for the Shot.fx column / worker payload. */
export function serializeFx(spec: FxSpec): string {
  return JSON.stringify(
    spec.programs.map((p) => ({
      kind: p.kind,
      ...(p.color ? { color: p.color } : {}),
      ...(p.intensity !== undefined ? { intensity: p.intensity } : {}),
      ...(p.beats !== undefined ? { beats: p.beats } : {}),
      ...(p.note ? { note: p.note } : {}),
    })),
  );
}

/** Parse + validate a stored fx column (Shot.fx) back into programs;
 * null when absent or corrupt (an honest absence, never a crash). */
export function parseStoredFx(raw: string | null | undefined): FxProgram[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 1) return null;
    const out: FxProgram[] = [];
    for (const p of parsed) {
      const kind = String((p as Record<string, unknown>)?.kind ?? "").toUpperCase() as FxKind;
      if (!(FX_KINDS as readonly string[]).includes(kind)) return null;
      const beats = (p as Record<string, unknown>)?.beats;
      out.push({
        kind,
        color: (p as Record<string, unknown>)?.color ? String((p as Record<string, unknown>).color) : null,
        intensity: Number.isFinite(Number((p as Record<string, unknown>)?.intensity))
          ? clamp01(Number((p as Record<string, unknown>).intensity))
          : 0.7,
        beats: beats === "ALL" || beats === undefined || beats === null ? "ALL" : (Array.isArray(beats) ? beats.map(Number) : "ALL"),
        note: (p as Record<string, unknown>)?.note ? String((p as Record<string, unknown>).note) : null,
      });
    }
    return out;
  } catch {
    return null;
  }
}

/** Write an fx spec file (unused today - fx rides the job payload,
 * not files - kept for the design-review tooling). */
export function writeFxSpec(spec: FxSpec, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "fx.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

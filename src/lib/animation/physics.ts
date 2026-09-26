// ─────────────────────────────────────────────────────────────
// DIRECTED PHYSICS (iterations 57-58) - THE WORLD OBEYS ITS OWN LAW
//
// The camera performs the beats (the motion grammar), the cloth and
// hair RIDE the beats (the secondary motion rig), the fx answers
// them (the spectacle pass) - and now the SOLID WORLD obeys the
// beats through real ballistics rather than keyframes: gravity,
// bounce, friction, tumble, settle. A directed physics program is a
// named, seeded recipe the worker compiles into real bodies
// integrated per frame by the SAME beat clock as the camera, the
// springs and the fx:
//
//   KNOCK   - a prop takes the hit: when the playhead ENTERS a
//             bound beat, the named prop (a riding library asset's
//             anchor, matched by name) - or a spawned stone vessel
//             when no prop rides (declared in the state) - is
//             struck: impulse velocity away from the figure plus a
//             seeded tumble, bouncing with restitution, rolling
//             under friction, settling to REST.
//   DEBRIS  - the rubble answers: ten seeded chunks resting in a
//             ring around the figure are kicked radially when a
//             bound beat is entered - and LIE where they settle
//             (physics truth: debris never fades like fx).
//   SWAY    - the hanging lantern: a damped pendulum driven by the
//             beat's WIND call - the same driver the cloth hangs
//             from - kicked at every beat boundary.
//   REACTION- THE BODY ANSWERS THE WORLD (iteration 58, probed):
//             the FIGURE itself answers the beat's violence - an
//             impulse drives a damped spring on the hero's root:
//             the body staggers AWAY from the beat's violence
//             (Newton's third law when a strike lands on the same
//             beat), dips, buckles (spine folds, head lags) and the
//             spring returns it to its mark - settling to REST, and
//             publishing the stagger velocity so the CLOTH whips
//             with the body the same frame. Multiple REACTION
//             programs merge into one body law (the figure has one
//             body); the wind has no force on this law.
//
// Programs ride the grammar by INDEX (the beat numbers they answer)
// or ALL; a strike lands when the playhead ENTERS a bound beat, so
// the wreckage begins where the cut lands. The integration law was
// PROBED before it shipped: bit-exact across runs (the seed law),
// nothing sinks below the floor, everything settles (the same
// reason OpenSubdiv was rejected in the sculpt pass).
//
// The vocabulary mirrors the worker's physics pass
// (bridges/blender/physics_pass.py) exactly - the compiler refuses
// anything the worker cannot perform.
// ─────────────────────────────────────────────────────────────

export const PHYSICS_KINDS = ["KNOCK", "DEBRIS", "SWAY", "REACTION"] as const;

export type PhysicsKind = (typeof PHYSICS_KINDS)[number];

export interface PhysicsProgram {
  kind: PhysicsKind;
  intensity?: number; // 0..1 (default 0.6)
  beats?: number[] | "ALL"; // which grammar beat indices it answers (0-based); default ALL
  target?: string | null; // KNOCK only: the riding prop's name (auto when omitted)
  note?: string | null;
}

export interface PhysicsSpec {
  name: string;
  programs: PhysicsProgram[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Validate + normalize a physics spec: 1..6 programs, known kinds,
 * clamped intensity, beat bindings that are "ALL" or indices 0..11
 * (the worker bounds-checks against the shot's actual grammar and
 * skips a program whose every binding is out of range - honestly,
 * in the state). A target on a non-KNOCK kind is refused here - a
 * typo never reaches a shoot. */
export function compilePhysicsSpec(input: {
  name: string;
  programs: unknown;
}): { ok: true; spec: PhysicsSpec } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  let raw: unknown[] = [];
  if (typeof input.programs === "string") {
    try {
      raw = JSON.parse(input.programs) as unknown[];
    } catch {
      return { ok: false, error: "programs must be a JSON array of {kind, intensity?, beats?, target?}" };
    }
  } else if (Array.isArray(input.programs)) {
    raw = input.programs;
  } else {
    return { ok: false, error: "programs must be a JSON array of {kind, intensity?, beats?, target?}" };
  }
  if (raw.length < 1) {
    return { ok: false, error: "a physics program needs at least 1 body law - an empty wreckage is set_shot_physics's job to clear" };
  }
  if (raw.length > 6) {
    return { ok: false, error: "a physics program carries at most 6 body laws - more is not wreckage, it is noise" };
  }
  const parsed: PhysicsProgram[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i] as Record<string, unknown>;
    const kind = String(p?.kind ?? "").trim().toUpperCase() as PhysicsKind;
    if (!(PHYSICS_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, error: `program ${i + 1}: unknown kind "${String(p?.kind ?? "")}" - the worker performs: ${PHYSICS_KINDS.join(", ")}` };
    }
    let intensity = 0.6;
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
    let target: string | null = null;
    if (p?.target !== undefined && p?.target !== null && p?.target !== "") {
      if (kind !== "KNOCK") {
        return { ok: false, error: `program ${i + 1} (${kind}): only KNOCK takes a target - DEBRIS scatters itself, SWAY hangs its own lantern, the body staggers on its own law` };
      }
      target = String(p.target).trim().slice(0, 80);
    }
    parsed.push({
      kind,
      intensity,
      beats,
      target,
      note: p?.note ? String(p.note).slice(0, 140) : null,
    });
  }
  return { ok: true, spec: { name, programs: parsed } };
}

/** The built-in wreckage language - always available by name, the
 * same way the built-in grammars and fx are. Each is a complete
 * answer the solid world gives the beats. */
export const BUILT_IN_PHYSICS: PhysicsSpec[] = [
  {
    name: "The Clash",
    programs: [
      { kind: "KNOCK", intensity: 0.8, note: "the impact sends a prop flying off the clash" },
      { kind: "DEBRIS", intensity: 0.7, note: "the floor's rubble scatters from the shockwave" },
      { kind: "REACTION", intensity: 0.6, note: "the shockwave drives the figure back a step - the body answers the violence" },
    ],
  },
  {
    name: "The Ruin",
    programs: [
      { kind: "DEBRIS", intensity: 0.9, note: "the broken ground kicks its rubble on every beat" },
      { kind: "SWAY", intensity: 0.4, note: "the surviving lantern swings over the wreckage" },
    ],
  },
  {
    name: "The Windchime",
    programs: [
      { kind: "SWAY", intensity: 0.55, note: "the hanging lantern rides the wind call" },
    ],
  },
  {
    name: "The Shove",
    programs: [
      { kind: "KNOCK", intensity: 0.65, note: "a shove sends the nearest body tumbling" },
    ],
  },
  {
    name: "The Recoil",
    programs: [
      { kind: "REACTION", intensity: 0.75, note: "the blast drives the figure back - a stagger, a buckle, and the spring returns the body to its mark" },
    ],
  },
];

/** Resolve a built-in physics program by name (case-insensitive). */
export function findBuiltInPhysics(name: string): PhysicsSpec | null {
  const n = name.trim().toLowerCase();
  return BUILT_IN_PHYSICS.find((f) => f.name.toLowerCase() === n) ?? null;
}

/** Serialize a spec for the Shot.physics column / worker payload. */
export function serializePhysics(spec: PhysicsSpec): string {
  return JSON.stringify(
    spec.programs.map((p) => ({
      kind: p.kind,
      ...(p.intensity !== undefined ? { intensity: p.intensity } : {}),
      ...(p.beats !== undefined ? { beats: p.beats } : {}),
      ...(p.target ? { target: p.target } : {}),
      ...(p.note ? { note: p.note } : {}),
    })),
  );
}

/** Parse + validate a stored physics column (Shot.physics) back into
 * programs; null when absent or corrupt (an honest absence, never a
 * crash). */
export function parseStoredPhysics(raw: string | null | undefined): PhysicsProgram[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 1) return null;
    const out: PhysicsProgram[] = [];
    for (const p of parsed) {
      const kind = String((p as Record<string, unknown>)?.kind ?? "").toUpperCase() as PhysicsKind;
      if (!(PHYSICS_KINDS as readonly string[]).includes(kind)) return null;
      const beats = (p as Record<string, unknown>)?.beats;
      out.push({
        kind,
        intensity: Number.isFinite(Number((p as Record<string, unknown>)?.intensity))
          ? clamp01(Number((p as Record<string, unknown>).intensity))
          : 0.6,
        beats: beats === "ALL" || beats === undefined || beats === null ? "ALL" : (Array.isArray(beats) ? beats.map(Number) : "ALL"),
        target: (p as Record<string, unknown>)?.target ? String((p as Record<string, unknown>).target) : null,
        note: (p as Record<string, unknown>)?.note ? String((p as Record<string, unknown>).note) : null,
      });
    }
    return out;
  } catch {
    return null;
  }
}

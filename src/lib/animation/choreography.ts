// ─────────────────────────────────────────────────────────────
// AnimeOS CHOREOGRAPHY (iteration 74) - THE PERFORMANCE IS KEYED
//
// Interpolation is blocking; a keyframe performance is CRAFT. A
// choreography program replaces the shot's two-pose slide with a
// KEYED performance: anticipation (the wind-up the strike earns),
// the strike (an explosive segment), the hold (the impact reads),
// the follow-through (the body settles) - plus the two accents every
// donghua action beat carries: the IMPACT frame (a real light flares
// at the strike, the camera takes a decaying punch) and the SMEAR
// (the striking limb stretches for the fastest frames, the stylized
// speed line no single frame can fake).
//
// The keys own the BODY. The camera grammar still owns the lens, the
// cloth and flesh still answer the body's velocity, the physics still
// own the world - one body, one clock, one more voice on it.
// ─────────────────────────────────────────────────────────────

import { POSES } from "./poses";

export const CHOREO_KINDS = ["hold", "anticipation", "strike", "follow", "move"] as const;
export type ChoreoKeyKind = (typeof CHOREO_KINDS)[number];

export interface ChoreoKey {
  at: number; // 0..1 normalized clip time
  pose: string; // a PoseId (validated against POSES)
  kind: ChoreoKeyKind; // the SEGMENT'S character (this key's arrival)
}

export interface ChoreoImpact {
  at: number; // 0..1 - the strike moment
  frames: number; // 1..6 - decay window
  punch: number; // 0..8 deg of camera kick
  flash: number; // 0..1 - the impact light's strength
}

export interface ChoreoSmear {
  at: number; // 0..1 - the strike moment
  frames: number; // 1..4
  amount: number; // 0..1 - limb stretch at the peak (caps at 1.35x)
}

export interface ChoreoProgram {
  name?: string;
  keys: ChoreoKey[];
  impact: ChoreoImpact | null;
  smear: ChoreoSmear | null;
  note?: string | null;
}

/** Compile + validate one choreography program (named or inline). */
export function compileChoreo(raw: unknown, label: string): { ok: true; spec: ChoreoProgram } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `${label}: a choreography program is an object { keys: [...], impact?, smear? }` };
  }
  const p = raw as Record<string, unknown>;
  if (!Array.isArray(p.keys) || p.keys.length < 2) {
    return { ok: false, error: `${label}: keys must be a JSON array of at least 2 {at, pose, kind} rows - a performance needs a wind-up and a landing` };
  }
  if (p.keys.length > 8) {
    return { ok: false, error: `${label}: at most 8 keys per program - more is noise, not performance` };
  }
  const keys: ChoreoKey[] = [];
  for (let i = 0; i < p.keys.length; i++) {
    const k = p.keys[i] as Record<string, unknown>;
    const at = Number(k?.at);
    if (!Number.isFinite(at) || at < 0 || at > 1) {
      return { ok: false, error: `${label}: key ${i + 1} at must be a number 0..1 (got ${String(k?.at)})` };
    }
    const pose = String(k?.pose ?? "").trim().toUpperCase();
    if (!(POSES as readonly string[]).includes(pose)) {
      return { ok: false, error: `${label}: key ${i + 1} pose "${String(k?.pose)}" is not in the vocabulary - the body speaks: ${POSES.join(", ")}` };
    }
    let kind: ChoreoKeyKind = "move";
    if (k?.kind !== undefined && k?.kind !== null && k?.kind !== "") {
      const kk = String(k.kind).trim().toLowerCase();
      if (!(CHOREO_KINDS as readonly string[]).includes(kk)) {
        return { ok: false, error: `${label}: key ${i + 1} kind "${String(k.kind)}" is not a key kind - the grammar of a performance: ${CHOREO_KINDS.join(", ")}` };
      }
      kind = kk as ChoreoKeyKind;
    }
    keys.push({ at, pose, kind });
  }
  if (keys[0].at !== 0) {
    return { ok: false, error: `${label}: the first key must sit at 0 (the performance starts on frame one)` };
  }
  if (keys[keys.length - 1].at !== 1) {
    return { ok: false, error: `${label}: the last key must sit at 1 (the performance owns the whole clip)` };
  }
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].at <= keys[i - 1].at) {
      return { ok: false, error: `${label}: key ${i + 1}'s at must be strictly greater than key ${i}'s (time runs forward)` };
    }
  }
  let impact: ChoreoImpact | null = null;
  if (p.impact !== undefined && p.impact !== null && p.impact !== "") {
    if (typeof p.impact !== "object" || Array.isArray(p.impact)) {
      return { ok: false, error: `${label}: impact must be an object { at, frames, punch, flash }` };
    }
    const im = p.impact as Record<string, unknown>;
    const at = Number(im.at);
    const frames = Number(im.frames ?? 3);
    const punch = Number(im.punch ?? 2.5);
    const flash = Number(im.flash ?? 0.8);
    if (!Number.isFinite(at) || at <= 0 || at >= 1) {
      return { ok: false, error: `${label}: impact.at must be a number strictly inside 0..1 (the strike is not the first or last frame)` };
    }
    if (!Number.isInteger(frames) || frames < 1 || frames > 6) {
      return { ok: false, error: `${label}: impact.frames must be an integer 1..6` };
    }
    if (!Number.isFinite(punch) || punch < 0 || punch > 8) {
      return { ok: false, error: `${label}: impact.punch must be a number 0..8 (degrees of camera kick)` };
    }
    if (!Number.isFinite(flash) || flash < 0 || flash > 1) {
      return { ok: false, error: `${label}: impact.flash must be a number 0..1` };
    }
    impact = { at, frames, punch, flash };
  }
  let smear: ChoreoSmear | null = null;
  if (p.smear !== undefined && p.smear !== null && p.smear !== "") {
    if (typeof p.smear !== "object" || Array.isArray(p.smear)) {
      return { ok: false, error: `${label}: smear must be an object { at, frames, amount }` };
    }
    const sm = p.smear as Record<string, unknown>;
    const at = Number(sm.at);
    const frames = Number(sm.frames ?? 2);
    const amount = Number(sm.amount ?? 0.5);
    if (!Number.isFinite(at) || at <= 0 || at >= 1) {
      return { ok: false, error: `${label}: smear.at must be a number strictly inside 0..1` };
    }
    if (!Number.isInteger(frames) || frames < 1 || frames > 4) {
      return { ok: false, error: `${label}: smear.frames must be an integer 1..4` };
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
      return { ok: false, error: `${label}: smear.amount must be a number 0..1` };
    }
    smear = { at, frames, amount };
  }
  return {
    ok: true,
    spec: {
      keys,
      impact,
      smear,
      note: p.note ? String(p.note).slice(0, 140) : null,
    },
  };
}

/** The built-in performance language - always available by name. */
export const BUILT_IN_CHOREO: ChoreoProgram[] = [
  {
    name: "The Combo",
    keys: [
      { at: 0, pose: "STANCE", kind: "hold" },
      { at: 0.28, pose: "CROUCH", kind: "anticipation" },
      { at: 0.42, pose: "SLASH", kind: "strike" },
      { at: 0.54, pose: "SLASH", kind: "hold" },
      { at: 1, pose: "STANCE", kind: "follow" },
    ],
    impact: { at: 0.42, frames: 3, punch: 2.5, flash: 0.8 },
    smear: { at: 0.42, frames: 2, amount: 0.5 },
    note: "wind-up low, the blade lands, hold the read, settle back",
  },
  {
    name: "The Draw Storm",
    keys: [
      { at: 0, pose: "STANCE", kind: "hold" },
      { at: 0.18, pose: "CAST", kind: "anticipation" },
      { at: 0.3, pose: "CAST", kind: "hold" },
      { at: 0.44, pose: "SLASH", kind: "strike" },
      { at: 0.56, pose: "CAST", kind: "anticipation" },
      { at: 0.7, pose: "CAST", kind: "strike" },
      { at: 1, pose: "STANCE", kind: "follow" },
    ],
    impact: { at: 0.7, frames: 2, punch: 1.8, flash: 0.6 },
    smear: { at: 0.44, frames: 2, amount: 0.4 },
    note: "a barrage of casts - channel, fire, recover, channel again",
  },
  {
    name: "The Rising Fang",
    keys: [
      { at: 0, pose: "STANCE", kind: "hold" },
      { at: 0.24, pose: "CROUCH", kind: "anticipation" },
      { at: 0.38, pose: "LEAP", kind: "strike" },
      { at: 0.52, pose: "LUNGE", kind: "strike" },
      { at: 0.62, pose: "LUNGE", kind: "hold" },
      { at: 1, pose: "STANCE", kind: "follow" },
    ],
    impact: { at: 0.52, frames: 3, punch: 3.0, flash: 0.9 },
    smear: { at: 0.52, frames: 2, amount: 0.6 },
    note: "the rising fang: crouch, leap, the descending claw lands",
  },
];

/** Resolve a choreo reference: built-in name, or inline object. */
export function resolveChoreoInput(input: string): { ok: true; spec: ChoreoProgram; source: string } | { ok: false; error: string } {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "choreo is empty - pass a design_choreography preset name, a built-in (The Combo / The Draw Storm / The Rising Fang), or an inline JSON program" };
  }
  const builtin = BUILT_IN_CHOREO.find((b) => b.name?.toLowerCase() === trimmed.toLowerCase());
  if (builtin) {
    return { ok: true, spec: builtin, source: `built-in ${builtin.name}` };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const built = compileChoreo(parsed, "choreo");
    if (!built.ok) return { ok: false, error: built.error };
    return { ok: true, spec: built.spec, source: "inline program" };
  } catch {
    return { ok: false, error: `no choreography named "${trimmed.slice(0, 40)}" and it is not valid JSON - design one with design_choreography or pass an inline program` };
  }
}

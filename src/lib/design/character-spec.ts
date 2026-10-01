// ─────────────────────────────────────────────────────────────
// ANIME CHARACTER DESIGN SPEC (iteration 109) - the language the
// design crew speaks and the Blender generator builds from
// (bridges/blender/anime_character.py resolve_spec mirrors these
// ranges field for field - one law, two runtimes).
//
// Pure module: no DB, no providers. The crew (character-crew.ts)
// uses it to validate what the sheet-reader proposes, to apply only
// whitelisted patches from the tuner, and to rank rounds.
// ─────────────────────────────────────────────────────────────

export const SPEC_VERSION = 109;

export interface AnimeDesignSpec {
  body: { gender: "female" | "male"; build: "lean" | "sturdy" | "heavy"; shoulders: number; hips: number; bust: number; headScale: number };
  face: { shape: "oval" | "round" | "angular"; jawTaper: number; chinFwd: number; cheek: number };
  eyes: { size: number; tilt: number; color: string; shape: "almond" | "sharp"; lashes: number };
  brows: { thickness: number; arch: number };
  mouth: { width: number; color: string };
  hair: { style: "topknot" | "ponytail" | "braid" | "long" | "short"; length: number; bangs: "parted" | "full" | "none"; volume: number; color: string; accessory: "none" | "pin" };
  outfit: { type: "hanfu" | "tunic" | "fitted"; length: number; sleeves: "bell" | "fitted"; collar: "crossed" | "high"; sash: boolean };
}

type Range = [number, number];
/** Numeric fields and their clamps (mirrors resolve_spec). */
export const NUMERIC_RANGES: Record<string, Range> = {
  "body.shoulders": [0.8, 1.35], "body.hips": [0.8, 1.3], "body.bust": [0, 1], "body.headScale": [0.85, 1.2],
  "face.jawTaper": [0.5, 0.95], "face.chinFwd": [0, 0.05], "face.cheek": [0.8, 1.25],
  "eyes.size": [0.7, 1.4], "eyes.tilt": [-1, 1], "eyes.lashes": [0.3, 1.5],
  "brows.thickness": [0.5, 2.0], "brows.arch": [0, 1],
  "mouth.width": [0.6, 1.4],
  "hair.length": [0.15, 1.0], "hair.volume": [0.7, 1.4],
  "outfit.length": [0.3, 1.0],
};
/** Enumerated fields and their vocabularies. */
export const ENUMS: Record<string, readonly string[]> = {
  "body.gender": ["female", "male"], "body.build": ["lean", "sturdy", "heavy"],
  "face.shape": ["oval", "round", "angular"], "eyes.shape": ["almond", "sharp"],
  "hair.style": ["topknot", "ponytail", "braid", "long", "short"], "hair.bangs": ["parted", "full", "none"],
  "hair.accessory": ["none", "pin"],
  "outfit.type": ["hanfu", "tunic", "fitted"], "outfit.sleeves": ["bell", "fitted"], "outfit.collar": ["crossed", "high"],
};
export const COLOR_FIELDS = ["eyes.color", "mouth.color", "hair.color"] as const;
export const BOOL_FIELDS = ["outfit.sash"] as const;
/** Every field the tuner may patch. */
export const PATCHABLE_FIELDS = [...Object.keys(NUMERIC_RANGES), ...Object.keys(ENUMS), ...COLOR_FIELDS, ...BOOL_FIELDS];

export function defaultSpec(seed?: { hairStyle?: string; hairColor?: string; build?: string }): AnimeDesignSpec {
  const style = (ENUMS["hair.style"] as readonly string[]).includes(String(seed?.hairStyle)) ? (seed!.hairStyle as AnimeDesignSpec["hair"]["style"]) : "long";
  return {
    body: { gender: "female", build: (["lean", "sturdy", "heavy"].includes(String(seed?.build)) ? seed!.build : "lean") as AnimeDesignSpec["body"]["build"], shoulders: 1, hips: 1.06, bust: 0.5, headScale: 1 },
    face: { shape: "oval", jawTaper: 0.72, chinFwd: 0.02, cheek: 1 },
    eyes: { size: 1, tilt: 0, color: "#5a6a62", shape: "almond", lashes: 1 },
    brows: { thickness: 1, arch: 0.5 },
    mouth: { width: 1, color: "#a0524e" },
    hair: { style, length: style === "short" ? 0.25 : 0.8, bangs: "parted", volume: 1, color: isHex(seed?.hairColor) ? seed!.hairColor! : "#1b1b22", accessory: style === "topknot" ? "pin" : "none" },
    outfit: { type: "hanfu", length: 1, sleeves: "bell", collar: "crossed", sash: true },
  };
}

export function isHex(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

function getPath(o: Record<string, unknown>, path: string): unknown {
  const [a, b] = path.split(".");
  const sec = o?.[a];
  return sec && typeof sec === "object" ? (sec as Record<string, unknown>)[b] : undefined;
}

function setPath(o: Record<string, Record<string, unknown>>, path: string, v: unknown) {
  const [a, b] = path.split(".");
  o[a] = { ...(o[a] ?? {}), [b]: v };
}

/** Validate + clamp ANY candidate (a sheet read, a stored row, a
 * patched spec) onto the base spec. Unknown fields are dropped;
 * out-of-vocabulary values keep the base; numbers clamp. Returns the
 * clean spec and the list of fields that were rejected (honest). */
export function clampSpec(candidate: unknown, base: AnimeDesignSpec = defaultSpec()): { spec: AnimeDesignSpec; rejected: string[] } {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, Record<string, unknown>>;
  const rejected: string[] = [];
  const c = (candidate && typeof candidate === "object" ? candidate : {}) as Record<string, unknown>;
  for (const [field, [lo, hi]] of Object.entries(NUMERIC_RANGES)) {
    const v = getPath(c, field);
    if (v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) setPath(out, field, Math.round(Math.min(hi, Math.max(lo, n)) * 1000) / 1000);
    else rejected.push(field);
  }
  for (const [field, vocab] of Object.entries(ENUMS)) {
    const v = getPath(c, field);
    if (v === undefined) continue;
    const s = String(v).toLowerCase();
    if (vocab.includes(s)) setPath(out, field, s);
    else rejected.push(field);
  }
  for (const field of COLOR_FIELDS) {
    const v = getPath(c, field);
    if (v === undefined) continue;
    if (isHex(v)) setPath(out, field, v.toLowerCase());
    else rejected.push(field);
  }
  for (const field of BOOL_FIELDS) {
    const v = getPath(c, field);
    if (v === undefined) continue;
    setPath(out, field, Boolean(v));
  }
  return { spec: out as unknown as AnimeDesignSpec, rejected };
}

/** Apply a tuner patch: {"eyes.size": 1.2, "hair.bangs": "full"} -
 * ONLY whitelisted fields, through the same clamps. */
export function applySpecPatch(spec: AnimeDesignSpec, patch: unknown): { spec: AnimeDesignSpec; applied: string[]; rejected: string[] } {
  const applied: string[] = [];
  const rejected: string[] = [];
  const nested: Record<string, Record<string, unknown>> = {};
  if (patch && typeof patch === "object") {
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      if (!PATCHABLE_FIELDS.includes(k)) {
        rejected.push(k);
        continue;
      }
      setPath(nested, k, v);
      applied.push(k);
    }
  }
  const res = clampSpec(nested, spec);
  return { spec: res.spec, applied: applied.filter((a) => !res.rejected.includes(a)), rejected: [...rejected, ...res.rejected] };
}

// ── the judge's verdict ──────────────────────────────────────

export const JUDGE_ASPECTS = ["face", "eyes", "hair", "outfit", "palette", "silhouette", "style"] as const;
export type JudgeAspect = (typeof JUDGE_ASPECTS)[number];

export interface JudgeIssue { aspect: JudgeAspect; note: string; field?: string; suggestion?: unknown }
export interface JudgeVerdict { scores: Record<JudgeAspect, number>; overall: number; issues: JudgeIssue[]; note: string }

/** Parse the judge's strict-JSON reply; null when it broke protocol. */
export function parseJudgeVerdict(raw: string): JudgeVerdict | null {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw.slice(s, e + 1));
  } catch {
    return null;
  }
  const sc = (j.scores ?? {}) as Record<string, unknown>;
  const scores = {} as Record<JudgeAspect, number>;
  for (const a of JUDGE_ASPECTS) {
    const n = Number(sc[a]);
    scores[a] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }
  const mean = JUDGE_ASPECTS.reduce((t, a) => t + scores[a], 0) / JUDGE_ASPECTS.length;
  const ov = Number(j.overall);
  const overall = Number.isFinite(ov) ? Math.min(1, Math.max(0, ov)) : mean;
  const issues: JudgeIssue[] = Array.isArray(j.issues)
    ? (j.issues as Array<Record<string, unknown>>).slice(0, 10).map((i) => ({
        aspect: (JUDGE_ASPECTS as readonly string[]).includes(String(i.aspect)) ? (String(i.aspect) as JudgeAspect) : "style",
        note: String(i.note ?? "").slice(0, 240),
        ...(typeof i.field === "string" && PATCHABLE_FIELDS.includes(i.field) ? { field: i.field } : {}),
        ...(i.suggestion !== undefined ? { suggestion: i.suggestion } : {}),
      }))
    : [];
  return { scores, overall: Math.round(overall * 1000) / 1000, issues, note: String(j.note ?? "").slice(0, 400) };
}

/** The judge's own field suggestions as a patch (the tuner's floor:
 * when the tuner model is unavailable the crew still moves). */
export function patchFromIssues(issues: JudgeIssue[]): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const i of issues) if (i.field && i.suggestion !== undefined && !(i.field in p)) p[i.field] = i.suggestion;
  return p;
}

/** The round the crew keeps: highest overall, earliest on ties. */
export function bestRound<T extends { verdict: JudgeVerdict | null }>(rounds: T[]): T | null {
  let best: T | null = null;
  for (const r of rounds) {
    if (!r.verdict) continue;
    if (!best || (best.verdict && r.verdict.overall > best.verdict.overall)) best = r;
  }
  return best;
}

/** A short line naming the spec (for events and DSH replies). */
export function specLine(s: AnimeDesignSpec): string {
  return `${s.body.gender} ${s.body.build}, ${s.face.shape} face, ${s.eyes.shape} ${s.eyes.color} eyes x${s.eyes.size}, ${s.hair.style} ${s.hair.color} hair (${s.hair.bangs} bangs), ${s.outfit.type} (${s.outfit.sleeves} sleeves, ${s.outfit.collar} collar)`;
}

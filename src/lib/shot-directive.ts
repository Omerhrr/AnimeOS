/**
 * shot-directive - THE SHOTDIRECTIVE COMPILER (iteration 98).
 *
 * The payload assembly grew program by program - grammar beats, fx
 * bursts, physics laws, cloth and flesh calls, the expression clip,
 * the comp profile, the cloth directive, the camera choreo, the
 * speech program - but nothing NAMED what a shot DIRECTS. The
 * assembly was a pile of inline conditionals, the worker re-parsed
 * on its side, and nothing proved the two sides agreed.
 *
 * THE LAW: one pure compiler turns a shot's directed intent into ONE
 * canonical ShotDirective - every program parsed, degraded and
 * canonicalized the same way - under one DETERMINISTIC hash
 * (sha256-16 over the canonical directive key, versioned 98). The
 * hash rides the payload; the worker re-compiles the directive from
 * the ARRIVED payload with its own mirror and names both hashes -
 * the wire is what the studio compiled, or the mismatch names
 * itself. One law, two runtimes, at the SHOT level.
 *
 * The canon covers the DIRECTED INTENT (the movement, the resolved
 * pose pair, the duration, the lighting, the grammar's normalized
 * beats, the fx and physics program counts and kinds, the cloth and
 * flesh intensities, the speech lines, the presence of the parsed
 * sub-programs) - never the deep content each sub-law already
 * hashes for itself (the expression clip, the comp profile, the
 * cloth directive, the camera choreo, the groom, the assets).
 */

import { createHash } from "node:crypto";
import { normalizePose } from "@/lib/animation/poses";

export const SHOT_DIRECTIVE_VERSION = 98;

/** The grammar moves the worker's normalize_grammar accepts - the
 * mirror must reject exactly what the worker rejects. (The canonical
 * TS-side vocabulary lives in @/lib/animation/grammar; this private
 * copy is the wire mirror.) */
const GRAMMAR_MOVES = [
  "ORBIT", "PAN", "TRACKING", "CRANE", "DOLLY_IN", "DOLLY_OUT",
  "TILT_UP", "TILT_DOWN", "STATIC",
] as const;

export interface GrammarBeat {
  move: string;
  from: number;
  to: number;
  poseStart: unknown;
  poseEnd: unknown;
  wind: number | null;
}

/** The TS mirror of the worker's normalize_grammar: parse a shot's
 * grammar payload into validated beats or null - the same
 * all-or-nothing degrade (one corrupt beat kills the whole grammar,
 * honestly, on both sides). */
export function normalizeGrammar(raw: unknown): GrammarBeat[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const beats: GrammarBeat[] = [];
  for (const b of raw) {
    if (!b || typeof b !== "object" || Array.isArray(b)) return null;
    const rec = b as Record<string, unknown>;
    const move = String(rec.move ?? "").toUpperCase();
    if (!(GRAMMAR_MOVES as readonly string[]).includes(move)) return null;
    const frmRaw = rec.from;
    const toRaw = rec.to;
    // python float("") raises while Number("") is 0 - the empty and
    // whitespace-only strings must die the same death
    if (typeof frmRaw === "string" && frmRaw.trim() === "") return null;
    if (typeof toRaw === "string" && toRaw.trim() === "") return null;
    const frm = Number(frmRaw);
    const to = Number(toRaw);
    if (!Number.isFinite(frm) || !Number.isFinite(to)) return null;
    if (!(frm >= 0 && frm < to && to <= 1)) return null;
    const w = rec.wind;
    beats.push({
      move,
      from: frm,
      to,
      poseStart: rec.poseStart,
      poseEnd: rec.poseEnd,
      wind: typeof w === "number" ? Math.max(0, Math.min(1, w)) : null,
    });
  }
  if (beats.length < 2) return null;
  return beats;
}

/** The payload's own gates, mirrored: a column rides only when it
 * parses into the shape the worker expects. */
function parseJsonArray(s: string | null | undefined): unknown[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function parseJsonObject(s: string | null | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export interface ShotDirectiveSource {
  movement: string | null | undefined;
  poseStart: string | null | undefined;
  poseEnd: string | null | undefined;
  duration: number | null | undefined;
  lighting: string | null | undefined;
  /** The raw grammar column (the payload rides only a parsed array). */
  grammar: string | null | undefined;
  /** The raw fx column (array of programs with a kind each). */
  fx: string | null | undefined;
  /** The raw physics column (array of programs with a kind each). */
  physics: string | null | undefined;
  /** The raw choreography column (an object when valid). */
  choreo: string | null | undefined;
  cloth: number | null | undefined;
  flesh: number | null | undefined;
  /** The speech program's line count (null when the shot is silent). */
  speechLines: number | null | undefined;
  /** The parsed sub-programs' presence, derived EXACTLY as the
   * payload assembly derives it (the cast gate included). */
  expressionPresent: boolean;
  compPresent: boolean;
  clothDirectivePresent: boolean;
  cameraChoreoPresent: boolean;
}

export interface ShotDirective {
  hash: string;
  key: string;
  sections: {
    movement: string;
    poses: string;
    duration: string;
    lighting: string;
    grammar: string;
    fx: string;
    physics: string;
    cloth: string;
    flesh: string;
    speech: string;
    expression: number;
    comp: number;
    clothDirective: number;
    cameraChoreo: number;
    choreo: number;
  };
}

const dash = (s: string) => s;
const f3 = (x: number) => x.toFixed(3);

/** The program canon: count + sorted unique kinds, "-" when absent. */
function programsCanon(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return "-";
  const kinds = Array.from(
    new Set(
      raw
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
        .map((p) => String(p.kind ?? "").trim().toLowerCase())
        .filter((k) => k !== ""),
    ),
  ).sort();
  return `${raw.length}:${kinds.join("+")}`;
}

/** The canonical key - the shot's directed intent, pipe-format,
 * versioned 98. Mirrors shot_directive_key in the worker field for
 * field (one law, two runtimes). */
export function shotDirectiveKey(src: ShotDirectiveSource): string {
  const mv = String(src.movement ?? "").trim().toUpperCase() || "-";
  const ps = normalizePose(src.poseStart) ?? null;
  const pe = normalizePose(src.poseEnd) ?? null;
  const poses = ps && pe ? `${ps}->${pe}` : ps ?? pe ?? "-";
  const dur = f3(Number(src.duration ?? 0));
  const light = String(src.lighting ?? "").trim().toLowerCase() || "-";

  const g = parseJsonArray(src.grammar) ? normalizeGrammar(parseJsonArray(src.grammar)) : null;
  let gr = "-";
  if (g) {
    const moves = g.map((b) => b.move).join("+");
    const windSum = g.reduce((acc, b) => acc + (b.wind ?? 0), 0);
    const poseBeats = g.filter((b) => normalizePose(b.poseStart as string) || normalizePose(b.poseEnd as string)).length;
    gr = `${g.length}:${moves}:${windSum.toFixed(1)}:${poseBeats}`;
  }

  const fx = programsCanon(parseJsonArray(src.fx));
  const ph = programsCanon(parseJsonArray(src.physics));

  const cloth = typeof src.cloth === "number" ? f3(src.cloth) : "-";
  const flesh = typeof src.flesh === "number" ? f3(src.flesh) : "-";
  const speech = src.speechLines != null ? String(src.speechLines) : "-";

  const expr = src.expressionPresent ? 1 : 0;
  const comp = src.compPresent ? 1 : 0;
  const clothd = src.clothDirectivePresent ? 1 : 0;
  const camchoreo = src.cameraChoreoPresent ? 1 : 0;
  const choreo = parseJsonObject(src.choreo) ? 1 : 0;

  return dash(
    `${SHOT_DIRECTIVE_VERSION}` +
    `|mv=${mv}|poses=${poses}|dur=${dur}|light=${light}` +
    `|gr=${gr}|fx=${fx}|ph=${ph}` +
    `|cloth=${cloth}|flesh=${flesh}|speech=${speech}` +
    `|expr=${expr}|comp=${comp}|clothd=${clothd}|camchoreo=${camchoreo}|choreo=${choreo}` +
    `|v1`,
  );
}

/** THE canonical directive: key, hash and the readable sections. */
export function compileShotDirective(src: ShotDirectiveSource): ShotDirective {
  const key = shotDirectiveKey(src);
  const hash = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  const mv = String(src.movement ?? "").trim().toUpperCase() || "-";
  const ps = normalizePose(src.poseStart) ?? null;
  const pe = normalizePose(src.poseEnd) ?? null;
  const g = parseJsonArray(src.grammar) ? normalizeGrammar(parseJsonArray(src.grammar)) : null;
  return {
    hash,
    key,
    sections: {
      movement: mv,
      poses: ps && pe ? `${ps}->${pe}` : ps ?? pe ?? "-",
      duration: f3(Number(src.duration ?? 0)),
      lighting: String(src.lighting ?? "").trim().toLowerCase() || "-",
      grammar: g ? String(g.length) : "0",
      fx: programsCanon(parseJsonArray(src.fx)),
      physics: programsCanon(parseJsonArray(src.physics)),
      cloth: typeof src.cloth === "number" ? f3(src.cloth) : "-",
      flesh: typeof src.flesh === "number" ? f3(src.flesh) : "-",
      speech: src.speechLines != null ? String(src.speechLines) : "-",
      expression: src.expressionPresent ? 1 : 0,
      comp: src.compPresent ? 1 : 0,
      clothDirective: src.clothDirectivePresent ? 1 : 0,
      cameraChoreo: src.cameraChoreoPresent ? 1 : 0,
      choreo: parseJsonObject(src.choreo) ? 1 : 0,
    },
  };
}

/** Human one-liner for the stage log. */
export function shotDirectiveLine(d: ShotDirective): string {
  const s = d.sections;
  return `shot directive v98: ${s.poses} ${s.movement} ${s.duration}s - fx ${s.fx} / physics ${s.physics} / grammar ${s.grammar} beats - hash ${d.hash}`;
}

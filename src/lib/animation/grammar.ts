import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// DIRECTED MOTION GRAMMAR (iteration 53)
//
// A shot with ONE camera move held for the whole clip is a
// screensaver. Real directed cinema speaks in BEATS: crane down
// to find the hero, then push in as the sword clears the sheath.
// The grammar is a shot's directed sequence of camera beats -
// each beat a move from the worker's vocabulary over a fraction
// of the clip, optionally carrying its own pose pair so the
// SUBJECT moves with the lens.
//
// design_grammar registers a NAMED grammar (the studio's reusable
// blocking language), set_shot_grammar applies one to a shot (by
// name - built-in or saved - or inline), and the render worker
// plays it frame by frame with eased crossfades between beats.
//
// A beat may also carry WIND (0..1): the director's call for what
// the AIR is doing while the beat plays - the secondary motion rig
// (cloth and hair chains on the figure) rides the beats, dragging
// behind the pose changes, whipping at the beat boundaries and
// billowing on a directed gust. Robes are instruments of the
// grammar, not decoration.
//
// The move vocabulary mirrors the worker's camera grammar
// (bridges/blender/animeos_bridge.py) exactly - the compiler
// refuses anything the worker cannot perform.
// ─────────────────────────────────────────────────────────────

export const GRAMMAR_MOVES = [
  "ORBIT", "PAN", "TRACKING", "CRANE", "DOLLY_IN", "DOLLY_OUT",
  "TILT_UP", "TILT_DOWN", "STATIC",
] as const;

export type GrammarMove = (typeof GRAMMAR_MOVES)[number];

export interface GrammarBeat {
  move: GrammarMove;
  from: number; // 0..1 start of the beat on the clip
  to: number; // 0..1 end of the beat (exclusive to the next)
  poseStart?: string | null;
  poseEnd?: string | null;
  wind?: number | null; // 0..1 directed gust - the cloth/hair rig rides this beat harder
  note?: string | null;
}

export interface GrammarSpec {
  name: string;
  beats: GrammarBeat[];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Validate + normalize a grammar into a spec: 2..6 beats, known
 * moves, monotonic coverage of the whole clip (gaps are closed by
 * extending the earlier beat's `to`; a lone-beat grammar is refused -
 * that is what shot.movement is for). Poses pass through unresolved -
 * the worker resolves them against its own vocabulary and falls back
 * to the shot's global pair. */
export function compileGrammarSpec(input: {
  name: string;
  beats: unknown;
}): { ok: true; spec: GrammarSpec } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  let raw: unknown[] = [];
  if (typeof input.beats === "string") {
    try {
      raw = JSON.parse(input.beats) as unknown[];
    } catch {
      return { ok: false, error: "beats must be a JSON array of {move, from, to}" };
    }
  } else if (Array.isArray(input.beats)) {
    raw = input.beats;
  } else {
    return { ok: false, error: "beats must be a JSON array of {move, from, to}" };
  }
  if (raw.length < 2) {
    return { ok: false, error: "a grammar needs at least 2 beats - a single move belongs in shot.movement, not a grammar" };
  }
  if (raw.length > 6) {
    return { ok: false, error: "a grammar carries at most 6 beats - more is not direction, it is noise" };
  }
  const parsed: GrammarBeat[] = [];
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i] as Record<string, unknown>;
    const move = String(b?.move ?? "").trim().toUpperCase() as GrammarMove;
    if (!(GRAMMAR_MOVES as readonly string[]).includes(move)) {
      return { ok: false, error: `beat ${i + 1}: unknown move "${String(b?.move ?? "")}" - the worker performs: ${GRAMMAR_MOVES.join(", ")}` };
    }
    const from = Number(b?.from);
    const to = Number(b?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return { ok: false, error: `beat ${i + 1} (${move}): from and to are required numbers 0..1` };
    }
    let wind: number | null = null;
    if (b?.wind !== undefined && b?.wind !== null && b?.wind !== "") {
      const w = Number(b.wind);
      if (!Number.isFinite(w)) {
        return { ok: false, error: `beat ${i + 1} (${move}): wind must be a number 0..1 (the gust the cloth and hair ride)` };
      }
      wind = clamp01(w);
    }
    parsed.push({
      move,
      from: clamp01(from),
      to: clamp01(to),
      poseStart: b?.poseStart ? String(b.poseStart) : null,
      poseEnd: b?.poseEnd ? String(b.poseEnd) : null,
      wind,
      note: b?.note ? String(b.note).slice(0, 140) : null,
    });
  }
  // order by start and close every gap: the beats COVER the clip -
  // the camera is never undefined for a frame
  parsed.sort((a, b) => a.from - b.from || a.to - b.to);
  parsed[0].from = 0;
  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i].to < parsed[i].from + 0.05) {
      return { ok: false, error: `beat ${i + 1} (${parsed[i].move}) is shorter than 5% of the clip - stretch it or cut it` };
    }
    parsed[i].to = Math.max(parsed[i].to, parsed[i + 1].from);
  }
  const last = parsed[parsed.length - 1];
  if (last.to < last.from + 0.05) {
    return { ok: false, error: `the final beat (${last.move}) is shorter than 5% of the clip - stretch it or cut it` };
  }
  last.to = 1;
  return { ok: true, spec: { name, beats: parsed } };
}

/** The built-in blocking language - always available by name, the
 * same way ARC_TEMPLATES are. Each is a complete directed sentence. */
export const BUILT_IN_GRAMMARS: GrammarSpec[] = [
  {
    name: "The Reveal",
    beats: [
      { move: "CRANE", from: 0, to: 0.5, note: "crane down over the set to find the subject" },
      { move: "DOLLY_IN", from: 0.5, to: 1, note: "push in as the moment lands" },
    ],
  },
  {
    name: "The Standoff",
    beats: [
      { move: "PAN", from: 0, to: 0.4, note: "pan across the space between them" },
      { move: "DOLLY_IN", from: 0.4, to: 1, note: "close the distance on the face-off" },
    ],
  },
  {
    name: "The Assault",
    beats: [
      { move: "TRACKING", from: 0, to: 0.45, note: "run with the charge" },
      { move: "ORBIT", from: 0.45, to: 1, note: "orbit the clash" },
    ],
  },
  {
    name: "The Ascent",
    beats: [
      { move: "TILT_UP", from: 0, to: 0.5, note: "tilt up the scale of the thing" },
      { move: "CRANE", from: 0.5, to: 1, note: "crane over it into the wide" },
    ],
  },
  {
    name: "The Withdrawal",
    beats: [
      { move: "DOLLY_OUT", from: 0, to: 0.55, note: "pull back off the aftermath" },
      { move: "TILT_DOWN", from: 0.55, to: 1, note: "settle down onto what is left" },
    ],
  },
];

/** Resolve a grammar by name: production-saved GRAMMAR presets first,
 * then the built-ins. Returns null when nothing carries the name. */
export function findBuiltInGrammar(name: string): GrammarSpec | null {
  const n = name.trim().toLowerCase();
  return BUILT_IN_GRAMMARS.find((g) => g.name.toLowerCase() === n) ?? null;
}

/** Serialize a spec for the Shot.grammar column / worker payload. */
export function serializeGrammar(spec: GrammarSpec): string {
  return JSON.stringify(
    spec.beats.map((b) => ({ move: b.move, from: b.from, to: b.to, ...(b.poseStart ? { poseStart: b.poseStart } : {}), ...(b.poseEnd ? { poseEnd: b.poseEnd } : {}), ...(b.wind !== null && b.wind !== undefined ? { wind: b.wind } : {}), ...(b.note ? { note: b.note } : {}) })),
  );
}

/** Parse + validate a stored grammar (Shot.grammar) back into beats;
 * null when absent or corrupt (an honest absence, never a crash). */
export function parseStoredGrammar(raw: string | null | undefined): GrammarBeat[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length < 2) return null;
    const beats: GrammarBeat[] = [];
    for (const b of parsed) {
      const move = String((b as Record<string, unknown>)?.move ?? "").toUpperCase() as GrammarMove;
      const from = Number((b as Record<string, unknown>)?.from);
      const to = Number((b as Record<string, unknown>)?.to);
      if (!(GRAMMAR_MOVES as readonly string[]).includes(move) || !Number.isFinite(from) || !Number.isFinite(to)) return null;
      const rawWind = (b as Record<string, unknown>)?.wind;
      beats.push({
        move,
        from: clamp01(from),
        to: clamp01(to),
        poseStart: (b as Record<string, unknown>)?.poseStart ? String((b as Record<string, unknown>).poseStart) : null,
        poseEnd: (b as Record<string, unknown>)?.poseEnd ? String((b as Record<string, unknown>).poseEnd) : null,
        wind: rawWind !== undefined && rawWind !== null && Number.isFinite(Number(rawWind)) ? clamp01(Number(rawWind)) : null,
        note: (b as Record<string, unknown>)?.note ? String((b as Record<string, unknown>).note) : null,
      });
    }
    return beats;
  } catch {
    return null;
  }
}

/** Write a grammar spec file (unused today - grammars ride the job
 * payload, not files - kept for the design-review tooling). */
export function writeGrammarSpec(spec: GrammarSpec, dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "grammar.json");
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  return file;
}

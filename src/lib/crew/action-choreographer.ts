// ─────────────────────────────────────────────────────────────
// THE ACTION CHOREOGRAPHER (iteration 117) - the expert crew's
// first working bench (src/lib/crew/experts.ts, id "choreographer").
//
// The seam this law closes (named by the night of iteration 116):
// a shot's TEXT directs action - "first clash ... collide ...
// lightning detonates through it, debris suspended mid-air" - its
// audio cues promise the hit ("Impact detonation" at 200ms,
// "Debris scatter" at 1100ms) ... and the clip renders two statues
// standing apart, because nothing compiles the words into the
// performance vocabulary the worker already owns.
//
// THE LAW: a pure compiler reads the shot's directed text (the
// description, the lighting line, the audio cues) and compiles the
// action it names into ACTION DNA - grammar beats (the camera keeps
// its directed move while the poses cut LUNGE -> SLASH -> BLOCK ->
// STANCE), fx programs (the BURST that lands where the cut lands)
// and physics programs (the DEBRIS the world owes the impact, the
// REACTION the body owes the violence) - timed TO THE SHOT'S OWN
// AUDIO CUES, so the sound and the picture land on the same clock.
//
// The choreographer compiles THROUGH the studio's existing laws,
// never around them: beats validate against compileGrammarSpec (the
// same grammar law every tool obeys), poses against normalizePose,
// fx kinds against the worker's FX vocabulary, physics kinds against
// the worker's physics vocabulary. What the worker cannot perform,
// the expert does not direct.
//
// THE RANK LAW: explicit direction outranks the expert. The consult
// (choreographer-consult.ts) fills only EMPTY columns, per column -
// a shot DSH or the creator directed is law; silence is what the
// expert is for.
//
// THE DECLINE LAW: text that names no action the expert knows is
// declined HONESTLY - no invented spectacle, no motion for motion's
// sake. A shot that directs stillness stays still.
//
// DETERMINISM: the compiler is pure - the same brief always
// compiles to the same DNA, byte for byte. No clocks, no rng.
// ─────────────────────────────────────────────────────────────

import { compileGrammarSpec, serializeGrammar, GRAMMAR_MOVES, type GrammarBeat, type GrammarMove } from "@/lib/animation/grammar";
import { normalizePose } from "@/lib/animation/poses";

/** The worker's fx vocabulary (bridges/blender/fx_pass.py FX_KINDS). */
export const FX_KINDS = ["TRAIL", "BURST", "AURA", "MOTES"] as const;
/** The worker's physics vocabulary (bridges/blender/physics_pass.py). */
export const PHYSICS_KINDS = ["KNOCK", "DEBRIS", "SWAY", "REACTION"] as const;

export type FxKind = (typeof FX_KINDS)[number];
export type PhysicsKind = (typeof PHYSICS_KINDS)[number];

export interface FxProgram {
  kind: FxKind;
  color?: string | null;
  intensity: number;
  beats: number[] | "ALL";
}

export interface PhysicsProgram {
  kind: PhysicsKind;
  intensity: number;
  beats: number[] | "ALL";
  target?: string | null;
}

/** The brief: everything the shot's own words and cues say. */
export interface ActionBrief {
  description: string | null | undefined;
  lighting: string | null | undefined;
  /** The shot's whole-clip camera move (the camera law keeps it). */
  movement: string | null | undefined;
  /** The clip's duration in seconds. */
  duration: number | null | undefined;
  /** The shot's audio cues (kind + label + startMs) - the action's
   * clock. Only the label and startMs matter here. */
  audioCues: Array<{ kind?: string; label?: string; startMs?: number }>;
}

export interface ActionDna {
  ok: boolean;
  /** The honest decline when ok=false - why the expert stayed silent. */
  decline: string | null;
  /** What was recognized, one line each (the audit trail). */
  events: string[];
  /** Serialized grammar beats (the Shot.grammar column shape) or null. */
  grammar: string | null;
  /** Serialized fx programs (the Shot.fx column shape) or null. */
  fx: string | null;
  /** Serialized physics programs (the Shot.physics column shape) or null. */
  physics: string | null;
  /** The one-line read for the event ledger. */
  line: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const f3 = (x: number) => Number(x.toFixed(3));

/** The camera move every beat keeps: the shot's own directed move
 * when the worker can perform it, STATIC otherwise (the pose pairs
 * still cut - the body acts while the camera holds). */
function cameraMove(movement: string | null | undefined): GrammarMove {
  const mv = String(movement ?? "").trim().toUpperCase() as GrammarMove;
  return (GRAMMAR_MOVES as readonly string[]).includes(mv) ? mv : "STATIC";
}

interface Recognized {
  clash: boolean;
  storm: boolean;
  debris: boolean;
  blade: boolean;
  draw: boolean;
  aura: boolean;
}

function recognize(text: string): Recognized {
  const t = text.toLowerCase();
  return {
    clash: /\b(first clash|clash(?:es)?|collid\w+|impact|detonat\w+|duel)\b/.test(t),
    storm: /\blightning\b/.test(t),
    debris: /\b(debris|rubble)\b/.test(t),
    blade: /\b(swords?|blades?)\b/.test(t),
    draw: /\b(draws? (?:his|her|the|its|their) (?:sword|blade)|sword draw|blade sings|out of its sheath)\b/.test(t),
    aura: /\b(aura|energy gathers|energy coiling|energy coils)\b/.test(t),
  };
}

/** The action's clock: the impact cue (impact/detonation/clash/hit)
 * and the debris cue (debris/scatter/rubble), as fractions of the
 * clip, clamped to their windows. Canonical fallbacks when the shot
 * carries no cues - the phrasing still lands, just on the canonical
 * beats. */
function actionClock(brief: ActionBrief): { tImpact: number; tDebris: number; fromCues: boolean } {
  const dur = Number(brief.duration ?? 0);
  const find = (re: RegExp): number | null => {
    for (const c of brief.audioCues ?? []) {
      const label = String(c.label ?? "");
      if (re.test(label)) {
        const ms = Number(c.startMs);
        if (Number.isFinite(ms) && ms >= 0 && dur > 0) return ms / (dur * 1000);
      }
    }
    return null;
  };
  const tImpact = clamp(find(/impact|detonation|clash|hit|percussion/i) ?? 0.10, 0.04, 0.35);
  const tDebris = clamp(find(/debris|scatter|rubble/i) ?? tImpact + 0.25, Math.min(tImpact + 0.12, 0.8), 0.8);
  return { tImpact: f3(tImpact), tDebris: f3(tDebris), fromCues: find(/impact|detonation|clash|hit|percussion/i) !== null };
}

/** The beat index a fraction of the clip falls inside. */
function beatIndexAt(beats: GrammarBeat[], t: number): number {
  for (let i = 0; i < beats.length; i++) {
    if (t >= beats[i].from && t < beats[i].to) return i;
  }
  return beats.length - 1;
}

/** Compile the brief into ACTION DNA. Pure - the same brief always
 * compiles to the same DNA. */
export function compileActionDna(brief: ActionBrief): ActionDna {
  const text = `${String(brief.description ?? "")} ${String(brief.lighting ?? "")}`.trim();
  const dur = Number(brief.duration ?? 0);
  if (!text) {
    return { ok: false, decline: "the shot directs no text - nothing to choreograph", events: [], grammar: null, fx: null, physics: null, line: "" };
  }
  if (!(dur > 0) || !Number.isFinite(dur)) {
    return { ok: false, decline: `the shot's duration is not a positive number (${String(brief.duration)}) - no clock to stage the action on`, events: [], grammar: null, fx: null, physics: null, line: "" };
  }

  const r = recognize(text);
  const events: string[] = [];
  if (r.clash) events.push("CLASH: the text directs a clash - the bodies meet");
  if (r.storm) events.push("STORM: the text directs lightning - the flash lands on the beat");
  if (r.debris) events.push("DEBRIS: the text directs debris - the world answers the impact");
  if (r.draw) events.push("DRAW: the text directs the blade leaving its sheath");
  if (r.aura) events.push("AURA: the text directs gathered energy");

  if (events.length === 0) {
    return {
      ok: false,
      decline: "the text directs no action the choreographer knows (clash / lightning / debris / draw / aura) - explicit direction stands, silence stays silent",
      events: [],
      grammar: null, fx: null, physics: null,
      line: "",
    };
  }

  const mv = cameraMove(brief.movement);
  const clock = actionClock(brief);

  // ── the grammar: the camera keeps its move, the body acts ──
  let beats: GrammarBeat[];
  if (r.clash) {
    // The clash phrase, timed to the shot's clock: the lunge tells,
    // the slash lands ON the impact cue, the lock holds to the
    // debris cue, the recovery, the settle.
    beats = [
      { move: mv, from: 0, to: clock.tImpact, poseStart: "LUNGE", poseEnd: "SLASH", wind: 0.5, note: "the tell and the strike - the clash lands on its cue" },
      { move: mv, from: clock.tImpact, to: clock.tDebris, poseStart: "SLASH", poseEnd: "BLOCK", wind: 0.7, note: "the lock - the bodies strain against each other" },
      { move: mv, from: clock.tDebris, to: Math.min(clock.tDebris + 0.25, 0.88), poseStart: "BLOCK", poseEnd: "STANCE", wind: 0.4, note: "the break - the world's debris answers" },
      { move: mv, from: Math.min(clock.tDebris + 0.25, 0.88), to: 1, poseStart: "STANCE", poseEnd: "STANCE", wind: 0.2, note: "the settle" },
    ];
  } else if (r.draw) {
    beats = [
      { move: mv, from: 0, to: 0.35, poseStart: "STANCE", poseEnd: "DRAW", wind: 0.2, note: "the reach - the hand finds the hilt" },
      { move: mv, from: 0.35, to: 0.7, poseStart: "DRAW", poseEnd: "STANCE", wind: 0.35, note: "the draw - the blade clears the sheath" },
      { move: mv, from: 0.7, to: 1, poseStart: "STANCE", poseEnd: "STANCE", wind: 0.2, note: "the hold - the blade presented" },
    ];
  } else {
    // No body action - the flash's two-beat clock so the spectacle
    // lands mid-shot instead of at frame zero (the camera keeps its
    // directed move through both beats).
    const tFlash = clock.tImpact > 0.15 ? clock.tImpact : 0.45;
    beats = [
      { move: mv, from: 0, to: f3(tFlash), wind: 0.3, note: "the calm before the flash" },
      { move: mv, from: f3(tFlash), to: 1, wind: 0.5, note: "the storm answers" },
    ];
  }

  // Compile THROUGH the grammar law - what the tools obey, the
  // expert obeys (2..6 beats, known moves, monotonic coverage).
  const compiled = compileGrammarSpec({ name: "choreographer", beats: beats as unknown[] });
  if (!compiled.ok) {
    return { ok: false, decline: `the choreographer's phrase failed the grammar law: ${compiled.error}`, events, grammar: null, fx: null, physics: null, line: "" };
  }
  // The poses pass through the grammar law unresolved - so the
  // expert validates them itself: every pose must resolve against
  // the shared vocabulary (what the worker performs, the expert
  // directs - a pose the worker cannot hold is never directed).
  for (const b of compiled.spec.beats) {
    for (const p of [b.poseStart, b.poseEnd]) {
      if (p && !normalizePose(p)) {
        return { ok: false, decline: `pose "${p}" is not in the worker's vocabulary`, events, grammar: null, fx: null, physics: null, line: "" };
      }
    }
  }
  const grammar = serializeGrammar(compiled.spec);

  // ── the fx: the spectacle lands where the cut lands ──
  const fxPrograms: FxProgram[] = [];
  const beatCount = compiled.spec.beats.length;
  const bind = (t: number): number[] => [Math.min(beatIndexAt(compiled.spec.beats, t), beatCount - 1)];
  if (r.clash) {
    fxPrograms.push({ kind: "BURST", color: "#e8eeff", intensity: 0.9, beats: bind(clock.tImpact) });
    if (r.blade) fxPrograms.push({ kind: "TRAIL", color: null, intensity: 0.75, beats: [0, 1] });
  } else if (r.draw) {
    fxPrograms.push({ kind: "TRAIL", color: null, intensity: 0.7, beats: [0, 1] });
  }
  if (r.storm && !r.clash) {
    fxPrograms.push({ kind: "BURST", color: "#e8eeff", intensity: 0.85, beats: bind(clock.tImpact > 0.15 ? clock.tImpact : 0.45) });
  }
  if (r.aura) {
    fxPrograms.push({ kind: "AURA", color: null, intensity: 0.6, beats: "ALL" });
  }
  for (const p of fxPrograms) {
    if (!(FX_KINDS as readonly string[]).includes(p.kind)) {
      return { ok: false, decline: `fx kind ${p.kind} is not in the worker's vocabulary`, events, grammar: null, fx: null, physics: null, line: "" };
    }
  }
  const fx = fxPrograms.length > 0
    ? JSON.stringify(fxPrograms.map((p) => ({ kind: p.kind, ...(p.color ? { color: p.color } : {}), intensity: p.intensity, beats: p.beats })))
    : null;

  // ── the physics: the world obeys, the body answers ──
  const physPrograms: PhysicsProgram[] = [];
  if (r.clash) {
    physPrograms.push({ kind: "REACTION", intensity: 0.7, beats: bind(clock.tImpact) });
  }
  if (r.debris) {
    physPrograms.push({ kind: "DEBRIS", intensity: 0.75, beats: bind(clock.tDebris) });
  }
  for (const p of physPrograms) {
    if (!(PHYSICS_KINDS as readonly string[]).includes(p.kind)) {
      return { ok: false, decline: `physics kind ${p.kind} is not in the worker's vocabulary`, events, grammar: null, fx: null, physics: null, line: "" };
    }
  }
  const physics = physPrograms.length > 0
    ? JSON.stringify(physPrograms.map((p) => ({ kind: p.kind, intensity: p.intensity, beats: p.beats })))
    : null;

  // ── the read ──
  const cue = clock.fromCues ? "timed to the shot's own audio cues" : "on the canonical beats (no audio cues named)";
  const parts: string[] = [];
  if (r.clash) parts.push(`clash phrase ${compiled.spec.beats.map((b) => `${b.poseStart}->${b.poseEnd}`).join(" / ")}`);
  else if (r.draw) parts.push("draw phrase");
  else parts.push("flash clock");
  if (fxPrograms.length) parts.push(`fx ${fxPrograms.map((p) => p.kind).join("+")}`);
  if (physPrograms.length) parts.push(`physics ${physPrograms.map((p) => p.kind).join("+")}`);
  const line = `THE CHOREOGRAPHER DIRECTS: ${parts.join(", ")} - ${cue}`;

  return { ok: true, decline: null, events, grammar, fx, physics, line };
}

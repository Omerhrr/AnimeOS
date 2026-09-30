import { createHash } from "node:crypto";
import { parseDialogue, type DialogueLine } from "@/lib/comic/dialogue";

// ─────────────────────────────────────────────────────────────
// LIP-SYNC ON SPEAKING CLOSEUPS
//
// A shot that carries SPEECH dialogue and a tight framing (CLOSEUP
// or EXTREME_CLOSEUP) is a SPEAKING CLOSEUP: the mouth is the shot's
// subject, so the render engines perform the lines instead of
// leaving the face static.
//
// This module is the pure brain shared by every driver:
//
//   • VISEMES - each character of a line maps to a mouth shape
//     (openness 0..1, wide 0..1 for "ee" spreads, round 0..1 for
//     "oo" purses). Vowels open, m/b/p press closed, everything
//     else buzzes slightly open. Deterministic, no audio analysis
//     needed - the dialogue text IS the timing score.
//
//   • SPEECH PROGRAM - the shot's SPEECH lines are laid over the
//     clip timeline. When the shot has rendered VOICE takes (audio
//     cues), each line rides its take's window (cue startMs +
//     real duration), so the mouth moves exactly where the sound
//     is. Without takes the lines spread evenly over the shot
//     duration (length-weighted with breathing gaps).
//
//   • The Blender stand-in samples the program per frame and
//     drives the mouth rig (openness + wide/round shaping), the
//     img2vid prompt receives the lines as speech direction, and
//     the MOTION engine plans a blocking speech beat per span.
// ─────────────────────────────────────────────────────────────

/** Shot types where the mouth is on screen and speech must perform. */
export const SPEAKING_SHOT_TYPES = ["CLOSEUP", "EXTREME_CLOSEUP"];

/** A viseme segment: milliseconds on the clip timeline + mouth shape. */
export interface Viseme {
  s: number; // start ms
  e: number; // end ms
  o: number; // openness 0..1
  w: number; // wide 0..1 (ee-style spread)
  r: number; // round 0..1 (oo-style purse)
}

/** One dialogue span laid over the timeline (per SPEECH line). */
export interface SpeechSpan {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
}

export interface SpeechProgram {
  spans: SpeechSpan[];
  visemes: Viseme[];
  lines: number;
}

interface VoiceTakeWindow {
  startMs: number;
  durationMs: number; // 0/null = unknown, falls back to an even slice
}

// ─── Viseme table ────────────────────────────────────────────

interface MouthShape {
  o: number;
  w: number;
  r: number;
}

const VOWELS: Record<string, MouthShape> = {
  a: { o: 1.0, w: 0.15, r: 0.2 },
  o: { o: 0.92, w: 0.05, r: 0.75 },
  e: { o: 0.72, w: 0.75, r: 0.05 },
  i: { o: 0.5, w: 0.95, r: 0.0 },
  u: { o: 0.6, w: 0.0, r: 1.0 },
  y: { o: 0.5, w: 0.8, r: 0.1 },
};

const CLOSED: MouthShape = { o: 0.04, w: 0.1, r: 0.1 }; // m, b, p press the lips shut
const SOFT: MouthShape = { o: 0.22, w: 0.2, r: 0.15 }; // f, v, thin fricatives
const MID: MouthShape = { o: 0.32, w: 0.3, r: 0.2 }; // everything else buzzes open

/**
 * Mouth shape for one character of dialogue text. Uppercase gets a
 * touch more energy (shouted letters open wider), punctuation and
 * spaces close the mouth (breath).
 */
export function phonemeShape(ch: string): MouthShape {
  const lower = ch.toLowerCase();
  if (/[a-z]/.test(lower)) {
    const base = lower in VOWELS ? VOWELS[lower] : /[mbp]/.test(lower) ? CLOSED : /[fv]/.test(lower) ? SOFT : MID;
    const shout = ch === ch.toUpperCase() && /[a-z]/i.test(ch) ? 1.08 : 1.0;
    return { o: Math.min(1, base.o * shout), w: base.w, r: base.r };
  }
  return { o: 0.0, w: 0.0, r: 0.0 }; // spaces / punctuation: mouth closes
}

/** Relative duration weight of a phoneme: vowels ring longer than stops. */
function phonemeWeight(ch: string): number {
  const lower = ch.toLowerCase();
  if (lower in VOWELS) return 1.35;
  if (/[mbp]/.test(lower)) return 0.7;
  if (/\s/.test(ch)) return 0.9; // breath between words
  return 1.0;
}

// ─── Detection ───────────────────────────────────────────────

/**
 * A speaking closeup: tight framing + at least one SPEECH line.
 * THOUGHT lines are interior monologue (no moving lips), SFX are
 * sound design - neither drives the mouth.
 */
export function isSpeakingCloseup(shotType: string, dialogue: string | null | undefined): boolean {
  if (!SPEAKING_SHOT_TYPES.includes(String(shotType ?? "").toUpperCase())) return false;
  return parseDialogue(dialogue ?? null).some((l) => l.kind === "SPEECH" && l.text.trim().length > 0);
}

export function speechLinesOf(dialogue: string | null | undefined): DialogueLine[] {
  return parseDialogue(dialogue ?? null).filter((l) => l.kind === "SPEECH" && l.text.trim().length > 0);
}

// ─── Speech program builder ──────────────────────────────────

const MIN_LINE_MS = 700; // even a short line needs a readable mouth beat
const LINE_GAP_MS = 150; // breath between lines when spreading evenly
const MAX_VISEMES = 600; // payload safety cap (a 30s wall of text still fits)

/**
 * Lay the SPEECH lines over the clip timeline. When VOICE takes
 * exist they ARE the timing (each line rides its rendered window,
 * in start order); otherwise lines spread across the shot duration,
 * length-weighted, with a small gap between them.
 */
export function buildSpeechProgram(input: {
  dialogue: string | null | undefined;
  shotDurationMs: number;
  voiceTakes?: VoiceTakeWindow[];
}): SpeechProgram {
  const lines = speechLinesOf(input.dialogue);
  const durationMs = Math.max(400, Math.round(input.shotDurationMs));
  if (lines.length === 0) return { spans: [], visemes: [], lines: 0 };

  const takes = [...(input.voiceTakes ?? [])].sort((a, b) => a.startMs - b.startMs);
  const spans: SpeechSpan[] = [];

  if (takes.length >= lines.length) {
    // each line rides a real take window (cue i -> line i in start order)
    lines.forEach((line, i) => {
      const take = takes[i];
      const dur = take.durationMs > 120 ? take.durationMs : Math.max(MIN_LINE_MS, Math.round(durationMs / lines.length) - LINE_GAP_MS);
      const start = Math.min(Math.max(0, take.startMs), Math.max(0, durationMs - 200));
      spans.push({ startMs: start, endMs: Math.min(durationMs, start + dur), speaker: line.speaker, text: line.text });
    });
  } else {
    // no (or partial) takes: spread length-weighted across the timeline
    const weights = lines.map((l) => Math.max(8, l.text.trim().length));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const usable = Math.max(lines.length * MIN_LINE_MS, durationMs - LINE_GAP_MS * (lines.length - 1));
    let cursor = 0;
    lines.forEach((line, i) => {
      const slice = (weights[i] / totalWeight) * usable;
      const start = Math.round(cursor);
      const end = Math.round(Math.min(durationMs, cursor + Math.max(MIN_LINE_MS, slice)));
      spans.push({ startMs: start, endMs: end, speaker: line.speaker, text: line.text });
      cursor = end + LINE_GAP_MS;
    });
  }

  return { spans, visemes: buildVisemes(spans), lines: lines.length };
}

/**
 * Spread each span's characters across its window as viseme
 * segments, weighted so vowels ring and stops stay quick. Segments
 * are monotonic, non-overlapping, and clipped to the span window.
 */
export function buildVisemes(spans: SpeechSpan[]): Viseme[] {
  const out: Viseme[] = [];
  for (const span of spans) {
    const chars = [...span.text].slice(0, 160);
    if (chars.length === 0) continue;
    const window = Math.max(120, span.endMs - span.startMs);
    const weights = chars.map(phonemeWeight);
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = span.startMs;
    for (let i = 0; i < chars.length; i++) {
      const dur = (weights[i] / total) * window;
      const s = cursor;
      const e = Math.min(span.endMs, cursor + dur);
      cursor = e;
      const shape = phonemeShape(chars[i]);
      if (e <= s) continue;
      if (out.length >= MAX_VISEMES) break;
      out.push({ s: Math.round(s), e: Math.round(e), o: shape.o, w: shape.w, r: shape.r });
    }
  }
  return out;
}

/**
 * Sample the mouth at time tMs: the viseme segment covering t (or a
 * short ease-out of the previous one so the mouth never snaps shut
 * between segments). Returns null when nothing is being spoken.
 */
export function sampleSpeech(visemes: Viseme[], tMs: number): { o: number; w: number; r: number } | null {
  if (visemes.length === 0) return null;
  let prev: Viseme | null = null;
  for (const v of visemes) {
    if (tMs >= v.s && tMs < v.e) return { o: v.o, w: v.w, r: v.r };
    if (tMs < v.s) {
      if (prev && tMs < prev.e + 90) {
        // decay out of the previous shape over ~90ms
        const k = 1 - (tMs - prev.e) / 90;
        return { o: prev.o * k, w: prev.w * k, r: prev.r * k };
      }
      return null;
    }
    prev = v;
  }
  return null;
}

// ─── THE MOUTH SPEAKS IN THE MESH (iteration 92, Layer A) ────
//
// The v3.3 lip-sync drove the mouth OBJECT's scale - the carved
// face MESH held still beneath it, the mannequin's second tell: a
// talking closeup whose lips never parted. This half gives the
// viseme program its MESH: three speech shape keys sculpted onto
// the same carved head (mouthWide's spread, mouthRound's purse,
// the bilabial press), the jaw following the line at a bounded
// fraction beneath the expression's own jaw, and the evidence
// sampled at the identity clock (22/40/62%) with the DETERMINISTIC
// hash mirroring the worker bit-exactly (one law, two runtimes).

/** The three speech shape keys the worker sculpts (fixed names). */
export const SPEECH_MESH_SHAPES = ["mouthWide", "mouthRound", "lipPress"] as const;

/** The mesh law's constants: the jaw follows the viseme openness at
 * this fraction, and the bilabial press fires inside this openness
 * window (the CLOSED shape's 0.04 lives here - m/b/p press the lips,
 * vowels and breath never do). */
export const SPEECH_JAW_FOLLOW = 0.45;
export const SPEECH_PRESS_WINDOW: [number, number] = [0.005, 0.055];

export interface SpeechMeshWeights {
  jaw: number; // 0..1 - the jawOpen key follows the line at SPEECH_JAW_FOLLOW
  wide: number; // 0..1 - the mouthWide key (the "ee" spread)
  round: number; // 0..1 - the mouthRound key (the "oo" purse)
  press: number; // 0|1 - the lipPress key (m/b/p bilabial closure)
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * THE MOUTH SPEAKS IN THE MESH (pure): map one sampled viseme shape
 * onto the speech shape-key weights. The openness drives the jaw at
 * the bounded fraction, the wide/round factors ride through, and the
 * press fires only inside the bilabial window (a closed lip the
 * consonant pressed, not a breath or a vowel). A null shape (the
 * mouth between segments) lands the rest pose: every weight zero.
 * Deterministic: the same sample always lands the same weights.
 */
export function visemeMeshWeights(shape: { o: number; w: number; r: number } | null): SpeechMeshWeights {
  if (!shape) return { jaw: 0, wide: 0, round: 0, press: 0 };
  const o = Math.min(1, Math.max(0, shape.o));
  const w = Math.min(1, Math.max(0, shape.w));
  const r = Math.min(1, Math.max(0, shape.r));
  const press = o > SPEECH_PRESS_WINDOW[0] && o <= SPEECH_PRESS_WINDOW[1] ? 1 : 0;
  return { jaw: r3(o * SPEECH_JAW_FOLLOW), wide: r3(w), round: r3(r), press };
}

export interface SpeechMeshSample {
  at: number; // seconds on the clip clock
  o: number; // the sampled openness (0 between segments)
  w: number;
  r: number;
  mesh: SpeechMeshWeights;
}

/**
 * Sample the program at the identity clock (the same 22/40/62%
 * fractions the expression evidence and the re-score judge), derive
 * the mesh weights per sample. Between segments the mouth rests.
 */
export function speechMeshSamples(program: SpeechProgram, durationSec: number): SpeechMeshSample[] {
  const dur = Math.max(0.1, durationSec);
  const stamps = [0.22, 0.4, 0.62].map((f) => Math.round(dur * f * 1000) / 1000);
  return stamps.map((at) => {
    const shape = sampleSpeech(program.visemes, at * 1000);
    return {
      at,
      o: r3(shape?.o ?? 0),
      w: r3(shape?.w ?? 0),
      r: r3(shape?.r ?? 0),
      mesh: visemeMeshWeights(shape),
    };
  });
}

/**
 * The DETERMINISTIC speech-mesh hash (16 hex) - sha256-16 over the
 * sampled shapes AND their derived mesh weights, mirrored
 * bit-exactly in the worker (f"{...:.3f}" formatting).
 */
export function speechMeshHash(samples: SpeechMeshSample[]): string {
  const spec =
    `92|` +
    samples
      .map(
        (s) =>
          `${s.at.toFixed(3)}:${s.o.toFixed(3)},${s.w.toFixed(3)},${s.r.toFixed(3)}:` +
          `${s.mesh.jaw.toFixed(3)},${s.mesh.wide.toFixed(3)},${s.mesh.round.toFixed(3)},${s.mesh.press.toFixed(3)}`,
      )
      .join("|") +
    `|v1`;
  return createHash("sha256").update(spec, "utf8").digest("hex").slice(0, 16);
}

/** The evidence block the render state names under speech.mesh. */
export function speechMeshEvidence(program: SpeechProgram, durationSec: number): {
  shapes: readonly string[];
  samples: SpeechMeshSample[];
  hash: string;
} {
  const samples = speechMeshSamples(program, durationSec);
  return { shapes: SPEECH_MESH_SHAPES, samples, hash: speechMeshHash(samples) };
}

/** Bridge payload shape (millisecond viseme table). */
export function speechPayload(program: SpeechProgram): { visemes: Viseme[]; lines: number } | null {
  if (program.visemes.length === 0) return null;
  return { visemes: program.visemes, lines: program.lines };
}

/** Short human note for stage lines / DSH results. */
export function describeSpeechProgram(program: SpeechProgram): string | null {
  if (program.visemes.length === 0) return null;
  const speakers = [...new Set(program.spans.map((s) => s.speaker).filter(Boolean))];
  const who = speakers.length > 0 ? speakers.join(" + ") : "the cast";
  return `lip-sync on ${who} (${program.lines} line${program.lines === 1 ? "" : "s"}, ${program.visemes.length} visemes)`;
}

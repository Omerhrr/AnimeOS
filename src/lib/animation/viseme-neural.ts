import ZAI from "z-ai-web-dev-sdk";
import { buildSpeechProgram, buildVisemes, type SpeechProgram, type Viseme } from "@/lib/animation/lipsync";
import { analyzeTakeVisemes, type AudioTake } from "@/lib/animation/viseme-audio";

// ─────────────────────────────────────────────────────────────
// NEURAL VISEME PASS - a phoneme plan from the language model,
// conformed to the real audio envelope
//
// The audio path (viseme-audio.ts) owns the mouth's TIMING (RMS
// energy opens the mouth, silence closes it) but can only guess at
// the mouth's IDENTITY: zero-crossing rate separates "vowel-ish"
// from "fricative-ish", so every vowel renders neutral and the
// closed stops (m/b/p) never land. This pass adds the missing
// dimension:
//
//   1. PLAN     - one LLM call turns the dialogue lines into a
//     phoneme-level viseme score (units: phoneme, viseme name,
//     relative weight). The model knows "oo" rounds, "ee" spreads,
//     and that "mbp" press the lips shut - knowledge no envelope
//     can recover.
//   2. TEXT PASS - with no audio take, the plan itself performs the
//     line (a strict upgrade over the per-character table).
//   3. AUDIO CONFORM - with a real take, the plan supplies the
//     wide/round identity per segment while the audio envelope
//     keeps ownership of openness, so the mouth still opens and
//     closes exactly where the voice acted it - now shaped by the
//     words being said.
//
// Every failure path degrades honestly: a refused/offline model or
// a garbage plan falls back to the audio-only (then text) program.
// The output is the same {s,e,o,w,r} table the drivers consume.
// ─────────────────────────────────────────────────────────────

export type NeuralVisemeName =
  | "AA" | "EY" | "IY" | "OW" | "UW" | "AH"   // vowels
  | "M_B_P" | "F_V" | "TH" | "S_SH"           // consonants
  | "N_L" | "K_G" | "R" | "W_Y" | "SIL";      // consonants + silence

/** Mouth shape per viseme name (same 0..1 axes as the text table). */
export const NEURAL_VISEME_SHAPES: Record<NeuralVisemeName, { o: number; w: number; r: number }> = {
  AA: { o: 1.0, w: 0.15, r: 0.2 },   // open "ah"
  EY: { o: 0.72, w: 0.75, r: 0.05 }, // spread "ay"
  IY: { o: 0.5, w: 0.95, r: 0.0 },   // wide "ee"
  OW: { o: 0.92, w: 0.05, r: 0.75 }, // rounded "oh"
  UW: { o: 0.6, w: 0.0, r: 1.0 },    // pursed "oo"
  AH: { o: 0.55, w: 0.3, r: 0.15 },  // neutral mid vowel
  M_B_P: { o: 0.04, w: 0.1, r: 0.1 },// lips pressed shut
  F_V: { o: 0.22, w: 0.2, r: 0.15 }, // teeth-on-lip fricative
  TH: { o: 0.26, w: 0.3, r: 0.1 },   // tongue-between-teeth
  S_SH: { o: 0.26, w: 0.62, r: 0.05 },// hissing spread
  N_L: { o: 0.32, w: 0.35, r: 0.15 },// tongue-up consonant
  K_G: { o: 0.38, w: 0.25, r: 0.2 }, // back-of-mouth stop
  R: { o: 0.45, w: 0.2, r: 0.5 },    // slightly rounded
  W_Y: { o: 0.4, w: 0.3, r: 0.7 },   // lip-round glide
  SIL: { o: 0.04, w: 0.1, r: 0.1 },  // breath / pause
};

const VISEME_NAMES = Object.keys(NEURAL_VISEME_SHAPES) as NeuralVisemeName[];

export interface NeuralUnit {
  ph: string; // phoneme label (free-form, display only)
  v: NeuralVisemeName;
  w: number; // relative duration weight, 0.2..3
}

export interface NeuralPlan {
  lines: NeuralUnit[][]; // one unit list per dialogue line
}

const PLAN_SYSTEM = [
  "You are a phonetics coach for animation lip-sync. For each dialogue line, split the text into phoneme units and assign each a viseme from this vocabulary:",
  VISEME_NAMES.join(", "),
  "- vowels: AA (open ah), EY (spread ay), IY (wide ee), OW (rounded oh), UW (pursed oo), AH (neutral)",
  "- consonants: M_B_P (lips shut), F_V, TH, S_SH (hiss), N_L, K_G, R, W_Y (round glide), SIL (pause/breath)",
  'Reply with STRICT JSON only: {"lines":[{"units":[{"ph":"<phoneme>","v":"<VISEME>","w":1.0}]}]} - one entry per line, in order. w is the relative duration (vowels ~1.3, stops ~0.6). No markdown, no commentary.',
].join("\n");

/** The exact prompt sent for one program's lines (exported for the E2E). */
export function planPromptForLines(lines: string[]): string {
  return lines.map((l, i) => `Line ${i + 1}: ${l}`).join("\n");
}

/** Parse + clamp the model's plan; null when the shape is unusable. */
export function parseNeuralPlan(raw: string, lineCount: number): NeuralPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let body: { lines?: Array<{ units?: Array<{ ph?: unknown; v?: unknown; w?: unknown }> }> };
  try {
    body = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) return null;
  const clampW = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(3, Math.max(0.2, n)) : 1.0;
  };
  const lines = body.lines
    .slice(0, Math.max(1, lineCount))
    .map((row) => {
      const units = Array.isArray(row?.units) ? row.units : [];
      const clean = units
        .map((u) => ({
          ph: String(u?.ph ?? "").slice(0, 6),
          v: (VISEME_NAMES as string[]).includes(String(u?.v ?? "")) ? (String(u.v) as NeuralVisemeName) : "AH" as NeuralVisemeName,
          w: clampW(u?.w),
        }))
        .filter((u) => u.v !== "SIL" || u.w >= 0.2);
      return clean;
    })
    .filter((units) => units.length > 0);
  if (lines.length === 0) return null;
  return { lines };
}

// ─── LLM call (cached per line set) ──────────────────────────

const planCache = new Map<string, NeuralPlan | null>(); // null = known-bad line set (do not re-ask)
const PLAN_TIMEOUT_MS = 14_000;
const PLAN_CACHE_MAX = 64;

/** One LLM call for the whole program's lines; cached; null on any failure. */
export async function neuralPhonemePlan(lines: string[]): Promise<NeuralPlan | null> {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const key = clean.join("\u0001");
  if (planCache.has(key)) return planCache.get(key) ?? null;

  let plan: NeuralPlan | null = null;
  try {
    const zai = ZAI.create();
    const call = (async () => {
      const completion = await (await zai).chat.completions.create({
        messages: [
          { role: "assistant", content: PLAN_SYSTEM },
          { role: "user", content: planPromptForLines(clean) },
        ],
        thinking: { type: "disabled" },
      } as never);
      return String((completion as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "");
    })();
    const raw = await Promise.race([
      call,
      new Promise<string>((resolve) => setTimeout(() => resolve(""), PLAN_TIMEOUT_MS)),
    ]);
    if (raw) plan = parseNeuralPlan(raw, clean.length);
  } catch {
    plan = null; // offline / refused: the honest fallbacks take over
  }

  if (planCache.size >= PLAN_CACHE_MAX) {
    const oldest = planCache.keys().next().value;
    if (oldest !== undefined) planCache.delete(oldest);
  }
  planCache.set(key, plan);
  return plan;
}

// ─── Plan → visemes ─────────────────────────────────────────

/**
 * Spread a plan's units across one span's window, weighted like the
 * text path (vowels ring, stops stay quick). Monotonic, clipped.
 */
export function planVisemesFromPlan(units: NeuralUnit[], span: { startMs: number; endMs: number }): Viseme[] {
  const out: Viseme[] = [];
  if (units.length === 0) return out;
  const window = Math.max(120, span.endMs - span.startMs);
  const total = units.reduce((a, u) => a + u.w, 0);
  let cursor = span.startMs;
  for (const unit of units) {
    const dur = (unit.w / total) * window;
    const s = cursor;
    const e = Math.min(span.endMs, cursor + dur);
    cursor = e;
    if (e <= s) continue;
    const shape = NEURAL_VISEME_SHAPES[unit.v];
    out.push({ s: Math.round(s), e: Math.round(e), o: shape.o, w: shape.w, r: shape.r });
  }
  return out;
}

/**
 * AUDIO CONFORM: keep the audio envelope's openness (it IS when the
 * mouth opens), adopt the plan's wide/round identity (it knows WHAT
 * is being said). Segments adopt the plan shape covering their
 * midpoint; plan-less stretches keep the audio shapes untouched.
 */
export function conformVisemesToPlan(audioVisemes: Viseme[], planVisemes: Viseme[]): Viseme[] {
  if (planVisemes.length === 0 || audioVisemes.length === 0) return audioVisemes;
  return audioVisemes.map((seg) => {
    const mid = (seg.s + seg.e) / 2;
    const covering = planVisemes.find((p) => mid >= p.s && mid < p.e);
    const identity = covering ?? planVisemes.reduce((best, p) => {
      const d = Math.abs((p.s + p.e) / 2 - mid);
      const bd = Math.abs((best.s + best.e) / 2 - mid);
      return d < bd ? p : best;
    }, planVisemes[0]);
    return { s: seg.s, e: seg.e, o: seg.o, w: identity.w, r: identity.r };
  });
}

// ─── Program assembly ───────────────────────────────────────

export interface NeuralSpeechProgram extends SpeechProgram {
  audioVisemes: number; // visemes whose openness came from real audio
  audioTakes: number; // spans performed from a real take
  neuralSpans: number; // spans whose shape identity came from the plan
  neuralTextSpans: number; // spans performed by the plan alone (no audio)
  planOk: boolean; // did the neural plan arrive?
}

/**
 * The full program: neural plan + real audio, each owning what it is
 * best at. Spans with a decodable take get audio-timed, plan-shaped
 * visemes; spans without audio get the plan's own performance; a
 * failed plan falls back to the audio-only (then per-character text)
 * behavior - the pipeline never blocks on the model.
 */
export async function neuralSpeechProgram(input: {
  dialogue: string | null | undefined;
  shotDurationMs: number;
  takes: AudioTake[];
}): Promise<NeuralSpeechProgram> {
  const base = buildSpeechProgram({
    dialogue: input.dialogue,
    shotDurationMs: input.shotDurationMs,
    voiceTakes: input.takes.map((t) => ({ startMs: t.startMs, durationMs: t.durationMs })),
  });
  if (base.spans.length === 0) {
    return { ...base, audioVisemes: 0, audioTakes: 0, neuralSpans: 0, neuralTextSpans: 0, planOk: false };
  }

  const lineTexts = base.spans.map((s) => s.text);
  const plan = await neuralPhonemePlan(lineTexts);

  const takes = [...input.takes].sort((a, b) => a.startMs - b.startMs);
  const paired = takes.length >= base.lines;
  const visemes: Viseme[] = [];
  let audioVisemes = 0;
  let audioTakes = 0;
  let neuralSpans = 0;
  let neuralTextSpans = 0;

  base.spans.forEach((span, i) => {
    const units = plan?.lines[Math.min(i, (plan?.lines.length ?? 1) - 1)];
    const planVisemes = plan && units ? planVisemesFromPlan(units, { startMs: span.startMs, endMs: span.endMs }) : [];
    const take = paired ? takes[i] : undefined;
    const audio = take?.wav ? analyzeTakeVisemes(take.wav, { startMs: span.startMs, endMs: span.endMs }) : null;
    if (audio) {
      const conformed = planVisemes.length > 0 ? conformVisemesToPlan(audio, planVisemes) : audio;
      visemes.push(...conformed);
      audioVisemes += audio.length;
      audioTakes += 1;
      if (planVisemes.length > 0) neuralSpans += 1;
    } else if (planVisemes.length > 0) {
      visemes.push(...planVisemes);
      neuralTextSpans += 1;
    } else {
      visemes.push(...buildVisemes([span]));
    }
  });

  return { ...base, visemes, audioVisemes, audioTakes, neuralSpans, neuralTextSpans, planOk: Boolean(plan) };
}

/** Stage / event note naming what shaped the mouth. */
export function describeNeuralSpeechProgram(program: NeuralSpeechProgram): string | null {
  if (program.visemes.length === 0) return null;
  const speakers = [...new Set(program.spans.map((s) => s.speaker).filter(Boolean))];
  const who = speakers.length > 0 ? speakers.join(" + ") : "the cast";
  const parts: string[] = [];
  if (program.audioTakes > 0) parts.push(`${program.audioTakes} real take${program.audioTakes === 1 ? "" : "s"}`);
  if (program.neuralSpans > 0) parts.push("neural phoneme shaping");
  if (program.neuralTextSpans > 0 && program.audioTakes === 0) parts.push("neural phoneme plan");
  const how = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `lip-sync on ${who} (${program.lines} line${program.lines === 1 ? "" : "s"}, ${program.visemes.length} visemes${how})`;
}

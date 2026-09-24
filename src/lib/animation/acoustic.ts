import type { Viseme } from "@/lib/animation/lipsync";
import {
  parseWavMono, frameAudio, loudnessGate, FRAME_MS,
} from "@/lib/animation/viseme-audio";
import type { NeuralUnit } from "@/lib/animation/viseme-neural";

// ─────────────────────────────────────────────────────────────
// ACOUSTIC MODEL SLOT - the WAV re-times the plan
//
// The neural viseme pass gives the mouth its IDENTITY (round oo,
// wide ee, lips-shut stops) but spreads its units EVENLY across the
// line's span window - the plan's clock is the script's, not the
// voice take's. When the real take breathes, pauses between words,
// or rushes a phrase, the plan's identity drifts off the words it
// belongs to. This slot closes that gap with ACOUSTICS, not
// generation:
//
//   1. ANALYZE  - the same deterministic DSP the audio envelope
//     uses (RMS frames, robust 95th-percentile loudness gate)
//     segments the take into SPEECH RUNS and real silences, and
//     picks SYLLABLE ANCHORS (energy peaks inside the runs).
//   2. RE-TIME  - the plan's spoken units are re-distributed over
//     the real speech time (weight-proportional), SIL units land
//     in real gaps, and unit boundaries snap to the acoustic
//     valleys between syllable anchors. Deterministic, local, no
//     model call, no generated pixel or sample - it only moves the
//     plan's unit boundaries to where the voice actually spoke.
//
// The slot is a PROVIDER SLOT like the render engines: the built-in
// DSP aligner ships on (ANIMEOS_ACOUSTIC=off turns it off; a future
// forced-alignment model plugs into the same seam). Without a
// decodable take or without speech in it, the plan falls back to
// its even spread - the pipeline never blocks on the analysis.
// ─────────────────────────────────────────────────────────────

export type AcousticProvider = "builtin-dsp" | "off";

const OFF_VALUES = new Set(["off", "false", "0", "none", "no"]);

/** The env-gated acoustic slot: built-in DSP aligner ships ON. */
export function acousticProvider(): AcousticProvider {
  const raw = String(process.env.ANIMEOS_ACOUSTIC ?? "").trim().toLowerCase();
  if (OFF_VALUES.has(raw)) return "off";
  return "builtin-dsp";
}

export interface AcousticProfile {
  spanStartMs: number;
  spanEndMs: number;
  nuclei: number[]; // syllable anchors (clip-time ms), in speech order
  runs: Array<{ s: number; e: number }>; // speech regions, clip-time ms
  gaps: Array<{ s: number; e: number }>; // silences inside the span, clip-time ms
  speechMs: number; // total voiced time inside the span
  gapMs: number; // total silent time inside the span
}

const MIN_RUN_MS = 60; // shorter voiced blips read as noise, not speech
const MIN_NUCLEUS_GAP_MS = 110; // two syllable peaks closer than this merge
const MIN_NUCLEUS_ABOVE_GATE = 1.15; // anchors must rise above the floor
const MAX_NUCLEI = 64; // safety cap for a wall of sound

/**
 * Segment one take's span into speech runs, silences and syllable
 * anchors. Times are on the CLIP timeline (frame k lands at
 * span.startMs + k * FRAME_MS, the same 1:1 mapping the envelope
 * path uses). Returns null when the take cannot be decoded or
 * carries no usable speech.
 */
export function analyzeAcoustics(wav: Buffer, span: { startMs: number; endMs: number }): AcousticProfile | null {
  const parsed = parseWavMono(wav);
  if (!parsed) return null;
  const frames = frameAudio(parsed);
  const ref = loudnessGate(frames);
  if (!ref) return null;
  const { peak, gate } = ref;

  const frameMs = (k: number) => span.startMs + k * FRAME_MS;
  const clip = (ms: number) => Math.min(span.endMs, Math.max(span.startMs, ms));

  // 1. speech runs: contiguous frames at or above the gate, dropped
  //    when shorter than MIN_RUN_MS (noise blips are not speech).
  const runs: Array<{ s: number; e: number }> = [];
  let runStart = -1;
  const closeRun = (endExclusive: number) => {
    if (runStart < 0) return;
    const s = clip(frameMs(runStart));
    const e = clip(frameMs(endExclusive));
    if (e - s >= MIN_RUN_MS) runs.push({ s, e });
    runStart = -1;
  };
  frames.forEach((f, i) => {
    if (f.rms >= gate) {
      if (runStart < 0) runStart = i;
    } else {
      closeRun(i);
    }
  });
  closeRun(frames.length);
  if (runs.length === 0) return null;

  // 2. gaps: the silence complement inside the span window.
  const gaps: Array<{ s: number; e: number }> = [];
  let cursor = span.startMs;
  for (const r of runs) {
    if (r.s > cursor) gaps.push({ s: cursor, e: r.s });
    cursor = Math.max(cursor, r.e);
  }
  if (cursor < span.endMs) gaps.push({ s: cursor, e: span.endMs });

  // 3. syllable anchors: local maxima of the 3-frame smoothed RMS
  //    that rise above the gate, thinned so anchors stay a syllable
  //    apart (the strongest of a too-close pair survives).
  const smooth = frames.map((_, i) => {
    const a = frames[Math.max(0, i - 1)].rms;
    const b = frames[i].rms;
    const c = frames[Math.min(frames.length - 1, i + 1)].rms;
    return (a + b + c) / 3;
  });
  const rawNuclei: Array<{ k: number; v: number }> = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    if (frames[i].rms < gate) continue;
    if (smooth[i] < smooth[i - 1] || smooth[i] < smooth[i + 1]) continue;
    if (smooth[i] < gate * MIN_NUCLEUS_ABOVE_GATE) continue;
    rawNuclei.push({ k: i, v: smooth[i] });
  }
  rawNuclei.sort((a, b) => a.k - b.k);
  const nuclei: number[] = [];
  for (const n of rawNuclei) {
    if (nuclei.length >= MAX_NUCLEI) break;
    const t = clip(frameMs(n.k));
    const last = nuclei[nuclei.length - 1];
    if (last != null && t - last < MIN_NUCLEUS_GAP_MS) {
      // too close: keep the stronger peak at the same slot
      const lastStrength = smooth[Math.round((last - span.startMs) / FRAME_MS)] ?? 0;
      if (n.v > lastStrength) nuclei[nuclei.length - 1] = t;
      continue;
    }
    nuclei.push(t);
  }

  const speechMs = runs.reduce((a, r) => a + (r.e - r.s), 0);
  const gapMs = Math.max(0, span.endMs - span.startMs - speechMs);
  return { spanStartMs: span.startMs, spanEndMs: span.endMs, nuclei, runs, gaps, speechMs, gapMs };
}

/** Short human note for stage lines: what the analysis found. */
export function describeAcoustics(profile: AcousticProfile): string {
  return `${profile.nuclei.length} syllable anchor${profile.nuclei.length === 1 ? "" : "s"} over ${profile.runs.length} speech run${profile.runs.length === 1 ? "" : "s"} (${(profile.speechMs / 1000).toFixed(1)}s voiced)`;
}

// ─── The re-timing warp ─────────────────────────────────────

const VALLEY_SNAP_MS = 70; // boundaries snap to acoustic valleys within this
const MIN_SEGMENT_MS = 30; // a warp can starve a segment to death - drop it

/**
 * Walk a band list (runs OR gaps), consuming ms from the front and
 * returning one portion PER band touched. clamp=true keeps the
 * consumption inside ONE band (a SIL unit should sit in a single
 * real silence, not bridge across speech).
 */
function bandWalker(bands: Array<{ s: number; e: number }>, clamp = false) {
  let i = 0;
  let t = 0; // ms consumed inside band i
  return (dur: number): Array<{ s: number; e: number }> => {
    const portions: Array<{ s: number; e: number }> = [];
    let remaining = dur;
    while (remaining > 0.0001 && i < bands.length) {
      const band = bands[i];
      const avail = band.e - band.s - t;
      if (avail <= 0) {
        i += 1;
        t = 0;
        continue;
      }
      const take = Math.min(avail, remaining);
      portions.push({ s: band.s + t, e: band.s + t + take });
      t += take;
      remaining -= take;
      if (band.e - band.s - t <= 0.0001) {
        i += 1;
        t = 0;
      }
      if (clamp) break; // one band only: the rest of the budget evaporates
    }
    return portions;
  };
}

/**
 * RE-TIME the plan onto the take's acoustics: spoken units spread
 * over the REAL speech time (weight-proportional through the runs),
 * SIL units land in real gaps, and boundaries snap to the acoustic
 * valleys between syllable anchors. Monotonic, clipped to the span.
 * Returns [] when the warp has nothing to work with (the caller
 * falls back to the plan's even spread).
 */
export function retimedPlanVisemes(
  units: NeuralUnit[],
  span: { startMs: number; endMs: number },
  profile: AcousticProfile,
  shapes: Record<string, { o: number; w: number; r: number }>,
): Viseme[] {
  const spoken = units.filter((u) => u.v !== "SIL");
  if (spoken.length === 0 || profile.speechMs <= 0) return [];
  const spokenW = spoken.reduce((a, u) => a + u.w, 0);
  const silW = units.filter((u) => u.v === "SIL").reduce((a, u) => a + u.w, 0);
  if (spokenW <= 0) return [];

  const nextSpeech = bandWalker(profile.runs);
  const nextGap = bandWalker(profile.gaps, true); // a SIL sits in ONE real gap
  const out: Viseme[] = [];
  let prevEnd = span.startMs;

  const push = (unit: NeuralUnit, raw: { s: number; e: number }) => {
    const s = Math.max(prevEnd, Math.min(span.endMs, raw.s));
    const e = Math.max(s, Math.min(span.endMs, raw.e));
    if (e - s < MIN_SEGMENT_MS) return; // starved: the neighbors absorb it
    const shape = shapes[unit.v] ?? shapes.AH ?? { o: 0.55, w: 0.3, r: 0.15 };
    out.push({ s: Math.round(s), e: Math.round(e), o: shape.o, w: shape.w, r: shape.r });
    prevEnd = e;
  };

  // valley targets: the acoustic low between adjacent syllable anchors
  const valleys: number[] = [];
  for (let i = 1; i < profile.nuclei.length; i++) {
    valleys.push((profile.nuclei[i - 1] + profile.nuclei[i]) / 2);
  }
  const snap = (ms: number): number => {
    let best = ms;
    let bd = VALLEY_SNAP_MS;
    for (const v of valleys) {
      const d = Math.abs(v - ms);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  };

  for (const unit of units) {
    if (unit.v === "SIL") {
      const dur = silW > 0 && profile.gapMs > 0 ? (unit.w / silW) * profile.gapMs : 0;
      const portions = dur > 0 ? nextGap(dur) : [];
      // a SIL sits in ONE real gap (clamped); a starved SIL simply
      // vanishes - audio owns the silence anyway
      for (const portion of portions.slice(0, 1)) push(unit, portion);
      continue;
    }
    const dur = (unit.w / spokenW) * profile.speechMs;
    const portions = nextSpeech(dur);
    // a unit interrupted by a pause continues after it: one segment
    // per speech run portion, same shape (real speech behaves exactly
    // like this - the pause owns the mouth via the audio conform)
    portions.forEach((portion, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === portions.length - 1;
      // snap interior boundaries toward the acoustic valleys; the
      // span edges stay pinned so coverage never drifts off the take
      const s = isFirst ? portion.s : snap(portion.s);
      const e = isLast && portion.e >= span.endMs - 1 ? portion.e : Math.max(s, snap(portion.e));
      push(unit, { s, e });
    });
  }
  return out;
}

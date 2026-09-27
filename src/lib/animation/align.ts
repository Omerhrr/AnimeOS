/**
 * align - TIMESTAMPED PHONEME ALIGNMENT (iteration 67).
 *
 * The neural rung heard WORDS (ASR) and the DSP heard SYLLABLE
 * ANCHORS (RMS nuclei), but nobody placed the plan's PHONEMES to the
 * millisecond: the plan spread its units evenly, the warp moved them
 * by weight, and a bilabial stop never fully closed the mouth because
 * openness stayed audio-owned at segment resolution.
 *
 * This module is the forced aligner the pipeline was missing, built
 * entirely from deterministic evidence:
 *
 *   • the plan's units (which phoneme, which viseme identity, weight);
 *   • the line's tokens (the words that were written);
 *   • the take's measured syllable anchors (the DSP's nuclei);
 *   • the take's openness sampler (audio energy at any millisecond).
 *
 * Words land ON the measured anchors in order (a word spends as many
 * anchors as it has vowel units); phoneme windows spread inside the
 * word by weight; each window's openness is MEASURED from the audio
 * (openness stays audio-owned - now at phoneme resolution); and a
 * closed stop the plan placed CAPS the openness in its exact window
 * (the plan owns the closure, the audio owns the energy). Scarce
 * anchors degrade to proportional placement and say so. No randomness,
 * no timestamps invented - every millisecond traces to the WAV.
 */

import type { Viseme } from "@/lib/animation/lipsync";
import { tokenizeLine, type AcousticProfile } from "@/lib/animation/acoustic";
import type { NeuralUnit } from "@/lib/animation/viseme-neural";

/** vowel nuclei - a unit of these visemes spends one syllable anchor */
export const VOWEL_VISEMES = new Set<string>(["AA", "EY", "IY", "OW", "UW", "AH"]);
/** closed stops + silence - the plan owns the closure in their window */
export const STOP_VISEMES = new Set<string>(["M_B_P", "SIL"]);

const STOP_CAP = 0.1; // a stop's openness ceiling inside its window
const WORD_PAD_MS = 55; // the word window breathes a little past its anchors
const SAMPLE_STEP_MS = 20; // the openness sampling step inside a window

export interface PhonemeCell {
  ph: string;
  v: string;
  w: number;
  sMs: number;
  eMs: number;
  o: number; // measured openness (capped at the stop's law)
  wide: number;
  round: number;
  stop: boolean;
}

export interface WordCell {
  text: string;
  sMs: number;
  eMs: number;
  nuclei: number;
}

export interface PhonemeTimeline {
  units: PhonemeCell[];
  words: WordCell[];
  anchors: number;
  proportional: boolean; // anchors scarce - the placement degraded, named
  note: string;
}

export interface AlignmentResult {
  timeline: PhonemeTimeline;
  visemes: Viseme[];
  stops: number; // closures the plan placed
}

/**
 * Forced-align one line's plan units onto its take: words consume the
 * measured anchors their vowels demand, phoneme windows spread inside
 * each word by weight, and every window measures its own openness.
 * Returns null when there is nothing to align against (no tokens, no
 * anchors, no units) - the caller keeps its existing paths honestly.
 */
export function alignPhonemeTimeline(input: {
  units: NeuralUnit[];
  line: string;
  span: { startMs: number; endMs: number };
  profile: AcousticProfile;
  shapes: Record<string, { o: number; w: number; r: number }>;
  opennessAt: (ms: number) => number;
}): AlignmentResult | null {
  const { units, span, profile, shapes, opennessAt } = input;
  const tokens = tokenizeLine(input.line);
  if (units.length === 0 || tokens.length === 0 || profile.nuclei.length === 0) return null;

  // map units to words by cumulative weight share (the ASR re-weight's
  // own mapping law, applied to the written tokens)
  const totalW = units.reduce((a, u) => a + Math.max(0.05, u.w), 0);
  if (totalW <= 0) return null;
  const wordOfUnit: number[] = [];
  let cum = 0;
  for (const u of units) {
    const w = Math.max(0.05, u.w);
    const idx = Math.min(tokens.length - 1, Math.floor(((cum + w / 2) / totalW) * tokens.length));
    wordOfUnit.push(idx);
    cum += w;
  }

  // each word spends as many anchors as it has vowel units (at least one)
  const nucleiOfWord = tokens.map((_, i) =>
    Math.max(1, units.filter((_, k) => wordOfUnit[k] === i && VOWEL_VISEMES.has(units[k].v)).length),
  );
  const demanded = nucleiOfWord.reduce((a, b) => a + b, 0);
  const anchors = profile.nuclei;
  const have = anchors.length;

  // word windows: anchor-honest when the anchors suffice, proportional
  // (and named) when they run scarce
  const wordStart: number[] = [];
  const wordEnd: number[] = [];
  let proportional = false;
  let note = "";
  if (have >= demanded) {
    let a = 0;
    for (let i = 0; i < tokens.length; i++) {
      const first = anchors[a];
      const last = anchors[a + nucleiOfWord[i] - 1];
      // the anchors are already on the clip timeline (analyzeAcoustics
      // maps frames at span.startMs + k * FRAME_MS)
      wordStart.push(first - WORD_PAD_MS);
      wordEnd.push(last + WORD_PAD_MS);
      a += nucleiOfWord[i];
    }
    note = `words placed on ${demanded} of ${have} measured anchors`;
  } else {
    proportional = true;
    const usable = Math.min(span.endMs - span.startMs, Math.max(200, anchors[have - 1] - span.startMs));
    const totalN = demanded;
    let cursor = 0;
    for (let i = 0; i < tokens.length; i++) {
      const share = nucleiOfWord[i] / totalN;
      wordStart.push(span.startMs + cursor * usable);
      cursor += share;
      wordEnd.push(span.startMs + cursor * usable);
    }
    note = `anchors scarce (${have} for ${demanded} nuclei) - proportional placement`;
  }
  // windows never leave the span, never overlap (midpoint between words)
  for (let i = 0; i < tokens.length; i++) {
    wordStart[i] = Math.max(span.startMs, wordStart[i]);
    wordEnd[i] = Math.min(span.endMs, wordEnd[i]);
    if (i > 0 && wordStart[i] < wordEnd[i - 1]) {
      const mid = (wordStart[i] + wordEnd[i - 1]) / 2;
      wordEnd[i - 1] = mid;
      wordStart[i] = mid;
    }
  }

  // phoneme windows inside each word, weight-proportional; each window
  // measures its own openness; the plan's stops cap it (the closure law)
  const cells: PhonemeCell[] = [];
  const words: WordCell[] = [];
  let stops = 0;
  for (let i = 0; i < tokens.length; i++) {
    const idxs = units.map((_, k) => k).filter((k) => wordOfUnit[k] === i);
    if (idxs.length === 0) continue;
    const ws = wordStart[i];
    const we = wordEnd[i];
    const wTotal = idxs.reduce((a, k) => a + Math.max(0.05, units[k].w), 0);
    let cursor = ws;
    for (const k of idxs) {
      const u = units[k];
      const w = Math.max(0.05, u.w);
      const sMs = cursor;
      const eMs = cursor + ((we - ws) * w) / wTotal;
      cursor = eMs;
      const stop = STOP_VISEMES.has(u.v);
      let o = meanOpenness(opennessAt, sMs, eMs);
      if (stop) {
        o = Math.min(o, STOP_CAP);
        stops += 1;
      }
      const shape = shapes[u.v] ?? shapes.AH;
      cells.push({
        ph: u.ph,
        v: u.v,
        w: Math.round(u.w * 100) / 100,
        sMs: Math.round(sMs),
        eMs: Math.round(eMs),
        o: Math.round(o * 100) / 100,
        wide: shape.w,
        round: shape.r,
        stop,
      });
    }
    words.push({ text: tokens[i], sMs: Math.round(ws), eMs: Math.round(we), nuclei: nucleiOfWord[i] });
  }
  if (cells.length === 0) return null;

  const visemes: Viseme[] = cells.map((c) => ({
    s: c.sMs,
    e: c.eMs,
    o: c.o,
    w: c.wide,
    r: c.round,
  }));
  return {
    timeline: { units: cells, words, anchors: have, proportional, note },
    visemes,
    stops,
  };
}

function meanOpenness(opennessAt: (ms: number) => number, sMs: number, eMs: number): number {
  const steps = Math.max(1, Math.round((eMs - sMs) / SAMPLE_STEP_MS));
  let acc = 0;
  for (let i = 0; i < steps; i++) {
    acc += opennessAt(sMs + ((i + 0.5) * (eMs - sMs)) / steps);
  }
  return acc / steps;
}

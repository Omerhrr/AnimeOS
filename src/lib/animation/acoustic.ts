import type { Viseme } from "@/lib/animation/lipsync";
import {
  parseWavMono, frameAudio, loudnessGate, FRAME_MS,
} from "@/lib/animation/viseme-audio";
import type { NeuralUnit } from "@/lib/animation/viseme-neural";
import { createHash } from "node:crypto";

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
// The slot is a PROVIDER SLOT like the render engines, now with two
// rungs:
//
//   • builtin-dsp (ships ON) - the deterministic aligner above. Fast,
//     free, local, no model call.
//   • neural (ANIMEOS_ACOUSTIC=neural) - an ASR model HEARS the take
//     (z-ai audio.asr, base64 in, transcript out) and the transcript
//     is aligned against the line's words: words the voice actually
//     spoke keep their plan weight, words the voice skipped collapse
//     to SIL so the mouth stops performing them. The ASR owns WHAT
//     was said; the DSP warp still owns WHEN - the transcript carries
//     no timestamps, so word evidence re-weights the plan and the
//     energy runs place it. Any failure (offline model, mismatched
//     transcript, undecodable take) degrades to the DSP-only path.
//   • off (ANIMEOS_ACOUSTIC=off) - the plan's even spread, as before.
// ─────────────────────────────────────────────────────────────

export type AcousticProvider = "builtin-dsp" | "neural" | "off";

const OFF_VALUES = new Set(["off", "false", "0", "none", "no"]);
const NEURAL_VALUES = new Set(["neural", "asr"]);

/** The env-gated acoustic slot: built-in DSP aligner ships ON. */
export function acousticProvider(): AcousticProvider {
  const raw = String(process.env.ANIMEOS_ACOUSTIC ?? "").trim().toLowerCase();
  if (OFF_VALUES.has(raw)) return "off";
  if (NEURAL_VALUES.has(raw)) return "neural";
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

// ─── The neural rung: ASR-guided word evidence ──────────────

const ASR_TIMEOUT_MS = 14_000;
const ASR_CACHE_MAX = 32;
const asrCache = new Map<string, string | null>(); // null = known-bad take (do not re-ask)

/**
 * Transcribe one take through the ASR model. The transcript carries
 * no timestamps - it is WORD EVIDENCE, not a timing source. Cached
 * per take content; null on any failure (the caller degrades to the
 * DSP-only warp).
 */
export async function transcribeTake(wav: Buffer): Promise<string | null> {
  if (wav.length < 100) return null;
  const key = createHash("md5").update(wav).digest("hex");
  if (asrCache.has(key)) return asrCache.get(key) ?? null;

  let text: string | null = null;
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const call = (async () => {
      const zai = await ZAI.create();
      const res = (await zai.audio.asr.create({ file_base64: wav.toString("base64") })) as { text?: unknown };
      const t = String(res?.text ?? "").trim();
      return t.length > 0 ? t : null;
    })();
    text = await Promise.race([
      call,
      new Promise<string | null>((resolve) => setTimeout(() => resolve(null), ASR_TIMEOUT_MS)),
    ]);
  } catch {
    text = null; // offline / refused: the DSP-only path takes over
  }

  if (asrCache.size >= ASR_CACHE_MAX) {
    const oldest = asrCache.keys().next().value;
    if (oldest !== undefined) asrCache.delete(oldest);
  }
  asrCache.set(key, text);
  return text;
}

/** Normalize one line into matchable tokens: CJK text becomes characters, latin text becomes lowercase words. */
export function tokenizeLine(text: string): string[] {
  const clean = String(text ?? "").toLowerCase().replace(/[\p{P}\p{S}]/gu, " ");
  const hasCJK = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(clean);
  if (hasCJK) {
    return [...clean.replace(/\s+/g, "")].filter((ch) => /\p{L}|\p{N}/u.test(ch));
  }
  return clean.split(/\s+/).filter(Boolean);
}

/**
 * Align the line's tokens against the ASR transcript as a bounded
 * subsequence: a dialogue token is CONFIRMED when the transcript
 * carries it at or after the current cursor (skipping up to
 * MAX_SKIP transcript tokens of filler). Returns the confirmed token
 * indices and how many the voice skipped.
 */
export function alignTokens(lineTokens: string[], transcriptTokens: string[], maxSkip = 4): { confirmed: Set<number>; missing: number } {
  const confirmed = new Set<number>();
  let cursor = 0;
  let missing = 0;
  for (let i = 0; i < lineTokens.length; i++) {
    const limit = Math.min(transcriptTokens.length, cursor + maxSkip + 1);
    let found = -1;
    for (let j = cursor; j < limit; j++) {
      const a = lineTokens[i];
      const b = transcriptTokens[j];
      if (a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b))) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      confirmed.add(i);
      cursor = found + 1;
    } else {
      missing += 1;
    }
  }
  return { confirmed, missing };
}

export interface AsrReweight {
  units: NeuralUnit[]; // the plan with unspoken words collapsed to SIL
  confirmed: number; // tokens the transcript backed
  missing: number; // tokens the voice skipped
}

const ASR_MATCH_RATIO = 0.34; // below this the transcript reads as a different take - hands off
const ASR_MIN_TOKENS = 2; // a one-token line cannot be aligned honestly

/**
 * Re-weight the plan from ASR word evidence: units are mapped onto
 * the line's tokens by cumulative weight share, and units whose
 * token range the transcript mostly fails to confirm collapse to
 * SIL (the mouth stops performing words the voice skipped). Returns
 * null when the transcript is unusable or clearly not this line -
 * the caller keeps the plan untouched (honest DSP-only behavior).
 */
export function reweightUnitsForAsr(units: NeuralUnit[], lineText: string, transcript: string): AsrReweight | null {
  const lineTokens = tokenizeLine(lineText);
  const transcriptTokens = tokenizeLine(transcript);
  if (lineTokens.length < ASR_MIN_TOKENS || transcriptTokens.length === 0) return null;
  const spoken = units.filter((u) => u.v !== "SIL");
  if (spoken.length === 0) return null;

  const { confirmed, missing } = alignTokens(lineTokens, transcriptTokens);
  const confirmedRatio = lineTokens.length > 0 ? confirmed.size / lineTokens.length : 0;
  if (confirmedRatio < ASR_MATCH_RATIO) return null; // a different take (or the model refused): hands off

  // token weights: latin words weigh their length, CJK chars weigh 1
  const tokenWeights = lineTokens.map((t) => Math.max(1, t.length));
  const totalTokenWeight = tokenWeights.reduce((a, b) => a + b, 0);
  // each token's range along the 0..1 weight axis
  const tokenRanges: Array<{ s: number; e: number; idx: number }> = [];
  let acc = 0;
  tokenWeights.forEach((w, idx) => {
    tokenRanges.push({ s: acc / totalTokenWeight, e: (acc + w) / totalTokenWeight, idx });
    acc += w;
  });

  // each unit owns the slice of the weight axis its planned weight
  // covers; a unit collapses when the tokens it overlaps (weighted by
  // that overlap) are mostly NOT confirmed
  const spokenTotal = spoken.reduce((a, u) => a + u.w, 0);
  const out = units.map((u) => ({ ...u }));
  let unitCursor = 0;
  for (let i = 0; i < units.length; i++) {
    if (units[i].v === "SIL") continue;
    const start = unitCursor / spokenTotal;
    unitCursor += units[i].w;
    const end = unitCursor / spokenTotal;
    let confirmedOverlap = 0;
    let totalOverlap = 0;
    for (const r of tokenRanges) {
      const o = Math.min(end, r.e) - Math.max(start, r.s);
      if (o > 0) {
        totalOverlap += o;
        if (confirmed.has(r.idx)) confirmedOverlap += o;
      }
    }
    if (totalOverlap > 0 && confirmedOverlap / totalOverlap < 0.5) {
      out[i] = { ph: units[i].ph, v: "SIL", w: 0.2 };
    }
  }
  return { units: out, confirmed: confirmed.size, missing };
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

// ─────────────────────────────────────────────────────────────
// THE PERSISTED AUDIT
//
// The render-time warp computes and discards its acoustic picture
// every pass - the stage line summarizes it, then it is gone. This
// audit PERSISTS one take's alignment report on the VOICE cue row:
// what the DSP found (speech runs, syllable anchors, voiced share),
// and under the neural rung what the ASR heard against the line's
// words (confirmed / skipped tokens, the transcript itself). The
// sound timeline reads the report back as a badge so the studio can
// see WHICH takes the mouth trusts the acoustics on.
// ─────────────────────────────────────────────────────────────

export interface AcousticAuditReport {
  provider: AcousticProvider;
  retimed: boolean; // would the acoustic warp engage for this take
  speechRuns: number;
  nuclei: number; // syllable anchors
  speechMs: number;
  gapMs: number;
  spanMs: number;
  tokens: number; // matchable tokens in the spoken line
  confirmed: number | null; // tokens the ASR backed (neural rung only)
  missing: number | null; // tokens the voice skipped (neural rung only)
  matchRatio: number | null;
  transcript: string | null; // what the ASR heard (neural rung only)
  note: string;
  auditedAt: string;
}

/**
 * The spoken line behind a VOICE cue: labels are authored as
 * "Speaker: text", so the text after the first separator is the
 * performance; a shot dialogue line whose text matches the label's
 * tail is preferred (it is the canonical wording).
 */
function spokenLineOf(label: string, dialogue: unknown): string {
  const tail = label.includes(": ") ? label.split(":").slice(1).join(":").trim() : label.trim();
  const lines = parseDialogueSafe(dialogue);
  for (const line of lines) {
    const a = line.toLowerCase();
    const b = tail.toLowerCase();
    if (a && (b.includes(a) || a.includes(b))) return line;
  }
  return tail;
}

function parseDialogueSafe(dialogue: unknown): string[] {
  if (typeof dialogue !== "string" || !dialogue.trim()) return [];
  try {
    const parsed = JSON.parse(dialogue) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((l) => String((l as { text?: unknown })?.text ?? "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export type AcousticAuditResult =
  | { ok: true; report: AcousticAuditReport }
  | { ok: false; error: string };

/**
 * Audit ONE VOICE cue's take: analyze the WAV through the acoustic
 * slot, and under the neural rung align the ASR transcript against
 * the line's words. Persists the report on the cue (auditable), and
 * returns it. No plan is re-timed here - the render-time warp owns
 * that; this is the evidence it works from, kept on the record.
 */
export async function auditVoiceTakeAcoustics(
  cue: { id: string; label: string; startMs: number; durationMs: number; voiceDurationMs: number | null; voiceUrl: string | null },
  dialogue: unknown,
  readWav: (url: string) => Buffer | null,
): Promise<AcousticAuditResult> {
  const provider = acousticProvider();
  const spanMs = Math.max(200, cue.voiceDurationMs ?? cue.durationMs);
  const span = { startMs: cue.startMs, endMs: cue.startMs + spanMs };
  const base: AcousticAuditReport = {
    provider,
    retimed: false,
    speechRuns: 0,
    nuclei: 0,
    speechMs: 0,
    gapMs: 0,
    spanMs,
    tokens: 0,
    confirmed: null,
    missing: null,
    matchRatio: null,
    transcript: null,
    note: "",
    auditedAt: new Date().toISOString(),
  };

  const line = spokenLineOf(cue.label, dialogue);
  const lineTokens = tokenizeLine(line);
  base.tokens = lineTokens.length;

  if (!cue.voiceUrl) {
    base.note = "no rendered take yet - the plan performs from text only";
    return { ok: true, report: base };
  }
  const wav = readWav(cue.voiceUrl);
  if (!wav) {
    base.note = "take file unreadable on disk";
    return { ok: true, report: base };
  }
  const profile = analyzeAcoustics(wav, span);
  if (!profile) {
    base.note = "take could not be decoded as speech (no usable runs)";
    return { ok: true, report: base };
  }
  base.retimed = provider !== "off";
  base.speechRuns = profile.runs.length;
  base.nuclei = profile.nuclei.length;
  base.speechMs = profile.speechMs;
  base.gapMs = profile.gapMs;

  if (provider === "neural") {
    const transcript = await transcribeTake(wav);
    if (transcript) {
      base.transcript = transcript.slice(0, 160);
      const transcriptTokens = tokenizeLine(transcript);
      if (lineTokens.length >= 2 && transcriptTokens.length > 0) {
        const { confirmed, missing } = alignTokens(lineTokens, transcriptTokens);
        base.confirmed = confirmed.size;
        base.missing = missing;
        base.matchRatio = lineTokens.length > 0 ? confirmed.size / lineTokens.length : 0;
        base.note = `ASR heard ${confirmed.size}/${lineTokens.length} words of the line; the render-time warp snaps to ${profile.nuclei.length} syllable anchor${profile.nuclei.length === 1 ? "" : "s"}`;
      } else {
        base.note = `ASR transcript too short to align against the line; the DSP warp owns timing (${profile.nuclei.length} anchors)`;
      }
    } else {
      base.note = "ASR unavailable (offline or refused) - DSP-only evidence recorded";
    }
  } else if (provider === "off") {
    base.note = `acoustic slot off - the plan's even spread stands (take carries ${profile.nuclei.length} anchors unused)`;
  } else {
    base.note = `DSP evidence recorded: ${profile.runs.length} speech run${profile.runs.length === 1 ? "" : "s"}, warp snaps to ${profile.nuclei.length} syllable anchor${profile.nuclei.length === 1 ? "" : "s"} at render`;
  }
  return { ok: true, report: base };
}

/** One-line human summary the UI badges read. */
export function describeAcousticReport(r: AcousticAuditReport): string {
  const head = r.retimed
    ? `re-timed from the take (${(r.speechMs / 1000).toFixed(1)}s voiced of ${(r.spanMs / 1000).toFixed(1)}s, ${r.nuclei} anchor${r.nuclei === 1 ? "" : "s"})`
    : "plan timing stands";
  const tail = r.matchRatio != null ? ` - ASR ${r.confirmed}/${r.tokens} words` : "";
  return `${head}${tail}`;
}

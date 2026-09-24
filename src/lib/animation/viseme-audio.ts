import { buildSpeechProgram, buildVisemes, type SpeechProgram, type Viseme } from "@/lib/animation/lipsync";

// ─────────────────────────────────────────────────────────────
// AUDIO-DRIVEN VISEMES OVER REAL TTS TAKES
//
// Iteration 31 laid mouth shapes over the dialogue TEXT (the text
// was the timing score). This module upgrades the speaking closeup
// to perform the REAL AUDIO: each rendered voice take (24kHz mono
// PCM WAV under public/voices/{cueId}.wav) is analyzed frame by
// frame and the mouth program is derived from what the voice actor
// (the TTS engine) actually did:
//
//   • RMS energy per 10ms frame opens the mouth - louder = wider.
//   • Zero-crossing rate separates voiced vowels (low ZCR, open,
//     neutral spread) from unvoiced fricatives (high ZCR, slightly
//     open, "ee"-style spread).
//   • Silence closes the mouth; short runs snap to their neighbor
//     so the jaw never flutters.
//
// The output is the SAME viseme table ({s,e,o,w,r} ms segments) the
// Blender worker has consumed since v3.3, so the render drivers are
// unchanged: a program built from real takes simply carries shapes
// that match the audio the viewer hears. Text-derived visemes stay
// as the fallback for spans without a decodable take.
// ─────────────────────────────────────────────────────────────

const FRAME_MS = 10; // analysis hop
const WINDOW_MS = 25; // analysis window
const MIN_RUN_MS = 50; // shorter runs snap into their neighbor
const MAX_VISEMES = 600; // payload safety cap (same as the text path)

interface PcmWav {
  sampleRate: number;
  channels: number;
  samples: Float32Array; // mono mixdown, -1..1
}

/** Parse a WAV (PCM16) into a mono float mixdown; null when undecodable. */
export function parseWavMono(buf: Buffer): PcmWav | null {
  try {
    if (buf.length < 44) return null;
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
    let channels = 0;
    let sampleRate = 0;
    let bits = 0;
    let blockAlign = 0;
    let audioFormat = 0;
    let dataOffset = -1;
    let dataSize = 0;
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === "fmt " && size >= 16) {
        audioFormat = buf.readUInt16LE(off + 8);
        channels = buf.readUInt16LE(off + 10);
        sampleRate = buf.readUInt32LE(off + 12);
        blockAlign = buf.readUInt16LE(off + 20);
        bits = buf.readUInt16LE(off + 22);
      } else if (id === "data") {
        dataOffset = off + 8;
        dataSize = Math.min(size, buf.length - off - 8);
        break;
      }
      off += 8 + size + (size % 2);
    }
    if (dataOffset < 0 || audioFormat !== 1 || bits !== 16 || channels < 1 || sampleRate < 1000) return null;
    if (blockAlign < channels * 2) return null;
    const frames = Math.floor(dataSize / blockAlign);
    if (frames < 8) return null;
    const samples = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let acc = 0;
      const base = dataOffset + i * blockAlign;
      for (let ch = 0; ch < channels; ch++) acc += buf.readInt16LE(base + ch * 2);
      samples[i] = acc / channels / 32768;
    }
    return { sampleRate, channels, samples };
  } catch {
    return null;
  }
}

interface AudioFrame {
  rms: number;
  zcr: number; // 0..1 fraction of sign flips inside the window
}

/** Frame the mixdown: RMS energy + zero-crossing rate per FRAME_MS hop. */
function frameAudio(wav: PcmWav): AudioFrame[] {
  const hop = Math.max(1, Math.round((wav.sampleRate * FRAME_MS) / 1000));
  const win = Math.max(hop, Math.round((wav.sampleRate * WINDOW_MS) / 1000));
  const out: AudioFrame[] = [];
  for (let start = 0; start < wav.samples.length; start += hop) {
    const end = Math.min(wav.samples.length, start + win);
    let sumSq = 0;
    let crossings = 0;
    let count = 0;
    let prev = 0;
    for (let i = start; i < end; i++) {
      const s = wav.samples[i];
      sumSq += s * s;
      if (count > 0 && ((s >= 0 && prev < 0) || (s < 0 && prev >= 0))) crossings += 1;
      prev = s;
      count += 1;
    }
    if (count === 0) continue;
    out.push({ rms: Math.sqrt(sumSq / count), zcr: crossings / count });
  }
  return out;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Analyze one take into viseme segments covering [span.startMs,
 * span.endMs) on the clip timeline. Audio time maps 1:1 onto clip
 * time from the span start (the span window IS the take window),
 * clipping at the span end. Returns null when the take cannot be
 * decoded or carries no usable speech envelope.
 */
export function analyzeTakeVisemes(wav: Buffer, span: { startMs: number; endMs: number }): Viseme[] | null {
  const parsed = parseWavMono(wav);
  if (!parsed) return null;
  const frames = frameAudio(parsed);
  if (frames.length < 4) return null;

  // Robust loudness reference: 95th percentile RMS beats a plain max
  // (one click would otherwise flatten the whole envelope).
  const sorted = [...frames.map((f) => f.rms)].sort((a, b) => a - b);
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  if (peak < 0.008) return null; // near-silence: nothing to perform
  const gate = Math.max(0.014, peak * 0.14);

  // Classify + shape every frame, then median-smooth openness over a
  // 3-frame window so single-frame spikes never twitch the jaw.
  const raw = frames.map((f) => {
    if (f.rms < gate) return { o: 0.04, w: 0.1, r: 0.1 };
    if (f.zcr > 0.32 && f.rms < peak * 0.6) return { o: 0.26, w: 0.62, r: 0.05 }; // fricative: s/sh/f hiss
    const env = clamp01((f.rms - gate) / (peak - gate));
    return { o: 0.28 + 0.72 * Math.pow(env, 0.75), w: 0.18, r: 0.12 };
  });
  const smoothed = raw.map((_, i) => {
    const a = raw[Math.max(0, i - 1)];
    const b = raw[i];
    const c = raw[Math.min(raw.length - 1, i + 1)];
    return { o: (a.o + b.o + c.o) / 3, w: (a.w + b.w + c.w) / 3, r: (a.r + b.r + c.r) / 3 };
  });

  // Runs of similar openness become segments; runs shorter than
  // MIN_RUN_MS snap into the previous segment so the jaw never
  // flutters on a single frame. Audio time maps 1:1 onto clip time
  // from the span start (the exported stems play the take 1:1), so
  // frame k of the analysis lands at span.startMs + k * FRAME_MS.
  const segments: Array<{ s: number; e: number; o: number; w: number; r: number }> = [];
  let runStart = 0;
  const pushRun = (from: number, to: number) => {
    if (to <= from) return;
    const s = span.startMs + from * FRAME_MS;
    const e = span.startMs + to * FRAME_MS;
    const mid = smoothed[Math.floor((from + to - 1) / 2)];
    const last = segments[segments.length - 1];
    const dur = e - s;
    if (last && dur < MIN_RUN_MS) {
      last.e = e; // too short to read: extend the previous shape over it
      return;
    }
    if (last && Math.abs(last.o - mid.o) < 0.06 && Math.abs(last.w - mid.w) < 0.12) {
      last.e = e; // same shape: coalesce instead of stacking micro segments
      return;
    }
    segments.push({ s, e, o: mid.o, w: mid.w, r: mid.r });
  };
  for (let i = 1; i < smoothed.length; i++) {
    const shapeShift = Math.abs(smoothed[i].o - smoothed[runStart].o) > 0.14 || Math.abs(smoothed[i].w - smoothed[runStart].w) > 0.25;
    if (shapeShift) {
      pushRun(runStart, i);
      runStart = i;
    }
  }
  pushRun(runStart, smoothed.length);

  // Clamp to the span window, force monotonic non-overlap, cap count.
  const out: Viseme[] = [];
  let cursor = span.startMs;
  for (const seg of segments) {
    const s = Math.max(cursor, Math.min(span.endMs, seg.s));
    const e = Math.max(s, Math.min(span.endMs, seg.e));
    if (e <= s) continue;
    if (out.length >= MAX_VISEMES) break;
    out.push({ s: Math.round(s), e: Math.round(e), o: Math.round(seg.o * 100) / 100, w: Math.round(seg.w * 100) / 100, r: Math.round(seg.r * 100) / 100 });
    cursor = e;
  }
  return out.length > 0 ? out : null;
}

export interface AudioTake {
  startMs: number;
  durationMs: number; // real rendered duration (0 = unknown)
  wav: Buffer | null; // the take's PCM bytes (null = no take on disk)
}

export interface AudioSpeechProgram extends SpeechProgram {
  audioVisemes: number; // visemes derived from real audio
  audioTakes: number; // spans whose mouth came from a real take
}

/**
 * Build the speaking closeup's program with REAL AUDIO as the timing
 * score: spans come from the same windows the text path uses (each
 * line rides its take's cue window), then every span with a
 * decodable take swaps its text-derived visemes for audio-derived
 * ones. Spans without audio keep the text performance, so a
 * partially-rendered shot still lip-syncs everywhere it can.
 */
export function audioDrivenSpeechProgram(input: {
  dialogue: string | null | undefined;
  shotDurationMs: number;
  takes: AudioTake[];
}): AudioSpeechProgram {
  const base = buildSpeechProgram({
    dialogue: input.dialogue,
    shotDurationMs: input.shotDurationMs,
    voiceTakes: input.takes.map((t) => ({ startMs: t.startMs, durationMs: t.durationMs })),
  });
  if (base.spans.length === 0) {
    return { ...base, audioVisemes: 0, audioTakes: 0 };
  }

  // spans and takes were both sorted by startMs and paired 1:1 in
  // buildSpeechProgram (take i -> line i) - but ONLY when every line
  // has its own take window (takes.length >= lines.length). A partial
  // take set spreads spans evenly instead, which would misalign any
  // audio analysis, so the text performance stays for those.
  const takes = [...input.takes].sort((a, b) => a.startMs - b.startMs);
  const paired = takes.length >= base.lines;
  const visemes: Viseme[] = [];
  let audioVisemes = 0;
  let audioTakes = 0;
  base.spans.forEach((span, i) => {
    const take = paired ? takes[i] : undefined;
    const audio = take?.wav ? analyzeTakeVisemes(take.wav, { startMs: span.startMs, endMs: span.endMs }) : null;
    if (audio) {
      visemes.push(...audio);
      audioVisemes += audio.length;
      audioTakes += 1;
    } else {
      visemes.push(...buildVisemes([span]));
    }
  });
  return { ...base, visemes, audioVisemes, audioTakes };
}

/** Stage / event note that names the audio-driven upgrade when it landed. */
export function describeAudioSpeechProgram(program: AudioSpeechProgram): string | null {
  if (program.visemes.length === 0) return null;
  const speakers = [...new Set(program.spans.map((s) => s.speaker).filter(Boolean))];
  const who = speakers.length > 0 ? speakers.join(" + ") : "the cast";
  if (program.audioTakes > 0) {
    return `audio-driven lip-sync on ${who} (${program.lines} line${program.lines === 1 ? "" : "s"}, ${program.visemes.length} visemes from ${program.audioTakes} real take${program.audioTakes === 1 ? "" : "s"})`;
  }
  return `lip-sync on ${who} (${program.lines} line${program.lines === 1 ? "" : "s"}, ${program.visemes.length} visemes)`;
}

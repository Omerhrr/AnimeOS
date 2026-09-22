"use client";

// ─────────────────────────────────────────────────────────────
// AUDIO STEM RENDERER (offline → WAV)
//
// Renders a slice's sound-design cues into a real audio file so
// exported webtoon slices carry their motion soundtrack:
//   1. All cues on the slice are re-timed onto ONE stem timeline
//      (panels play back-to-back in reading order, each cue
//      offset by the panels before it).
//   2. An OfflineAudioContext renders everything in one pass -
//      same synthesis DNA as the live CuePlayer (bandpass-noise
//      SFX, detuned-triangle BGM, wobbling-filter ambience).
//   3. VOICE cues with a rendered TTS take (voiceUrl) mix the
//      real speech WAV into the stem; cues without one render as
//      a soft formant blip carrying the cue's cadence.
//   4. The AudioBuffer is encoded as 16-bit PCM mono WAV.
// ─────────────────────────────────────────────────────────────

import { labelHash, noiseBuffer } from "@/lib/comic/audio";

export interface StemCue {
  cueId?: string | null; // AudioCue id: keys direction-currency tagging in the export manifest
  kind: string;
  label: string;
  startMs: number;
  durationMs: number;
  volume: number;
  voiceUrl?: string | null; // rendered TTS take (cache-busted URL)
  voiceState?: string | null; // delivery profile the take was performed in
}

const SAMPLE_RATE = 44100;

/** Decode rendered TTS takes so stems can mix real speech. */
export async function decodeVoiceClips(urls: string[]): Promise<Map<string, AudioBuffer>> {
  const clips = new Map<string, AudioBuffer>();
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return clips;
  const OfflineAC =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineAC) return clips;
  const decodeCtx = new OfflineAC(1, 1, SAMPLE_RATE);
  await Promise.all(
    unique.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const bytes = await res.arrayBuffer();
        const buf = await decodeCtx.decodeAudioData(bytes);
        clips.set(url, buf);
      } catch {
        // a broken take falls back to the synthesized blip
      }
    }),
  );
  return clips;
}

/** Render the cue list onto one offline timeline and encode 16-bit mono WAV. */
export async function renderStemWav(
  cues: StemCue[],
  totalMs: number,
  voiceClips?: Map<string, AudioBuffer>,
): Promise<Blob> {
  const totalSec = Math.max(0.5, totalMs / 1000) + 0.25; // tail for release envelopes
  const OfflineAC =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineAC) throw new Error("OfflineAudioContext unavailable in this browser");

  const ctx = new OfflineAC(1, Math.ceil(SAMPLE_RATE * totalSec), SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  for (const cue of cues) {
    const when = cue.startMs / 1000;
    const dur = Math.max(0.05, cue.durationMs / 1000);
    const vol = Math.min(1, Math.max(0.05, cue.volume));
    try {
      if (cue.kind === "SFX") sfx(ctx, master, cue.label, when, dur, vol);
      else if (cue.kind === "BGM") bgm(ctx, master, cue.label, when, dur, vol);
      else if (cue.kind === "AMBIENCE") ambience(ctx, master, cue.label, when, dur, vol);
      else if (cue.kind === "VOICE") {
        const clip = cue.voiceUrl ? voiceClips?.get(cue.voiceUrl) : undefined;
        if (clip) realVoice(ctx, master, clip, when, dur, vol);
        else voiceBlip(ctx, master, cue.label, when, dur, vol, cue.voiceState);
      }
    } catch {
      // one bad cue must never sink the whole stem
    }
  }

  const buffer = await ctx.startRendering();
  return encodeWav(buffer);
}

// ── per-kind synthesis (parameters mirror the live CuePlayer) ──

function sfx(ctx: BaseAudioContext, dest: AudioNode, label: string, when: number, dur: number, vol: number): void {
  const h = labelHash(label);
  const low = /impact|thunder|detonat|boom|crash|scatter/i.test(label);
  const bright = /shing|coiling|crack|hiss|electric/i.test(label);
  const center = low ? 180 + h * 220 : bright ? 2400 + h * 3600 : 700 + h * 1400;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, Math.min(2, dur + 0.1));
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = center;
  bp.Q.value = low ? 0.8 : 1.6;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.14), when + dur);
  src.connect(bp).connect(gain).connect(dest);
  src.start(when);
  src.stop(when + dur + 0.05);
}

function bgm(ctx: BaseAudioContext, dest: AudioNode, label: string, when: number, dur: number, vol: number): void {
  const h = labelHash(label);
  const base = 110 * Math.pow(2, Math.floor(h * 5) / 12);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1200 + h * 900;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol * 0.5, when + Math.min(0.6, dur / 4));
  gain.gain.setValueAtTime(vol * 0.5, when + dur * 0.7);
  gain.gain.linearRampToValueAtTime(0, when + dur);
  lp.connect(gain).connect(dest);
  for (const detune of [-4, 3, 7]) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = base * Math.pow(2, detune / 12);
    osc.connect(lp);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }
}

function ambience(ctx: BaseAudioContext, dest: AudioNode, label: string, when: number, dur: number, vol: number): void {
  const h = labelHash(label);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 400 + h * 900;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15 + h * 0.35;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(lp.frequency);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol * 0.45, when + Math.min(1, dur / 5));
  gain.gain.setValueAtTime(vol * 0.45, when + Math.max(1, dur - Math.min(1, dur / 5)));
  gain.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(lp).connect(gain).connect(dest);
  src.start(when);
  lfo.start(when);
  src.stop(when + dur + 0.1);
  lfo.stop(when + dur + 0.1);
}

/** Mix a rendered TTS take into the stem at the cue's slot and volume. */
function realVoice(ctx: BaseAudioContext, dest: AudioNode, clip: AudioBuffer, when: number, dur: number, vol: number): void {
  const src = ctx.createBufferSource();
  src.buffer = clip; // a 24kHz take resamples into the 44.1kHz render automatically
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(vol, when + 0.02);
  // never let one take bleed past its slot into the next panel
  const playSec = Math.min(clip.duration, dur + 0.15);
  gain.gain.setValueAtTime(vol, when + Math.max(0.02, playSec - 0.06));
  gain.gain.linearRampToValueAtTime(0, when + playSec);
  src.connect(gain).connect(dest);
  src.start(when);
  src.stop(when + playSec);
}

/** Offline stand-in for speechSynthesis: a vowel-ish tone with the cue's rhythm. */
function voiceBlip(ctx: BaseAudioContext, dest: AudioNode, label: string, when: number, dur: number, vol: number, voiceState?: string | null): void {
  const h = labelHash(label);
  // the stand-in follows the delivery profile: strained reads drag, excited reads rush
  const pace = voiceState === "INJURED" ? 0.78 : voiceState === "EXCITED" ? 1.2 : 1;
  const f0 = (150 + h * 90) * (voiceState === "INJURED" ? 0.92 : voiceState === "EXCITED" ? 1.06 : 1);
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(f0, when);
  // gentle sentence prosody: two small pitch drifts over the duration
  osc.frequency.linearRampToValueAtTime(f0 * 1.08, when + dur * 0.35);
  osc.frequency.linearRampToValueAtTime(f0 * (voiceState === "INJURED" ? 0.86 : 0.94), when + dur);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900 + h * 600;
  bp.Q.value = 1.1;
  const gain = ctx.createGain();
  // syllabic amplitude wobble so it reads as speech, not a beep
  gain.gain.setValueAtTime(0, when);
  const syllables = Math.max(3, Math.round((dur / 0.28) * pace));
  for (let s = 0; s < syllables; s++) {
    const t = when + (s * dur) / syllables;
    const peak = Math.min(dur, t + (0.55 * dur) / syllables);
    gain.gain.linearRampToValueAtTime(vol * 0.32, peak);
    gain.gain.linearRampToValueAtTime(vol * 0.1, Math.min(dur, t + (0.95 * dur) / syllables));
  }
  gain.gain.linearRampToValueAtTime(0, when + dur);
  osc.connect(bp).connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

// ── WAV encoding (16-bit PCM mono) ──

function encodeWav(buffer: AudioBuffer): Blob {
  const samples = buffer.getChannelData(0);
  const dataLen = samples.length * 2;
  const out = new ArrayBuffer(44 + dataLen);
  const view = new DataView(out);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([out], { type: "audio/wav" });
}

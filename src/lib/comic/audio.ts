"use client";

// ─────────────────────────────────────────────────────────────
// MOTION-PANEL AUDIO ENGINE (client-only, WebAudio)
//
// Synthesizes sound-design cues on the shot's millisecond timeline:
//   SFX      — percussive noise burst, timbre seeded by the label
//   VOICE    — speech synthesis (falls back to a soft blip)
//   BGM      — detuned triangle pad through a lowpass
//   AMBIENCE — looping filtered-noise bed with slow fades
// Everything is scheduled against one AudioContext clock so the
// playhead and the sounds stay in sync. No audio files needed.
// ─────────────────────────────────────────────────────────────

import type { AudioCueKind } from "@/lib/api-client";

export const CUE_KIND_META: Record<AudioCueKind, { label: string; color: string; blurb: string }> = {
  SFX: { label: "SFX", color: "#e8b04b", blurb: "Percussive accent — impacts, draws, debris" },
  VOICE: { label: "Voice", color: "#4bc0e8", blurb: "Spoken line — synthesized from the label" },
  BGM: { label: "Music", color: "#b07cd8", blurb: "Score bed — pads and percussion hits" },
  AMBIENCE: { label: "Ambience", color: "#5aa88f", blurb: "Environment bed — rain, wind, drones" },
};

export interface CueLike {
  id: string;
  kind: string;
  label: string;
  startMs: number;
  durationMs: number;
  volume: number;
}

/** Deterministic 0..1 hash so a label always sounds the same. */
export function labelHash(label: string): number {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

// BaseAudioContext (not AudioContext) so the offline stem renderer can reuse it.
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export class CuePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: Array<AudioScheduledSourceNode> = [];
  private timers: number[] = [];
  private raf: number | null = null;
  private startCtxTime = 0;
  private running = false;

  get isPlaying(): boolean {
    return this.running;
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Play a cue list; onTime(ms) drives the playhead, onEnd fires once the timeline completes. */
  play(cues: CueLike[], totalMs: number, onTime?: (ms: number) => void, onEnd?: () => void): void {
    this.stop();
    const ctx = this.ensureCtx();
    if (ctx.state === "suspended") void ctx.resume();
    if (cues.length === 0) {
      onEnd?.();
      return;
    }

    this.running = true;
    this.startCtxTime = ctx.currentTime + 0.08; // small scheduling latency
    const t0 = this.startCtxTime;

    for (const cue of cues) {
      const when = t0 + cue.startMs / 1000;
      const dur = Math.max(0.05, cue.durationMs / 1000);
      const vol = Math.min(1, Math.max(0.05, cue.volume));
      try {
        if (cue.kind === "SFX") this.scheduleSfx(ctx, cue.label, when, dur, vol);
        else if (cue.kind === "BGM") this.scheduleBgm(ctx, cue.label, when, dur, vol);
        else if (cue.kind === "AMBIENCE") this.scheduleAmbience(ctx, cue.label, when, dur, vol);
        else if (cue.kind === "VOICE") this.scheduleVoice(cue.label, when, cue.durationMs, vol);
      } catch {
        // a bad cue must never kill the whole preview
      }
    }

    const totalSec = Math.max(totalMs, cues.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0)) / 1000 + 0.15;
    const tick = () => {
      if (!this.running) return;
      const elapsed = (ctx.currentTime - t0) * 1000;
      onTime?.(Math.max(0, elapsed));
      if (elapsed >= totalSec * 1000) {
        this.stop();
        onEnd?.();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    for (const src of this.sources) {
      try { src.stop(); } catch { /* already stopped */ }
      try { src.disconnect(); } catch { /* noop */ }
    }
    this.sources = [];
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  /** SFX — bandpass-shaped noise burst; centre frequency seeded by the label. */
  private scheduleSfx(ctx: AudioContext, label: string, when: number, dur: number, vol: number): void {
    if (!this.master) return;
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
    src.connect(bp).connect(gain).connect(this.master);
    src.start(when);
    src.stop(when + dur + 0.05);
    this.sources.push(src);
  }

  /** BGM — two detuned triangles through a soft lowpass; slow attack/release. */
  private scheduleBgm(ctx: AudioContext, label: string, when: number, dur: number, vol: number): void {
    if (!this.master) return;
    const h = labelHash(label);
    const base = 110 * Math.pow(2, Math.floor(h * 5) / 12); // A2-ish + small steps
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200 + h * 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol * 0.5, when + Math.min(0.6, dur / 4));
    gain.gain.setValueAtTime(vol * 0.5, when + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, when + dur);
    lp.connect(gain).connect(this.master);
    for (const detune of [-4, 3, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = base * Math.pow(2, detune / 12);
      osc.connect(lp);
      osc.start(when);
      osc.stop(when + dur + 0.05);
      this.sources.push(osc);
    }
  }

  /** AMBIENCE — looped noise through a slowly-wobbling lowpass bed. */
  private scheduleAmbience(ctx: AudioContext, label: string, when: number, dur: number, vol: number): void {
    if (!this.master) return;
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
    src.connect(lp).connect(gain).connect(this.master);
    src.start(when);
    lfo.start(when);
    src.stop(when + dur + 0.1);
    lfo.stop(when + dur + 0.1);
    this.sources.push(src, lfo);
  }

  /** VOICE — speech synthesis at the right offset; blip fallback. */
  private scheduleVoice(label: string, when: number, durationMs: number, vol: number): void {
    const ctx = this.ensureCtx();
    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
    const timer = window.setTimeout(() => {
      if (!this.running) return;
      if (typeof window !== "undefined" && "speechSynthesis" in window && label.trim()) {
        // VOICE labels may carry a "Speaker: line" prefix — speak only the line
        const spoken = label.includes(": ") ? label.split(": ").slice(1).join(": ") : label;
        const u = new SpeechSynthesisUtterance(spoken);
        u.rate = 0.95;
        u.volume = Math.min(1, vol);
        window.speechSynthesis.speak(u);
      } else if (this.ctx && this.master) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol * 0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + durationMs / 1000);
        osc.frequency.value = 440;
        osc.connect(gain).connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + durationMs / 1000);
        this.sources.push(osc);
      }
    }, delayMs);
    this.timers.push(timer);
  }
}

/** Quick sanity: does this browser have everything the preview needs? */
export function audioSupport(): { webAudio: boolean; speech: boolean } {
  if (typeof window === "undefined") return { webAudio: false, speech: false };
  return {
    webAudio: Boolean(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
    speech: "speechSynthesis" in window,
  };
}

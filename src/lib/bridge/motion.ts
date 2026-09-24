// ─────────────────────────────────────────────────────────────
// MOTION ENGINE (built-in renderer - real animated shots)
//
// The engine that makes shots MOVE: every render job becomes a
// sequenced video clip driven by the shot's camera grammar
// (movement + shot type + lens + lighting) and the scene's live
// render parameters (fog, lightning, energy, camera distance, rim
// light). ffmpeg applies a deterministic camera program over the
// shot's key art (or a procedural gradient plate when no art exists
// yet), so a finished render is a playable clip, not a still.
//
// Driver chain (see engine/render.ts):
//   1. LIVE_BLENDER - a workstation Blender (env host or locally
//      spawned headless) renders the clip in 3D via the bridge
//      add-on's animated sequence mode.
//   2. MOTION       - this engine: ffmpeg camera moves over key art.
//      Same job lifecycle, same output contract (an mp4 per job).
//   3. SIMULATOR    - wall-clock fallback when even ffmpeg is absent.
//
// Everything the planner computes is pure and deterministic from
// (shot, scene, project, jobId): the same job always renders the
// same camera program, so retries are stable and tests can unit-
// check the grammar without spawning ffmpeg.
// ─────────────────────────────────────────────────────────────

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { hasPoseProgram, poseChip } from "@/lib/animation/poses";

// ── camera grammar planner (pure) ────────────────────────────

export interface CameraProgramInput {
  jobId: string;
  shotType: string;
  lens: string | null;
  movement: string | null;
  poseStart?: string | null;
  poseEnd?: string | null;
  lighting: string | null;
  fogDensity: number;
  lightningIntensity: number;
  energyIntensity: number;
  cameraDistance: number;
  rimLightIntensity: number;
  duration: number; // shot duration (seconds)
  fps: number;
  resolution: string; // "1920x1080"
  mode: "PREVIEW" | "FINAL";
  hasArt: boolean;
  // LIP-SYNC (blocking): dialogue spans of a speaking closeup. ffmpeg
  // cannot articulate a painted mouth, so each line lands as a soft
  // speech beat - the frame breathes with the spoken words.
  speechSpans?: Array<{ startMs: number; endMs: number }> | null;
}

export interface FlashWindow {
  start: number;
  dur: number;
  alpha: number;
}

export interface CameraProgram {
  move: string; // normalized movement id
  moveLabel: string; // human wording for stage lines
  poseChipText: string | null; // "STANCE -> LUNGE" when the shot carries poses
  speechBeat: boolean; // blocking speech beat present (speaking closeup)
  zoomFrom: number; // camera zoom relative to the plate (1 = full frame)
  zoomTo: number;
  uxFrom: number; // horizontal focus center 0..1
  uxTo: number;
  uyFrom: number; // vertical focus center 0..1
  uyTo: number;
  brightness: number; // eq offsets
  saturation: number;
  contrast: number;
  vignetteAngle: number; // radians
  fogAlpha: number; // static veil opacity 0..0.4
  flashes: FlashWindow[];
  pulses: FlashWindow[];
  durationSec: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
}

const OVERSCAN = 1.35; // plate is rendered 35% larger so pans never see the edge

const SHOT_BASE_ZOOM: Record<string, number> = {
  ESTABLISHING: 1.0,
  WIDE: 1.03,
  MEDIUM: 1.09,
  LOW_ANGLE: 1.1,
  CLOSEUP: 1.18,
  EXTREME_CLOSEUP: 1.3,
};

interface MoveProfile {
  label: string;
  zoomFrom: number;
  zoomTo: number;
  uxFrom: number;
  uxTo: number;
  uyFrom: number;
  uyTo: number;
}

const MOVE_PROFILES: Record<string, MoveProfile> = {
  DOLLY_IN: { label: "dolly in", zoomFrom: 1.0, zoomTo: 1.3, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.5, uyTo: 0.46 },
  PUSH_IN: { label: "dolly in", zoomFrom: 1.0, zoomTo: 1.3, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.5, uyTo: 0.46 },
  ZOOM_IN: { label: "dolly in", zoomFrom: 1.0, zoomTo: 1.3, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.5, uyTo: 0.46 },
  DOLLY_OUT: { label: "dolly out", zoomFrom: 1.3, zoomTo: 1.0, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.46, uyTo: 0.5 },
  PULL_OUT: { label: "dolly out", zoomFrom: 1.3, zoomTo: 1.0, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.46, uyTo: 0.5 },
  ZOOM_OUT: { label: "dolly out", zoomFrom: 1.3, zoomTo: 1.0, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.46, uyTo: 0.5 },
  PAN: { label: "pan", zoomFrom: 1.12, zoomTo: 1.12, uxFrom: 0.16, uxTo: 0.84, uyFrom: 0.5, uyTo: 0.5 },
  TRACKING: { label: "tracking", zoomFrom: 1.14, zoomTo: 1.14, uxFrom: 0.72, uxTo: 0.28, uyFrom: 0.52, uyTo: 0.48 },
  ORBIT: { label: "orbit", zoomFrom: 1.06, zoomTo: 1.14, uxFrom: 0.32, uxTo: 0.68, uyFrom: 0.5, uyTo: 0.5 },
  CRANE: { label: "crane down", zoomFrom: 1.04, zoomTo: 1.1, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.72, uyTo: 0.28 },
  TILT_UP: { label: "tilt up", zoomFrom: 1.1, zoomTo: 1.1, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.74, uyTo: 0.26 },
  TILT_DOWN: { label: "tilt down", zoomFrom: 1.1, zoomTo: 1.1, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.26, uyTo: 0.74 },
  STATIC: { label: "static hold", zoomFrom: 1.0, zoomTo: 1.03, uxFrom: 0.5, uxTo: 0.5, uyFrom: 0.5, uyTo: 0.5 },
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Deterministic 32-bit hash so the same job always plans the same program. */
export function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tiny deterministic PRNG (mulberry32) seeded from the job id. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeMovement(movement: string | null | undefined): string {
  const raw = String(movement ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (raw && MOVE_PROFILES[raw]) return raw;
  return "STATIC";
}

function parseLensMm(lens: string | null | undefined): number | null {
  const m = String(lens ?? "").match(/(\d+(?:\.\d+)?)\s*mm/i);
  return m ? Number(m[1]) : null;
}

function parseResolution(res: string): { w: number; h: number } {
  const m = String(res ?? "").match(/(\d{2,5})\s*x\s*(\d{2,5})/);
  if (!m) return { w: 1920, h: 1080 };
  return { w: Math.max(16, parseInt(m[1], 10)), h: Math.max(16, parseInt(m[2], 10)) };
}

/** Even-dimension fit so h264 stays happy: cap the LONGEST side. */
function fitSize(w: number, h: number, cap: number): { w: number; h: number } {
  const scale = Math.min(1, cap / Math.max(w, h));
  const even = (n: number) => Math.max(16, Math.round((n * scale) / 2) * 2);
  return { w: even(w), h: even(h) };
}

export function planCameraProgram(input: CameraProgramInput): CameraProgram {
  const move = normalizeMovement(input.movement);
  const prof = MOVE_PROFILES[move];
  const rng = seededRandom(fnv1a(input.jobId));

  // framing: shot type base + scene camera distance
  const base = SHOT_BASE_ZOOM[input.shotType] ?? 1.09;
  const distMul = clamp(1 + (1 - clamp(input.cameraDistance || 1, 0.4, 2.5)) * 0.22, 0.85, 1.35);
  let zoomFrom = base * distMul * prof.zoomFrom;
  let zoomTo = base * distMul * prof.zoomTo;

  // lens character: telephoto compresses + vignettes, wide opens up
  const mm = parseLensMm(input.lens);
  let vignetteAngle = Math.PI / 5;
  let saturation = 1;
  let brightness = 0;
  let contrast = 1 + clamp(input.rimLightIntensity, 0, 1) * 0.08;
  let lensNote = "";
  if (mm !== null && mm >= 80) {
    vignetteAngle = Math.PI / 4.4;
    saturation += 0.06;
    zoomFrom *= 1.04;
    zoomTo *= 1.04;
    lensNote = "tele";
  } else if (mm !== null && mm <= 35) {
    vignetteAngle = Math.PI / 6;
    zoomFrom *= 0.97;
    zoomTo *= 0.97;
    lensNote = "wide";
  }

  // lighting grade from the shot's lighting note
  const light = String(input.lighting ?? "");
  if (/night|dark|storm|shadow/i.test(light)) {
    brightness -= 0.05;
    saturation *= 0.88;
  } else if (/fire|sunset|warm|golden/i.test(light)) {
    brightness += 0.03;
    saturation *= 1.08;
  } else if (/moon|cold|ice|frost/i.test(light)) {
    saturation *= 0.92;
  }

  // fog veil: translucent plate + gentle desaturation
  const fog = clamp(input.fogDensity, 0, 1);
  const fogAlpha = Number((fog * 0.3).toFixed(3));
  saturation *= 1 - fog * 0.18;

  // lightning flashes: deterministic windows seeded by the job id
  const lightning = clamp(input.lightningIntensity, 0, 1);
  const flashes: FlashWindow[] = [];
  if (lightning > 0.03) {
    const count = 1 + Math.floor(lightning * 2);
    for (let i = 0; i < count; i++) {
      flashes.push({
        start: 0.12 + rng() * 0.74,
        dur: 0.08 + 0.1 * lightning,
        alpha: Number((0.35 + 0.35 * lightning).toFixed(3)),
      });
    }
  }

  // energy pulses: teal breathing accents on the grade
  const energy = clamp(input.energyIntensity, 0, 1);
  const pulses: FlashWindow[] = [];
  if (energy > 0.03) {
    for (const at of [0.3, 0.68]) {
      pulses.push({
        start: clamp(at + (rng() - 0.5) * 0.1, 0.05, 0.9),
        dur: 0.5,
        alpha: Number((0.06 + 0.12 * energy).toFixed(3)),
      });
    }
  }

  // pose program: ffmpeg cannot articulate a painted character, so the
  // pair plays as a BLOCKING approximation - an impact beat lands at
  // the end pose (quick teal/white strike) and the program note says so
  const poseChipText = hasPoseProgram(input.poseStart, input.poseEnd) ? poseChip(input.poseStart, input.poseEnd) : null;
  if (poseChipText) {
    pulses.push({
      start: clamp(0.86 + (rng() - 0.5) * 0.05, 0.05, 0.95),
      dur: 0.14,
      alpha: 0.2,
    });
  }

  // speech beat (blocking lip-sync): each spoken line breathes as a
  // soft shimmer over its window - the cut stays readable as
  // "someone is talking here" even without a real mouth. Windows are
  // absolute seconds on the clip timeline (drawbox t is seconds).
  const spans = (input.speechSpans ?? []).slice(0, 4);
  const totalSec = durationHint(input);
  for (const span of spans) {
    const start = clamp(span.startMs / 1000, 0, Math.max(0, totalSec - 0.3));
    const dur = clamp((span.endMs - span.startMs) / 1000, 0.25, 1.4);
    pulses.push({ start, dur, alpha: 0.08 });
  }

  // timing + resolution (PREVIEW renders smaller for queue speed)
  const durationSec = clamp(Number.isFinite(input.duration) && input.duration > 0 ? input.duration : 4, 0.8, 30);
  const fps = clamp(Math.round(input.fps || 24), 1, 60);
  const src = parseResolution(input.resolution);
  const size = fitSize(src.w, src.h, input.mode === "FINAL" ? 1920 : 960);
  const frames = Math.max(2, Math.round(durationSec * fps));

  return {
    move,
    moveLabel: lensNote ? `${prof.label} (${lensNote})` : prof.label,
    poseChipText,
    speechBeat: spans.length > 0,
    zoomFrom: Number(zoomFrom.toFixed(4)),
    zoomTo: Number(zoomTo.toFixed(4)),
    uxFrom: prof.uxFrom,
    uxTo: prof.uxTo,
    uyFrom: prof.uyFrom,
    uyTo: prof.uyTo,
    brightness: Number(brightness.toFixed(3)),
    saturation: Number(saturation.toFixed(3)),
    contrast: Number(contrast.toFixed(3)),
    vignetteAngle: Number(vignetteAngle.toFixed(4)),
    fogAlpha,
    flashes: flashes.map((f) => ({ start: Number(f.start.toFixed(3)), dur: Number(f.dur.toFixed(3)), alpha: f.alpha })),
    pulses,
    durationSec: Number(durationSec.toFixed(2)),
    frames,
    fps,
    width: size.w,
    height: size.h,
  };
}

/** Shot duration the planner can rely on before the timing block runs. */
function durationHint(input: CameraProgramInput): number {
  return clamp(Number.isFinite(input.duration) && input.duration > 0 ? input.duration : 4, 0.8, 30);
}

/** Human one-liner for job stage text and DSH results. */
export function describeProgram(p: CameraProgram, hasArt: boolean): string {
  const parts = [
    `${p.moveLabel} ${p.zoomFrom.toFixed(2)}→${p.zoomTo.toFixed(2)}`,
    `${p.durationSec}s @ ${p.fps}fps`,
    `${p.width}x${p.height}`,
  ];
  if (p.fogAlpha > 0) parts.push(`fog veil ${p.fogAlpha.toFixed(2)}`);
  if (p.flashes.length > 0) parts.push(`${p.flashes.length} lightning flash${p.flashes.length === 1 ? "" : "es"}`);
  if (p.poseChipText) parts.push(`poses ${p.poseChipText} (blocking)`);
  if (p.speechBeat) parts.push("speech beat (blocking lip-sync)");
  parts.push(hasArt ? "key art" : "procedural plate");
  return parts.join(" · ");
}

// ── ffmpeg availability (probed once, cached) ────────────────

let ffmpegBin: string | null | undefined;

export function ffmpegPath(): string | null {
  return ffmpegBin === undefined ? null : ffmpegBin;
}

export async function detectFfmpeg(): Promise<string | null> {
  if (ffmpegBin !== undefined) return ffmpegBin;
  for (const bin of ["ffmpeg", "/usr/bin/ffmpeg"]) {
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(bin, ["-version"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
    if (ok) {
      ffmpegBin = bin;
      return bin;
    }
  }
  ffmpegBin = null;
  return null;
}

// ── tiny concurrency pool (ffmpeg is CPU-bound; 2 at a time) ──

class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1;
      return this.release.bind(this);
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return this.release.bind(this);
  }
  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const renderPool = new Semaphore(2);

// ── clip renderer ────────────────────────────────────────────

const RENDER_TIMEOUT_MS = 180_000;

function platePath(artworkUrl: string | null | undefined): string | null {
  if (!artworkUrl) return null;
  const clean = String(artworkUrl).split("?")[0];
  if (!clean.startsWith("/panels/") || clean.includes("..")) return null;
  const abs = path.join(process.cwd(), "public", clean.replace(/^\//, ""));
  return fs.existsSync(abs) ? abs : null;
}

function lerpExpr(from: number, to: number, frames: number): string {
  if (frames <= 1) return from.toFixed(4);
  return `${from.toFixed(4)}+(${(to - from).toFixed(4)})*on/${frames - 1}`;
}

export interface ShotClipRender {
  outputUrl: string | null;
  program: CameraProgram;
  programNote: string;
  error?: string;
}

/**
 * Render ONE animated clip for a shot: camera program over key art
 * (or a procedural gradient plate), graded by scene params, encoded
 * h264 at the project's fps. Deterministic per jobId.
 */
export async function renderShotClip(opts: {
  jobId: string;
  shotType: string;
  lens: string | null;
  movement: string | null;
  poseStart?: string | null;
  poseEnd?: string | null;
  lighting: string | null;
  fogDensity: number;
  lightningIntensity: number;
  energyIntensity: number;
  cameraDistance: number;
  rimLightIntensity: number;
  duration: number;
  fps: number;
  resolution: string;
  mode: "PREVIEW" | "FINAL";
  artworkUrl?: string | null;
  shotNumber?: number;
  speechSpans?: Array<{ startMs: number; endMs: number }> | null;
  onProgress?: (ratio: number) => void;
}): Promise<ShotClipRender> {
  const program = planCameraProgram({
    jobId: opts.jobId,
    shotType: opts.shotType,
    lens: opts.lens,
    movement: opts.movement,
    poseStart: opts.poseStart ?? null,
    poseEnd: opts.poseEnd ?? null,
    lighting: opts.lighting,
    fogDensity: opts.fogDensity,
    lightningIntensity: opts.lightningIntensity,
    energyIntensity: opts.energyIntensity,
    cameraDistance: opts.cameraDistance,
    rimLightIntensity: opts.rimLightIntensity,
    duration: opts.duration,
    fps: opts.fps,
    resolution: opts.resolution,
    mode: opts.mode,
    hasArt: Boolean(opts.artworkUrl),
    speechSpans: opts.speechSpans ?? null,
  });
  const note = describeProgram(program, Boolean(opts.artworkUrl));

  const ffmpeg = await detectFfmpeg();
  if (!ffmpeg) return { outputUrl: null, program, programNote: note, error: "ffmpeg not available" };

  const release = await renderPool.acquire();
  try {
    const outDir = path.join(process.cwd(), "public", "renders");
    fs.mkdirSync(outDir, { recursive: true });
    const outAbs = path.join(outDir, `${opts.jobId}.mp4`);
    const { width, height, frames } = program;
    const plateW = Math.round(width * OVERSCAN / 2) * 2;
    const plateH = Math.round(height * OVERSCAN / 2) * 2;

    // plate: key art when present, else a seeded procedural gradient frame
    let plate: string | null = platePath(opts.artworkUrl);
    let tmpPlate: string | null = null;
    if (!plate) {
      tmpPlate = path.join(outDir, `.plate-${opts.jobId}.png`);
      const seed = fnv1a(opts.jobId) % 100000;
      const gen = spawn(ffmpeg, [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi",
        "-i", `gradients=s=${plateW}x${plateH}:c0=0x101c2c:c1=0x274a52:c2=0x5f8291:c3=0x0c141d:nb_colors=4:seed=${seed}`,
        "-frames:v", "1", tmpPlate,
      ]);
      const genOk = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { try { gen.kill("SIGKILL"); } catch { /* already gone */ } resolve(false); }, 15_000);
        gen.on("error", () => { clearTimeout(timer); resolve(false); });
        gen.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
      });
      if (!genOk || !fs.existsSync(tmpPlate)) return { outputUrl: null, program, programNote: note, error: "procedural plate generation failed" };
      plate = tmpPlate;
    }

    // camera program → zoompan expressions (input is the overscanned plate)
    const zExpr = lerpExpr(OVERSCAN * program.zoomFrom, OVERSCAN * program.zoomTo, frames);
    const xExpr = `(iw-iw/zoom)*(${lerpExpr(program.uxFrom, program.uxTo, frames)})`;
    const yExpr = `(ih-ih/zoom)*(${lerpExpr(program.uyFrom, program.uyTo, frames)})`;

    const chain: string[] = [
      `scale=${plateW}:${plateH}:force_original_aspect_ratio=increase`,
      `crop=${plateW}:${plateH}`,
      "setsar=1",
      `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${width}x${height}:fps=${program.fps}`,
    ];
    const eqParts: string[] = [];
    if (program.brightness !== 0) eqParts.push(`brightness=${program.brightness}`);
    if (program.saturation !== 1) eqParts.push(`saturation=${program.saturation}`);
    if (program.contrast !== 1) eqParts.push(`contrast=${program.contrast}`);
    if (eqParts.length > 0) chain.push(`eq=${eqParts.join(":")}`);
    if (program.fogAlpha > 0) chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=0xdfe8f2@${program.fogAlpha}:t=fill`);
    for (const f of program.flashes) {
      chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@${f.alpha}:t=fill:enable='between(t,${f.start.toFixed(3)},${(f.start + f.dur).toFixed(3)})'`);
    }
    for (const f of program.pulses) {
      chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=0x2dd4bf@${f.alpha}:t=fill:enable='between(t,${f.start.toFixed(3)},${(f.start + f.dur).toFixed(3)})'`);
    }
    chain.push(`vignette=a=${program.vignetteAngle}`);
    const fadeDur = Math.min(0.18, program.durationSec / 4);
    chain.push(`fade=t=in:st=0:d=${fadeDur.toFixed(3)}`);
    chain.push(`fade=t=out:st=${(program.durationSec - fadeDur).toFixed(3)}:d=${fadeDur.toFixed(3)}`);
    if (!opts.artworkUrl || !platePath(opts.artworkUrl)) {
      // procedural plate carries a HUD chip so the shot stays identifiable
      const fontSize = Math.max(12, Math.round(program.height / 36));
      chain.push(`drawbox=x=0:y=ih-${fontSize * 3}:w=${fontSize * 8}:h=${fontSize * 2}:color=black@0.55:t=fill`);
      chain.push(`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='SHOT ${String(opts.shotNumber ?? 0).padStart(3, "0")}':fontcolor=white:fontsize=${fontSize}:x=${Math.round(fontSize * 0.8)}:y=main_h-${Math.round(fontSize * 2.35)}`);
    }
    chain.push("format=yuv420p");

    const args = [
      "-y", "-hide_banner", "-loglevel", "error", "-nostats",
      "-progress", "pipe:1",
      "-i", plate,
      "-filter_complex", `[0:v]${chain.join(",")}[v]`,
      "-map", "[v]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-r", String(program.fps),
      "-movflags", "+faststart",
      outAbs,
    ];

    let lastError: string | null = null;
    const ok = await new Promise<boolean>((resolve) => {
      const child = spawn(ffmpeg, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderrTail = "";
      let lastReported = -1;
      const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, RENDER_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        const m = text.match(/out_time_us=(\d+)/);
        if (m && program.durationSec > 0) {
          const ratio = clamp(Number(m[1]) / 1e6 / program.durationSec, 0, 1);
          const pct = Math.floor(ratio * 25) * 4; // report in 4% steps
          if (pct !== lastReported) {
            lastReported = pct;
            opts.onProgress?.(ratio);
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-600);
      });
      child.on("error", () => { clearTimeout(timer); resolve(false); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0 && stderrTail) {
          lastError = stderrTail.slice(-200);
        }
        resolve(code === 0 && fs.existsSync(outAbs) && fs.statSync(outAbs).size > 0);
      });
    });

    if (tmpPlate && fs.existsSync(tmpPlate)) {
      try { fs.unlinkSync(tmpPlate); } catch { /* temp cleanup best-effort */ }
    }

    if (!ok) return { outputUrl: null, program, programNote: note, error: lastError ? `ffmpeg encode failed: ${lastError}` : "ffmpeg encode failed" };
    return { outputUrl: `/renders/${opts.jobId}.mp4`, program, programNote: note };
  } finally {
    release();
  }
}

// ── probe helper (shared with the export-cut builder) ────────

export interface MediaProbe {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
}

export async function probeMedia(file: string): Promise<MediaProbe | null> {
  const ffprobe = ffmpegPath() ? (ffmpegPath() as string).replace(/ffmpeg$/, "ffprobe") : "ffprobe";
  const json = await new Promise<string | null>((resolve) => {
    const child = spawn(ffprobe, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => resolve(code === 0 ? out : null));
  });
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as {
      streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string }>;
      format?: { duration?: string };
    };
    const streams = parsed.streams ?? [];
    const v = streams.find((s) => s.codec_type === "video");
    const a = streams.find((s) => s.codec_type === "audio");
    if (!v && !a) return null;
    const fpsParts = String(v?.avg_frame_rate ?? "0/1").split("/").map(Number);
    const fps = fpsParts.length === 2 && fpsParts[1] > 0 ? fpsParts[0] / fpsParts[1] : 0;
    const durationSec = Number(parsed.format?.duration ?? v?.duration ?? a?.duration ?? 0);
    return {
      durationSec,
      width: v?.width ?? 0,
      height: v?.height ?? 0,
      fps,
      hasVideo: Boolean(v),
      hasAudio: Boolean(a),
      videoCodec: v?.codec_name ?? null,
      audioCodec: a?.codec_name ?? null,
    };
  } catch {
    return null;
  }
}

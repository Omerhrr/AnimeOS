// ─────────────────────────────────────────────────────────────
// EPISODE CUT BUILDER (server-side export: clips + stems → mp4)
//
// Turns an episode into ONE distributable animated cut:
//   1. Every shot contributes its rendered clip (or one is rendered
//      on the spot by the MOTION engine when the shot has none yet).
//   2. Clips are normalized (canvas, fps, SAR) and concatenated in
//      story order into a silent master timeline.
//   3. The episode's sound-design cues are re-timed onto that
//      timeline and synthesized/mixed SERVER-SIDE with ffmpeg:
//      VOICE cues mix their real TTS takes, SFX are bandpass-shaped
//      noise bursts, BGM are detuned sine pads, AMBIENCE are
//      lowpassed noise beds - the same synthesis DNA as the
//      browser CuePlayer/stem renderer, now running offline.
//   4. THE MIX IS GRADED (iteration 76): the cues land on KIND BUSES
//      (VOICE / SFX / BGM / AMBIENCE) under a fixed bus-gain law, the
//      BGM bus DUCKS under the voice bus (a real sidechain compressor -
//      the dialogue-duck every broadcast mix carries), the raw master is
//      MEASURED (EBU R128 integrated loudness through ebur128), an
//      explicit clamped gain walks it to the -16 LUFS target under an
//      honest limiter ceiling, and the FINAL number is measured again -
//      evidence recorded, never guessed. Each bus stem persists beside
//      the cut as its own WAV so the delivery side can remix.
//   5. Master video and the graded mix are MUXED into a single
//      h264+aac mp4 with a JSON sidecar manifest.
// ─────────────────────────────────────────────────────────────

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { detectFfmpeg, renderShotClip, probeMedia } from "@/lib/bridge/motion";

export interface CutShotSlot {
  shotId: string;
  number: number;
  sceneNumber: number;
  description: string;
  startMs: number;
  durationMs: number;
  clipUrl: string;
  movement: string | null;
  shotType: string;
  renderedNow: boolean;
}

export interface CutCueSlot {
  cueId: string;
  kind: string;
  label: string;
  shotNumber: number;
  startMs: number; // absolute on the cut timeline
  durationMs: number;
  volume: number;
  voicePath: string | null;
  voiceState: string | null;
}

export interface CutPlan {
  slots: CutShotSlot[];
  cues: CutCueSlot[];
  totalMs: number;
}

// ── pure planner (unit-checkable without ffmpeg) ─────────────

export function planCut(
  shots: Array<{
    id: string;
    number: number;
    sceneNumber: number;
    description: string;
    duration: number;
    movement: string | null;
    shotType: string;
    clipUrl: string | null;
  }>,
  cuesByShot: Record<string, Array<{ id: string; kind: string; label: string; startMs: number; durationMs: number; volume: number; voiceUrl?: string | null; voiceState?: string | null }>>,
  voicePathFor: (url: string) => string | null,
): CutPlan {
  const slots: CutShotSlot[] = [];
  const cues: CutCueSlot[] = [];
  let cursor = 0;
  for (const shot of shots) {
    const durationMs = Math.max(500, Math.round(shot.duration * 1000));
    slots.push({
      shotId: shot.id,
      number: shot.number,
      sceneNumber: shot.sceneNumber,
      description: shot.description,
      startMs: cursor,
      durationMs,
      clipUrl: shot.clipUrl ?? "",
      movement: shot.movement,
      shotType: shot.shotType,
      renderedNow: false,
    });
    for (const cue of cuesByShot[shot.id] ?? []) {
      cues.push({
        cueId: cue.id,
        kind: cue.kind,
        label: cue.label,
        shotNumber: shot.number,
        startMs: cursor + Math.max(0, cue.startMs),
        durationMs: Math.max(60, Math.min(cue.durationMs, durationMs - Math.max(0, cue.startMs))),
        volume: Math.min(1, Math.max(0.05, cue.volume)),
        voicePath: cue.kind === "VOICE" && cue.voiceUrl ? voicePathFor(cue.voiceUrl) : null,
        voiceState: cue.voiceState ?? null,
      });
    }
    cursor += durationMs;
  }
  return { slots, cues, totalMs: cursor };
}

// ── process helpers ──────────────────────────────────────────

function runFfmpeg(args: string[], timeoutMs = 300_000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const bin = "ffmpeg";
    const child = spawn(bin, ["-y", "-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (c: Buffer) => { err = (err + c.toString()).slice(-4000); });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, error: String(e) }); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true } : { ok: false, error: err || `ffmpeg exited ${code}` });
    });
  });
}

/** stderr-CAPTURING runner - the loudness measure reads ebur128's summary off stderr. */
function runFfmpegCapture(args: string[], timeoutMs = 120_000): Promise<{ ok: boolean; error?: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-y", "-hide_banner", "-nostats", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (c: Buffer) => { err = (err + c.toString()).slice(-16000); });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, error: String(e), stderr: err }); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true, stderr: err } : { ok: false, error: err.slice(-800) || `ffmpeg exited ${code}`, stderr: err });
    });
  });
}

/** MEASURE the integrated loudness of a WAV (EBU R128 through ebur128). The last summary wins. */
export async function measureLufs(file: string): Promise<number | null> {
  const r = await runFfmpegCapture(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  if (!r.ok) return null;
  const matches = [...r.stderr.matchAll(/I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/g)];
  const last = matches[matches.length - 1];
  return last ? parseFloat(last[1]) : null;
}

/** Deterministic hash matching the browser labelHash DNA. */
function labelHash(label: string): number {
  let h = 2166136261;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function publicFile(url: string, allowedPrefix: string): string | null {
  const clean = String(url).split("?")[0];
  if (!clean.startsWith(allowedPrefix) || clean.includes("..")) return null;
  const abs = path.join(process.cwd(), "public", clean.replace(/^\//, ""));
  return fs.existsSync(abs) ? abs : null;
}

// ── the mix bus law (iteration 76) ──────────────────────────
//
// A professional mix is BALANCED BY LAW, not by cue volume alone:
// every cue lands on its kind's bus, each bus carries a fixed gain
// (the voice speaks, the score supports, the room breathes), the
// score ducks under the voice, and the master is measured to a
// loudness target. The numbers below are the law - the same cue
// sheet always lands the same mix.

export const MIX_BUS_GAIN: Record<string, number> = {
  VOICE: 1.0,
  SFX: 0.9,
  BGM: 0.55,
  AMBIENCE: 0.4,
};

export const MIX_BUS_ORDER = ["VOICE", "SFX", "BGM", "AMBIENCE"] as const;

/** Streaming loudness target (EBU R128 integrated, LUFS). */
export const MIX_TARGET_LUFS = -16;
/** The normalization gain is clamped - a broken bed is not fixed by +40 dB. */
export const MIX_GAIN_LIMIT_DB = 12;
/** The master's honest ceiling (linear). level=disabled: a ceiling, not a make-up gain. */
export const MIX_CEILING = 0.89;
/** The dialogue-duck law: the BGM bus compresses under the VOICE sidechain. */
export const MIX_DUCK = "sidechaincompress=threshold=0.04:ratio=6:attack=12:release=320";

/** The clamped loudness normalization gain for a measured mix (pure, unit-checkable). */
export function mixGainDb(lufs: number, target: number = MIX_TARGET_LUFS, limit: number = MIX_GAIN_LIMIT_DB): number {
  const raw = target - lufs;
  return Math.round(Math.max(-limit, Math.min(limit, raw)) * 10) / 10;
}

// ── audio graph construction ─────────────────────────────────

function cueFilterAndInput(cue: CutCueSlot, index: number): { input: string[]; chain: string } | null {
  const durSec = Math.max(0.06, cue.durationMs / 1000);
  const h = labelHash(cue.label);
  const vol = cue.volume;
  const label = cue.label.toLowerCase();

  let input: string[];
  let synth: string;

  if (cue.kind === "VOICE" && cue.voicePath) {
    input = ["-i", cue.voicePath];
    return { input, chain: `[${index}:a]volume=${vol},adelay=${Math.round(cue.startMs)}:all=1[c${index}]` };
  }
  if (cue.kind === "VOICE") {
    // no rendered take: a soft formant-ish blip carrying the cadence
    const f0 = (150 + h * 90) * (cue.voiceState === "INJURED" ? 0.92 : cue.voiceState === "EXCITED" ? 1.06 : 1);
    const pace = cue.voiceState === "INJURED" ? 0.78 : cue.voiceState === "EXCITED" ? 1.2 : 1;
    const syll = Math.max(3, Math.round((durSec / 0.28) * pace));
    synth = `aevalsrc='0.34*sin(2*PI*${(f0 / 2).toFixed(1)}*t)*(0.55+0.45*sin(2*PI*${syll.toFixed(2)}/${durSec.toFixed(3)}*PI*t))':d=${durSec.toFixed(3)}:s=44100`;
    input = ["-f", "lavfi", "-i", synth];
    return { input, chain: `[${index}:a]bandpass=f=${Math.round(900 + h * 600)}:width_type=o:w=${(500 + h * 400).toFixed(0)},volume=${vol},adelay=${Math.round(cue.startMs)}:all=1[c${index}]` };
  }
  if (cue.kind === "SFX") {
    const low = /impact|thunder|detonat|boom|crash|scatter/.test(label);
    const bright = /shing|coiling|crack|hiss|electric/.test(label);
    const center = Math.round(low ? 180 + h * 220 : bright ? 2400 + h * 3600 : 700 + h * 1400);
    input = ["-f", "lavfi", "-i", `anoisesrc=color=${low ? "pink" : "white"}:r=44100:amplitude=0.7:duration=${(durSec + 0.05).toFixed(3)}:seed=${Math.round(h * 100000)}`];
    return { input, chain: `[${index}:a]bandpass=f=${center}:width_type=o:w=${(center * 1.2).toFixed(0)},afade=t=in:st=0:d=0.012,afade=t=out:st=${(durSec * 0.45).toFixed(3)}:d=${(durSec * 0.55).toFixed(3)},volume=${vol},adelay=${Math.round(cue.startMs)}:all=1[c${index}]` };
  }
  if (cue.kind === "BGM") {
    const base = 110 * Math.pow(2, Math.floor(h * 5) / 12);
    const osc = [base * Math.pow(2, -4 / 12), base * Math.pow(2, 3 / 12), base * Math.pow(2, 7 / 12)];
    synth = `aevalsrc='(0.18*sin(2*PI*${osc[0].toFixed(2)}*t)+0.14*sin(2*PI*${osc[1].toFixed(2)}*t)+0.11*sin(2*PI*${osc[2].toFixed(2)}*t))':d=${durSec.toFixed(3)}:s=44100`;
    input = ["-f", "lavfi", "-i", synth];
    return { input, chain: `[${index}:a]lowpass=f=${Math.round(1200 + h * 900)},afade=t=in:st=0:d=${Math.min(0.6, durSec / 4).toFixed(3)},afade=t=out:st=${(durSec * 0.7).toFixed(3)}:d=${(durSec * 0.3).toFixed(3)},volume=${(vol * 0.5).toFixed(3)},adelay=${Math.round(cue.startMs)}:all=1[c${index}]` };
  }
  if (cue.kind === "AMBIENCE") {
    input = ["-f", "lavfi", "-i", `anoisesrc=color=pink:r=44100:amplitude=0.5:duration=${durSec.toFixed(3)}:seed=${Math.round(h * 100000) + 7}`];
    const lpf = Math.round(400 + h * 900);
    return { input, chain: `[${index}:a]lowpass=f=${lpf},afade=t=in:st=0:d=${Math.min(1, durSec / 5).toFixed(3)},afade=t=out:st=${Math.max(0, durSec - Math.min(1, durSec / 5)).toFixed(3)}:d=${Math.min(1, durSec / 5).toFixed(3)},volume=${(vol * 0.45).toFixed(3)},adelay=${Math.round(cue.startMs)}:all=1[c${index}]` };
  }
  return null;
}

// ── the builder ──────────────────────────────────────────────

export interface CutMixInfo {
  target: number;
  buses: Record<string, number>;
  ducked: boolean;
  stems: string[];
  mixFile: string | null;
  lufsRaw: number | null;
  gainDb: number;
  lufsFinal: number | null;
  measured: boolean;
}

export interface CutBuildResult {
  url: string;
  file: string;
  manifestFile: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  shotCount: number;
  cueCount: number;
  renderedNow: number;
  warnings: string[];
  audioKinds: Record<string, number>;
  mix: CutMixInfo | null;
}

export async function buildEpisodeCut(episodeId: string, mode: "PREVIEW" | "FINAL"): Promise<CutBuildResult> {
  const ffmpeg = await detectFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg is not available on the server");

  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      season: { include: { project: true } },
      scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" }, include: { audioCues: { orderBy: { createdAt: "asc" } } } } } },
    },
  });
  if (!episode) throw new Error("Episode not found");
  const shots = episode.scenes.flatMap((s) => s.shots.map((sh) => ({ ...sh, scn: s })));
  if (shots.length === 0) throw new Error("Episode has no shots to cut");

  // latest finished clip per shot (a FINAL job wins over PREVIEW)
  const clipJobs = await db.renderJob.findMany({
    where: { shotId: { in: shots.map((s) => s.id), not: null }, outputUrl: { not: null } },
    orderBy: { attempt: "desc" },
    select: { shotId: true, outputUrl: true, mode: true },
  });
  const clipFor = new Map<string, string>();
  for (const j of clipJobs) {
    if (j.outputUrl === null || j.shotId === null) continue;
    if (j.mode === "FINAL" || !clipFor.has(j.shotId)) clipFor.set(j.shotId, j.outputUrl);
  }

  // render missing clips on the spot (bounded)
  const MISSING_CAP = 6;
  const missing = shots.filter((s) => !clipFor.has(s.id));
  const warnings: string[] = [];
  let renderedNow = 0;
  if (missing.length > MISSING_CAP) {
    throw new Error(`${missing.length} shots have no rendered clip yet - render them from the queue first (cap ${MISSING_CAP} inline renders per cut)`);
  }
  const inlineErrors: string[] = [];
  for (const shot of missing) {
    const scene = shot.scn;
    const result = await renderShotClip({
      jobId: `cut-${shot.id}-${Date.now() % 100000}`,
      shotType: shot.shotType,
      lens: shot.lens,
      movement: shot.movement,
      lighting: shot.lighting,
      fogDensity: scene.fogDensity,
      lightningIntensity: scene.lightningIntensity,
      energyIntensity: scene.energyIntensity,
      cameraDistance: scene.cameraDistance,
      rimLightIntensity: scene.rimLightIntensity,
      duration: shot.duration,
      fps: episode.season.project.fps ?? 24,
      resolution: episode.season.project.resolution ?? "1920x1080",
      mode: "PREVIEW",
      artworkUrl: shot.artworkUrl,
      shotNumber: shot.number,
    });
    if (result.outputUrl) {
      clipFor.set(shot.id, result.outputUrl);
      renderedNow += 1;
    } else {
      inlineErrors.push(`Shot ${shot.number}: ${result.error ?? "render failed"}`);
    }
  }
  if (inlineErrors.length > 0) warnings.push(...inlineErrors);

  const usable = shots.filter((s) => clipFor.has(s.id));
  if (usable.length === 0) throw new Error("No shot clips could be assembled for this episode");

  // plan the timeline
  const plan = planCut(
    usable.map((s) => ({
      id: s.id,
      number: s.number,
      sceneNumber: s.scn.number,
      description: s.description,
      duration: s.duration,
      movement: s.movement,
      shotType: s.shotType,
      clipUrl: clipFor.get(s.id) as string,
    })),
    Object.fromEntries(usable.map((s) => [s.id, s.audioCues.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.label,
      startMs: c.startMs,
      durationMs: c.durationMs,
      volume: c.volume,
      voiceUrl: c.voiceUrl,
      voiceState: c.voiceState,
    }))])),
    (url) => publicFile(url, "/voices/"),
  );

  const fps = Math.min(60, Math.max(1, episode.season.project.fps ?? 24));
  const resMatch = String(episode.season.project.resolution ?? "1920x1080").match(/(\d{2,5})x(\d{2,5})/);
  const capW = mode === "FINAL" ? 1280 : 960;
  let w = resMatch ? parseInt(resMatch[1], 10) : 1920;
  let h = resMatch ? parseInt(resMatch[2], 10) : 1080;
  const scaleDown = Math.min(1, capW / Math.max(w, h));
  w = Math.max(16, Math.round((w * scaleDown) / 2) * 2);
  h = Math.max(16, Math.round((h * scaleDown) / 2) * 2);

  const cutsDir = path.join(process.cwd(), "public", "renders", "cuts");
  fs.mkdirSync(cutsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  const slug = `${slugify(episode.season.project.title)}-ep${String(episode.number).padStart(2, "0")}-${stamp}`;
  const masterPath = path.join(cutsDir, `.master-${slug}.mp4`);
  // the graded mix is a DELIVERABLE now (it persists beside the cut);
  // the bus stems land next to it, the raw pre-normalization master stays hidden
  const mixPath = path.join(cutsDir, `${slug}.mix.wav`);
  const outPath = path.join(cutsDir, `${slug}.mp4`);

  // 1. normalize + concat the clips
  const videoInputs: string[] = [];
  for (const slot of plan.slots) {
    const abs = publicFile(slot.clipUrl, "/renders/");
    if (!abs) throw new Error(`clip file missing for shot ${slot.number}: ${slot.clipUrl}`);
    videoInputs.push("-i", abs);
  }
  const vChains = plan.slots.map((_, i) =>
    `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setsar=1[v${i}]`,
  );
  const concatIn = plan.slots.map((_, i) => `[v${i}]`).join("");
  const videoFilter = `${vChains.join(";")};${concatIn}concat=n=${plan.slots.length}:v=1:a=0[vout]`;

  const master = await runFfmpeg([...videoInputs, "-filter_complex", videoFilter, "-map", "[vout]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", masterPath]);
  if (!master.ok) throw new Error(`clip assembly failed: ${master.error}`);

  // 2. THE MIX IS GRADED: cues land on KIND BUSES under the gain law,
  //    the score ducks under the voice (a real sidechain), and the
  //    master is MEASURED to the loudness target - evidence, not vibes.
  let audioOk = false;
  let audioError: string | undefined;
  const mix: CutMixInfo = {
    target: MIX_TARGET_LUFS,
    buses: {},
    ducked: false,
    stems: [],
    mixFile: null,
    lufsRaw: null,
    gainDb: 0,
    lufsFinal: null,
    measured: false,
  };
  const totalSec = (plan.totalMs / 1000).toFixed(3);
  if (plan.cues.length > 0) {
    const capped = plan.cues.slice(0, 80);
    if (plan.cues.length > 80) warnings.push(`${plan.cues.length - 80} cues beyond the 80-cue cap were skipped`);

    // per-cue synth chains, grouped onto their kind's bus
    const inputs: string[] = [];
    const byKind = new Map<string, string[]>();
    let idx = 0;
    for (const cue of capped) {
      const built = cueFilterAndInput(cue, idx);
      if (!built) continue;
      inputs.push(...built.input);
      const list = byKind.get(cue.kind) ?? [];
      list.push(built.chain);
      byKind.set(cue.kind, list);
      idx += 1;
    }

    const present = MIX_BUS_ORDER.filter((k) => byKind.has(k));
    const voicePresent = present.includes("VOICE");
    const bgmPresent = present.includes("BGM");
    if (idx > 0 && present.length > 0) {
      // bus stems persist beside the cut; the raw pre-normalization master is an intermediate
      const stemFile: Record<string, string> = {};
      for (const k of present) stemFile[k] = path.join(cutsDir, `${slug}.${k.toLowerCase()}.wav`);
      const rawPath = path.join(cutsDir, `.rawmix-${slug}.wav`);

      // assemble each bus: sum its cues, apply the BUS GAIN LAW, resample,
      // pad to the cut timeline (the -shortest mux would otherwise trim real
      // footage off the tail), then split for the stem + master feeds
      const g: string[] = [];
      for (const k of present) {
        const chains = byKind.get(k) as string[];
        const body = chains.length === 1
          ? `${chains[0].replace(/\[[^\]]+\]$/, "")},`
          : `${chains.join(";")};${chains.map((s) => s.match(/\[[^\]]+\]$/)?.[0] ?? "").join("")}amix=inputs=${chains.length}:normalize=0:duration=longest,`;
        g.push(`${body}volume=${MIX_BUS_GAIN[k]},aresample=44100,aformat=sample_rates=44100:channel_layouts=mono,apad=whole_dur=${totalSec}[bus${k}]`);
      }
      if (voicePresent) g.push("[busVOICE]asplit=3[vStem][vMix][vKey]");
      if (bgmPresent) {
        if (voicePresent) {
          // THE DIALOGUE DUCK: the score compresses under the voice sidechain
          g.push(`[busBGM][vKey]${MIX_DUCK}[bgmD]`);
          g.push("[bgmD]asplit=2[bStem][bMix]");
        } else {
          g.push("[busBGM]asplit=2[bStem][bMix]");
        }
      }
      if (present.includes("SFX")) g.push("[busSFX]asplit=2[sStem][sMix]");
      if (present.includes("AMBIENCE")) g.push("[busAMBIENCE]asplit=2[aStem][aMix]");

      // the master sums the mix feeds (every bus already padded to the timeline)
      const feeds = [
        voicePresent ? "[vMix]" : null,
        present.includes("SFX") ? "[sMix]" : null,
        bgmPresent ? "[bMix]" : null,
        present.includes("AMBIENCE") ? "[aMix]" : null,
      ].filter(Boolean) as string[];
      g.push(
        feeds.length === 1
          ? `${feeds[0]}anull[rawMaster]`
          : `${feeds.join("")}amix=inputs=${feeds.length}:normalize=0:duration=longest,apad=whole_dur=${totalSec}[rawMaster]`,
      );

      const outputs: Array<{ label: string; file: string }> = [];
      if (voicePresent) outputs.push({ label: "[vStem]", file: stemFile.VOICE });
      if (present.includes("SFX")) outputs.push({ label: "[sStem]", file: stemFile.SFX });
      if (bgmPresent) outputs.push({ label: "[bStem]", file: stemFile.BGM });
      if (present.includes("AMBIENCE")) outputs.push({ label: "[aStem]", file: stemFile.AMBIENCE });
      outputs.push({ label: "[rawMaster]", file: rawPath });
      const outArgs = outputs.flatMap((o) => ["-map", o.label, "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "1", o.file]);

      const built = await runFfmpeg([...inputs, "-filter_complex", g.join(";"), ...outArgs]);
      if (built.ok) {
        mix.buses = Object.fromEntries(present.map((k) => [k, MIX_BUS_GAIN[k]]));
        mix.ducked = voicePresent && bgmPresent;
        // MEASURE the raw master, walk it to the target with a CLAMPED gain,
        // ceiling it honestly, then MEASURE again - the numbers land in the manifest
        const lufsRaw = await measureLufs(rawPath);
        mix.lufsRaw = lufsRaw;
        mix.gainDb = lufsRaw === null ? 0 : mixGainDb(lufsRaw);
        const norm = await runFfmpeg([
          "-i", rawPath,
          "-af", `volume=${mix.gainDb}dB,alimiter=limit=${MIX_CEILING}:level=disabled,aformat=sample_rates=44100:channel_layouts=mono`,
          "-c:a", "pcm_s16le", mixPath,
        ]);
        if (norm.ok) {
          mix.mixFile = `/renders/cuts/${slug}.mix.wav`;
          mix.lufsFinal = await measureLufs(mixPath);
          mix.measured = lufsRaw !== null && mix.lufsFinal !== null;
          for (const k of present) mix.stems.push(`/renders/cuts/${slug}.${k.toLowerCase()}.wav`);
          audioOk = true;
        } else {
          audioError = norm.error;
        }
      } else {
        audioError = built.error;
      }
      fs.rmSync(rawPath, { force: true });
      if (!audioOk) {
        // a mix that did not land leaves no stem lies behind
        for (const f of Object.values(stemFile)) fs.rmSync(f, { force: true });
        mix.stems = [];
        mix.buses = {};
        mix.ducked = false;
      }
    }
  }
  // the silence fallback is an intermediate, never a deliverable - a cut
  // without a graded mix does not get to wear a graded-mix file name
  const silencePath = path.join(cutsDir, `.silence-${slug}.wav`);
  if (!audioOk) {
    if (audioError) warnings.push(`stem mix fell back to silence: ${audioError.slice(-1200)}`);
    const silent = await runFfmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", (plan.totalMs / 1000).toFixed(3), "-c:a", "pcm_s16le", silencePath]);
    if (!silent.ok) throw new Error(`even the silent track failed: ${silent.error}`);
  }

  // 3. mux
  const mux = await runFfmpeg([
    "-i", masterPath,
    "-i", audioOk ? mixPath : silencePath,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
  fs.unlinkSync(masterPath);
  if (!audioOk && fs.existsSync(silencePath)) fs.unlinkSync(silencePath);
  if (!mux.ok) throw new Error(`mux failed: ${mux.error}`);

  const probe = await probeMedia(outPath);
  const file = `${slug}.mp4`;
  const manifestFile = `${slug}.json`;
  const audioKinds = plan.cues.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {});
  const manifest = {
    project: episode.season.project.title,
    episode: { number: episode.number, title: episode.title },
    mode,
    generatedAt: new Date().toISOString(),
    canvas: { width: w, height: h, fps },
    durationMs: Math.round((probe?.durationSec ?? plan.totalMs / 1000) * 1000),
    shots: plan.slots.map((s) => ({
      shotId: s.shotId,
      sceneNumber: s.sceneNumber,
      number: s.number,
      startMs: s.startMs,
      durationMs: s.durationMs,
      movement: s.movement,
      shotType: s.shotType,
      renderedNow: s.renderedNow,
      clip: s.clipUrl,
    })),
    audio: {
      cueCount: plan.cues.length,
      kinds: audioKinds,
      synthesized: plan.cues.filter((c) => !c.voicePath && c.kind === "VOICE").length,
      realTakes: plan.cues.filter((c) => c.voicePath).length,
      mix: audioOk && plan.cues.length > 0
        ? {
            target: mix.target,
            buses: mix.buses,
            ducked: mix.ducked,
            lufsRaw: mix.lufsRaw,
            gainDb: mix.gainDb,
            lufsFinal: mix.lufsFinal,
            measured: mix.measured,
            stems: mix.stems,
          }
        : null,
    },
    warnings,
  };
  fs.writeFileSync(path.join(cutsDir, manifestFile), JSON.stringify(manifest, null, 2));

  await db.productionEvent.create({
    data: {
      projectId: episode.season.project.id,
      actor: "USER",
      type: "RENDER",
      summary: `Episode cut muxed - EP${String(episode.number).padStart(2, "0")} ${plan.slots.length} shot clip(s), ${plan.cues.length} cue(s), ${(probe?.durationSec ?? 0).toFixed(1)}s${mix.measured ? `, mix graded ${mix.lufsFinal?.toFixed(1)} LUFS (target ${MIX_TARGET_LUFS})` : ""}${renderedNow ? ` (${renderedNow} rendered inline)` : ""}`,
      payload: JSON.stringify({ url: `/renders/cuts/${file}`, mode, shots: plan.slots.length, cues: plan.cues.length, mix: mix.measured ? { lufsFinal: mix.lufsFinal, ducked: mix.ducked, stems: mix.stems.length } : null }),
    },
  });

  return {
    url: `/renders/cuts/${file}`,
    file,
    manifestFile: `/renders/cuts/${manifestFile}`,
    durationMs: Math.round((probe?.durationSec ?? plan.totalMs / 1000) * 1000),
    width: probe?.width ?? w,
    height: probe?.height ?? h,
    fps: probe?.fps ?? fps,
    shotCount: plan.slots.length,
    cueCount: plan.cues.length,
    renderedNow,
    warnings,
    audioKinds,
    mix: audioOk && plan.cues.length > 0 ? mix : null,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "animeos";
}

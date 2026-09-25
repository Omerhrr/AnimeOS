import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { ensureResident, residentHost, provisionBlender } from "@/lib/blender/runtime";

// ─────────────────────────────────────────────────────────────
// LIVE BLENDER BRIDGE (§31 - replaceable engine driver)
//
// The bridge renders REAL ANIMATED SHOTS: every job becomes a
// sequenced h264 clip driven by the shot's camera grammar, rendered
// by Cycles CPU inside a headless Blender worker and encoded to
// public/renders/{jobId}.mp4.
//
// Two connection paths, same output contract:
//
//   1. ENV HOST - ANIMEOS_BLENDER_HOST points at a running bridge
//      server (bridges/blender/animeos_bridge.py) inside a
//      workstation Blender (GUI or headless). Jobs go over HTTP,
//      progress is polled, the finished clip returns as mp4_base64.
//      Start one with:
//        blender -b -P bridges/blender/animeos_bridge.py -- --port 8100
//
//   2. RESIDENT RUNTIME - the studio's own headless bridge server
//      (src/lib/blender/runtime.ts auto-starts and owns it). Same
//      HTTP protocol as the env host, warm (no per-job startup).
//      When the app boots with a Blender binary present, the first
//      status probe brings the resident up; when no binary exists,
//      provisioning self-heals in the background.
//
//   3. LOCAL WORKERS - when a `blender` binary exists on this
//      machine but the resident is down, each job spawns its own
//      headless worker process
//        blender -b -P animeos_bridge.py -- --worker --job <file>
//      which renders the clip and streams per-frame progress into a
//      small JSON state file the render pipeline polls. One local
//      worker at a time (a 4GB-class box renders one 3D clip at a
//      time); extra jobs fall through to the MOTION engine.
//
// If none of these exist the render pipeline uses the built-in MOTION
// engine (ffmpeg camera moves over key art) or, failing that, the
// wall-clock simulator - nothing breaks.
// ─────────────────────────────────────────────────────────────

const HOST_ENV = process.env.ANIMEOS_BLENDER_HOST ?? "";
const BLENDER_BIN_ENV = process.env.ANIMEOS_BLENDER_BIN ?? "";
const PROBE_TIMEOUT_MS = 1200;
const WORKER_TIMEOUT_MS = 15 * 60_000;

export type BridgeSource = "env" | "resident" | "local" | null;

export interface BridgeStatus {
  mode: "LIVE_BLENDER" | "MOTION" | "SIMULATOR";
  source: BridgeSource;
  host: string | null;
  reachable: boolean;
  blenderVersion: string | null;
  scene: string | null;
  busy: boolean;
  detail: string;
}

let localBinCache: string | null | undefined; // undefined = not probed yet
let localVersionCache: string | null = null;
let lastProbe: { at: number; live: boolean } = { at: 0, live: false };
let localWorkers = 0; // running local worker count (serialize 3D renders)
let provisionKicked = false; // self-heal provisioning fired once per lifetime

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeHost(host: string): Promise<{ version: string; scene: string; busy: boolean } | null> {
  try {
    const res = await fetchWithTimeout(`http://${host}/status`, undefined, PROBE_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = (await res.json()) as { blender_version?: string; scene?: string; busy?: boolean };
    return {
      version: String(data.blender_version ?? "unknown"),
      scene: String(data.scene ?? ""),
      busy: Boolean(data.busy),
    };
  } catch {
    return null;
  }
}

function localBinCandidates(): string[] {
  const out: string[] = [];
  if (BLENDER_BIN_ENV) out.push(BLENDER_BIN_ENV);
  const home = process.env.HOME ?? "/home/z";
  out.push(
    `${home}/.venv/bin/blender`,
    "/home/z/blender-4.3.2-linux-x64/blender",
    "/usr/local/bin/blender",
    "/usr/bin/blender",
  );
  return out;
}

/** Resolve a usable local Blender binary (cached after first probe). */
export function localBlenderBin(): string | null {
  if (localBinCache !== undefined) return localBinCache;
  for (const bin of localBinCandidates()) {
    try {
      fs.accessSync(bin, fs.constants.X_OK);
      const st = fs.statSync(bin);
      if (st.isFile() || (st.isSymbolicLink && st.isSymbolicLink())) {
        localBinCache = bin;
        return bin;
      }
    } catch {
      // candidate missing - try the next one
    }
  }
  localBinCache = null;
  return null;
}

export async function blenderVersion(bin: string): Promise<string> {
  if (localVersionCache) return localVersionCache;
  return new Promise<string>((resolve) => {
    const child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve("unknown"));
    child.on("exit", () => {
      const first = out.split("\n")[0]?.replace("Blender", "").trim();
      localVersionCache = first || "unknown";
      resolve(localVersionCache);
    });
  });
}

/** Full bridge status - used by /api/bridge and the render pipeline. */
export async function bridgeStatus(force = false): Promise<BridgeStatus> {
  const cached = !force && Date.now() - lastProbe.at < 4000;

  // 1. env-host workstation Blender
  if (HOST_ENV) {
    const info = await probeHost(HOST_ENV);
    if (info) {
      lastProbe = { at: Date.now(), live: true };
      return {
        mode: "LIVE_BLENDER", source: "env", host: HOST_ENV, reachable: true,
        blenderVersion: info.version, scene: info.scene || null, busy: info.busy,
        detail: `Live Blender ${info.version} attached via ANIMEOS_BLENDER_HOST - animated sequence renders flow back into the queue`,
      };
    }
    if (cached) {
      return {
        mode: "MOTION", source: null, host: HOST_ENV, reachable: false,
        blenderVersion: null, scene: null, busy: false,
        detail: `No response from ANIMEOS_BLENDER_HOST (${HOST_ENV}) - built-in MOTION engine driving`,
      };
    }
  }

  // 2. resident runtime (the studio's own server, auto-started)
  if (!HOST_ENV) {
    // warm the resident in the background (first call after boot) and
    // self-heal a missing binary by provisioning it - both fire-and-forget
    void ensureResident().catch(() => {});
    const rHost = residentHost();
    if (rHost) {
      const info = await probeHost(rHost);
      if (info) {
        lastProbe = { at: Date.now(), live: true };
        return {
          mode: "LIVE_BLENDER", source: "resident", host: rHost, reachable: true,
          blenderVersion: info.version, scene: info.scene || null, busy: info.busy,
          detail: `Resident Blender ${info.version} at ${rHost} - the studio's own runtime, warm and health-checked (auto-restart on failure)`,
        };
      }
    }
  }

  // 3. local headless workers (per-job subprocess, one at a time)
  const bin = localBlenderBin();
  if (!bin && !provisionKicked) {
    // no binary anywhere: kick self-healing provisioning once per
    // server lifetime - the studio installs its own Blender
    provisionKicked = true;
    void provisionBlender().catch(() => {});
  }
  if (bin) {
    const version = await blenderVersion(bin);
    lastProbe = { at: Date.now(), live: true };
    return {
      mode: "LIVE_BLENDER", source: "local", host: bin, reachable: true,
      blenderVersion: version, scene: "sequence worker pool", busy: localWorkers > 0,
      detail: `Headless Blender ${version} at ${bin} - one 3D sequence worker at a time, overflow renders fall to the MOTION engine`,
    };
  }

  lastProbe = { at: Date.now(), live: false };
  return {
    mode: "MOTION", source: null, host: null, reachable: false,
    blenderVersion: null, scene: null, busy: false,
    detail: "No Blender attached - the built-in MOTION engine renders animated clips per shot's camera grammar (ffmpeg). Set ANIMEOS_BLENDER_HOST to attach a workstation.",
  };
}

// DESIGN DNA: compiled by src/lib/animation/design.ts from the
// production's design text (model-sheet anchors, appearance notes,
// wardrobe/weapon states, environment briefs). The worker renders
// the DESIGNED character and set from it; when it is absent the
// worker falls back to the legacy stand-in figure and set.
interface CharacterDesignDnaWire {
  name: string;
  hairColor: string;
  hairStyle: string;
  robeColor: string;
  robeAccent: string;
  skinTone: string;
  weaponType: string;
  bladeColor: string;
  build: string;
  beard?: boolean;
}
interface EnvironmentDesignDnaWire {
  name: string;
  terrain: string;
  timeOfDay: string;
  weather: string;
  skyColor: string;
  fogColor: string;
  groundColor: string;
  keyLight: string;
  features: string[];
}

export interface BridgeJobPayload {
  jobId: string;
  shot: {
    number: number; description: string; shotType: string; lens: string | null; movement: string | null;
    poseStart: string | null; poseEnd: string | null; lighting: string | null; duration: number;
    // LIP-SYNC: millisecond viseme program for speaking closeups
    // (SPEECH dialogue + CLOSEUP/EXTREME_CLOSEUP). The worker drives
    // the stand-in's mouth rig from it per frame.
    speech?: { visemes: Array<{ s: number; e: number; o: number; w: number; r: number }>; lines: number } | null;
    // DESIGN: the detected cast (index 0 = the hero the rig drives)
    cast?: CharacterDesignDnaWire[];
  };
  scene: { number: number; title: string; fogDensity: number; lightningIntensity: number; energyIntensity: number; cameraDistance: number; rimLightIntensity: number; environment?: EnvironmentDesignDnaWire };
  // ASSET LIBRARY (v4.1): paths to accepted .blend assets for this
  // exact cast and environment. When present and readable the worker
  // loads the DESIGNED asset instead of rebuilding procedurally;
  // missing files fall back to the DNA builders honestly.
  assets?: {
    cast: Array<{ name: string; path: string }>;
    environment: { name: string; path: string } | null;
  };
  project: { title: string; visualStyle: string; resolution: string; fps: number };
  mode: "PREVIEW" | "FINAL";
}

export interface BridgeSubmitResult {
  submitted: boolean;
  path: "env" | "resident" | "local" | null;
  error?: string;
}

/** Submit a render job to a bridge server over HTTP (env host or resident). */
async function submitHttpJob(payload: BridgeJobPayload, source: "env" | "resident"): Promise<BridgeSubmitResult> {
  const status = await bridgeStatus(true);
  if (!status.reachable || status.source !== source || !status.host) return { submitted: false, path: null, error: status.detail };
  try {
    const res = await fetchWithTimeout(
      `http://${status.host}/render`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      5000
    );
    if (!res.ok) return { submitted: false, path: source, error: `Blender /render responded ${res.status}` };
    return { submitted: true, path: source };
  } catch (err) {
    return { submitted: false, path: source, error: err instanceof Error ? err.message : "Blender submit failed" };
  }
}

// ── local worker path (job-file protocol, no middleman server) ──

export interface LocalJobState {
  jobId: string;
  progress: number;
  stage: string;
  done: boolean;
  error: string | null;
  mp4Path: string | null;
}

function jobFileFor(jobId: string): string {
  return path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
}

/** Spawn a detached headless Blender worker for one job. */
export function submitLocalJob(payload: BridgeJobPayload): BridgeSubmitResult {
  const bin = localBlenderBin();
  if (!bin) return { submitted: false, path: "local", error: "no local blender binary" };
  if (localWorkers >= 1) return { submitted: false, path: "local", error: "local worker busy" };
  const script = path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py");
  if (!fs.existsSync(script)) return { submitted: false, path: "local", error: "bridge script missing" };
  const rendersDir = path.join(process.cwd(), "public", "renders");
  fs.mkdirSync(rendersDir, { recursive: true });
  const jobFile = jobFileFor(payload.jobId);
  fs.writeFileSync(jobFile, JSON.stringify({ jobId: payload.jobId, payload, outDir: rendersDir }));
  try {
    const child = spawn(bin, ["-b", "-P", script, "--", "--worker", "--job", jobFile], {
      stdio: "ignore",
      detached: true,
      cwd: process.cwd(),
    });
    child.unref();
    localWorkers += 1;
    child.on("exit", () => {
      localWorkers = Math.max(0, localWorkers - 1);
    });
    return { submitted: true, path: "local" };
  } catch (err) {
    try { fs.unlinkSync(jobFile); } catch { /* cleanup best-effort */ }
    return { submitted: false, path: "local", error: err instanceof Error ? err.message : "worker spawn failed" };
  }
}

/** Poll a local worker's state file into the shared progress shape. */
export function pollLocalJob(jobId: string): BridgeProgress {
  const file = jobFileFor(jobId);
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const state = JSON.parse(raw) as LocalJobState;
    return {
      polled: true,
      progress: typeof state.progress === "number" ? state.progress : undefined,
      stage: state.stage,
      done: Boolean(state.done),
      error: state.error ?? undefined,
      mp4Path: state.mp4Path ?? undefined,
    };
  } catch {
    return { polled: false, error: "no worker state yet" };
  }
}

export function localWorkerBusy(): boolean {
  return localWorkers > 0;
}

/** Submit wherever a real Blender can take the job: env host, then the resident, then a local worker. */
export async function submitRenderJob(payload: BridgeJobPayload): Promise<BridgeSubmitResult> {
  const envResult = await submitHttpJob(payload, "env");
  if (envResult.submitted) return envResult;
  if (!HOST_ENV || envResult.error) {
    // no env host configured, or it refused - try the resident, then a local worker
    const resident = await submitHttpJob(payload, "resident");
    if (resident.submitted) return resident;
    const local = submitLocalJob(payload);
    if (local.submitted) return local;
    return { submitted: false, path: null, error: envResult.error ?? resident.error ?? local.error };
  }
  return envResult;
}

export interface BridgeProgress {
  polled: boolean;
  progress?: number;
  stage?: string;
  done?: boolean;
  pngBase64?: string;
  mp4Base64?: string;
  mp4Path?: string;
  error?: string;
}

/** Poll live progress for a job submitted to Blender (env host over HTTP). */
export async function pollJobProgress(jobId: string): Promise<BridgeProgress> {
  const status = await bridgeStatus(true);
  if (!status.reachable || !status.host) return { polled: false, error: status.detail };
  try {
    const res = await fetchWithTimeout(`http://${status.host}/progress?job_id=${encodeURIComponent(jobId)}`, undefined, 5000);
    if (!res.ok) return { polled: false, error: `Blender /progress responded ${res.status}` };
    const data = (await res.json()) as { progress?: number; stage?: string; done?: boolean; png_base64?: string; mp4_base64?: string; error?: string };
    return {
      polled: true,
      progress: typeof data.progress === "number" ? data.progress : undefined,
      stage: typeof data.stage === "string" ? data.stage : undefined,
      done: Boolean(data.done),
      pngBase64: typeof data.png_base64 === "string" ? data.png_base64 : undefined,
      mp4Base64: typeof data.mp4_base64 === "string" ? data.mp4_base64 : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
    };
  } catch (err) {
    return { polled: false, error: err instanceof Error ? err.message : "Blender poll failed" };
  }
}

/** Jobs whose worker state file went quiet for this long are failed out. */
export function localJobStale(jobId: string): boolean {
  try {
    const st = fs.statSync(jobFileFor(jobId));
    return Date.now() - st.mtimeMs > WORKER_TIMEOUT_MS;
  } catch {
    return false;
  }
}

export function bridgeHostEnv(): string {
  return HOST_ENV;
}

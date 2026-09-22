import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// LIVE BLENDER BRIDGE (§31 — replaceable engine driver)
//
// Transport: the AnimeOS Blender add-on (bridges/blender/
// animeos_bridge.py) runs a tiny HTTP server inside Blender:
//   GET  /status    → { blender_version, scene, busy }
//   GET  /progress  → { progress 0..1, stage, done, png_base64? }
//   POST /render    → submit an AnimeOS job (scene params → bpy)
//   POST /ping      → liveness
//
// Connection sources, in order:
//   1. ANIMEOS_BLENDER_HOST — an already-running add-on endpoint
//      (e.g. "127.0.0.1:8100"), the way a workstation Blender or a
//      render node attaches to this studio.
//   2. Local `blender` binary — we spawn `blender -b -P
//      animeos_bridge.py` ourselves (headless live bridge).
// If neither exists, every call degrades to null and the render
// pipeline keeps using the built-in simulator — nothing breaks.
// ─────────────────────────────────────────────────────────────

const HOST_ENV = process.env.ANIMEOS_BLENDER_HOST ?? "";
const BRIDGE_PORT = 8100;
const PROBE_TIMEOUT_MS = 1200;

export interface BridgeStatus {
  mode: "LIVE_BLENDER" | "SIMULATOR";
  source: "env" | "spawned" | null;
  host: string | null;
  reachable: boolean;
  blenderVersion: string | null;
  scene: string | null;
  busy: boolean;
  detail: string;
}

let spawnedProcess: ChildProcess | null = null;
let spawnedAvailable: boolean | null = null; // null = not probed yet
let lastProbe: { at: number; live: boolean } = { at: 0, live: false };

function hostCandidates(): Array<{ host: string; source: "env" | "spawned" }> {
  const out: Array<{ host: string; source: "env" | "spawned" }> = [];
  if (HOST_ENV) out.push({ host: HOST_ENV, source: "env" });
  if (spawnedProcess) out.push({ host: `127.0.0.1:${BRIDGE_PORT}`, source: "spawned" });
  return out;
}

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

/** Try to spawn a headless local Blender running the bridge add-on. */
async function trySpawnBlender(): Promise<boolean> {
  if (spawnedProcess || spawnedAvailable === false) return Boolean(spawnedProcess);
  const addOn = path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py");
  if (!fs.existsSync(addOn)) {
    spawnedAvailable = false;
    return false;
  }
  for (const bin of ["blender", "blender-4.2", "blender-4.1", "blender-4.0"]) {
    try {
      const child = spawn(bin, ["-b", "-P", addOn, "--", "--port", String(BRIDGE_PORT)], {
        stdio: "ignore",
        detached: false,
      });
      // If the binary doesn't exist, spawn errors asynchronously — listen and clean up.
      let failed = false;
      child.on("error", () => {
        failed = true;
      });
      await new Promise((r) => setTimeout(r, 300));
      if (!failed && child.pid) {
        child.removeAllListeners("error");
        spawnedProcess = child;
        child.on("exit", () => {
          spawnedProcess = null;
        });
        // Give the add-on a moment to boot its HTTP server
        for (let i = 0; i < 10; i++) {
          if (await probeHost(`127.0.0.1:${BRIDGE_PORT}`)) return true;
          await new Promise((r) => setTimeout(r, 500));
        }
        return Boolean(spawnedProcess);
      }
    } catch {
      // binary not found — try next candidate
    }
  }
  spawnedAvailable = false;
  return false;
}

/** Full bridge status — used by /api/bridge and the render pipeline. */
export async function bridgeStatus(force = false): Promise<BridgeStatus> {
  const cached = !force && Date.now() - lastProbe.at < 4000;
  if (cached && !lastProbe.live && !spawnedProcess && !HOST_ENV) {
    return {
      mode: "SIMULATOR", source: null, host: null, reachable: false,
      blenderVersion: null, scene: null, busy: false,
      detail: "Blender bridge offline — set ANIMEOS_BLENDER_HOST to a running animeos_bridge.py add-on, or install Blender locally. Simulator driver active.",
    };
  }

  for (const { host, source } of hostCandidates()) {
    const info = await probeHost(host);
    if (info) {
      lastProbe = { at: Date.now(), live: true };
      return {
        mode: "LIVE_BLENDER", source, host, reachable: true,
        blenderVersion: info.version, scene: info.scene || null, busy: info.busy,
        detail: `Live Blender ${info.version} attached via ${source === "env" ? "ANIMEOS_BLENDER_HOST" : "local spawn"}`,
      };
    }
  }

  // No env host (or env host down) — attempt local spawn once
  if (!HOST_ENV && (await trySpawnBlender())) {
    const info = await probeHost(`127.0.0.1:${BRIDGE_PORT}`);
    if (info) {
      lastProbe = { at: Date.now(), live: true };
      return {
        mode: "LIVE_BLENDER", source: "spawned", host: `127.0.0.1:${BRIDGE_PORT}`, reachable: true,
        blenderVersion: info.version, scene: info.scene || null, busy: info.busy,
        detail: "Live headless Blender spawned with the AnimeOS bridge add-on",
      };
    }
  }

  lastProbe = { at: Date.now(), live: false };
  return {
    mode: "SIMULATOR", source: null,
    host: HOST_ENV || (spawnedProcess ? `127.0.0.1:${BRIDGE_PORT}` : null),
    reachable: false, blenderVersion: null, scene: null, busy: false,
    detail: HOST_ENV
      ? `No response from ANIMEOS_BLENDER_HOST (${HOST_ENV}) — simulator driver active.`
      : "Blender bridge offline — set ANIMEOS_BLENDER_HOST to a running animeos_bridge.py add-on, or install Blender locally. Simulator driver active.",
  };
}

export interface BridgeJobPayload {
  jobId: string;
  shot: { number: number; description: string; shotType: string; lens: string | null; movement: string | null; lighting: string | null };
  scene: { number: number; title: string; fogDensity: number; lightningIntensity: number; energyIntensity: number; cameraDistance: number; rimLightIntensity: number };
  project: { title: string; visualStyle: string; resolution: string; fps: number };
  mode: "PREVIEW" | "FINAL";
}

export interface BridgeSubmitResult {
  submitted: boolean;
  error?: string;
}

/** Submit a render job to the live Blender. Returns submitted:false when offline. */
export async function submitRenderJob(payload: BridgeJobPayload): Promise<BridgeSubmitResult> {
  const status = await bridgeStatus(true);
  if (!status.reachable || !status.host) return { submitted: false, error: status.detail };
  try {
    const res = await fetchWithTimeout(
      `http://${status.host}/render`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      5000
    );
    if (!res.ok) return { submitted: false, error: `Blender /render responded ${res.status}` };
    return { submitted: true };
  } catch (err) {
    return { submitted: false, error: err instanceof Error ? err.message : "Blender submit failed" };
  }
}

export interface BridgeProgress {
  polled: boolean;
  progress?: number;
  stage?: string;
  done?: boolean;
  pngBase64?: string;
  error?: string;
}

/** Poll live progress for a job submitted to Blender. */
export async function pollJobProgress(jobId: string): Promise<BridgeProgress> {
  const status = await bridgeStatus(true);
  if (!status.reachable || !status.host) return { polled: false, error: status.detail };
  try {
    const res = await fetchWithTimeout(`http://${status.host}/progress?job_id=${encodeURIComponent(jobId)}`, undefined, 5000);
    if (!res.ok) return { polled: false, error: `Blender /progress responded ${res.status}` };
    const data = (await res.json()) as { progress?: number; stage?: string; done?: boolean; png_base64?: string };
    return {
      polled: true,
      progress: typeof data.progress === "number" ? data.progress : undefined,
      stage: typeof data.stage === "string" ? data.stage : undefined,
      done: Boolean(data.done),
      pngBase64: typeof data.png_base64 === "string" ? data.png_base64 : undefined,
    };
  } catch (err) {
    return { polled: false, error: err instanceof Error ? err.message : "Blender poll failed" };
  }
}

export function bridgeHostEnv(): string {
  return HOST_ENV;
}

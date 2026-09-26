import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────
// BLENDER RUNTIME (Blender as a native capability, not an integration)
//
// Three responsibilities, all owned by the studio itself:
//
//   1. PROVISIONING - the studio detects its own Blender install
//      and, when missing (a workspace reset, a fresh machine),
//      downloads and extracts the pinned release from
//      download.blender.org on its own. No manual install step.
//
//   2. RESIDENT PROCESS - one headless bridge server
//      (animeos_bridge.py server mode) the studio owns: auto-started
//      on first need, health-probed, restarted when it dies, its
//      output captured to a log file. Render jobs flow over HTTP
//      into it (warm: no per-job Blender startup); the per-job
//      spawn path in bridge/blender.ts stays as the fallback.
//
//   3. EXEC SANDBOX - the DSH designer runs real bpy scripts
//      (asset builds, viewport previews, refinements) through
//      short-lived headless Blender subprocesses with a timeout
//      and captured output. This is the "designer that fully knows
//      Blender" seam: scripts are authored by the studio's own
//      design loop, executed locally, artifacts land in the library.
//
// State lives in .blender-runtime/ (gitignored): host.json (resident
// registration), resident.log, exec/ scripts + outputs.
// ─────────────────────────────────────────────────────────────

const RUNTIME_DIR = path.join(process.cwd(), ".blender-runtime");
const HOST_FILE = path.join(RUNTIME_DIR, "host.json");
const RESIDENT_LOG = path.join(RUNTIME_DIR, "resident.log");
const EXEC_DIR = path.join(RUNTIME_DIR, "exec");
const PROVISION_LOG = path.join(RUNTIME_DIR, "provision.log");

const RESIDENT_PORT = 8101; // 8100 stays the documented MANUAL host port
const PROBE_TIMEOUT_MS = 1500;
const RESIDENT_MAX_RESTARTS = 3;
const RESIDENT_RESTART_BACKOFF_MS = 4000;
const EXEC_TIMEOUT_MS = 4 * 60_000;
const EXEC_MAX_SCRIPT_BYTES = 96 * 1024;

// The pinned release the studio provisions for itself (matches the
// bridge's known-good 4.3.x line; Cycles CPU proven on this box).
const BLENDER_VERSION_TAG = "4.3.2";
const BLENDER_URL = `https://download.blender.org/release/Blender${BLENDER_VERSION_TAG.slice(0, 3)}/blender-${BLENDER_VERSION_TAG}-linux-x64.tar.xz`;
const BLENDER_DIR = path.join(process.env.HOME ?? "/home/z", `blender-${BLENDER_VERSION_TAG}-linux-x64`);
const BLENDER_BIN = path.join(BLENDER_DIR, "blender");

export interface ResidentInfo {
  running: boolean;
  healthy: boolean;
  port: number;
  pid: number | null;
  startedAt: string | null;
  uptimeMs: number;
  restarts: number;
  lastError: string | null;
}

export interface RuntimeStatus {
  binary: string | null;
  version: string | null;
  versionTag: string;
  provisioning: boolean;
  provisionLog: string | null;
  resident: ResidentInfo;
}

interface HostFile {
  port: number;
  pid: number | null;
  startedAt: string;
  restarts: number;
}

let residentProc: ChildProcess | null = null;
let residentState: { startedAt: number; restarts: number; lastError: string | null } = {
  startedAt: 0,
  restarts: 0,
  lastError: null,
};
let ensureInFlight: Promise<boolean> | null = null;
let provisioning = false;
let provisionLogTail: string | null = null;
let versionCache: string | null | undefined;

function ensureRuntimeDir(): void {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(EXEC_DIR, { recursive: true });
}

function readHostFile(): HostFile | null {
  try {
    const raw = JSON.parse(fs.readFileSync(HOST_FILE, "utf-8")) as HostFile;
    if (typeof raw.port !== "number") return null;
    return raw;
  } catch {
    return null;
  }
}

function writeHostFile(host: HostFile): void {
  ensureRuntimeDir();
  fs.writeFileSync(HOST_FILE, JSON.stringify(host, null, 2));
}

function clearHostFile(): void {
  try { fs.unlinkSync(HOST_FILE); } catch { /* already gone */ }
}

function pidAlive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeResident(port: number): Promise<{ version: string; scene: string; busy: boolean } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { blender_version?: string; scene?: string; busy?: boolean };
    return {
      version: String(data.blender_version ?? "unknown"),
      scene: String(data.scene ?? ""),
      busy: Boolean(data.busy),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the studio's Blender binary: the provisioned pin first, then PATH-adjacent candidates. */
export function runtimeBlenderBin(): string | null {
  for (const bin of [BLENDER_BIN, "/usr/local/bin/blender", "/usr/bin/blender"]) {
    try {
      fs.accessSync(bin, fs.constants.X_OK);
      return bin;
    } catch {
      // candidate missing - try the next one
    }
  }
  return null;
}

export async function blenderRuntimeVersion(bin: string): Promise<string> {
  if (versionCache) return versionCache;
  return new Promise<string>((resolve) => {
    const child = spawn(bin, ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve("unknown"));
    child.on("exit", () => {
      const first = out.split("\n")[0]?.replace("Blender", "").trim();
      versionCache = first || "unknown";
      resolve(versionCache);
    });
  });
}

function appendLog(file: string, chunk: string | Buffer): void {
  try {
    ensureRuntimeDir();
    const prev = fs.existsSync(file) ? fs.statSync(file).size : 0;
    if (prev > 400_000) fs.writeFileSync(file, ""); // rotate, no unbounded growth
    fs.appendFileSync(file, chunk.toString());
  } catch {
    // log best-effort
  }
}

// ── 1. provisioning ──────────────────────────────────────────

export interface ProvisionResult {
  ok: boolean;
  bin: string | null;
  log: string;
}

async function sh(bin: string, args: string[], cwd?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", (e) => { out += `\n${e.message}`; resolve({ code: -1, out }); });
    child.on("exit", (code) => resolve({ code: code ?? -1, out }));
  });
}

/**
 * Provision Blender: detect, and when missing download + extract the
 * pinned release. Long-running (a ~250MB download); the studio runs
 * it in the background (auto-heal or the runtime API) and polls
 * runtimeStatus().provisioning.
 */
export async function provisionBlender(force = false): Promise<ProvisionResult> {
  const existing = runtimeBlenderBin();
  if (existing && !force) {
    return { ok: true, bin: existing, log: `Blender already present at ${existing}` };
  }
  if (provisioning) {
    return { ok: false, bin: null, log: "provisioning already in flight" };
  }
  provisioning = true;
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    provisionLogTail = lines.slice(-8).join("\n");
    appendLog(PROVISION_LOG, `${s}\n`);
  };
  try {
    ensureRuntimeDir();
    log(`provision: downloading ${BLENDER_URL}`);
    const dl = await sh("curl", ["-fSL", "--retry", "2", "-o", "/tmp/blender.tar.xz", BLENDER_URL]);
    if (dl.code !== 0) {
      log(`download failed (exit ${dl.code}): ${dl.out.slice(-300)}`);
      return { ok: false, bin: null, log: lines.join("\n") };
    }
    log("download complete - extracting");
    const ex = await sh("tar", ["-xJf", "/tmp/blender.tar.xz", "-C", process.env.HOME ?? "/home/z"]);
    if (ex.code !== 0) {
      log(`extract failed (exit ${ex.code}): ${ex.out.slice(-300)}`);
      return { ok: false, bin: null, log: lines.join("\n") };
    }
    if (!fs.existsSync(BLENDER_BIN)) {
      log(`extract finished but ${BLENDER_BIN} missing`);
      return { ok: false, bin: null, log: lines.join("\n") };
    }
    fs.chmodSync(BLENDER_BIN, 0o755);
    log(`provisioned: ${BLENDER_BIN}`);
    const v = await blenderRuntimeVersion(BLENDER_BIN);
    log(`verified: Blender ${v}`);
    return { ok: true, bin: BLENDER_BIN, log: lines.join("\n") };
  } finally {
    provisioning = false;
    try { fs.unlinkSync("/tmp/blender.tar.xz"); } catch { /* best effort */ }
  }
}

// ── 2. resident bridge server ────────────────────────────────

/**
 * Ensure the resident bridge server is up: healthy registration file
 * wins, a dead registration is replaced, absence starts a fresh
 * process. Returns true when the resident answers /status.
 */
export async function ensureResident(): Promise<boolean> {
  if (ensureInFlight) return ensureInFlight;

  ensureInFlight = (async () => {
    const bin = runtimeBlenderBin();
    if (!bin) return false;

    // already healthy?
    const reg = readHostFile();
    if (reg && reg.port === RESIDENT_PORT) {
      if (residentProc && !residentProc.killed) {
        const ok = await probeResident(RESIDENT_PORT);
        if (ok) return true;
      } else if (pidAlive(reg.pid)) {
        // started by a previous server lifetime - adopt it
        residentState.startedAt = new Date(reg.startedAt).getTime();
        residentState.restarts = reg.restarts ?? 0;
        const ok = await probeResident(RESIDENT_PORT);
        if (ok) return true;
      }
    }

    // stale or dead: clean up and (re)start
    if (residentProc && !residentProc.killed) {
      try { residentProc.kill("SIGTERM"); } catch { /* best effort */ }
      residentProc = null;
    }
    clearHostFile();
    if (residentState.restarts >= RESIDENT_MAX_RESTARTS) {
      residentState.lastError = `gave up after ${residentState.restarts} restarts`;
      return false;
    }

    ensureRuntimeDir();
    const script = path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py");
    if (!fs.existsSync(script)) return false;

    // detached + unref: the resident OUTLIVES the server lifetime that
    // started it (the registration file lets the next lifetime adopt
    // it); stdio streams straight into the log file (no pipes to a
    // parent that may be gone)
    const logFd = fs.openSync(RESIDENT_LOG, "a");
    const child = spawn(bin, ["-b", "-P", script, "--", "--port", String(RESIDENT_PORT)], {
      stdio: ["ignore", logFd, logFd],
      detached: true,
      env: { ...process.env, ANIMEOS_BLENDER_BIN: bin },
    });
    child.unref();
    residentProc = child;
    residentState.startedAt = Date.now();
    residentState.lastError = null;
    residentState.restarts += 1;
    writeHostFile({
      port: RESIDENT_PORT,
      pid: child.pid ?? null,
      startedAt: new Date().toISOString(),
      restarts: residentState.restarts,
    });

    appendLog(RESIDENT_LOG, `[runtime] resident spawned pid=${child.pid}\n`);
    child.on("exit", (code) => {
      appendLog(RESIDENT_LOG, `[runtime] resident exited code=${code}\n`);
      if (residentProc === child) {
        residentProc = null;
        clearHostFile();
        // self-heal: schedule one warm restart (backoff), unless we hit the cap
        if (residentState.restarts < RESIDENT_MAX_RESTARTS) {
          setTimeout(() => { void ensureResident(); }, RESIDENT_RESTART_BACKOFF_MS);
        }
      }
    });

    // wait for /status to answer (Blender module import takes seconds)
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 750));
      const ok = await probeResident(RESIDENT_PORT);
      if (ok) return true;
      if (child.exitCode !== null) return false;
    }
    residentState.lastError = "resident did not answer /status within 30s";
    return false;
  })();

  try {
    return await ensureInFlight;
  } finally {
    ensureInFlight = null;
  }
}

export function residentInfo(): ResidentInfo {
  const reg = readHostFile();
  const running = Boolean(residentProc && !residentProc.killed) || (reg ? pidAlive(reg.pid) : false);
  const startedAt = reg?.startedAt ?? (residentState.startedAt ? new Date(residentState.startedAt).toISOString() : null);
  return {
    running,
    healthy: false, // filled by runtimeStatus() after a probe
    port: reg?.port ?? RESIDENT_PORT,
    pid: reg?.pid ?? residentProc?.pid ?? null,
    startedAt,
    uptimeMs: startedAt ? Date.now() - new Date(startedAt).getTime() : 0,
    restarts: reg?.restarts ?? residentState.restarts,
    lastError: residentState.lastError,
  };
}

export async function restartResident(): Promise<boolean> {
  if (residentProc && !residentProc.killed) {
    try { residentProc.kill("SIGTERM"); } catch { /* best effort */ }
    residentProc = null;
  }
  clearHostFile();
  residentState.restarts = 0; // an explicit restart clears the failure cap
  return ensureResident();
}

/** Full runtime status for the API + panel: binary, version, resident health. */
export async function runtimeStatus(forceProbe = false): Promise<RuntimeStatus> {
  const bin = runtimeBlenderBin();
  const version = bin ? await blenderRuntimeVersion(bin) : null;
  const resident = residentInfo();
  const reg = readHostFile();
  if (reg && (resident.running || forceProbe)) {
    const probe = await probeResident(reg.port);
    resident.healthy = Boolean(probe);
  }
  return {
    binary: bin,
    version,
    versionTag: BLENDER_VERSION_TAG,
    provisioning,
    provisionLog: provisioning ? provisionLogTail : null,
    resident,
  };
}

export function residentHost(): string | null {
  const reg = readHostFile();
  if (!reg) return null;
  return `127.0.0.1:${reg.port}`;
}

// ── 3. exec sandbox (the designer's bpy seam) ────────────────

export interface ExecResult {
  ok: boolean;
  log: string;
  scriptPath: string;
  outDir: string;
  artifacts: string[];
}

/**
 * Run one bpy script in a short-lived headless Blender. The script
 * receives `--out <dir>` after `--` and may create artifacts there.
 * Output is capped; timeouts kill the worker. This is the seam the
 * DSH designer tools build on: asset builds, previews, refinements.
 */
export async function runBlenderScript(script: string, label: string, timeoutMs = EXEC_TIMEOUT_MS): Promise<ExecResult> {
  const bin = runtimeBlenderBin();
  if (!bin) {
    return { ok: false, log: "no Blender binary - provision the runtime first", scriptPath: "", outDir: "", artifacts: [] };
  }
  if (Buffer.byteLength(script, "utf-8") > EXEC_MAX_SCRIPT_BYTES) {
    return { ok: false, log: `script too large (${Buffer.byteLength(script, "utf-8")} bytes, cap ${EXEC_MAX_SCRIPT_BYTES})`, scriptPath: "", outDir: "", artifacts: [] };
  }
  ensureRuntimeDir();
  const stamp = `${Date.now().toString(36)}-${label.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40) || "exec"}`;
  const scriptPath = path.join(EXEC_DIR, `${stamp}.py`);
  const outDir = path.join(EXEC_DIR, stamp);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(scriptPath, script);

  const run = await new Promise<{ code: number | null; out: string; timedOut: boolean }>((resolve) => {
    const child = spawn(bin, ["-b", "-P", scriptPath, "--", "--out", outDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let out = "";
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }, timeoutMs);
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", (e) => { out += `\n${e.message}`; });
    child.on("exit", (code) => {
      clearTimeout(killer);
      resolve({ code, out, timedOut });
    });
  });

  const artifacts: string[] = [];
  try {
    for (const f of fs.readdirSync(outDir)) artifacts.push(path.join(outDir, f));
  } catch { /* no out dir */ }
  const tail = run.out.slice(-6000);
  const ok = run.code === 0 && !run.timedOut;
  return {
    ok,
    log: ok ? tail : `${run.timedOut ? "TIMED OUT\n" : ""}${tail}`,
    scriptPath,
    outDir,
    artifacts,
  };
}

export interface BuilderRunResult {
  ok: boolean;
  log: string;
  blendPath: string | null;
  previewPath: string | null;
  objects: number;
  tris: number;
  outDir: string;
}

function parseBuilderMarker(log: string, marker: string): string | null {
  const m = log.match(new RegExp(`^${marker} (.+)$`, "m"));
  return m ? m[1].trim() : null;
}

/**
 * Run the deterministic asset builder (bridges/blender/asset_builder.py):
 * one design DNA in, one versioned .blend + preview PNG out. This is
 * the studio's workhorse design-time pass; the DSH designer loop and
 * production runs both go through here.
 */
export async function runAssetBuilder(opts: {
  kind: "CHARACTER" | "ENVIRONMENT" | "PROP" | "CREATURE";
  dnaPath: string;
  outDir: string;
  name?: string;
  fromBlend?: string; // preview an existing asset instead of rebuilding
  materialPath?: string; // a DESIGNED material recipe (design_material)
  rigPath?: string; // a DESIGNED lighting rig (design_lighting)
  timeoutMs?: number;
}): Promise<BuilderRunResult> {
  const bin = runtimeBlenderBin();
  if (!bin) {
    return { ok: false, log: "no Blender binary - provision the runtime first", blendPath: null, previewPath: null, objects: 0, tris: 0, outDir: "" };
  }
  fs.mkdirSync(opts.outDir, { recursive: true });
  const builder = path.join(process.cwd(), "bridges", "blender", "asset_builder.py");
  if (!fs.existsSync(builder)) {
    return { ok: false, log: "asset_builder.py missing from bridges/blender", blendPath: null, previewPath: null, objects: 0, tris: 0, outDir: "" };
  }
  const argv = ["-b", "-P", builder, "--", "--kind", opts.kind, "--dna", opts.dnaPath, "--out", opts.outDir];
  if (opts.name) argv.push("--name", opts.name);
  if (opts.fromBlend) argv.push("--blend", opts.fromBlend);
  if (opts.materialPath) argv.push("--material", opts.materialPath);
  if (opts.rigPath) argv.push("--rig", opts.rigPath);

  const run = await new Promise<{ code: number | null; out: string; timedOut: boolean }>((resolve) => {
    const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    let out = "";
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }, opts.timeoutMs ?? 5 * 60_000);
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", (e) => { out += `\n${e.message}`; });
    child.on("exit", (code) => {
      clearTimeout(killer);
      resolve({ code, out, timedOut });
    });
  });

  const blendPath = parseBuilderMarker(run.out, "ASSET_BLEND");
  const previewPath = parseBuilderMarker(run.out, "ASSET_PREVIEW");
  const objects = parseInt(parseBuilderMarker(run.out, "ASSET_OBJECTS") ?? "0", 10) || 0;
  const tris = parseInt(parseBuilderMarker(run.out, "ASSET_TRIS") ?? "0", 10) || 0;
  const err = parseBuilderMarker(run.out, "ASSET_ERROR");
  const ok = run.code === 0 && !run.timedOut && !err;
  const tail = run.out.slice(-6000);
  return {
    ok,
    log: ok ? tail : `${run.timedOut ? "TIMED OUT\n" : ""}${err ? `ASSET_ERROR ${err}\n` : ""}${tail}`,
    blendPath,
    previewPath,
    objects,
    tris,
    outDir: opts.outDir,
  };
}

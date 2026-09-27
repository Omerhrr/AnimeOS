// Iteration 75 E2E: THE ECONOMICS - a 3D worker pool with a priority
// wait queue. Proves, against the RUNNING studio, the REAL database
// and the REAL Blender runtime:
//   A. source: the pool cap (env-read, clamped), the wait queue, the
//      pump (FINAL over PREVIEW, oldest first), the FINAL park law
//      (a FINAL never falls to the ffmpeg previz engine), the honest
//      lost-waiter failure
//   B. pure pool behavior over REAL spawns: two workers run
//      CONCURRENTLY, a full pool enqueues, the pump admits by
//      priority, the queue drains
//   C. accounts + throwaway production
//   D. studio-level: a FINAL parks with the 3D-WAIT line while the
//      pool is full, a PREVIEW overflows to the MOTION engine (the
//      overflow law holds), the parked FINAL is admitted by the tick
//      and renders through the designed engine
//   E. cleanup
// Run: pkill -f "animeos_bridge.py -- --port 8101" && npx tsx scripts/e2e-iter75-pool.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import {
  submitLocalJob, pumpLocalWaiters, localWaitDepth, renderWorkers,
  type BridgeJobPayload,
} from "../src/lib/bridge/blender";
import { createServer } from "node:http";
import { readFileSync, existsSync, unlinkSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter75-pool";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

class Jar {
  private m = new Map<string, string>();
  absorb(res: Response) {
    const lines = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const idx = pair.indexOf("=");
      if (idx > 0) this.m.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  get header(): string {
    return Array.from(this.m.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function call(jar: Jar | null, p: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter75" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter75" },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string }; id?: string; role?: string };
  if (res.ok) return { id: body.user?.id ?? body.id ?? "", role: body.user?.role ?? body.role ?? "" };
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter75" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter75", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

function isMp4(p: string): boolean {
  try {
    return statSync(p).size > 1000;
  } catch {
    return false;
  }
}

function readState(jobId: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`), "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function waitState(jobId: string, maxMs: number): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = readState(jobId);
    if (s && typeof s.progress === "number" && (s.progress as number) > 0) return s;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`worker state for ${jobId} never appeared`);
}

async function waitDone(jobId: string, maxMs: number): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = readState(jobId);
    if (s?.done === true) return s;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`worker for ${jobId} never finished`);
}

function smokePayload(jobId: string, mode: "PREVIEW" | "FINAL", duration = 0.9): BridgeJobPayload {
  return {
    jobId,
    shot: {
      number: 1, description: "pool smoke", shotType: "MEDIUM", lens: "50mm",
      movement: "STATIC", poseStart: "STANCE", poseEnd: "DRAW", lighting: "moonlit ridge", duration,
    },
    scene: { number: 1, title: "Pool Terrace", fogDensity: 0.3, lightningIntensity: 0.0, energyIntensity: 0.4, cameraDistance: 1.0, rimLightIntensity: 0.4 },
    project: { title: "Pool Proof", visualStyle: "DONGHUA", resolution: "640x360", fps: 12 },
    mode,
  };
}

async function cleanupLab(labId: string): Promise<void> {
  const labJobs = await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  for (const r of labJobs) {
    if (r.outputUrl) {
      const p = path.join(process.cwd(), "public", r.outputUrl);
      if (existsSync(p)) unlinkSync(p);
    }
    const st = path.join(process.cwd(), "public", "renders", `.job-${r.id}.json`);
    if (existsSync(st)) unlinkSync(st);
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.designPreset.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function main() {
  console.log("== Iteration 75: the economics (3D worker pool + priority queue) ==\n");

  // hold the resident's port with a 404-squatter so EVERY studio
  // render deterministically takes the LOCAL pool path (the bash
  // preface killed the real resident)
  const squatter = createServer((_req, res) => {
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    squatter.once("error", (e) => reject(e));
    squatter.listen(8101, "127.0.0.1", () => resolve());
  });

  // ───────────────────── A. source-level checks ─────────────────────
  const blenderTs = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A1 the pool cap is env-read, clamped 1..4", blenderTs.includes("export function renderWorkers()") && blenderTs.includes("Math.max(1, Math.min(4, Math.round(raw)))"));
  check("A2 a full pool enqueues instead of failing", blenderTs.includes("localWaiters.push({ jobId: payload.jobId, payload, enqueuedAt: Date.now(), final })") && blenderTs.includes("queued3d: true"));
  check("A3 the pump admits FINAL over PREVIEW, oldest first", blenderTs.includes("const pa = (a.final ? 10 : 0) + Math.min(5, ageMin(a));") && blenderTs.includes("return pb - pa || a.enqueuedAt - b.enqueuedAt;"));

  const renderTs = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A4 a FINAL keeps the designed engine and parks", renderTs.includes("3D-WAIT: Blender - waiting for a 3D worker slot") && renderTs.includes("FINAL keeps the designed engine"));
  check("A5 the tick pumps the queue and fails a lost waiter honestly", renderTs.includes("pumpLocalWaiters();") && renderTs.includes("lost its 3D slot (the render server restarted)"));

  // ───────────────────── B. pure pool behavior over real spawns ─────────────────────
  process.env.ANIMEOS_RENDER_WORKERS = "2";
  check("B0 the cap reads live from the env", renderWorkers() === 2, `cap=${renderWorkers()}`);

  const a = smokePayload("e2e75-a", "PREVIEW", 0.9);   // short: its slot frees first
  const b = smokePayload("e2e75-b", "PREVIEW", 3.0);   // long: still holding its slot when a's frees
  const ra = submitLocalJob(a);
  const rb = submitLocalJob(b);
  check("B1 two workers spawn concurrently (the serial law is gone)", ra.submitted && rb.submitted, `a=${ra.submitted} b=${rb.submitted} err=${ra.error ?? rb.error ?? ""}`);

  const c = smokePayload("e2e75-c", "FINAL");
  const d = smokePayload("e2e75-d", "PREVIEW");
  const rc = submitLocalJob(c);
  const rd = submitLocalJob(d);
  check("B2 a full pool enqueues both (queued3d, honest positions)", !rc.submitted && rc.queued3d === true && (rc.position ?? 0) >= 1 && !rd.submitted && rd.queued3d === true, `c=${JSON.stringify(rc)} d=${JSON.stringify(rd)}`);
  check("B3 the pump admits nothing while the pool is full", pumpLocalWaiters().length === 0 && localWaitDepth() === 2);

  await waitState("e2e75-a", 120_000);
  check("B3b both workers are alive concurrently (two state files moving)", readState("e2e75-b") !== null);

  // a full render finishes -> its slot frees -> the pump admits by priority
  await waitDone("e2e75-a", 240_000);
  const admitted = pumpLocalWaiters();
  check("B4 the freed slot admits the FINAL first (priority law)", admitted.length === 1 && admitted[0] === "e2e75-c", JSON.stringify(admitted));
  check("B5 the PREVIEW keeps waiting", localWaitDepth() === 1);

  await waitDone("e2e75-b", 240_000);
  const admitted2 = pumpLocalWaiters();
  check("B6 the next freed slot admits the PREVIEW (the queue drains)", admitted2.length === 1 && admitted2[0] === "e2e75-d" && localWaitDepth() === 0);

  // let the two admitted renders finish before the studio-level test
  await waitDone("e2e75-c", 240_000);
  await waitDone("e2e75-d", 240_000);
  check("B7 both admitted renders completed (real clips from the pool)", isMp4(path.join(process.cwd(), "public", "renders", "e2e75-c.mp4")) && isMp4(path.join(process.cwd(), "public", "renders", "e2e75-d.mp4")));

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  check("C2 the owner's session reads live", (await call(ownerJar, "/api/projects")).status === 200);

  const created = await executeTool("throwaway", "create_project", { title: `Iter75 Pool Lab ${MARK}`, logline: "a throwaway production for the pool + priority proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the studio-level pool law ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Pool" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Queue hall", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Pool Blade Warden holds the hall - the designed engine finishes what it starts", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "DRAW", duration: 1.0 });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the overflow control - E2E Pool Blade Warden again", shotType: "MEDIUM", movement: "STATIC", duration: 1.0 });
  await db.project.update({ where: { id: labId }, data: { resolution: "640x360", fps: 12 } });

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const shot1 = shots.find((s) => s.number === 1);
  const shot2 = shots.find((s) => s.number === 2);
  if (!shot1 || !shot2) throw new Error("shots missing");

  // fill the pool with two real smokes
  const f1 = smokePayload("e2e75-f1", "PREVIEW");
  const f2 = smokePayload("e2e75-f2", "PREVIEW");
  check("D1 the pool refills for the studio test", submitLocalJob(f1).submitted && submitLocalJob(f2).submitted);

  const finalJob = await createRenderJob(labId, shot1.id, "FINAL");
  check("D2 the FINAL parks with the honest 3D-WAIT line (never the ffmpeg engine)", finalJob.driver === "BLENDER_LOCAL" && finalJob.stage.startsWith("3D-WAIT") && finalJob.stage.includes("FINAL keeps the designed engine"), `${finalJob.driver} ${finalJob.stage}`);

  const previewJob = await createRenderJob(labId, shot2.id, "PREVIEW");
  check("D3 the PREVIEW overflows to the MOTION engine (the overflow law holds)", previewJob.driver === "MOTION", `${previewJob.driver} ${previewJob.stage}`);
  // stop the motion job honestly and clean its artifacts
  await db.renderJob.update({ where: { id: previewJob.id }, data: { status: "FAILED", stage: "e2e cleanup - overflow proof done" } }).catch(() => {});

  // one smoke finishes -> the tick's pump admits the parked FINAL
  await new Promise((r) => setTimeout(r, 45_000));
  const t1 = Date.now();
  let done = null as Awaited<ReturnType<typeof db.renderJob.findUnique>> | null;
  while (Date.now() - t1 < 8 * 60_000) {
    done = await tickRenderJob(finalJob.id);
    if (done && done.status !== "RENDERING") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  check("D4 the parked FINAL is admitted by the tick and renders through the designed engine", done?.status === "REVIEW" && Boolean(done?.outputUrl) && isMp4(path.join(process.cwd(), "public", done?.outputUrl ?? "")), `${done?.status} ${done?.stage}`);
  check("D5 the finished clip is a real Blender clip (BLENDER_LOCAL driver)", done?.driver === "BLENDER_LOCAL", done?.driver ?? "none");

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  for (const id of ["e2e75-a", "e2e75-b", "e2e75-c", "e2e75-d", "e2e75-f1", "e2e75-f2"]) {
    const st = path.join(process.cwd(), "public", "renders", `.job-${id}.json`);
    if (existsSync(st)) unlinkSync(st);
    const clip = path.join(process.cwd(), "public", "renders", `${id}.mp4`);
    if (existsSync(clip)) unlinkSync(clip);
  }
  const gone = await db.project.findUnique({ where: { id: labId } });
  check("E1 the throwaway lab is gone (exact cleanup)", gone === null);
  check("E2 the standing productions still read", (await call(ownerJar, "/api/projects")).status === 200);

  squatter.close();
  console.log(`\n== ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

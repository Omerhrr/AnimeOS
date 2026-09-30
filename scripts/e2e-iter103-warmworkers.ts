// Iteration 103 E2E: THE WORKERS STAY WARM (the resident worker pool).
// Proves, against the RUNNING studio, the REAL bridge and REAL renders:
//   A. source: the pool worker mode + dispatch + cold fallback + the
//      served ledger in the bridge; the resident spawning the pool
//   B. real: the resident respawns WITH the pool (default 2); a REAL
//      production render completes; after the pool's one-time boot the
//      next REAL render rides a WARM worker (served >= 1) and the one
//      after reuses it (served >= 2) - the boot is paid once per
//      worker lifetime, not once per shot; the pool ledger counts
//      honestly; exact lab cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter103-warmworkers.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync, readFileSync as rf, existsSync, unlinkSync } from "node:fs";
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter103-warmworkers";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();
const RESIDENT_STATUS = "http://127.0.0.1:8101/status";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

interface PoolStatus { size: number; alive: number; free: number; busy: number; served: number }
async function residentStatus(): Promise<{ ok: boolean; busy: boolean; pool?: PoolStatus; scene?: string; blender_version?: string } | null> {
  try {
    const res = await fetch(RESIDENT_STATUS, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; busy: boolean; pool?: PoolStatus; scene?: string; blender_version?: string };
  } catch {
    return null;
  }
}

async function waitPoolFree(minFree: number, timeoutS: number): Promise<PoolStatus | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutS * 1000) {
    const st = await residentStatus();
    if (st?.pool && st.pool.free >= minFree) return st.pool;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

async function cleanupLab(labId: string): Promise<void> {
  for (const r of await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } })) {
    try { fs.unlinkSync(path.join(process.cwd(), "public", "renders", `.job-${r.id}.json`)); } catch { /* best effort */ }
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderJob.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.renderReview.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string } };
  if (res.ok) return { id: body.user?.id ?? "", role: body.user?.role ?? "" };
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

async function realRender(labId: string, shotId: string): Promise<{ ok: boolean; jobId: string | null; status: string }> {
  const job = await createRenderJob(labId, shotId, "PREVIEW");
  if (!job) return { ok: false, jobId: null, status: "no-job" };
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < 1200 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

async function run() {
  console.log(`== Iteration 103: the workers stay warm (phase: ${PHASE}) ==\n`);

  if (PHASE === "a" || PHASE === "all") {

  // ── A. the sources stand ──
  const src = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A1 the pool worker mode stands (loopback socket, one boot, the clean-scene purge)",
    src.includes("def pool_worker_main") && src.includes("read_factory_settings(use_empty=True)")
    && src.includes("pool_ready_path") && src.includes("pool worker ready on"));
  check("A2 the server dispatches warm above the proven cold path (the fallback never loses a job)",
    src.includes("def _run_warm") && src.includes('"--worker", "--job", job_file')
    && src.includes("settimeout(900)") && src.includes("cold fallback"));
  check("A3 the pool's ledger counts jobs served warm (a respawn keeps the slot's lifetime count)",
    src.includes('prev_served = (self.pool.get(port) or {}).get("served", 0)')
    && src.includes('"served": prev_served'));
  check("A4 the busy law: nothing is accepted only when no warm slot AND no cold slot is free",
    src.includes("busy = not (warm_free > 0 or cold_free)"));

  const rt = readFileSync("src/lib/blender/runtime.ts", "utf8");
  check("A5 the resident boots the pool (default 2, ANIMEOS_BRIDGE_WORKERS overrides, 0 = the cold-only law)",
    rt.includes('"--pool", String(poolSize)') && rt.includes('ANIMEOS_BRIDGE_WORKERS ?? "2"'));

  const smoke = readFileSync("scripts/blender-pool-smoke.py", "utf8");
  check("A6 the pool smoke stands (the reuse proof + the cold fallback over real renders)",
    smoke.includes("served=2 - the boot paid once") && smoke.includes("the cold fallback still renders"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A7 the registry stands at 90 tools (the pool is infrastructure)", toolCount === 90, `count=${toolCount}`);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {

  // ── B. the REAL resident with the pool ──
  // retire any resident from a previous lifetime (it predates the pool);
  // the studio's own runtime respawns it WITH the pool on the next submit
  const hostFile = path.join(process.cwd(), ".blender-runtime", "host.json");
  if (existsSync(hostFile)) {
    try {
      const host = JSON.parse(rf(hostFile, "utf8")) as { pid?: number };
      if (host.pid) execSync(`kill ${host.pid} 2>/dev/null || true`, { stdio: "ignore" });
    } catch { /* best effort */ }
    unlinkSync(hostFile);
  }
  try { execSync("pkill -f 'pw-port' 2>/dev/null || true", { stdio: "ignore" }); } catch { /* best effort */ }
  await new Promise((r) => setTimeout(r, 2000));

  // the lab
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: ownerLogin.role };
  const created = await executeTool("throwaway", "create_project", { title: `Iter103 WarmWorkers Lab ${MARK}`, logline: "the warm workers proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B1 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("lab missing");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  await T("create_episode", { title: "The Warm Arc", number: 1 });
  const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
  const scene = await db.scene.create({ data: { episodeId: epRow!.id, number: 1, title: "The Warm Cut" } });
  const shot = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "The warm worker shot", shotType: "MEDIUM", duration: 1.0, movement: "STATIC" } });
  check("B2 the one-shot lab stands", !!shot);

  // render 1: the resident respawns (with the pool booting behind it);
  // this render may honestly ride the COLD path while the workers boot
  const r1 = await realRender(labId, shot.id);
  check("B3 the first real render completed over the resident", r1.ok, r1.status.slice(0, 160));

  // the pool must be named by /status and finish its one-time boot
  const pool = await waitPoolFree(1, 180);
  check("B4 the resident's pool stood up (default size 2, a free warm slot after its one-time boot)",
    !!pool && pool.size === 2 && pool.free >= 1, JSON.stringify(pool));

  // render 2: rides a WARM worker (the served ledger earns its first job)
  const servedBefore = (await residentStatus())?.pool?.served ?? 0;
  const r2 = await realRender(labId, shot.id);
  const servedAfter = (await waitPoolFree(1, 120))?.served ?? -1;
  check("B5 the second real render completed AND rode a warm worker (served >= 1)",
    r2.ok && servedAfter >= servedBefore + 1, `r2=${r2.status.slice(0, 120)} served ${servedBefore} -> ${servedAfter}`);

  // render 3: the SAME worker lifetime serves again - the reuse proof in production
  const r3 = await realRender(labId, shot.id);
  const servedFinal = (await waitPoolFree(1, 120))?.served ?? -1;
  check("B6 the third real render reused the warm worker (served >= 2 - one boot, many shots)",
    r3.ok && servedFinal >= servedAfter + 1, `r3=${r3.status.slice(0, 120)} served -> ${servedFinal}`);
  check("B7 the clips are real (three output urls on the jobs)",
    r1.ok && r2.ok && r3.ok);

  // ── C. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("C1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 103 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

// Iteration 105 E2E: THE CLIP-LOSS RACE IS CLOSED (the wait watches the
// work, the finalize never lies, the belt names the loss).
// The render night lost a 903s clip to a chain of quiet lies: the warm
// wait's flat 900s socket gave up on a HEALTHY worker mid-render, the
// finalize marked the mid-render job file done with NO error and NO
// clip, and the tick landed a clipless REVIEW it never revisits.
// Proves, against the RUNNING studio, the REAL bridge and REAL renders:
//   A. source: the liveness wait law, the finalize truth law (both
//      warm and cold), the cold frame budget, the cache no-poison,
//      the TS belt
//   B. real: a healthy render completes; a warm worker KILLED
//      mid-render loses NOTHING (the stale law fires, the cold
//      fallback finishes the SAME job, the clip lands); a worker AND
//      its fallback both killed conclude with an honest NAMED failure
//      (never a clipless REVIEW); the studio stays healthy after the
//      carnage (the next render still completes); exact lab cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter105-cliprace.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync, existsSync } from "node:fs";
import fs from "fs";
import path from "path";
import { execSync } from "node:child_process";

// the resident must boot with the FAST stale law so the killed-worker
// scenarios resolve in seconds, not minutes (the env is inherited by
// the resident spawn - the python reads ANIMEOS_WARM_STALE_S itself)
process.env.ANIMEOS_WARM_STALE_S = process.env.ANIMEOS_WARM_STALE_S ?? "30";

const MARK = "iter105-cliprace";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

interface PoolStatus { size: number; alive: number; free: number; busy: number; served: number }
async function residentStatus(): Promise<{ ok: boolean; busy: boolean; pool?: PoolStatus } | null> {
  try {
    const res = await fetch("http://127.0.0.1:8101/status", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; busy: boolean; pool?: PoolStatus };
  } catch {
    return null;
  }
}

async function waitPoolSettled(timeoutS: number): Promise<PoolStatus | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutS * 1000) {
    const st = await residentStatus();
    if (st?.pool && st.pool.free >= 1) return st.pool;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

function jobFilePath(jobId: string): string {
  return path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
}

interface JobFileState { progress?: number; stage?: string; done?: boolean; error?: string | null; mp4Path?: string | null }
function readJobFile(jobId: string): JobFileState | null {
  try {
    return JSON.parse(fs.readFileSync(jobFilePath(jobId), "utf8")) as JobFileState;
  } catch {
    return null;
  }
}

/** The pool workers' pids, from the ready files (pid is the content). */
function poolWorkerPids(): Array<{ port: number; pid: number }> {
  const out: Array<{ port: number; pid: number }> = [];
  const dir = path.join(process.cwd(), "public", "renders");
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const m = f.match(/^\.pool-(\d+)\.ready$/);
    if (!m) continue;
    try {
      const pid = parseInt(fs.readFileSync(path.join(dir, f), "utf8").trim(), 10);
      if (Number.isFinite(pid) && pid > 0) out.push({ port: parseInt(m[1], 10), pid });
    } catch { /* best effort */ }
  }
  return out;
}

async function cleanupLab(labId: string): Promise<void> {
  for (const r of await db.renderJob.findMany({ where: { projectId: labId } })) {
    try { fs.unlinkSync(jobFilePath(r.id)); } catch { /* best effort */ }
    try { fs.unlinkSync(path.join(process.cwd(), "public", "renders", `${r.id}.mp4`)); } catch { /* best effort */ }
  }
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
  try {
    const res = await fetch("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
      body: JSON.stringify({ email, name, password }),
      signal: AbortSignal.timeout(4000),
    });
    const body = (await res.json()) as { user?: { id: string; role: string } };
    if (res.ok) return { id: body.user?.id ?? "", role: body.user?.role ?? "" };
  } catch { /* no dev server - the standing user row is the fallback */ }
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

/** Tick a job to its terminal state, observing the job file along the way. */
async function runToTerminal(jobId: string, capS: number): Promise<{ status: string; stage: string; outputUrl: string | null; file: JobFileState | null }> {
  const t0 = Date.now();
  let job = await tickRenderJob(jobId);
  let file = readJobFile(jobId);
  while (job && job.status === "RENDERING" && Date.now() - t0 < capS * 1000) {
    await new Promise((r) => setTimeout(r, 2000));
    job = await tickRenderJob(jobId);
    file = readJobFile(jobId);
  }
  return { status: job?.status ?? "?", stage: job?.stage ?? "", outputUrl: job?.outputUrl ?? null, file };
}

async function run() {
  console.log(`== Iteration 105: the clip-loss race is closed (phase: ${PHASE}) ==\n`);

  if (PHASE === "a" || PHASE === "all") {
    const src = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
    check("A1 the warm wait watches the WORK (the job file is the liveness truth, a flat socket cap is gone)",
      src.includes("WARM_STALE_S") && src.includes("_job_file_quiet_s")
      && src.includes("warm worker went quiet") && !src.includes("settimeout(900)"));
    check("A2 the finalize never lies (an unconcluded job lands done WITH an honest error, warm AND cold)",
      src.includes("THE FINALIZE NEVER LIES") && src.includes('state["error"] = err')
      && src.includes('"worker exited unexpectedly"')
      && !src.includes('state.setdefault("done", True)'));
    check("A3 the cold spawn's cap scales with the job's own frame budget (no flat 900s)",
      src.includes("def cold_budget_s") && src.includes("timeout=cold_budget_s(job_file, payload)")
      && src.includes("timeout=cold_budget_s(job_file)") && !src.includes("timeout=900"));
    check("A4 the mp4 cache never poisons (a failed read retries, never a permanent clipless done)",
      src.includes("THE CACHE NEVER POISONS"));
    check("A5 the worker announces the blender-writer encode (the liveness law reads the file)",
      src.includes("encoding clip (blender writer)"));

    const rt = readFileSync("src/lib/engine/render.ts", "utf8");
    check("A6 the TS belt: a done answer with no error and no bytes lands a NAMED FAILED (never a clipless REVIEW)",
      rt.includes("THE CLIP-LOSS BELT") && rt.includes("concluded without a clip"));
  }

  if (PHASE === "b" || PHASE === "all") {
    // retire any resident from a previous lifetime so THIS boot carries
    // the fast stale law (the env is inherited at spawn time)
    const hostFile = path.join(process.cwd(), ".blender-runtime", "host.json");
    if (existsSync(hostFile)) {
      try {
        const host = JSON.parse(fs.readFileSync(hostFile, "utf8")) as { pid?: number };
        if (host.pid) execSync(`kill ${host.pid} 2>/dev/null || true`, { stdio: "ignore" });
      } catch { /* best effort */ }
      try { fs.unlinkSync(hostFile); } catch { /* best effort */ }
    }
    try { execSync("pkill -f 'pw-port' 2>/dev/null || true", { stdio: "ignore" }); } catch { /* best effort */ }
    await new Promise((r) => setTimeout(r, 2000));

    for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
      console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
      await cleanupLab(stale.id);
    }
    const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
    const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: ownerLogin.role };
    const created = await executeTool("throwaway", "create_project", { title: `Iter105 ClipRace Lab ${MARK}`, logline: "the clip-loss race proof", visualStyle: "DONGHUA" }, ownerUser);
    check("B0 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
    const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
    if (!lab) throw new Error("lab missing");
    const labId = lab.id;
    const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
    await T("create_episode", { title: "The Lossless Arc", number: 1 });
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    const scene = await db.scene.create({ data: { episodeId: epRow!.id, number: 1, title: "The Lossless Cut" } });
    const shot = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "The clip-loss proof shot", shotType: "MEDIUM", duration: 1.0, movement: "STATIC" } });

    // B1: a healthy render over the freshly booted resident (may ride
    // cold while the pool boots - the regression law: the pipeline renders)
    const j1 = await createRenderJob(labId, shot.id, "PREVIEW");
    const r1 = await runToTerminal(j1.id, 900);
    check("B1 the healthy render completed WITH a clip (the pipeline's regression law)",
      r1.status === "REVIEW" && !!r1.outputUrl && r1.file?.done === true && !!r1.file.mp4Path,
      `${r1.status} ${r1.stage.slice(0, 120)} file=${JSON.stringify(r1.file ? { done: r1.file.done, error: r1.file.error, mp4: !!r1.file.mp4Path } : null)}`);
    const pool = await waitPoolSettled(240);
    check("B2 the pool stands after the boot (a free warm slot for the kill scenario)", !!pool, JSON.stringify(pool));

    // B3: THE DEAD WARM WORKER NEVER LOSES THE JOB - kill BOTH pool
    // workers mid-render; the wait's liveness law notices the quiet
    // job file (~20s), the stale law fires, the cold fallback finishes
    // the SAME job, and the clip LANDS (the old race lost it forever)
    const j2 = await createRenderJob(labId, shot.id, "PREVIEW");
    let sawFrames = false;
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await tickRenderJob(j2.id);
      const f = readJobFile(j2.id);
      if (f && typeof f.progress === "number" && f.progress > 0.08 && !f.done) { sawFrames = true; break; }
    }
    check("B3 the kill scenario's render is in flight (real frames flowing)", sawFrames, readJobFile(j2.id)?.stage ?? "no file");
    const pids = poolWorkerPids();
    for (const { pid } of pids) {
      try { execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* best effort */ }
    }
    console.log(`   (killed ${pids.length} warm worker(s) mid-render: ${pids.map((p) => p.pid).join(", ") || "none found"})`);
    const r2 = await runToTerminal(j2.id, 1500);
    check("B3b the killed worker's job STILL landed its clip (the stale law -> the cold fallback -> REVIEW with outputUrl)",
      r2.status === "REVIEW" && !!r2.outputUrl && r2.file?.done === true && !!r2.file.mp4Path,
      `${r2.status} ${r2.stage.slice(0, 140)} file=${JSON.stringify(r2.file ? { done: r2.file.done, error: r2.file.error, mp4: !!r2.file.mp4Path } : null)}`);

    // B4: THE FINALIZE NEVER LIES + THE BELT - kill the warm workers
    // AND the cold fallback; the job concludes with an honest NAMED
    // error (FAILED with the loss named, never a clipless REVIEW)
    const j3 = await createRenderJob(labId, shot.id, "PREVIEW");
    let restarted = false;
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await tickRenderJob(j3.id);
      const f = readJobFile(j3.id);
      if (f && typeof f.progress === "number" && f.progress > 0.08 && !f.done) { restarted = true; break; }
    }
    check("B4 the double-kill scenario's render is in flight", restarted, readJobFile(j3.id)?.stage ?? "no file");
    for (const { pid } of poolWorkerPids()) {
      try { execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* best effort */ }
    }
    // wait for the stale law to fire AND the cold fallback's child to
    // appear (a fresh `--worker --job .job-<id>.json` process), then
    // kill that child too - the fallback dies mid-render
    let fallbackKilled = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 240000 && !fallbackKilled) {
      await new Promise((r) => setTimeout(r, 3000));
      const f = readJobFile(j3.id);
      if (!f) continue;
      const restartedFresh = typeof f.progress === "number" && f.progress < 0.2 && !f.done;
      if (restartedFresh) {
        try {
          const out = execSync(`pgrep -f -- '--worker --job ${jobFilePath(j3.id)}' 2>/dev/null || true`).toString().trim();
          for (const pid of out.split("\n").filter(Boolean)) {
            execSync(`kill -9 ${pid} 2>/dev/null || true`, { stdio: "ignore" });
            fallbackKilled = true;
          }
        } catch { /* best effort */ }
      }
    }
    const r3 = await runToTerminal(j3.id, 600);
    check("B4b the double-kill concludes with an honest NAMED failure (FAILED with the error, never a clipless REVIEW)",
      fallbackKilled && r3.status === "FAILED" && r3.stage.length > 0 && !r3.outputUrl,
      `fallbackKilled=${fallbackKilled} ${r3.status} "${r3.stage.slice(0, 140)}" clip=${r3.outputUrl}`);

    // B5: THE STUDIO STAYS HEALTHY - after the carnage the next render
    // still completes with a clip (the cold path served it; the pool
    // respawns in the background)
    const j4 = await createRenderJob(labId, shot.id, "PREVIEW");
    const r4 = await runToTerminal(j4.id, 1200);
    check("B5 the next render after the carnage still completes WITH a clip (the studio never stays wounded)",
      r4.status === "REVIEW" && !!r4.outputUrl, `${r4.status} ${r4.stage.slice(0, 120)}`);

    // ── cleanup ──
    await cleanupLab(labId);
    const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
    check("B6 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 105 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

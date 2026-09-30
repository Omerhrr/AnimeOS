// Iteration 100 E2E: THE COST IS NAMED (the Performance Engine).
// Proves, against the RUNNING studio, the REAL database and the
// REAL finished render jobs:
//   A. source: the engine law (TS), the DSH tool, the registry at 90
//   B. pure: the frames law mirrored bit-exactly from the worker
//      (clamps, int truncation, Python's half-even rounding), the
//      reading law (wall / telemetry / wait / spf), the cohort-
//      relative verdict boundaries (HOLDS 2x, SLOW 3x, OVER beyond,
//      a cohort of one holds its own), the cohort + report rollups,
//      the honest line
//   C. accounts + throwaway production: a REAL shot vocabulary and
//      REAL finished render jobs (walls, telemetry spans, a FAILED
//      regression, an unfinished job) at fps 30 - the project's own
//      frame rate joins the law
//   D. the REAL loader: the cost ledger cell-by-cell exact (two
//      cohorts, the regression named, the SLOW tail watched, the
//      unfinished job honestly absent); the REAL production's own
//      finished jobs read (the cost was already paid - this names it)
//   E. the DSH tool reads the ledger (the OVER tail names the
//      regression by ref); the empty report names itself; the viewer
//      gate; exact cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter100-performance.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import {
  performanceFrames, performanceReadings, performanceVerdict, performanceCohorts, performanceReport, performanceLine,
  performanceData, PERF_FPS_DEFAULT,
  type PerformanceReading,
} from "../src/lib/engine/performance";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter100-performance";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

async function cleanupLab(labId: string): Promise<void> {
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderJob.deleteMany({ where: { projectId: labId } });
  await db.identityScore.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": `e2e-${MARK}` };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": `e2e-${MARK}` } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": `e2e-${MARK}`, cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

// ── the crafted lab walls: spf targets at fps 30 (S001 75 frames,
//    S002 120, S003 30) - the cohort lands 2.0/2.0/2.5/3.0/6.0/9.0 ──
const FPS = 30;
const FRAMES = { S1: 75, S2: 120, S3: 30 }; // max(2, round(duration * 30))
const wallFor = (spf: number, frames: number) => Math.round(spf * frames) * 1000; // ms
const tel = (ms: number | null) => (ms === null ? "{corrupt" : JSON.stringify({ spans: [{ provider: "BLENDER_LOCAL", ms, note: "local worker" }], takeovers: [], totalMs: ms, credits: 0 }));

async function run() {
  console.log(`== Iteration 100: the cost is named (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };

  if (PHASE === "b" || PHASE === "b2") {
    const labRow = await db.project.findFirst({ where: { title: { contains: MARK } } });
    if (!labRow) throw new Error(`phase ${PHASE}: the lab is missing - run PHASE=a first`);
    labId = labRow.id;
    const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
    ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
  }

  if (PHASE === "a" || PHASE === "all") {

  // ── A. the source stands ──
  const src = readFileSync("src/lib/engine/performance.ts", "utf8");
  check("A1 the engine law stands (frames, readings, verdict, cohorts, report, loader, line)",
    src.includes("export function performanceFrames") && src.includes("export function performanceReadings")
    && src.includes("export function performanceVerdict") && src.includes("export function performanceCohorts")
    && src.includes("export function performanceReport") && src.includes("export async function performanceData")
    && src.includes("export function performanceLine") && src.includes("PERF_FPS_DEFAULT"));
  check("A2 the frames law mirrors the WORKER (clamps, truncation, half-even rounding named)",
    src.includes("PERF_DURATION_MIN = 0.8") && src.includes("PERF_DURATION_MAX = 30.0")
    && src.includes("PERF_FPS_MIN = 1") && src.includes("PERF_FPS_MAX = 60")
    && src.includes("Math.trunc(fRaw)") && src.includes("pyRound") && src.includes("half to EVEN"));
  check("A3 the budget is the cohort's own median (never an invented constant)",
    src.includes("the budget is the cohort's own median") && src.includes("2 * cohortMedianSpf")
    && src.includes("3 * cohortMedianSpf") && src.includes("a regression needs a cohort"));
  check("A4 the p10 rides the matrix's own percentile law (one percentile across both ledgers)",
    src.includes("nearest-rank") && src.includes("Math.ceil(0.1 *"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry stands at 90 tools (the cost ledger joins by name)", toolCount === 90, `count=${toolCount}`);
  check("A6 the performance_report tool teaches THE COST IS NAMED",
    tools.includes('name: "performance_report"') && tools.includes("THE COST IS NAMED")
    && tools.includes("performanceData(projectId)") && tools.includes("performanceLine(r)"));

  // ── B. the pure laws ──
  check("B1 the frames law: the worker's numbers, bit-exact",
    performanceFrames(2.5, 24) === 60 && performanceFrames(4, 24) === 96 && performanceFrames(1, 24) === 24
    && performanceFrames(2.5, FPS) === FRAMES.S1 && performanceFrames(4, FPS) === FRAMES.S2 && performanceFrames(1, FPS) === FRAMES.S3);
  check("B2 the frames law: the clamps hold (duration 0.8..30, fps 1..60, the or-fallbacks)",
    performanceFrames(0.1, 24) === 19 && performanceFrames(999, 24) === 720
    && performanceFrames(4, 0.5) === 96 && performanceFrames(4, 0) === 96
    && performanceFrames(0, 24) === 72 && performanceFrames(999, 999) === 1800);
  check("B3 the frames law: the defaults and the truncation (fps 0 -> 24, int truncates)",
    performanceFrames(null, null) === 72 && performanceFrames(undefined, undefined) === 72
    && performanceFrames(4, 0) === 96 && performanceFrames(4, 23.9) === 92);
  check("B4 the frames law: Python's half-even rounding mirrored (96.5 -> 96, 97.5 -> 98)",
    performanceFrames(96.5 / 24, 24) === 96 && performanceFrames(97.5 / 24, 24) === 98
    && performanceFrames(2.5, 24) === 60 && performanceFrames(3.5, 24) === 84);
  check("B5 the default fps constant rides the worker's own default (24)", PERF_FPS_DEFAULT === 24);

  const raw = [
    { id: "J1", shotId: "s1", ref: "E1 Sc1 S001", mode: "PREVIEW", driver: "BLENDER_LOCAL", status: "REVIEW", attempt: 1, fixOfJobId: null, startedAt: new Date(0), finishedAt: new Date(wallFor(2.0, FRAMES.S1)), telemetry: tel(wallFor(2.0, FRAMES.S1) - 2000), durationSec: 2.5, fps: FPS },
    { id: "J2", shotId: "s2", ref: "E1 Sc1 S002", mode: "PREVIEW", driver: "BLENDER_LOCAL", status: "APPROVED", attempt: 1, fixOfJobId: null, startedAt: new Date(0), finishedAt: new Date(wallFor(2.0, FRAMES.S2)), telemetry: tel(wallFor(2.0, FRAMES.S2) - 2000), durationSec: 4, fps: FPS },
    { id: "J3", shotId: "s3", ref: "E1 Sc1 S003", mode: "PREVIEW", driver: "BLENDER_LOCAL", status: "REVIEW", attempt: 1, fixOfJobId: null, startedAt: new Date(0), finishedAt: new Date(wallFor(3.0, FRAMES.S3)), telemetry: null, durationSec: 1, fps: FPS },
  ];
  const readings = performanceReadings(raw);
  check("B6 the reading law: the wall, the frames, the spf exact",
    readings.length === 3 && readings[0].measuredMs === wallFor(2.0, FRAMES.S1) && readings[0].frames === FRAMES.S1
    && close(readings[0].spf, 2.0) && close(readings[1].spf, 2.0) && close(readings[2].spf, 3.0)
    && readings[0].waitMs === 2000 && readings[2].telemetryMs === null && readings[2].waitMs === null,
    JSON.stringify(readings.map((r) => ({ id: r.jobId, spf: r.spf, wait: r.waitMs }))));
  const garbled = performanceReadings([{ ...raw[0], id: "JG", telemetry: "{corrupt", status: "FAILED" }]);
  check("B7 the garbled telemetry reads honestly (no spans, no total, the wait named null)",
    garbled.length === 1 && garbled[0].telemetryMs === null && garbled[0].waitMs === null && garbled[0].status === "FAILED");
  const unfinished = performanceReadings([{ ...raw[0], id: "JU", finishedAt: null }, { ...raw[0], id: "JZ", startedAt: null }, { ...raw[0], id: "JNeg", startedAt: new Date(1000), finishedAt: new Date(500) }]);
  check("B8 the unspend walls never become readings (unfinished, never started, negative)",
    unfinished.length === 0);

  check("B9 the verdict law: HOLDS at 2x, SLOW at 3x, OVER beyond (the boundaries exact)",
    performanceVerdict(5.0, 2.5) === "HOLDS" && performanceVerdict(5.01, 2.5) === "SLOW"
    && performanceVerdict(7.5, 2.5) === "SLOW" && performanceVerdict(7.51, 2.5) === "OVER"
    && performanceVerdict(2.5, 2.5) === "HOLDS");
  check("B10 the verdict law: no median reads UNSCORED, a cohort of one holds its own",
    performanceVerdict(9.0, null) === "UNSCORED" && performanceVerdict(9.0, 0) === "UNSCORED"
    && performanceVerdict(4.0, 4.0) === "HOLDS");

  // the cohort + report over the crafted lab's exact shape
  const labReadings: PerformanceReading[] = [
    mk("J1", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 2.0, FRAMES.S1), mk("J2", "E1 Sc1 S002", "PREVIEW", "BLENDER_LOCAL", 2.0, FRAMES.S2),
    mk("J3", "E1 Sc1 S003", "PREVIEW", "BLENDER_LOCAL", 3.0, FRAMES.S3), mk("J5", "E1 Sc1 S002", "PREVIEW", "BLENDER_LOCAL", 2.5, FRAMES.S2),
    mk("J6", "E1 Sc1 S003", "PREVIEW", "BLENDER_LOCAL", 6.0, FRAMES.S3), mk("J4", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 9.0, FRAMES.S1),
    mk("J7", "E1 Sc1 S003", "FINAL", "MOTION", 1.25, FRAMES.S3),
  ];
  function mk(id: string, ref: string, mode: string, driver: string, spf: number, frames: number): PerformanceReading {
    return { jobId: id, shotId: null, ref, mode, driver, status: "REVIEW", attempt: 1, fixOfJobId: null, measuredMs: spf * frames * 1000, telemetryMs: null, waitMs: null, frames, spf, verdict: "UNSCORED" };
  }
  const cohorts = performanceCohorts(labReadings);
  check("B11 the cohorts: grouped by driver+mode, worst median first, the shape exact",
    cohorts.length === 2 && cohorts[0].driver === "BLENDER_LOCAL" && cohorts[0].mode === "PREVIEW"
    && cohorts[0].n === 6 && close(cohorts[0].medianSpf, 2.75) && close(cohorts[0].p10Spf, 2.0)
    && close(cohorts[0].worstSpf, 9.0) && close(cohorts[0].bestSpf, 2.0)
    && cohorts[0].totalFrames === 450 && cohorts[0].totalWallMs === 1635000
    && cohorts[1].driver === "MOTION" && cohorts[1].n === 1 && close(cohorts[1].medianSpf, 1.25),
    JSON.stringify(cohorts.map((c) => ({ k: `${c.driver}|${c.mode}`, n: c.n, med: c.medianSpf }))));
  check("B12 the verdicts judged against their OWN cohort's median",
    cohorts[0].readings.find((r) => r.jobId === "J4")!.verdict === "OVER"
    && cohorts[0].readings.find((r) => r.jobId === "J6")!.verdict === "SLOW"
    && cohorts[0].readings.find((r) => r.jobId === "J3")!.verdict === "HOLDS"
    && cohorts[1].readings[0].verdict === "HOLDS");
  const report = performanceReport(labReadings);
  check("B13 the report: the overall shape, the regressions and the tail named worst-first",
    report.measured === 7 && close(report.overall.medianSpf ?? -1, 2.5) && close(report.overall.p10Spf ?? -1, 1.25)
    && close(report.overall.worstSpf ?? -1, 9.0) && report.overall.totalFrames === 480
    && report.overall.totalWallMs === 1672500
    && report.over.length === 1 && report.over[0].jobId === "J4"
    && report.slow.length === 1 && report.slow[0].jobId === "J6",
    JSON.stringify({ over: report.over.map((r) => r.jobId), slow: report.slow.map((r) => r.jobId) }));
  const line = performanceLine(report);
  check("B14 the line reads honest (the shape, the cohort medians, the regression by ref)",
    line.includes("performance over 7 finished job(s)") && line.includes("median 2.50s/f")
    && line.includes("BLENDER_LOCAL/PREVIEW: 6 job(s), median 2.75s/f, p10 2.00s/f, worst 9.00s/f, 450 frame(s)")
    && line.includes("MOTION/FINAL: 1 job(s), median 1.25s/f")
    && line.includes("over: E1 Sc1 S001 at 9.00s/f") && line.includes(", 1 OVER"),
    line);
  const emptyLine = performanceLine(performanceReport([]));
  check("B15 the empty line names itself (nothing measured yet)",
    emptyLine.includes("nothing measured yet"), emptyLine);

  // ── C. the lab: a REAL production with REAL finished jobs ──
  const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
  ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
  check("C1 the owner stands", owner.id !== "" && owner.role === "OWNER", `role=${owner.role}`);

  const created = await executeTool("throwaway", "create_project", { title: `Iter100 Performance Lab ${MARK}`, logline: "a throwaway production for the performance engine proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C2 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  await db.project.update({ where: { id: labId }, data: { fps: FPS } });
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Cost Arc", count: 1 });
  check("C3 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Long Night" } });
  }
  const shotRows: Record<number, { id: string; duration: number }> = {};
  for (const d of [
    { number: 1, duration: 2.5 },
    { number: 2, duration: 4 },
    { number: 3, duration: 1 },
  ]) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: "The cost lab shot", shotType: "MEDIUM", duration: d.duration } });
    shotRows[d.number] = { id: s.id, duration: d.duration };
  }
  check("C4 the three-shot lab stands (2.5s / 4s / 1s)", Object.keys(shotRows).length === 3);

  const labFps = (await db.project.findUnique({ where: { id: labId }, select: { fps: true } }))?.fps ?? PERF_FPS_DEFAULT;
  check("C5 the lab carries its own fps (30) - the loader must join it", labFps === FPS, `fps=${labFps}`);

  const mkJob = async (id: string, shotNo: number, spf: number, opts: { status?: string; attempt?: number; fixOf?: string | null; telMs?: number | null; finished?: boolean } = {}) => {
    const frames = performanceFrames(shotRows[shotNo].duration, labFps);
    const wall = Math.round(spf * frames) * 1000;
    await db.renderJob.create({
      data: {
        id, projectId: labId, shotId: shotRows[shotNo].id, mode: id === "J7" ? "FINAL" : "PREVIEW",
        driver: id === "J7" ? "MOTION" : "BLENDER_LOCAL", status: opts.status ?? "REVIEW",
        attempt: opts.attempt ?? 1, fixOfJobId: opts.fixOf ?? null,
        startedAt: new Date(1000),
        finishedAt: opts.finished === false ? null : new Date(1000 + wall),
        telemetry: opts.finished === false ? null : tel(opts.telMs === undefined ? wall : opts.telMs),
      },
    });
  };
  await mkJob("J1", 1, 2.0, { telMs: wallFor(2.0, FRAMES.S1) - 2000 });
  await mkJob("J2", 2, 2.0, { status: "APPROVED", telMs: wallFor(2.0, FRAMES.S2) - 2000 });
  await mkJob("J3", 3, 3.0, { telMs: null });
  await mkJob("J4", 1, 9.0, { status: "FAILED", attempt: 2, fixOf: "J1", telMs: wallFor(9.0, FRAMES.S1) - 50000 });
  await mkJob("J5", 2, 2.5, { telMs: null });
  await mkJob("J6", 3, 6.0, { telMs: null });
  await mkJob("J7", 3, 1.2, { telMs: null });
  await mkJob("J8", 3, 5.0, { finished: false });
  check("C6 the eight lab jobs stand (seven finished, one unfinished)",
    (await db.renderJob.count({ where: { projectId: labId } })) === 8
    && (await db.renderJob.count({ where: { projectId: labId, finishedAt: { not: null } } })) === 7);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {

  // ── D. the REAL loader: the cost ledger over the lab ──
  const r = await performanceData(labId);
  check("D1 the loader read the seven finished jobs (the unfinished honestly absent)",
    r.measured === 7 && r.finished === 7, `measured=${r.measured}`);
  check("D2 the fps joined from the project row (30): the frames follow the worker's law at the lab's own rate",
    r.cohorts[0].totalFrames === 450 && r.overall.totalFrames === 480, `frames=${r.overall.totalFrames}`);
  check("D3 the cohort shape exact (the median is the proven budget)",
    r.cohorts.length === 2 && r.cohorts[0].driver === "BLENDER_LOCAL" && r.cohorts[0].mode === "PREVIEW"
    && r.cohorts[0].n === 6 && close(r.cohorts[0].medianSpf, 2.75) && close(r.cohorts[0].p10Spf, 2.0)
    && close(r.cohorts[0].worstSpf, 9.0) && r.cohorts[1].driver === "MOTION" && r.cohorts[1].n === 1
    && close(r.cohorts[1].medianSpf, 1.2),
    JSON.stringify(r.cohorts.map((c) => ({ k: `${c.driver}|${c.mode}`, med: c.medianSpf }))));
  check("D4 the regression named (the FAILED attempt's wall was still spent, the fix lineage rides)",
    r.over.length === 1 && r.over[0].jobId === "J4" && close(r.over[0].spf, 9.0)
    && r.over[0].status === "FAILED" && r.over[0].attempt === 2 && r.over[0].fixOfJobId === "J1"
    && r.over[0].ref === "E1 Sc1 S001" && close(r.over[0].waitMs ?? -1, 50000),
    JSON.stringify(r.over));
  check("D5 the SLOW tail watched, the body holding",
    r.slow.length === 1 && r.slow[0].jobId === "J6" && close(r.slow[0].spf, 6.0)
    && r.cohorts[0].readings.filter((x) => x.verdict === "HOLDS").length === 4);
  check("D6 the wait law: the wall minus the providers' accounting, named raw",
    close(r.over[0].waitMs ?? -1, 50000) && r.cohorts[0].readings.some((x) => x.waitMs === null && x.telemetryMs === null));
  check("D7 the overall shape (mixed cohorts, the median at 2.50s/f)",
    close(r.overall.medianSpf ?? -1, 2.5) && close(r.overall.bestSpf ?? -1, 1.2)
    && r.overall.totalWallMs === 1671000);

  // the REAL production's own finished jobs (the cost was already paid)
  const labProjectIds = (await db.project.findMany({ where: { title: { contains: MARK } }, select: { id: true } })).map((p) => p.id);
  const prod = await db.renderJob.findFirst({
    where: { finishedAt: { not: null }, projectId: { notIn: labProjectIds.length ? labProjectIds : ["-"] } },
    orderBy: { finishedAt: "desc" },
    select: { projectId: true, driver: true, mode: true },
  });
  if (prod) {
    const real = await performanceData(prod.projectId);
    check("D8 the REAL production's finished jobs read (the cost ledger over the real night)",
      real.measured >= 1 && real.cohorts.length >= 1 && real.cohorts[0].n >= 1
      && real.cohorts[0].readings.every((x) => Number.isFinite(x.spf) && x.spf > 0)
      && real.cohorts[0].driver === prod.driver && real.cohorts[0].mode === prod.mode,
      JSON.stringify({ measured: real.measured, cohorts: real.cohorts.map((c) => ({ k: `${c.driver}|${c.mode}`, n: c.n, med: c.medianSpf })) }));
    const realLine = performanceLine(real);
    check("D9 the real line reads honest", realLine.includes(`performance over ${real.measured} finished job(s)`), realLine.slice(0, 220));
  } else {
    check("D8 the REAL production's finished jobs read", false, "no non-lab finished job found");
  }

  // ── E. the DSH tool reads the ledger ──
  const tool = await executeTool(labId, "performance_report", {}, ownerUser);
  check("E1 the tool reads the ledger (OK, the shape, the regression named, the OVER tail)",
    tool.status === "OK" && tool.result.includes("PERFORMANCE REPORT:")
    && tool.result.includes("BLENDER_LOCAL/PREVIEW: 6 job(s), median 2.75s/f")
    && tool.result.includes("over: E1 Sc1 S001 at 9.00s/f")
    && tool.result.includes("The OVER jobs are the regressions by name"),
    tool.result.slice(0, 320));
  // the empty report names itself
  const emptyLab = await executeTool("throwaway", "create_project", { title: `Iter100 Empty Lab ${MARK}`, logline: "the empty cost ledger proof", visualStyle: "DONGHUA" }, ownerUser);
  const emptyRow = await db.project.findFirst({ where: { title: { contains: `Iter100 Empty Lab ${MARK}` } } });
  check("E2 the empty lab exists", emptyLab.status === "OK" && !!emptyRow);
  if (emptyRow) {
    const emptyTool = await executeTool(emptyRow.id, "performance_report", {}, ownerUser);
    check("E3 the empty report names itself (render a shot first)",
      emptyTool.status === "OK" && emptyTool.result.includes("nothing measured yet") && emptyTool.result.includes("Render a shot first"),
      emptyTool.result.slice(0, 220));
    await cleanupLab(emptyRow.id);
  }

  // the viewer gate
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("E4a the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER", `role=${viewerLogin.role}`);
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  check("E4b the viewer's session reads live", (await call(viewerJar, "/api/projects")).status === 200);
  const viewerWrite = await call(viewerJar, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E4c the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ── F. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  const jobLeftovers = await db.renderJob.count({ where: { projectId: labId } });
  check("F1 the lab is gone exactly (projects + jobs)", leftovers.length === 0 && jobLeftovers === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 100 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

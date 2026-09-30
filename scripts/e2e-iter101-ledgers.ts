// Iteration 101 E2E: THE LEDGERS RIDE THE SPINE.
// Proves, against the RUNNING studio, the REAL database and the REAL
// release machinery:
//   A. source: the cargo + night line in the engine, the episode
//      release gate in the matrix, the gate wired into the spine and
//      the render-night fire, the registry still at 90
//   B. pure: the cargo law (what rode the render), the cargo line
//      (the OVER anatomy), the night line (the window over the
//      ledger), the release refusal + check lines
//   C. accounts + throwaway production: a RELEASE episode, a HOLD
//      episode, an UNSCORED episode - real IdentityScore rows at the
//      five-axis law; finished render jobs with directed cargo
//   D. the REAL gate: the HOLD episode refused by the spine with the
//      dipping cells named, the UNSCORED episode refused honestly,
//      the RELEASE episode staged with the identity conformance check
//      riding the package and the PUBLISH event
//   E. the REAL render night: a REPAINT_QUEUE fire reads the night
//      cost line naming the OVER regression WITH ITS CARGO; the
//      PUBLISH_RUN cadence obeys the gate (SKIPPED on HOLD); the DSH
//      tool names what rode the render; the viewer gate; exact cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter101-ledgers.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { performanceCargo, performanceCargoLine, performanceNightLine, performanceFrames, performanceReport, performanceData, type PerformanceReading } from "../src/lib/engine/performance";
import { episodeReleaseVerdict, episodeReleaseRefusal, episodeReleaseCheckLine, type EpisodeReleaseRead } from "../src/lib/identity-matrix";
import { stagePublishPackage } from "../src/lib/comic/publish";
import { createSchedule, fireScheduleNow } from "../src/lib/scheduler";
import { readFileSync } from "node:fs";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter101-ledgers";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

async function cleanupLab(labId: string): Promise<void> {
  await db.studioSchedule.deleteMany({ where: { projectId: labId } });
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
  // the staged cut + package folder (the RELEASE episode's spine artifacts)
  try { fs.rmSync(path.join(process.cwd(), "public", "renders", "cuts", "e2e101ep1.mp4"), { force: true }); } catch { /* best effort */ }
  try { fs.rmSync(path.join(process.cwd(), "public", "renders", "cuts", "e2e101ep1.json"), { force: true }); } catch { /* best effort */ }
  try { fs.rmSync(path.join(process.cwd(), "public", "renders", "cuts", "packages", "EP01"), { recursive: true, force: true }); } catch { /* best effort */ }
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

// ── the lab walls: the same proven shape as iter100's lab (fps 30,
//    frames 75/120/30, cohort median 2.75, the FAILED attempt-2
//    regression at 9.00s/f, the SLOW tail at 6.00) - finished inside
//    the night window this time, so the night line can name them ──
const FPS = 30;
const FRAMES = { S1: 75, S2: 120, S3: 30 };
const wallFor = (spf: number, frames: number) => Math.round(spf * frames) * 1000;
const hourAgo = new Date(Date.now() - 3600_000);
const started = new Date(hourAgo.getTime() - 3600_000);
const tel = (spans: Array<{ provider: string; ms: number; note?: string }>, totalMs: number) =>
  JSON.stringify({ spans, takeovers: [], totalMs, credits: 0 });

function mk(id: string, ref: string, mode: string, driver: string, spf: number, frames: number, extra: Partial<PerformanceReading> = {}): PerformanceReading {
  return {
    jobId: id, shotId: null, ref, mode, driver, status: "REVIEW", attempt: 1, fixOfJobId: null,
    measuredMs: spf * frames * 1000, telemetryMs: null, waitMs: null, frames, spf, verdict: "UNSCORED",
    cargo: null, topSpans: [], finishedAt: new Date(spf * frames * 1000).toISOString(), ...extra,
  };
}

async function run() {
  console.log(`== Iteration 101: the ledgers ride the spine (phase: ${PHASE}) ==\n`);

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

  // ── A. the sources stand ──
  const perfSrc = readFileSync("src/lib/engine/performance.ts", "utf8");
  check("A1 the cargo + night laws stand in the engine",
    perfSrc.includes("export function performanceCargo") && perfSrc.includes("export function performanceCargoLine")
    && perfSrc.includes("export function performanceNightLine") && perfSrc.includes("WHAT RODE THE RENDER"));

  const matrixSrc = readFileSync("src/lib/identity-matrix.ts", "utf8");
  check("A2 the episode release gate stands in the matrix",
    matrixSrc.includes("export async function episodeReleaseVerdict")
    && matrixSrc.includes("export function episodeReleaseRefusal")
    && matrixSrc.includes("export function episodeReleaseCheckLine")
    && matrixSrc.includes("An episode does not publish on a HOLD distribution"));

  const publishSrc = readFileSync("src/lib/comic/publish.ts", "utf8");
  check("A3 the gate rides the spine (stagePublishPackage gates on RELEASE, before the cut lookup)",
    publishSrc.includes("episodePublishGate") && publishSrc.includes('gate.ok) return { ok: false, error: gate.error }')
    && publishSrc.indexOf("episodePublishGate") < publishSrc.indexOf("cutEvents = await db.productionEvent.findMany")
    && publishSrc.includes('"identity distribution"'));

  const schedSrc = readFileSync("src/lib/scheduler.ts", "utf8");
  check("A4 the render night reads its cost (the REPAINT_QUEUE fire carries the night line)",
    schedSrc.includes("nightCostLine") && schedSrc.includes("performanceNightLine")
    && schedSrc.includes("the cost read must never break the supervision fire"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry stands at 90 tools (the wires joined, no new tool needed)", toolCount === 90, `count=${toolCount}`);
  check("A6 the tools teach the new laws (the cargo naming, the spine's gate)",
    tools.includes("names WHAT RODE THE RENDER") && tools.includes("THE VERDICT THE RELEASE SPINE OBEYS")
    && tools.includes("the spine does not publish on it"));

  // ── B. the pure laws ──
  const cargo = performanceCargo({
    grammar: JSON.stringify([{ move: "DOLLY_IN" }, { move: "ORBIT" }]),
    fx: JSON.stringify([{ kind: "slash_trace" }]),
    physics: JSON.stringify([{ kind: "cloth" }]),
    dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The ridge holds.", kind: "SPEECH" }, { speaker: "Lin Yue", text: "(thought) hold", kind: "THOUGHT" }]),
    lipNote: "audio-driven lip-sync on Lin Yue (1 line, 5 visemes from 1 real take)",
  });
  check("B1 the cargo law: the directed counts, the speech lines only, the lip note",
    cargo === "2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync", cargo ?? "null");
  check("B2 the cargo law: corrupt JSON counts as nothing named, empty reads null (never invented)",
    performanceCargo({ grammar: "{corrupt", fx: null, physics: "not json", dialogue: null, lipNote: null }) === null
    && performanceCargo({ grammar: "[]", fx: "[]", physics: "[]", dialogue: "[]", lipNote: null }) === null);

  const overReading = mk("J4", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 9.0, FRAMES.S1, {
    status: "FAILED", attempt: 2, fixOfJobId: "J1",
    waitMs: 60000,
    cargo: "2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync",
    topSpans: [{ provider: "blender_local", ms: 605000 }, { provider: "orchestrator", ms: 10000 }],
  });
  const overLine = performanceCargoLine(overReading);
  check("B3 the OVER anatomy: the ref, the cost, the wall/frames/wait, the fix lineage, the cargo, the spans worst-first",
    overLine.includes("E1 Sc1 S001 at 9.00s/f") && overLine.includes("preview blender_local")
    && overLine.includes("wall, 75 frame(s), wait 1.0min, fix of attempt 1")
    && overLine.includes("; rode: 2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync")
    && overLine.includes("; spans: blender_local 10.1min > orchestrator 10s"),
    overLine);
  const stockLine = performanceCargoLine(mk("J9", "E1 Sc1 S002", "FINAL", "MOTION", 2.0, FRAMES.S3, { fixOfJobId: null }));
  check("B4 the stock pass names itself (no cargo invented)",
    stockLine.includes("; rode: the stock pass (no directed cargo)") && !stockLine.includes("fix of"), stockLine);

  const night = performanceNightLine(performanceReport([
      mk("J1", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 2.0, FRAMES.S1, { finishedAt: hourAgo.toISOString() }),
      mk("J2", "E1 Sc1 S002", "PREVIEW", "BLENDER_LOCAL", 2.0, FRAMES.S2, { finishedAt: hourAgo.toISOString() }),
      mk("J3", "E1 Sc1 S003", "PREVIEW", "BLENDER_LOCAL", 3.0, FRAMES.S3, { finishedAt: hourAgo.toISOString() }),
      mk("J5", "E1 Sc1 S002", "PREVIEW", "BLENDER_LOCAL", 2.5, FRAMES.S2, { finishedAt: hourAgo.toISOString() }),
      mk("J6", "E1 Sc1 S003", "PREVIEW", "BLENDER_LOCAL", 6.0, FRAMES.S3, { finishedAt: hourAgo.toISOString() }),
      mk("J4", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 9.0, FRAMES.S1, { finishedAt: hourAgo.toISOString(), status: "FAILED", attempt: 2, fixOfJobId: "J1", waitMs: 60000, cargo: "2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync", topSpans: [{ provider: "blender_local", ms: 605000 }, { provider: "orchestrator", ms: 10000 }] }),
      mk("JOLD", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 2.0, FRAMES.S1, { finishedAt: new Date(Date.now() - 48 * 3600_000).toISOString() }),
    ]), 24, new Date(hourAgo.getTime() + 1800_000));
  check("B5 the night line: the window counts the night's jobs (the 48h-old job excluded), the ledger shape rides",
    night.includes("night cost read: 6 finished in the last 24h (") && night.includes("wall, 450 frame(s))")
    && night.includes("ledger median 2.50s/f, worst 9.00s/f"),
    night);
  check("B6 the night line NAMES what rode the render (the regression's cargo + spans)",
    night.includes("over: E1 Sc1 S001 at 9.00s/f") && night.includes("rode: 2 grammar beat(s)")
    && night.includes("spans: blender_local 10.1min > orchestrator 10s") && night.includes("slow tail: 1 job(s) watched"),
    night);
  check("B7 the honest absences: nothing measured reads an empty line, a quiet night names itself",
    performanceNightLine(performanceReport([])) === ""
    && performanceNightLine(performanceReport([mk("J1", "E1 Sc1 S001", "PREVIEW", "BLENDER_LOCAL", 2.0, FRAMES.S1, { finishedAt: new Date(Date.now() - 48 * 3600_000).toISOString() })])).includes("nothing finished in the last 24h"));

  const holdRead: EpisodeReleaseRead = {
    episodeId: "ep2", source: "RENDER", floor: 0.7, readings: 6, verdict: "HOLD",
    overall: { key: "overall", n: 6, mean: 0.7867, median: 0.835, p10: 0.52, worst: 0.52, best: 0.86, belowFloor: 1, belowFraction: 1 / 6, verdict: "HOLD", worstRef: "E2 Sc1 S003" },
    blocking: [{ key: "close", n: 2, mean: 0.685, median: 0.685, p10: 0.52, worst: 0.52, best: 0.85, belowFloor: 1, belowFraction: 0.5, verdict: "HOLD", worstRef: "E2 Sc1 S003" }],
  };
  const holdRefusal = episodeReleaseRefusal(holdRead, "EP02");
  check("B8 the HOLD refusal: the verdict, the shape, the dipping cell by name with its worst ref, the law itself",
    holdRefusal.includes("EP02's identity distribution HOLDS at the release floor")
    && holdRefusal.includes("the tail dips under 70%") && holdRefusal.includes("p10 52%")
    && holdRefusal.includes("close - HOLD, p10 52% (worst at E2 Sc1 S003)")
    && holdRefusal.includes("An episode does not publish on a HOLD distribution"),
    holdRefusal);
  const belowRead: EpisodeReleaseRead = { ...holdRead, verdict: "BELOW", overall: { ...holdRead.overall, mean: 0.55, median: 0.54, p10: 0.52, verdict: "BELOW" } };
  const belowRefusal = episodeReleaseRefusal(belowRead, "EP03");
  check("B9 the BELOW refusal: the body itself is under",
    belowRefusal.includes("sits BELOW the release floor") && belowRefusal.includes("mean 55%, median 54%")
    && belowRefusal.includes("does not publish BELOW the floor"), belowRefusal);
  const unscoredRefusal = episodeReleaseRefusal({ ...holdRead, verdict: "UNSCORED", readings: 0, overall: { ...holdRead.overall, n: 0, mean: null, median: null, p10: null, verdict: "UNSCORED" }, blocking: [] }, "EP04");
  check("B10 the UNSCORED refusal: nothing measured, the spine does not guess - the pointer rides",
    unscoredRefusal.includes("carries no scored identity readings") && unscoredRefusal.includes("the release spine does not guess a release")
    && unscoredRefusal.includes("measure_identity_bar"), unscoredRefusal);
  const releaseCheck = episodeReleaseCheckLine({
    episodeId: "ep1", source: "RENDER", floor: 0.7, readings: 6, verdict: "RELEASE",
    overall: { key: "overall", n: 6, mean: 0.88, median: 0.875, p10: 0.85, worst: 0.85, best: 0.92, belowFloor: 0, belowFraction: 0, verdict: "RELEASE", worstRef: null },
    blocking: [],
  });
  check("B11 the RELEASE check line (the conformance entry the package carries)",
    releaseCheck.includes("identity distribution RELEASES - p10 85%, mean 88%, median 88% over 6 reading(s), floor 70%"), releaseCheck);

  const perfFrames = performanceFrames(2.5, FPS);
  check("B12 the frames law still mirrors the worker (the night reads the frames it owes)", perfFrames === 75);

  // ── C. the lab: a REAL production with three episodes and real readings ──
  const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
  ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
  const created = await executeTool("throwaway", "create_project", { title: `Iter101 Ledgers Lab ${MARK}`, logline: "a throwaway production for the ledger-spine proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C1 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  await db.project.update({ where: { id: labId }, data: { fps: FPS } });
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  let epOk = true;
  for (const n of [1, 2, 3]) {
    const ep = await T("create_episode", { title: n === 1 ? "The Ledger Arc" : `The Holding Arc ${n}`, number: n });
    if (ep.status !== "OK") epOk = false;
  }
  check("C2 the three episodes exist", epOk);
  const epRows = await db.episode.findMany({ where: { season: { projectId: labId } }, orderBy: { number: "asc" } });
  check("C3 the episodes number 1..3 (RELEASE / HOLD / UNSCORED)", epRows.length === 3 && epRows[0].number === 1 && epRows[2].number === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });
  const rival = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "RIVAL" } });
  check("C4 the cast anchored (Lin Yue + Bai Ling)", hero.id !== "" && rival.id !== "");

  // shots per episode: S001 WIDE, S002 MEDIUM, S003 CLOSEUP (the close cell is where a tail dips)
  for (const epRow of epRows) {
    const scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: `Scene of EP${epRow.number}` } });
    for (const d of [
      { number: 1, shotType: "WIDE" },
      { number: 2, shotType: "MEDIUM" },
      { number: 3, shotType: "CLOSEUP" },
    ]) {
      await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: "The ledger lab shot", shotType: d.shotType, movement: "DOLLY_IN", duration: d.number === 1 ? 2.5 : d.number === 2 ? 4 : 1 } });
    }
  }
  const shotCount = await db.shot.count({ where: { scene: { episode: { season: { projectId: labId } } } } });
  check("C5 the nine-shot lab stands (three framings per episode)", shotCount === 9, `shots=${shotCount}`);

  // EP01: every reading clears - RELEASE (p10 0.85, mean 0.88)
  const labShots = await db.shot.findMany({ where: { scene: { episode: { season: { projectId: labId } } } }, include: { scene: { include: { episode: { select: { number: true } } } } }, orderBy: [{ scene: { number: "asc" } }, { number: "asc" }] });
  const epShots = (epNo: number) => labShots.filter((s) => s.scene.episode.number === epNo).sort((a, b) => a.number - b.number);
  const ep1Scores = [[0.85, 0.88], [0.9, 0.87], [0.92, 0.86]];
  for (let i = 0; i < 3; i++) {
    const entries = [
      { characterName: "Lin Yue", similarity: ep1Scores[i][0] },
      { characterName: "Bai Ling", similarity: ep1Scores[i][1] },
    ];
    await db.identityScore.create({ data: { projectId: labId, shotId: epShots(1)[i].id, source: "RENDER", scores: JSON.stringify(entries), worst: Math.min(...ep1Scores[i]), castSize: 2, note: "iter101 ledger lab (release)" } });
  }
  // EP02: the body clears, the closeup tail dips to 0.52 - HOLD
  const ep2Scores = [[0.84, 0.82], [0.83, 0.86], [0.52, 0.85]];
  for (let i = 0; i < 3; i++) {
    const entries = [
      { characterName: "Lin Yue", similarity: ep2Scores[i][0] },
      { characterName: "Bai Ling", similarity: ep2Scores[i][1] },
    ];
    await db.identityScore.create({ data: { projectId: labId, shotId: epShots(2)[i].id, source: "RENDER", scores: JSON.stringify(entries), worst: Math.min(...ep2Scores[i]), castSize: 2, note: "iter101 ledger lab (hold)" } });
  }
  // EP03: nothing scored - UNSCORED
  check("C6 the six reading rows stand over two episodes (the third honestly unscored)",
    (await db.identityScore.count({ where: { projectId: labId, source: "RENDER" } })) === 6);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {

  // the lab resumed: the episodes and shots re-read by number (the phase-a craft stands)
  const epRows = await db.episode.findMany({ where: { season: { projectId: labId } }, orderBy: { number: "asc" } });
  const labShots = await db.shot.findMany({ where: { scene: { episode: { season: { projectId: labId } } } }, include: { scene: { include: { episode: { select: { number: true } } } } }, orderBy: [{ scene: { number: "asc" } }, { number: "asc" }] });
  const epShots = (epNo: number) => labShots.filter((s) => s.scene.episode.number === epNo).sort((a, b) => a.number - b.number);
  const shotsByEp: Record<number, Array<{ id: string; shotType: string; number: number }>> = { 1: [], 2: [], 3: [] };
  for (const epNo of [1, 2, 3]) {
    shotsByEp[epNo] = epShots(epNo).map((s) => ({ id: s.id, shotType: s.shotType, number: s.number }));
  }
  check("C0 the lab resumed (three episodes, nine shots, six readings)",
    epRows.length === 3 && shotsByEp[1].length === 3 && shotsByEp[2].length === 3
    && (await db.identityScore.count({ where: { projectId: labId, source: "RENDER" } })) === 6);

  // ── D. the REAL gate: the verdicts at the episode grain ──
  const rel1 = await episodeReleaseVerdict(labId, epRows[0].id);
  check("D1 EP01 RELEASES (p10 0.85 and mean 0.88 clear the 0.70 floor)",
    rel1.verdict === "RELEASE" && close(rel1.overall.p10 ?? -1, 0.85) && close(rel1.overall.mean ?? -1, (0.85 + 0.88 + 0.9 + 0.87 + 0.92 + 0.86) / 6)
    && rel1.readings === 6 && rel1.blocking.length === 0,
    JSON.stringify({ v: rel1.verdict, p10: rel1.overall.p10, mean: rel1.overall.mean }));
  const rel2 = await episodeReleaseVerdict(labId, epRows[1].id);
  const closeCell = rel2.blocking.find((c) => c.key === "close");
  check("D2 EP02 HOLDS (the body clears, the tail dips to 0.52); the close cell itself reads BELOW (its two-reading body sits under) while the EPISODE verdict is HOLD",
    rel2.verdict === "HOLD" && close(rel2.overall.p10 ?? -1, 0.52) && close(rel2.overall.mean ?? -1, (0.84 + 0.82 + 0.83 + 0.86 + 0.52 + 0.85) / 6)
    && rel2.blocking.length >= 1 && !!closeCell && closeCell.verdict === "BELOW"
    && close(closeCell.p10 ?? -1, 0.52) && close(closeCell.mean ?? -1, (0.52 + 0.85) / 2)
    && closeCell.worstRef === "E2 Sc1 S003",
    JSON.stringify({ v: rel2.verdict, p10: rel2.overall.p10, blocking: rel2.blocking.map((c) => c.key) }));
  const rel3 = await episodeReleaseVerdict(labId, epRows[2].id);
  check("D3 EP03 is honestly UNSCORED", rel3.verdict === "UNSCORED" && rel3.readings === 0);

  // the spine obeys: HOLD refuses, UNSCORED refuses, RELEASE stages
  const refusedHold = await stagePublishPackage(epRows[1].id, "YOUTUBE");
  check("D4 the spine refuses the HOLD episode with the dipping cells named (the gate sits BEFORE the cut lookup)",
    !refusedHold.ok && refusedHold.error.includes("does not publish on a HOLD distribution")
    && refusedHold.error.includes("close - BELOW, p10 52% (worst at E2 Sc1 S003)"),
    refusedHold.ok ? "staged" : refusedHold.error.slice(0, 520));
  const refusedUnscored = await stagePublishPackage(epRows[2].id, "YOUTUBE");
  check("D5 the spine refuses the UNSCORED episode honestly (nothing measured - never guessed)",
    !refusedUnscored.ok && refusedUnscored.error.includes("carries no scored identity readings"),
    refusedUnscored.ok ? "staged" : refusedUnscored.error.slice(0, 160));
  check("D6 the refused episodes landed NO PUBLISH events (a refusal is not a staging)",
    (await db.productionEvent.count({ where: { projectId: labId, type: "PUBLISH" } })) === 0);

  // the RELEASE episode stages: cut event + a REAL cut file + manifest on the spine
  const cutsDir = path.join(process.cwd(), "public", "renders", "cuts");
  fs.mkdirSync(cutsDir, { recursive: true });
  const { execSync } = await import("node:child_process");
  execSync(`${"ffmpeg"} -y -loglevel error -f lavfi -i color=c=black:s=1920x1080:d=1 -r 24 -pix_fmt yuv420p "${path.join(cutsDir, "e2e101ep1.mp4")}"`, { timeout: 60000 });
  fs.writeFileSync(path.join(cutsDir, "e2e101ep1.json"), JSON.stringify({ shots: [] }));
  await db.productionEvent.create({
    data: {
      projectId: labId, actor: "USER", type: "RENDER",
      summary: "Episode cut muxed - EP01 The Ledger Arc",
      payload: JSON.stringify({ url: "/renders/cuts/e2e101ep1.mp4" }),
    },
  });
  const staged = await stagePublishPackage(epRows[0].id, "YOUTUBE");
  check("D7 the RELEASE episode stages (the gate opens on RELEASE)",
    staged.ok, staged.ok ? "" : staged.error.slice(0, 220));
  if (staged.ok) {
    const identityCheck = staged.pkg.conformance.find((c) => c.label === "identity distribution");
    check("D8 the identity conformance check rides the package (RELEASES, the shape named)",
      !!identityCheck && identityCheck.ok && identityCheck.detail.includes("RELEASES - p10 85%")
      && identityCheck.detail.includes("floor 70%"),
      identityCheck?.detail ?? "missing");
    check("D9 the checklist carries the gate's pass and the package is ready only when all checks hold",
      staged.pkg.checklist.some((l) => l.includes("identity matrix: RELEASES")) && staged.pkg.ready === staged.pkg.conformance.every((c) => c.ok));
  }
  const publishEvents = await db.productionEvent.findMany({ where: { projectId: labId, type: "PUBLISH" } });
  const pubPayload = publishEvents.length === 1 ? (JSON.parse(publishEvents[0].payload ?? "{}") as { identity?: { verdict?: string }; ready?: boolean }) : {};
  check("D10 the PUBLISH event carries the matrix's verdict in its payload",
    publishEvents.length === 1 && pubPayload.identity?.verdict === "RELEASE" && pubPayload.ready === true,
    JSON.stringify(pubPayload.identity ?? {}));

  // ── E. the REAL render night: the fire reads its cost line ──
  const shotDur = (shotNo: number) => (shotNo === 1 ? 2.5 : shotNo === 2 ? 4 : 1);
  const mkJob = async (id: string, epNo: number, shotNo: number, spf: number, opts: { status?: string; attempt?: number; fixOf?: string | null; spans?: Array<{ provider: string; ms: number; note?: string }>; totalMs?: number; lipNote?: string | null } = {}) => {
    const shot = shotsByEp[epNo][shotNo - 1];
    const frames = performanceFrames(shotDur(shotNo), FPS);
    const wall = Math.round(spf * frames) * 1000;
    await db.renderJob.create({
      data: {
        id, projectId: labId, shotId: shot.id, mode: "PREVIEW", driver: "BLENDER_LOCAL",
        status: opts.status ?? "REVIEW", attempt: opts.attempt ?? 1, fixOfJobId: opts.fixOf ?? null,
        startedAt: started, finishedAt: new Date(started.getTime() + wall),
        telemetry: opts.spans ? tel(opts.spans, opts.totalMs ?? wall) : null,
        lipNote: opts.lipNote ?? null,
      },
    });
    return { id, frames, wall };
  };
  // give the regression's shot its directed cargo (grammar + fx + solver + speech + lip-sync)
  const regShot = shotsByEp[1][0];
  await db.shot.update({
    where: { id: regShot.id },
    data: {
      grammar: JSON.stringify([{ move: "DOLLY_IN", from: 0, to: 1 }, { move: "ORBIT", from: 1, to: 2 }]),
      fx: JSON.stringify([{ kind: "slash_trace", color: "#7fd4ff" }]),
      physics: JSON.stringify([{ kind: "cloth", intensity: 0.6 }]),
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The ridge holds.", kind: "SPEECH" }]),
    },
  });
  await mkJob("K1", 1, 1, 2.0);
  await mkJob("K2", 1, 2, 2.0);
  await mkJob("K3", 1, 3, 3.0);
  await mkJob("K4", 1, 1, 9.0, {
    status: "FAILED", attempt: 2, fixOf: "K1", lipNote: "audio-driven lip-sync on Lin Yue (1 line, 5 visemes from 1 real take)",
    spans: [{ provider: "blender_local", ms: 605000, note: "local worker" }, { provider: "orchestrator", ms: 10000, note: "queue+orchestration" }],
    totalMs: 615000,
  });
  await mkJob("K5", 1, 2, 2.5);
  await mkJob("K6", 1, 3, 6.0);
  check("E1 the six finished night jobs stand (five holding-or-slow, one regression)",
    (await db.renderJob.count({ where: { projectId: labId, finishedAt: { not: null } } })) === 6);

  const nightReport = await performanceData(labId);
  check("E2 the ledger over the night jobs: the cohort median 2.75, the regression OVER at 9.00 with its cargo",
    nightReport.measured === 6 && close(nightReport.cohorts[0].medianSpf, 2.75)
    && nightReport.over.length === 1 && nightReport.over[0].jobId === "K4"
    && nightReport.over[0].cargo === "2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync"
    && nightReport.over[0].topSpans.length === 2 && nightReport.over[0].topSpans[0].provider === "blender_local",
    JSON.stringify({ measured: nightReport.measured, cohorts: nightReport.cohorts.map((c) => ({ n: c.n, med: c.medianSpf, spfs: c.readings.map((x) => x.spf) })), over: nightReport.over }));

  const nightSchedule = await createSchedule(labId, { name: "Render Night", kind: "REPAINT_QUEUE", cadence: "DAILY", hourUtc: 2 });
  check("E3 the render-night schedule registered", nightSchedule.ok, nightSchedule.ok ? "" : nightSchedule.error ?? "");
  if (nightSchedule.ok) {
    const fire = await fireScheduleNow(nightSchedule.schedule.id);
    check("E4 the night fire reads its cost line (the window, the regression NAMING WHAT RODE THE RENDER)",
      fire.ok && fire.report?.includes("night cost read:") && fire.report?.includes("finished in the last 24h")
      && fire.report?.includes("E1 Sc1 S001 at 9.00s/f") && fire.report?.includes("rode: 2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync")
      && fire.report?.includes("spans: blender_local 10.1min > orchestrator 10s") && fire.report?.includes("fix of attempt 1"),
      fire.report ?? fire.error ?? "no report");
    check("E5 the fire's status is honest (the queue was clean; the cost read rides whatever the supervision did)",
      fire.status === "SKIPPED" || fire.status === "OK", `status=${fire.status}`);
  }

  // the cadence obeys the gate: a PUBLISH_RUN on the HOLD episode skips
  const pubSchedule = await createSchedule(labId, { name: "Weekly Slip", kind: "PUBLISH_RUN", publishEpisode: 2, publishPlatform: "YOUTUBE", cadence: "WEEKLY", weekday: 1, hourUtc: 3 });
  check("E6 the PUBLISH_RUN cadence registered for the HOLD episode", pubSchedule.ok, pubSchedule.ok ? "" : pubSchedule.error ?? "");
  if (pubSchedule.ok) {
    const fire = await fireScheduleNow(pubSchedule.schedule.id);
    check("E7 the cadence refuses to publish on a HOLD distribution (SKIPPED with the work order)",
      fire.ok && fire.status === "SKIPPED" && fire.report?.includes("does not publish on a HOLD distribution"),
      `${fire.status}: ${fire.report?.slice(0, 160) ?? fire.error}`);
  }

  const tool = await executeTool(labId, "performance_report", {}, ownerUser);
  check("E8 the DSH tool names what rode the render (the cargo, the spans, the tail teaching)",
    tool.status === "OK" && tool.result.includes("over: E1 Sc1 S001 at 9.00s/f")
    && tool.result.includes("rode: 2 grammar beat(s), 1 fx, 1 solver call(s), speech 1 line(s), lip-sync")
    && tool.result.includes("each names WHAT RODE THE RENDER"),
    tool.result.slice(0, 340));

  // the viewer gate
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("E9a the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER", `role=${viewerLogin.role}`);
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  check("E9b the viewer's session reads live", (await call(viewerJar, "/api/projects")).status === 200);
  const viewerWrite = await call(viewerJar, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E9c the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ── F. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  const jobLeftovers = await db.renderJob.count({ where: { projectId: labId } });
  const schedLeftovers = await db.studioSchedule.count({ where: { projectId: labId } });
  check("F1 the lab is gone exactly (projects + jobs + schedules)", leftovers.length === 0 && jobLeftovers === 0 && schedLeftovers === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 101 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

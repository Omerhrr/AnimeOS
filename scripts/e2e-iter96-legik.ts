// Iteration 96 E2E: THE FEET STAY PLANTED (the two-bone leg IK over
// the shot pose vocabulary). Proves, against the RUNNING studio, the
// REAL database, the REAL render pipeline and the REAL worker:
//   A. source: the pure law (TS), the worker mirror, the apply_pose
//      integration, the state evidence hooks
//   B. pure: the solve law (the named frontier CROUCH/RISE/FALL,
//      the fold law, the plant law, the clearance law), the
//      canonical key + hash determinism
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the DETERMINED pair CROUCH->RISE renders with
//      the rig's legIk hash matching the TS law BIT-EXACTLY over the
//      real render, the table naming the readings' penetration
//      before AND after, the applied report proving every frame
//      solved with zero residual; the WS lands the SAME law hash
//      (the lens resolves, never rewrites); the STANCE->LEAP clip
//      stays honest (nothing penetrated, nothing solved)
//   E. the viewer gate; cleanup
// Run: PHASE=a|b npx tsx scripts/e2e-iter96-legik.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import {
  LEG_IK, LEG_IK_VERSION, footDrop, solveLegIk, legIkTable, legIkKey, legIkHash, legIkLine,
} from "../src/lib/animation/leg-ik";
import { POSE_JOINTS, POSES } from "../src/lib/animation/poses";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter96-legik";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": `e2e-${MARK}` };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
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

async function cleanupLab(labId: string): Promise<void> {
  const labJobs = await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  for (const r of labJobs) {
    if (r.outputUrl) {
      const p = path.join(process.cwd(), "public", r.outputUrl);
      if (existsSync(p)) unlinkSync(p);
    }
    const st = path.join(process.cwd(), "public", "renders", `.job-${r.id}.json`);
    if (existsSync(st)) unlinkSync(st);
    const postersDir = path.join(process.cwd(), "public", "renders", "posters");
    for (const f of [`${r.id}.jpg`, `${r.id}.strip.jpg`, `${r.id}.strip0.jpg`, `${r.id}.strip1.jpg`, `${r.id}.strip2.jpg`]) {
      const p = path.join(postersDir, f);
      if (existsSync(p)) unlinkSync(p);
    }
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderReview.deleteMany({ where: { projectId: labId } });
  await db.identityScore.deleteMany({ where: { projectId: labId } });
  await db.motionFlow.deleteMany({ where: { projectId: labId } });
  await db.audioCue.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.sequenceFlow.deleteMany({ where: { projectId: labId } });
  await db.designPreset.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.continuityEvent.deleteMany({ where: { projectId: labId } });
  await db.characterAsset.deleteMany({ where: { projectId: labId } });
  const labChars = await db.character.findMany({ where: { projectId: labId } });
  for (const c of labChars) {
    const sheetPath = path.join(process.cwd(), "public", "sheets", `${c.id}.png`);
    if (existsSync(sheetPath)) unlinkSync(sheetPath);
  }
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function realRender(labId: string, shotId: string): Promise<{ ok: boolean; jobId: string | null; status: string }> {
  const job = await createRenderJob(labId, shotId, "PREVIEW");
  if (!job) return { ok: false, jobId: null, status: "no-job" };
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < 480 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

interface LegIkPoseRow { kneeTableR?: number; kneeSolvedR?: number; kneeTableL?: number; kneeSolvedL?: number; penBefore?: number; penAfter?: number; rootLift?: number }
interface LegIkEvidence { hash?: string; lawVersion?: number; kneeMax?: number; table?: Record<string, LegIkPoseRow>; applied?: { frames?: number; solvedFrames?: number; maxPenBefore?: number; maxKneeDelta?: number; maxRootLift?: number; maxResidual?: number } | null }
interface JobState { rig?: { legIk?: LegIkEvidence | null; asset?: { hash?: string } | null } | null; figureSource?: string }

function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 96: the feet stay planted (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string; description: string; shotType: string }> = {};

  if (PHASE === "b") {
    const labRow = await db.project.findFirst({ where: { title: { contains: MARK } } });
    if (!labRow) throw new Error(`phase ${PHASE}: the lab is missing - run PHASE=a first`);
    labId = labRow.id;
    const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
    ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
    viewerJar = await loginJar("reader@studio.dev", "viewing123");
    const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
    if (!sceneRow) throw new Error(`phase ${PHASE}: the scene is missing`);
    const shotRows = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
    for (const s of shotRows) shots[s.number] = { id: s.id, description: s.description, shotType: s.shotType };
    check(`B0 phase ${PHASE} resumed over the standing lab (3 shots)`, Object.keys(shots).length === 3);
  }

  if (PHASE === "a" || PHASE === "all") {

  // ── A. source checks ──
  const lawSrc = readFileSync("src/lib/animation/leg-ik.ts", "utf8");
  check("A1 the leg IK law stands (constants, solve, table, key, hash, line)",
    lawSrc.includes("export const LEG_IK_VERSION = 96") && lawSrc.includes("export function solveLegIk")
    && lawSrc.includes("export function legIkTable") && lawSrc.includes("export function legIkKey")
    && lawSrc.includes("export function legIkHash") && lawSrc.includes("export function footDrop"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker mirrors the law (one law, two runtimes)",
    workerSrc.includes("LEG_IK_VERSION = 96") && workerSrc.includes("def solve_leg_ik")
    && workerSrc.includes("def leg_ik_table") && workerSrc.includes("def leg_ik_key")
    && workerSrc.includes("def leg_ik_hash"));

  check("A3 apply_pose integrates the solve (the knees take the solved angles, the root takes the lift)",
    workerSrc.includes("ik_r = solve_leg_ik(root_y + bob, r_leg + leg_r, r_knee)")
    && workerSrc.includes("figure[\"rKnee\"].rotation_euler = (math.radians(ik_r[\"knee\"])")
    && workerSrc.includes("root.location = (0.0, -root_x * s, (root_y + bob + lift) * s)"),
    "apply_pose integration missing");
  check("A4 the state evidence hooks ride (the hero, the legacy stand-in, the applied report)",
    workerSrc.includes('state["rig"]["legIk"]') && workerSrc.includes('"legIk": {')
    && workerSrc.includes('_lr["applied"]'));

  // ── B. pure checks ──
  const table = legIkTable();
  check("B1 the readings' frontier is NAMED: CROUCH penetrates before the solve",
    (table.CROUCH?.penBefore ?? 0) > 0.1, JSON.stringify(table.CROUCH));
  check("B2 the readings' frontier is CLOSED: CROUCH plants after (pen 0, no lift)",
    table.CROUCH?.penAfter === 0 && table.CROUCH?.rootLift === 0);
  check("B3 RISE names and closes its penetration (the DETERMINED pair's end)",
    (table.RISE?.penBefore ?? 0) > 0.15 && table.RISE?.penAfter === 0);
  check("B4 FALL plants through the fold (the deepest drop, the knee under the clamp)",
    (table.FALL?.penBefore ?? 0) > 0.5 && table.FALL?.penAfter === 0
    && (table.FALL?.kneeSolvedR ?? 0) <= LEG_IK.kneeMax);
  check("B5 the fold law over the vocabulary: a fired solve never lowers the knee",
    POSES.every((n) => {
      const j = POSE_JOINTS[n];
      const r = solveLegIk(j.rootY, j.rLeg, j.rKnee);
      const l = solveLegIk(j.rootY, j.lLeg, j.lKnee);
      return (!r.solved || r.knee >= j.rKnee - 1e-9) && (!l.solved || l.knee >= j.lKnee - 1e-9);
    }));
  check("B6 the plant law over the vocabulary: zero residual everywhere",
    POSES.every((n) => table[n]?.penAfter === 0 && table[n]?.rootLift === 0));
  check("B7 the clearance law: LEAP floats honestly (no solve, the table's knees)",
    (table.LEAP?.penBefore ?? 0) <= 0 && table.LEAP?.kneeSolvedR === table.LEAP?.kneeTableR);
  check("B8 the clearance law: LUNGE's heel floats (the pose's own read)",
    (table.LUNGE?.penBefore ?? 0) <= 0 && table.LUNGE?.kneeSolvedR === table.LUNGE?.kneeTableR);
  check("B9 the solve is closed-form deterministic (the same row, the same knees)",
    JSON.stringify(solveLegIk(-0.4, 70, 95)) === JSON.stringify(solveLegIk(-0.4, 70, 95)));
  check("B10 footDrop matches the rig's composition (hip -t, knee +k: shin world k - t)",
    Math.abs(footDrop(0, 0) - 0.92) < 1e-9 && Math.abs(footDrop(90, 90) - 0.46) < 1e-9,
    `${footDrop(0, 0)} / ${footDrop(90, 90)}`);
  const anchorRow = table.CROUCH!;
  check("B11 the hash is sha256-16 over the canonical key (deterministic, 16 hex)",
    legIkHash() === createHash("sha256").update(legIkKey(), "utf8").digest("hex").slice(0, 16)
    && legIkHash().length === 16, legIkHash());
  check("B12 the hash covers the law's answers (a moved solve moves the key)",
    legIkKey().includes(`CROUCH:r=95.000,${anchorRow.kneeSolvedR.toFixed(3)}`)
    && legIkKey().endsWith("|v1"), legIkKey().slice(0, 120));
  check("B13 the line reads honestly (the deepest pose named)",
    legIkLine().includes("leg IK v96") && legIkLine().includes("FALL"), legIkLine());
  check("B14 the law version rides (96, mirrored in the worker)",
    LEG_IK_VERSION === 96 && workerSrc.includes("LEG_IK_VERSION = 96"));

  // ── C. accounts + throwaway production ──
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  check("C2 the owner's session reads live", (await call(ownerJar, "/api/projects")).status === 200);
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("C3 the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER");
  viewerJar = await loginJar("reader@studio.dev", "viewing123");
  check("C4 the viewer's session reads live too", (await call(viewerJar!, "/api/projects")).status === 200);

  const created = await executeTool("throwaway", "create_project", { title: `Iter96 Leg IK Lab ${MARK}`, logline: "a throwaway production for the planted-feet proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Planted Stance Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Loaded Knee" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling coils and rises from the loaded knee", shotType: "CLOSEUP", lighting: "moonlit night", poseStart: "CROUCH", poseEnd: "RISE" },
    { number: 2, description: "the ridge wide as Bai Ling rises", shotType: "WS", lighting: "moonlit night", poseStart: "CROUCH", poseEnd: "RISE" },
    { number: 3, description: "Bai Ling leaps the gap", shotType: "MED", lighting: "dawn light", poseStart: "STANCE", poseEnd: "LEAP" },
  ];
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.3, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd } });
    shots[d.number] = { id: s.id, description: d.description, shotType: d.shotType };
  }
  check("C7 the three-shot episode stands (close / wide / middle)", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);
  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ── D. the real paths: the DETERMINED pair plants ──
  const heroJob = await realRender(labId, shots[1].id);
  check("D1 the CROUCH->RISE closeup rendered over the real engine", heroJob.ok, heroJob.status.slice(0, 140));
  if (heroJob.ok && heroJob.jobId) {
    const state = readJobState(heroJob.jobId);
    check("D2 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
    const legik = state.rig?.legIk;
    check("D3 the render state names the legIk evidence (hash, law version, knee clamp)",
      !!legik && legik.lawVersion === 96 && legik.kneeMax === 130 && typeof legik.hash === "string", JSON.stringify(legik ?? null).slice(0, 200));
    check("D4 the legIk hash matches the TS law BIT-EXACTLY over the REAL render (one law, two runtimes)",
      !!legik && legik.hash === legIkHash(), `${legik?.hash} vs ${legIkHash()}`);
    const st = legik?.table?.CROUCH;
    check("D5 the real render's table names the frontier honestly (CROUCH before AND after)",
      !!st && (st.penBefore ?? 0) > 0.1 && st.penAfter === 0 && (st.kneeSolvedR ?? 0) > (st.kneeTableR ?? 0),
      JSON.stringify(st));
    check("D6 the whole table planted over the real render (penAfter 0, no lift)",
      !!legik?.table && Object.values(legik.table).every((v) => v.penAfter === 0 && v.rootLift === 0),
      JSON.stringify(legik?.table).slice(0, 200));
    const applied = legik?.applied;
    check("D7 the applied report proves EVERY frame solved with ZERO residual (the readings' frontier closed)",
      !!applied && (applied.frames ?? 0) > 0 && applied.frames === applied.solvedFrames
      && applied.maxResidual === 0 && applied.maxRootLift === 0 && (applied.maxPenBefore ?? 0) > 0.1
      && (applied.maxKneeDelta ?? 0) > 5, JSON.stringify(applied));
  }

  if (PHASE === "b" || PHASE === "all") {
  // ── E. the lens resolves, never rewrites + the honest airborne ──
  const wideJob = await realRender(labId, shots[2].id);
  check("E1 the WS render finished", wideJob.ok, wideJob.status.slice(0, 120));
  if (wideJob.ok && wideJob.jobId) {
    const wideState = readJobState(wideJob.jobId);
    check("E2 the WS lands the SAME law hash (the lens resolves, never rewrites)",
      wideState.rig?.legIk?.hash === legIkHash(), `${wideState.rig?.legIk?.hash} vs ${legIkHash()}`);
  }

  const leapJob = await realRender(labId, shots[3].id);
  check("E3 the STANCE->LEAP render finished", leapJob.ok, leapJob.status.slice(0, 120));
  if (leapJob.ok && leapJob.jobId) {
    const leapState = readJobState(leapJob.jobId);
    const appliedLeap = leapState.rig?.legIk?.applied;
    check("E4 the leap clip stays honest (nothing penetrated, nothing solved)",
      !!appliedLeap && appliedLeap.solvedFrames === 0 && (appliedLeap.maxPenBefore ?? 1) <= 0,
      JSON.stringify(appliedLeap));
  }
  }

  if (PHASE === "b") {
  // ── F. the viewer gate + cleanup ──
  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("F1 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("F2 the lab is gone exactly", leftovers.length === 0);
  }
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 96 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

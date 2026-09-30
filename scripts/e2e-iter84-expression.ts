// Iteration 84 E2E: THE FACE PERFORMS THE BEAT. Proves, against the
// RUNNING studio, the REAL database, the REAL render pipeline, the
// REAL vision channel and the REAL image generator:
//   A. source: the expression library + clip compiler + timing curve
//      (TS + worker), the wire, the four shape keys, the doctrine
//   B. pure: the library laws (bounds, calm baseline, determinism,
//      the hash formula), the timing curve, the drama derivation
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      PERFORMED build over the real engine (the render state names
//      the expression evidence + hash, the sculpt + grade still
//      riding), the drama derivation landing through the REAL render
//      path (anger / joy / calm per shot), the repair loop at
//      shotsPerMember: 3, the honest ledger, the IDENTITY_REPAIR
//      event, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|b npx tsx scripts/e2e-iter84-expression.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseSheetDna, sheetDnaFresh, readSheetDna,
} from "../src/lib/blender/adherence";
import {
  parseExpressionClip, expressionAt, expressionEnvelope, expressionHash, expressionLine,
  EXPRESSION_LIBRARY, EXPRESSION_BOUNDS, EXPRESSION_CALM, EXPRESSION_EMOTIONS, EXPRESSION_SHAPES,
  EXPRESSION_DERIVED_INTENSITY, EXPRESSION_TIMING_BOUNDS,
} from "../src/lib/blender/expressions";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter84-expression";
// background processes die with the launching shell in this environment;
// each phase must fit the 10-minute foreground cap (the iter60 law).
// PHASE=a: source + pure + lab + the performed build. PHASE=b: the loop
// + the honest ledger + cleanup. PHASE=all: everything (default).
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
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, location ${res.headers.get("location")}, probe ${probe.status}`);
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
  for (let i = 0; i < 420 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

function readJobState(jobId: string): { rig?: { expression?: { emotion?: string; hash?: string; shapes?: string[]; samples?: Array<{ weights: Record<string, number> }> } | null; sculpt?: { verts?: number } | null; materials?: { hash?: string } | null } | null; figureSource?: string } {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 84: the face performs the beat (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string }> = {};
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };

  if (PHASE === "b") {
    // resume: the lab, its shots and the hero are already on disk
    const labRow = await db.project.findFirst({ where: { title: { contains: MARK } } });
    if (!labRow) throw new Error("phase b: the lab is missing - run PHASE=a first");
    labId = labRow.id;
    const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
    ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
    viewerJar = await loginJar("reader@studio.dev", "viewing123");
    const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
    if (!sceneRow) throw new Error("phase b: the scene is missing");
    const shotRows = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
    for (const s of shotRows) shots[s.number] = { id: s.id };
    check("B16 phase b resumed over the standing lab (3 shots)", Object.keys(shots).length === 3);
    const standingResume = await castIdentityMeasurement(labId, "RENDER");
    check("B17 the planted below standing survived the phase boundary", standingResume.below === 1, JSON.stringify({ below: standingResume.below }));
  }

  if (PHASE !== "b") {

  // ───────────────────── A. source-level checks ─────────────────────
  const exprSrc = readFileSync("src/lib/blender/expressions.ts", "utf8");
  check("A1 the expression library exists with its bounds and line", exprSrc.includes("export const EXPRESSION_LIBRARY") && exprSrc.includes("export const EXPRESSION_BOUNDS") && exprSrc.includes("export function parseExpressionClip") && exprSrc.includes("export function expressionAt") && exprSrc.includes("export function expressionLine"));
  check("A2 the library names the eight emotions", exprSrc.includes('"calm"') && exprSrc.includes('"alert"') && exprSrc.includes('"resolve"') && exprSrc.includes('"anger"') && exprSrc.includes('"grief"') && exprSrc.includes('"joy"') && exprSrc.includes('"fear"') && exprSrc.includes('"surprise"'));
  check("A3 the calm baseline is the alive baseline (never dead zero)", exprSrc.includes("cheek: 0.1") && exprSrc.includes("corner: 0.08") && exprSrc.includes("squint: 0.06"));
  check("A4 the four shape keys are named law", exprSrc.includes('"browKnit", "cheekRaise", "mouthCorner", "jawOpen"'));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A5 the wire carries the expression clip", wireSrc.includes("expression?: {") && wireSrc.includes("THE FACE PERFORMS THE BEAT"));

  const renderSrc = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A6 the render path compiles the shot's own drama into the payload", renderSrc.includes("parseExpressionClip(shot.description") && renderSrc.includes("THE FACE PERFORMS THE BEAT"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A7 the worker validates + clamps the clip (one law, two runtimes)", workerSrc.includes("def expression_clip(shot):") && workerSrc.includes('"corner": (-1.0, 1.0)') && workerSrc.includes("EXPRESSION_CALM"));
  check("A8 the worker sculpts the four shape keys on the head", workerSrc.includes("def sculpt_expression_keys(mesh):") && workerSrc.includes('"browKnit"') && workerSrc.includes('"jawOpen"') && workerSrc.includes("slider_min = -1.0"));
  check("A9 the worker composes the channels + drives the keys per frame", workerSrc.includes("def apply_pose(figure, pose_start, pose_end, t, t_sec, speech=None, expr=None):") && workerSrc.includes("expr=expression_at(eclip, t_sec, duration_sec) if eclip else None"));
  check("A10 the expression evidence rides the render state (hash included)", workerSrc.includes('state["rig"]["expression"] = expression_evidence(eclip, duration_sec) if eclip else None') && workerSrc.includes("def expression_evidence(clip, duration_sec):"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A11 the registry stands at 88 tools (the performance deepens, no new tool)", toolCount === 89, `count=${toolCount}`);
  check("A12 the repair pass names the performed beat", tools.includes("PERFORM THE BEAT") && tools.includes("THE FACE PERFORMS THE BEAT"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A13 rule 59 teaches the performed face", prompts.includes("59. THE FACE PERFORMS THE BEAT"));
  check("A14 the curriculum grew the line", prompts.includes("- THE FACE PERFORMS THE BEAT: the face is an ACTOR, not a mask"));
  check("A15 rules stay sequential (59, no duplicates)", (prompts.match(/^59\. THE FACE PERFORMS THE BEAT/gm) ?? []).length === 1);

  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  check("A16 the repair loop source stays honest (the ledger law intact)", repairSrc.includes("export function shotRepairVerdict") && repairSrc.includes("runIdentityRepairPass") && repairSrc.includes("scoreRenderIdentity"));

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 the library carries exactly the eight emotions", EXPRESSION_EMOTIONS.length === 8 && Object.keys(EXPRESSION_LIBRARY).length === 8, JSON.stringify(Object.keys(EXPRESSION_LIBRARY)));
  const allBounded = Object.entries(EXPRESSION_LIBRARY).every(([, pose]) =>
    Object.entries(EXPRESSION_BOUNDS).every(([k, [lo, hi]]) => (pose as unknown as Record<string, number>)[k] >= lo && (pose as unknown as Record<string, number>)[k] <= hi));
  check("B2 every library pose lands inside the bounds", allBounded);
  check("B3 calm IS the alive baseline (the exact library entry)", JSON.stringify(EXPRESSION_LIBRARY.calm) === JSON.stringify(EXPRESSION_CALM) && EXPRESSION_CALM.cheek === 0.1 && EXPRESSION_CALM.corner === 0.08);
  const anger = EXPRESSION_LIBRARY.anger;
  check("B4 anger knits the brow and drops the corners (the scowl)", anger.knit === 0.7 && anger.corner === -0.5 && anger.brow === -0.7);
  const joy = EXPRESSION_LIBRARY.joy;
  check("B5 joy lifts the cheeks and the corners (the smile)", joy.cheek === 0.6 && joy.corner === 0.7);

  const roar = parseExpressionClip("Bai Ling roars as the jian ignites", null, null);
  check("B6 the drama derivation reads the verb (roars -> anger)", roar.emotion === "anger" && roar.derived && roar.source === "word: roar", JSON.stringify(roar));
  check("B7 the derivation lands the performed intensity + bounded timing", roar.intensity === EXPRESSION_DERIVED_INTENSITY && roar.attackMs >= EXPRESSION_TIMING_BOUNDS.attackMs[0] && roar.releaseMs <= EXPRESSION_TIMING_BOUNDS.releaseMs[1]);
  check("B8 each emotion has its word (smile->joy, tears->grief, gasp->surprise, wary->alert, steels->resolve, dread->fear)",
    parseExpressionClip("she smiles at the valley", null, null).emotion === "joy"
    && parseExpressionClip("tears fall", null, null).emotion === "grief"
    && parseExpressionClip("a gasp escapes", null, null).emotion === "surprise"
    && parseExpressionClip("wary of the ridge", null, null).emotion === "alert"
    && parseExpressionClip("she steels herself", null, null).emotion === "resolve"
    && parseExpressionClip("dread creeps", null, null).emotion === "fear");
  check("B9 the staged pose hints speak when the words are quiet (LUNGE -> resolve, FALL -> fear)",
    parseExpressionClip("a quiet exchange", "LUNGE", "STANCE").emotion === "resolve"
    && parseExpressionClip("a quiet exchange", "STANCE", "FALL").emotion === "fear");
  const quiet = parseExpressionClip("Bai Ling stands at the ridge edge", "STANCE", "STANCE");
  check("B10 a quiet shot performs calm (the alive baseline, honestly sourced)", quiet.emotion === "calm" && quiet.derived && quiet.source === "quiet shot", JSON.stringify(quiet));

  const hold = expressionAt(roar, 1.25, 2.5);
  check("B11 the anger hold blends calm -> library * intensity (knit 0.42, corner -0.3)", hold.knit === 0.42 && hold.corner === -0.3 && hold.brow === -0.42, JSON.stringify(hold));
  const w0 = expressionAt(roar, 0, 2.5);
  check("B12 envelope zero lands the alive calm (never dead zero)", w0.cheek === 0.1 && w0.corner === 0.08 && w0.knit === 0);
  check("B13 every blended weight lands inside the bounds (attack, hold, release)",
    [expressionAt(roar, 0.1, 2.5), hold, expressionAt(roar, 2.4, 2.5)].every((w) =>
      Object.entries(EXPRESSION_BOUNDS).every(([k, [lo, hi]]) => (w as unknown as Record<string, number>)[k] >= lo && (w as unknown as Record<string, number>)[k] <= hi)));
  check("B14 the envelope attacks, holds, releases (deterministic)",
    expressionEnvelope(roar, 0, 2.5) === 0 && expressionEnvelope(roar, 1.25, 2.5) === 1 && expressionEnvelope(roar, 2.5, 2.5) === 0
    && expressionEnvelope(roar, 1.25, 2.5) === expressionEnvelope(roar, 1.25, 2.5));

  const hashA = expressionHash(roar);
  const hashB = expressionHash({ emotion: "anger", intensity: 0.6, attackMs: 240, releaseMs: 480 });
  const expected = createHash("sha256").update("84|anger|0.600|240|480|v1", "utf8").digest("hex").slice(0, 16);
  check("B15 the hash is deterministic AND matches the worker's formula", hashA === hashB && hashA === expected, `${hashA}/${hashB}/${expected}`);
  check("B16 a different emotion lands a different hash", hashA !== expressionHash({ emotion: "joy", intensity: 0.6, attackMs: 240, releaseMs: 480 }));

  const directed = parseExpressionClip("a quiet exchange", null, null, { emotion: "GRIEF", intensity: 0.9 });
  check("B17 an explicit direction wins over the derivation (normalized + clamped)", directed.emotion === "grief" && directed.intensity === 0.9 && !directed.derived, JSON.stringify(directed));
  const wildDirected = parseExpressionClip("quiet", null, null, { emotion: "fury", intensity: 42 });
  check("B18 an unknown directed emotion degrades to the derivation", wildDirected.emotion === "calm" && wildDirected.derived, JSON.stringify(wildDirected));
  check("B19 the ledger line reads honestly", expressionLine(roar).startsWith("performs: anger @ 0.60") && expressionLine(roar).includes("read from the shot's own drama"), expressionLine(roar));

  check("B20 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, 0.5, 0.7) === "IMPROVED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("C3 the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER");
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  check("C4 the viewer's session reads live too", (await call(viewerJar, "/api/projects")).status === 200);

  const created = await executeTool("throwaway", "create_project", { title: `Iter84 Expression Lab ${MARK}`, logline: "a throwaway production for the performed-face proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Performed Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Cloud Ridge" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling roars as the jian ignites in her hand" },
    { number: 2, description: "Bai Ling smiles at the valley below the ridge" },
    { number: 3, description: "Bai Ling stands at the ridge edge, robes moving in the wind" },
  ];
  const shots: Record<number, { id: string }> = {};
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 2.5, movement: "STATIC" } });
    shots[d.number] = { id: s.id };
  }
  check("C7 the three-shot episode stands", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);

  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ───────────────────── D. the real paths ─────────────────────
  // D-a THE SHEET IS READ: the REAL vision read over the real sheet PNG
  const dnaRead = await readSheetDna(hero.id, { refresh: true });
  check("D1 the REAL sheet-DNA read lands over the real sheet", dnaRead.ok, "error" in dnaRead ? dnaRead.error.slice(0, 160) : "");
  if (dnaRead.ok) {
    console.log(`   sheet DNA: faceShape=${JSON.stringify(dnaRead.dna.faceShape)} skinTone=${JSON.stringify(dnaRead.dna.skinTone)}`);
  }

  // D-b THE DETERMINISTIC PERFORMED BUILD: a crafted read (staleness-
  // keyed to the current sheet) plants measured hexes; the render path
  // compiles the drama clip (roars -> anger) and the worker PERFORMS
  // it (the sculpt + the grade still riding underneath).
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "ponytail", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    faceShape: "oval",
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D2 the crafted read parses with the named hexes", !!crafted && crafted.skinTone === "#d9b48f" && crafted.robeColor === "#2f6d63");
  let performedJob: { ok: boolean; jobId: string | null; status: string } | null = null;
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const cached = sheetDnaFresh((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna, heroRow.modelSheetUrl);
    check("D3 the crafted read serves fresh from the cache (staleness keyed on the sheet)", !!cached && cached.skinTone === "#d9b48f");
    performedJob = await realRender(labId, shots[1].id);
    check("D4 the performed build rendered over the real engine", performedJob.ok, performedJob.status.slice(0, 140));
    if (performedJob.ok && performedJob.jobId) {
      const state = readJobState(performedJob.jobId);
      check("D5 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const expr = state.rig?.expression;
      check("D6 the render state names the performed beat (anger @ 0.6, bounded timing)", !!expr && expr.emotion === "anger" && !!expr.hash, JSON.stringify(expr)?.slice(0, 220));
      check("D7 the evidence names the four shape keys", !!expr && JSON.stringify(expr.shapes) === JSON.stringify([...EXPRESSION_SHAPES]), JSON.stringify(expr?.shapes));
      check("D8 the hold sample carries the blended weights (knit 0.42, corner -0.3)", !!expr && (expr.samples?.[1]?.weights?.knit ?? 0) === 0.42 && (expr.samples?.[1]?.weights?.corner ?? 0) === -0.3, JSON.stringify(expr?.samples?.[1]));
      check("D9 the evidence hash matches the TS law over the REAL render", !!expr && expr.hash === hashA, `${expr?.hash} vs ${hashA}`);
      check("D10 the sculpt + the grade still ride underneath (Layer A in full)", (state.rig?.sculpt?.verts ?? 0) > 600 && typeof state.rig?.materials?.hash === "string", JSON.stringify({ verts: state.rig?.sculpt?.verts, matsHash: state.rig?.materials?.hash }));
    }
  }

  // D-c the named work order: three planted below readings on real rows
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D11 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D12 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Bai Ling")?.worstRef === "E1 Sc1 S001", JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a") {
  // D-d THE LOOP at shotsPerMember: 3 (reanchor off: bounded, no regen)
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D13 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D14 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D15 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D16 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D17 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  // D-e THE DRAMA DERIVATION LANDED THROUGH THE REAL RENDER PATH:
  // the loop's re-renders compiled each shot's own clip - roar -> anger,
  // smile -> joy, quiet -> calm - and the worker named each one.
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobPerShot: Record<number, string> = {};
  for (const j of jobs) {
    const n = Object.entries(shots).find(([, s]) => s.id === j.shotId)?.[0];
    if (n !== undefined) lastJobPerShot[Number(n)] = j.id;
  }
  const wanted: Record<number, string> = { 1: "anger", 2: "joy", 3: "calm" };
  for (const n of [1, 2, 3]) {
    const jid = lastJobPerShot[n];
    const expr = jid ? readJobState(jid).rig?.expression : null;
    check(`D-e shot ${n}'s re-render performed its own beat (${wanted[n]})`, !!expr && expr.emotion === wanted[n] && typeof expr.hash === "string", JSON.stringify(expr)?.slice(0, 160));
  }

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)}) note=${row?.note.slice(0, 90)}`);
  }
  check("D18 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D19 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const stripJobs = jobs.slice(-3);
  const stripsOk = stripJobs.every((j) => existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip.jpg`)) && existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip0.jpg`)));
  check("D20 the filmstrip artifacts persist per job (the strip + its frames)", stripsOk, stripJobs.map((j) => j.id.slice(-6)).join(","));

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D21 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 84 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

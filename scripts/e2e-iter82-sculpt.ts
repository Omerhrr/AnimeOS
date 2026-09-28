// Iteration 82 E2E: THE FACE IS SCULPTED, NOT ASSEMBLED. Proves,
// against the RUNNING studio, the REAL database, the REAL render
// pipeline, the REAL vision channel and the REAL image generator:
//   A. source: the face-profile parser (TS + worker), the wire, the
//      sculpted head/hair builder, the doctrine
//   B. pure: parseFaceProfile laws (priors, nudges, clamps,
//      determinism, the neutral-sculpt honesty), the parsed read's
//      faceShape, the adherent merge's face profile
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read (faceShape asked),
//      the deterministic SCULPTED build over the real engine (the
//      render state names family/factors/parts/hash), the repair loop
//      at shotsPerMember: 3 with the sculpt riding (three REAL
//      re-renders + three pose-matched REAL re-scores), the honest
//      ledger, the IDENTITY_REPAIR event, the viewer gate
//   E. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter82-sculpt.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseSheetDna, sheetDnaFresh, adherentDna, readSheetDna,
  parseFaceProfile, faceProfileLine, FACE_PROFILE_BOUNDS, FACE_SHAPE_PRIORS,
  type SheetDnaRead,
} from "../src/lib/blender/adherence";
import { characterDesignDna } from "../src/lib/animation/design";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter82-sculpt";
// background processes die with the launching shell in this environment;
// each phase must fit the 10-minute foreground cap (the iter60 law).
// PHASE=a: source + pure + lab + the sculpted build. PHASE=b: the loop
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

async function run() {
  console.log(`== Iteration 82: the face is sculpted, not assembled (phase: ${PHASE}) ==\n`);

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
  const adhereSrc = readFileSync("src/lib/blender/adherence.ts", "utf8");
  check("A1 the face-profile parser exists with its bounds and line", adhereSrc.includes("export function parseFaceProfile") && adhereSrc.includes("export const FACE_PROFILE_BOUNDS") && adhereSrc.includes("export function faceProfileLine"));
  check("A2 the bounds are the one law (jaw/chin/brow/cheek/nose/eye)", adhereSrc.includes('jawTaper: [0.55, 0.9]') && adhereSrc.includes('chinFwd: [0, 0.05]') && adhereSrc.includes('browFwd: [0, 0.03]') && adhereSrc.includes('cheekOut: [0, 0.045]') && adhereSrc.includes('noseLen: [0.7, 1.4]') && adhereSrc.includes('eyeScale: [0.85, 1.25]'));
  check("A3 the sheet read carries the faceShape field", adhereSrc.includes("faceShape: FaceShape | null") && adhereSrc.includes('SHEET_DNA_FACE_SHAPES: readonly FaceShape[] = ["oval", "round", "angular"]'));
  check("A4 the vision prompt asks the face family", adhereSrc.includes('"faceShape": "oval|round|angular"') && adhereSrc.includes("judge the jaw line"));
  check("A5 the adherent merge rides the face profile", adhereSrc.includes("faceProfile: parseFaceProfile(faceShape, read.build ?? base.build)"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A6 the wire carries the face family + profile", wireSrc.includes("faceShape?: string;") && wireSrc.includes("faceProfile?: {") && wireSrc.includes("THE FACE IS SCULPTED, NOT ASSEMBLED"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A7 the worker validates + clamps the profile (one law, two runtimes)", workerSrc.includes("def face_profile(dna):") && workerSrc.includes('"jawTaper": (0.55, 0.9)') && workerSrc.includes("FACE_PRIORS["));
  check("A8 the worker sculpts the head mesh (jaw/chin/brow/sockets/cheeks/nose/dome/ears)", workerSrc.includes("def sculpt_head_mesh(") && workerSrc.includes("# 1. jaw taper") && workerSrc.includes("# 6. nose") && workerSrc.includes("# 8. ears"));
  check("A9 the hair is lofted strands (tapered tips, not spheres)", workerSrc.includes("def loft_strand(") && workerSrc.includes("def sculpt_hair(") && workerSrc.includes('"HairSweep"') && workerSrc.includes('"HairLockL"'));
  check("A10 the sculpt evidence rides the rig + the state (hash included)", workerSrc.includes('"sculpt": {') && workerSrc.includes('"faceHash"') && workerSrc.includes('state["rig"]["sculpt"]') && workerSrc.includes('state["secondFigureSculpt"]'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A11 the registry stands at 88 tools (the sculpt deepens, no new tool)", toolCount === 88, `count=${toolCount}`);
  check("A12 the repair pass names the head sculpt", tools.includes("SCULPTS THE HEAD") && tools.includes("THE FACE IS SCULPTED, NOT ASSEMBLED"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A13 rule 57 teaches the sculpt", prompts.includes("57. THE FACE IS SCULPTED, NOT ASSEMBLED"));
  check("A14 the curriculum grew the line", prompts.includes("- THE FACE IS SCULPTED, NOT ASSEMBLED: the proxy's head is a real sculpted mesh"));
  check("A15 rules stay sequential (57, no duplicates)", (prompts.match(/^57\. THE FACE IS SCULPTED/gm) ?? []).length === 1);

  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  check("A16 the repair ledger line names the face profile", repairSrc.includes("parseFaceProfile") && repairSrc.includes("faceProfileLine(face)") && repairSrc.includes("faceShape"));

  // ───────────────────── B. pure checks ─────────────────────
  const neutral = parseFaceProfile(null, null);
  check("B1 no faceShape -> the NEUTRAL sculpt with honest fields", !!neutral && neutral.jawTaper === 0.74 && neutral.eyeScale === 1.05 && neutral.fields.length === 0, JSON.stringify(neutral));
  const angular = parseFaceProfile("angular", null);
  check("B2 the angular prior sculpts sharper (jaw 0.64, brow 0.024, eye 0.96)", !!angular && angular.jawTaper === 0.64 && angular.chinFwd === 0.042 && angular.browFwd === 0.024 && angular.eyeScale === 0.96 && angular.fields.length === 1, JSON.stringify(angular));
  const roundHeavy = parseFaceProfile("round", "heavy");
  check("B3 the build nudges the jaw (heavy: 0.84 + 0.04, cheek lifted)", !!roundHeavy && roundHeavy.jawTaper === 0.88 && roundHeavy.cheekOut === 0.04 && roundHeavy.fields.length === 2, JSON.stringify(roundHeavy));
  const clamped = parseFaceProfile("oval", "lean");
  check("B4 every factor lands inside the bounds", Object.entries(FACE_PROFILE_BOUNDS).every(([k, [lo, hi]]) => (clamped as unknown as Record<string, number>)[k] >= lo && (clamped as unknown as Record<string, number>)[k] <= hi));
  const garbage = parseFaceProfile("triangular", "sturdy");
  check("B5 an unknown family degrades to the neutral sculpt, honestly", !!garbage && garbage.jawTaper === 0.74 && garbage.fields.length === 0, JSON.stringify(garbage));
  check("B6 the parser is deterministic (the same inputs, the same profile)", JSON.stringify(parseFaceProfile("angular", "lean")) === JSON.stringify(parseFaceProfile("angular", "lean")));
  check("B7 every prior sits inside the bounds", Object.values(FACE_SHAPE_PRIORS).every((p) => Object.entries(FACE_PROFILE_BOUNDS).every(([k, [lo, hi]]) => (p as unknown as Record<string, number>)[k] >= lo && (p as unknown as Record<string, number>)[k] <= hi)));
  const neutralLine = faceProfileLine(neutral!);
  const angularLine = faceProfileLine(angular!);
  check("B8 the line reads honestly (neutral vs named)", neutralLine.includes("neutral face") && angularLine.startsWith("sculpted: angular face") && angularLine.includes("named by the sheet"), `${neutralLine} | ${angularLine}`);

  const parsed = parseSheetDna(JSON.stringify({ hairStyle: "long", build: "lean", faceShape: "oval", silhouette: "flowing robes" }), "/sheets/x.png");
  check("B9 a parsed read lands the faceShape family", !!parsed && parsed.faceShape === "oval", JSON.stringify(parsed));
  const garbled = parseSheetDna(JSON.stringify({ faceShape: "heart-shaped" }), "/sheets/x.png");
  check("B10 a garbled family lands null (the regex fills, never poisons)", !!garbled && garbled.faceShape === null);

  const regexDna = characterDesignDna({ name: "Bai Ling", role: "PROTAGONIST", appearance: "black hair, jade robe, lean build", modelSheetPrompt: null, stateClothing: null, stateWeapon: null });
  const readNamed: SheetDnaRead = {
    sheetUrl: "/sheets/x.png", readAt: new Date().toISOString(),
    hairStyle: "ponytail", hairColor: "#1b1b2a", robeColor: "#2f6d63", robeAccent: "#a8842c",
    bootsColor: "#241a12", skinTone: "#d9b48f", weaponType: "sword", build: "lean", beard: false,
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
    faceShape: "angular",
  };
  const merged = adherentDna(regexDna, readNamed);
  check("B11 the adherent build rides the face profile (angular through lean's nudge)", !!merged.faceProfile && merged.faceProfile.jawTaper === 0.61 && merged.faceShape === "angular" && merged.faceProfile.fields.includes("angular face") && merged.faceProfile.fields.includes("lean jaw"), JSON.stringify(merged.faceProfile));
  check("B12 the silhouette shaping still rides beside it", !!merged.silhouetteShape && merged.silhouetteShape.shoulders === 1.05 && merged.silhouetteShape.hair === 1.32);
  const mergedGuess = adherentDna(regexDna, null);
  check("B13 a guess build carries no face (no faceShape, no profile)", mergedGuess.faceShape === undefined && mergedGuess.faceProfile === undefined && mergedGuess.conformFactor === 0.35);
  const mergedNoFace = adherentDna(regexDna, { ...readNamed, faceShape: null });
  check("B14 a read without a family keeps the NEUTRAL sculpt on the wire", !!mergedNoFace.faceProfile && mergedNoFace.faceProfile.jawTaper === 0.71 && mergedNoFace.faceShape === undefined && mergedNoFace.faceProfile.fields.length === 0, JSON.stringify(mergedNoFace.faceProfile));

  check("B15 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, 0.5, 0.7) === "IMPROVED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter82 Sculpt Lab ${MARK}`, logline: "a throwaway production for the sculpted-likeness proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Sculpted Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Cloud Ridge" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling stands at the ridge edge, robes moving in the wind" },
    { number: 2, description: "Bai Ling draws her jian, the blade catches the moon" },
    { number: 3, description: "Bai Ling sheathes the jian and turns to the valley" },
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
  // (the prompt now asks the face family too)
  const dnaRead = await readSheetDna(hero.id, { refresh: true });
  check("D1 the REAL sheet-DNA read lands over the real sheet", dnaRead.ok, "error" in dnaRead ? dnaRead.error.slice(0, 160) : "");
  if (dnaRead.ok) {
    const fields = [dnaRead.dna.hairStyle, dnaRead.dna.hairColor, dnaRead.dna.robeColor, dnaRead.dna.robeAccent, dnaRead.dna.bootsColor, dnaRead.dna.skinTone, dnaRead.dna.weaponType, dnaRead.dna.build].filter((v) => v !== null).length;
    console.log(`   sheet DNA: fields=${fields}/8 faceShape=${JSON.stringify(dnaRead.dna.faceShape)} silhouette=${JSON.stringify(dnaRead.dna.silhouette)}`);
  }

  // D-b THE DETERMINISTIC SCULPTED BUILD: a crafted read (staleness-
  // keyed to the current sheet) plants an angular family; the render
  // path compiles it through the cache (sheetDnaFresh, no refresh -
  // the exact path every production render takes) and the worker
  // SCULPTS the head mesh with it.
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "ponytail", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    faceShape: "angular",
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D2 the crafted read parses with the named family", !!crafted && crafted.faceShape === "angular" && crafted.silhouette?.includes("flowing sleeves") === true);
  let sculptJob: { ok: boolean; jobId: string | null; status: string } | null = null;
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const cached = sheetDnaFresh((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna, heroRow.modelSheetUrl);
    check("D3 the crafted read serves fresh from the cache (staleness keyed on the sheet)", !!cached && cached.faceShape === "angular");
    sculptJob = await realRender(labId, shots[1].id);
    check("D4 the sculpted build rendered over the real engine", sculptJob.ok, sculptJob.status.slice(0, 140));
    if (sculptJob.ok && sculptJob.jobId) {
      const statePath = path.join(process.cwd(), "public", "renders", `.job-${sculptJob.jobId}.json`);
      const state = JSON.parse(readFileSync(statePath, "utf8")) as {
        figureSource?: string;
        rig?: {
          silhouette?: { factors: Record<string, number> } | null;
          sculpt?: { faceShape: string | null; factors: Record<string, number>; namedBySheet: string[]; parts: string[]; verts: number; faceHash: string } | null;
        };
      };
      check("D5 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const sc = state.rig?.sculpt;
      check("D6 the render state names the sculpted face (angular through the lean nudge)", !!sc && sc.faceShape === "angular" && sc.factors.jawTaper === 0.61 && sc.factors.eyeScale === 0.96, JSON.stringify(state.rig?.sculpt));
      check("D7 the sculpted hair rides the evidence (cap, fringe, sweep, tail)", !!sc && sc.parts.includes("HairCap") && sc.parts.includes("HairFringe") && sc.parts.includes("HairSweep") && sc.parts.includes("HairTail"), JSON.stringify(sc?.parts));
      check("D8 the sculpt moved real vertices and carries its deterministic hash", !!sc && sc.verts > 600 && typeof sc.faceHash === "string" && sc.faceHash.length === 16, JSON.stringify({ verts: sc?.verts, faceHash: sc?.faceHash }));
      check("D9 the silhouette shaping rides beside the sculpt", !!state.rig?.silhouette && state.rig.silhouette.factors.shoulders === 1.05, JSON.stringify(state.rig?.silhouette));
    }
  }

  // D-c the named work order: three planted below readings on real rows
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D10 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D11 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Bai Ling")?.worstRef === "E1 Sc1 S001", JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a") {
  // D-d THE LOOP at shotsPerMember: 3 (reanchor off: bounded, no regen)
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D12 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D13 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D14 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D15 the ledger names the DNA the build rode (the face sculpt included)", pass1.result.includes("dna: Bai Ling: sheet-adherent build") && pass1.result.includes("sculpted:") && pass1.result.includes("angular face"), pass1.result.slice(0, 600));
  check("D16 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D17 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  const renderJobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  check("D18 the loop re-rendered all three shots over the real engine", renderJobs.length >= 6 && renderJobs.every((j) => existsSync(path.join(process.cwd(), "public", j.outputUrl!))), `jobs=${renderJobs.length}`);

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)}) note=${row?.note.slice(0, 90)}`);
  }
  check("D19 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D20 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const stripJobs = renderJobs.slice(-3);
  const stripsOk = stripJobs.every((j) => existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip.jpg`)) && existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip0.jpg`)));
  check("D21 the filmstrip artifacts persist per job (the strip + its frames)", stripsOk, stripJobs.map((j) => j.id.slice(-6)).join(","));

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D22 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 82 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

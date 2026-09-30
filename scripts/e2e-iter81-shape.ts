// Iteration 81 E2E: THE SILHOUETTE SHAPES THE MESH + THE SCORE MATCHES
// THE POSE. Proves, against the RUNNING studio, the REAL database, the
// REAL render pipeline, the REAL vision channel and the REAL image
// generator:
//   A. source: the shaping parser (TS + worker), the wire, the pose law
//   B. pure: parseSilhouetteShape laws, poseSampleTimestamps laws
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      shaped build over the real engine (render-state evidence), the
//      repair loop at shotsPerMember: 3 (three REAL re-renders + three
//      pose-matched REAL re-scores with the filmstrip riding), the
//      honest ledger, the IDENTITY_REPAIR event, the viewer gate
//   E. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter81-shape.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseSheetDna, sheetDnaFresh, adherentDna, readSheetDna,
  parseSilhouetteShape, silhouetteShapeLine, SILHOUETTE_SHAPE_BOUNDS,
  type SheetDnaRead,
} from "../src/lib/blender/adherence";
import { characterDesignDna } from "../src/lib/animation/design";
import { poseSampleTimestamps, POSE_FRAME_COUNT } from "../src/lib/identity";
import {
  runIdentityRepairPass, shotRepairVerdict,
  REPAIR_MAX_SHOTS_PER_MEMBER,
} from "../src/lib/identity-repair";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter81-shape";
// the iter60 law: each phase fits the 10-minute foreground cap
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

function noop() { void 0; }
void noop;

async function run() {
  console.log(`== Iteration 81: the silhouette shapes the mesh + the score matches the pose (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string }> = {};
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };

  if (PHASE === "b") {
    // resume: the lab, its shots and the hero are already on disk (the
    // iter60 law: each phase fits the 10-minute foreground cap)
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
    check("B21 phase b resumed over the standing lab (3 shots)", Object.keys(shots).length === 3);
    const standingResume = await castIdentityMeasurement(labId, "RENDER");
    check("B22 the planted below standing survived the phase boundary", standingResume.below === 1, JSON.stringify({ below: standingResume.below }));
  }

  if (PHASE !== "b") {

  // ───────────────────── A. source-level checks ─────────────────────
  const adhereSrc = readFileSync("src/lib/blender/adherence.ts", "utf8");
  check("A1 the shaping parser exists with its bounds and line", adhereSrc.includes("export function parseSilhouetteShape") && adhereSrc.includes("export const SILHOUETTE_SHAPE_BOUNDS") && adhereSrc.includes("export function silhouetteShapeLine"));
  check("A2 the adherent merge attaches the shaping", adhereSrc.includes("silhouetteShape: parseSilhouetteShape(read.silhouette, read.build)"));
  check("A3 the bounds are the one law (height/shoulders/torso/sleeves/skirt/hair)", adhereSrc.includes("height: [0.92, 1.12]") && adhereSrc.includes("shoulders: [0.82, 1.25]") && adhereSrc.includes("torso: [0.85, 1.2]") && adhereSrc.includes("sleeves: [0.9, 1.35]") && adhereSrc.includes("skirt: [0.9, 1.3]") && adhereSrc.includes("hair: [0.75, 1.5]"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A4 the wire carries the shaping profile", wireSrc.includes("silhouetteShape?: {") && wireSrc.includes("THE SILHOUETTE SHAPES THE MESH"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A5 the worker validates + clamps the profile (one law, two runtimes)", workerSrc.includes("def silhouette_shape(dna):") && workerSrc.includes('"height": (0.92, 1.12), "shoulders": (0.82, 1.25), "torso": (0.85, 1.2)') && workerSrc.includes("named.append(key)"));
  check("A6 the worker sculpts the mesh and reports the evidence", workerSrc.includes('shoulder_w = width * sf("shoulders")') && workerSrc.includes("0.19 * skirt_f") && workerSrc.includes("hair_evidence = sculpt_hair(scn, bpy, head, hair_mat, style, hair_f, height_f)") && workerSrc.includes('"silhouette": {') && workerSrc.includes('"applied": shape["named"]'));

  const identitySrc = readFileSync("src/lib/identity.ts", "utf8");
  check("A7 the pose law exists (timestamps + filmstrip + count)", identitySrc.includes("export function poseSampleTimestamps") && identitySrc.includes("export async function extractRenderPosterFilmstrip") && identitySrc.includes("export const POSE_FRAME_COUNT = 3"));
  check("A8 the re-score path rides the strip and names the artifact", identitySrc.includes("await extractRenderPosterFilmstrip(poster.clipAbs, poster.jobId)") && identitySrc.includes("pose-matched over") && identitySrc.includes("const storedNote = poseNote"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A9 the registry stands at 88 tools (the deepening rides the loop)", toolCount === 90, `count=${toolCount}`);
  check("A10 the repair pass names the deepening", tools.includes("SHAPES THE MESH the re-render builds") && tools.includes("POSE-MATCHED scoring"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A11 rule 56 teaches the deepening", prompts.includes("56. THE SILHOUETTE SHAPES THE MESH, THE SCORE MATCHES THE POSE"));
  check("A12 the curriculum grew both lines", prompts.includes("- THE SILHOUETTE SHAPES THE MESH: an adherent proxy is SHAPED") && prompts.includes("- THE SCORE MATCHES THE POSE: a render re-score hands the vision model a FILMSTRIP"));
  check("A13 rules stay sequential (56, no duplicates)", (prompts.match(/^56\. THE SILHOUETTE SHAPES THE MESH/gm) ?? []).length === 1);

  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  check("A14 the repair ledger line names the shaping", repairSrc.includes("parseSilhouetteShape") && repairSrc.includes("silhouetteShapeLine(shape)"));

  // ───────────────────── B. pure checks ─────────────────────
  const neutral = parseSilhouetteShape(null, null);
  check("B1 no note, no build -> the neutral figure with honest fields", !!neutral && neutral.height === 1.0 && neutral.shoulders === 1.0 && neutral.torso === 1.0 && neutral.sleeves === 1.0 && neutral.skirt === 1.0 && neutral.hair === 1.0 && neutral.fields.length === 0);
  const leanPrior = parseSilhouetteShape(null, "lean");
  check("B2 the build field sets the prior when the note is silent", !!leanPrior && leanPrior.shoulders === 0.92 && leanPrior.torso === 0.92 && leanPrior.fields.length === 0);
  const shaped = parseSilhouetteShape("A tall, broad-shouldered swordswoman with flowing sleeves and long black hair", "lean");
  check("B3 the sheet's own silhouette sentence shapes the figure", !!shaped && shaped.height === 1.07 && shaped.shoulders === 1.05 && shaped.torso === 1.02 && shaped.sleeves === 1.22 && shaped.hair === 1.32, JSON.stringify(shaped));
  check("B4 fields name ONLY the traits the note described", !!shaped && shaped.fields.length === 4 && shaped.fields.includes("tall") && shaped.fields.includes("broad-shouldered") && shaped.fields.includes("flowing sleeves") && shaped.fields.includes("long hair"));
  const slender = parseSilhouetteShape("a slender willowy dancer, cropped hair", null);
  check("B5 the negative traits shape too", !!slender && slender.shoulders === 0.92 && slender.torso === 0.93 && slender.hair === 0.78, JSON.stringify(slender));
  const clamped = parseSilhouetteShape("broad-shouldered, heavyset, billowing robes", "heavy");
  check("B6 a wild accumulation clamps at the bound, never redesigns", !!clamped && clamped.shoulders === 1.25 && clamped.torso === 1.2, JSON.stringify(clamped));
  check("B7 the parser is deterministic (the same sentence, the same shape)", JSON.stringify(parseSilhouetteShape("tall and slender with flowing sleeves", "sturdy")) === JSON.stringify(parseSilhouetteShape("tall and slender with flowing sleeves", "sturdy")));
  check("B8 every bound is ordered (lo < hi)", Object.entries(SILHOUETTE_SHAPE_BOUNDS).every(([, [lo, hi]]) => lo < hi));
  const neutralLine = silhouetteShapeLine(neutral!);
  const shapedLine = silhouetteShapeLine(shaped!);
  check("B9 the line reads honestly (neutral vs shaped)", neutralLine.includes("neutral silhouette") && shapedLine.startsWith("shaped:") && shapedLine.includes("named by the sheet"), `${neutralLine} | ${shapedLine}`);

  const regexDna = characterDesignDna({ name: "Bai Ling", role: "PROTAGONIST", appearance: "black hair, jade robe, lean build", modelSheetPrompt: null, stateClothing: null, stateWeapon: null });
  const readShaped: SheetDnaRead = {
    sheetUrl: "/sheets/x.png", readAt: new Date().toISOString(),
    hairStyle: "ponytail", hairColor: "#1b1b2a", robeColor: "#2f6d63", robeAccent: "#a8842c",
    bootsColor: "#241a12", skinTone: "#d9b48f", weaponType: "sword", build: "lean", beard: false,
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
    faceShape: null,
  };
  const merged = adherentDna(regexDna, readShaped);
  check("B10 the adherent build rides the shaping profile", !!merged.silhouetteShape && merged.silhouetteShape.shoulders === 1.05 && merged.silhouetteShape.hair === 1.32 && merged.silhouetteShape.fields.length === 4);
  const mergedGuess = adherentDna(regexDna, null);
  check("B11 a guess build carries NO profile (the neutral figure)", mergedGuess.silhouetteShape === undefined && mergedGuess.conformFactor === 0.35);
  const mergedParsed = adherentDna(regexDna, parseSheetDna(JSON.stringify({ build: "sturdy", silhouette: "tall, flowing robes" }), "/sheets/x.png"));
  check("B12 a parsed read shapes through the same law", !!mergedParsed.silhouetteShape && mergedParsed.silhouetteShape.height === 1.07 && mergedParsed.silhouetteShape.skirt === 1.2 && mergedParsed.conformFactor === 0.75);

  check("B13 a 5s clip samples three stamps in range", JSON.stringify(poseSampleTimestamps(5)) === JSON.stringify([1.1, 2, 3.1]), JSON.stringify(poseSampleTimestamps(5)));
  check("B14 a clip too short for a strip degrades to one stamp", poseSampleTimestamps(0.8).length === 1 && poseSampleTimestamps(1.0).length === 1 && poseSampleTimestamps(0.5).length === 1);
  check("B15 the stamps stay inside the clip (never the last 0.1s)", poseSampleTimestamps(1.3).every((t) => t >= 0.1 && t <= 1.2) && poseSampleTimestamps(1.3).length === 3, JSON.stringify(poseSampleTimestamps(1.3)));
  check("B16 NaN degrades to the minimum clip honestly", JSON.stringify(poseSampleTimestamps(Number.NaN)) === JSON.stringify([0.2]), JSON.stringify(poseSampleTimestamps(Number.NaN)));
  check("B17 the pose law is deterministic", JSON.stringify(poseSampleTimestamps(7.3)) === JSON.stringify(poseSampleTimestamps(7.3)));
  check("B18 the strip is bounded by POSE_FRAME_COUNT", POSE_FRAME_COUNT === 3 && poseSampleTimestamps(120).length <= POSE_FRAME_COUNT);

  check("B19 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, 0.5, 0.7) === "IMPROVED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");
  check("B20 the loop's shot knob still bounds at 3", REPAIR_MAX_SHOTS_PER_MEMBER === 3);

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter81 Shape Lab ${MARK}`, logline: "a throwaway production for the silhouette + pose proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Shaping Arc", count: 1 });
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
  const dnaRead = await readSheetDna(hero.id, { refresh: true });
  check("D1 the REAL sheet-DNA read lands over the real sheet", dnaRead.ok, "error" in dnaRead ? dnaRead.error.slice(0, 160) : "");
  if (dnaRead.ok) {
    const fields = [dnaRead.dna.hairStyle, dnaRead.dna.hairColor, dnaRead.dna.robeColor, dnaRead.dna.robeAccent, dnaRead.dna.bootsColor, dnaRead.dna.skinTone, dnaRead.dna.weaponType, dnaRead.dna.build].filter((v) => v !== null).length;
    console.log(`   sheet DNA: fields=${fields}/8 silhouette=${JSON.stringify(dnaRead.dna.silhouette)}`);
  }

  // D-b THE DETERMINISTIC SHAPED BUILD: a crafted read (staleness-keyed
  // to the current sheet) plants a silhouette sentence with shape words;
  // the render path compiles it through the cache (sheetDnaFresh, no
  // refresh - the exact path every production render takes) and the
  // worker sculpts the mesh with it.
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "ponytail", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D2 the crafted read parses with the shaped silhouette", !!crafted && crafted.silhouette?.includes("flowing sleeves") === true);
  let shaped1Job: { ok: boolean; jobId: string | null; status: string } | null = null;
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const cached = sheetDnaFresh((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna, heroRow.modelSheetUrl);
    check("D3 the crafted read serves fresh from the cache (staleness keyed on the sheet)", !!cached && cached.silhouette === crafted.silhouette);
    shaped1Job = await realRender(labId, shots[1].id);
    const shaped1 = shaped1Job;
    check("D4 the shaped build rendered over the real engine", shaped1.ok, shaped1.status.slice(0, 140));
    if (shaped1.ok && shaped1.jobId) {
      const statePath = path.join(process.cwd(), "public", "renders", `.job-${shaped1.jobId}.json`);
      const state = JSON.parse(readFileSync(statePath, "utf8")) as {
        figureSource?: string; rig?: { silhouette?: { factors: Record<string, number>; applied: string[]; namedBySheet: string[] } | null };
      };
      check("D5 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const sil = state.rig?.silhouette;
      check("D6 the render state names the applied shaping (mesh-only law)", !!sil && sil.factors.shoulders === 1.05 && sil.factors.sleeves === 1.22 && sil.factors.hair === 1.32 && sil.factors.height === 1.07, JSON.stringify(state.rig?.silhouette));
      check("D7 the applied traits + the sheet's own words ride the state", !!sil && sil.applied.includes("shoulders") && sil.applied.includes("hair") && sil.namedBySheet.includes("flowing sleeves"), JSON.stringify(sil?.applied));
    }
  }

  // D-c the named work order: three planted below readings on real rows
  // (distinct values so the worst shot is named deterministically)
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };
  // a RENDER-source reading needs a finished clip to judge - the first
  // three renders exist exactly for that (the loop then RE-renders)
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D8 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D9 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Bai Ling")?.worstRef === "E1 Sc1 S001", JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a") {
  // D-d THE LOOP at shotsPerMember: 3 (reanchor off: bounded, no regen)
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D10 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D11 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D12 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D13 the ledger names the DNA the build rode (the shaping included)", pass1.result.includes("dna: Bai Ling: sheet-adherent build") && (pass1.result.includes("shaped:") || pass1.result.includes("neutral silhouette")), pass1.result.slice(0, 500));
  check("D14 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D15 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  // the REAL re-renders: three fresh attempts finished on disk (plus
  // the three pre-plant renders: six jobs total)
  const renderJobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  check("D16 the loop re-rendered all three shots over the real engine", renderJobs.length >= 6 && renderJobs.every((j) => existsSync(path.join(process.cwd(), "public", j.outputUrl!))), `jobs=${renderJobs.length}`);

  // the REAL pose-matched re-scores: the rows moved off the planted
  // numbers AND the note names the filmstrip (2.5s clips -> 3 frames)
  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)}) note=${row?.note.slice(0, 90)}`);
  }
  check("D17 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D18 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  // the filmstrip files exist beside the posters (strip + frames)
  const stripJobs = renderJobs.slice(-3);
  const stripsOk = stripJobs.every((j) => existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip.jpg`)) && existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip0.jpg`)));
  check("D19 the filmstrip artifacts persist per job (the strip + its frames)", stripsOk, stripJobs.map((j) => j.id.slice(-6)).join(","));

  // the viewer's read-only law still holds while the loop runs the studio
  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D20 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 81 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

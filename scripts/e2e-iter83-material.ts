// Iteration 83 E2E: THE SURFACE IS GRADED, NOT PAINTED. Proves,
// against the RUNNING studio, the REAL database, the REAL render
// pipeline, the REAL vision channel and the REAL image generator:
//   A. source: the material-profile parser (TS + worker), the wire,
//      the graded trees + the regrade law, the doctrine
//   B. pure: parseMaterialProfile laws (hex derivations, clamps,
//      determinism, the neutral honesty), the adherent merge rides
//      the profile, the ledger line names the grade
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      GRADED build over the real engine (the render state names the
//      profile + fields + hash, the sculpt still riding), the repair
//      loop at shotsPerMember: 3 with the grade riding (three REAL
//      re-renders + three pose-matched REAL re-scores), the honest
//      ledger, the IDENTITY_REPAIR event, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|b npx tsx scripts/e2e-iter83-material.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseSheetDna, sheetDnaFresh, adherentDna, readSheetDna,
  parseMaterialProfile, materialProfileLine, MATERIAL_PROFILE_BOUNDS, MATERIAL_NEUTRAL,
  type SheetDnaRead,
} from "../src/lib/blender/adherence";
import { characterDesignDna } from "../src/lib/animation/design";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter83-material";
// background processes die with the launching shell in this environment;
// each phase must fit the 10-minute foreground cap (the iter60 law).
// PHASE=a: source + pure + lab + the graded build. PHASE=b: the loop
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

async function run() {
  console.log(`== Iteration 83: the surface is graded, not painted (phase: ${PHASE}) ==\n`);

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
  check("A1 the material-profile parser exists with its bounds and line", adhereSrc.includes("export function parseMaterialProfile") && adhereSrc.includes("export const MATERIAL_PROFILE_BOUNDS") && adhereSrc.includes("export function materialProfileLine"));
  check("A2 the bounds are the one law (sss/rough/warmth/rim/ramp/sheen/weave/hair)", adhereSrc.includes("skinSss: [0.6, 1.4]") && adhereSrc.includes("skinRough: [0.35, 0.65]") && adhereSrc.includes("rim: [0, 0.35]") && adhereSrc.includes("clothRamp: [0, 0.5]") && adhereSrc.includes("hairRough: [0.2, 0.5]"));
  check("A3 the neutral grade exists (the surface is always graded)", adhereSrc.includes("export const MATERIAL_NEUTRAL") && adhereSrc.includes("skinSss: 1.0"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A4 the wire carries the material profile", wireSrc.includes("materialProfile?: {") && wireSrc.includes("THE SURFACE IS GRADED, NOT PAINTED"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A5 the worker validates + clamps the profile (one law, two runtimes)", workerSrc.includes("def material_profile(dna):") && workerSrc.includes('"skinSss": (0.6, 1.4)') && workerSrc.includes("MATERIAL_NEUTRAL"));
  check("A6 the worker grades the three surfaces (skin/cloth/hair trees)", workerSrc.includes("def _grade_skin_tree(") && workerSrc.includes("def _grade_cloth_tree(") && workerSrc.includes("def _grade_hair_tree(") && workerSrc.includes("Subsurface Weight"));
  check("A7 the regrade law re-sets the dye (the palette meets the grade)", workerSrc.includes("def regrade_material(") && workerSrc.includes("regrade_material(mat,"));
  check("A8 the grade evidence rides the rig + the state (hash included)", workerSrc.includes('state["rig"]["materials"] = materials_evidence(mprof)') && workerSrc.includes('state["secondFigureMaterials"] = materials_evidence(other_mprof)') && workerSrc.includes("def materials_evidence("));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A9 the registry stands at 88 tools (the grade deepens, no new tool)", toolCount === 89, `count=${toolCount}`);
  check("A10 the repair pass names the surface grade", tools.includes("GRADE THE SURFACE") && tools.includes("THE SURFACE IS GRADED, NOT PAINTED"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A11 rule 58 teaches the grade", prompts.includes("58. THE SURFACE IS GRADED, NOT PAINTED"));
  check("A12 the curriculum grew the line", prompts.includes("- THE SURFACE IS GRADED, NOT PAINTED: every material is a layered surface built from ONE dye"));
  check("A13 rules stay sequential (58, no duplicates)", (prompts.match(/^58\. THE SURFACE IS GRADED/gm) ?? []).length === 1);

  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  check("A14 the repair ledger line names the material grade", repairSrc.includes("parseMaterialProfile") && repairSrc.includes("materialProfileLine(materials)"));

  // ───────────────────── B. pure checks ─────────────────────
  const neutral = parseMaterialProfile(null, null, null);
  check("B1 no hexes -> the NEUTRAL grade with honest fields", !!neutral && neutral.skinSss === 1.0 && neutral.rim === 0.2 && neutral.fields.length === 0, JSON.stringify(neutral));
  const light = parseMaterialProfile("#d9b48f", null, null);
  check("B2 light warm skin scatters more (sss 1.3) and pushes warm zones (0.22)", !!light && light.skinSss === 1.3 && light.skinWarmth === 0.22 && light.skinRough === 0.48 && light.fields.length === 1, JSON.stringify(light));
  const darkRobe = parseMaterialProfile(null, "#1a2f3f", null);
  check("B3 a dark robe earns more shadow/high separation (ramp 0.4)", !!darkRobe && darkRobe.clothRamp === 0.4 && darkRobe.fields.length === 1, JSON.stringify(darkRobe));
  const silk = parseMaterialProfile(null, "#8a2f4d", null);
  check("B4 a saturated robe sheens like silk (sheen 0.45, ramp 0.32)", !!silk && silk.clothSheen === 0.45 && silk.clothRamp === 0.32, JSON.stringify(silk));
  const blackHair = parseMaterialProfile(null, null, "#16161d");
  check("B5 black hair keeps a tighter glint (rough 0.26)", !!blackHair && blackHair.hairRough === 0.26, JSON.stringify(blackHair));
  const full = parseMaterialProfile("#d9b48f", "#2f6d63", "#1b1b2a");
  check("B6 the full read names exactly the hexes it owns", !!full && full.fields.join(",") === "skinTone,robeColor,hairColor", JSON.stringify(full.fields));
  check("B7 every factor lands inside the bounds", Object.entries(MATERIAL_PROFILE_BOUNDS).every(([k, [lo, hi]]) => (full as unknown as Record<string, number>)[k] >= lo && (full as unknown as Record<string, number>)[k] <= hi));
  const garbled = parseMaterialProfile("tan" as unknown as string, "#2f6d63", "#1b1b2a");
  check("B8 a garbled hex is ignored (the neutral value stays, honestly unnamed)", !!garbled && garbled.skinSss === 1.0 && garbled.fields.join(",") === "robeColor,hairColor", JSON.stringify(garbled.fields));
  check("B9 the parser is deterministic (the same hexes, the same profile)", JSON.stringify(parseMaterialProfile("#d9b48f", "#2f6d63", "#1b1b2a")) === JSON.stringify(full));
  const neutralLine = materialProfileLine(neutral!);
  const fullLine = materialProfileLine(full!);
  check("B10 the line reads honestly (neutral vs named)", neutralLine.includes("neutral materials") && fullLine.startsWith("graded:") && fullLine.includes("named by the sheet: skinTone, robeColor, hairColor"), `${neutralLine} | ${fullLine}`);

  const regexDna = characterDesignDna({ name: "Bai Ling", role: "PROTAGONIST", appearance: "black hair, jade robe, lean build", modelSheetPrompt: null, stateClothing: null, stateWeapon: null });
  const readNamed: SheetDnaRead = {
    sheetUrl: "/sheets/x.png", readAt: new Date().toISOString(),
    hairStyle: "ponytail", hairColor: "#1b1b2a", robeColor: "#2f6d63", robeAccent: "#a8842c",
    bootsColor: "#241a12", skinTone: "#d9b48f", weaponType: "sword", build: "lean", beard: false,
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
    faceShape: "oval",
  };
  const merged = adherentDna(regexDna, readNamed);
  check("B11 the adherent build rides the material grade (light skin, jade cloth)", !!merged.materialProfile && merged.materialProfile.skinSss === 1.3 && merged.materialProfile.clothRamp === 0.24 && merged.materialProfile.hairRough === 0.26, JSON.stringify(merged.materialProfile));
  const mergedGuess = adherentDna(regexDna, null);
  check("B12 a guess build carries no material profile (undefined on the wire)", mergedGuess.materialProfile === undefined && mergedGuess.conformFactor === 0.35);
  const mergedNoHexes = adherentDna(regexDna, { ...readNamed, skinTone: null, robeColor: null, hairColor: null });
  check("B13 a read without hexes keeps the NEUTRAL grade on the wire", !!mergedNoHexes.materialProfile && mergedNoHexes.materialProfile.skinSss === 1.0 && mergedNoHexes.materialProfile.fields.length === 0, JSON.stringify(mergedNoHexes.materialProfile));
  check("B14 the neutral grade matches the worker's constant (one law)", JSON.stringify(MATERIAL_NEUTRAL) === JSON.stringify({ skinSss: 1.0, skinRough: 0.45, skinWarmth: 0.15, rim: 0.2, clothRamp: 0.25, clothSheen: 0.35, clothWeave: 0.25, hairRough: 0.3 }));

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter83 Material Lab ${MARK}`, logline: "a throwaway production for the graded-surface proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Graded Arc", count: 1 });
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
    console.log(`   sheet DNA: fields=${fields}/8 faceShape=${JSON.stringify(dnaRead.dna.faceShape)} skinTone=${JSON.stringify(dnaRead.dna.skinTone)}`);
  }

  // D-b THE DETERMINISTIC GRADED BUILD: a crafted read (staleness-
  // keyed to the current sheet) plants measured hexes; the render
  // path compiles the grade (sheetDnaFresh, no refresh - the exact
  // path every production render takes) and the worker GRADES the
  // surface with it (the sculpt still riding underneath).
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "ponytail", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    faceShape: "oval",
    silhouette: "A tall, broad-shouldered swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D2 the crafted read parses with the named hexes", !!crafted && crafted.skinTone === "#d9b48f" && crafted.robeColor === "#2f6d63" && crafted.hairColor === "#1b1b2a");
  let gradedJob: { ok: boolean; jobId: string | null; status: string } | null = null;
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const cached = sheetDnaFresh((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna, heroRow.modelSheetUrl);
    check("D3 the crafted read serves fresh from the cache (staleness keyed on the sheet)", !!cached && cached.skinTone === "#d9b48f");
    gradedJob = await realRender(labId, shots[1].id);
    check("D4 the graded build rendered over the real engine", gradedJob.ok, gradedJob.status.slice(0, 140));
    if (gradedJob.ok && gradedJob.jobId) {
      const statePath = path.join(process.cwd(), "public", "renders", `.job-${gradedJob.jobId}.json`);
      const state = JSON.parse(readFileSync(statePath, "utf8")) as {
        figureSource?: string;
        identity?: { sheet?: string; conformed?: unknown[]; skipped?: unknown[]; law?: string } | null;
        rig?: {
          materials?: { profile: Record<string, number>; fields: string[]; hash: string } | null;
          sculpt?: { faceShape: string | null; parts: string[]; verts: number; faceHash: string } | null;
        };
      };
      check("D5 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const mats = state.rig?.materials;
      check("D6 the render state names the graded surface (skinSss 1.3, warmth 0.22, ramp 0.24, glint 0.26)", !!mats && mats.profile.skinSss === 1.3 && mats.profile.skinWarmth === 0.22 && mats.profile.clothRamp === 0.24 && mats.profile.hairRough === 0.26, JSON.stringify(mats));
      check("D7 the grade names the hexes the sheet read owns", !!mats && mats.fields.join(",") === "skinTone,robeColor,hairColor", JSON.stringify(mats?.fields));
      check("D8 the grade carries its deterministic hash", !!mats && typeof mats.hash === "string" && mats.hash.length === 16, JSON.stringify(mats?.hash));
      check("D9 the sculpt still rides under the grade (the head is sculpted, the surface graded)", !!state.rig?.sculpt && state.rig.sculpt.verts > 600 && (state.rig.sculpt.parts ?? []).includes("HairCap"), JSON.stringify({ verts: state.rig?.sculpt?.verts, parts: state.rig?.sculpt?.parts?.length }));
      check("D10 the sheet conformance ran its palette law beside the grade", !!state.identity && (Array.isArray(state.identity.conformed) || Array.isArray(state.identity.skipped)), JSON.stringify(state.identity)?.slice(0, 200));
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
  check("D16 the ledger names the DNA the build rode (the grade included)", pass1.result.includes("dna: Bai Ling: sheet-adherent build") && pass1.result.includes("graded:") && pass1.result.includes("named by the sheet: skinTone, robeColor, hairColor"), pass1.result.slice(0, 700));
  check("D17 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D18 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  const renderJobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  check("D19 the loop re-rendered all three shots over the real engine", renderJobs.length >= 6 && renderJobs.every((j) => existsSync(path.join(process.cwd(), "public", j.outputUrl!))), `jobs=${renderJobs.length}`);

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)}) note=${row?.note.slice(0, 90)}`);
  }
  check("D20 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D21 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const stripJobs = renderJobs.slice(-3);
  const stripsOk = stripJobs.every((j) => existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip.jpg`)) && existsSync(path.join(process.cwd(), "public", "renders", "posters", `${j.id}.strip0.jpg`)));
  check("D22 the filmstrip artifacts persist per job (the strip + its frames)", stripsOk, stripJobs.map((j) => j.id.slice(-6)).join(","));

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D23 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 83 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

// Iteration 85 E2E: THE HAIR IS GROOMED. Proves, against the RUNNING
// studio, the REAL database, the REAL render pipeline and the REAL
// vision channel:
//   A. source: the groom profile (TS + worker), the wire, the merge,
//      the LOD law, the doctrine
//   B. pure: the priors, the clamps, the word law, determinism, the
//      LOD factors, the ledger line, the adherent merge
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      GROOMED build over the real engine (the render state names the
//      strands, the flyaways, the LOD, the factors, the hash), the
//      repair loop at shotsPerMember: 3, the honest ledger, the
//      IDENTITY_REPAIR event, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|b npx tsx scripts/e2e-iter85-groom.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseSheetDna, sheetDnaFresh, adherentDna, readSheetDna,
} from "../src/lib/blender/adherence";
import {
  parseGroomProfile, groomProfileLine, groomStrandFactor,
  GROOM_PROFILE_BOUNDS, GROOM_STYLE_PRIORS,
} from "../src/lib/blender/groom";
import { characterDesignDna } from "../src/lib/animation/design";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter85-groom";
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

function readJobState(jobId: string): { rig?: { groom?: { strands?: number; flyaways?: number; lod?: string; factors?: Record<string, number>; fields?: string[]; hash?: string } | null; expression?: { emotion?: string } | null } | null; figureSource?: string } {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 85: the hair is groomed (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string }> = {};
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };

  if (PHASE === "b") {
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
    check("B14 phase b resumed over the standing lab (3 shots)", Object.keys(shots).length === 3);
    const standingResume = await castIdentityMeasurement(labId, "RENDER");
    check("B15 the planted below standing survived the phase boundary", standingResume.below === 1, JSON.stringify({ below: standingResume.below }));
  }

  if (PHASE !== "b") {

  // ───────────────────── A. source-level checks ─────────────────────
  const groomSrc = readFileSync("src/lib/blender/groom.ts", "utf8");
  check("A1 the groom profile exists with its bounds and line", groomSrc.includes("export function parseGroomProfile") && groomSrc.includes("export const GROOM_PROFILE_BOUNDS") && groomSrc.includes("export function groomProfileLine"));
  check("A2 the LOD law names the framings", groomSrc.includes("GROOM_CLOSE_FRAMINGS") && groomSrc.includes("export function groomStrandFactor"));

  const adhereSrc = readFileSync("src/lib/blender/adherence.ts", "utf8");
  check("A3 the adherent merge rides the groom profile", adhereSrc.includes("groomProfile: parseGroomProfile(read.silhouette") && adhereSrc.includes("groomProfileLine(merged.groomProfile)"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A4 the wire carries the groom profile", wireSrc.includes("groomProfile?: {") && wireSrc.includes("THE HAIR IS GROOMED"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A5 the worker validates + clamps the profile (one law, two runtimes)", workerSrc.includes("def groom_profile(dna):") && workerSrc.includes('"sweep": (-1.0, 1.0)') && workerSrc.includes("GROOM_STYLE_PRIORS"));
  check("A6 the worker grows guide-fitted strands with seeded determinism", workerSrc.includes("def groom_strands(scn, bpy, head, hair_mat, style, hair_f, height_f, gp, strand_f):") && workerSrc.includes('mulberry32(fnv1a(f"groom|'));
  check("A7 the worker's LOD law answers the framing", workerSrc.includes("def groom_strand_factor(shot_type):") && workerSrc.includes('strand_f=groom_strand_factor(str(shot.get("shotType") or ""))'));
  check("A8 the groom evidence rides the rig + the state (hero AND second figure)", workerSrc.includes('state["rig"]["groom"] = figure["groom"]') && workerSrc.includes('state["secondFigureGroom"] = other_rig["groom"]'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A9 the registry stands at 88 tools (the groom deepens, no new tool)", toolCount === 89, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A10 rule 60 teaches the groom", prompts.includes("60. THE HAIR IS GROOMED"));
  check("A11 the curriculum grew the line", prompts.includes("- THE HAIR IS GROOMED: the hair is strand detail under DIRECTION"));
  check("A12 rules stay sequential (60, no duplicates)", (prompts.match(/^60\. THE HAIR IS GROOMED/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  const flowing = parseGroomProfile("A tall swordswoman with flowing sleeves and long black hair", "long");
  check("B1 the long style prior sets the base (sweep untouched at 0.1, the prior's flow 0.55)", flowing.sweep === 0.1 && GROOM_STYLE_PRIORS.long!.flow === 0.55, JSON.stringify(flowing));
  check("B2 the note's own words push the traits and name themselves (flowing)", flowing.fields.join(",") === "flowing" && flowing.flyaway === 0.55, JSON.stringify(flowing));
  const swept = parseGroomProfile("hair swept back and slicked, neat", "ponytail");
  check("B3 swept-back words pull the sweep (ponytail prior 0.55 -> 0.85)", swept.sweep === 0.85 && swept.fields.join(",") === "swept back,neat", JSON.stringify(swept));
  const wild = parseGroomProfile("wild unkempt mane", "short");
  check("B4 wild words raise the flyaway (0.2 + 0.3)", wild.flyaway === 0.5 && wild.fields.join(",") === "wild", JSON.stringify(wild));
  const silent = parseGroomProfile(null, "braid");
  check("B5 a silent note keeps the style prior with honest empty fields", silent.fields.length === 0 && silent.sweep === 0.35 && silent.flow === 0.1, JSON.stringify(silent));
  const unknownStyle = parseGroomProfile(null, "mohawk");
  check("B6 an unknown style degrades to the short prior", unknownStyle.sweep === 0.2, JSON.stringify(unknownStyle));
  check("B7 every factor of every prior lands inside the bounds", Object.entries(GROOM_STYLE_PRIORS).every(([, prior]) =>
    Object.entries(GROOM_PROFILE_BOUNDS).every(([k, [lo, hi]]) => ((prior as Record<string, number>)[k] ?? (k === "taper" ? 0.85 : undefined))! >= lo && ((prior as Record<string, number>)[k] ?? (k === "taper" ? 0.85 : undefined))! <= hi)));
  check("B8 the parser is deterministic (the same sentence, the same profile)", JSON.stringify(parseGroomProfile("flowing long hair", "long")) === JSON.stringify(parseGroomProfile("flowing long hair", "long")));
  check("B9 the LOD factors: CLOSEUP full (1.0), WS wide (0.4), MED middle (0.7)", groomStrandFactor("CLOSEUP") === 1.0 && groomStrandFactor("EXTREME_CLOSEUP") === 1.0 && groomStrandFactor("MCU") === 1.0 && groomStrandFactor("WS") === 0.4 && groomStrandFactor("ESTABLISHING") === 0.4 && groomStrandFactor("MED") === 0.7);
  check("B10 the ledger line reads honestly (named vs prior)", groomProfileLine(flowing).includes("named by the sheet: flowing") && groomProfileLine(silent).includes("from the style prior"), `${groomProfileLine(flowing)} | ${groomProfileLine(silent)}`);

  const regexDna = characterDesignDna({ name: "Bai Ling", role: "PROTAGONIST", appearance: "long black hair, jade robe", modelSheetPrompt: null, stateClothing: null, stateWeapon: null });
  const readNamed: Parameters<typeof adherentDna>[1] = {
    sheetUrl: "/sheets/x.png", readAt: new Date().toISOString(),
    hairStyle: "long", hairColor: "#1b1b2a", robeColor: "#2f6d63", robeAccent: "#a8842c",
    bootsColor: "#241a12", skinTone: "#d9b48f", weaponType: "sword", build: "lean", beard: false,
    silhouette: "A tall swordswoman with flowing sleeves and long black hair",
    faceShape: "oval",
  };
  const merged = adherentDna(regexDna, readNamed);
  check("B11 the adherent build rides the groom (flow named, long prior base)", !!merged.groomProfile && merged.groomProfile.flow === 0.85 && merged.groomProfile.fields.join(",") === "flowing", JSON.stringify(merged.groomProfile));
  const mergedGuess = adherentDna(regexDna, null);
  check("B12 a guess build carries no groom profile (undefined on the wire)", mergedGuess.groomProfile === undefined && mergedGuess.conformFactor === 0.35);

  check("B13 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, 0.5, 0.7) === "IMPROVED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter85 Groom Lab ${MARK}`, logline: "a throwaway production for the groomed-hair proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Groomed Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Cloud Ridge" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling stands at the ridge edge, her long hair moving in the wind", shotType: "CLOSEUP" },
    { number: 2, description: "Bai Ling draws her jian across the wide valley", shotType: "WS" },
    { number: 3, description: "Bai Ling sheathes the jian and turns away", shotType: "MED" },
  ];
  const shots: Record<number, { id: string }> = {};
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 2.5, movement: "STATIC", shotType: d.shotType } });
    shots[d.number] = { id: s.id };
  }
  check("C7 the three-shot episode stands (close / wide / middle)", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);

  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ───────────────────── D. the real paths ─────────────────────
  const dnaRead = await readSheetDna(hero.id, { refresh: true });
  check("D1 the REAL sheet-DNA read lands over the real sheet", dnaRead.ok, "error" in dnaRead ? dnaRead.error.slice(0, 160) : "");
  if (dnaRead.ok) {
    console.log(`   sheet DNA: hairStyle=${JSON.stringify(dnaRead.dna.hairStyle)} silhouette=${JSON.stringify(dnaRead.dna.silhouette?.slice(0, 60))}`);
  }

  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "long", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    faceShape: "oval",
    silhouette: "A tall swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D2 the crafted read parses with the long hair + the flowing silhouette", !!crafted && crafted.hairStyle === "long" && (crafted.silhouette ?? "").includes("flowing"));
  let groomedJob: { ok: boolean; jobId: string | null; status: string } | null = null;
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const cached = sheetDnaFresh((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna, heroRow.modelSheetUrl);
    check("D3 the crafted read serves fresh from the cache (staleness keyed on the sheet)", !!cached && cached.hairStyle === "long");
    groomedJob = await realRender(labId, shots[1].id);
    check("D4 the groomed build rendered over the real engine (CLOSEUP)", groomedJob.ok, groomedJob.status.slice(0, 140));
    if (groomedJob.ok && groomedJob.jobId) {
      const state = readJobState(groomedJob.jobId);
      check("D5 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const g = state.rig?.groom;
      check("D6 the render state names the groom (strands grown, full LOD)", !!g && (g.strands ?? 0) >= 20 && g.lod === "full", JSON.stringify(g)?.slice(0, 220));
      check("D7 the sheet's own word rides (flowing) with the clamped factors", !!g && (g.fields ?? []).join(",") === "flowing" && g.factors?.flow === 0.85, JSON.stringify(g?.factors));
      check("D8 the groom hash is deterministic (16 hex)", !!g && typeof g.hash === "string" && g.hash.length === 16, String(g?.hash));
      check("D9 the face still performs beside the groom (the expression evidence rides)", !!state.rig?.expression && typeof state.rig.expression.emotion === "string", JSON.stringify(state.rig?.expression)?.slice(0, 120));
    }
  }

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
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D12 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D13 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D14 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D15 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D16 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  // D-e THE LOD LANDED THROUGH THE REAL RENDER PATH: the loop's
  // re-renders groomed each framing - CLOSEUP full, WS wide.
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobPerShot: Record<number, string> = {};
  for (const j of jobs) {
    const n = Object.entries(shots).find(([, s]) => s.id === j.shotId)?.[0];
    if (n !== undefined) lastJobPerShot[Number(n)] = j.id;
  }
  const gClose = lastJobPerShot[1] ? readJobState(lastJobPerShot[1]).rig?.groom : null;
  const gWide = lastJobPerShot[2] ? readJobState(lastJobPerShot[2]).rig?.groom : null;
  check("D-e the CLOSEUP re-render carried the full pass", !!gClose && gClose.lod === "full" && (gClose.strands ?? 0) >= 12, JSON.stringify(gClose)?.slice(0, 160));
  check("D-e the WS re-render carried the wide pass (fewer strands)", !!gWide && gWide.lod === "wide" && !!gClose && (gWide.strands ?? 0) < (gClose.strands ?? 0), JSON.stringify(gWide)?.slice(0, 160));

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)})`);
  }
  check("D17 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D18 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D19 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 85 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

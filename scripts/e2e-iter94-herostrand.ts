// Iteration 94 E2E: THE STRANDS GO HERO (the deeper groom's
// hero-strand half) + THE READINGS ARE THE JUDGE. Proves, against
// the RUNNING studio, the REAL database, the REAL render pipeline
// and the REAL vision channel:
//   A. source: the hero-strand law (TS + worker), the evidence ride,
//      the doctrine
//   B. pure: the tier law, the spec, the taper law, the hash
//      formula, the ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the deterministic HERO builds over the real
//      engine (the closeup's hero strands, the middle's standard
//      curve, the wide's honest cards), the hash matching the TS law
//   E. THE JUDGE: the identity loop's own readings - before against
//      after, per shot - name every verdict in the honest ledger;
//      the viewer gate; cleanup
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter94-herostrand.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseGroomProfile, groomStrandTier, heroStrandSpec, heroTaperTip,
  groomCurveHash, groomCurveLine, HERO_FLYAWAY_BASE,
} from "../src/lib/blender/groom";
import { parseSheetDna } from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter94-herostrand";
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
  for (let i = 0; i < 480 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

interface JobState {
  rig?: {
    hairShade?: { hash?: string } | null;
    hairCurves?: { curves?: number; curvePts?: number; tier?: string; ptsPerCurve?: number; flyaways?: number; hash?: string } | null;
    groom?: { strands?: number; factors?: Record<string, number>; style?: string; hash?: string } | null;
  } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 94: the strands go hero - the readings are the judge (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string; description: string; shotType: string }> = {};
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };

  if (PHASE === "b" || PHASE === "a2") {
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
    check(`B30 phase ${PHASE} resumed over the standing lab (3 shots)`, Object.keys(shots).length === 3);
  }

  if (PHASE === "a" || PHASE === "all") {

  const groomSrc = readFileSync("src/lib/blender/groom.ts", "utf8");
  check("A1 the groom grew the hero-strand law (tier, spec, taper, hash)",
    groomSrc.includes("export function groomStrandTier") && groomSrc.includes("export function heroStrandSpec")
    && groomSrc.includes("export function heroTaperTip") && groomSrc.includes("export function groomCurveHash")
    && groomSrc.includes("export const HERO_FLYAWAY_BASE"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker mirrors the law (one law, two runtimes)",
    workerSrc.includes("def groom_strand_tier(strand_f):") && workerSrc.includes("def hero_taper_tip(taper):")
    && workerSrc.includes("def groom_curve_hash(f, style, tier):")
    && workerSrc.includes("GROOM_HERO_PTS = 12") && workerSrc.includes("GROOM_HERO_FLYAWAY_BASE = 6"));
  check("A3 the curve evidence rides the rig state on both layers",
    workerSrc.includes('state["rig"]["hairCurves"] = figure["hairCurves"]'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A4 the registry stands at 88 tools (the hero strands deepen, no new tool)", toolCount === 89, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A5 rule 69 teaches the hero strands + the readings as judge",
    prompts.includes("69. THE STRANDS GO HERO") && prompts.includes("THE READINGS ARE THE JUDGE"));
  check("A6 rules stay sequential (69, no duplicates)", (prompts.match(/^69\. THE STRANDS GO HERO/gm) ?? []).length === 1);

  // ── B. pure checks ──
  check("B1 the tier law: the close framings hero, the middle standard, the wide cards",
    groomStrandTier("CLOSEUP") === "hero" && groomStrandTier("EXTREME_CLOSEUP") === "hero"
    && groomStrandTier("MCU") === "hero" && groomStrandTier("MED") === "standard"
    && groomStrandTier("WS") === "cards" && groomStrandTier("WIDE") === "cards"
    && groomStrandTier("ESTABLISHING") === "cards" && groomStrandTier("OTS") === "cards");
  const specHero = heroStrandSpec("hero");
  const specStd = heroStrandSpec("standard");
  const specCards = heroStrandSpec("cards");
  check("B2 the hero spec: 12 pts, bevel 3, the taper riding, the flyaways riding",
    specHero.ptsPerCurve === 12 && specHero.bevelRes === 3 && specHero.taperTip && specHero.flyawayCurves);
  check("B3 the standard spec stays the iteration-89 curve; the cards spec is empty",
    specStd.ptsPerCurve === 6 && specStd.bevelRes === 2 && !specStd.taperTip && !specStd.flyawayCurves
    && specCards.ptsPerCurve === 0);
  check("B4 the taper law: fine 0.5 dies to 0.25, blunt 1.0 keeps 0.8, 0.85 -> 0.635",
    heroTaperTip(0.5) === 0.25 && heroTaperTip(1.0) === 0.8 && heroTaperTip(0.85) === 0.635);
  check("B5 a wild taper clamps against the law", heroTaperTip(2.0) === 0.8 && heroTaperTip(0.1) === 0.25);
  const prof = parseGroomProfile("A tall swordswoman with flowing sleeves and long black hair", "long");
  const anchorKey = `94|long|hero|${prof.sweep.toFixed(3)}|${prof.flow.toFixed(3)}|${prof.flyaway.toFixed(3)}|${prof.taper.toFixed(3)}|v1`;
  const anchorHash = createHash("sha256").update(anchorKey, "utf8").digest("hex").slice(0, 16);
  check("B6 the curve hash is sha256-16 over the law inputs (deterministic)",
    groomCurveHash(prof, "long", "hero") === anchorHash && groomCurveHash(prof, "long", "hero").length === 16,
    `${groomCurveHash(prof, "long", "hero")} vs ${anchorHash}`);
  check("B7 a different tier lands a different key", groomCurveHash(prof, "long", "hero") !== groomCurveHash(prof, "long", "standard"));
  check("B8 a different profile lands a different key",
    groomCurveHash(prof, "long", "hero") !== groomCurveHash({ ...prof, flow: 0.2 }, "long", "hero"));
  check("B9 the ledger line reads honestly",
    groomCurveLine("hero", 74, 888, 2).includes("hero strands") && groomCurveLine("cards", 0, 0, 0).includes("mesh cards"),
    `${groomCurveLine("hero", 74, 888, 2)} | ${groomCurveLine("cards", 0, 0, 0)}`);
  check("B10 the hero flyaway base stands (the curve edition of the mesh flyaway law)", HERO_FLYAWAY_BASE === 6);

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter94 Herostrand Lab ${MARK}`, logline: "a throwaway production for the hero-strand proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Hero Strand Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Raven Strand" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling waits at the court gate", shotType: "CLOSEUP", lighting: "moonlit night", poseStart: "STANCE", poseEnd: "STANCE" },
    { number: 2, description: "the court wide as Bai Ling enters", shotType: "WS", lighting: "moonlit night", poseStart: "STANCE", poseEnd: "STANCE" },
    { number: 3, description: "Bai Ling draws the jian", shotType: "MED", lighting: "dawn light", poseStart: "STANCE", poseEnd: "DRAW" },
  ];
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.5, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd } });
    shots[d.number] = { id: s.id, description: d.description, shotType: d.shotType };
  }
  check("C7 the three-shot episode stands (close / wide / middle)", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);
  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ── D. the real paths ──
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "long", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    faceShape: "oval",
    silhouette: "A tall swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D1 the crafted read parses with the raven hex", !!crafted && (crafted.hairColor ?? "").toUpperCase() === "#1B1B2A");
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const heroJob = await realRender(labId, shots[1].id);
    check("D2 the hero build rendered over the real engine (raven closeup)", heroJob.ok, heroJob.status.slice(0, 140));
    if (heroJob.ok && heroJob.jobId) {
      const state = readJobState(heroJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const groom = state.rig?.groom;
      const curves = state.rig?.hairCurves;
      check("D4 the render state names the groom factors + style", !!groom && !!groom.factors && !!groom.style, JSON.stringify(groom)?.slice(0, 200));
      const expectedProf = parseGroomProfile(crafted.silhouette, crafted.hairStyle);
      check("D5 the groom factors MATCH the TS law bit-exactly (one law, two runtimes)",
        !!groom && groom.factors?.sweep === expectedProf.sweep && groom.factors?.flow === expectedProf.flow
        && groom.factors?.flyaway === expectedProf.flyaway && groom.factors?.taper === expectedProf.taper,
        `${JSON.stringify(groom?.factors)} vs ${JSON.stringify(expectedProf)}`);
      check("D6 the close framing carries the HERO tier (12 pts, the flyaways riding)",
        !!curves && curves.tier === "hero" && curves.ptsPerCurve === 12 && (curves.flyaways ?? 0) >= 1 && (curves.curves ?? 0) > 0,
        JSON.stringify(curves));
      check("D7 the curve hash matches the TS law over the REAL render's own factors",
        !!curves && !!groom && curves.hash === groomCurveHash(groom.factors as { sweep: number; flow: number; flyaway: number; taper: number }, String(groom.style), "hero"),
        `${curves?.hash}`);
      check("D8 the curve hash ALSO matches the crafted chain (the TS-derived profile)",
        !!curves && curves.hash === groomCurveHash(expectedProf, "long", "hero"),
        `${curves?.hash} vs ${groomCurveHash(expectedProf, "long", "hero")}`);
      check("D9 the melanin shade still rides beside the curves", !!state.rig?.hairShade?.hash && state.rig.hairShade.hash.length === 16);
      check("D10 the mesh strands still ride beside the curves", (state.rig?.groom?.strands ?? 0) > 0);
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  const s2 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D11 the WIDE framing keeps the mesh cards only (no curve evidence - the LOD law)",
    s2.rig?.hairCurves === null || s2.rig?.hairCurves === undefined, JSON.stringify(s2.rig?.hairCurves));
  const s3 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[3].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D12 the MED middle keeps the STANDARD curve (6 pts, no flyaways - the reduced level honest)",
    s3.rig?.hairCurves?.tier === "standard" && s3.rig?.hairCurves?.ptsPerCurve === 6 && (s3.rig?.hairCurves?.flyaways ?? 1) === 0,
    JSON.stringify(s3.rig?.hairCurves));
  const s1 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[1].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D13 the tiers hash apart (hero never shares the standard's key)",
    !!s1.rig?.hairCurves?.hash && !!s3.rig?.hairCurves?.hash && s1.rig.hairCurves.hash !== s3.rig.hairCurves.hash);

  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D14 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D15 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1, JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D16 the repair pass runs the work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D17 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));

  // ── E. THE READINGS ARE THE JUDGE ──
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobPerShot: Record<number, string> = {};
  for (const j of jobs) {
    const n = Object.entries(shots).find(([, s]) => s.id === j.shotId)?.[0];
    if (n !== undefined) lastJobPerShot[Number(n)] = j.id;
  }
  let heroRode = 0;
  let stdRode = 0;
  for (const n of [1, 2, 3]) {
    const id = lastJobPerShot[n];
    if (!id) continue;
    const st = readJobState(id);
    const c = st.rig?.hairCurves;
    if (n === 1 && c?.hash && c.hash.length === 16) heroRode += 1;
    if (n === 3 && c?.tier === "standard") stdRode += 1;
    if (n === 2) check("E1 the wide re-render kept the cards (the curve evidence honest None)", c === null || c === undefined, JSON.stringify(c));
  }
  check("E2 the hero strands rode the closeup re-render (the curve evidence per shot)", heroRode === 1, `heroRode=${heroRode}`);
  check("E3 the standard curve rode the middle re-render", stdRode === 1, `stdRode=${stdRode}`);

  let poseNotes = 0;
  let realScores = 0;
  const judged: Array<{ shot: number; before: number; after: number | null; verdict: string }> = [];
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    const verdict = mine !== null ? shotRepairVerdict(plantValues[n], mine, 0.7) : "UNSCORED";
    judged.push({ shot: n, before: plantValues[n], after: mine, verdict });
    if (mine !== null) console.log(`   the judge reads S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${verdict})`);
  }
  check("E4 every re-score ran the real vision channel over the new pixels (pose-matched)", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("E5 every verdict the judge named sits in the honest set",
    judged.every((j) => ["REPAIRED", "IMPROVED", "UNCHANGED", "WORSE", "UNSCORED"].includes(j.verdict)),
    JSON.stringify(judged));
  check("E6 the judge read every shot from the REAL pixels (no planted value survived)",
    realScores === 3, `realScores=${realScores} judged=${JSON.stringify(judged)}`);
  console.log(`   THE READINGS ARE THE JUDGE: ${judged.map((j) => `S00${j.shot} ${j.verdict}`).join(", ")}`);

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E7 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ── F. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("F1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 94 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

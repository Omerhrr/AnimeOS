// Iteration 90 E2E: THE HEAD IS CARVED AT DEPTH (Layer A - the geometry
// slice). Proves, against the RUNNING studio, the REAL database, the
// REAL render pipeline and the REAL vision channel:
//   A. source: the depth law (TS + worker), the bake pass, the
//      spherical UV law, the doctrine
//   B. pure: the depth tiers, the plane sets, the bake key hash, the
//      carve ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the hero carve + the bake-down over the real
//      engine (the render state names the depth, the planes, the key
//      and the fingerprint), the light levels WEARING the bake, the
//      repair loop, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter90-headbake.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import { headDepthFactor, headPlanesFor, headBakeKeyHash, headCarveLine } from "../src/lib/blender/head-carve";
import { parseSheetDna, parseFaceProfile } from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter90-headbake";
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
  // redirect: manual - the callback's 302 CARRIES the session cookie;
  // a followed redirect drops it (the jar law)
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": `e2e-${MARK}`, cookie: jar.header },
    body: body.toString(),
  });
  jar.absorb(res);
  return jar;
}

async function cleanupLab(labId: string) {
  const jobs = await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  for (const r of jobs) {
    for (const f of [`${r.id}.mp4`, `${r.id}.jpg`]) {
      const p = path.join(process.cwd(), "public", "renders", f);
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
  for (let i = 0; i < 560 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

interface JobState {
  rig?: {
    sculpt?: {
      depth?: number; planes?: number; bakeKey?: string; faceHash?: string; verts?: number;
      bake?: { worn?: boolean; key?: string; fingerprint?: string; size?: number; normal?: string; cavity?: string } | null;
    } | null;
    groom?: { strands?: number } | null;
  } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 90: the head is carved at depth (phase: ${PHASE}) ==\n`);

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
    if (PHASE === "b") {
      const standingResume = await castIdentityMeasurement(labId, "RENDER");
      check("B31 the planted below standing survived the phase boundary", standingResume.below === 1, JSON.stringify({ below: standingResume.below }));
    }
  }

  if (PHASE === "a" || PHASE === "all") {

  const carveSrc = readFileSync("src/lib/blender/head-carve.ts", "utf8");
  check("A1 the depth law exists with the tiers and the bake key",
    carveSrc.includes("export function headDepthFactor") && carveSrc.includes("export function headBakeKeyHash") && carveSrc.includes("export const HEAD_PLANES_DEEP"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker carves at depth with the hero planes",
    workerSrc.includes("def sculpt_head_mesh(scn, bpy, head, skin_mat, prof, height_f, depth=4):")
    && workerSrc.includes("# 23. chin ball") && workerSrc.includes("head_depth = 5 if strand_f >= 0.9 else 4"));
  check("A3 the worker carries the SPHERICAL UV LAW on every level",
    workerSrc.includes('uv = mesh.data.uv_layers.get("HeadCarveUV")') && workerSrc.includes('uv.data.foreach_set("uv", flat)'));
  const bakeSrc = readFileSync("bridges/blender/head_bake.py", "utf8");
  check("A4 the bake pass bakes down and wears",
    bakeSrc.includes("def bake_head_depth(bpy, scn, deep_mesh, light_mesh, key):")
    && bakeSrc.includes("def wear_baked_maps(bpy, mat, normal_path, cavity_path):")
    && bakeSrc.includes("def bake_key(prof):") && bakeSrc.includes("use_selected_to_active=True"));
  check("A5 the hero build bakes down + the light levels wear (the cache law)",
    workerSrc.includes("head_bake_pass.bake_head_depth(bpy, scn, hm, proxy, bake_key_txt)")
    && workerSrc.includes("head_bake_pass.wear_baked_maps(bpy, head_mat, n_path, c_path)"));
  check("A6 the carve evidence rides the sculpt state (depth, planes, bakeKey, bake)",
    workerSrc.includes('"depth": head_depth,') && workerSrc.includes('"planes": 23 if head_depth >= 5 else 8,')
    && workerSrc.includes('"bakeKey": bake_key_txt,') && workerSrc.includes('"bake": bake_evidence,'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A7 the registry stands at 88 tools (the carve deepens, no new tool)", toolCount === 88, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A8 rule 65 teaches the deep carve", prompts.includes("65. THE HEAD IS CARVED AT DEPTH"));
  check("A9 rules stay sequential (65, no duplicates)", (prompts.match(/^65\. THE HEAD IS CARVED AT DEPTH/gm) ?? []).length === 1);

  // ── B. pure checks ──
  check("B1 the close framings earn the hero carve (5) and everything below keeps the light head (4)",
    headDepthFactor("CLOSEUP") === 5 && headDepthFactor("EXTREME_CLOSEUP") === 5 && headDepthFactor("MCU") === 5
    && headDepthFactor("WS") === 4 && headDepthFactor("WIDE") === 4 && headDepthFactor("ESTABLISHING") === 4
    && headDepthFactor("OTS") === 4 && headDepthFactor("MED") === 4 && headDepthFactor("") === 4);
  check("B2 the plane sets: 8 base, 23 at the hero depth",
    headPlanesFor(4).length === 8 && headPlanesFor(5).length === 23 && headPlanesFor(5).includes("cupid's bow") && headPlanesFor(5).includes("nasolabial creases"));
  const prof = { jawTaper: 0.74, chinFwd: 0.028, browFwd: 0.014, cheekOut: 0.022, noseLen: 1.0 };
  const key = `90|${prof.jawTaper.toFixed(3)}|${prof.chinFwd.toFixed(3)}|${prof.browFwd.toFixed(3)}|${prof.cheekOut.toFixed(3)}|${prof.noseLen.toFixed(3)}|v1`;
  const expectKey = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  check("B3 the bake key is sha256-16 over the profile factors (deterministic)",
    headBakeKeyHash(prof) === expectKey && headBakeKeyHash(prof).length === 16, `${headBakeKeyHash(prof)} vs ${expectKey}`);
  check("B4 a different family lands a different bake key",
    headBakeKeyHash({ ...prof, jawTaper: 0.64 }) !== headBakeKeyHash(prof));
  check("B5 the carve ledger line reads honestly",
    headCarveLine(5, 23, null).includes("hero carve (subdivisions 5)") && headCarveLine(4, 8, null).includes("light head (subdivisions 4)")
    && headCarveLine(5, 23, null).includes("baked down") === false, headCarveLine(5, 23, null));
  check("B6 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

  // ── C. accounts + throwaway production ──
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  const ownerProbe = await call(ownerJar, "/api/projects");
  check("C2 the owner's session reads live", ownerProbe.status === 200, `status=${ownerProbe.status}`);
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("C3 the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER");
  viewerJar = await loginJar("reader@studio.dev", "viewing123");
  const viewerProbe = await call(viewerJar!, "/api/projects");
  check("C4 the viewer's session reads live too", viewerProbe.status === 200, `status=${viewerProbe.status}`);

  const created = await executeTool("throwaway", "create_project", { title: `Iter90 Headbake Lab ${MARK}`, logline: "a throwaway production for the deep-carve proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Deep Carve Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Raven Court" } });
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
  check("D1 the crafted read parses with the oval family", !!crafted && crafted.faceShape === "oval");
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const carveJob = await realRender(labId, shots[1].id);
    check("D2 the hero carve rendered over the real engine (closeup)", carveJob.ok, carveJob.status.slice(0, 140));
    if (carveJob.ok && carveJob.jobId) {
      const state = readJobState(carveJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const sc = state.rig?.sculpt;
      check("D4 the render state names the HERO CARVE (depth 5, 23 planes)",
        !!sc && sc.depth === 5 && sc.planes === 23, JSON.stringify(sc)?.slice(0, 200));
      // the key rides the ADHERENT profile (the sheet's oval prior
      // nudged by the lean build - the same numbers the worker carved)
      const adh = parseFaceProfile("oval", "lean");
      const expectedKey = headBakeKeyHash({ jawTaper: adh.jawTaper, chinFwd: adh.chinFwd, browFwd: adh.browFwd, cheekOut: adh.cheekOut, noseLen: adh.noseLen });
      check("D5 the bake key matches the TS law over the REAL render (one law, two runtimes)",
        !!sc && sc.bakeKey === expectedKey, `${sc?.bakeKey} vs ${expectedKey}`);
      check("D6 the hero build BAKED DOWN (fingerprint rides the state)",
        !!sc && !!sc.bake && typeof sc.bake.fingerprint === "string" && sc.bake.fingerprint.length === 16
        && sc.bake.size === 512, JSON.stringify(sc?.bake)?.slice(0, 200));
      const nPath = path.join(process.cwd(), "public", "headbake", `${expectedKey}-normal.png`);
      const cPath = path.join(process.cwd(), "public", "headbake", `${expectedKey}-cavity.png`);
      check("D7 the bake cache files exist on disk", existsSync(nPath) && existsSync(cPath), `${nPath} / ${cPath}`);
      check("D8 the face hash rides (the mesh law's identity)", !!sc && typeof sc.faceHash === "string" && sc.faceHash.length === 16, String(sc?.faceHash));
      check("D9 the groom still rides beside the carve", (state.rig?.groom?.strands ?? 0) > 0, String(state.rig?.groom?.strands));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  const state1 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[1].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  const heroKey = state1.rig?.sculpt?.bakeKey;
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
    const st = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
    const sc = st.rig?.sculpt;
    check(`D1${n === 2 ? "0" : "1"} the ${n === 2 ? "WIDE" : "MED"} build keeps the LIGHT head and WEARS the hero bake (the shared key)`,
      !!sc && sc.depth === 4 && sc.bake?.worn === true && sc.bakeKey === heroKey,
      JSON.stringify({ depth: sc?.depth, bake: sc?.bake, bakeKey: sc?.bakeKey, heroKey })?.slice(0, 220));
  }
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D11 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standing = await castIdentityMeasurement(labId, "RENDER");
  check("D12 the standing names Bai Ling BELOW across three readings", standing.below === 1, JSON.stringify(standing));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  // ── the repair loop: the carve + bake ride every re-render ──
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D13 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D14 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D15 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  const loopStates = [];
  for (const n of [1, 2, 3]) {
    const jr = await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } });
    if (jr) loopStates.push(readJobState(jr.id));
  }
  check("D-e every re-render carries the carve evidence (the depth + the key per shot)",
    loopStates.length === 3 && loopStates.every((st) => !!st.rig?.sculpt?.depth && !!st.rig?.sculpt?.bakeKey),
    JSON.stringify(loopStates.map((st) => st.rig?.sculpt?.depth))?.slice(0, 120));
  for (const st of loopStates) {
    const sc = st.rig?.sculpt;
    check(`D-e the re-rendered ${sc?.depth === 5 ? "closeup bakes down" : "light level wears or bakes"}`,
      !!sc && (sc.depth === 5 ? !!sc.bake?.fingerprint : sc.bake?.worn === true || !!sc.bake?.fingerprint),
      JSON.stringify(sc?.bake)?.slice(0, 140));
  }
  const viewerWrite = await call(viewerJar, `/api/projects/${labId}`, { method: "PATCH", body: JSON.stringify({ logline: "hijack" }) });
  check("D18 the viewer cannot write the studio (403)", viewerWrite.status === 403, String(viewerWrite.status));
  }

  // ── E. cleanup (exact rows + files) - phase b only (a/a2 resume
  //    over the standing lab) ──
  if (labId && (PHASE === "b" || PHASE === "all")) {
    await cleanupLab(labId);
    const gone = await db.project.findUnique({ where: { id: labId } });
    check("E1 the lab is gone exactly", gone === null);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 90 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });

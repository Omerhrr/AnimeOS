// Iteration 93 E2E: THE FACE CREASES WHEN IT ACTS (Layer A - the
// wrinkle-map slice, the last of the Layer A rest). Proves, against
// the RUNNING studio, the REAL database, the REAL render pipeline and
// the REAL vision channel:
//   A. source: the wrinkle law (TS + worker + the bake pass), the
//      live drive, the doctrine
//   B. pure: the key formula, the strength law, the shape set, the
//      ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the closeup BAKING the three-map set over the
//      REAL render (the state naming the wrinkle key bit-exact
//      against the TS law over the state's own factors, the
//      fingerprints, the files on disk), the WIDE build WEARING the
//      set into its copied tree while the drive weights ride, the
//      repair loop, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter93-wrinkle.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import { WRINKLE_SHAPES, WRINKLE_STRENGTH, wrinkleKeyHash, wrinkleStrengthFor, wrinkleLine } from "../src/lib/blender/wrinkle";
import { parseSheetDna } from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter93-wrinkle";
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

interface WrinkleStateEv {
  worn?: boolean;
  baked?: boolean | string[]; // the wear's flag, or the hero's baked-shape list
  key?: string;
  shapes?: string[] | Record<string, { file?: string; fingerprint?: string }>;
  strength?: number;
  note?: string;
}
interface JobState {
  rig?: {
    sculpt?: {
      depth?: number;
      bakeKey?: string;
      factors?: Record<string, number>;
      bake?: { worn?: boolean; fingerprint?: string } | null;
      wrinkleKey?: string;
      wrinkle?: WrinkleStateEv | null;
    } | null;
    groom?: { strands?: number } | null;
    materials?: { hash?: string } | null;
    skinDepth?: { hash?: string } | null;
    expression?: { hash?: string } | null;
  } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

/** The TS-side mirror of the state's own factor string (the same law
 * the smoke's render half proves - here against the E2E's own read). */
function expectedWrinkleKey(factors: Record<string, number> | undefined): string {
  const f = factors ?? {};
  const num = (k: string): number => {
    const v = f[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0.0;
  };
  return wrinkleKeyHash({
    jawTaper: num("jawTaper"),
    chinFwd: num("chinFwd"),
    browFwd: num("browFwd"),
    cheekOut: num("cheekOut"),
    noseLen: num("noseLen"),
  });
}

async function run() {
  console.log(`== Iteration 93: the face creases when it acts (phase: ${PHASE}) ==\n`);

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
    check(`B20 phase ${PHASE} resumed over the standing lab (3 shots)`, Object.keys(shots).length === 3);
    if (PHASE === "b") {
      const standingResume = await castIdentityMeasurement(labId, "RENDER");
      check("B21 the planted below standing survived the phase boundary", standingResume.below === 1, JSON.stringify({ below: standingResume.below }));
    }
  }

  if (PHASE === "a" || PHASE === "all") {

  const lawSrc = readFileSync("src/lib/blender/wrinkle.ts", "utf8");
  check("A1 the wrinkle law exists (the shape set, the strength, the key, the line)",
    lawSrc.includes("export const WRINKLE_SHAPES") && lawSrc.includes("export const WRINKLE_STRENGTH")
    && lawSrc.includes("export function wrinkleKeyHash") && lawSrc.includes("export function wrinkleStrengthFor")
    && lawSrc.includes("export function wrinkleLine") && lawSrc.includes("export const WRINKLE_BAKE_WEIGHT"));

  const passSrc = readFileSync("bridges/blender/head_bake.py", "utf8");
  check("A2 the bake pass carries the wrinkle half (one law, two runtimes)",
    passSrc.includes("def wrinkle_key(prof):") && passSrc.includes("def bake_wrinkle_set(")
    && passSrc.includes("def wear_wrinkle_maps(") && passSrc.includes("def wrinkle_strength_for(weight):")
    && passSrc.includes('WRINKLE_SHAPES = ("browKnit", "cheekRaise", "mouthCorner")')
    && passSrc.includes("WRINKLE_STRENGTH = 0.85"));
  check("A3 the bake evaluates BOTH surfaces at the expression (the large move cancels)",
    passSrc.includes("kb_d.value = WRINKLE_BAKE_WEIGHT") && passSrc.includes("kb_l.value = WRINKLE_BAKE_WEIGHT"));
  check("A4 the worn strengths REST at zero until the drive moves them",
    passSrc.includes('n_map.inputs["Strength"].default_value = 0.0  # the REST law'));
  check("A5 jawOpen earns no map (a bone move, named)", !passSrc.includes('"jawOpen"') || passSrc.includes("jawOpen earns NO map"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A6 the worker mirrors the drive law (the strengths ride the LIVE weights)",
    workerSrc.includes("WRINKLE_STRENGTH = 0.85") && workerSrc.includes("def wrinkle_strength_for(weight):")
    && workerSrc.includes('wnode.inputs["Strength"].default_value = wrinkle_strength_for(wweights.get(wshape, 0.0))'));
  check("A7 the drive rests at zero (no faked crease on a quiet face)",
    workerSrc.includes('wweights = {"browKnit": 0.0, "cheekRaise": 0.0, "mouthCorner": 0.0}'));
  check("A8 the hero bakes the set, the lower levels wear it (the framing law)",
    workerSrc.includes("head_bake_pass.bake_wrinkle_set(")
    && workerSrc.includes("head_bake_pass.wear_wrinkle_maps(bpy, head_mat, wrinkle_key_txt)"));
  check("A9 the wrinkle evidence rides the sculpt state (key + set)",
    workerSrc.includes('"wrinkleKey": wrinkle_key_txt,') && workerSrc.includes('"wrinkle": wrinkle_evidence,')
    && workerSrc.includes('"wrinkleNodes": wrinkle_nodes,'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A10 the registry stands at 88 tools (the creases deepen, no new tool)", toolCount === 88, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A11 rule 68 teaches the creasing face", prompts.includes("68. THE FACE CREASES WHEN IT ACTS"));
  check("A12 rules stay sequential (68, no duplicates)", (prompts.match(/^68\. THE FACE CREASES WHEN IT ACTS/gm) ?? []).length === 1);

  // ── B. pure checks ──
  check("B1 the shape set is the three crease-bearing shapes (jawOpen excluded)",
    WRINKLE_SHAPES.length === 3
    && WRINKLE_SHAPES[0] === "browKnit" && WRINKLE_SHAPES[1] === "cheekRaise" && WRINKLE_SHAPES[2] === "mouthCorner"
    && !WRINKLE_SHAPES.includes("jawOpen" as never));
  check("B2 the strength law scales by the clamped absolute weight",
    wrinkleStrengthFor(0.0) === 0.0 && Math.abs(wrinkleStrengthFor(0.7) - 0.595) < 1e-9
    && Math.abs(wrinkleStrengthFor(-0.6) - 0.51) < 1e-9 && wrinkleStrengthFor(2.0) === 0.85
    && wrinkleStrengthFor(-3.0) === 0.85 && wrinkleStrengthFor(Number.NaN) === 0.0);
  const ovalFactors = { jawTaper: 0.74, chinFwd: 0.028, browFwd: 0.014, cheekOut: 0.022, noseLen: 1.0 };
  const wkAnchor = createHash("sha256").update("93|0.740|0.028|0.014|0.022|1.000|v1", "utf8").digest("hex").slice(0, 16);
  check("B3 the wrinkle key is sha256-16 over the factors (the hardcoded anchor)",
    wrinkleKeyHash(ovalFactors) === wkAnchor && wrinkleKeyHash(ovalFactors).length === 16,
    `${wrinkleKeyHash(ovalFactors)} vs ${wkAnchor}`);
  check("B4 a different face lands a different key",
    wrinkleKeyHash({ ...ovalFactors, jawTaper: 0.64 }) !== wrinkleKeyHash(ovalFactors));
  check("B5 the ledger line reads honestly (baked, worn, unwrinkled)",
    wrinkleLine({ worn: true, baked: false, key: wkAnchor, shapes: WRINKLE_SHAPES, strength: WRINKLE_STRENGTH }).includes("worn (3 maps")
    && wrinkleLine({ worn: true, baked: true, key: wkAnchor, shapes: WRINKLE_SHAPES, strength: WRINKLE_STRENGTH }).includes("baked down")
    && wrinkleLine({ worn: false, baked: false, key: wkAnchor, shapes: WRINKLE_SHAPES, strength: WRINKLE_STRENGTH, note: "no cached set" }).includes("unwrinkled"),
    wrinkleLine({ worn: true, baked: false, key: wkAnchor, shapes: WRINKLE_SHAPES, strength: WRINKLE_STRENGTH }));
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

  const created = await executeTool("throwaway", "create_project", { title: `Iter93 Wrinkle Lab ${MARK}`, logline: "a throwaway production for the creasing-face proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Creasing Face Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Scowl Court" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling glares at the court gate", shotType: "CLOSEUP", lighting: "moonlit night", poseStart: "STANCE", poseEnd: "STANCE" },
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
  check("D1 the crafted read parses with the skin hex (the read lowercases)", !!crafted && (crafted.skinTone ?? "").toLowerCase() === "#d9b48f");
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const wrinkleJob = await realRender(labId, shots[1].id);
    check("D2 the closeup rendered over the real engine", wrinkleJob.ok, wrinkleJob.status.slice(0, 140));
    if (wrinkleJob.ok && wrinkleJob.jobId) {
      const state = readJobState(wrinkleJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const sc = state.rig?.sculpt;
      const tsKey = expectedWrinkleKey(sc?.factors);
      check("D4 the state names the wrinkle key and the factor law it came from",
        typeof sc?.wrinkleKey === "string" && sc.wrinkleKey.length === 16 && !!sc?.factors, JSON.stringify({ k: sc?.wrinkleKey, f: !!sc?.factors }));
      check("D5 the wrinkle key matches the TS law over the REAL render (one law, two runtimes)",
        sc?.wrinkleKey === tsKey, `${sc?.wrinkleKey} vs ${tsKey}`);
      check("D6 the hero build BAKED the three-map set (the creases as real geometry)",
        (() => {
          const wr = sc?.wrinkle;
          const bakedList = Array.isArray(wr?.baked) ? wr.baked : [];
          const shapeMap = wr?.shapes && !Array.isArray(wr.shapes) ? wr.shapes : {};
          return bakedList.length === 3
            && WRINKLE_SHAPES.every((s) => shapeMap[s] !== undefined)
            && WRINKLE_SHAPES.every((s) => typeof shapeMap[s]?.fingerprint === "string" && shapeMap[s]!.fingerprint!.length === 16);
        })(),
        JSON.stringify(sc?.wrinkle)?.slice(0, 260));
      const wrFiles = WRINKLE_SHAPES.map((s) => path.join(process.cwd(), "public", "headbake", `${sc?.wrinkleKey}-wrinkle-${s}.png`));
      check("D7 the three wrinkle maps landed beside the bake cache", wrFiles.every((p) => existsSync(p)), wrFiles.join(", "));
      check("D8 the carve's own bake still rides beside the creases",
        !!sc?.bakeKey && sc.depth === 5 && !!sc.bake?.fingerprint, JSON.stringify({ k: sc?.bakeKey, d: sc?.depth, fp: !!sc?.bake?.fingerprint }));
      check("D9 the grade + the groom + the depth + the expression still ride beside the creases",
        !!state.rig?.materials?.hash && (state.rig?.groom?.strands ?? 0) > 0
        && !!state.rig?.skinDepth?.hash && !!state.rig?.expression?.hash,
        JSON.stringify({ mat: !!state.rig?.materials, gr: state.rig?.groom?.strands, sd: !!state.rig?.skinDepth, ex: !!state.rig?.expression }));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  const state1 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[1].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  const heroKey = state1.rig?.sculpt?.wrinkleKey;
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
    const st = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
    const sc = st.rig?.sculpt;
    check(`D1${n === 2 ? "0" : "1"} the ${n === 2 ? "WIDE" : "MED"} build names the SAME wrinkle key (the face's own creases)`,
      sc?.wrinkleKey === heroKey, JSON.stringify({ k: sc?.wrinkleKey, heroKey }));
    if (n === 2) {
      check("D12 the WIDE build's light head WEARS the cached set (the creases worn, the strength riding)",
        sc?.depth === 4 && sc?.wrinkle?.worn === true && Array.isArray(sc?.wrinkle?.shapes)
        && (sc.wrinkle.shapes as string[]).length === 3
        && sc?.wrinkle?.strength === WRINKLE_STRENGTH && sc?.wrinkle?.baked === false,
        JSON.stringify(sc?.wrinkle)?.slice(0, 240));
      check("D13 the WIDE build still wears the base bake beneath the creases (the compose)",
        sc?.bake?.worn === true, JSON.stringify(sc?.bake)?.slice(0, 160));
    }
  }
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D14 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standing = await castIdentityMeasurement(labId, "RENDER");
  check("D15 the standing names Bai Ling BELOW across three readings", standing.below === 1, JSON.stringify(standing));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  // ── the repair loop: the creases ride every re-render ──
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D16 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D17 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D18 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  const loopStates = [];
  for (const n of [1, 2, 3]) {
    const jr = await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } });
    if (jr) loopStates.push(readJobState(jr.id));
  }
  check("D-e every re-render carries the wrinkle evidence (the key per shot)",
    loopStates.length === 3 && loopStates.every((st) => typeof st.rig?.sculpt?.wrinkleKey === "string" && st.rig.sculpt.wrinkleKey!.length === 16),
    JSON.stringify(loopStates.map((st) => st.rig?.sculpt?.wrinkleKey))?.slice(0, 160));
  check("D-e the creases and the bake still ride beside the grade on every re-render",
    loopStates.every((st) => !!st.rig?.sculpt?.bakeKey && !!st.rig?.materials?.hash),
    JSON.stringify(loopStates.map((st) => ({ sc: !!st.rig?.sculpt?.bakeKey, mat: !!st.rig?.materials?.hash })))?.slice(0, 160));
  const viewerWrite = await call(viewerJar, `/api/projects/${labId}`, { method: "PATCH", body: JSON.stringify({ logline: "hijack" }) });
  check("D19 the viewer cannot write the studio (403)", viewerWrite.status === 403, String(viewerWrite.status));
  }

  // ── E. cleanup (exact rows + files) - phase b only (a/a2 resume
  //    over the standing lab) ──
  if (labId && (PHASE === "b" || PHASE === "all")) {
    await cleanupLab(labId);
    const gone = await db.project.findUnique({ where: { id: labId } });
    check("E1 the lab is gone exactly", gone === null);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 93 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });

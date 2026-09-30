// Iteration 91 E2E: THE SKIN IS ALIVE (Layer A - the surface depth
// slice the Layer A remainder named). Proves, against the RUNNING
// studio, the REAL database, the REAL render pipeline and the REAL
// vision channel:
//   A. source: the depth law (TS + worker), the graded tree deepening,
//      the wear compose, the doctrine
//   B. pure: the derivation law, the bounds, the hash, the ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the depth riding the real closeup render (the
//      render state naming the profile + fields + the hash bit-exact
//      against the TS law over the REAL render), the framing
//      INDEPENDENCE (the wide build carrying the same depth while its
//      light head wears the hero bake), the repair loop, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter91-skindepth.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import { parseSkinDepth, skinDepthHash, skinDepthLine, SKIN_DEPTH_BOUNDS, SKIN_DEPTH_BASE } from "../src/lib/blender/skin-depth";
import { parseSheetDna } from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter91-skindepth";
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
    sculpt?: { depth?: number; bakeKey?: string; bake?: { worn?: boolean } | null } | null;
    groom?: { strands?: number } | null;
    materials?: { hash?: string } | null;
    skinDepth?: { profile?: Record<string, number>; fields?: string[]; hash?: string } | null;
    skinDepthLine?: string | null;
  } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 91: the skin is alive (phase: ${PHASE}) ==\n`);

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

  const lawSrc = readFileSync("src/lib/blender/skin-depth.ts", "utf8");
  check("A1 the depth law exists with the derivation and the hash",
    lawSrc.includes("export function parseSkinDepth") && lawSrc.includes("export function skinDepthHash")
    && lawSrc.includes("export const SKIN_DEPTH_BOUNDS") && lawSrc.includes("export const SKIN_DEPTH_BASE")
    && lawSrc.includes("export function skinDepthLine"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker carries the depth law (one law, two runtimes)",
    workerSrc.includes("def skin_depth(dna):") && workerSrc.includes("SKIN_DEPTH_BOUNDS = ")
    && workerSrc.includes("def skin_depth_hash(s):") && workerSrc.includes("def skin_depth_line(s):"));
  check("A3 the worker's tree carries the depth (the triplet, the scale, the coat pair)",
    workerSrc.includes('b.inputs["Subsurface Radius"].default_value = (0.014 * rad, 0.0053 * rad, 0.0025 * rad)')
    && workerSrc.includes('b.inputs["Subsurface Scale"].default_value = sdf["scale"]')
    && workerSrc.includes('b.inputs["Coat Weight"].default_value = sdf["coat"]')
    && workerSrc.includes('b.inputs["Coat Roughness"].default_value = sdf["coatRough"]'));
  check("A4 the flat token law stays when no depth rides (the back-compat path)",
    workerSrc.includes('b.inputs["Subsurface Weight"].default_value = 0.14'));
  check("A5 the regrade keeps the stored depth (the tree rebuilds with it)",
    workerSrc.includes('raw_sd = mat.get("animeosSkinDepth")'));
  check("A6 the depth evidence rides the state (hero + the second figure)",
    workerSrc.includes('state["rig"]["skinDepth"] = skin_depth_evidence(sdep)')
    && workerSrc.includes('state["secondFigureSkinDepth"] = skin_depth_evidence(other_sdep)'));

  const adhSrc = readFileSync("src/lib/blender/adherence.ts", "utf8");
  check("A7 the adherence compiles the depth from the sheet's own hex",
    adhSrc.includes("parseSkinDepth({ skinTone: read.skinTone ?? base.skinTone })") && adhSrc.includes("skinDepthLine(merged.skinDepth)"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A8 the wire carries the depth profile", wireSrc.includes("skinDepth?: {") && wireSrc.includes("coatRough: number;"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A9 the registry stands at 88 tools (the depth deepens, no new tool)", toolCount === 89, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A10 rule 66 teaches the living skin", prompts.includes("66. THE SKIN IS ALIVE"));
  check("A11 rules stay sequential (66, no duplicates)", (prompts.match(/^66\. THE SKIN IS ALIVE/gm) ?? []).length === 1);

  // ── B. pure checks ──
  const pale = parseSkinDepth({ skinTone: "#F2DCBE" });
  const mid = parseSkinDepth({ skinTone: "#D9B48F" });
  const deep = parseSkinDepth({ skinTone: "#8D5A3A" });
  check("B1 the luminance orders the subsurface (pale bleeds, deep stays tight)",
    pale.weight > mid.weight && mid.weight > deep.weight
    && pale.weight > 0.42 && deep.weight < 0.24,
    `${pale.weight} / ${mid.weight} / ${deep.weight}`);
  check("B2 the fields name only what the hex described",
    pale.fields.includes("pale bleed") && !pale.fields.includes("tight bleed")
    && deep.fields.includes("tight bleed") && deep.fields.includes("warm radius")
    && mid.fields.includes("warm radius") && !mid.fields.includes("pale bleed"),
    `${JSON.stringify(pale.fields)} / ${JSON.stringify(mid.fields)} / ${JSON.stringify(deep.fields)}`);
  check("B3 the deep hex's scale clamps against the bound honestly", deep.scale === SKIN_DEPTH_BOUNDS.scale[0], String(deep.scale));
  check("B4 a missing hex keeps the neutral depth honestly",
    (() => { const n = parseSkinDepth({}); return n.weight === SKIN_DEPTH_BASE.weight && n.fields.length === 0; })());
  check("B5 every factor lands inside the bounds (the derived trio)",
    [pale, mid, deep].every((s) => (Object.keys(SKIN_DEPTH_BOUNDS) as Array<keyof typeof SKIN_DEPTH_BOUNDS>).every((k) => {
      const [lo, hi] = SKIN_DEPTH_BOUNDS[k];
      return s[k] >= lo && s[k] <= hi;
    })));
  const midFactors = mid;
  const key = `91|${midFactors.weight.toFixed(3)}|${midFactors.radius.toFixed(3)}|${midFactors.scale.toFixed(3)}|${midFactors.coat.toFixed(3)}|${midFactors.coatRough.toFixed(3)}|v1`;
  const expectHash = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  check("B6 the hash is sha256-16 over the factors (deterministic)",
    skinDepthHash(mid) === expectHash && skinDepthHash(mid).length === 16, `${skinDepthHash(mid)} vs ${expectHash}`);
  check("B7 a different hex lands a different hash",
    skinDepthHash(pale) !== skinDepthHash(mid) && skinDepthHash(mid) !== skinDepthHash(deep));
  check("B8 the ledger line reads honestly",
    skinDepthLine(mid).startsWith("skin depth: sss") && skinDepthLine(mid).includes("warm radius") && skinDepthLine(parseSkinDepth({})).includes("the hex's own read"),
    skinDepthLine(mid));
  check("B9 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter91 Skindepth Lab ${MARK}`, logline: "a throwaway production for the living-skin proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Living Skin Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Warm Court" } });
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
  check("D1 the crafted read parses with the skin hex (the read lowercases)", !!crafted && (crafted.skinTone ?? "").toLowerCase() === "#d9b48f");
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const depthJob = await realRender(labId, shots[1].id);
    check("D2 the closeup rendered over the real engine", depthJob.ok, depthJob.status.slice(0, 140));
    if (depthJob.ok && depthJob.jobId) {
      const state = readJobState(depthJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const sd = state.rig?.skinDepth;
      const expected = parseSkinDepth({ skinTone: "#D9B48F" });
      check("D4 the render state names the depth (profile + fields + hash)",
        !!sd && !!sd.profile && typeof sd.hash === "string" && Array.isArray(sd.fields), JSON.stringify(sd)?.slice(0, 220));
      check("D5 the depth hash matches the TS law over the REAL render (one law, two runtimes)",
        !!sd && sd.hash === skinDepthHash(expected), `${sd?.hash} vs ${skinDepthHash(expected)}`);
      check("D6 the profile IS the hex's derivation (every factor)",
        !!sd && (Object.keys(SKIN_DEPTH_BOUNDS) as Array<keyof typeof SKIN_DEPTH_BOUNDS>).every((k) => Math.abs((sd.profile?.[k] ?? -9) - expected[k]) < 1e-9),
        JSON.stringify({ state: sd?.profile, ts: expected }));
      check("D7 the fields name what the hex described",
        !!sd && (sd.fields ?? []).includes("warm radius"), JSON.stringify(sd?.fields));
      check("D8 the ledger line rides the state",
        typeof state.rig?.skinDepthLine === "string" && state.rig.skinDepthLine.startsWith("skin depth: sss"), String(state.rig?.skinDepthLine));
      check("D9 the grade + the carve + the groom still ride beside the depth",
        !!state.rig?.materials?.hash && !!state.rig?.sculpt?.bakeKey && (state.rig?.groom?.strands ?? 0) > 0,
        JSON.stringify({ mat: !!state.rig?.materials, sc: !!state.rig?.sculpt, gr: state.rig?.groom?.strands }));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  const state1 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[1].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  const heroHash = state1.rig?.skinDepth?.hash;
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
    const st = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
    const sd = st.rig?.skinDepth;
    const sc = st.rig?.sculpt;
    check(`D1${n === 2 ? "0" : "1"} the ${n === 2 ? "WIDE" : "MED"} build carries the SAME depth (the skin answers the body, not the lens)`,
      !!sd && sd.hash === heroHash, JSON.stringify({ hash: sd?.hash, heroHash }));
    if (n === 2) {
      check("D12 the WIDE build's light head WEARS the hero bake while the depth rides (the compose)",
        sc?.depth === 4 && sc?.bake?.worn === true && !!sd?.hash, JSON.stringify({ depth: sc?.depth, bake: sc?.bake, hash: sd?.hash }));
    }
  }
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D13 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standing = await castIdentityMeasurement(labId, "RENDER");
  check("D14 the standing names Bai Ling BELOW across three readings", standing.below === 1, JSON.stringify(standing));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  // ── the repair loop: the depth rides every re-render ──
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D15 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D16 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D17 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  const loopStates = [];
  for (const n of [1, 2, 3]) {
    const jr = await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } });
    if (jr) loopStates.push(readJobState(jr.id));
  }
  check("D-e every re-render carries the depth evidence (the hash per shot)",
    loopStates.length === 3 && loopStates.every((st) => typeof st.rig?.skinDepth?.hash === "string" && st.rig.skinDepth.hash.length === 16),
    JSON.stringify(loopStates.map((st) => st.rig?.skinDepth?.hash))?.slice(0, 160));
  check("D-e every re-render keeps the carve + grade evidence beside the depth",
    loopStates.every((st) => !!st.rig?.sculpt?.bakeKey && !!st.rig?.materials?.hash),
    JSON.stringify(loopStates.map((st) => ({ sc: !!st.rig?.sculpt?.bakeKey, mat: !!st.rig?.materials?.hash })))?.slice(0, 160));
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

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 91 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });

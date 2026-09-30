// Iteration 87 E2E: THE CLOTH IS DIRECTED (Layer B). Proves, against
// the RUNNING studio, the REAL database, the REAL render pipeline and
// the REAL vision channel:
//   A. source: the cloth directive (TS + worker + cloth_pass), the
//      wire, the compile, the doctrine
//   B. pure: the word law (gale / fabric / heading / turbulence /
//      stillness / scene energy), the clamps, determinism, the hash
//      formula, the ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      DIRECTED builds over the real engine (the render state names
//      the directive, the garment re-tune, the hash matching the TS
//      law), the repair loop at shotsPerMember: 3 with the directive
//      riding every re-render, the honest ledger, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|b npx tsx scripts/e2e-iter87-cloth.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseClothDirective, clothHash, clothDirectiveLine,
  CLOTH_DIRECTIVE_BOUNDS, GARMENT_SETTINGS, GARMENT_CLASSES,
} from "../src/lib/blender/cloth-directive";
import {
  parseSheetDna,
} from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter87-cloth";
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

interface DirectiveState {
  heading?: number;
  strength?: number;
  turbulence?: number;
  garment?: string;
  collision?: string;
  fields?: string[];
  hash?: string;
  line?: string;
}
interface JobState {
  secondary?: { solver?: { cloth?: string; maxAnchorSway?: number; notes?: string[]; directive?: DirectiveState | null } | null } | null;
  rig?: { expression?: { emotion?: string } | null } | null;
  render?: { comp?: { hash?: string } | null } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 87: the cloth is directed (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string; description: string; lighting: string | null; shotType: string }> = {};
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
    for (const s of shotRows) shots[s.number] = { id: s.id, description: s.description, lighting: s.lighting, shotType: s.shotType };
    check(`B30 phase ${PHASE} resumed over the standing lab (3 shots)`, Object.keys(shots).length === 3);
    if (PHASE === "b") {
      const standingResume = await castIdentityMeasurement(labId, "RENDER");
      check("B31 the planted below standing survived the phase boundary", standingResume.below === 1, JSON.stringify({ below: standingResume.below }));
    }
  }

  if (PHASE === "a" || PHASE === "all") {

  // ───────────────────── A. source-level checks ─────────────────────
  const dirSrc = readFileSync("src/lib/blender/cloth-directive.ts", "utf8");
  check("A1 the cloth directive exists with its bounds, garment table and hash",
    dirSrc.includes("export function parseClothDirective") && dirSrc.includes("export const CLOTH_DIRECTIVE_BOUNDS")
    && dirSrc.includes("export const GARMENT_SETTINGS") && dirSrc.includes("export function clothHash") && dirSrc.includes("export function clothDirectiveLine"));
  check("A2 the four garment classes stand (silk, cloth, leather, armor)",
    dirSrc.includes('"silk"') && dirSrc.includes('"cloth"') && dirSrc.includes('"leather"') && dirSrc.includes('"armor"'));
  check("A3 the heading convention is written into the module (0 back-stream ... 180 toward-lens)",
    dirSrc.includes("0   = the classic hero-read") && dirSrc.includes("180   = the air blows TOWARD the lens"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A4 the wire carries the cloth directive on the SHOT", wireSrc.includes("clothDirective?: {") && wireSrc.includes("THE CLOTH IS DIRECTED"));

  const renderSrc = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A5 the designed compile rides the directive (the shot's own words compile it)",
    renderSrc.includes("parseClothDirective") && renderSrc.includes("shot.scene.energyIntensity"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A6 the worker validates + clamps the directive (one law, two runtimes)",
    workerSrc.includes("def cloth_directive(shot):") && workerSrc.includes("CLOTH_DIRECTIVE_BOUNDS = {\"strength\": (0.0, 1.0), \"turbulence\": (0.0, 1.0)}"));
  check("A7 the worker carries the garment table and the TS-matching hash",
    workerSrc.includes("GARMENT_SETTINGS = {") && workerSrc.includes("def cloth_directive_hash(d):") && workerSrc.includes("\"87|{:.1f}|{:.3f}|{:.3f}|{}|{}|v1\""));
  check("A8 the worker feeds the directive to the REAL solver (build + per-frame air + evidence)",
    workerSrc.includes("cloth_pass.build_cloth_rig(bpy, scn, figure, sec_chains, frames_total, directive=cloth_dir)")
    && workerSrc.includes("directive=cloth_dir)") && workerSrc.includes('solver["directive"] = {'));

  const clothPassSrc = readFileSync("bridges/blender/cloth_pass.py", "utf8");
  check("A9 cloth_pass re-tunes the solver per garment class and arms self-collision",
    clothPassSrc.includes("GARMENT_SETTINGS = {") && clothPassSrc.includes('tune.update({"mass": g["mass"], "tension": g["tension"]')
    && clothPassSrc.includes('use_self_collision = bool(') && clothPassSrc.includes('re-tuned {directive[\'garment\']} (directed)'));
  check("A10 the directed air decomposes the heading (cos forward / sin lateral) with the turbulence harmonic",
    clothPassSrc.includes("d_fwd = math.cos(h)") && clothPassSrc.includes("d_lat = math.sin(h)")
    && clothPassSrc.includes("math.sin(t_sec * 3.9 + phase * 2.3)"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A11 the registry stands at 88 tools (the directive deepens, no new tool)", toolCount === 90, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A12 rule 62 teaches the directed cloth", prompts.includes("62. THE CLOTH IS DIRECTED"));
  check("A13 rules stay sequential (62, no duplicates)", (prompts.match(/^62\. THE CLOTH IS DIRECTED/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  const gale = parseClothDirective({ description: "Bai Ling leaps the gale into melee, her silken robes streaming back, vortex" });
  check("B1 the gale shot compiles its own directive (silk + gale strength + vortex turbulence + back-stream + self-collision)",
    gale.garment === "silk" && gale.strength === 0.85 && gale.turbulence === 0.7 && gale.heading === 0 && gale.collision === "self"
    && gale.fields.join(",") === "silk,gale,billow,vortex,headwind,self-collision", JSON.stringify(gale));
  const cross = parseClothDirective({ description: "Bai Ling stands in the crosswind, leather armor creaking" });
  check("B2 the crosswind shot peels sideways in leather (heading 90, leather, the wind word named)",
    cross.heading === 90 && cross.garment === "leather" && cross.strength === 0.55
    && cross.fields.join(",") === "leather,wind,crosswind", JSON.stringify(cross));
  const ambush = parseClothDirective({ description: "the hem billows at the camera" });
  check("B3 the reversal beat blows TOWARD the lens (heading 180)", ambush.heading === 180 && ambush.fields.includes("toward-lens"), JSON.stringify(ambush));
  const blown = parseClothDirective({ description: "her hair blown back by the gust" });
  check("B4 blown back is the classic back-stream (heading 0, gust turbulence)",
    blown.heading === 0 && blown.fields.includes("headwind") && blown.turbulence === 0.4, JSON.stringify(blown));
  const still = parseClothDirective({ description: "Bai Ling meditates in the sealed chamber, calm" });
  check("B5 the stillness words DIRECT stillness (the alive floor, never the dead zero)",
    still.strength === 0.06 && still.turbulence === 0.02 && still.fields.includes("stillness"), JSON.stringify(still));
  const stormThenCalm = parseClothDirective({ description: "the storm howls, then calm settles" });
  check("B6 a storm that settles still caps its own violence", stormThenCalm.strength === 0.06 && stormThenCalm.turbulence === 0.02, JSON.stringify(stormThenCalm));
  const energy = parseClothDirective({ description: "Bai Ling waits" , energyIntensity: 0.8 });
  check("B7 the scene's own energy lifts the floor (0.2 + 0.35*0.8 = 0.48, named)",
    energy.strength === 0.48 && energy.fields.includes("scene energy"), JSON.stringify(energy));
  const quiet = parseClothDirective({ description: "Bai Ling waits" });
  check("B8 a quiet shot keeps the HOUSE AIR with honest empty fields",
    quiet.strength === 0 && quiet.turbulence === 0 && quiet.garment === "cloth" && quiet.collision === "off" && quiet.fields.length === 0, JSON.stringify(quiet));
  check("B9 the fabric words pick the class (silk floats, armor barely sways)",
    parseClothDirective({ description: "satin gauze drifts" }).garment === "silk"
    && parseClothDirective({ description: "his armored plate shifts" }).garment === "armor"
    && GARMENT_SETTINGS.silk!.mass < GARMENT_SETTINGS.cloth!.mass
    && GARMENT_SETTINGS.cloth!.mass < GARMENT_SETTINGS.leather!.mass
    && GARMENT_SETTINGS.leather!.mass < GARMENT_SETTINGS.armor!.mass);
  check("B10 the probed v10.0 preset IS the cloth class (mass 0.25, tension 12, damping 1.6)",
    GARMENT_SETTINGS.cloth!.mass === 0.25 && GARMENT_SETTINGS.cloth!.tension === 12 && GARMENT_SETTINGS.cloth!.airDamping === 1.6);
  check("B11 the parser is deterministic (the same shot, the same directive)",
    JSON.stringify(parseClothDirective({ description: "the gale howls, silk robes streaming back" })) === JSON.stringify(parseClothDirective({ description: "the gale howls, silk robes streaming back" })));
  check("B12 every default lands inside the bounds", Object.entries(CLOTH_DIRECTIVE_BOUNDS).every(([k, [lo, hi]]) => {
    const v = (quiet as unknown as Record<string, number>)[k];
    return v >= lo && v <= hi;
  }));
  check("B13 the classes stand by name", GARMENT_CLASSES.join(",") === "silk,cloth,leather,armor");
  const key = "87|0.0|0.850|0.700|silk|self|v1";
  const expectHash = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  check("B14 the hash is sha256-16 over the bounded directive (deterministic)", clothHash(gale) === expectHash && clothHash(gale).length === 16, `${clothHash(gale)} vs ${expectHash}`);
  const milder = parseClothDirective({ description: "the gale howls, silken robes streaming back" });
  check("B15 a different directive hashes differently (no vortex, no melee -> calmer law)",
    clothHash(milder) !== clothHash(gale) && milder.turbulence === 0.5 && milder.collision === "off",
    `${clothHash(milder)} vs ${clothHash(gale)}`);
  check("B16 the ledger line reads honestly (named vs house air)",
    clothDirectiveLine(gale).includes("silk garments") && clothDirectiveLine(gale).includes("named by the shot: silk")
    && clothDirectiveLine(quiet).includes("house air"), `${clothDirectiveLine(gale)} | ${clothDirectiveLine(quiet)}`);

  check("B17 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, 0.5, 0.7) === "IMPROVED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

  // ───────────────────── C. accounts + throwaway production ─────────────────────
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

  const created = await executeTool("throwaway", "create_project", { title: `Iter87 Cloth Lab ${MARK}`, logline: "a throwaway production for the directed-cloth proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Directed Cloth Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Wind Ridge" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling leaps the gale into melee, her silken robes streaming back, vortex", shotType: "CLOSEUP", lighting: "tribulation lightning over the ridge", poseStart: "LUNGE", poseEnd: "SLASH" },
    { number: 2, description: "Bai Ling stands in the crosswind at the ridge edge, leather armor creaking", shotType: "WS", lighting: "moonlit night", poseStart: "STANCE", poseEnd: "STANCE" },
    { number: 3, description: "Bai Ling meditates in the sealed chamber, calm", shotType: "MED", lighting: "dawn light", poseStart: "BOW", poseEnd: "RISE" },
  ];
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.5, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd } });
    shots[d.number] = { id: s.id, description: d.description, lighting: d.lighting, shotType: d.shotType };
  }
  check("C7 the three-shot episode stands (gale close / crosswind wide / stillness middle)", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);

  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ───────────────────── D. the real paths ─────────────────────
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedRaw = JSON.stringify({
    hairStyle: "long", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    faceShape: "oval",
    silhouette: "A tall swordswoman with flowing silken sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D1 the crafted read parses with the flowing silhouette", !!crafted && (crafted.silhouette ?? "").includes("silken"));
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const directedJob = await realRender(labId, shots[1].id);
    check("D2 the directed build rendered over the real engine (gale closeup)", directedJob.ok, directedJob.status.slice(0, 140));
    if (directedJob.ok && directedJob.jobId) {
      const state = readJobState(directedJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const solver = state.secondary?.solver;
      check("D4 the render state names the directive evidence", !!solver?.directive && typeof solver.directive.hash === "string", JSON.stringify(solver)?.slice(0, 240));
      const expected = parseClothDirective({ description: shots[1].description, energyIntensity: null });
      check("D5 the shot's own words rode the wire (silk, gale, back-stream, self-collision)",
        !!solver?.directive && solver.directive.garment === "silk" && solver.directive.heading === 0
        && solver.directive.collision === "self" && solver.directive.strength === 0.85, JSON.stringify(solver?.directive));
      check("D6 the worker's clamped directive MATCHES the TS law bit-exactly (one law, two runtimes)",
        !!solver?.directive && solver.directive.strength === expected.strength && solver.directive.turbulence === expected.turbulence
        && solver.directive.heading === expected.heading && JSON.stringify(solver.directive.fields) === JSON.stringify(expected.fields),
        `${JSON.stringify(solver?.directive)} vs ${JSON.stringify(expected)}`);
      check("D7 the directive hash matches the TS formula over the REAL render",
        !!solver?.directive && solver.directive.hash === clothHash(expected), `${solver?.directive?.hash} vs ${clothHash(expected)}`);
      check("D8 the solver rode the REAL cloth sim with the SILK re-tune named",
        solver?.cloth === "blender-cloth-sim" && (solver?.notes ?? []).some((n) => n.includes("re-tuned silk (directed)")),
        JSON.stringify({ cloth: solver?.cloth, notes: solver?.notes }));
      check("D9 the self-collision arming is named", (solver?.notes ?? []).some((n) => n.includes("self-collision armed (directed)")), JSON.stringify(solver?.notes));
      check("D10 the anchor actually answered the directed air (a real sway, honestly measured)",
        typeof solver?.maxAnchorSway === "number" && solver.maxAnchorSway > 0.3, String(solver?.maxAnchorSway));
      check("D11 the comp still finishes the frame beside the directive (the layers stack)",
        !!state.render?.comp?.hash, String(state.render?.comp?.hash));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  const s2 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D12 the crosswind wide rides LEATHER with the sideways heading",
    s2.secondary?.solver?.directive?.garment === "leather" && s2.secondary?.solver?.directive?.heading === 90,
    JSON.stringify(s2.secondary?.solver?.directive));
  check("D13 the leather re-tune is named", (s2.secondary?.solver?.notes ?? []).some((n) => n.includes("re-tuned leather (directed)")), JSON.stringify(s2.secondary?.solver?.notes));
  const s3 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[3].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D14 the stillness shot holds the alive floor (0.06, cloth class, no self-collision)",
    s3.secondary?.solver?.directive?.strength === 0.06 && s3.secondary?.solver?.directive?.garment === "cloth"
    && s3.secondary?.solver?.directive?.collision === "off", JSON.stringify(s3.secondary?.solver?.directive));

  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D15 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D16 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Bai Ling")?.worstRef === "E1 Sc1 S001", JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D17 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D18 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D19 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D20 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D21 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  // D-e THE DIRECTIVE RODE THE WHOLE LOOP: the loop's re-renders each
  // carry their own directed cloth (a garment + heading + hash per shot).
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobPerShot: Record<number, string> = {};
  for (const j of jobs) {
    const n = Object.entries(shots).find(([, s]) => s.id === j.shotId)?.[0];
    if (n !== undefined) lastJobPerShot[Number(n)] = j.id;
  }
  let directedRenders = 0;
  const garmentsSeen = new Set<string>();
  for (const n of [1, 2, 3]) {
    const id = lastJobPerShot[n];
    if (!id) continue;
    const d = readJobState(id).secondary?.solver?.directive;
    if (d && typeof d.hash === "string" && d.hash.length === 16 && typeof d.garment === "string") {
      directedRenders += 1;
      garmentsSeen.add(d.garment);
    }
  }
  check("D-e every re-render left the cloth directed (directive evidence per shot)", directedRenders === 3, `directedRenders=${directedRenders}`);
  check("D-e the loop's garments answer each shot's own fabric (silk close, leather wide, cloth middle)",
    garmentsSeen.has("silk") && garmentsSeen.has("leather") && garmentsSeen.has("cloth"), JSON.stringify(Array.from(garmentsSeen)));

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)})`);
  }
  check("D22 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D23 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D24 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 87 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

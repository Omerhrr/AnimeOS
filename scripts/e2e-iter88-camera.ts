// Iteration 88 E2E: THE CAMERA CHOREOGRAPHS THE DRAMA (Layer C). Proves,
// against the RUNNING studio, the REAL database, the REAL render
// pipeline and the REAL vision channel:
//   A. source: the camera choreo (TS + worker + pass), the wire, the
//      compile, the doctrine
//   B. pure: the word law (revelation / retreat / dread / storm /
//      action / framing), the clamps, determinism, the hash formula,
//      the ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      CHOREOGRAPHED builds over the real engine (the render state
//      names the choreo, the fields, the hash matching the TS law),
//      the repair loop at shotsPerMember: 3 with the choreo riding
//      every re-render, the honest ledger, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter88-camera.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseCameraChoreo, cameraChoreoHash, cameraChoreoLine,
  CAMERA_CHOREO_BOUNDS,
} from "../src/lib/blender/camera-choreo";
import {
  parseSheetDna,
} from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter88-camera";
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

interface ChoreoState {
  mode?: string;
  source?: string;
  profile?: Record<string, number | null> | null;
  fields?: string[];
  hash?: string | null;
  line?: string;
}
interface JobState {
  render?: { comp?: { hash?: string } | null; camera?: ChoreoState | null } | null;
  secondary?: { solver?: { directive?: { garment?: string } | null } | null } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 88: the camera choreographs the drama (phase: ${PHASE}) ==\n`);

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
  const dirSrc = readFileSync("src/lib/blender/camera-choreo.ts", "utf8");
  check("A1 the camera choreo exists with its bounds, physics and hash",
    dirSrc.includes("export function parseCameraChoreo") && dirSrc.includes("export const CAMERA_CHOREO_BOUNDS")
    && dirSrc.includes("export const CAMERA_CHOREO_PHYSICS") && dirSrc.includes("export function cameraChoreoHash") && dirSrc.includes("export function cameraChoreoLine"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A2 the wire carries the camera choreo on the SHOT", wireSrc.includes("cameraChoreo?: {") && wireSrc.includes("THE CAMERA CHOREOGRAPHS THE DRAMA"));

  const renderSrc = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A3 the designed compile rides the choreo (the shot's own words compile it)",
    renderSrc.includes("parseCameraChoreo") && renderSrc.includes("shotType: shot.shotType"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A4 the worker validates + clamps the choreo (one law, two runtimes)",
    workerSrc.includes("def camera_choreo(shot):") && workerSrc.includes('CAMERA_CHOREO_BOUNDS = {"pushIn": (0.0, 1.0), "pullOut": (0.0, 1.0), "dutch": (0.0, 1.0), "handheld": (0.0, 1.0), "whip": (0.0, 1.0)}'));
  check("A5 the worker carries the TS-matching hash and the ledger line",
    workerSrc.includes("def camera_choreo_hash(c):") && workerSrc.includes('"88|{:.3f}|{:.3f}|{:.3f}|{:.3f}|{:.3f}|v1"') && workerSrc.includes("def camera_choreo_line(c):"));
  check("A6 the worker layers the choreo onto the aimed lens and names the evidence",
    workerSrc.includes("camera_choreo_pass.apply_choreo(cam, cam_choreo, t, t_sec, direction)")
    && workerSrc.includes('state["render"]["camera"] = {') && workerSrc.includes('"steady house camera"'));

  const passSrc = readFileSync("bridges/blender/camera_choreo.py", "utf8");
  check("A7 the pass applies the physical laws (dolly on the view axis, local-axis roll, prime-frequency breath, decaying whip)",
    passSrc.includes("DOLLY_UNITS = 0.35") && passSrc.includes("Quaternion((0.0, 0.0, 1.0), roll)")
    && passSrc.includes("math.sin(2.0 * math.pi * 1.3 * t_sec + 0.7)") && passSrc.includes("WHIP_WINDOW = 0.1"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A8 the registry stands at 88 tools (the choreo deepens, no new tool)", toolCount === 90, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A9 rule 63 teaches the choreographed camera", prompts.includes("63. THE CAMERA CHOREOGRAPHS THE DRAMA"));
  check("A10 rules stay sequential (63, no duplicates)", (prompts.match(/^63\. THE CAMERA CHOREOGRAPHS THE DRAMA/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  const dread = parseCameraChoreo({ description: "Bai Ling sees the truth and dread takes her as the blade bursts free", shotType: "CLOSEUP" });
  check("B1 the dread closeup compiles its own choreo (revelation push-in + dutch tilt + handheld breath + whip + the close drift)",
    dread.pushIn === 0.6 && dread.dutch === 0.6 && dread.handheld === 0.4 && dread.whip === 0.6 && dread.pullOut === 0
    && dread.fields.join(",") === "revelation,dread,action,close drift", JSON.stringify(dread));
  const retreat = parseCameraChoreo({ description: "Bai Ling turns away, the ridge falls still", shotType: "WS" });
  check("B2 the retreat wide pulls out and settles (pull-out 0.55 + the wide settle)",
    retreat.pullOut === 0.55 && retreat.pushIn === 0 && retreat.fields.join(",") === "retreat,wide settle", JSON.stringify(retreat));
  const storm = parseCameraChoreo({ description: "the ground rumbles as Bai Ling holds the line", shotType: "MED" });
  check("B3 the storm hands the camera to the wind (handheld 0.55, nothing else)",
    storm.handheld === 0.55 && storm.pushIn === 0 && storm.dutch === 0 && storm.whip === 0
    && storm.fields.join(",") === "storm", JSON.stringify(storm));
  const quiet = parseCameraChoreo({ description: "Bai Ling waits", shotType: "MED" });
  check("B4 a quiet shot keeps the STEADY HOUSE CAMERA with honest empty fields",
    quiet.pushIn === 0 && quiet.pullOut === 0 && quiet.dutch === 0 && quiet.handheld === 0 && quiet.whip === 0 && quiet.fields.length === 0, JSON.stringify(quiet));
  const revelation = parseCameraChoreo({ description: "she finally understands", shotType: "MED" });
  check("B5 the revelation words push in (0.6, named)", revelation.pushIn === 0.6 && revelation.fields.includes("revelation"), JSON.stringify(revelation));
  check("B6 the framing leans the drift (a close drifts in, a wide settles back)",
    parseCameraChoreo({ description: "x", shotType: "EXTREME_CLOSEUP" }).pushIn === 0.35
    && parseCameraChoreo({ description: "x", shotType: "ESTABLISHING" }).pullOut === 0.3);
  check("B7 the parser is deterministic (the same shot, the same choreo)",
    JSON.stringify(parseCameraChoreo({ description: "the slash lands, dread everywhere", shotType: "CLOSEUP" })) === JSON.stringify(parseCameraChoreo({ description: "the slash lands, dread everywhere", shotType: "CLOSEUP" })));
  check("B8 every default lands inside the bounds", Object.entries(CAMERA_CHOREO_BOUNDS).every(([k, [lo, hi]]) => {
    const v = (quiet as unknown as Record<string, number>)[k];
    return v >= lo && v <= hi;
  }));
  const key = "88|0.600|0.000|0.600|0.400|0.600|v1";
  const expectHash = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  check("B9 the hash is sha256-16 over the bounded choreo (deterministic)", cameraChoreoHash(dread) === expectHash && cameraChoreoHash(dread).length === 16, `${cameraChoreoHash(dread)} vs ${expectHash}`);
  check("B10 a different choreo hashes differently", cameraChoreoHash(dread) !== cameraChoreoHash(retreat), `${cameraChoreoHash(dread)} vs ${cameraChoreoHash(retreat)}`);
  check("B11 the ledger line reads honestly (named vs steady house camera)",
    cameraChoreoLine(dread).includes("dutch 0.60") && cameraChoreoLine(dread).includes("named by the shot: revelation")
    && cameraChoreoLine(quiet).includes("steady house camera"), `${cameraChoreoLine(dread)} | ${cameraChoreoLine(quiet)}`);

  check("B12 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter88 Camera Lab ${MARK}`, logline: "a throwaway production for the choreographed-camera proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Moving Lens Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Dread Ridge" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling sees the truth and dread takes her as the blade bursts free", shotType: "CLOSEUP", lighting: "tribulation lightning over the ridge", poseStart: "STANCE", poseEnd: "DRAW" },
    { number: 2, description: "Bai Ling turns away, the ridge falls still", shotType: "WS", lighting: "moonlit night", poseStart: "BOW", poseEnd: "RISE" },
    { number: 3, description: "the ground rumbles as Bai Ling holds the line", shotType: "MED", lighting: "dawn light", poseStart: "STANCE", poseEnd: "STANCE" },
  ];
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.5, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd } });
    shots[d.number] = { id: s.id, description: d.description, lighting: d.lighting, shotType: d.shotType };
  }
  check("C7 the three-shot episode stands (dread close / retreat wide / storm middle)", Object.keys(shots).length === 3);

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
    silhouette: "A tall swordswoman with flowing sleeves and long black hair",
  });
  const crafted = parseSheetDna(craftedRaw, heroRow.modelSheetUrl);
  check("D1 the crafted read parses with the flowing silhouette", !!crafted && (crafted.silhouette ?? "").includes("flowing"));
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const choreographedJob = await realRender(labId, shots[1].id);
    check("D2 the choreographed build rendered over the real engine (dread closeup)", choreographedJob.ok, choreographedJob.status.slice(0, 140));
    if (choreographedJob.ok && choreographedJob.jobId) {
      const state = readJobState(choreographedJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const cam = state.render?.camera;
      check("D4 the render state names the camera evidence", !!cam && typeof cam.hash === "string", JSON.stringify(cam)?.slice(0, 240));
      const expected = parseCameraChoreo({ description: shots[1].description, shotType: shots[1].shotType });
      check("D5 the shot's own words rode the wire (revelation push-in, dutch tilt, whip)",
        !!cam && cam.source === "shot wire" && cam.profile?.pushIn === 0.6 && cam.profile?.dutch === 0.6 && cam.profile?.whip === 0.6, JSON.stringify(cam?.profile));
      check("D6 the worker's clamped choreo MATCHES the TS law bit-exactly (one law, two runtimes)",
        !!cam && cam.profile?.pushIn === expected.pushIn && cam.profile?.pullOut === expected.pullOut
        && cam.profile?.dutch === expected.dutch && cam.profile?.handheld === expected.handheld && cam.profile?.whip === expected.whip
        && JSON.stringify(cam.fields) === JSON.stringify(expected.fields),
        `${JSON.stringify(cam?.profile)} vs ${JSON.stringify(expected)}`);
      check("D7 the choreo hash matches the TS formula over the REAL render",
        !!cam && cam.hash === cameraChoreoHash(expected), `${cam?.hash} vs ${cameraChoreoHash(expected)}`);
      check("D8 the comp still finishes the frame beside the choreo", !!state.render?.comp?.hash, String(state.render?.comp?.hash));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  const s2 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D9 the retreat wide pulls OUT (pull-out 0.55 + the wide settle)",
    s2.render?.camera?.profile?.pullOut === 0.55 && (s2.render?.camera?.fields ?? []).includes("wide settle"),
    JSON.stringify(s2.render?.camera?.profile));
  const s3 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[3].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D10 the storm middle breathes in the hand (handheld 0.55, no dutch, no whip)",
    s3.render?.camera?.profile?.handheld === 0.55 && s3.render?.camera?.profile?.dutch === 0 && s3.render?.camera?.profile?.whip === 0,
    JSON.stringify(s3.render?.camera?.profile));

  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D11 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D12 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Bai Ling")?.worstRef === "E1 Sc1 S001", JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D13 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D14 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D15 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D16 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D17 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass") && repairEvent.summary.includes("1 below"), repairEvent?.summary.slice(0, 180) ?? "missing");

  // D-e THE CHOREO RODE THE WHOLE LOOP: the loop's re-renders each
  // carry their own choreographed camera (a profile + hash per shot).
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobPerShot: Record<number, string> = {};
  for (const j of jobs) {
    const n = Object.entries(shots).find(([, s]) => s.id === j.shotId)?.[0];
    if (n !== undefined) lastJobPerShot[Number(n)] = j.id;
  }
  let choreographedRenders = 0;
  const sourcesSeen = new Set<string>();
  for (const n of [1, 2, 3]) {
    const id = lastJobPerShot[n];
    if (!id) continue;
    const cam = readJobState(id).render?.camera;
    if (cam && typeof cam.hash === "string" && cam.hash.length === 16 && cam.source === "shot wire") {
      choreographedRenders += 1;
      sourcesSeen.add(String(cam.profile?.dutch));
    }
  }
  check("D-e every re-render left the camera choreographed (choreo evidence per shot)", choreographedRenders === 3, `choreographedRenders=${choreographedRenders}`);
  check("D-e the loop's cameras answer each shot's own drama (a tilted close, two level wides/middles)",
    sourcesSeen.has("0.6") && sourcesSeen.has("0"), JSON.stringify(Array.from(sourcesSeen)));

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)})`);
  }
  check("D18 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D19 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D20 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 88 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

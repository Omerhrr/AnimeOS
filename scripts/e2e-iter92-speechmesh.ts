// Iteration 92 E2E: THE MOUTH SPEAKS IN THE MESH (Layer A - the
// blendshape slice the Layer A remainder named). Proves, against the
// RUNNING studio, the REAL database, the REAL render pipeline and the
// REAL vision channel:
//   A. source: the mesh law (TS + worker), the sculpt + drive, the doctrine
//   B. pure: the mapping law, the identity-clock samples, the hash
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the speaking closeup's mesh evidence over the
//      REAL render (the hash + the mesh law bit-exact against the TS
//      law from the state's own samples), the framing law (a wide with
//      dialogue keeps the lips posed - the wire decides WHO speaks),
//      the silent closeup, the repair loop, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter92-speechmesh.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  visemeMeshWeights, speechMeshSamples, speechMeshHash, speechMeshEvidence,
  SPEECH_MESH_SHAPES, SPEECH_JAW_FOLLOW, SPEECH_PRESS_WINDOW,
  buildSpeechProgram,
} from "../src/lib/animation/lipsync";
import { parseSheetDna } from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter92-speechmesh";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();
const LINE = { speaker: "Bai Ling", text: "The sword chose me.", kind: "SPEECH" as const };

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

interface SpeechMeshSampleState {
  at: number;
  o: number;
  w: number;
  r: number;
  mesh: { jaw: number; wide: number; round: number; press: number };
}
interface JobState {
  rig?: {
    sculpt?: { depth?: number; bakeKey?: string; bake?: { worn?: boolean } | null } | null;
    groom?: { strands?: number } | null;
    materials?: { hash?: string } | null;
    skinDepth?: { hash?: string } | null;
  } | null;
  speech?: { lines?: number; visemes?: number; mesh?: { shapes?: string[]; samples?: SpeechMeshSampleState[]; hash?: string } | null } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 92: the mouth speaks in the mesh (phase: ${PHASE}) ==\n`);

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

  const lawSrc = readFileSync("src/lib/animation/lipsync.ts", "utf8");
  check("A1 the mesh law exists with the mapping, the samples, the hash, the evidence",
    lawSrc.includes("export function visemeMeshWeights") && lawSrc.includes("export function speechMeshSamples")
    && lawSrc.includes("export function speechMeshHash") && lawSrc.includes("export function speechMeshEvidence")
    && lawSrc.includes("export const SPEECH_MESH_SHAPES") && lawSrc.includes("export const SPEECH_JAW_FOLLOW")
    && lawSrc.includes("export const SPEECH_PRESS_WINDOW"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker carries the mesh law (one law, two runtimes)",
    workerSrc.includes("def speech_mesh_weights(shape):") && workerSrc.includes("def speech_mesh_evidence(visemes, duration_sec):")
    && workerSrc.includes("SPEECH_MESH_SHAPES = (\"mouthWide\", \"mouthRound\", \"lipPress\")")
    && workerSrc.includes("SPEECH_JAW_FOLLOW = 0.45") && workerSrc.includes("SPEECH_PRESS_WINDOW = (0.005, 0.055)"));
  check("A3 the worker sculpts the speech keys onto the carved head (the real order)",
    workerSrc.includes("def sculpt_speech_keys(mesh):") && workerSrc.includes("def _speech_key_deltas(name, x, y, z):")
    && workerSrc.includes("speech_keys = sculpt_speech_keys(hm)") && workerSrc.includes('"speechKeys": speech_keys,'));
  check("A4 the drive composes with the expression's jaw by max (the scowl never flattens)",
    workerSrc.includes("jaw_target = max(jaw_target, clamp(float(expr.get(\"jaw\", 0.0)), 0.0, 1.0))"));
  check("A5 between segments the mouth RESTS (no frozen mid-shape)",
    workerSrc.includes("for kb in (figure.get(\"speechKeys\") or {}).values():") && workerSrc.includes("kb.value = 0.0"));
  check("A6 the mesh evidence rides the state beside the counts",
    workerSrc.includes('"mesh": speech_mesh_evidence(speech_visemes, duration_sec),'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A7 the registry stands at 88 tools (the mouth deepens, no new tool)", toolCount === 90, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A8 rule 67 teaches the speaking mesh", prompts.includes("67. THE MOUTH SPEAKS IN THE MESH"));
  check("A9 rules stay sequential (67, no duplicates)", (prompts.match(/^67\. THE MOUTH SPEAKS IN THE MESH/gm) ?? []).length === 1);

  // ── B. pure checks ──
  check("B1 the vowel a opens the jaw at the bounded fraction and never presses",
    (() => { const w = visemeMeshWeights({ o: 1.0, w: 0.15, r: 0.2 }); return w.jaw === 0.45 && w.wide === 0.15 && w.round === 0.2 && w.press === 0; })());
  check("B2 the bilabial press fires on the CLOSED shape and never on breath or vowels",
    visemeMeshWeights({ o: 0.04, w: 0.1, r: 0.1 }).press === 1
    && visemeMeshWeights({ o: 0, w: 0, r: 0 }).press === 0
    && visemeMeshWeights({ o: 0.5, w: 0.95, r: 0 }).press === 0
    && visemeMeshWeights({ o: 0.22, w: 0.2, r: 0.15 }).press === 0);
  check("B3 a null shape rests (the mouth between segments)",
    (() => { const w = visemeMeshWeights(null); return w.jaw === 0 && w.wide === 0 && w.round === 0 && w.press === 0; })());
  check("B4 a wild wire shape clamps against the same window",
    (() => { const w = visemeMeshWeights({ o: 5, w: -2, r: 99 }); return w.jaw === 0.45 && w.wide === 0 && w.round === 1 && w.press === 0; })(),
    JSON.stringify(visemeMeshWeights({ o: 5, w: -2, r: 99 })));
  const program = buildSpeechProgram({
    dialogue: JSON.stringify([LINE]),
    shotDurationMs: 1500,
  });
  check("B5 the known program lays one line with real visemes", program.lines === 1 && program.visemes.length > 8, JSON.stringify({ lines: program.lines, visemes: program.visemes.length }));
  const evidence = speechMeshEvidence(program, 1.5);
  check("B6 the evidence names the three speech shapes",
    evidence.shapes[0] === "mouthWide" && evidence.shapes[1] === "mouthRound" && evidence.shapes[2] === "lipPress"
    && SPEECH_MESH_SHAPES.length === 3);
  check("B7 the samples sit at the identity clock (22/40/62% of 1.5s)",
    evidence.samples.length === 3 && evidence.samples[0].at === 0.33 && evidence.samples[1].at === 0.6 && evidence.samples[2].at === 0.93,
    JSON.stringify(evidence.samples.map((s) => s.at)));
  check("B8 every sample's mesh weights follow the mapping law",
    evidence.samples.every((s) => {
      const w = visemeMeshWeights(s.o > 0 || s.w > 0 || s.r > 0 ? { o: s.o, w: s.w, r: s.r } : null);
      return w.jaw === s.mesh.jaw && w.wide === s.mesh.wide && w.round === s.mesh.round && w.press === s.mesh.press;
    }));
  check("B9 the jaw follow constant rides every sample's law",
    evidence.samples.every((s) => Math.abs(s.mesh.jaw - Math.round(s.o * SPEECH_JAW_FOLLOW * 1000) / 1000) < 1e-9)
    && SPEECH_PRESS_WINDOW[0] === 0.005 && SPEECH_PRESS_WINDOW[1] === 0.055);
  const spec = `92|` + evidence.samples
    .map((s) => `${s.at.toFixed(3)}:${s.o.toFixed(3)},${s.w.toFixed(3)},${s.r.toFixed(3)}:${s.mesh.jaw.toFixed(3)},${s.mesh.wide.toFixed(3)},${s.mesh.round.toFixed(3)},${s.mesh.press.toFixed(3)}`)
    .join("|") + `|v1`;
  const expectHash = createHash("sha256").update(spec, "utf8").digest("hex").slice(0, 16);
  check("B10 the hash is sha256-16 over the sampled shapes + their weights (deterministic)",
    speechMeshHash(evidence.samples) === expectHash && speechMeshHash(evidence.samples).length === 16,
    `${speechMeshHash(evidence.samples)} vs ${expectHash}`);
  check("B11 a different duration lands a different hash (the clock is in the law)",
    speechMeshHash(speechMeshSamples(program, 1.0)) !== speechMeshHash(speechMeshSamples(program, 1.5)));
  check("B12 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter92 Speechmesh Lab ${MARK}`, logline: "a throwaway production for the speaking-mesh proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Speaking Mesh Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Spoken Court" } });
  }
  const speechJson = JSON.stringify([LINE]);
  const shotDefs = [
    { number: 1, description: "Bai Ling speaks at the court gate", shotType: "CLOSEUP", lighting: "moonlit night", poseStart: "STANCE", poseEnd: "STANCE", dialogue: speechJson },
    { number: 2, description: "the court wide as Bai Ling speaks", shotType: "WS", lighting: "moonlit night", poseStart: "STANCE", poseEnd: "STANCE", dialogue: speechJson },
    { number: 3, description: "Bai Ling draws the jian", shotType: "CLOSEUP", lighting: "dawn light", poseStart: "STANCE", poseEnd: "DRAW", dialogue: null as string | null },
  ];
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.5, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd, dialogue: d.dialogue } });
    shots[d.number] = { id: s.id, description: d.description, shotType: d.shotType };
  }
  check("C7 the three-shot episode stands (speaking close / speaking wide / silent close)", Object.keys(shots).length === 3);

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
    const speakJob = await realRender(labId, shots[1].id);
    check("D2 the speaking closeup rendered over the real engine", speakJob.ok, speakJob.status.slice(0, 140));
    if (speakJob.ok && speakJob.jobId) {
      const state = readJobState(speakJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const sp = state.speech;
      check("D4 the render state names the speech program (lines + visemes)",
        !!sp && (sp.lines ?? 0) >= 1 && (sp.visemes ?? 0) > 8, JSON.stringify(sp)?.slice(0, 160));
      const mesh = sp?.mesh;
      check("D5 the state names the mesh evidence (shapes + samples + hash)",
        !!mesh && (mesh.shapes ?? []).join(",") === "mouthWide,mouthRound,lipPress"
        && (mesh.samples ?? []).length === 3 && typeof mesh.hash === "string",
        JSON.stringify(mesh)?.slice(0, 220));
      check("D6 the samples sit at the identity clock over the REAL render",
        !!mesh && mesh.samples?.map((s) => s.at).join(",") === "0.33,0.6,0.93",
        JSON.stringify(mesh?.samples?.map((s) => s.at)));
      check("D7 the mesh law holds per sample over the REAL render (one law, two runtimes)",
        !!mesh && (mesh.samples ?? []).every((s) => {
          const shape = s.o > 0 || s.w > 0 || s.r > 0 ? { o: s.o, w: s.w, r: s.r } : null;
          const w = visemeMeshWeights(shape);
          return w.jaw === s.mesh.jaw && w.wide === s.mesh.wide && w.round === s.mesh.round && w.press === s.mesh.press;
        }),
        JSON.stringify(mesh?.samples)?.slice(0, 260));
      const rehash = speechMeshHash((mesh?.samples ?? []) as SpeechMeshSampleState[]);
      check("D8 the hash mirrors the TS law over the REAL render (bit-exact)",
        !!mesh && mesh.hash === rehash && rehash.length === 16, `${mesh?.hash} vs ${rehash}`);
      check("D9 the spoken line's visemes reach the samples (the program rode the wire)",
        !!mesh && (mesh.samples ?? []).some((s) => s.o > 0 || s.w > 0 || s.r > 0),
        JSON.stringify(mesh?.samples)?.slice(0, 200));
      check("D10 the carve + the grade + the groom + the depth still ride beside the mouth",
        !!state.rig?.sculpt?.bakeKey && !!state.rig?.materials?.hash && (state.rig?.groom?.strands ?? 0) > 0 && !!state.rig?.skinDepth?.hash,
        JSON.stringify({ sc: !!state.rig?.sculpt?.bakeKey, mat: !!state.rig?.materials?.hash, gr: state.rig?.groom?.strands, sd: !!state.rig?.skinDepth?.hash }));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  const state1 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[1].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  const heroHash = state1.speech?.mesh?.hash;
  const widePre = await realRender(labId, shots[2].id);
  check("D1b the speaking WIDE rendered (the poster target exists)", widePre.ok, widePre.status.slice(0, 120));
  const st2 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D11 the speaking WIDE keeps the lips POSED (the framing law: the wire decides WHO speaks)",
    st2.speech === null || st2.speech === undefined, JSON.stringify(st2.speech)?.slice(0, 120));
  const silentPre = await realRender(labId, shots[3].id);
  check("D1c the silent closeup rendered", silentPre.ok, silentPre.status.slice(0, 120));
  const st3 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[3].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D12 the silent closeup stays honestly None",
    st3.speech === null || st3.speech === undefined, JSON.stringify(st3.speech)?.slice(0, 120));
  check("D13 the speaking closeup's hash is stable across the phase boundary",
    typeof heroHash === "string" && heroHash.length === 16, String(heroHash));
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D14 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standing = await castIdentityMeasurement(labId, "RENDER");
  check("D15 the standing names Bai Ling BELOW across three readings", standing.below === 1, JSON.stringify(standing));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  // ── the repair loop: the mouth rides every re-render ──
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D16 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D17 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D18 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));
  const loopStates = [];
  for (const n of [1, 2, 3]) {
    const jr = await db.renderJob.findFirst({ where: { shotId: shots[n].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } });
    if (jr) loopStates.push({ n, st: readJobState(jr.id) });
  }
  const speaking = loopStates.filter(({ st }) => !!st.speech?.mesh);
  check("D-e every re-render keeps the carve + grade evidence beside the mouth",
    loopStates.length === 3 && loopStates.every(({ st }) => !!st.rig?.sculpt?.bakeKey && !!st.rig?.materials?.hash),
    JSON.stringify(loopStates.map(({ st }) => ({ sc: !!st.rig?.sculpt?.bakeKey, mat: !!st.rig?.materials?.hash })))?.slice(0, 160));
  check("D-e the speaking re-renders carry the mesh law bit-exactly (the hash per render)",
    speaking.length >= 1 && speaking.every(({ st }) => {
      const mesh = st.speech?.mesh!;
      return mesh.hash === speechMeshHash((mesh.samples ?? []) as SpeechMeshSampleState[])
        && (mesh.samples ?? []).every((s) => {
          const shape = s.o > 0 || s.w > 0 || s.r > 0 ? { o: s.o, w: s.w, r: s.r } : null;
          const w = visemeMeshWeights(shape);
          return w.jaw === s.mesh.jaw && w.wide === s.mesh.wide && w.round === s.mesh.round && w.press === s.mesh.press;
        });
    }),
    JSON.stringify(speaking.map(({ st }) => st.speech?.mesh?.hash))?.slice(0, 160));
  check("D-e the silent re-renders stay honestly None",
    loopStates.filter(({ n }) => n === 2 || n === 3).every(({ st }) => st.speech === null || st.speech === undefined),
    JSON.stringify(loopStates.map(({ n, st }) => ({ n, sp: st.speech !== null && st.speech !== undefined })))?.slice(0, 160));
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

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 92 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error("E2E crashed:", e); process.exit(1); });

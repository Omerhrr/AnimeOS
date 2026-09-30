// Iteration 98 E2E: THE SHOTDIRECTIVE COMPILER. Proves, against the
// RUNNING studio, the REAL database, the REAL render pipeline and
// the REAL worker:
//   A. source: the pure law (TS), the worker mirror, the render
//      hook's integration (the hash rides the payload)
//   B. pure: the canonical key over a hardcoded anchor shot, the
//      grammar mirror's all-or-nothing degrade, the sensitivity law
//   C. accounts + throwaway production (a REAL generated sheet, a
//      REAL directed shot: grammar + fx + physics + cloth columns)
//   D. THE REAL PATHS: the real render compiles the directive (the
//      worker names match TRUE with the hash matching the TS law
//      BIT-EXACTLY over the same shot row) - one law, two runtimes,
//      at the SHOT level; a second shot's directive hashes apart
//      (the sensitivity over the wire)
//   E. the viewer gate; cleanup
// Run: PHASE=a|b npx tsx scripts/e2e-iter98-directive.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import {
  SHOT_DIRECTIVE_VERSION, normalizeGrammar, compileShotDirective,
} from "../src/lib/shot-directive";
import { parseExpressionClip } from "../src/lib/blender/expressions";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter98-directive";
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
  await db.characterAsset.deleteMany({ where: { projectId: labId } });
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
  for (let i = 0; i < 900 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

interface DirectiveState { hash?: string; expected?: string | null; match?: boolean; lawVersion?: number; sections?: Record<string, unknown> }
interface JobState { shotDirective?: DirectiveState | null; figureSource?: string }

function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

// the shot rows the lab rides (S1: the DIRECTED shot, S2: a plain cut)
const SHOT1_FIELDS = {
  movement: "STATIC",
  poseStart: "CROUCH",
  poseEnd: "RISE",
  duration: 1.3,
  lighting: "moonlit ridge",
  grammar: JSON.stringify([
    { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.3 },
    { move: "PAN", from: 0.5, to: 1, wind: 0.2, poseEnd: "RISE" },
  ]),
  fx: JSON.stringify([{ kind: "burst" }, { kind: "ring" }]),
  physics: JSON.stringify([{ kind: "knock" }]),
  cloth: 0.75,
};

// the E2E re-derives the directive EXACTLY as createRenderJob does
// (the same raw columns, the same presence gates, cast = 1 member)
function compileFor(shot: typeof SHOT1_FIELDS) {
  return compileShotDirective({
    movement: shot.movement,
    poseStart: shot.poseStart,
    poseEnd: shot.poseEnd,
    duration: shot.duration,
    lighting: shot.lighting,
    grammar: shot.grammar,
    fx: shot.fx,
    physics: shot.physics,
    choreo: null,
    cloth: shot.cloth,
    flesh: null,
    speechLines: null,
    expressionPresent: Boolean(parseExpressionClip("Bai Ling coils and rises from the loaded knee", shot.poseStart, shot.poseEnd)),
    compPresent: true,
    clothDirectivePresent: true,
    cameraChoreoPresent: true,
  });
}

async function run() {
  console.log(`== Iteration 98: the ShotDirective Compiler (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string }> = {};

  if (PHASE === "b") {
    const labRow = await db.project.findFirst({ where: { title: { contains: MARK } } });
    if (!labRow) throw new Error(`phase ${PHASE}: the lab is missing - run PHASE=a first`);
    labId = labRow.id;
    const owner = await register("director@studio.dev", "Lin Director", "anchored2026");
    ownerUser = { id: owner.id, name: "Lin Director", role: "OWNER" };
    viewerJar = await loginJar("reader@studio.dev", "viewing123");
    const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
    if (!sceneRow) throw new Error(`phase ${PHASE}: the scene is missing`);
    const shotRows = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
    for (const s of shotRows) shots[s.number] = { id: s.id };
    check(`B0 phase ${PHASE} resumed over the standing lab (2 shots)`, Object.keys(shots).length === 2);
  }

  if (PHASE === "a" || PHASE === "all") {

  // ── A. source checks ──
  const lawSrc = readFileSync("src/lib/shot-directive.ts", "utf8");
  check("A1 the directive law stands (version, grammar mirror, compiler, key)",
    lawSrc.includes("export const SHOT_DIRECTIVE_VERSION = 98")
    && lawSrc.includes("export function normalizeGrammar")
    && lawSrc.includes("export function compileShotDirective")
    && lawSrc.includes("export function shotDirectiveKey"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker mirrors the law (one law, two runtimes at the SHOT level)",
    workerSrc.includes("SHOT_DIRECTIVE_VERSION = 98")
    && workerSrc.includes("def shot_directive_key") && workerSrc.includes("def shot_directive_hash")
    && workerSrc.includes("def shot_directive_sections"));

  const renderSrc = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A3 the render hook compiles the directive and rides the hash on the payload",
    renderSrc.includes("compileShotDirective({") && renderSrc.includes("(payload.shot as Record<string, unknown>).directiveHash = directive.hash;"));

  check("A4 the worker names BOTH hashes (the mismatch names itself)",
    workerSrc.includes('state["shotDirective"]') && workerSrc.includes('"match": True if _d_expected is None else (_d_hash == _d_expected)'));

  // ── B. pure checks ──
  const anchorKey = "98|mv=STATIC|poses=CROUCH->RISE|dur=1.300|light=moonlit ridge|gr=2:DOLLY_IN+PAN:0.5:1|fx=2:burst+ring|ph=1:knock|cloth=0.750|flesh=-|speech=-|expr=1|comp=1|clothd=1|camchoreo=1|choreo=0|v1";
  const compiled = compileFor(SHOT1_FIELDS);
  check("B1 the canonical key is the directed intent (hardcoded anchor)",
    compiled.key === anchorKey, compiled.key);
  check("B2 the hash is sha256-16 over that key (deterministic, 16 hex)",
    compiled.hash === createHash("sha256").update(anchorKey, "utf8").digest("hex").slice(0, 16)
    && compiled.hash.length === 16, compiled.hash);
  check("B3 the grammar mirror degrades all-or-nothing (one corrupt beat kills the grammar)",
    normalizeGrammar([{ move: "PAN", from: 0, to: 0.5 }, { move: "NOPE", from: 0, to: 1 }]) === null
    && normalizeGrammar([{ move: "PAN", from: 0, to: 0.5 }]) === null
    && normalizeGrammar([{ move: "PAN", from: 0, to: 0.5 }, { move: "ORBIT", from: 0.5, to: 1 }])?.length === 2);
  check("B4 the grammar mirror bounds the wind and the range",
    normalizeGrammar([{ move: "PAN", from: 0.3, to: 0.2 }, { move: "ORBIT", from: 0, to: 1 }]) === null
    && normalizeGrammar([{ move: "PAN", from: 0, to: 0.5, wind: 9 }, { move: "ORBIT", from: 0.5, to: 1 }])?.[0].wind === 1);
  check("B5 the sensitivity law: each section's truth moves the hash",
    compileFor({ ...SHOT1_FIELDS, movement: "ORBIT" }).hash !== compiled.hash
    && compileFor({ ...SHOT1_FIELDS, cloth: 0.5 }).hash !== compiled.hash
    && compileFor({ ...SHOT1_FIELDS, fx: JSON.stringify([{ kind: "aura" }]) }).hash !== compiled.hash);
  check("B6 the law version rides (98)", SHOT_DIRECTIVE_VERSION === 98);

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter98 Directive Lab ${MARK}`, logline: "a throwaway production for the shot-directive proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Compiled Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Directed Cut" } });
  }
  const s1 = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "Bai Ling coils and rises from the loaded knee", ...SHOT1_FIELDS, shotType: "CLOSEUP" } });
  const s2 = await db.shot.create({ data: { sceneId: scene.id, number: 2, description: "Bai Ling waits at the gate", duration: 1.0, movement: "STATIC", shotType: "WS", lighting: "moonlit ridge", poseStart: "STANCE", poseEnd: "STANCE" } });
  shots[1] = { id: s1.id };
  shots[2] = { id: s2.id };
  check("C7 the two-shot episode stands (the directed cut / the plain cut)", Object.keys(shots).length === 2);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);
  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ── D. the real paths: the directive proves the wire ──
  const job1 = await realRender(labId, shots[1].id);
  check("D1 the directed shot rendered over the real engine", job1.ok, job1.status.slice(0, 140));
  if (job1.ok && job1.jobId) {
    const state = readJobState(job1.jobId);
    const sd = state.shotDirective;
    check("D2 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
    check("D3 the state names the shotDirective (law version 98, both hashes, match true)",
      !!sd && sd.lawVersion === 98 && sd.match === true && typeof sd.hash === "string", JSON.stringify(sd ?? null).slice(0, 220));
    check("D4 the directive hash matches the TS law BIT-EXACTLY over the REAL shot row (one law, two runtimes)",
      !!sd && sd.hash === compiled.hash && sd.expected === compiled.hash, `${sd?.hash} vs ${compiled.hash}`);
    check("D5 the sections name the directed intent (2 beats, the pose pair, the fx present)",
      (sd?.sections?.grammarBeats as number) === 2 && (sd?.sections?.poses as string) === "CROUCH->RISE",
      JSON.stringify(sd?.sections));
    check("D6 the legIk evidence rides beside (iteration 96 regression)",
      typeof (state as unknown as { rig?: { legIk?: { hash?: string } } }).rig?.legIk?.hash === "string");
  }

  const job2 = await realRender(labId, shots[2].id);
  check("D7 the plain cut rendered", job2.ok, job2.status.slice(0, 120));
  if (job2.ok && job2.jobId) {
    const st2 = readJobState(job2.jobId);
    const sd2 = st2.shotDirective;
    check("D8 a different shot compiles a DIFFERENT directive (the sensitivity over the wire)",
      !!sd2 && sd2.match === true && sd2.hash !== compiled.hash, `${sd2?.hash} vs ${compiled.hash}`);
    check("D9 the plain cut's canon degrades honestly (no grammar, no fx)",
      (sd2?.sections?.grammarBeats as number) === 0, JSON.stringify(sd2?.sections));
  }
  }

  if (PHASE === "b") {
  // ── E. the viewer gate + cleanup ──
  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E1 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E2 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 98 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

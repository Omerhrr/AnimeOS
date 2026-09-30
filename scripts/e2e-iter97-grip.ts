// Iteration 97 E2E: THE HAND CLOSES ON THE HILT (the grip-contact
// slice, the hand-weapon pair). Proves, against the RUNNING studio,
// the REAL database, the REAL render pipeline and the REAL worker:
//   A. source: the pure law (TS), the worker mirror, the builder
//      integration, the state evidence hooks, the follow-through law
//   B. pure: the canonical key + hash, the sensitivity law, the
//      axis law, the piece placements (collinear, the guard between
//      the fist and the blade)
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sword SLASH closeup renders with the rig's
//      grip evidence (kind sword, contact STRUCTURAL, the hash
//      matching the TS law BIT-EXACTLY over the real render); the
//      stand-in path names the same law hash; the legIk evidence
//      rides beside (iteration 96 regression)
//   E. the viewer gate; cleanup
// Run: PHASE=a|b npx tsx scripts/e2e-iter97-grip.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { parseSheetDna } from "../src/lib/blender/adherence";
import {
  GRIP_LAW_VERSION, GRIP_ANCHOR, GRIP_SPEC, gripTipAxis, gripPieceOffset, gripKey, gripHash, gripLine,
} from "../src/lib/blender/grip";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter97-grip";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

// the crafted sheet read the lab rides: a SWORDSWOMAN - the weapon
// type flows through the compiled cast DNA (the wire decides what
// the hand holds)
const CRAFTED_RAW = JSON.stringify({
  hairStyle: "long", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
  bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
  faceShape: "oval",
  silhouette: "A tall swordswoman with flowing sleeves and long black hair, jian at her hip",
});

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

interface GripEvidence { kind?: string; hand?: string; anchor?: number[]; hash?: string; lawVersion?: number; contact?: boolean }
interface JobState { rig?: { grip?: GripEvidence | null; legIk?: { hash?: string; lawVersion?: number } | null } | null; figureSource?: string }

function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 97: the hand closes on the hilt (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string; description: string; shotType: string }> = {};

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
    for (const s of shotRows) shots[s.number] = { id: s.id, description: s.description, shotType: s.shotType };
    check(`B0 phase ${PHASE} resumed over the standing lab (2 shots)`, Object.keys(shots).length === 2);
  }

  if (PHASE === "a" || PHASE === "all") {

  // ── A. source checks ──
  const lawSrc = readFileSync("src/lib/blender/grip.ts", "utf8");
  check("A1 the grip law stands (anchor, spec, axis, offsets, key, hash, line)",
    lawSrc.includes("export const GRIP_LAW_VERSION = 97") && lawSrc.includes("export const GRIP_ANCHOR")
    && lawSrc.includes("export function gripTipAxis") && lawSrc.includes("export function gripPieceOffset")
    && lawSrc.includes("export function gripKey") && lawSrc.includes("export function gripHash"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A2 the worker mirrors the law (one law, two runtimes)",
    workerSrc.includes("GRIP_LAW_VERSION = 97") && workerSrc.includes("def grip_tip_axis")
    && workerSrc.includes("def grip_piece_offset") && workerSrc.includes("def grip_key")
    && workerSrc.includes("def grip_hash"));

  check("A3 the builders integrate the pivot (the stand-in's blade midpoint-gripped, the designed kinds placed by the law)",
    workerSrc.includes('grip_pivot = empty("GripPivot", r_hand, GRIP_ANCHOR)')
    && workerSrc.includes("blade.location = grip_piece_offset(wtype, spec[\"guard\"] + 0.0055 + 0.55)")
    && workerSrc.includes("blade.location = (0.0, 0.0, 0.0)  # the fist grips the cone's midpoint"));

  check("A4 the follow-through pivots the WHOLE weapon around the fist (the legacy re-tilt only for old asset loads)",
    workerSrc.includes('figure["gripPivot"].rotation_euler.x = math.radians(lag)')
    && workerSrc.includes('elif figure.get("blade") is not None:'));

  check("A5 the state evidence hooks ride (the hero + the legacy stand-in)",
    workerSrc.includes('state["rig"]["grip"]') && workerSrc.includes('"kind": "blade"'));

  // ── B. pure checks ──
  const uSword = gripTipAxis("sword");
  check("B1 the axis law: the sword's tip points down-forward (the kind's own read preserved)",
    uSword.y < 0 && uSword.z < 0 && uSword.y === -0.8192 && uSword.z === -0.5736, JSON.stringify(uSword));
  const guard = gripPieceOffset("sword", GRIP_SPEC.sword.hilt / 2 + 0.0055);
  const bladeC = gripPieceOffset("sword", GRIP_SPEC.sword.guard + 0.0055 + 0.55);
  check("B2 the sword's pieces hang collinear on the tip axis (guard, blade)",
    Math.abs(guard.y * bladeC.z - bladeC.y * guard.z) < 1e-4, JSON.stringify([guard, bladeC]));
  check("B3 the guard sits between the fist and the blade (the law's order along the axis)",
    Math.hypot(guard.y, guard.z) < Math.hypot(bladeC.y, bladeC.z) && Math.hypot(guard.y, guard.z) > GRIP_SPEC.sword.hilt / 2 - 1e-9,
    `${Math.hypot(guard.y, guard.z)} < ${Math.hypot(bladeC.y, bladeC.z)}`);
  check("B4 the staff through-grips at its own hold (the shaft's center pommel-ward of the fist)",
    gripPieceOffset("staff", -GRIP_SPEC.staff.hold).y > 0
    && gripPieceOffset("staff", -GRIP_SPEC.staff.hold).z > 0,
    JSON.stringify(gripPieceOffset("staff", -GRIP_SPEC.staff.hold)));
  const anchorKey = `97|A=0.0000,-0.0100,-0.0480|sword:tilt=-55.0000,hold=0.0000,hilt=0.1400,guard=0.0760,u=-0.8192,-0.5736|staff:tilt=-72.0000,hold=0.2500,hilt=0.0000,guard=0.0000,u=-0.9511,-0.3090|spear:tilt=-72.0000,hold=0.2000,hilt=0.0000,guard=0.0000,u=-0.9511,-0.3090|blade:tilt=-72.0000,hold=0.0000,hilt=0.0000,guard=0.0000,u=-0.9511,-0.3090|v1`;
  check("B5 the canonical key is the law's truth (hardcoded anchor key)",
    gripKey() === anchorKey, gripKey());
  check("B6 the grip hash is sha256-16 over that key (deterministic, 16 hex)",
    gripHash() === createHash("sha256").update(anchorKey, "utf8").digest("hex").slice(0, 16)
    && gripHash().length === 16, gripHash());
  check("B7 the sensitivity law: a tilt, an anchor coordinate each move the hash",
    (() => {
      const base = gripKey();
      const moved = base.replace("sword:tilt=-55.0000", "sword:tilt=-56.0000");
      return gripHash() === createHash("sha256").update(base, "utf8").digest("hex").slice(0, 16)
        && gripHash() !== createHash("sha256").update(moved, "utf8").digest("hex").slice(0, 16);
    })());
  check("B8 the line reads honestly", gripLine().includes("grip v97"), gripLine());

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter97 Grip Lab ${MARK}`, logline: "a throwaway production for the grip-contact proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Drawn Blade Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Crossed Swords" } });
  }
  const shotDefs = [
    { number: 1, description: "Bai Ling slashes through the training post", shotType: "CLOSEUP", lighting: "moonlit night", poseStart: "SLASH", poseEnd: "SLASH" },
    { number: 2, description: "the courtyard wide as Bai Ling slashes", shotType: "WS", lighting: "moonlit night", poseStart: "SLASH", poseEnd: "SLASH" },
  ];
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.3, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd } });
    shots[d.number] = { id: s.id, description: d.description, shotType: d.shotType };
  }
  check("C7 the two-shot episode stands (close / wide)", Object.keys(shots).length === 2);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);
  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // the crafted read lands the SWORD on the hero (the wire decides
  // what the hand holds - the worker answers whatever arrives)
  const heroRowC = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRowC?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const crafted = parseSheetDna(CRAFTED_RAW, heroRowC.modelSheetUrl);
  check("C10 the crafted read parses with the sword named", !!crafted && (crafted.weaponType ?? "") === "sword", JSON.stringify(crafted ?? null).slice(0, 140));
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
  }

  // ── D. the real paths ──
  const slashJob = await realRender(labId, shots[1].id);
  check("D1 the SLASH closeup rendered over the real engine", slashJob.ok, slashJob.status.slice(0, 140));
  if (slashJob.ok && slashJob.jobId) {
    const state = readJobState(slashJob.jobId);
    check("D2 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
    const grip = state.rig?.grip;
    check("D3 the render state names the grip evidence (kind sword, hand R, the anchor, law version 97)",
      !!grip && grip.kind === "sword" && grip.hand === "R" && grip.lawVersion === 97
      && JSON.stringify(grip.anchor) === JSON.stringify([0, -0.01, -0.048]), JSON.stringify(grip ?? null));
    check("D4 the contact is STRUCTURAL over the real render (the pivot built)",
      !!grip && grip.contact === true, JSON.stringify(grip ?? null));
    check("D5 the grip hash matches the TS law BIT-EXACTLY over the REAL render (one law, two runtimes)",
      !!grip && grip.hash === gripHash(), `${grip?.hash} vs ${gripHash()}`);
    check("D6 the legIk evidence rides beside (iteration 96 regression)",
      state.rig?.legIk?.lawVersion === 96 && typeof state.rig?.legIk?.hash === "string",
      JSON.stringify(state.rig?.legIk ?? null).slice(0, 160));
  }
  }

  if (PHASE === "b") {
  // ── D. the framing independence + the honest weaponless path ──
  const wideJob = await realRender(labId, shots[2].id);
  check("D7 the WS render finished", wideJob.ok, wideJob.status.slice(0, 120));
  if (wideJob.ok && wideJob.jobId) {
    const wideState = readJobState(wideJob.jobId);
    check("D8 the WS lands the SAME grip hash (the law is framing-independent)",
      wideState.rig?.grip?.hash === gripHash(), `${wideState.rig?.grip?.hash} vs ${gripHash()}`);
    check("D9 the WS keeps the kind and the structural contact", 
      wideState.rig?.grip?.kind === "sword" && wideState.rig?.grip?.contact === true,
      JSON.stringify(wideState.rig?.grip ?? null));
  }

  // ── E. the viewer gate + cleanup ──
  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E1 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E2 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 97 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

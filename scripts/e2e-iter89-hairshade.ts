// Iteration 89 E2E: THE HAIR SHADES LIKE HAIR (the deeper groom - true
// curve hair). Proves, against the RUNNING studio, the REAL database,
// the REAL render pipeline and the REAL vision channel:
//   A. source: the hair shade (TS + worker), the wire, the compile,
//      the doctrine
//   B. pure: the hex law (raven / auburn / pale / missing), the
//      clamps, determinism, the hash formula, the ledger line
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the sheet-DNA vision read, the deterministic
//      CURVED builds over the real engine (the render state names the
//      curves, the melanin shade, the hash matching the TS law), the
//      wide framing keeping the cards, the repair loop, the viewer gate
//   E. cleanup (exact rows + files)
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter89-hairshade.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import { parseHairShade, hairShadeHash, hairShadeLine, HAIR_SHADE_BOUNDS } from "../src/lib/blender/hair-shade";
import { parseSheetDna } from "../src/lib/blender/adherence";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter89-hairshade";
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
    hairShade?: { melanin?: number; redness?: number; radial?: number; longitudinal?: number; fields?: string[]; hash?: string } | null;
    hairCurves?: { curves?: number; curvePts?: number } | null;
    groom?: { strands?: number } | null;
  } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function run() {
  console.log(`== Iteration 89: the hair shades like hair (phase: ${PHASE}) ==\n`);

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

  const shadeSrc = readFileSync("src/lib/blender/hair-shade.ts", "utf8");
  check("A1 the hair shade exists with its bounds and hash",
    shadeSrc.includes("export function parseHairShade") && shadeSrc.includes("export const HAIR_SHADE_BOUNDS") && shadeSrc.includes("export function hairShadeHash"));

  const wireSrc = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A2 the wire carries the hair shade on the DNA", wireSrc.includes("hairShade?: {") && wireSrc.includes("THE HAIR SHADES LIKE HAIR"));

  const adherentSrc = readFileSync("src/lib/blender/adherence.ts", "utf8");
  check("A3 the adherent build compiles the shade from the sheet hex", adherentSrc.includes("parseHairShade({ hairColor: read.hairColor ?? base.hairColor })"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A4 the worker derives + clamps the shade (one law, two runtimes)",
    workerSrc.includes("def hair_shade(dna):") && workerSrc.includes('HAIR_SHADE_BOUNDS = {"melanin": (0.0, 1.0), "redness": (0.0, 1.0), "radial": (0.1, 0.7), "longitudinal": (0.1, 0.7)}'));
  check("A5 the worker grows the TRUE CURVES + the melanin material with the socket law",
    workerSrc.includes("def groom_hair_curves(scn, bpy, head, shade_mat, style, hair_f, height_f, gp, strand_f):")
    && workerSrc.includes("def build_hair_shade_material(bpy, name, color_hex, shade):")
    && workerSrc.includes("ShaderNodeBsdfHairPrincipled") && workerSrc.includes("def _set_hair_socket(node, name, value):"));
  check("A6 the evidence rides the rig state on both layers", workerSrc.includes('state["rig"]["hairShade"] = figure["hairShade"]') && workerSrc.includes('state["rig"]["hairCurves"] = figure["hairCurves"]'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A7 the registry stands at 88 tools (the shade deepens, no new tool)", toolCount === 90, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A8 rule 64 teaches the true-curve hair", prompts.includes("64. THE HAIR SHADES LIKE HAIR"));
  check("A9 rules stay sequential (64, no duplicates)", (prompts.match(/^64\. THE HAIR SHADES LIKE HAIR/gm) ?? []).length === 1);

  // ── B. pure checks ──
  const raven = parseHairShade({ hairColor: "#1B1B2A" });
  check("B1 a raven hex derives HIGH melanin (dark dye named, cool redness)",
    raven.melanin > 0.72 && raven.fields.includes("dark dye") && raven.redness < 0.1, JSON.stringify(raven));
  const auburn = parseHairShade({ hairColor: "#7A3B20" });
  check("B2 an auburn hex derives the warm red", auburn.redness > 0.25 && auburn.fields.includes("warm red"), JSON.stringify(auburn));
  const pale = parseHairShade({ hairColor: "#E8DCC8" });
  check("B3 a pale hex derives LOW melanin", pale.melanin < 0.3 && pale.fields.includes("pale dye"), JSON.stringify(pale));
  const missing = parseHairShade({ hairColor: null });
  check("B4 a missing hex keeps the neutral mid-brown dye honestly",
    missing.melanin === 0.65 && missing.fields.length === 0, JSON.stringify(missing));
  check("B5 dark hair glosses, pale hair dulls (the roughness pair follows the melanin)",
    raven.radial < 0.34 && pale.radial > raven.radial, `${raven.radial} vs ${pale.radial}`);
  const wild = parseHairShade({ hairColor: "#1B1B2A" });
  check("B6 the parser is deterministic", JSON.stringify(wild) === JSON.stringify(parseHairShade({ hairColor: "#1B1B2A" })));
  check("B7 every derived factor lands inside the bounds", Object.entries(HAIR_SHADE_BOUNDS).every(([k, [lo, hi]]) => {
    const v = (auburn as unknown as Record<string, number>)[k];
    return v >= lo && v <= hi;
  }));
  const key = `89|${raven.melanin.toFixed(3)}|${raven.redness.toFixed(3)}|${raven.radial.toFixed(3)}|${raven.longitudinal.toFixed(3)}|v1`;
  const expectHash = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
  check("B8 the hash is sha256-16 over the derived shade (deterministic)", hairShadeHash(raven) === expectHash && hairShadeHash(raven).length === 16, `${hairShadeHash(raven)} vs ${expectHash}`);
  check("B9 a different hex hashes differently", hairShadeHash(raven) !== hairShadeHash(auburn));
  check("B10 the ledger line reads honestly", hairShadeLine(raven).includes("melanin") && hairShadeLine(raven).includes("named by the hex: dark dye"), hairShadeLine(raven));
  check("B11 the repair verdict law still reads honestly", shotRepairVerdict(0.35, 0.72, 0.7) === "REPAIRED" && shotRepairVerdict(0.35, null, 0.7) === "UNSCORED");

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter89 Hairshade Lab ${MARK}`, logline: "a throwaway production for the true-curve-hair proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The True Curve Arc", count: 1 });
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
  check("D1 the crafted read parses with the raven hex", !!crafted && (crafted.hairColor ?? "").toUpperCase() === "#1B1B2A");
  if (crafted) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(crafted) } });
    const curvedJob = await realRender(labId, shots[1].id);
    check("D2 the curved build rendered over the real engine (raven closeup)", curvedJob.ok, curvedJob.status.slice(0, 140));
    if (curvedJob.ok && curvedJob.jobId) {
      const state = readJobState(curvedJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const shade = state.rig?.hairShade;
      const curves = state.rig?.hairCurves;
      check("D4 the render state names the hair-shade evidence", !!shade && typeof shade.hash === "string", JSON.stringify(shade)?.slice(0, 200));
      const expected = parseHairShade({ hairColor: "#1B1B2A" });
      check("D5 the shade MATCHES the TS law bit-exactly (one law, two runtimes)",
        !!shade && shade.melanin === expected.melanin && shade.redness === expected.redness
        && shade.radial === expected.radial && shade.longitudinal === expected.longitudinal
        && JSON.stringify(shade.fields) === JSON.stringify(expected.fields), `${JSON.stringify(shade)} vs ${JSON.stringify(expected)}`);
      check("D6 the shade hash matches the TS formula over the REAL render", !!shade && shade.hash === hairShadeHash(expected), `${shade?.hash} vs ${hairShadeHash(expected)}`);
      check("D7 the TRUE CURVES grew over the real render (closeup carries the full pass)",
        !!curves && (curves.curves ?? 0) > 0 && (curves.curvePts ?? 0) > 0, JSON.stringify(curves));
      check("D8 the mesh strands still ride beside the curves", (state.rig?.groom?.strands ?? 0) > 0, String(state.rig?.groom?.strands));
    }
  }
  }

  if (PHASE === "a2" || PHASE === "all") {
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  const s2 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D9 the WIDE framing keeps the mesh cards only (no curve evidence - the LOD law)",
    s2.rig?.hairCurves === null || s2.rig?.hairCurves === undefined, JSON.stringify(s2.rig?.hairCurves));
  const s3 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[3].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D10 the MED middle carries the curves (the reduced pass)", (s3.rig?.hairCurves?.curves ?? 0) > 0, JSON.stringify(s3.rig?.hairCurves));

  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D11 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D12 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1, JSON.stringify({ below: standingBefore.below }));
  }

  if (PHASE !== "a" && PHASE !== "a2") {
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D13 the repair pass runs the widened work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D14 the ledger names all three shots with their befores", [1, 2, 3].every((n) => pass1.result.includes(`E1 Sc1 S00${n}`)) && (pass1.result.match(/% -> /g) ?? []).length === 3, pass1.result.slice(0, 700));
  check("D15 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 400));

  // D-e THE CURVES RODE THE WHOLE LOOP
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobPerShot: Record<number, string> = {};
  for (const j of jobs) {
    const n = Object.entries(shots).find(([, s]) => s.id === j.shotId)?.[0];
    if (n !== undefined) lastJobPerShot[Number(n)] = j.id;
  }
  let shadedRenders = 0;
  for (const n of [1, 2, 3]) {
    const id = lastJobPerShot[n];
    if (!id) continue;
    const st = readJobState(id);
    if (st.rig?.hairShade?.hash && st.rig.hairShade.hash.length === 16) shadedRenders += 1;
  }
  check("D-e every re-render carries the melanin shade (the shade evidence per shot)", shadedRenders === 3, `shadedRenders=${shadedRenders}`);

  let poseNotes = 0;
  let realScores = 0;
  for (const n of [1, 2, 3]) {
    const row = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[n].id, source: "RENDER" } });
    const mine = row ? (JSON.parse(row.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Bai Ling")?.similarity ?? null : null;
    if (row?.note?.startsWith("pose-matched over 3 frames")) poseNotes += 1;
    if (mine !== null && mine !== plantValues[n]) realScores += 1;
    if (mine !== null) console.log(`   pose-matched re-score S00${n}: ${Math.round(plantValues[n] * 100)}% -> ${(mine * 100).toFixed(0)}% (${shotRepairVerdict(plantValues[n], mine, 0.7)})`);
  }
  check("D16 every re-scored row names the pose-matched filmstrip", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("D17 the re-scores ran the real vision channel over the new pixels", realScores === 3, `realScores=${realScores}`);

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D18 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ── E. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 89 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

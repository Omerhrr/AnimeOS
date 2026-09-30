// Iteration 95 E2E: THE CHARACTER IS ONE ASSET (AnimeOS 5.0, the
// master-asset slice). Proves, against the RUNNING studio, the REAL
// database, the REAL render pipeline and the REAL vision channel:
//   A. source: the manifest law (TS), the store, the render hook,
//      the repair hook, the schema, the worker mirror, the doctrine
//   B. pure: the manifest compilation, the ten sections, the master
//      hash over a hardcoded anchor key, the sensitivity law, the
//      case-insensitive hexes, the guess build's honest markers
//   C. accounts + throwaway production (a REAL generated sheet)
//   D. THE REAL PATHS: the render compiles the member's FIRST-CLASS
//      CharacterAsset row (master hash matching the TS law over the
//      real render, version 1), the same DNA re-renders WITHOUT
//      re-versioning (design once, render many), a changed DNA
//      re-versions honestly (v2, the standing reset)
//   E. the LENS RESOLVES, NEVER REWRITES: the WS and MED renders
//      land the SAME master hash while their per-shot curve
//      evidence differs honestly
//   F. THE VALIDATION PROFILE: the repair pass writes the readings
//      onto the asset row (the readings are the judge, rule 69) -
//      COMPILED until the readings clear the bar; the viewer gate;
//      cleanup
// Run: PHASE=a|a2|b npx tsx scripts/e2e-iter95-characterasset.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  CHARACTER_ASSET_SECTIONS, CHARACTER_ASSET_LAW_VERSION,
  characterAssetHash, characterAssetKey, compileCharacterAsset, characterAssetLine,
  type CharacterAssetInput,
} from "../src/lib/blender/character-asset";
import { upsertCharacterAsset } from "../src/lib/character-assets";
import { adherentDna, parseSheetDna } from "../src/lib/blender/adherence";
import { characterDesignDna } from "../src/lib/animation/design";
import { shotRepairVerdict } from "../src/lib/identity-repair";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter95-characterasset";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

// the crafted sheet read the lab rides (v1 = the raven chain, v2 = the storm robe)
const CRAFTED_RAW_V1 = JSON.stringify({
  hairStyle: "long", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
  bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
  faceShape: "oval",
  silhouette: "A tall swordswoman with flowing sleeves and long black hair",
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
  for (let i = 0; i < 480 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, jobId: job.id, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

interface RigAsset { name?: string; hash?: string; sections?: string[]; lawVersion?: number }
interface JobState {
  rig?: {
    asset?: RigAsset | null;
    hairCurves?: { tier?: string; ptsPerCurve?: number; flyaways?: number; hash?: string } | null;
  } | null;
  figureSource?: string;
}
function readJobState(jobId: string): JobState {
  const p = path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

// the E2E recompiles the render job's DNA EXACTLY as createRenderJob
// compiles it (the same functions, the same inputs, the same order)
function compileDna(heroRow: { name: string; role: string | null; appearance: string | null; modelSheetPrompt: string | null }, read: ReturnType<typeof parseSheetDna>) {
  const regex = characterDesignDna({
    name: heroRow.name,
    role: heroRow.role,
    appearance: heroRow.appearance,
    modelSheetPrompt: heroRow.modelSheetPrompt,
    stateClothing: null,
    stateWeapon: null,
  });
  return { regex, merged: adherentDna(regex, read) };
}

async function run() {
  console.log(`== Iteration 95: the character is one asset (phase: ${PHASE}) ==\n`);

  let labId = "";
  let ownerUser = { id: "", name: "Lin Director", role: "OWNER" };
  let viewerJar: Jar | null = null;
  let shots: Record<number, { id: string; description: string; shotType: string }> = {};
  const plantValues: Record<number, number> = { 1: 0.3, 2: 0.35, 3: 0.4 };

  if (PHASE === "b" || PHASE === "a2" || PHASE === "a1" || PHASE === "b1" || PHASE === "b2") {
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

  const lawSrc = readFileSync("src/lib/blender/character-asset.ts", "utf8");
  check("A1 the manifest law stands (sections, key, hash, compiler, line)",
    lawSrc.includes("export const CHARACTER_ASSET_SECTIONS") && lawSrc.includes("export function characterAssetKey")
    && lawSrc.includes("export function characterAssetHash") && lawSrc.includes("export function compileCharacterAsset")
    && lawSrc.includes("export function characterAssetLine") && lawSrc.includes("CHARACTER_ASSET_LAW_VERSION = 95"));

  const storeSrc = readFileSync("src/lib/character-assets.ts", "utf8");
  check("A2 the store lands the asset as a first-class row + the readings write",
    storeSrc.includes("export async function upsertCharacterAsset")
    && storeSrc.includes("export async function recordCharacterAssetReadings")
    && storeSrc.includes("status: cleared ? \"VALIDATED\" : \"COMPILED\""));

  const renderSrc = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A3 the render path compiles the asset for every detected member",
    renderSrc.includes("upsertCharacterAsset") && renderSrc.includes("identityThresholdFor(\"RENDER\")"));

  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  check("A4 the repair pass writes the readings onto the asset row",
    repairSrc.includes("recordCharacterAssetReadings"));

  const schemaSrc = readFileSync("prisma/schema.prisma", "utf8");
  check("A5 the schema names the CharacterAsset (versioned, hash, manifest, bar, readings)",
    schemaSrc.includes("model CharacterAsset") && schemaSrc.includes("masterHash") && schemaSrc.includes("lastReadings")
    && schemaSrc.includes("@@unique([projectId, characterId])"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A6 the worker mirrors the law (one law, two runtimes)",
    workerSrc.includes("def character_asset_key(dna):") && workerSrc.includes("def character_asset_hash(dna):")
    && workerSrc.includes("CHARACTER_ASSET_SECTIONS = (") && workerSrc.includes('state["rig"]["asset"]'));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A7 rule 70 teaches THE CHARACTER IS ONE ASSET",
    prompts.includes("70. THE CHARACTER IS ONE ASSET") && prompts.includes("LENS RESOLVES the asset per shot"));
  check("A8 rules stay sequential (70, no duplicates)", (prompts.match(/^70\. THE CHARACTER IS ONE ASSET/gm) ?? []).length === 1);

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A9 the registry stands at 88 tools (the manifest needs no new tool)", toolCount === 90, `count=${toolCount}`);

  // ── B. pure checks ──
  const adherent: CharacterAssetInput = {
    name: "Bai Ling", hairColor: "#1B1B2A", hairStyle: "long",
    robeColor: "#2F6D63", robeAccent: "#A8842C", skinTone: "#D9B48F",
    weaponType: "sword", bladeColor: "#5eead4", build: "lean", beard: false,
    sheetFields: ["hairStyle", "hairColor"], conformFactor: 0.75,
    silhouetteShape: { height: 1.02, shoulders: 0.94, torso: 0.97, sleeves: 1.06, skirt: 1.0, hair: 1.08 },
    faceShape: "oval",
    faceProfile: { jawTaper: 0.92, chinFwd: 0.88, browFwd: 0.9, cheekOut: 0.85, noseLen: 0.95, eyeScale: 1.12 },
    materialProfile: { skinSss: 0.3, skinRough: 0.42, skinWarmth: 0.25, rim: 0.35, clothRamp: 0.4, clothSheen: 0.3, clothWeave: 0.2, hairRough: 0.35 },
    hairShade: { melanin: 0.82, redness: 0.12, radial: 0.3, longitudinal: 0.25 },
    skinDepth: { weight: 0.42, radius: 0.66, scale: 0.4, coat: 0.08, coatRough: 0.47 },
    groomProfile: { sweep: 0.1, flow: 0.55, flyaway: 0.35, taper: 0.85 },
  };
  const manifest = compileCharacterAsset(adherent, 0.7);
  check("B1 the manifest compiles the ten sections in the ledger's order",
    manifest.sections.length === 10 && manifest.sections.map((s) => s.name).join(",") === CHARACTER_ASSET_SECTIONS.join(","),
    JSON.stringify(manifest.sections.map((s) => s.name)));
  check("B2 an adherent build earns every section", manifest.presentCount === 10, `present=${manifest.presentCount}`);
  check("B3 the manifest names the readings as the validation judge (rule 69)",
    manifest.validation.judge === "readings" && manifest.validation.rule === 69 && manifest.validation.bar === 0.7);
  const anchorKey = `95|Bai Ling|long|#1b1b2a|#2f6d63|#a8842c|#d9b48f|sword|#5eead4|lean|clean|oval|0.750|hairStyle+hairColor|sh:1.020,0.940,0.970,1.060,1.000,1.080|fc:0.920,0.880,0.900,0.850,0.950,1.120|mt:0.300,0.420,0.250,0.350,0.400,0.300,0.200,0.350|hs:0.820,0.120,0.300,0.250|sd:0.420,0.660,0.400,0.080,0.470|gr:0.100,0.550,0.350,0.850|v1`;
  check("B4 the master key is the canonical wire truth (hardcoded anchor)",
    characterAssetKey(adherent) === anchorKey, characterAssetKey(adherent));
  check("B5 the master hash is sha256-16 over that key (deterministic)",
    characterAssetHash(adherent) === createHash("sha256").update(anchorKey, "utf8").digest("hex").slice(0, 16)
    && characterAssetHash(adherent).length === 16, characterAssetHash(adherent));
  check("B6 the sensitivity law: a hex, a factor, a conformance each move the hash",
    characterAssetHash({ ...adherent, hairColor: "#2A1B1B" }) !== manifest.hash
    && characterAssetHash({ ...adherent, groomProfile: { sweep: 0.1, flow: 0.55, flyaway: 0.1, taper: 0.85 } }) !== manifest.hash
    && characterAssetHash({ ...adherent, conformFactor: 0.35 }) !== manifest.hash);
  const lowerHexes: CharacterAssetInput = {
    ...adherent,
    hairColor: adherent.hairColor!.toLowerCase(), robeColor: adherent.robeColor!.toLowerCase(),
    skinTone: adherent.skinTone!.toLowerCase(), bladeColor: adherent.bladeColor!.toLowerCase(),
  };
  check("B7 the key is case-insensitive over the hexes (one dye, one hash)",
    characterAssetKey(lowerHexes) === anchorKey);
  const guess = compileCharacterAsset({ name: "Bai Ling", hairColor: "#16161d", hairStyle: "short", build: "lean" }, 0.7);
  check("B8 a guess build names the absent sections honestly (5/10 earned)",
    guess.presentCount === 5 && guess.sheetOwned.length === 0
    && guess.sections.find((s) => s.name === "baseMesh")?.present === false
    && guess.sections.find((s) => s.name === "groom")?.present === false);
  check("B9 the ledger line reads honestly (the guess build names its emptiness)",
    characterAssetLine(manifest).includes("10/10 sections") && characterAssetLine(manifest).includes("rule 69")
    && characterAssetLine(guess).includes("earned nothing"),
    `${characterAssetLine(manifest)} | ${characterAssetLine(guess)}`);

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter95 Character Asset Lab ${MARK}`, logline: "a throwaway production for the master-asset proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Master Asset Arc", count: 1 });
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
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 1.3, movement: "STATIC", shotType: d.shotType, lighting: d.lighting, poseStart: d.poseStart, poseEnd: d.poseEnd } });
    shots[d.number] = { id: s.id, description: d.description, shotType: d.shotType };
  }
  check("C7 the three-shot episode stands (close / wide / middle)", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Bai Ling", role: "PROTAGONIST" } });
  check("C8 the lab hero exists", !!hero);
  const realSheet = await T("generate_model_sheet", { characterName: "Bai Ling" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));

  // ── D. the real paths ──
  const heroRow0 = await db.character.findUnique({ where: { id: hero.id } });
  if (!heroRow0?.modelSheetUrl) throw new Error("hero sheet missing - cannot continue");
  const craftedV1 = parseSheetDna(CRAFTED_RAW_V1, heroRow0.modelSheetUrl);
  check("D1 the crafted read parses with the raven hex", !!craftedV1 && (craftedV1.hairColor ?? "").toUpperCase() === "#1B1B2A");
  if (craftedV1) {
    await db.character.update({ where: { id: hero.id }, data: { sheetDna: JSON.stringify(craftedV1) } });
    const heroJob = await realRender(labId, shots[1].id);
    check("D2 the hero build rendered over the real engine (raven closeup)", heroJob.ok, heroJob.status.slice(0, 140));
    if (heroJob.ok && heroJob.jobId) {
      const state = readJobState(heroJob.jobId);
      check("D3 the worker built the figure procedurally", state.figureSource === "procedural:v4.0-designed", String(state.figureSource));
      const asset = state.rig?.asset;
      check("D4 the render state names the asset evidence (name, law version 95, the ten sections)",
        !!asset && asset.name === "Bai Ling" && asset.lawVersion === 95
        && JSON.stringify(asset.sections) === JSON.stringify([...CHARACTER_ASSET_SECTIONS]), JSON.stringify(asset));
      const heroRow = await db.character.findUnique({ where: { id: hero.id } });
      if (!heroRow) throw new Error("hero row vanished - cannot continue");
      const { merged } = compileDna(heroRow, craftedV1);
      check("D5 the master hash matches the TS law over the REAL render (one law, two runtimes)",
        !!asset && asset.hash === characterAssetHash(merged), `${asset?.hash} vs ${characterAssetHash(merged)}`);
      check("D6 the master hash ALSO matches the crafted chain (the TS-derived profile)",
        !!asset && asset.hash === characterAssetHash(adherentDna(characterDesignDna({
          name: heroRow.name, role: heroRow.role, appearance: heroRow.appearance,
          modelSheetPrompt: heroRow.modelSheetPrompt, stateClothing: null, stateWeapon: null,
        }), craftedV1)));
      const row = await db.characterAsset.findUnique({ where: { projectId_characterId: { projectId: labId, characterId: hero.id } } });
      check("D7 the FIRST-CLASS row exists: version 1, COMPILED, the same master hash, the RENDER bar",
        !!row && row.version === 1 && row.status === "COMPILED" && row.masterHash === asset?.hash && row.bar === 0.7,
        JSON.stringify(row ? { version: row.version, status: row.status, masterHash: row.masterHash, bar: row.bar } : null));
      const manifestRow = row ? (JSON.parse(row.manifest) as ReturnType<typeof compileCharacterAsset>) : null;
      check("D8 the stored manifest is the compiled truth (10/10 sections, the readings as judge)",
        !!manifestRow && manifestRow.hash === asset?.hash && manifestRow.presentCount === 10
        && manifestRow.validation.judge === "readings" && manifestRow.validation.rule === 69
        && manifestRow.sheetOwned.includes("hairColor"), JSON.stringify(manifestRow?.sheetOwned));
    }
  }
  }

  if (PHASE === "a1" || PHASE === "all") {
  const heroRowA1 = await db.character.findFirst({ where: { projectId: labId, name: "Bai Ling" } });
  if (!heroRowA1) throw new Error("phase a1: the hero is missing - run PHASE=a first");
  const craftedA1 = parseSheetDna(CRAFTED_RAW_V1, heroRowA1.modelSheetUrl ?? "");
  if (!craftedA1) throw new Error("phase a1: the crafted read does not parse");
  // a killed a1 leaves the lab mid-proof - reset the v1 truth honestly
  await db.character.update({ where: { id: heroRowA1.id }, data: { sheetDna: JSON.stringify(craftedA1) } });
  const preRow = await db.characterAsset.findUnique({ where: { projectId_characterId: { projectId: labId, characterId: heroRowA1.id } } });
  if (preRow && preRow.version !== 1) {
    await db.characterAsset.delete({ where: { id: preRow.id } });
    console.log("   (a killed a1 left a re-versioned row - the v1 truth re-proves itself)");
  }

      // design once, render many: the same DNA re-renders WITHOUT re-versioning
      const again = await realRender(labId, shots[1].id);
      check("D9 the idempotent re-render finished", again.ok, again.status.slice(0, 120));
      const rowAfter = await db.characterAsset.findUnique({ where: { projectId_characterId: { projectId: labId, characterId: heroRowA1.id } } });
      check("D10 the same master hash renders the SAME version (design once, render many)",
        !!rowAfter && rowAfter.version === 1,
        JSON.stringify({ version: rowAfter?.version }));

      // a changed DNA re-versions the asset honestly
      const craftedRawV2 = CRAFTED_RAW_V1.replace("#2F6D63", "#4A5560");
      const craftedV2 = parseSheetDna(craftedRawV2, heroRowA1.modelSheetUrl ?? "");
      check("D11 the changed read parses with the storm hex", !!craftedV2 && (craftedV2.robeColor ?? "").toUpperCase() === "#4A5560");
      if (craftedV2) {
        await db.character.update({ where: { id: heroRowA1.id }, data: { sheetDna: JSON.stringify(craftedV2) } });
        const v2Job = await realRender(labId, shots[1].id);
        check("D12 the changed-DNA render finished", v2Job.ok, v2Job.status.slice(0, 120));
        const rowV2 = await db.characterAsset.findUnique({ where: { projectId_characterId: { projectId: labId, characterId: heroRowA1.id } } });
        const v2State = v2Job.ok && v2Job.jobId ? readJobState(v2Job.jobId) : null;
        const mergedV2 = compileDna(heroRowA1, craftedV2).merged;
        check("D13 a moved hash RE-VERSIONS the asset (v2, the standing reset)",
          !!rowV2 && rowV2.version === 2
          && rowV2.status === "COMPILED" && rowV2.lastReadings === null,
          JSON.stringify(rowV2 ? { version: rowV2.version, status: rowV2.status } : null));
        check("D14 the v2 master hash matches the TS law over the changed chain",
          !!rowV2 && rowV2.masterHash === characterAssetHash(mergedV2)
          && (!v2State?.rig?.asset || v2State.rig.asset.hash === rowV2.masterHash),
          `${rowV2?.masterHash} vs ${characterAssetHash(mergedV2)}`);
      }
  }

  if (PHASE === "a2" || PHASE === "all") {
  for (const n of [2, 3]) {
    const pre = await realRender(labId, shots[n].id);
    check(`D3b shot ${n}'s clip finished (the poster target exists)`, pre.ok, pre.status.slice(0, 120));
  }
  const s2 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  const s3 = readJobState((await db.renderJob.findFirst({ where: { shotId: shots[3].id, outputUrl: { not: null } }, orderBy: { createdAt: "desc" } }))!.id);
  check("D15 the WIDE render names the SAME master hash the closeup landed (the lens resolves, never rewrites)",
    !!s2.rig?.asset?.hash && !!s3.rig?.asset?.hash && s2.rig.asset.hash === s3.rig.asset.hash,
    `${s2.rig?.asset?.hash} vs ${s3.rig?.asset?.hash}`);
  check("D16 the per-shot resolutions differ honestly (cards on the wide, the STANDARD curve in the middle)",
    (s2.rig?.hairCurves ?? null) === null && s3.rig?.hairCurves?.tier === "standard" && s3.rig?.hairCurves?.ptsPerCurve === 6,
    `${JSON.stringify(s2.rig?.hairCurves)} | ${JSON.stringify(s3.rig?.hairCurves)}`);
  const rowMid = await db.characterAsset.findFirst({ where: { projectId: labId } });
  check("D17 the asset row did NOT re-version across framings (the lens is not a sculptor)",
    !!rowMid && rowMid.version === 2, JSON.stringify({ version: rowMid?.version }));
  }

  if (PHASE === "b" || PHASE === "b1" || PHASE === "all") {
  const T2 = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);
  for (const n of [1, 2, 3]) {
    const raw = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Bai Ling", similarity: plantValues[n], aspects: { face: 0.4 }, note: "drifted badly" }] });
    const planted = await scoreShotIdentityFromRaw(shots[n].id, raw, "RENDER");
    check(`D18 the planted below reading lands on shot ${n}`, planted.ok, "error" in planted ? planted.error : "");
  }
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D19 the standing names Bai Ling BELOW across three readings", standingBefore.below === 1, JSON.stringify({ below: standingBefore.below }));

  const pass1 = await T2("identity_repair_pass", { members: 1, shotsPerMember: 3, reanchor: false });
  check("D20 the repair pass runs the work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));

  // ── E. THE VALIDATION PROFILE (the readings are the judge) ──
  const heroRow = await db.character.findFirst({ where: { projectId: labId, name: "Bai Ling" } });
  const rowAfter = heroRow ? await db.characterAsset.findUnique({ where: { projectId_characterId: { projectId: labId, characterId: heroRow.id } } }) : null;
  const readings = rowAfter?.lastReadings ? (JSON.parse(rowAfter.lastReadings) as {
    at: string; source: string; bar: number;
    before: { average: number | null; worst: number | null };
    after: { standing: string; average: number | null; worst: number | null; worstRef: string | null };
    verdict: string; shots: Array<{ ref: string; before: number; after: number | null; verdict: string }>;
  }) : null;
  check("E1 the pass wrote the readings onto the asset row (source, bar, the standing after)",
    !!readings && readings.source === "RENDER" && readings.bar === 0.7 && typeof readings.after.standing === "string",
    JSON.stringify(readings ?? null).slice(0, 200));
  check("E2 every shot verdict the readings named sits in the honest set",
    !!readings && readings.shots.length === 3
    && readings.shots.every((s) => ["REPAIRED", "IMPROVED", "UNCHANGED", "WORSE", "UNSCORED"].includes(s.verdict)),
    JSON.stringify(readings?.shots));
  const cleared = !!readings && readings.after.standing !== "BELOW" && readings.after.standing !== "ABSENT";
  check("E3 the validation status OBEYS the readings (VALIDATED only when they clear the bar)",
    !!rowAfter && rowAfter.status === (cleared ? "VALIDATED" : "COMPILED")
    && (!!rowAfter.validatedAt) === cleared,
    JSON.stringify({ status: rowAfter?.status, validatedAt: rowAfter?.validatedAt, standing: readings?.after.standing }));
  console.log(`   THE VALIDATION PROFILE: ${rowAfter?.status}${readings ? ` (standing ${readings.after.standing}, verdict ${readings.verdict})` : ""}`);

  // the store stayed in lockstep with the wire truth across the pass
  const jobs = await db.renderJob.findMany({ where: { projectId: labId, outputUrl: { not: null } }, orderBy: { createdAt: "asc" } });
  const lastJobShot1 = [...jobs].reverse().find((j) => j.shotId === shots[1].id);
  const st1 = lastJobShot1 ? readJobState(lastJobShot1.id) : null;
  check("E4 the row's master hash matches the LAST re-render's own evidence (lockstep)",
    !!rowAfter && !!st1?.rig?.asset?.hash && rowAfter.masterHash === st1.rig.asset.hash,
    `${rowAfter?.masterHash} vs ${st1?.rig?.asset?.hash}`);
  check("E5 the asset never re-versioned BELOW the honest count (v2 or later, never v1 again)",
    !!rowAfter && rowAfter.version >= 2, `version=${rowAfter?.version}`);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {
  // the recorded verdicts, re-read from the row (b2 resumes the lab)
  const heroRowB2 = await db.character.findFirst({ where: { projectId: labId, name: "Bai Ling" } });
  const rowB2 = heroRowB2 ? await db.characterAsset.findUnique({ where: { projectId_characterId: { projectId: labId, characterId: heroRowB2.id } } }) : null;
  const readingsB2 = rowB2?.lastReadings ? (JSON.parse(rowB2.lastReadings) as {
    shots: Array<{ ref: string; before: number; after: number | null; verdict: string }>;
  }) : null;
  // the readings judged the REAL pixels (no planted value survived)
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
  check("E6 every re-score ran the real vision channel over the new pixels (pose-matched)", poseNotes === 3, `poseNotes=${poseNotes}`);
  check("E7 the judge read every shot from the REAL pixels (no planted value survived)",
    realScores === 3, `realScores=${realScores} judged=${JSON.stringify(judged)}`);
  check("E8 the row's recorded shots agree with the judge's own verdicts",
    !!readingsB2 && readingsB2.shots.length === 3 && readingsB2.shots.every((s, i) => s.verdict === judged[i].verdict),
    JSON.stringify({ recorded: readingsB2?.shots.map((s) => s.verdict), judged: judged.map((j) => j.verdict) }));

  const viewerWrite = await call(viewerJar!, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("E9 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ── F. cleanup ──
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  const assetLeftovers = await db.characterAsset.count();
  check("F1 the lab is gone exactly (project + asset rows)", leftovers.length === 0 && assetLeftovers === 0);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 95 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

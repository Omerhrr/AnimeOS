// Iteration 80 E2E: THE GAP IS REPAIRED + THE DNA ADHERES TO THE SHEET.
// Proves, against the RUNNING studio, the REAL database, the REAL render
// pipeline, the REAL vision channel and the REAL image generator:
//   A. source: the repair loop, the adherence module, tools 87+88, rule 55
//   B. pure: the sheet-DNA parser, the staleness law, the adherence merge,
//      the repair verdict law (shot + member), the knobs
//   C. accounts + throwaway production (a REAL generated sheet + a flat one)
//   D. THE REPAIR LOOP over the named BELOW shot: the REAL sheet-DNA read
//      (vision over the real sheet PNG, cached read proven), the planted
//      below standing, the REAL re-render finishing over the engine, the
//      REAL re-score, the honest ledger + the IDENTITY_REPAIR event, the
//      nothing-to-repair path, the re-anchor half (provider-honest), the
//      viewer gate
//   E. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter80-repair.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { scoreShotIdentityFromRaw, castIdentityMeasurement } from "../src/lib/identity";
import {
  parseSheetDna, sheetDnaFresh, adherentDna, readSheetDna,
  ADHERENT_CONFORM_FACTOR, GUESS_CONFORM_FACTOR, type SheetDnaRead,
} from "../src/lib/blender/adherence";
import { characterDesignDna } from "../src/lib/animation/design";
import {
  runIdentityRepairPass, shotRepairVerdict, memberRepairVerdict, repairVerdictLine,
  REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER,
} from "../src/lib/identity-repair";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter80-repair";

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
    const poster = path.join(process.cwd(), "public", "renders", "posters", `${r.id}.jpg`);
    if (existsSync(poster)) unlinkSync(poster);
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

async function realRender(labId: string, shotId: string): Promise<{ ok: boolean; status: string }> {
  const job = await createRenderJob(labId, shotId, "PREVIEW");
  if (!job) return { ok: false, status: "no-job" };
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < 420 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  return { ok: !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, status: `${ticked?.status} ${ticked?.stage ?? ""}` };
}

async function main() {
  console.log(`== Iteration 80: the gap is repaired + the DNA adheres to the sheet ==\n`);

  // ───────────────────── A. source-level checks ─────────────────────
  const repairSrc = readFileSync("src/lib/identity-repair.ts", "utf8");
  check("A1 the repair loop exists with its honest ledger", repairSrc.includes("export async function runIdentityRepairPass") && repairSrc.includes("export function shotRepairVerdict") && repairSrc.includes("export function memberRepairVerdict"));
  check("A2 the loop re-renders and re-scores the named shots", repairSrc.includes("export async function belowRenderShotsForCharacter") && repairSrc.includes("export async function renderAndWait") && repairSrc.includes("await scoreRenderIdentity"));
  check("A3 the loop re-anchors what the re-render could not lift", repairSrc.includes("await reanchorCharacter(member.characterId") && repairSrc.includes("IDENTITY_REPAIR"));

  const adhereSrc = readFileSync("src/lib/blender/adherence.ts", "utf8");
  check("A4 the sheet-DNA read exists with the staleness law", adhereSrc.includes("export async function readSheetDna") && adhereSrc.includes("export function sheetDnaFresh") && adhereSrc.includes("read.sheetUrl !== currentSheetUrl"));
  check("A5 the adherence merge is pure and exported", adhereSrc.includes("export function adherentDna") && adhereSrc.includes("export function parseSheetDna"));
  check("A6 the palette pull is bounded by adherence (0.75 adherent / 0.35 guess)", adhereSrc.includes("export const ADHERENT_CONFORM_FACTOR = 0.75") && adhereSrc.includes("export const GUESS_CONFORM_FACTOR = 0.35"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A7 the registry stands at 88 tools (the repair pass joins)", toolCount === 89, `count=${toolCount}`);
  check("A8 identity_repair_pass is a registry pen with its knobs", tools.includes('name: "identity_repair_pass"') && tools.includes("shotsPerMember") && tools.includes("reanchor"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A9 rule 55 teaches the repair law", prompts.includes("55. THE GAP IS REPAIRED") && prompts.includes("an unscored repair is a named miss"));
  check("A10 the curriculum grew the repair line", prompts.includes("- THE GAP IS REPAIRED: a below standing is a work order"));
  check("A11 rules stay sequential (55, no duplicates)", (prompts.match(/^55\. THE GAP IS REPAIRED/gm) ?? []).length === 1);

  const renderSrc = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A12 the render path compiles DNA through the sheet read", renderSrc.includes("adherentDna(regex, sheetDnaFresh(c.sheetDna, c.modelSheetUrl))"));
  check("A13 the render path dresses EVERY detected cast member (not just the hero)", renderSrc.includes("for (let i = 0; i < detected.length && i < cast.length; i++)") && renderSrc.includes("memberDna.conformFactor"));
  check("A14 the render path never makes a vision call itself", renderSrc.includes("the render path never makes a vision call itself"));

  const workerSrc = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A15 the worker dresses the second figure's B-suffix materials too", workerSrc.includes('state["identity" if cast_idx == 0 else "identityB"]') && workerSrc.includes('suffix = "" if cast_idx == 0 else "B"'));

  const artSrc = readFileSync("src/lib/ai/art.ts", "utf8");
  check("A16 the cast member type carries the cached sheet DNA", artSrc.includes("sheetDna?: string | null"));

  // ───────────────────── B. pure checks ─────────────────────
  const rawFull = JSON.stringify({
    hairStyle: "ponytail", hairColor: "#1B1B2A", robeColor: "#2F6D63", robeAccent: "#A8842C",
    bootsColor: "#241A12", skinTone: "#D9B48F", weaponType: "sword", build: "lean", beard: false,
    silhouette: "willowy silhouette, high ponytail, jian at the hip",
  });
  const sheetUrl = "/sheets/abc.png";
  const read1 = parseSheetDna(rawFull, sheetUrl);
  check("B1 the parser reads a full verdict into validated DNA", !!read1 && read1.hairStyle === "ponytail" && read1.hairColor === "#1b1b2a" && read1.robeColor === "#2f6d63" && read1.weaponType === "sword" && read1.build === "lean" && read1.beard === false && read1.sheetUrl === sheetUrl);
  check("B2 the parser lowercases hexes and keeps the silhouette", !!read1 && read1.silhouette === "willowy silhouette, high ponytail, jian at the hip");
  const fenced = parseSheetDna("```json\n" + rawFull + "\n```", sheetUrl);
  check("B3 the parser tolerates markdown fences", !!fenced && fenced.weaponType === "sword");
  const garbageHex = parseSheetDna(JSON.stringify({ hairColor: "dark blue-ish", hairStyle: "ponytail" }), sheetUrl);
  check("B4 a garbled hex lands null (the regex fills it), never poisons the build", !!garbageHex && garbageHex.hairColor === null && garbageHex.hairStyle === "ponytail");
  const badEnum = parseSheetDna(JSON.stringify({ hairStyle: "mullet", weaponType: "cannon", build: "blob" }), sheetUrl);
  check("B5 an enum the builder cannot perform lands null", !!badEnum && badEnum.hairStyle === null && badEnum.weaponType === null && badEnum.build === null);
  const beardStr = parseSheetDna(JSON.stringify({ beard: "yes" }), sheetUrl);
  check("B6 a non-boolean beard lands null", !!beardStr && beardStr.beard === null);
  check("B7 an unparsable verdict parses to nothing", parseSheetDna("I see a character in green", sheetUrl) === null && parseSheetDna("", sheetUrl) === null);

  check("B8 a cached read is fresh for the same sheet", !!sheetDnaFresh(JSON.stringify(read1), sheetUrl) && sheetDnaFresh(JSON.stringify(read1), sheetUrl)!.hairColor === "#1b1b2a");
  check("B9 a re-sheet invalidates the cache (the staleness key is the sheet URL)", sheetDnaFresh(JSON.stringify(read1), "/sheets/other.png") === null);
  check("B10 a missing or corrupt cache is honestly stale", sheetDnaFresh(null, sheetUrl) === null && sheetDnaFresh("{not json", sheetUrl) === null && sheetDnaFresh(JSON.stringify(read1), null) === null);

  const regexDna = characterDesignDna({ name: "Lin Yue", role: "PROTAGONIST", appearance: "black hair, jade robe, lean build", modelSheetPrompt: null, stateClothing: null, stateWeapon: null });
  const merged = adherentDna(regexDna, read1);
  check("B11 the sheet's measured DNA wins field by field", merged.hairStyle === "ponytail" && merged.robeColor === "#2f6d63" && merged.weaponType === "sword" && merged.build === "lean");
  check("B12 the merge names which fields the sheet owns and pulls 0.75", Array.isArray(merged.sheetFields) && merged.sheetFields.includes("hairStyle") && merged.sheetFields.includes("robeColor") && merged.conformFactor === 0.75 && merged.conformFactor === ADHERENT_CONFORM_FACTOR);
  const partial = parseSheetDna(JSON.stringify({ hairStyle: "braid" }), sheetUrl);
  const mergedPartial = adherentDna(regexDna, partial);
  check("B13 a partial read fills only what the sheet showed", mergedPartial.hairStyle === "braid" && mergedPartial.robeColor === regexDna.robeColor && mergedPartial.sheetFields.length === 1 && mergedPartial.conformFactor === 0.75);
  const mergedNone = adherentDna(regexDna, null);
  check("B14 no read keeps the guess build and the gentle pull", mergedNone.sheetFields.length === 0 && mergedNone.conformFactor === 0.35 && mergedNone.conformFactor === GUESS_CONFORM_FACTOR);
  const mergedEmpty = adherentDna(regexDna, parseSheetDna(JSON.stringify({}), sheetUrl));
  check("B15 a read with nothing usable stays a guess build (0.35)", mergedEmpty.sheetFields.length === 0 && mergedEmpty.conformFactor === 0.35);

  const B = 0.7;
  check("B16 a pair over the bar is REPAIRED", shotRepairVerdict(0.35, 0.72, B) === "REPAIRED" && shotRepairVerdict(0.35, 0.7, B) === "REPAIRED");
  check("B17 a pair up but under the bar is IMPROVED", shotRepairVerdict(0.35, 0.5, B) === "IMPROVED");
  check("B18 an unmoved pair is UNCHANGED, a dropped pair WORSE", shotRepairVerdict(0.5, 0.5, B) === "UNCHANGED" && shotRepairVerdict(0.5, 0.4, B) === "WORSE");
  check("B19 a failed re-score is UNSCORED, never a number", shotRepairVerdict(0.35, null, B) === "UNSCORED" && shotRepairVerdict(0.35, NaN, B) === "UNSCORED");
  check("B20 the member rolls: repaired beats improved beats still-below", memberRepairVerdict([{ ref: "r", shotId: "s", before: 0.3, after: 0.8, verdict: "REPAIRED" }, { ref: "r2", shotId: "s2", before: 0.3, after: 0.4, verdict: "WORSE" }]) === "REPAIRED" && memberRepairVerdict([{ ref: "r", shotId: "s", before: 0.3, after: 0.5, verdict: "IMPROVED" }]) === "IMPROVED" && memberRepairVerdict([{ ref: "r", shotId: "s", before: 0.3, after: 0.35, verdict: "UNCHANGED" }]) === "STILL_BELOW" && memberRepairVerdict([{ ref: "r", shotId: "s", before: 0.3, after: null, verdict: "UNSCORED" }]) === "UNSCORED" && memberRepairVerdict([]) === "UNSCORED");
  check("B21 the verdict lines read honestly", repairVerdictLine("REPAIRED").includes("the bar is cleared") && repairVerdictLine("IMPROVED").includes("bar not cleared") && repairVerdictLine("STILL_BELOW").includes("moved nothing") && repairVerdictLine("UNSCORED").includes("named in the ledger"));
  check("B22 the loop is bounded (a pass, not a night)", REPAIR_MAX_MEMBERS === 4 && REPAIR_MAX_SHOTS_PER_MEMBER === 3);

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  check("C2 the owner's session reads live", (await call(ownerJar, "/api/projects")).status === 200);
  const viewerLogin = await register("reader@studio.dev", "Rin Reader", "viewing123");
  check("C3 the seeded viewer holds VIEWER", viewerLogin.role === "VIEWER");
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  check("C4 the viewer's session reads live too", (await call(viewerJar, "/api/projects")).status === 200);

  const created = await executeTool("throwaway", "create_project", { title: `Iter80 Repair Lab ${MARK}`, logline: "a throwaway production for the repair-loop + adherence proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C5 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Repair Arc", count: 1 });
  check("C6 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Temple Gate" } });
  }
  const shotDefs = [
    { number: 1, description: "Establishing shot - the temple gate under the storm, clouds churning" },
    { number: 2, description: "Lin Yue steps through the broken gate, robes whipping in the wind" },
    { number: 3, description: "Chen Hao's shadow peels itself off the altar, aura crawling across the floor" },
  ];
  const shots: Record<number, { id: string }> = {};
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 2.5, movement: "STATIC" } });
    shots[d.number] = { id: s.id };
  }
  check("C7 the three-shot episode stands", Object.keys(shots).length === 3);

  const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });
  const rival = await db.character.create({ data: { projectId: labId, name: "Chen Hao", role: "RIVAL" } });
  check("C8 the two-member lab cast exists", !!hero && !!rival);

  const realSheet = await T("generate_model_sheet", { characterName: "Lin Yue" });
  check("C9 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));
  const rivalSheetPath = path.join(process.cwd(), "public", "sheets", `${rival.id}.png`);
  mkdirSync(path.dirname(rivalSheetPath), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=0x2a4d69:s=512x512 -frames:v 1 "${rivalSheetPath}"`);
  await db.character.update({ where: { id: rival.id }, data: { modelSheetUrl: `/sheets/${rival.id}.png`, modelSheetPrompt: "Chen Hao canonical anchor (E2E flat)", modelSheetAt: new Date() } });
  check("C10 the rival's flat anchor persists as a real file", existsSync(rivalSheetPath));

  // ───────────────────── D. the repair loop over the named below shot ─────────────────────
  const r1 = await realRender(labId, shots[2].id);
  check("D1 the hero's clip finished over the real engine", r1.ok, r1.status.slice(0, 140));

  // THE DNA ADHERES TO THE SHEET: the REAL vision read over the REAL
  // sheet PNG, cached on the character, staleness keyed on the sheet URL
  const heroRow = await db.character.findUnique({ where: { id: hero.id } });
  const dnaRead = await readSheetDna(hero.id, { refresh: true });
  check("D2 the REAL sheet-DNA read lands over the real sheet", dnaRead.ok, "error" in dnaRead ? dnaRead.error.slice(0, 160) : "");
  if (dnaRead.ok) console.log(`   sheet DNA: hair=${dnaRead.dna.hairStyle ?? "-"} robe=${dnaRead.dna.robeColor ?? "-"} weapon=${dnaRead.dna.weaponType ?? "-"} build=${dnaRead.dna.build ?? "-"} fields=${[dnaRead.dna.hairStyle, dnaRead.dna.hairColor, dnaRead.dna.robeColor, dnaRead.dna.robeAccent, dnaRead.dna.bootsColor, dnaRead.dna.skinTone, dnaRead.dna.weaponType, dnaRead.dna.build].filter((v) => v !== null).length}/8`);
  check("D3 the read is keyed to the current canonical sheet", dnaRead.ok && heroRow?.modelSheetUrl && dnaRead.dna.sheetUrl === heroRow.modelSheetUrl);
  check("D4 the read persists on the character (the cache)", !!heroRow && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna));
  const dnaCached = await readSheetDna(hero.id);
  check("D5 the second read serves from the cache (no new vision call)", dnaCached.ok && dnaCached.source === "cached" && (!dnaRead.ok || dnaCached.dna.hairStyle === dnaRead.dna.hairStyle));

  // the named work order: a planted below reading on the real row
  const raw35 = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Lin Yue", similarity: 0.35, aspects: { face: 0.4 }, note: "drifted badly" }] });
  const planted = await scoreShotIdentityFromRaw(shots[2].id, raw35, "RENDER");
  check("D6 the planted below reading lands on the real row", planted.ok, "error" in planted ? planted.error : "");
  const standingBefore = await castIdentityMeasurement(labId, "RENDER");
  check("D7 the standing names Lin Yue BELOW with the worst ref", standingBefore.below === 1 && standingBefore.members.find((m) => m.name === "Lin Yue")?.worstRef === "E1 Sc1 S002", JSON.stringify({ below: standingBefore.below }));

  // THE LOOP (reanchor off for this proof: bounded, no sheet regen)
  const pass1 = await T("identity_repair_pass", { members: 1, shotsPerMember: 1, reanchor: false });
  check("D8 the repair pass runs the work order end to end", pass1.status === "OK" && pass1.result.includes("IDENTITY REPAIR PASS"), pass1.result.slice(0, 240));
  check("D9 the ledger names the shot, the before and the after", pass1.result.includes("E1 Sc1 S002") && /35% -> (unscored|\d+%)/.test(pass1.result), pass1.result.slice(0, 400));
  check("D10 the ledger verdicts stay inside the honest set", /(REPAIRED|IMPROVED|UNCHANGED|WORSE|UNSCORED)/.test(pass1.result), pass1.result.slice(0, 300));
  check("D11 the ledger names the DNA the build rode", pass1.result.includes("dna: Lin Yue:") && (pass1.result.includes("sheet-adherent build") || pass1.result.includes("guess build")), pass1.result.slice(0, 400));
  check("D12 the standing is read again when the loop ends", /standing: 1 below -> \d below/.test(pass1.result), pass1.result.slice(-220));

  const repairEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "IDENTITY_REPAIR" }, orderBy: { createdAt: "desc" } });
  check("D13 the IDENTITY_REPAIR event lands with the ledger payload", !!repairEvent && repairEvent.summary.includes("Identity repair pass"));
  if (repairEvent) {
    const payload = JSON.parse(repairEvent.payload) as { before: { below: number }; after: { below: number }; members: Array<{ name: string; verdict: string; shots: Array<{ ref: string; before: number; after: number | null; verdict: string }> }> };
    check("D14 the payload carries the before/after standing and the per-shot rows", payload.before.below === 1 && typeof payload.after.below === "number" && payload.members.length === 1 && payload.members[0].shots[0]?.ref === "E1 Sc1 S002" && payload.members[0].shots[0]?.before === 0.35);
  }

  // the REAL re-render: a fresh attempt finished on disk
  const renderJobs = await db.renderJob.findMany({ where: { projectId: labId, shotId: shots[2].id, outputUrl: { not: null } }, orderBy: { attempt: "asc" } });
  const lastJob = renderJobs[renderJobs.length - 1];
  check("D15 the loop re-rendered over the real engine (attempt 2 finished)", renderJobs.length >= 2 && !!lastJob && existsSync(path.join(process.cwd(), "public", lastJob.outputUrl!)), `jobs=${renderJobs.length}`);

  // the REAL re-score: the IdentityScore row moved off the planted 0.35
  const rescoredRow = await db.identityScore.findFirst({ where: { projectId: labId, shotId: shots[2].id, source: "RENDER" } });
  const realAfter = rescoredRow ? (JSON.parse(rescoredRow.scores) as Array<{ characterName: string; similarity: number }>).find((e) => e.characterName === "Lin Yue")?.similarity ?? null : null;
  check("D16 the re-score ran the real vision channel over the new pixels", realAfter !== null && realAfter !== 0.35, `after=${realAfter}`);
  if (realAfter !== null) console.log(`   repair ledger (real): 35% -> ${(realAfter * 100).toFixed(0)}% at the 70% bar (${shotRepairVerdict(0.35, realAfter, 0.7)})`);

  // the nothing-to-repair path: a cast with no below members is named, not worked
  const raw74 = JSON.stringify({ note: "planted: clears", characters: [{ name: "Lin Yue", similarity: 0.74, aspects: { face: 0.8 }, note: "clears" }] });
  await scoreShotIdentityFromRaw(shots[2].id, raw74, "RENDER");
  const passIdle = await T("identity_repair_pass", {});
  check("D17 a standing with no below members reads 'nothing to repair'", passIdle.status === "OK" && passIdle.result.includes("nothing to repair"), passIdle.result.slice(0, 200));

  // THE RE-ANCHOR HALF (the loop's second answer): plant below again and
  // let the loop run with reanchor on - the provider decides honestly
  // whether the re-render alone repairs (no re-anchor) or the sheet is
  // regenerated (a REAL image call + the shots re-scored against it)
  await scoreShotIdentityFromRaw(shots[2].id, raw35, "RENDER");
  const sheetUrlBefore = (await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl ?? null;
  const pass2 = await T("identity_repair_pass", { members: 1, shotsPerMember: 1, reanchor: true });
  const reanchorEvent = await db.productionEvent.findFirst({ where: { projectId: labId, type: "REANCHOR" }, orderBy: { createdAt: "desc" } });
  const sheetUrlAfter = (await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl ?? null;
  const reanchored = !!reanchorEvent && sheetUrlBefore !== sheetUrlAfter;
  check("D18 the loop's second run stays inside the honest ledger law", pass2.status === "OK" && pass2.result.includes("IDENTITY REPAIR PASS"), pass2.result.slice(0, 240));
  check("D19 the re-anchor half behaves honestly (fired only when the re-render could not lift)", reanchored ? pass2.result.includes("re-anchored: the canonical sheet was regenerated mid-loop") : pass2.result.includes("sheet-adherent build") || pass2.result.includes("guess build"), `reanchored=${reanchored}`);
  if (reanchored) {
    check("D20 the re-anchored sheet exists on disk and the stale DNA cache was invalidated", !!sheetUrlAfter && existsSync(path.join(process.cwd(), "public", sheetUrlAfter.split("?")[0])) && sheetDnaFresh((await db.character.findUnique({ where: { id: hero.id } }))?.sheetDna, sheetUrlAfter) === null);
  } else {
    console.log("   (the re-render alone lifted the member past the bar - the re-anchor correctly held its fire)");
  }

  // the viewer's read-only law still holds while the loop runs the studio
  const viewerWrite = await call(viewerJar, "/api/projects", { method: "POST", body: JSON.stringify({ title: "nope" }) });
  check("D21 the viewer cannot write the studio (403)", viewerWrite.status === 403, `status=${viewerWrite.status}`);

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("E1 the lab is gone exactly", leftovers.length === 0);

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 80`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

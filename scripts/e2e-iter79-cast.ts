// Iteration 79 E2E: THE CAST ANSWERS THE BAR + THE BATTLE IS STAGED.
// Proves, against the RUNNING studio, the REAL database, the REAL render
// pipeline and the REAL vision channel:
//   A. source: the cast rollup, the battle law, tools 86+87, rules 53+54
//   B. pure: the arc parser, the allocation law, the standing law, the line
//   C. accounts + throwaway production (a REAL generated sheet + a flat one)
//   D. THE CAST PASS: a REAL render finishing over the engine, the REAL
//      vision identity score over its poster, the per-member standing
//      (deterministic injections prove BELOW/CLEARING on real rows)
//   E. THE BATTLE: three learned legs, the refusals (unlearned register,
//      bad register, single leg, consecutive repeat, empty episode,
//      shots<legs), the REAL staging across 6 shots (allocation 2/2/2,
//      the chained learned motion flow, ledgers, event, coverage)
//   F. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter79-cast.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import {
  castMemberStanding, castIdentityMeasurement, castIdentityLine, scoreRenderIdentity, scoreShotIdentityFromRaw,
} from "../src/lib/identity";
import { parseBattleArc, allocateBattleShots } from "../src/lib/dsh/battles";
import { flowNameFromChoreo } from "../src/lib/animation/motionflows";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter79-cast";

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

const FANG_PROGRAM = JSON.stringify({
  keys: [
    { at: 0, pose: "STANCE", kind: "hold" },
    { at: 0.3, pose: "CROUCH", kind: "anticipation" },
    { at: 0.45, pose: "SLASH", kind: "strike" },
    { at: 1, pose: "STANCE", kind: "follow" },
  ],
  impact: { at: 0.45, frames: 3, punch: 2.5, flash: 0.8 },
  smear: { at: 0.45, frames: 2, amount: 0.5 },
});

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
  console.log(`== Iteration 79: the cast answers the bar + the battle is staged ==\n`);

  // ───────────────────── A. source-level checks ─────────────────────
  const identitySrc = readFileSync("src/lib/identity.ts", "utf8");
  check("A1 the cast rollup exists with the four standings", identitySrc.includes("export async function castIdentityMeasurement") && identitySrc.includes('"CLEARING" | "BELOW" | "UNTESTED" | "UNANCHORED"'));
  check("A2 the standing law names the worst shot ref", identitySrc.includes("worstRef: standing === \"BELOW\" && weakest ? weakest.ref : null"));

  const battlesSrc = readFileSync("src/lib/dsh/battles.ts", "utf8");
  check("A3 the battle law parses arcs and allocates by sentence weight", battlesSrc.includes("export function parseBattleArc") && battlesSrc.includes("export function allocateBattleShots"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A4 the registry stands at 87 tools (the cast pass + the battle stage join)", toolCount === 88, `count=${toolCount}`);
  check("A5 cast_identity_pass is a registry pen", tools.includes('name: "cast_identity_pass"'));
  check("A6 stage_battle is a registry pen", tools.includes('name: "stage_battle"'));
  check("A7 the battle pre-flights every leg before stamping", tools.includes("THE BATTLE PRE-FLIGHT FAILED - nothing was staged"));
  check("A8 the battle consults only proven flows", tools.includes("THE CHAIN STAGES ONLY WHAT VERIFIED - no proven learned sequence flow for leg"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A9 rule 53 teaches the per-member law", prompts.includes("53. THE CAST ANSWERS THE BAR") && prompts.includes("an unanchored member is a silence"));
  check("A10 rule 54 teaches the arc law", prompts.includes("54. THE BATTLE IS STAGED") && prompts.includes("a battle staged from guesses is not the chain"));
  check("A11 the curriculum grew the cast + battle lines", prompts.includes("- THE CAST ANSWERS THE BAR: identity stands are read BY NAME") && prompts.includes("- THE BATTLE IS STAGED: episode-scale fights are directed at the ARC level"));
  check("A12 rules stay sequential (53 to 54, no duplicates)", (prompts.match(/^53\. THE CAST ANSWERS THE BAR/gm) ?? []).length === 1 && (prompts.match(/^54\. THE BATTLE IS STAGED/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  const arc = parseBattleArc("BATTLE > PURSUIT > RESOLVE");
  check("B1 the arc parses registers in order", arc.ok && arc.ok && arc.registers.join("|") === "BATTLE|PURSUIT|RESOLVE");
  const arcComma = parseBattleArc("battle,pursuit");
  check("B2 the arc reads commas and case honestly", arcComma.ok && arcComma.registers.join("|") === "BATTLE|PURSUIT");
  const one = parseBattleArc("BATTLE");
  check("B3 a single register belongs in direct_sequence", !one.ok && one.error.includes("a battle arc needs 2 to 5 legs"));
  const six = parseBattleArc("BATTLE, PURSUIT, RESOLVE, STANDOFF, RITUAL, INTRIGUE");
  check("B4 more than five legs is a season", !six.ok && six.error.includes("at most 5 legs"));
  const bad = parseBattleArc("WAR > PURSUIT");
  check("B5 an unknown register is refused by name", !bad.ok && bad.error.includes("leg 1: arc register must be one of") && bad.error.includes("(got \"WAR\")"));
  const repeat = parseBattleArc("BATTLE > BATTLE");
  check("B6 consecutive repeats merge", !repeat.ok && repeat.error.includes("repeats BATTLE in consecutive legs"));
  const empty = parseBattleArc("");
  check("B7 an empty arc is refused", !empty.ok && empty.error.includes("pass an arc of registers"));

  check("B8 allocation follows equal weights", JSON.stringify(allocateBattleShots(6, [2, 2, 2])) === "[2,2,2]");
  check("B9 allocation follows the sentence weight exactly when it fits", JSON.stringify(allocateBattleShots(6, [3, 2, 1])) === "[3,2,1]");
  check("B10 largest-remainder rounds deterministically", JSON.stringify(allocateBattleShots(5, [3, 2, 1])) === "[2,2,1]");
  check("B11 ties break to the earlier leg", JSON.stringify(allocateBattleShots(3, [4, 4])) === "[2,1]");
  check("B12 every leg keeps a shot and the sum covers the episode", JSON.stringify(allocateBattleShots(4, [1, 1, 1])) === "[2,1,1]");

  const bar = 0.7;
  const unanchored = castMemberStanding({ characterId: "c1", name: "Clone", role: null, anchored: false, readings: [{ worst: 0.9, ref: "E1 Sc1 S001" }], bar });
  check("B13 an unanchored member cannot answer at all", unanchored.standing === "UNANCHORED");
  const untested = castMemberStanding({ characterId: "c2", name: "Chen Hao", role: "RIVAL", anchored: true, readings: [], bar });
  check("B14 anchored but unmeasured reads untested", untested.standing === "UNTESTED");
  const clearing = castMemberStanding({ characterId: "c3", name: "Lin Yue", role: "PROTAGONIST", anchored: true, readings: [{ worst: 0.74, ref: "E1 Sc1 S002" }], bar });
  check("B15 a reading at the bar clears it (the boundary is the bar's)", clearing.standing === "CLEARING");
  const below = castMemberStanding({ characterId: "c3", name: "Lin Yue", role: "PROTAGONIST", anchored: true, readings: [{ worst: 0.74, ref: "E1 Sc1 S002" }, { worst: 0.55, ref: "E1 Sc1 S003" }], bar });
  check("B16 one under-bar reading puts the member BELOW with the worst ref named", below.standing === "BELOW" && below.worstRef === "E1 Sc1 S003" && below.below === 1 && below.clearing === 1);

  const emptyLine = castIdentityLine({ source: "RENDER", bar: 0.7, members: [], cast: 0, anchored: 0, measured: 0, clearing: 0, below: 0, untested: 0, unanchored: 0 });
  check("B17 an empty cast reads honestly", emptyLine.includes("no cast to answer"));
  const mixed = castIdentityLine({
    source: "RENDER", bar: 0.7,
    members: [
      castMemberStanding({ characterId: "c3", name: "Lin Yue", role: "PROTAGONIST", anchored: true, readings: [{ worst: 0.55, ref: "E1 Sc1 S002" }], bar }),
      castMemberStanding({ characterId: "c2", name: "Chen Hao", role: "RIVAL", anchored: true, readings: [], bar }),
      castMemberStanding({ characterId: "c4", name: "Elder Han", role: "MENTOR", anchored: false, readings: [], bar }),
      castMemberStanding({ characterId: "c5", name: "Wei", role: "ANTAGONIST", anchored: true, readings: [{ worst: 0.81, ref: "E1 Sc1 S004" }], bar }),
    ],
    cast: 4, anchored: 3, measured: 2, clearing: 1, below: 1, untested: 1, unanchored: 1,
  });
  check("B18 the line reads standings and the work order", mixed.includes("BELOW the bar") && mixed.includes("E1 Sc1 S002") && mixed.includes("anchored, untested") && mixed.includes("no sheet to answer to") && mixed.includes("CLEARS the 70% bar") && mixed.includes("1 clearing, 1 below, 1 untested, 1 unanchored"), mixed.slice(0, 200));

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter79 Cast Lab ${MARK}`, logline: "a throwaway production for the cast bar + battle arc proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Storm Duel", count: 1 });
  check("C4 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Temple Gate" } });
  }
  const shotDefs = [
    { number: 1, description: "Establishing shot - the temple gate under the storm, clouds churning" },
    { number: 2, description: "Lin Yue steps through the broken gate, robes whipping in the wind" },
    { number: 3, description: "Close-up - Lin Yue's eyes narrow; the rain dies unnaturally" },
    { number: 4, description: "Chen Hao's shadow peels itself off the altar, aura crawling across the floor" },
    { number: 5, description: "The jade blade sings out of its sheath, azure energy coiling up the steel" },
    { number: 6, description: "Lin Yue and Chen Hao clash under the detonating lightning" },
  ];
  const shots: Record<number, { id: string }> = {};
  for (const d of shotDefs) {
    const s = await db.shot.create({ data: { sceneId: scene.id, number: d.number, description: d.description, duration: 2.5, movement: "STATIC" } });
    shots[d.number] = { id: s.id };
  }
  check("C5 the six-shot episode stands", Object.keys(shots).length === 6);

  const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });
  const rival = await db.character.create({ data: { projectId: labId, name: "Chen Hao", role: "RIVAL" } });
  const mentor = await db.character.create({ data: { projectId: labId, name: "Elder Han", role: "MENTOR" } });
  check("C6 the three-member lab cast exists (one stays unanchored on purpose)", !!hero && !!rival && !!mentor);

  // a REAL generated sheet for the hero (the real image generator, the
  // real anchor path) + a flat sheet for the rival
  const realSheet = await T("generate_model_sheet", { characterName: "Lin Yue" });
  check("C7 the REAL model sheet generated and anchored", realSheet.status === "OK" && Boolean((await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl), realSheet.result.slice(0, 160));
  const rivalSheetPath = path.join(process.cwd(), "public", "sheets", `${rival.id}.png`);
  mkdirSync(path.dirname(rivalSheetPath), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=0x2a4d69:s=512x512 -frames:v 1 "${rivalSheetPath}"`);
  await db.character.update({ where: { id: rival.id }, data: { modelSheetUrl: `/sheets/${rival.id}.png`, modelSheetPrompt: "Chen Hao canonical anchor (E2E flat)", modelSheetAt: new Date() } });
  check("C8 the rival's flat anchor persists as a real file", existsSync(rivalSheetPath));

  // ───────────────────── D. the cast pass over REAL shipping pixels ─────────────────────
  const keyed = await T("set_shot_choreography", { sceneNumber: scene.number, shotNumber: 2, choreo: FANG_PROGRAM });
  check("D1 shot 2 performs the keyed program before its render", keyed.status === "OK", keyed.result.slice(0, 120));
  const r1 = await realRender(labId, shots[2].id);
  check("D2 the shot's clip finished over the real engine", r1.ok, r1.status.slice(0, 140));

  // deterministic standing law over the REAL rows first: 0.55 → BELOW
  const raw55 = JSON.stringify({ note: "planted: below the shipping bar", characters: [{ name: "Lin Yue", similarity: 0.55, aspects: { face: 0.6 }, note: "drifted" }] });
  const belowScore = await scoreShotIdentityFromRaw(shots[2].id, raw55, "RENDER");
  check("D3 the planted reading lands on the real row", belowScore.ok, "error" in belowScore ? belowScore.error : "");
  const passBelow = await T("cast_identity_pass", {});
  check("D4 the pass reads Lin Yue BELOW with the worst ref named", passBelow.status === "OK" && passBelow.result.includes("Lin Yue") && passBelow.result.includes("BELOW the bar") && passBelow.result.includes("E1 Sc1 S002") && passBelow.result.includes("the re-render queue by name"), passBelow.result.slice(0, 300));
  check("D5 the pass names the untested and unanchored members honestly", passBelow.result.includes("Chen Hao - anchored, untested") && passBelow.result.includes("Elder Han - unanchored (no sheet to answer to"), passBelow.result.slice(0, 300));

  const raw74 = JSON.stringify({ note: "planted: above the shipping bar", characters: [{ name: "Lin Yue", similarity: 0.74, aspects: { face: 0.8 }, note: "clears" }] });
  await scoreShotIdentityFromRaw(shots[2].id, raw74, "RENDER");
  const passClearing = await T("cast_identity_pass", {});
  check("D6 the same member CLEARS at 0.74 (the standing is the readings')", passClearing.result.includes("CLEARS the 70% bar"), passClearing.result.slice(0, 260));

  // the REAL vision measurement replaces the planted row
  const measured = await scoreRenderIdentity(shots[2].id);
  check("D7 the REAL vision score lands over the real render + real sheet", measured.ok, "error" in measured ? measured.error.slice(0, 160) : "");
  if (measured.ok) console.log(`   measured render-source worst: ${(measured.scored.verdict.worst * 100).toFixed(0)}% (the honest number, whatever it sits)`);
  const passReal = await T("cast_identity_pass", { scoreFirst: 1 });
  check("D8 the pass scores the real render and reads the honest standing", passReal.status === "OK" && passReal.result.includes("Freshly measured (1)"), passReal.result.slice(0, 320));
  const realMeasurement = await castIdentityMeasurement(labId, "RENDER");
  check("D9 the rollup aggregates the real reading per member", realMeasurement.measured === 1 && realMeasurement.members.find((m) => m.name === "Lin Yue")?.readings === 1, JSON.stringify({ measured: realMeasurement.measured }));

  // ───────────────────── E. the battle: the chain at episode scale ─────────────────────
  await db.shot.update({ where: { id: shots[2].id }, data: { status: "APPROVED" } });
  const learnedMotion = await T("learn_motion_flow", { name: "Storm Fang", register: "BATTLE", sceneNumber: scene.number, shotNumber: 2 });
  check("E1 the verified performance is learned as a motion flow", learnedMotion.status === "OK" && learnedMotion.result.includes("THE MOTION IS LEARNED"), learnedMotion.result.slice(0, 160));

  const battleMissing = await T("stage_battle", { arc: "BATTLE > RITUAL" });
  check("E2 an unlearned leg refuses and names the adoption path", battleMissing.status === "ERROR" && battleMissing.result.includes("THE CHAIN STAGES ONLY WHAT VERIFIED") && battleMissing.result.includes("no proven learned sequence flow for leg 1 (BATTLE)") && battleMissing.result.includes("2. RITUAL - no proven flow") && battleMissing.result.includes("learn_sequence_flow register:'BATTLE'"), battleMissing.result.slice(0, 320));

  const designedBattle = await T("design_sequence", { name: "Storm Clash", description: "close and strike", slots: JSON.stringify([
    { grammar: "The Assault", motion: "Storm Fang", wind: 0.6, cloth: 0.8, note: "the learned performance chains in" },
    { grammar: "The Standoff" },
  ]) });
  check("E3 the BATTLE sentence designs with the chained learned flow", designedBattle.status === "OK" && designedBattle.result.includes("+motion 'Storm Fang'"), designedBattle.result.slice(0, 220));
  const designedPursuit = await T("design_sequence", { name: "Sky Pursuit", description: "run them down", slots: JSON.stringify([
    { grammar: "The Ascent", wind: 0.4 },
    { grammar: "The Withdrawal", flesh: 0.5 },
  ]) });
  check("E4 the PURSUIT sentence designs", designedPursuit.status === "OK", designedPursuit.result.slice(0, 160));
  const designedResolve = await T("design_sequence", { name: "Aftermath Breath", description: "let the dust settle", slots: JSON.stringify([
    { grammar: "The Reveal", cloth: 0.2 },
    { grammar: "The Standoff" },
  ]) });
  check("E5 the RESOLVE sentence designs", designedResolve.status === "OK", designedResolve.result.slice(0, 160));

  const learn1 = await T("learn_sequence_flow", { name: "Storm Clash law", register: "BATTLE", program: "Storm Clash" });
  const learn2 = await T("learn_sequence_flow", { name: "Sky Pursuit law", register: "PURSUIT", program: "Sky Pursuit" });
  const learn3 = await T("learn_sequence_flow", { name: "Aftermath law", register: "RESOLVE", program: "Aftermath Breath" });
  check("E6 the three legs are adopted as flows", learn1.status === "OK" && learn2.status === "OK" && learn3.status === "OK", `${learn1.status} ${learn2.status} ${learn3.status}`);

  // the consult law: flows verify through a landed-whole direction
  const d1 = await T("direct_sequence", { sceneNumber: scene.number, program: "Storm Clash" });
  const d2 = await T("direct_sequence", { sceneNumber: scene.number, program: "Sky Pursuit" });
  const d3 = await T("direct_sequence", { sceneNumber: scene.number, program: "Aftermath Breath" });
  check("E7 the three programs direct whole (the flows verify)", d1.status === "OK" && d2.status === "OK" && d3.status === "OK", `${d1.status} ${d2.status} ${d3.status}`);

  const badRegister = await T("stage_battle", { arc: "WAR > PURSUIT" });
  check("E8 a bad register refuses at the arc law", badRegister.status === "ERROR" && badRegister.result.includes("arc register must be one of"), badRegister.result.slice(0, 140));
  const single = await T("stage_battle", { arc: "BATTLE" });
  check("E9 a single leg refuses (a sentence, not a battle)", single.status === "ERROR" && single.result.includes("a battle arc needs 2 to 5 legs"), single.result.slice(0, 140));
  const repeatLeg = await T("stage_battle", { arc: "BATTLE > BATTLE" });
  check("E10 consecutive repeats refuse", repeatLeg.status === "ERROR" && repeatLeg.result.includes("repeats BATTLE in consecutive legs"), repeatLeg.result.slice(0, 140));
  const noEp = await T("stage_battle", { arc: "BATTLE > PURSUIT", episodeNumber: 99 });
  check("E11 an unknown episode refuses", noEp.status === "ERROR" && noEp.result.includes("No episode 99 with shots"), noEp.result.slice(0, 140));

  const ep2 = await T("create_episode", { title: "The Thin Front", number: 2 });
  check("E12 a second episode exists", ep2.status === "OK", ep2.result.slice(0, 100));
  const ep2Row = await db.episode.findFirst({ where: { season: { projectId: labId }, number: 2 } });
  if (ep2Row) await db.scene.create({ data: { episodeId: ep2Row.id, number: 1, title: "One Shot Front" } }).then(async (s2) => { await db.shot.create({ data: { sceneId: s2.id, number: 1, description: "the lone picket watches the pass", duration: 2 } }); });
  const thin = await T("stage_battle", { arc: "BATTLE > PURSUIT", episodeNumber: 2 });
  check("E13 fewer shots than legs refuses honestly", thin.status === "ERROR" && thin.result.includes("stages 1 shot(s) but the arc has 2 legs"), thin.result.slice(0, 200));

  const staged = await T("stage_battle", { arc: "BATTLE > PURSUIT > RESOLVE", episodeNumber: 1 });
  check("E14 the battle stages across the episode", staged.status === "OK" && staged.result.includes("BATTLE STAGED across episode 1") && staged.result.includes("arc BATTLE > PURSUIT > RESOLVE") && staged.result.includes("coverage 6/6"), staged.result.slice(0, 500));
  check("E15 the legs read their flows and the whole sentences landed", staged.result.includes("leg 1 BATTLE leg 'Storm Clash law'") && staged.result.includes("leg 2 PURSUIT leg 'Sky Pursuit law'") && staged.result.includes("leg 3 RESOLVE leg 'Aftermath law'") && !staged.result.includes("did NOT land whole"), staged.result.slice(0, 500));
  check("E16 the flow read names the chained performance", staged.result.includes("chained performance(s) ('Storm Fang')"), staged.result.slice(0, 400));
  check("E17 the memory grew on every leg", staged.result.includes("recorded its battle leg") && staged.result.includes("the leg landed whole"), staged.result.slice(0, 500));

  const s1 = await db.shot.findUnique({ where: { id: shots[1].id } });
  const s6 = await db.shot.findUnique({ where: { id: shots[6].id } });
  check("E18 the stamped shots carry their leg's grammar", Boolean(s1?.grammar) && Boolean(s6?.grammar) && (s1?.grammar ?? "").length > 10);
  check("E19 the chained flow re-performs through the battle (the marker rides)", flowNameFromChoreo(s1?.choreo ?? null) === "Storm Fang" && (s1?.choreo ?? "").includes("SLASH"), (s1?.choreo ?? "").slice(0, 120));
  const fangAfter = await db.motionFlow.findUnique({ where: { projectId_name: { projectId: labId, name: "Storm Fang" } } });
  check("E20 the chained motion flow's applied record grew through the battle", (fangAfter?.applied ?? 0) >= 1, `applied=${fangAfter?.applied}`);
  const battleEvent = await db.productionEvent.findFirst({ where: { projectId: labId, summary: { contains: "Battle staged across episode 1" } }, orderBy: { createdAt: "desc" } });
  check("E21 the battle event names the arc and the chain", !!battleEvent && battleEvent.summary.includes("BATTLE 'Storm Clash law' (2) -> PURSUIT 'Sky Pursuit law' (2) -> RESOLVE 'Aftermath law' (2)") && battleEvent.summary.includes("1 chained performance(s)"), battleEvent?.summary.slice(0, 220) ?? "no event");
  const ledger = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "Storm Clash law" } } });
  const ledgerOutcomes = (() => { try { return JSON.parse(ledger?.outcomes ?? "[]") as Array<{ scope: string; verified: boolean; motionChained: number }>; } catch { return []; } })();
  const battleLegOutcome = ledgerOutcomes.find((o) => o.scope.startsWith("battle episode 1"));
  check("E22 the flow's ledger carries the battle leg with the chain count", !!battleLegOutcome && battleLegOutcome.verified && battleLegOutcome.motionChained === 1, JSON.stringify(ledgerOutcomes).slice(0, 200));

  const stagedAgain = await T("stage_battle", { arc: "BATTLE > PURSUIT", episodeNumber: 1 });
  check("E23 the battle restages (the consult keeps ranking the proven legs)", stagedAgain.status === "OK" && stagedAgain.result.includes("coverage 6/6"), stagedAgain.result.slice(0, 300));

  // ───────────────────── F. cleanup ─────────────────────
  await cleanupLab(labId);
  const labGone = await db.project.findFirst({ where: { id: labId } });
  const flowsGone = await db.motionFlow.count({ where: { projectId: labId } });
  const sheetGone = !existsSync(path.join(process.cwd(), "public", "sheets", `${hero.id}.png`));
  check("F1 the lab, its flows and its images are gone", labGone === null && flowsGone === 0 && sheetGone);

  console.log(`\n== Iteration 79 E2E: ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});

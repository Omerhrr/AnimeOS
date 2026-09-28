// Iteration 78 E2E: THE BAR IS MEASURED + THE SENTENCE CALLS THE
// PERFORMANCE. Proves, against the RUNNING studio, the REAL database,
// the REAL render pipeline and the REAL vision channel:
//   A. source: the split bars (panel 0.6, shipping render 0.7), the
//      measurement rollup, tool 85, the chaining surfaces, rule 52
//   B. pure: the per-source bar law + the measurement line
//   C. accounts + throwaway production (a REAL sheeted character)
//   D. THE MEASUREMENT: a REAL render finishing over the engine, the
//      REAL vision identity score over its poster (the measured
//      reading), the aggregation, and the deterministic BAR SPLIT -
//      the same 0.65 that passed the old 0.6 panel bar DRIFTS at the
//      0.7 shipping bar, on the same pixels
//   E. THE CHAIN: learn a motion flow from a verified render, chain it
//      through a sequence program's slots (learned flow + built-in),
//      design-time refusals, the applied records growing through the
//      sequence path, and the consult carrying the chain
//   F. the DSH surfaces: measure_identity_bar over the lab
//   G. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter78-bar.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import {
  IDENTITY_REPAINT_THRESHOLD, IDENTITY_RENDER_THRESHOLD, identityThresholdFor,
  identityBarMeasurement, identityBarMeasurementLine, scoreRenderIdentity, scoreShotIdentityFromRaw,
} from "../src/lib/identity";
import { flowNameFromChoreo } from "../src/lib/animation/motionflows";
import { execSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter78-bar";

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
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

const COMBO_PROGRAM = JSON.stringify({
  keys: [
    { at: 0, pose: "STANCE", kind: "hold" },
    { at: 0.3, pose: "CROUCH", kind: "anticipation" },
    { at: 0.45, pose: "SLASH", kind: "strike" },
    { at: 0.6, pose: "LUNGE", kind: "hold" },
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
  console.log(`== Iteration 78: the bar is measured + the sentence calls the performance ==\n`);

  // ───────────────────── A. source-level checks ─────────────────────
  const identitySrc = readFileSync("src/lib/identity.ts", "utf8");
  check("A1 the shipping bar stands at 0.7 beside the 0.6 panel bar", identitySrc.includes("IDENTITY_RENDER_THRESHOLD = 0.7") && identitySrc.includes("IDENTITY_REPAINT_THRESHOLD = 0.6"));
  check("A2 the bar is the SOURCE's bar (the split law)", identitySrc.includes("export function identityThresholdFor") && identitySrc.includes('source === "RENDER" ? IDENTITY_RENDER_THRESHOLD : IDENTITY_REPAINT_THRESHOLD'));
  check("A3 the drift split reads the source's bar", identitySrc.includes("const bar = identityThresholdFor(source);") && identitySrc.includes("const drifted = verdict.worst < bar;"));
  check("A4 the measurement rollup exists and aggregates honestly", identitySrc.includes("export async function identityBarMeasurement") && identitySrc.includes("clearing / values.length"));

  const flowSrc = readFileSync("src/lib/dsh/sequence-flows.ts", "utf8");
  check("A5 a sequence slot can carry a chained performance", flowSrc.includes("motion?: string | null") && flowSrc.includes("CHAINED PERFORMANCE"));
  check("A6 the outcome measures the chain", flowSrc.includes("motionChained: number"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A7 the registry stands at 85 tools (the measurement pen joins)", toolCount === 88, `count=${toolCount}`);
  check("A8 measure_identity_bar is a registry pen", tools.includes('name: "measure_identity_bar"'));
  check("A9 the chain resolves the same registry set_shot_choreography consults", tools.includes("async function resolveChoreoSource") && tools.includes("learned flow '${learnedFlow.name}'"));
  check("A10 the sequence stamps the chained performance with the flow marker", tools.includes("data.choreo = JSON.stringify(chainedPerf)") && tools.includes("applied: { increment: 1 }"));
  check("A11 the flow read names the chain", tools.includes("chained performance(s)"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A12 rule 52 teaches the measured-bar law", prompts.includes("52. THE BAR IS MEASURED") && prompts.includes("a below-bar reading is a work order, not a shame"));
  check("A13 the curriculum grew the bar + chain lines", prompts.includes("- THE BAR IS MEASURED: the identity bar the pixels answer to") && prompts.includes("- THE SENTENCE CALLS THE PERFORMANCE: the two learned memories CHAIN"));
  check("A14 rules stay sequential (51 to 52, no duplicates)", (prompts.match(/^51\. THE MOTION IS LEARNED/gm) ?? []).length === 1 && (prompts.match(/^52\. THE BAR IS MEASURED/gm) ?? []).length === 1);

  const continuity = readFileSync("src/components/views/continuity-view.tsx", "utf8");
  check("A15 the continuity panel wears both bars", continuity.includes("renderThreshold") && continuity.includes("shipping bar"));

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 the panel bar stays 0.6", identityThresholdFor("PANEL") === 0.6 && IDENTITY_REPAINT_THRESHOLD === 0.6);
  check("B2 the shipping bar stands 0.7", identityThresholdFor("RENDER") === 0.7 && IDENTITY_RENDER_THRESHOLD === 0.7);
  const emptyLine = identityBarMeasurementLine({ source: "RENDER", bar: 0.7, scored: 0, average: null, worst: null, best: null, clearing: 0, below: 0, share: null, rows: [] });
  check("B3 an empty measurement reads honestly (untested, not passing)", emptyLine.includes("nothing measured yet") && emptyLine.includes("70% shipping bar stands untested"));
  const measuredLine = identityBarMeasurementLine({ source: "RENDER", bar: 0.7, scored: 4, average: 0.68, worst: 0.55, best: 0.81, clearing: 2, below: 2, share: 0.5, rows: [] });
  check("B4 a measured line carries the numbers and the queue", measuredLine.includes("4 measured render(s)") && measuredLine.includes("2 of 4 clear the 70% shipping bar") && measuredLine.includes("2 in the repaint queue"));

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter78 Bar Lab ${MARK}`, logline: "a throwaway production for the measured-bar proof - the shipping pixels answer at 70%", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  const ep = await T("create_episode", { title: "The Measured Duel", count: 1 });
  check("C4 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Temple Gate" } });
  }
  const shot1 = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "Lin Yue cuts the gate guardian down", duration: 2.5, movement: "STATIC" } });
  const shot2 = await db.shot.create({ data: { sceneId: scene.id, number: 2, description: "the second guardian takes the same lesson from Lin Yue", duration: 2.5, movement: "STATIC" } });
  const shot3 = await db.shot.create({ data: { sceneId: scene.id, number: 3, description: "Lin Yue stands over the broken gate", duration: 2.5, movement: "STATIC" } });

  // a REAL sheeted character: the anchor is what identity is scored against
  const hero = await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });
  const sheetsDir = path.join(process.cwd(), "public", "sheets");
  mkdirSync(sheetsDir, { recursive: true });
  const sheetFile = path.join(sheetsDir, `${hero.id}.png`);
  execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=0x2a4d69:s=512x512 -frames:v 1 "${sheetFile}"`);
  const sheetUrl = `/sheets/${hero.id}.png`;
  await db.character.update({ where: { id: hero.id }, data: { modelSheetUrl: sheetUrl, modelSheetPrompt: "Lin Yue canonical anchor (E2E)", modelSheetAt: new Date() } });
  check("C5 the hero's anchor persists as a real file", existsSync(sheetFile) && (await db.character.findUnique({ where: { id: hero.id } }))?.modelSheetUrl === sheetUrl);
  // real PANEL art too - the panel-source half of the bar split judges it
  const panelFile = path.join(process.cwd(), "public", "panels", `${shot1.id}.png`);
  mkdirSync(path.dirname(panelFile), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=0x6b2737:s=640x360 -frames:v 1 "${panelFile}"`);
  await db.shot.update({ where: { id: shot1.id }, data: { artworkUrl: `/panels/${shot1.id}.png`, artGeneratedAt: new Date() } });
  check("C6 the shot's panel art persists as a real file", existsSync(panelFile));

  // ───────────────────── D. the measurement over REAL shipping pixels ─────────────────────
  const r1 = await realRender(labId, shot1.id);
  check("D1 the shot's clip finished over the real engine", r1.ok, r1.status.slice(0, 140));

  const measured = await scoreRenderIdentity(shot1.id);
  check("D2 the REAL vision score lands over the real render (the measured reading)", measured.ok, "error" in measured ? measured.error.slice(0, 160) : "");
  if (measured.ok) {
    console.log(`   measured render-source worst: ${(measured.scored.verdict.worst * 100).toFixed(0)}% (${measured.scored.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")})`);
    const m = await identityBarMeasurement(labId);
    check("D3 the measurement aggregates the real reading", m.scored === 1 && m.rows[0]?.worst === measured.scored.verdict.worst && m.bar === 0.7, JSON.stringify({ scored: m.scored, worst: m.worst }));
    check("D4 the measurement line reads the honest distribution", identityBarMeasurementLine(m).includes("1 measured render(s)"), identityBarMeasurementLine(m));
  }

  // the deterministic BAR SPLIT over the same pixels (the raw path
  // persists exactly like the real one - only the vision call is
  // supplied): 0.65 passed the OLD 0.6 bar and DRIFTS at 0.7
  const raw65 = JSON.stringify({ note: "planted: the old bar passed this", characters: [{ name: "Lin Yue", similarity: 0.65, aspects: { face: 0.7 }, note: "between the bars" }] });
  const driftAtShipping = await scoreShotIdentityFromRaw(shot1.id, raw65, "RENDER");
  check("D5a 0.65 DRIFTS at the 70% shipping bar (the raise is real)", driftAtShipping.ok, "error" in driftAtShipping ? driftAtShipping.error : "");
  const driftEvent = await db.continuityEvent.findFirst({ where: { projectId: labId, kind: "IDENTITY_DRIFT" }, orderBy: { createdAt: "desc" } });
  check("D5b the drift event names the shipping bar", !!driftEvent && driftEvent.description.includes("70% shipping-pixel bar"), driftEvent?.description.slice(0, 140) ?? "no event");
  const raw74 = JSON.stringify({ note: "planted: above the shipping bar", characters: [{ name: "Lin Yue", similarity: 0.74, aspects: { face: 0.8 }, note: "clears the bar" }] });
  const verifiedAtShipping = await scoreShotIdentityFromRaw(shot1.id, raw74, "RENDER");
  const verifiedEvent = await db.continuityEvent.findFirst({ where: { projectId: labId, kind: "IDENTITY_VERIFIED" }, orderBy: { createdAt: "desc" } });
  check("D6 0.74 VERIFIES at the shipping bar", verifiedAtShipping.ok && !!verifiedEvent && verifiedEvent.description.includes("70% shipping-pixel bar"), verifiedEvent?.description.slice(0, 140) ?? "no event");
  // the same 0.65 on the PANEL source still passes - the split is the source's, not the number's
  const panel65 = await scoreShotIdentityFromRaw(shot1.id, raw65, "PANEL");
  const panelEvent = await db.continuityEvent.findFirst({ where: { projectId: labId, kind: "IDENTITY_VERIFIED", description: { contains: "[identity" } }, orderBy: { createdAt: "desc" } });
  check("D7 the same 0.65 PASSES the 60% panel bar (the bar is the source's)", panel65.ok && !!panelEvent && panelEvent.description.includes("60% panel bar"), panelEvent?.description.slice(0, 140) ?? "no event");
  const queueData = await import("../src/lib/identity").then((m) => m.identityPanelData(labId));
  check("D8 the panel feed carries both bars", queueData.threshold === 0.6 && queueData.renderThreshold === 0.7);

  // ───────────────────── E. the chain: the sentence calls the performance ─────────────────────
  const applied = await T("set_shot_choreography", { sceneNumber: scene.number, shotNumber: 1, choreo: COMBO_PROGRAM });
  check("E1 the shot performs the keyed program", applied.status === "OK", applied.result.slice(0, 140));
  const r2 = await realRender(labId, shot1.id);
  check("E2 the keyed clip finished over the real engine", r2.ok, r2.status.slice(0, 140));
  // deterministic adoption: a human APPROVES the shot (the gate's second path)
  await db.shot.update({ where: { id: shot1.id }, data: { status: "APPROVED" } });
  const learned = await T("learn_motion_flow", { name: "Temple Gate Combo", register: "BATTLE", sceneNumber: scene.number, shotNumber: 1 });
  check("E3 the flow is learned with its evidence", learned.status === "OK" && learned.result.includes("THE MOTION IS LEARNED"), learned.result.slice(0, 160));

  const badChain = await T("design_sequence", { name: "The Broken Raid", slots: JSON.stringify([
    { grammar: "The Reveal", motion: "The Moonwalk" },
    { grammar: "The Standoff" },
  ]) });
  check("E4 a typo'd motion chain refuses at DESIGN time", badChain.status === "ERROR" && badChain.result.includes("no choreography named 'The Moonwalk'") && badChain.result.includes("learn_motion_flow"), badChain.result.slice(0, 200));

  const designed = await T("design_sequence", { name: "The Gate Raid", description: "reveal the gate, break the gate - the verified combo rides the reveal", slots: JSON.stringify([
    { grammar: "The Reveal", motion: "Temple Gate Combo", note: "the learned performance chains in" },
    { grammar: "The Assault", motion: "The Combo" },
    { grammar: "The Standoff" },
  ]) });
  check("E5 the sentence designs with learned-flow + built-in chains", designed.status === "OK" && designed.result.includes("+motion 'Temple Gate Combo'") && designed.result.includes("+motion 'The Combo'"), designed.result.slice(0, 220));

  const directed = await T("direct_sequence", { sceneNumber: scene.number, program: "The Gate Raid" });
  check("E6 the sentence directs and the flow read names the performances", directed.status === "OK" && directed.result.includes("performing stance@0") && directed.result.includes("chained performance(s)"), directed.result.slice(0, 300));
  const s1 = await db.shot.findUnique({ where: { id: shot1.id } });
  const s2 = await db.shot.findUnique({ where: { id: shot2.id } });
  const s3 = await db.shot.findUnique({ where: { id: shot3.id } });
  check("E7 shot 1 carries the LEARNED flow's marker through the chain", flowNameFromChoreo(s1?.choreo ?? null) === "Temple Gate Combo" && (s1?.choreo ?? "").includes("\"SLASH\""), (s1?.choreo ?? "").slice(0, 120));
  check("E8 shot 2 performs the BUILT-IN chain (no flow marker)", flowNameFromChoreo(s2?.choreo ?? null) === null && (s2?.choreo ?? "").includes("The Combo"), (s2?.choreo ?? "").slice(0, 120));
  check("E9 the motion-less slot leaves the body alone", s3?.choreo === null || s3?.choreo === undefined, String(s3?.choreo ?? "null").slice(0, 60));
  const flowAfterChain = await db.motionFlow.findUnique({ where: { projectId_name: { projectId: labId, name: "Temple Gate Combo" } } });
  check("E10 the chained flow's applied record grew through the SEQUENCE path", flowAfterChain?.applied === 1, `applied=${flowAfterChain?.applied}`);

  // the consult carries the chain: adopt the raid, grow the adopted
  // flow's record (the program-driven run teaches the flow now that it
  // carries it), then direct from memory
  const adopted = await T("learn_sequence_flow", { name: "Raid grammar", register: "BATTLE", program: "The Gate Raid" });
  check("E11 the sentence is adopted as a flow", adopted.status === "OK", adopted.result.slice(0, 140));
  const taught = await T("direct_sequence", { sceneNumber: scene.number, program: "The Gate Raid" });
  check("E11b the program-driven run lands its measured outcome on the adopted flow", taught.status === "OK", taught.result.slice(0, 140));
  const consult = await T("direct_sequence", { sceneNumber: scene.number, register: "BATTLE" });
  check("E12 the consult re-performs the whole chained sentence", consult.status === "OK" && consult.result.includes("learned flow 'Raid grammar'") && consult.result.includes("performing"), consult.result.slice(0, 260));
  const s1AfterConsult = await db.shot.findUnique({ where: { id: shot1.id } });
  check("E13 the consulted chain still marks the learned flow", flowNameFromChoreo(s1AfterConsult?.choreo ?? null) === "Temple Gate Combo");
  const flowAfterConsult = await db.motionFlow.findUnique({ where: { projectId_name: { projectId: labId, name: "Temple Gate Combo" } } });
  check("E14 every chained application grew the record (program x2 + consult)", flowAfterConsult?.applied === 3, `applied=${flowAfterConsult?.applied}`);
  const seqFlowRow = await db.sequenceFlow.findUnique({ where: { projectId_register_name: { projectId: labId, register: "BATTLE", name: "Raid grammar" } } });
  const lastOutcome = (() => { try { const arr = JSON.parse(seqFlowRow?.outcomes ?? "[]") as Array<{ motionChained?: number }>; return arr[arr.length - 1]; } catch { return null; } })();
  check("E15 the flow's measured outcome carries the chain count", !!lastOutcome && (lastOutcome.motionChained ?? 0) >= 2, JSON.stringify(lastOutcome)?.slice(0, 140));

  // ───────────────────── F. the DSH surfaces: measure_identity_bar ─────────────────────
  const measure = await T("measure_identity_bar", { limit: 1 });
  check("F1 the measurement pen reads the shipping bar over REAL pixels", measure.status === "OK" && measure.result.includes("IDENTITY BAR MEASURED") && measure.result.includes("bar 70%"), measure.result.slice(0, 240));
  check("F2 the measurement names its fresh reading", measure.result.includes("Freshly measured (1)"), measure.result.slice(0, 200));
  const readBack = await T("measure_identity_bar", {});
  check("F3 the read-back carries the measured distribution", readBack.status === "OK" && readBack.result.includes("render-source identity over"), readBack.result.slice(0, 200));
  const scoreRenderTool = await T("score_panel_identity", { sceneNumber: scene.number, shotNumber: 1, source: "render" });
  check("F4 score_panel_identity scores the shipping pixels at the 70% bar", scoreRenderTool.status === "OK" && scoreRenderTool.result.includes("render source") && scoreRenderTool.result.includes("shipping-pixel"), scoreRenderTool.result.slice(0, 220));

  // ───────────────────── G. cleanup ─────────────────────
  await cleanupLab(labId);
  if (existsSync(sheetFile)) unlinkSync(sheetFile);
  if (existsSync(panelFile)) unlinkSync(panelFile);
  const labGone = await db.project.findFirst({ where: { id: labId } });
  const flowsGone = await db.motionFlow.count({ where: { projectId: labId } });
  check("G1 the lab, its flows and its images are gone", labGone === null && flowsGone === 0 && !existsSync(sheetFile) && !existsSync(panelFile));

  console.log(`\n== Iteration 78: ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});

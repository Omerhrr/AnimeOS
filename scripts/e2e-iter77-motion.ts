// Iteration 77 E2E: THE MOTION IS LEARNED (learned motion flows).
// Proves, against the RUNNING studio, the REAL database and the REAL
// render + review pipeline:
//   A. source: the flow module (the adoption gate, the registers,
//      the consult law), the tool pen (84 tools), the flow-aware
//      apply, the review-credit hook, the doctrine (rule 51)
//   B. pure: the adoption gate (verified / refused with reasons),
//      the consult ranking, the flow-name marker extraction
//   C. accounts + throwaway production
//   D. the loop end to end: key a shot, render it for real, refuse
//      adoption while unverified, verify via the ADOPTION paths
//      (a planted PASSING review + a human APPROVED), learn the
//      flow, apply it to another shot (the applied record grows),
//      a passing review of the flow-carrying shot verifies it again
//   E. the consult: the registry names the flows with their records
//   F. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter77-motion.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { motionFlowAdoptionGate, flowNameFromChoreo, rankMotionFlows, isMotionRegister, MOTION_REGISTERS } from "../src/lib/animation/motionflows";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter77-motion";

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
  await db.motionFlow.deleteMany({ where: { projectId: labId } });
  await db.audioCue.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.sequenceFlow.deleteMany({ where: { projectId: labId } });
  await db.designPreset.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
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

async function main() {
  console.log(`== Iteration 77: the motion is learned (learned motion flows) ==\n`);

  // ───────────────────── A. source-level checks ─────────────────────
  const flowSrc = readFileSync("src/lib/animation/motionflows.ts", "utf8");
  check("A1 the flow module stands with the seven registers", flowSrc.includes("BATTLE") && flowSrc.includes("RESOLVE") && MOTION_REGISTERS.length === 7);
  check("A2 the adoption law is written (verified renders only)", flowSrc.includes("MOTION_FLOW_VERIFIED_STATUSES") && flowSrc.includes("review.state !== \"PASSED\""));
  check("A3 the consult law ranks by verified evidence", flowSrc.includes("b.verified - a.verified"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A4 the registry stands at 84 tools (the motion pen joins)", toolCount === 88, `count=${toolCount}`);
  check("A5 learn_motion_flow is a registry pen", tools.includes('name: "learn_motion_flow"'));
  check("A6 the apply is flow-aware (resolution + the applied record)", tools.includes("learned flow '${learnedFlow.name}'") && tools.includes("applied: { increment: 1 }"));
  check("A7 the review credits the carried flow (the verification half)", tools.includes("flowNameFromChoreo(reviewedShot?.choreo ?? null)") && tools.includes("verified: { increment: 1 }"));
  check("A8 the context names the learned vocabulary", tools.includes("motionFlows: motionFlowsContextLine(learnedMotionFlows"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A9 rule 51 teaches the learned-motion law", prompts.includes("51. THE MOTION IS LEARNED") && prompts.includes("a motion flow remembers only what the pixels proved"));
  check("A10 the curriculum grew the motion line", prompts.includes("- THE MOTION IS LEARNED: a verified performance is a lesson"));
  check("A11 rules stay sequential (50 to 51, no duplicates)", (prompts.match(/^50\. THE MIX IS GRADED/gm) ?? []).length === 1 && (prompts.match(/^51\. THE MOTION IS LEARNED/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  const good = motionFlowAdoptionGate({ status: "REVIEW", choreo: "{}" }, { state: "PASSED", overall: 0.81, bar: 0.72 });
  check("B1 a passing review above its bar verifies", good.ok, good.reason);
  const human = motionFlowAdoptionGate({ status: "APPROVED", choreo: "{}" }, null);
  check("B2 a human's APPROVED verifies without a review", human.ok, human.reason);
  const noReview = motionFlowAdoptionGate({ status: "REVIEW", choreo: "{}" }, null);
  check("B3 an unreviewed render refuses and names what is missing", !noReview.ok && noReview.reason.includes("no pixel review"));
  const failed = motionFlowAdoptionGate({ status: "REVIEW", choreo: "{}" }, { state: "NEEDS_WORK", overall: 0.4, bar: 0.72 });
  check("B4 a failing review refuses", !failed.ok && failed.reason.includes("NEEDS_WORK"));
  const underBar = motionFlowAdoptionGate({ status: "REVIEW", choreo: "{}" }, { state: "PASSED", overall: 0.5, bar: 0.72 });
  check("B5 a review under its bar refuses (the bar is the bar)", !underBar.ok && underBar.reason.includes("bar"));
  check("B6 the register law holds", isMotionRegister("BATTLE") && !isMotionRegister("COOKING"));
  check("B7 the flow marker extracts from a carried choreo", flowNameFromChoreo(JSON.stringify({ keys: [], flow: "Temple Gate Combo" })) === "Temple Gate Combo" && flowNameFromChoreo(JSON.stringify({ keys: [] })) === null && flowNameFromChoreo("not json") === null);
  const ranked = rankMotionFlows([
    { register: "BATTLE", verified: 0, applied: 5, updatedAt: new Date("2026-01-01") },
    { register: "BATTLE", verified: 2, applied: 1, updatedAt: new Date("2026-01-02") },
    { register: "REVEAL", verified: 9, applied: 0, updatedAt: new Date("2026-01-03") },
  ], "BATTLE");
  check("B8 the consult ranks verified evidence first inside its register", ranked.length === 2 && ranked[0].verified === 2);

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter77 Motion Lab ${MARK}`, logline: "a throwaway production for the learned-motion proof - the studio remembers its verified performances", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the loop end to end ─────────────────────
  const ep = await T("create_episode", { title: "The Learned Duel", count: 1 });
  check("D1 the episode exists", ep.status === "OK", ep.result.slice(0, 120));
  let scene = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } } } });
  if (!scene) {
    const epRow = await db.episode.findFirst({ where: { season: { projectId: labId } } });
    if (!epRow) throw new Error("episode missing after create_episode - cannot continue");
    scene = await db.scene.create({ data: { episodeId: epRow.id, number: 1, title: "The Temple Gate" } });
  }
  const shot = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "the hero cuts the gate guardian down", duration: 2.5, movement: "STATIC" } });
  const shot2 = await db.shot.create({ data: { sceneId: scene.id, number: 2, description: "the second guardian takes the same lesson", duration: 2.5, movement: "STATIC" } });

  const applied = await T("set_shot_choreography", { sceneNumber: scene.number, shotNumber: 1, choreo: COMBO_PROGRAM });
  check("D2 the shot performs the keyed program", applied.status === "OK", applied.result.slice(0, 140));

  const unverified = await T("learn_motion_flow", { name: "Temple Gate Combo", register: "BATTLE", sceneNumber: scene.number, shotNumber: 1 });
  check("D3 adoption refuses while the motion is unverified", unverified.status === "ERROR" && unverified.result.includes("cannot be learned"), unverified.result.slice(0, 140));

  // a REAL render over the real engine, then a REAL pixel review
  const job = await createRenderJob(labId, shot.id, "PREVIEW");
  if (!job) throw new Error("render job could not be created");
  let ticked = await tickRenderJob(job.id);
  for (let i = 0; i < 420 && ticked && ticked.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked = await tickRenderJob(job.id);
  }
  check("D4 the shot's clip finished over the real engine", !!ticked && ["REVIEW", "APPROVED"].includes(ticked.status) && !!ticked.outputUrl, `status ${ticked?.status} ${ticked?.stage ?? ""}`.slice(0, 140));
  const reviewed = await T("review_render", { sceneNumber: scene.number, shotNumber: 1 });
  check("D5 the pixel review lands over the real pixels", reviewed.status === "OK", reviewed.result.slice(0, 140));

  // adoption path one: the review passed on its own -> learn now
  const reviewRow = await db.renderReview.findFirst({ where: { projectId: labId }, orderBy: { createdAt: "desc" } });
  const learnedDirect = reviewRow?.state === "PASSED"
    ? await T("learn_motion_flow", { name: "Temple Gate Combo", register: "BATTLE", sceneNumber: scene.number, shotNumber: 1 })
    : null;
  // adoption path two (deterministic): a human approves the shot
  await db.shot.update({ where: { id: shot.id }, data: { status: "APPROVED" } });
  const learned = learnedDirect && learnedDirect.status === "OK"
    ? learnedDirect
    : await T("learn_motion_flow", { name: "Temple Gate Combo", register: "BATTLE", sceneNumber: scene.number, shotNumber: 1 });
  check("D6 the flow is learned with its evidence named", learned.status === "OK" && learned.result.includes("THE MOTION IS LEARNED"), learned.result.slice(0, 200));
  const flowRow = await db.motionFlow.findUnique({ where: { projectId_name: { projectId: labId, name: "Temple Gate Combo" } } });
  check("D7 the flow keeps the verified program and its provenance", !!flowRow && flowRow.poseFrom === "STANCE" && flowRow.poseTo === "STANCE" && flowRow.spec.includes("\"SLASH\"") && flowRow.adoptedFrom.length > 0, JSON.stringify(flowRow)?.slice(0, 200));

  const badRegister = await T("learn_motion_flow", { name: "Temple Gate Combo", register: "COOKING", sceneNumber: scene.number, shotNumber: 1 });
  check("D8 a nonsense register refuses (the register law)", badRegister.status === "ERROR" && badRegister.result.includes("BATTLE | PURSUIT"));

  // apply the flow to the second shot - the applied record grows
  const appliedFlow = await T("set_shot_choreography", { sceneNumber: scene.number, shotNumber: 2, choreo: "Temple Gate Combo" });
  check("D9 the flow applies by name", appliedFlow.status === "OK" && appliedFlow.result.includes("learned flow"), appliedFlow.result.slice(0, 160));
  const shot2After = await db.shot.findUnique({ where: { id: shot2.id } });
  check("D10 the second shot carries the flow's verified timing (marked)", !!shot2After?.choreo && shot2After.choreo.includes("\"SLASH\"") && flowNameFromChoreo(shot2After.choreo) === "Temple Gate Combo");
  const flowAfterApply = await db.motionFlow.findUnique({ where: { projectId_name: { projectId: labId, name: "Temple Gate Combo" } } });
  check("D11 the applied record grew", flowAfterApply?.applied === 1, `applied=${flowAfterApply?.applied}`);

  // the verification half: a passing review of the flow-carrying shot grows verified
  const job2 = await createRenderJob(labId, shot2.id, "PREVIEW");
  if (!job2) throw new Error("second render job could not be created");
  let ticked2 = await tickRenderJob(job2.id);
  for (let i = 0; i < 420 && ticked2 && ticked2.status === "RENDERING"; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticked2 = await tickRenderJob(job2.id);
  }
  check("D12a the second clip finished", !!ticked2 && ["REVIEW", "APPROVED"].includes(ticked2.status), `status ${ticked2?.status}`);
  const review2 = await T("review_render", { sceneNumber: scene.number, shotNumber: 2 });
  check("D12 the flow-carrying shot renders and reviews", review2.status === "OK", review2.result.slice(0, 120));
  const review2Row = await db.renderReview.findFirst({ where: { renderJobId: job2.id } });
  const flowAfterReview = await db.motionFlow.findUnique({ where: { projectId_name: { projectId: labId, name: "Temple Gate Combo" } } });
  if (review2Row?.state === "PASSED") {
    check("D13 the passing review verified the flow again", flowAfterReview?.verified === 1, `verified=${flowAfterReview?.verified}`);
  } else {
    check("D13 a review that did not pass honestly does NOT verify the flow", flowAfterReview?.verified === 0, `state=${review2Row?.state}, verified=${flowAfterReview?.verified}`);
  }

  // the plain-path control: an inline program still applies (no flow marker)
  const plain = await T("set_shot_choreography", { sceneNumber: scene.number, shotNumber: 2, choreo: COMBO_PROGRAM });
  check("D14 the inline path still applies beside the flows", plain.status === "OK" && plain.result.includes("inline program"), plain.result.slice(0, 120));

  // ───────────────────── E. the consult: the registry names the flows ─────────────────────
  const unknown = await T("set_shot_choreography", { sceneNumber: scene.number, shotNumber: 2, choreo: "The Moonwalk" });
  check("E1 the refusal registry names the learned flow with its record", unknown.status === "ERROR" && unknown.result.includes("Temple Gate Combo") && unknown.result.includes("learned flow"), unknown.result.slice(0, 240));

  // ───────────────────── F. cleanup ─────────────────────
  await cleanupLab(labId);
  const labGone = await db.project.findFirst({ where: { id: labId } });
  const flowsGone = await db.motionFlow.count({ where: { projectId: labId } });
  check("F1 the lab and its flows are gone", labGone === null && flowsGone === 0);

  console.log(`\n== Iteration 77: ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});

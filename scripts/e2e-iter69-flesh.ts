// Iteration 69 E2E: SOLVER-GRADE FLESH - the flesh lags the beat.
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the probed law in the flesh pass (goal_spring, the
//      differential probe's tuning), the bridge's flesh call read +
//      state report, the payload ride, the tool surface (81 tools,
//      the FLESH call beside the CLOTH call), the doctrine (rule 47 +
//      the law), and the manifest sheet
//   B. pure: compileSlotFlesh, formatSlotFlesh
//   C. accounts + throwaway production
//   D. the FLESH call end to end: design-time validation (arrays
//      refused, numbers clamped), design_sequence carries it beside
//      the cloth call, direct_sequence stamps shots (and clears stale
//      calls), set_shot_grammar sets and clears per shot, the learned
//      flow keeps the call, a REAL render reports the call it answered
//      (secondary.solver.fleshCall) with the trunk + face regions
//      simmed by the real soft-body solver while the control answers
//      no call
//   E. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter69-flesh.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { compileSlotFlesh, formatSlotFlesh } from "../src/lib/dsh/sequence-flows";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter69-flesh";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter69" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter69" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter69", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter69" },
    body: JSON.stringify({ email, name, password }),
  });
  if (res.status === 409) {
    const row = await db.user.findUnique({ where: { email } });
    if (!row) throw new Error(`register says 409 but ${email} is not in the db`);
    return { id: row.id, role: row.role };
  }
  if (!res.ok) throw new Error(`register failed for ${email}: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { user: { id: string; role: string } };
  return data.user;
}

function isMp4(p: string): boolean {
  try {
    const fd = readFileSync(p);
    return fd.length > 1000;
  } catch {
    return false;
  }
}

async function main() {
  console.log("== Iteration 69: the flesh lags the beat (soft bodies under the directed beats) ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const pass = readFileSync("bridges/blender/flesh_pass.py", "utf8");
  check("A1 the pass exists and names the probed law", pass.includes("SOLVER-GRADE FLESH") && pass.includes("tmp/flesh_probe.py"));
  check("A2 the probed tuning is the goal-spring law (not the edge pull)", pass.includes("GOAL_SPRING = 0.85") && pass.includes('st.goal_spring = GOAL_SPRING') && pass.includes("GOAL_FRICTION = 2.0"));
  check("A3 the call scales the answer, never the physics", pass.includes("intensity = clamp(float(intensity), 0.0, 1.0)") && pass.includes("kick = kick * intensity") && pass.includes("st.mass = MASS") && pass.includes("st.gravity = 0.0"));
  check("A4 the regions are the shared figure vocabulary", pass.includes('"Torso"') && pass.includes('"TorsoMesh"') && pass.includes('"HeadMesh"'));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A5 the bridge reads the shot's FLESH call and clamps it", bridge.includes('flesh_call = shot.get("flesh")') && bridge.includes("max(0.0, min(1.0, float(flesh_call)))"));
  check("A6 the bridge builds the flesh rig and reports the solver", bridge.includes("flesh_pass.build_flesh_rig(bpy, scn, figure, frames_total)") && bridge.includes('"blender-softbody-sim"') && bridge.includes('"fleshSimmed"'));
  check("A7 the frame drive answers one solver up from the cloth", bridge.includes("flesh_pass.apply_flesh_frame(flesh_rig, figure, t_sec, 1.0 / fps,\n                                             fbi, fwind, fagit, sec_kick, flesh_intensity)"));
  check("A8 the end report names the widest flesh drive", bridge.includes('fsol["maxFleshDrive"] = round(math.degrees(flesh_rig["max_drive"]), 1)'));

  const renderTs = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A9 the payload carries the shot's flesh call", renderTs.includes("typeof shot.flesh === \"number\" ? { flesh: shot.flesh } : {}"));

  const blenderTs = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A10 the payload type names both solver calls", blenderTs.includes("cloth?: number;") && blenderTs.includes("flesh?: number;"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A11 the registry stands at 84 tools (the call rides the grammar pen)", toolCount === 89, `count=${toolCount}`);
  check("A12 set_shot_grammar directs the flesh per shot", tools.includes("flesh: \"number 0..1 (optional) - the FLESH call") && tools.includes("compileSlotFlesh(args.flesh, \"flesh\")"));
  check("A13 the sentence carries both calls (design + direct)", tools.includes("compileSlotFlesh(s?.flesh") && tools.includes("compileSlotFlesh(slot?.flesh") && tools.includes("data.flesh = fleshParsed.flesh;   // null clears - the sentence owns the staging"));

  const manifest = readFileSync("src/app/api/sequence-manifest/route.ts", "utf8");
  check("A14 the manifest call sheet carries the flesh call", manifest.includes("flesh: true") && manifest.includes("typeof sh.flesh === \"number\" ? sh.flesh : null"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A15 rule 47 teaches the flesh law", prompts.includes("47. THE FLESH REMEMBERS THE MOTION") && prompts.includes("a statue wearing a solver"));
  check("A16 the curriculum grew the flesh line", prompts.includes("a FLESH call one number 0..1 that scales the soft-body solver's lag"));
  check("A17 rules stay sequential (46 to 47, no duplicates)", (prompts.match(/^46\. THE SOLVER ANSWERS THE CALL/gm) ?? []).length === 1 && (prompts.match(/^47\. THE FLESH REMEMBERS THE MOTION/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 compileSlotFlesh: absent and empty are null", compileSlotFlesh(undefined, "x").ok && (compileSlotFlesh(undefined, "x") as { flesh: number | null }).flesh === null && (compileSlotFlesh("", "x") as { flesh: number | null }).flesh === null);
  check("B2 compileSlotFlesh: numbers pass, strings refuse", (compileSlotFlesh(0.6, "x") as { flesh: number }).flesh === 0.6 && !compileSlotFlesh("jelly", "x").ok);
  check("B3 compileSlotFlesh: arrays are refused (per-shot, not per-beat)", !compileSlotFlesh([0.5, 0.6], "x").ok);
  check("B4 compileSlotFlesh: out of range clamps into 0..1", (compileSlotFlesh(2.5, "x") as { flesh: number }).flesh === 1 && (compileSlotFlesh(-1, "x") as { flesh: number }).flesh === 0);
  check("B5 formatSlotFlesh: the read is honest", formatSlotFlesh(0.8) === "flesh 0.8" && formatSlotFlesh(1) === "flesh 1" && formatSlotFlesh(null) === "");

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  check("C2 the owner's session reads live", (await call(ownerJar, "/api/projects")).status === 200);

  const created = await executeTool("throwaway", "create_project", { title: `Iter69 Flesh Lab ${MARK}`, logline: "a throwaway production for the FLESH call proof - soft bodies under the directed beats", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the FLESH call end to end ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Flesh" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Impact hall", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Flesh Saint Yun lands the strike - the whole body takes the impact", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "SLASH" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the still hall after - E2E Flesh Saint Yun stands untouched", shotType: "MEDIUM", movement: "STATIC" });
  await T("create_character", { name: "E2E Flesh Saint Yun", role: "PROTAGONIST", appearance: "an elder sword cultivator with a flowing beard and a topknot, storm-grey layered robes with a long wind-torn sash, obsidian blade", personality: "stoic" });

  const seq = await T("design_sequence", {
    name: "Flesh Sentence",
    slots: JSON.stringify([
      { grammar: "The Assault", wind: 0.9, cloth: 0.35, flesh: 0.75, note: "the body takes the impact at three quarters" },
      { grammar: "The Withdrawal", note: "the calm keeps the full response" },
    ]),
  });
  check("D1 the sentence registers with both solver calls in its shape", seq.status === "OK" && seq.result.includes("+cloth 0.35") && seq.result.includes("+flesh 0.75"), seq.result.slice(0, 240));

  const badArray = await T("design_sequence", { name: "Flesh Sentence Bad", slots: JSON.stringify([{ grammar: "The Assault", flesh: [0.5, 0.6] }, { grammar: "The Withdrawal" }]) });
  check("D2 a per-beat flesh array is refused (the call is per-shot)", badArray.status === "ERROR" && badArray.result.includes("per-shot answer"), badArray.result.slice(0, 160));

  const direct = await T("direct_sequence", { program: "Flesh Sentence" });
  check("D3 the sentence directs and the flow read names both calls", direct.status === "OK" && direct.result.includes("cloth 0.35") && direct.result.includes("flesh 0.75"), direct.result.slice(0, 340));
  check("D4 the flow read counts the flesh call", direct.status === "OK" && direct.result.includes("1 flesh call(s)"), direct.status === "OK" ? direct.result.slice(direct.result.indexOf("Flow read")) : "");

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const shot1 = shots.find((s) => s.number === 1);
  const shot2Row = shots.find((s) => s.number === 2);
  if (!shot1 || !shot2Row) throw new Error("shots missing - cannot continue");
  check("D5 slot 1's flesh call is stamped on its shot", shot1.flesh === 0.75 && shot1.cloth === 0.35, `flesh=${shot1.flesh} cloth=${shot1.cloth}`);
  check("D6 slot 2 carried no calls and the stale-shot law holds (null)", shot2Row.flesh === null && shot2Row.cloth === null, `flesh=${shot2Row.flesh} cloth=${shot2Row.cloth}`);

  const outcomeRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "Flesh Sentence" } } });
  const outcome = outcomeRow ? (JSON.parse(outcomeRow.outcomes || "[]") as Array<{ clothCalls?: number; fleshCalls?: number }>) : [];
  check("D7 the program's measured record counts both calls", outcome.length > 0 && outcome[0].clothCalls === 1 && outcome[0].fleshCalls === 1, JSON.stringify(outcome[0] ?? {}));

  const flow = await T("learn_sequence_flow", { name: "Flesh Flow", register: "BATTLE", program: "Flesh Sentence" });
  check("D8 the learned flow keeps the calls in its sentence", flow.status === "OK", flow.result.slice(0, 160));
  const flowRow = await db.sequenceFlow.findFirst({ where: { projectId: labId, name: "Flesh Flow" } });
  const flowSlots = flowRow ? (JSON.parse(flowRow.spec).slots as Array<{ cloth?: number; flesh?: number }>) : [];
  check("D9 the flow's slots carry both calls", (flowSlots[0]?.flesh ?? null) === 0.75 && (flowSlots[0]?.cloth ?? null) === 0.35 && flowSlots[1]?.flesh === undefined, JSON.stringify(flowSlots));

  const perShot = await T("set_shot_grammar", {
    sceneNumber: 1, shotNumber: 1,
    grammar: JSON.stringify([
      { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.95, poseStart: "STANCE", poseEnd: "LUNGE" },
      { move: "ORBIT", from: 0.5, to: 1, wind: 0.4 },
    ]),
    cloth: 0.2,
    flesh: 0.3,
  });
  check("D10 the per-shot calls set both intensities on the grammar path", perShot.status === "OK" && perShot.result.includes("cloth 0.2") && perShot.result.includes("flesh 0.3"), perShot.result.slice(0, 260));
  const shot1After = await db.shot.findUnique({ where: { id: shot1.id } });
  check("D11 the shot row carries both directed intensities", shot1After?.flesh === 0.3 && shot1After?.cloth === 0.2, `flesh=${shot1After?.flesh} cloth=${shot1After?.cloth}`);

  const badDirect = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "The Assault", flesh: "storm" });
  check("D12 a non-numeric call never reaches a shoot", badDirect.status === "ERROR" && badDirect.result.includes("flesh must be a number"), badDirect.result.slice(0, 140));

  console.log("   (real directed render follows - the call scales the flesh answer)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("D13 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("D14 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("D15 the clip is a real file on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as {
      secondary?: {
        chains?: number; cloth?: number; hair?: number;
        solver?: { cloth?: string; hair?: string; flesh?: string; simmed?: string[]; fleshSimmed?: string[]; maxAnchorSway?: number; maxFleshDrive?: number; clothCall?: number; fleshCall?: number; notes?: string[] };
      };
    };
    const solver = state.secondary?.solver;
    check("D16 the state names both calls the solvers answered (0.2 / 0.3)", solver?.clothCall === 0.2 && solver?.fleshCall === 0.3, JSON.stringify(solver));
    check("D17 the real soft-body solver simmed the trunk and face volumes", solver?.flesh === "blender-softbody-sim" && (solver?.fleshSimmed ?? []).some((n) => n.startsWith("Torso")) && (solver?.fleshSimmed ?? []).includes("HeadMesh"), JSON.stringify(solver?.fleshSimmed));
    check("D18 the beats still called the cloth anchors", solver?.cloth === "blender-cloth-sim" && (solver?.maxAnchorSway ?? 0) > 0.2, `sway=${solver?.maxAnchorSway}deg`);
    check("D19 the beats still called the flesh anchors", (solver?.maxFleshDrive ?? 0) > 0.2, `drive=${solver?.maxFleshDrive}deg`);
  }

  // the control render: no call anywhere - the state answers nothing
  const ctrlJob = await createRenderJob(labId, shot2Row.id, "PREVIEW");
  let ctrlFinal = ctrlJob;
  const ctrlDeadline = Date.now() + 480_000;
  while (ctrlFinal.status === "RENDERING" && Date.now() < ctrlDeadline) {
    await new Promise((r) => setTimeout(r, 4000));
    ctrlFinal = (await tickRenderJob(ctrlJob.id))!;
  }
  check("D20 the calm control renders too", ctrlFinal.status === "REVIEW" && Boolean(ctrlFinal.outputUrl), `control ended ${ctrlFinal.status}`);
  if (ctrlFinal.status === "REVIEW") {
    const ctrlStateRaw = readFileSync(path.join(process.cwd(), "public", "renders", `.job-${ctrlJob.id}.json`), "utf-8");
    const ctrlState = JSON.parse(ctrlStateRaw) as { secondary?: { solver?: { clothCall?: number; fleshCall?: number; flesh?: string; fleshSimmed?: string[]; maxFleshDrive?: number } } };
    const cs = ctrlState.secondary?.solver;
    check("D21 the control carries no calls (honest absence)", cs?.clothCall === undefined && cs?.fleshCall === undefined, JSON.stringify(cs));
    check("D22 the control's flesh still solves at the full response (ambient life)", cs?.flesh === "blender-softbody-sim" && (cs?.maxFleshDrive ?? 0) < 3.0, `drive=${cs?.maxFleshDrive}deg`);
  }

  // ───────────────────── E. cleanup ─────────────────────
  const renderRows = await db.renderJob.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  for (const r of renderRows) {
    if (r.outputUrl) {
      const p = path.join(process.cwd(), "public", r.outputUrl);
      if (existsSync(p)) unlinkSync(p);
    }
    const st = path.join(process.cwd(), "public", "renders", `.job-${r.id}.json`);
    if (existsSync(st)) unlinkSync(st);
  }
  await db.renderJob.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.sequenceFlow.deleteMany({ where: { projectId: labId } });
  await db.designPreset.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } });
  const gone = await db.project.findUnique({ where: { id: labId } });
  check("E1 the throwaway lab is gone (exact cleanup)", gone === null);
  check("E2 the standing productions still read", (await call(ownerJar, "/api/projects")).status === 200);

  console.log(`\n== ${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} ==`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

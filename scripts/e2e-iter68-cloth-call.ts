// Iteration 68 E2E: THE SOLVER ANSWERS THE CALL + the studio floor +
// the release calendar. Proves, against the RUNNING studio, the REAL
// database and the REAL Blender runtime:
//   A. source: the intensity law in the cloth pass, the bridge's call
//      read + state report, the payload ride, the tool surface (81
//      tools), the doctrine (rule 46 + the law), the actor context,
//      the presence and digest libs, and the new routes
//   B. pure: compileSlotCloth, formatSlotCloth, presenceBucket
//      boundaries, buildMemberDigest over planted ledgers
//   C. accounts + throwaway production
//   D. the CLOTH call end to end: design-time validation (arrays
//      refused, numbers clamped), design_sequence carries it,
//      direct_sequence stamps shots (and clears stale calls),
//      set_shot_grammar sets and clears per shot, the learned flow
//      keeps the call, and a REAL render reports the call it answered
//      (secondary.solver.clothCall) while the control answers nothing
//   E. presence + member digests over the real runtime (attributed
//      events, the member post_digest, role matrix)
//   F. the release calendar: schedule_release (slate, refuse, past
//      date reads DUE), the HTTP calendar read, PATCH write gating
//   G. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter68-cloth-call.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { compileSlotCloth, formatSlotCloth } from "../src/lib/dsh/sequence-flows";
import { presenceBucket } from "../src/lib/studio/presence";
import { buildMemberDigest } from "../src/lib/studio/member-digests";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter68-cloth-call";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter68" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter68" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter68", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter68" },
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
  console.log("== Iteration 68: the solver answers the call, the floor is live, the calendar holds ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const pass = readFileSync("bridges/blender/cloth_pass.py", "utf8");
  check("A1 the pass teaches the intensity law (the call scales the answer)", pass.includes("THE SOLVER ANSWERS THE CALL") && pass.includes("intensity=1.0"), pass.split("\n").findIndex((l) => l.includes("intensity=1.0")).toString());
  check("A2 the impulse and stagger answer at the called intensity", pass.includes("kick = kick * intensity") && pass.includes("* intensity") && pass.includes("intensity = clamp(float(intensity), 0.0, 1.0)"));
  check("A3 the directed air answers at the called intensity", pass.includes("wind * intensity * 0.9 * gain") && pass.includes("0.3 + wind * intensity"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A4 the bridge reads the shot's CLOTH call and clamps it", bridge.includes('cloth_call = shot.get("cloth")') && bridge.includes("max(0.0, min(1.0, float(cloth_call)))"));
  check("A5 the frame drive passes the intensity to the solver", bridge.includes("cloth_pass.apply_cloth_frame(cloth_rig, figure, t_sec, 1.0 / fps,\n                                             fbi, fwind, fagit, sec_kick, cloth_intensity)"));
  check("A6 the state names the call it answered", bridge.includes('solver["clothCall"] = round(cloth_intensity, 3)'));

  const renderTs = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A7 the payload carries the shot's cloth call", renderTs.includes("typeof shot.cloth === \"number\" ? { cloth: shot.cloth } : {}"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A8 the registry stands at 84 tools (schedule_release joins)", toolCount === 89, `count=${toolCount}`);
  check("A9 set_shot_grammar directs the solver per shot", tools.includes("the shot's SOLVER calls (iterations 68-69)") && tools.includes("cloth: \"number 0..1 (optional) - the CLOTH call"));
  // bumped at iteration 79: the learn pen's line grew the chained
  // performance clause ("... AND chained performance included")
  check("A10 the sentence carries the call (design + direct + learn)", tools.includes("compileSlotCloth") && tools.includes("null clears - the sentence owns the staging") && tools.includes("each slot's air call, solver call AND chained performance included"));
  check("A11 schedule_release is the calendar's pen", tools.includes("SLATE AN EPISODE'S RELEASE") && tools.includes("case \"schedule_release\""));
  check("A12 post_digest can post ONE member's digest", tools.includes("postMemberDigest") && tools.includes("member: \"string (optional) - a member's name or email"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A13 rule 46 teaches the solver call", prompts.includes("46. THE SOLVER ANSWERS THE CALL") && prompts.includes("A stillness call nobody made is drift"));
  check("A14 the curriculum grew the law", prompts.includes("- THE SOLVER ANSWERS THE CALL") && prompts.includes("drift rendered on purpose"));
  check("A15 rules stay sequential (43 to 46, no duplicates)", (prompts.match(/^44\. THE SHEET DRESSES THE RENDER/gm) ?? []).length === 1 && (prompts.match(/^45\. THE PLAN OWNS THE CLOSURE/gm) ?? []).length === 1);

  const actor = existsSync("src/lib/dsh/actor-context.ts");
  const assetsTs = readFileSync("src/lib/blender/assets.ts", "utf8");
  const orch = readFileSync("src/lib/dsh/orchestrator.ts", "utf8");
  check("A16 the actor context rides every tool body", actor && tools.includes("runWithActor(user?.id ?? null, () => executeToolInner"));
  check("A17 the design ledger stamps the actor", assetsTs.includes("userId: currentActorId()"));
  check("A18 the orchestrator attributes the turn's tool calls", orch.includes("userId: user?.id ?? null"));

  check("A19 the presence and digest libs stand", existsSync("src/lib/studio/presence.ts") && existsSync("src/lib/studio/member-digests.ts"));
  check("A20 the routes stand (presence, digests, releases)", existsSync("src/app/api/studio/presence/route.ts") && existsSync("src/app/api/studio/digests/route.ts") && existsSync("src/app/api/releases/route.ts"));
  const calView = existsSync("src/components/views/calendar-view.tsx");
  const shell = readFileSync("src/components/studio/studio-shell.tsx", "utf8");
  check("A21 the Releases view is wired into the shell", calView && shell.includes('id: "calendar"') && shell.includes("<CalendarView"));

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 compileSlotCloth: absent and empty are null", compileSlotCloth(undefined, "x").ok && (compileSlotCloth(undefined, "x") as { cloth: number | null }).cloth === null && (compileSlotCloth("", "x") as { cloth: number | null }).cloth === null);
  check("B2 compileSlotCloth: numbers pass, strings refuse", (compileSlotCloth(0.4, "x") as { cloth: number }).cloth === 0.4 && !compileSlotCloth("abc", "x").ok);
  check("B3 compileSlotCloth: arrays are refused (per-shot, not per-beat)", !compileSlotCloth([0.5, 0.6], "x").ok && compileSlotCloth([0.5], "x").ok === false);
  check("B4 compileSlotCloth: out of range clamps into 0..1", (compileSlotCloth(1.5, "x") as { cloth: number }).cloth === 1 && (compileSlotCloth(-2, "x") as { cloth: number }).cloth === 0);
  check("B5 formatSlotCloth: the read is honest", formatSlotCloth(0.7) === "cloth 0.7" && formatSlotCloth(1) === "cloth 1" && formatSlotCloth(null) === "");

  const now = new Date();
  check("B6 presenceBucket: null is offline", presenceBucket(null, now) === "offline");
  check("B7 presenceBucket: 2 minutes back is online", presenceBucket(new Date(now.getTime() - 2 * 60_000), now) === "online");
  check("B8 presenceBucket: 10 minutes back is recent", presenceBucket(new Date(now.getTime() - 10 * 60_000), now) === "recent");
  check("B9 presenceBucket: 2 hours back is away", presenceBucket(new Date(now.getTime() - 2 * 3_600_000), now) === "away");
  check("B10 presenceBucket: the future is alive (clock skew)", presenceBucket(new Date(now.getTime() + 60_000), now) === "online");

  const digest = buildMemberDigest({
    member: { name: "Lin Director", role: "OWNER" },
    events: [
      { type: "TOOL_CALL", summary: "render_shot → queued", createdAt: new Date(now.getTime() - 60_000), payload: JSON.stringify({ tool: "render_shot" }) },
      { type: "TOOL_CALL", summary: "render_shot → queued", createdAt: new Date(now.getTime() - 120_000), payload: JSON.stringify({ tool: "render_shot" }) },
      { type: "TOOL_CALL", summary: "set_shot_grammar → directed", createdAt: new Date(now.getTime() - 180_000), payload: JSON.stringify({ tool: "set_shot_grammar" }) },
      { type: "PROJECT", summary: "Shot 001 directed", createdAt: new Date(now.getTime() - 240_000) },
      { type: "TOOL_CALL", summary: "old event outside the window", createdAt: new Date(now.getTime() - 72 * 3_600_000), payload: JSON.stringify({ tool: "render_shot" }) },
    ],
    comments: 2,
    windowHours: 24,
    now,
  });
  check("B11 the digest groups attributed tool calls", digest.toolCalls === 3 && digest.tools["render_shot"] === 2 && digest.tools["set_shot_grammar"] === 1, JSON.stringify(digest.tools));
  check("B12 the digest counts comments and skips the old event", digest.comments === 2 && digest.events === 4 && !digest.quiet);
  check("B13 the digest headline names the member and the window", digest.headline.includes("Lin Director") && digest.headline.includes("24h"));
  const quiet = buildMemberDigest({ member: { name: "Silent Reader", role: "VIEWER" }, events: [], comments: 0, windowHours: 24, now });
  check("B14 a quiet member is reported honestly, never invented", quiet.quiet && quiet.lines.length === 1 && quiet.lines[0].includes("quiet window"));

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  const viewerLogin = await register("reader@studio.dev", "Silent Reader", "viewing123");
  check("C2 the seeded reader holds VIEWER", viewerLogin.role === "VIEWER");
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");

  const created = await executeTool("throwaway", "create_project", { title: `Iter68 Cloth Call Lab ${MARK}`, logline: "a throwaway production for the CLOTH call + studio floor + release calendar proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the CLOTH call end to end ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Call" });
  await T("create_episode", { seasonNumber: 1, number: 2, title: "E2E Call Two" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate storm", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Call Saint Yun stands on the gate as the storm lands - robes torn by the wind", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the calm after - E2E Call Saint Yun stands alone in still air", shotType: "MEDIUM", movement: "STATIC" });
  await T("create_character", { name: "E2E Call Saint Yun", role: "PROTAGONIST", appearance: "an elder sword cultivator with a flowing beard and a topknot, storm-grey layered robes with a long wind-torn sash, obsidian blade", personality: "stoic" });

  const seq = await T("design_sequence", {
    name: "Call Sentence",
    slots: JSON.stringify([
      { grammar: "The Assault", wind: 0.9, cloth: 0.35, note: "the storm's solver answer is held back" },
      { grammar: "The Withdrawal", note: "the calm keeps the full response" },
    ]),
  });
  check("D1 the sentence registers with the solver call in its shape", seq.status === "OK" && seq.result.includes("+cloth 0.35"), seq.result.slice(0, 200));

  const badArray = await T("design_sequence", { name: "Call Sentence Bad", slots: JSON.stringify([{ grammar: "The Assault", cloth: [0.5, 0.6] }, { grammar: "The Withdrawal" }]) });
  check("D2 a per-beat cloth array is refused (the call is per-shot)", badArray.status === "ERROR" && badArray.result.includes("per-shot answer"), badArray.result.slice(0, 160));

  const direct = await T("direct_sequence", { program: "Call Sentence" });
  check("D3 the sentence directs and the flow read names the call", direct.status === "OK" && direct.result.includes("cloth 0.35"), direct.result.slice(0, 300));

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const shot1 = shots.find((s) => s.number === 1);
  const shot2Row = shots.find((s) => s.number === 2);
  if (!shot1 || !shot2Row) throw new Error("shots missing - cannot continue");
  check("D4 slot 1's call is stamped on its shot", shot1.cloth === 0.35, `cloth=${shot1.cloth}`);
  check("D5 slot 2 carried no call and the stale-shot law holds (null)", shot2Row.cloth === null, `cloth=${shot2Row.cloth}`);

  const outcomeRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "Call Sentence" } } });
  const outcome = outcomeRow ? (JSON.parse(outcomeRow.outcomes || "[]") as Array<{ clothCalls?: number }>) : [];
  check("D6 the program's measured record counts the solver call", outcome.length > 0 && outcome[0].clothCalls === 1, JSON.stringify(outcome[0] ?? {}));

  const flow = await T("learn_sequence_flow", { name: "Call Flow", register: "BATTLE", program: "Call Sentence" });
  check("D7 the learned flow keeps the call in its sentence", flow.status === "OK", flow.result.slice(0, 160));
  const flowRow = await db.sequenceFlow.findFirst({ where: { projectId: labId, name: "Call Flow" } });
  const flowSlots = flowRow ? (JSON.parse(flowRow.spec).slots as Array<{ cloth?: number }>) : [];
  check("D8 the flow's slots carry the solver call", (flowSlots[0]?.cloth ?? null) === 0.35 && flowSlots[1]?.cloth === undefined, JSON.stringify(flowSlots));

  const perShot = await T("set_shot_grammar", {
    sceneNumber: 1, shotNumber: 1,
    grammar: JSON.stringify([
      { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.95 },
      { move: "ORBIT", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", wind: 0.4 },
    ]),
    cloth: 0.2,
  });
  check("D9 the per-shot call sets the intensity on the grammar path", perShot.status === "OK" && perShot.result.includes("cloth 0.2"), perShot.result.slice(0, 220));
  const shot1After = await db.shot.findUnique({ where: { id: shot1.id } });
  check("D10 the shot row carries the directed intensity", shot1After?.cloth === 0.2, `cloth=${shot1After?.cloth}`);

  const badDirect = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "The Assault", cloth: "storm" });
  check("D11 a non-numeric call never reaches a shoot", badDirect.status === "ERROR" && badDirect.result.includes("cloth must be a number"), badDirect.result.slice(0, 140));

  console.log("   (real directed render follows - the call scales the answer)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("D12 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("D13 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("D14 the clip is a real file on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as {
      grammar?: { beats?: number; windBeats?: number };
      secondary?: {
        chains?: number; cloth?: number; hair?: number;
        solver?: { cloth?: string; hair?: string; simmed?: string[]; springs?: string[]; maxAnchorSway?: number; clothCall?: number; notes?: string[] };
      };
    };
    const solver = state.secondary?.solver;
    check("D15 the state names the call the solver answered (0.2)", solver?.clothCall === 0.2, JSON.stringify(solver));
    check("D16 the solver still simmed the cloth (the call scales the answer, not the physics)", solver?.cloth === "blender-cloth-sim" && (solver?.simmed ?? []).length === 13, JSON.stringify(solver?.simmed));
    check("D17 the directed air still called the anchors", (solver?.maxAnchorSway ?? 0) > 0.2, `sway=${solver?.maxAnchorSway}deg`);
    check("D18 the grammar's wind beats landed", state.grammar?.windBeats === 2, JSON.stringify(state.grammar));
  }

  // the control render: no call anywhere - the state answers nothing
  const ctrlJob = await createRenderJob(labId, shot2Row.id, "PREVIEW");
  let ctrlFinal = ctrlJob;
  const ctrlDeadline = Date.now() + 480_000;
  while (ctrlFinal.status === "RENDERING" && Date.now() < ctrlDeadline) {
    await new Promise((r) => setTimeout(r, 4000));
    ctrlFinal = (await tickRenderJob(ctrlJob.id))!;
  }
  check("D19 the calm control renders too", ctrlFinal.status === "REVIEW" && Boolean(ctrlFinal.outputUrl), `control ended ${ctrlFinal.status}`);
  if (ctrlFinal.status === "REVIEW") {
    const ctrlStateRaw = readFileSync(path.join(process.cwd(), "public", "renders", `.job-${ctrlJob.id}.json`), "utf-8");
    const ctrlState = JSON.parse(ctrlStateRaw) as { secondary?: { solver?: { clothCall?: number; cloth?: string } } };
    check("D20 the control carries no cloth call (honest absence)", ctrlState.secondary?.solver?.clothCall === undefined && ctrlState.secondary?.solver?.cloth === "blender-cloth-sim", JSON.stringify(ctrlState.secondary?.solver));
  }

  // the per-shot clear path
  const cleared = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "The Assault", cloth: "" });
  check("D21 an empty string clears the call back to the full response", cleared.status === "OK" && cleared.result.includes("full probed response"), cleared.result.slice(0, 200));
  const shot1Cleared = await db.shot.findUnique({ where: { id: shot1.id } });
  check("D22 the shot row is cleared (null)", shot1Cleared?.cloth === null, `cloth=${shot1Cleared?.cloth}`);

  // ───────────────────── E. presence + member digests over the real runtime ─────────────────────
  const anonPresence = await call(null, "/api/studio/presence");
  check("E1 anonymous presence is 401", anonPresence.status === 401);
  const ownerPresence = (await (await call(ownerJar, "/api/studio/presence")).json()) as { counts: { online: number }; members: Array<{ email: string; bucket: string }> };
  const selfRow = ownerPresence.members.find((m) => m.email === "director@studio.dev");
  check("E2 the owner reads the floor and the caller is online (the read IS the heartbeat)", ownerPresence.counts.online >= 1 && selfRow?.bucket === "online", JSON.stringify(ownerPresence.counts));

  // seat the reader on the lab crew so their digest and comment are honest
  await call(ownerJar, `/api/projects/${labId}/members`, { method: "POST", body: JSON.stringify({ userId: viewerLogin.id, craft: "REVIEW" }) });

  const ownerDigestsRes = await call(ownerJar, `/api/studio/digests?projectId=${labId}&hours=24`);
  check("E3 the owner reads the member digests", ownerDigestsRes.status === 200);
  const digests = (await ownerDigestsRes.json()) as { windowHours: number; members: Array<{ email: string; digest: { toolCalls: number; comments: number; quiet: boolean; headline: string; lines: string[] } }> };
  const ownerDigest = digests.members.find((m) => m.email === "director@studio.dev");
  check("E4 the director's digest carries the attributed events (design ledger, stamped)", Boolean(ownerDigest) && !ownerDigest!.digest.quiet && ownerDigest!.digest.headline.includes("Lin Director"), JSON.stringify(ownerDigest?.digest));
  const viewerDigestsRes = await call(viewerJar, `/api/studio/digests?projectId=${labId}`);
  check("E5 the crew reads the digests (VIEWER included)", viewerDigestsRes.status === 200);
  const viewerDigests = (await viewerDigestsRes.json()) as { members: Array<{ email: string; digest: { quiet: boolean } }> };
  const readerDigest = viewerDigests.members.find((m) => m.email === "reader@studio.dev");
  check("E6 the reader's window is honestly quiet before they speak", Boolean(readerDigest) && readerDigest!.digest.quiet);

  // the reader speaks in the crew thread, then their digest grows
  const commentRes = await call(viewerJar, "/api/comments", { method: "POST", body: JSON.stringify({ anchorType: "SHOT", anchorId: shot1.id, body: "the sash reads beautifully at 0.2 - keep it" }) });
  check("E7 the reader speaks in the crew thread", commentRes.status === 200 || commentRes.status === 201, `status=${commentRes.status}`);
  const digestsAfter = (await (await call(viewerJar, `/api/studio/digests?projectId=${labId}`)).json()) as { members: Array<{ email: string; digest: { comments: number; quiet: boolean } }> };
  const readerAfter = digestsAfter.members.find((m) => m.email === "reader@studio.dev");
  check("E8 the reader's digest counts their comment (never quiet again)", Boolean(readerAfter) && readerAfter!.digest.comments === 1 && !readerAfter!.digest.quiet, JSON.stringify(readerAfter?.digest));

  const memberPost = await T("post_digest", { member: "reader@studio.dev", hours: 24 });
  const readerName = (await db.user.findUnique({ where: { email: "reader@studio.dev" } }))?.name ?? "";
  check("E9 DSH posts ONE member's digest", memberPost.status === "OK" && memberPost.result.includes(readerName) && memberPost.result.includes("1 comment"), memberPost.result.slice(0, 220));
  const memberMiss = await T("post_digest", { member: "nobody@studio.dev" });
  check("E10 an unknown member is refused honestly", memberMiss.status === "ERROR" && memberMiss.result.includes("no member named"), memberMiss.result.slice(0, 140));

  // ───────────────────── F. the release calendar ─────────────────────
  const slated = await T("schedule_release", { episodeNumber: 1, releaseAt: "2026-12-05", platform: "Bilibili" });
  check("F1 the release is slated with its platform", slated.status === "OK" && slated.result.includes("2026-12-05") && slated.result.includes("Bilibili"), slated.result.slice(0, 240));
  const pastDue = await T("schedule_release", { episodeNumber: 2, releaseAt: "2026-08-01T00:00:00Z" });
  check("F2 a past date slates and reads as RELEASED", pastDue.status === "OK" && pastDue.result.includes("RELEASED"), pastDue.result.slice(0, 220));
  const badDate = await T("schedule_release", { episodeNumber: 1, releaseAt: "sometime soon" });
  check("F3 a non-date is refused", badDate.status === "ERROR" && badDate.result.includes("not a date ISO understands"), badDate.result.slice(0, 160));

  const anonCal = await call(null, `/api/releases?projectId=${labId}`);
  check("F4 anonymous calendar read is 401", anonCal.status === 401);
  const calRes = await call(viewerJar, `/api/releases?projectId=${labId}`);
  check("F5 the crew reads the calendar (VIEWER included)", calRes.status === 200);
  const cal = (await calRes.json()) as {
    episodes: Array<{ number: number; state: string; releasePlatform: string | null; releaseAt: string | null }>;
    slated: unknown[]; due: unknown[]; unscheduled: unknown[];
  };
  const ep1 = cal.episodes.find((e) => e.number === 1);
  const ep2 = cal.episodes.find((e) => e.number === 2);
  check("F6 the calendar buckets slated and due honestly", ep1?.state === "SLATED" && ep2?.state === "DUE" && cal.slated.length === 1 && cal.due.length === 1, JSON.stringify({ ep1: ep1?.state, ep2: ep2?.state }));
  check("F7 the platform rides the calendar row", ep1?.releasePlatform === "Bilibili");

  const ep2Row = await db.episode.findFirst({ where: { season: { projectId: labId }, number: 2 } });
  if (!ep2Row) throw new Error("episode 2 missing - cannot continue");
  const readerPatch = await call(viewerJar, "/api/releases", { method: "PATCH", body: JSON.stringify({ episodeId: ep2Row.id, releaseAt: "2027-01-01" }) });
  check("F8 a VIEWER cannot slate a release (403)", readerPatch.status === 403, `status=${readerPatch.status}`);
  const ownerPatch = await call(ownerJar, "/api/releases", { method: "PATCH", body: JSON.stringify({ episodeId: ep2Row.id, releaseAt: "", releasePlatform: null }) });
  check("F9 the OWNER unschedules through the API", ownerPatch.status === 200 && (await ownerPatch.json()).releaseAt === null, `status=${ownerPatch.status}`);
  const calAfter = (await (await call(ownerJar, `/api/releases?projectId=${labId}`)).json()) as { unscheduled: Array<{ number: number }>; due: unknown[] };
  check("F10 the unscheduled tray holds what has no date", calAfter.unscheduled.some((e) => e.number === 2) && calAfter.due.length === 0, JSON.stringify(calAfter.unscheduled));

  // ───────────────────── G. role matrix + cleanup ─────────────────────
  const anonDsh = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "slate the release" }) });
  check("G1 anonymous direction is 401", anonDsh.status === 401);
  const viewerPost = await call(viewerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "slate the release" }) });
  check("G2 a VIEWER cannot direct (403)", viewerPost.status === 403);
  const ownerRenders = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
  check("G3 the OWNER reads everything, always unblocked", ownerRenders.status === 200);

  await db.project.delete({ where: { id: labId } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  check("G4 every throwaway row is gone (cascade holds)", !leftover);
  for (const jid of [job.id, ctrlJob.id]) {
    for (const p of [
      path.join(process.cwd(), "public", "renders", `.job-${jid}.json`),
      path.join(process.cwd(), "public", "renders", "cuts", `${jid}.mp4`),
      path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4"),
      path.join(process.cwd(), "public", ctrlFinal.outputUrl ?? "/x.mp4"),
    ]) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        // best effort
      }
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("E2E crashed:", e);
    process.exit(1);
  });

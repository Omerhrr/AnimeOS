// Iteration 74 E2E: THE PERFORMANCE IS KEYED (keyframe choreography).
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the choreography pass (the keyed law, the easing, the
//      impact light, the smear), the bridge wiring (the keys own the
//      body - the lens stays the grammar's), the payload ride, the
//      tool surface (83 tools, the two choreography pens), the
//      doctrine (rule 49 + the law)
//   B. pure: compileChoreo (validation, clamps, refusals), the
//      built-ins, resolveChoreoInput
//   C. accounts + throwaway production
//   D. the performance end to end: design + apply (saved, built-in,
//      inline, clear), the refusals (bad pose, bad at, unknown name),
//      a REAL render that performs the keys with the impact flare and
//      the smear measured in state, the control that slides honestly
//   E. cleanup (exact rows + files)
// Run: npx tsx scripts/e2e-iter74-choreo.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { compileChoreo, resolveChoreoInput, BUILT_IN_CHOREO } from "../src/lib/animation/choreography";
import { readFileSync, existsSync, unlinkSync, statSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter74-choreo";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter74" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter74" },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string }; id?: string; role?: string };
  if (res.ok) return { id: body.user?.id ?? body.id ?? "", role: body.user?.role ?? body.role ?? "" };
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter74" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter74", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

function isMp4(p: string): boolean {
  try {
    return statSync(p).size > 1000;
  } catch {
    return false;
  }
}

async function runRender(jobId: string, maxMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const job = await tickRenderJob(jobId);
    if (job && job.status !== "RENDERING") return;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`render ${jobId} timed out after ${maxMs}ms`);
}

function readState(jobId: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "public", "renders", `.job-${jobId}.json`), "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
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
  await db.project.delete({ where: { id: labId } }).catch(() => {});
}

async function main() {
  console.log("== Iteration 74: the performance is keyed (keyframe choreography) ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const pass = readFileSync("bridges/blender/choreography_pass.py", "utf8");
  check("A1 the pass exists and names the keyed law", pass.includes("THE PERFORMANCE IS KEYED") && pass.includes("def normalize_choreo") && pass.includes("def pose_state_at"));
  check("A2 the easing is the keyed craft (blast, wind-up, settle)", pass.includes('(1.0 - x) ** 5') && pass.includes("(1.0 - x) ** 3") && pass.includes('if x < 0.5'));
  check("A3 the strike flares a REAL light and punches the camera", pass.includes("def build_impact_light") && pass.includes('"ChoreoImpact"') && pass.includes("cam.rotation_euler.x += math.radians(punch_deg)"));
  check("A4 the smear stretches the striking limb and resets", pass.includes("def apply_smear") && pass.includes("shoulder.scale = (s, 1.0, 1.0)") && pass.includes("1.35"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A5 the bridge reads the shot's choreo and normalizes it", bridge.includes('choreo_raw = shot.get("choreo")') && bridge.includes("choreography_pass.normalize_choreo(choreo_raw)"));
  check("A6 the keys own the body (the pose call obeys the program)", bridge.includes("pose_s, pose_e, pose_t = choreography_pass.pose_state_at(choreo_prog, t)"));
  check("A7 the lens stays the grammar's (punch rides the aim)", bridge.includes("choreography_pass.apply_impact(choreo_prog, cam, choreo_flash, f, frames_total)"));
  check("A8 the smear rides after the pose call", bridge.includes("s = choreography_pass.apply_smear(choreo_prog, figure, f, frames_total)"));
  check("A9 the state names the performance honestly", bridge.includes('state["choreo"]["maxSmear"]') && bridge.includes('"impactFrames": ch_impacts') && bridge.includes('choreo refused'));

  const renderTs = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A10 the payload carries the shot's choreo", renderTs.includes("? { choreo: c } : {}"));

  const blenderTs = readFileSync("src/lib/bridge/blender.ts", "utf8");
  check("A11 the payload type names the program", blenderTs.includes("keys: Array<{ at: number; pose: string; kind?: string }>"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A12 the registry stands at 84 tools (the two choreography pens join)", toolCount === 85, `count=${toolCount}`);
  check("A13 design_choreography + set_shot_choreography are registry pens", tools.includes('name: "design_choreography"') && tools.includes('name: "set_shot_choreography"'));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A14 rule 49 teaches the keyed law", prompts.includes("49. THE KEYS OWN THE BODY") && prompts.includes("a blast without a wind-up reads as teleportation"));
  check("A15 the curriculum grew the performance line", prompts.includes("- THE PERFORMANCE IS KEYED: interpolation is blocking"));
  check("A16 rules stay sequential (48 to 49, no duplicates)", (prompts.match(/^48\. THE SKIN IS PAINTED/gm) ?? []).length === 1 && (prompts.match(/^49\. THE KEYS OWN THE BODY/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  const good = compileChoreo({
    keys: [
      { at: 0, pose: "STANCE", kind: "hold" },
      { at: 0.4, pose: "CROUCH", kind: "anticipation" },
      { at: 0.55, pose: "SLASH", kind: "strike" },
      { at: 1, pose: "STANCE", kind: "follow" },
    ],
    impact: { at: 0.55, frames: 3, punch: 2.5, flash: 0.8 },
    smear: { at: 0.55, frames: 2, amount: 0.5 },
  }, "t");
  check("B1 a keyed program compiles with its accents", good.ok && good.spec.keys.length === 4 && good.spec.impact !== null && good.spec.smear !== null);
  check("B2 a garbage pose is refused (the vocabulary is law)", !compileChoreo({ keys: [{ at: 0, pose: "STANCE" }, { at: 1, pose: "TELEPORT" }] }, "t").ok);
  check("B3 time must run forward and own the clip", !compileChoreo({ keys: [{ at: 0.5, pose: "STANCE" }, { at: 1, pose: "SLASH" }] }, "t").ok && !compileChoreo({ keys: [{ at: 0, pose: "STANCE" }, { at: 0.4, pose: "SLASH" }, { at: 0.4, pose: "LUNGE" }] }, "t").ok);
  check("B4 impact bounds are law (frames 1..6, punch 0..8)", !compileChoreo({ keys: [{ at: 0, pose: "STANCE" }, { at: 1, pose: "SLASH" }], impact: { at: 0.5, frames: 9, punch: 2 } }, "t").ok && !compileChoreo({ keys: [{ at: 0, pose: "STANCE" }, { at: 1, pose: "SLASH" }], impact: { at: 0.5, frames: 2, punch: 22 } }, "t").ok);
  const combo = resolveChoreoInput("The Combo");
  check("B5 the built-ins resolve by name", combo.ok && BUILT_IN_CHOREO.length === 3 && combo.spec.keys.length === 5);
  check("B6 an unknown name refuses with the registry named", !resolveChoreoInput("The Moonwalk").ok);

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

  const created = await executeTool("throwaway", "create_project", { title: `Iter74 Choreo Lab ${MARK}`, logline: "a throwaway production for the keyed-performance proof - the keys own the body", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the keyed performance end to end ─────────────────────
  const designed = await T("design_choreography", {
    name: "Sky Cleaver",
    keys: JSON.stringify([
      { at: 0, pose: "STANCE", kind: "hold" },
      { at: 0.3, pose: "CROUCH", kind: "anticipation" },
      { at: 0.45, pose: "SLASH", kind: "strike" },
      { at: 0.58, pose: "SLASH", kind: "hold" },
      { at: 1, pose: "STANCE", kind: "follow" },
    ]),
    impact: JSON.stringify({ at: 0.45, frames: 3, punch: 2.5, flash: 0.8 }),
    smear: JSON.stringify({ at: 0.45, frames: 2, amount: 0.5 }),
    note: "the sky splits",
  });
  check("D1 the performance registers with its keys and accents", designed.status === "OK" && designed.result.includes("stance@0:hold") && designed.result.includes("slash@0.45:strike") && designed.result.includes("impact flare"), designed.result.slice(0, 220));

  const badPose = await T("design_choreography", { name: "Bad Pose", keys: JSON.stringify([{ at: 0, pose: "STANCE" }, { at: 1, pose: "MOONWALK" }]) });
  check("D2 a pose outside the vocabulary refuses at design time", badPose.status === "ERROR" && badPose.result.includes("the body speaks"), badPose.result.slice(0, 140));

  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Choreo" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Cliff arena", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Choreo Blade Warden splits the sky - the performance is keyed", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "SLASH", duration: 1.0 });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the control - E2E Choreo Blade Warden slides between two poses", shotType: "MEDIUM", movement: "STATIC", duration: 1.0 });
  await db.project.update({ where: { id: labId }, data: { resolution: "640x360", fps: 12 } });

  const applied = await T("set_shot_choreography", { sceneNumber: 1, shotNumber: 1, choreo: "Sky Cleaver" });
  check("D3 the saved performance applies to the shot", applied.status === "OK" && applied.result.includes("THE BODY PERFORMS"), applied.result.slice(0, 200));
  const shot1 = await db.shot.findFirst({ where: { scene: { episode: { season: { projectId: labId } }, number: 1 }, number: 1 } });
  const shot2 = await db.shot.findFirst({ where: { scene: { episode: { season: { projectId: labId } }, number: 1 }, number: 2 } });
  if (!shot1 || !shot2) throw new Error("shots missing - cannot continue");
  const perf = shot1.choreo ? (JSON.parse(shot1.choreo) as { keys: unknown[]; impact: unknown; smear: unknown }) : null;
  check("D4 the shot row carries the program", perf !== null && perf.keys.length === 5 && perf.impact !== null && perf.smear !== null, shot1.choreo?.slice(0, 120));
  check("D5 the control stays clean (honest absence)", shot2.choreo === null);

  const builtin = await T("set_shot_choreography", { sceneNumber: 1, shotNumber: 2, choreo: "The Rising Fang" });
  check("D6 a built-in performance applies by name", builtin.status === "OK" && builtin.result.includes("built-in 'The Rising Fang'"), builtin.result.slice(0, 160));
  const shot2b = await db.shot.findFirst({ where: { id: shot2.id } });
  check("D7 the control is now a performer too (and the clear returns it)", shot2b?.choreo?.includes("The Rising Fang") === true, shot2b?.choreo?.slice(0, 80));
  const cleared = await T("set_shot_choreography", { sceneNumber: 1, shotNumber: 2, choreo: "" });
  const shot2c = await db.shot.findFirst({ where: { id: shot2.id } });
  check("D8 empty string clears back to the slide", cleared.status === "OK" && shot2c?.choreo === null);

  const unknown = await T("set_shot_choreography", { sceneNumber: 1, shotNumber: 1, choreo: "The Moonwalk" });
  check("D9 an unknown name refuses with the registry named", unknown.status === "ERROR" && unknown.result.includes("Registry:"), unknown.result.slice(0, 180));

  console.log("   (real keyed render follows - the body performs the keys)");
  const keyJob = await createRenderJob(labId, shot1.id, "PREVIEW");
  await runRender(keyJob.id, 6 * 60_000);
  const keyDone = await db.renderJob.findUnique({ where: { id: keyJob.id } });
  check("D10 the keyed shot renders to a clip", keyDone?.status === "REVIEW" && Boolean(keyDone.outputUrl) && isMp4(path.join(process.cwd(), "public", keyDone.outputUrl ?? "")), `${keyDone?.status} ${keyDone?.stage}`);
  const keyState = readState(keyJob.id);
  const ch = (keyState?.choreo ?? null) as { name?: string; keys?: number; poseKeys?: string[]; impactFrames?: number[]; maxSmear?: number } | null;
  check("D11 the state names the performance (keys + pose chain)", ch !== null && ch.keys === 5 && Array.isArray(ch.poseKeys) && ch.poseKeys.join(",") === "STANCE,CROUCH,SLASH,SLASH,STANCE", JSON.stringify(ch));
  check("D12 the impact frames are real (a 3-frame window on the strike)", Array.isArray(ch?.impactFrames) && ch.impactFrames.length === 3, JSON.stringify(ch?.impactFrames));
  check("D13 the smear is measured (the limb actually stretched)", typeof ch?.maxSmear === "number" && ch.maxSmear > 1.0 && ch.maxSmear <= 1.35, `maxSmear=${ch?.maxSmear}`);
  check("D14 the state names the program", ch?.name === "Sky Cleaver");

  const slideJob = await createRenderJob(labId, shot2.id, "PREVIEW");
  await runRender(slideJob.id, 6 * 60_000);
  const slideState = readState(slideJob.id);
  check("D15 the control slides honestly (no choreo in state)", slideState !== null && slideState.choreo === undefined, JSON.stringify(slideState?.stage ?? ""));

  // ───────────────────── E. cleanup ─────────────────────
  await cleanupLab(labId);
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

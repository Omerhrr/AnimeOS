// Iteration 57 E2E: THE WORLD OBEYS ITS OWN LAW - directed physics
// riding the grammar beats. Proves, against the RUNNING studio, the
// REAL database and the REAL Blender runtime:
//   A. source: the physics vocabulary + compiler (physics.ts), the
//      worker's physics pass (normalize, build, per-frame integrate,
//      honest skips, seed law, the probed law), the two physics tools
//      (registry 74), doctrine (PHYSICS IS THE WORLD'S LAW + rule 35),
//      the schema's physics column + PHYSICS preset kind, the payload
//      injection, the render view's physics chips
//   B. accounts + throwaway production
//   C. the physics registry: design_physics programs + honest refusals
//      (unknown kind, target on SWAY, non-numeric intensity, empty)
//   D. set_shot_physics: built-in by name, saved preset, inline,
//      unknown refusal, clear - the shot column carries the programs
//   E. a REAL directed render with physics: a DESIGNED prop rides the
//      shot (named in the text), a KNOCK bound to the second beat
//      strikes IT (the state names how), DEBRIS kicks and SWAY swings;
//      the worker state reports the programs, the strikes, the
//      bounces, the settle frame and the lantern's swing - plus a
//      control render whose stage stays clean (no physics key)
//   F. the context line reports the physics preset
//   G. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   H. cleanup (exact rows)
// Run: npx tsx scripts/e2e-iter57-physics.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter57-world-obey";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter57" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter57" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter57", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter57" },
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
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return buf.subarray(4, 8).toString("ascii") === "ftyp" && fs.statSync(p).size > 1000;
  } catch {
    return false;
  }
}

async function main() {
  console.log("== Iteration 57: the world obeys its own law - directed physics on the grammar beats ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const physics = readFileSync("src/lib/animation/physics.ts", "utf8");
  check("A1 the physics vocabulary is exactly the three body laws the worker performs", physics.includes('PHYSICS_KINDS = ["KNOCK", "DEBRIS", "SWAY"]'));
  check("A2 the compiler clamps intensity and refuses non-numbers", physics.includes("intensity = clamp01(v);") && physics.includes("intensity must be a number 0..1"));
  check("A3 only KNOCK takes a target (a typo never reaches a shoot)", physics.includes("only KNOCK takes a target"));
  check("A4 beat bindings are ALL or bounded indices", physics.includes('beats must be "ALL" or an array of 0-based grammar beat indices') && physics.includes("n > 11"));
  check("A5 the built-in wreckage language ships four named programs", physics.includes('name: "The Clash"') && physics.includes('name: "The Ruin"') && physics.includes('name: "The Windchime"') && physics.includes('name: "The Shove"'));
  check("A6 the column round-trips (serialize + honest parse)", physics.includes("export function serializePhysics") && physics.includes("export function parseStoredPhysics"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A7 the worker imports the physics pass and normalizes honestly", bridge.includes("import physics_pass") && bridge.includes("physics_pass.normalize_physics(phys_raw, len(grammar) if grammar else 1)"));
  check("A8 the beat context is computed once per frame (fx AND physics share the clock)", bridge.includes("fbi, fwind, fx_vel = -1, 0.0, 0.0") && bridge.includes("if (fx_rig or phys_rig) and (pose_s or pose_e):"));
  check("A9 the physics rig compiles with the riding prop anchors (real prop interaction)", bridge.includes("physics_pass.build_physics_rig(bpy, scn, phys_programs, figure,") && bridge.includes("prop_anchors, job_id)"));
  check("A10 the state reports the evidence (strikes, bounces, max speed, settle frame, swing)", bridge.includes('prep["strikes"] = phys_rig["strikes"]') && bridge.includes('prep["bounces"] = phys_rig["bounces"]') && bridge.includes('prep["maxSpeed"] = round(phys_rig["max_speed"], 2)') && bridge.includes('prep["settleFrame"] = phys_rig["settle_frame"]') && bridge.includes('prep["maxSwing"] = round(phys_rig["max_swing"], 1)'));
  check("A11 riding props are registered by name for the knock to find", bridge.includes("prop_anchors.append") && bridge.includes('prop_anchors = []'));

  const physPass = readFileSync("bridges/blender/physics_pass.py", "utf8");
  check("A12 the pass performs exactly the three body laws", physPass.includes('PHYSICS_KINDS = ("KNOCK", "DEBRIS", "SWAY")'));
  check("A13 the probed law is law (gravity, restitution, friction, settle constants)", physPass.includes("GRAVITY = -9.8") && physPass.includes("RESTITUTION = 0.32") && physPass.includes("IMPACT_FRICTION = 0.72") && physPass.includes("SETTLE_SPEED = 0.08"));
  check("A14 a shallow impact grounds the body (no micro-vibration forever - the probe's lesson)", physPass.includes("too flat to bounce again: roll, friction eats it") && physPass.includes('body["grounded"] = True'));
  check("A15 the knock resolves its target honestly (named prop, auto, or a declared vessel)", physPass.includes("takes the hit") && physPass.includes("a stone vessel stands in (declared)"));
  check("A16 debris lies where it settles (physics truth: no fading)", physPass.includes('"kicked": False') && !physPass.includes("debris fade"));
  check("A17 the lantern rides the wind call the cloth hangs from", physPass.includes("drive = wind * 1.9 * sw[\"sign\"]"));
  check("A18 the seed law holds (deterministic wreckage per job + program)", physPass.includes("rng = mulberry32(fnv1a(str(job_id)) ^ (0x911 + pi))"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A19 the registry grew to 74 tools (design_physics 73, set_shot_physics 74)", toolCount === 74, `count=${toolCount}`);
  check("A20 the physics resolution order is saved -> built-in -> inline", tools.includes("// resolve: saved physics preset -> built-in -> inline programs"));
  check("A21 set_shot_physics teaches the order of operations (lens first)", tools.includes("direct the lens first (set_shot_grammar) so the beats have something to answer"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A22 the shot column carries the body laws", schema.includes("physics     String?  // JSON: Array<{ kind, intensity?, beats?, target?, note? }>"));
  check("A23 the preset registry names the PHYSICS kind", schema.includes("SCULPT | FX | PHYSICS"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A24 the curriculum grew PHYSICS IS THE WORLD'S LAW", prompts.includes("- PHYSICS IS THE WORLD'S LAW") && prompts.includes("wreckage that starts before the cut is a lie the audience feels"));
  check("A25 rule 35 teaches the directed body law + the evidence read", prompts.includes("35. LET THE WORLD OBEY ITS OWN LAW") && prompts.includes("promise wreckage only when the state reports it"));

  const render = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A26 the payload carries the shot's physics (corrupt column degrades clean)", render.includes("the worker compiles them into real rigid bodies integrated") && render.includes("Array.isArray(ph) && ph.length > 0 ? { physics: ph } : {}"));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A27 the job card flags the body laws (emerald chips)", renderView.includes("DIRECTED PHYSICS chips: the body laws answering the beats") && renderView.includes("bg-emerald-400/10 border-emerald-400/40 text-emerald-300"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter57 World Obey Lab ${MARK}`, logline: "a throwaway production for the directed physics proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway physics lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the physics registry ─────────────────────
  const clash = await T("design_physics", { name: "E2E Gate Break", programs: JSON.stringify([
    { kind: "KNOCK", intensity: 0.85, beats: [1], target: "E2E Storm Vessel", note: "the clash sends the vessel flying" },
    { kind: "DEBRIS", intensity: 0.7, note: "the floor's rubble scatters" },
    { kind: "SWAY", intensity: 0.55, note: "the courtyard lantern rides the gust" },
  ]) });
  check("C1 a named physics program registers with its bound knock", clash.status === "OK" && clash.result.includes("registered") && clash.result.includes("KNOCK>E2E Storm Vessel@1") && clash.result.includes("DEBRIS") && clash.result.includes("SWAY"), clash.result.slice(0, 220));
  const clashRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "PHYSICS", name: "E2E Gate Break" } } });
  const clashSpec = clashRow ? (JSON.parse(clashRow.spec) as { programs: Array<{ kind: string; target: string | null; beats: unknown }> }) : null;
  check("C2 the stored programs carry kind, target and the beat binding", clashSpec?.programs?.length === 3 && clashSpec.programs[0].target === "E2E Storm Vessel" && JSON.stringify(clashSpec.programs[0].beats) === "[1]", JSON.stringify(clashSpec?.programs));

  const ghostKind = await T("design_physics", { name: "E2E Explosion", programs: JSON.stringify([{ kind: "EXPLOSION" }]) });
  check("C3 an unknown kind refuses with the vocabulary", ghostKind.status === "ERROR" && ghostKind.result.includes('unknown kind "EXPLOSION"') && ghostKind.result.includes("KNOCK, DEBRIS, SWAY"), ghostKind.result.slice(0, 160));
  const badTarget = await T("design_physics", { name: "E2E Targeted Sway", programs: JSON.stringify([{ kind: "SWAY", target: "lantern" }]) });
  check("C4 a target on a non-KNOCK kind refuses at design time", badTarget.status === "ERROR" && badTarget.result.includes("only KNOCK takes a target"), badTarget.result.slice(0, 160));
  const badInt = await T("design_physics", { name: "E2E Bad Intensity", programs: JSON.stringify([{ kind: "DEBRIS", intensity: "heavy" }]) });
  check("C5 a non-numeric intensity refuses", badInt.status === "ERROR" && badInt.result.includes("intensity must be a number 0..1"), badInt.result.slice(0, 140));
  const emptyPhys = await T("design_physics", { name: "E2E Empty", programs: "[]" });
  check("C6 an empty program refuses (clearing belongs to the shot)", emptyPhys.status === "ERROR" && emptyPhys.result.includes("at least 1 body law"), emptyPhys.result.slice(0, 140));
  const overdrive = await T("design_physics", { name: "E2E Overdrive", programs: JSON.stringify([{ kind: "KNOCK", intensity: 3.3 }]) });
  check("C7 an over-driven intensity clamps to 1.0", overdrive.status === "OK", overdrive.result.slice(0, 100));
  const clampedRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "PHYSICS", name: "E2E Overdrive" } } });
  const clampedSpec = clampedRow ? (JSON.parse(clampedRow.spec) as { programs: Array<{ intensity: number }> }) : null;
  check("C8 the clamp is stored (the worker never sees 3.3)", clampedSpec?.programs?.[0]?.intensity === 1, JSON.stringify(clampedSpec?.programs));
  const update = await T("design_physics", { name: "E2E Gate Break", programs: JSON.stringify([
    { kind: "KNOCK", intensity: 0.85, beats: [1], target: "E2E Storm Vessel" },
    { kind: "DEBRIS", intensity: 0.7 },
    { kind: "SWAY", intensity: 0.55 },
  ]) });
  check("C9 re-registering updates in place", update.status === "OK" && update.result.includes("updated"), update.result.slice(0, 120));

  // ───────────────────── D. applying physics to a shot ─────────────────────
  const ep = await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Wreckage" });
  check("D1 the episode registers", ep.status === "OK", ep.result.slice(0, 90));
  const scn = await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate courtyard clash", environmentName: null });
  check("D2 the scene registers", scn.status === "OK", scn.result.slice(0, 90));
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Blade Saint Lin clashes with the gate guardian - the E2E Storm Vessel takes the hit and the courtyard scatters", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the quiet after - E2E Blade Saint Lin stands alone", shotType: "MEDIUM", movement: "STATIC" });
  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  check("D3 two shots broke down clean (no grammar, no fx, no physics)", shots.length === 2 && shots.every((s) => !s.physics && !s.fx && !s.grammar), JSON.stringify(shots.map((s) => ({ ph: s.physics, fx: s.fx, g: s.grammar }))));

  const ghostApply = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 1, physics: "E2E Ghost Wreckage" });
  check("D4 an unknown physics name refuses with the registry (built-ins named)", ghostApply.status === "ERROR" && ghostApply.result.includes("No physics program named") && ghostApply.result.includes("'The Clash' (built-in)"), ghostApply.result.slice(0, 220));

  const builtin = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 1, physics: "The Clash" });
  check("D5 a built-in applies by name", builtin.status === "OK" && builtin.result.includes("built-in 'The Clash'") && builtin.result.includes("KNOCK"), builtin.result.slice(0, 200));
  const saved = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 1, physics: "E2E Gate Break" });
  check("D6 the saved preset applies over it", saved.status === "OK" && saved.result.includes("preset 'E2E Gate Break'"), saved.result.slice(0, 180));
  const shot1 = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 1 } });
  const storedPhys = shot1?.physics ? JSON.parse(shot1.physics) : null;
  check("D7 the shot column carries the compiled programs (knock bound to beat 1)", Array.isArray(storedPhys) && storedPhys.length === 3 && JSON.stringify(storedPhys[0].beats) === "[1]" && storedPhys[0].target === "E2E Storm Vessel", JSON.stringify(storedPhys));
  check("D8 the stored intensity survived the serialize round trip", storedPhys?.[0]?.intensity === 0.85, JSON.stringify(storedPhys));

  const inline = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 2, physics: JSON.stringify([{ kind: "SWAY", intensity: 0.5 }]) });
  check("D9 an inline program array applies too", inline.status === "OK" && inline.result.includes("inline programs") && inline.result.includes("SWAY"), inline.result.slice(0, 160));
  const cleared = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 2, physics: "" });
  check("D10 an empty physics clears the shot back to a clean stage", cleared.status === "OK" && cleared.result.includes("Physics cleared"), cleared.result.slice(0, 120));
  const shot2Row = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 2 } });
  check("D11 the cleared column is null again", shot2Row?.physics === null, shot2Row?.physics ?? "null");

  // direct the lens so the beats exist to answer (rule 35 order of operations)
  const gram = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([
    { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.7, note: "push in through the gust" },
    { move: "ORBIT", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", note: "orbit as the clash lands" },
  ]) });
  check("D12 the lens is directed first (2 beats, one wind, one pose pair)", gram.status === "OK" && gram.result.includes("DOLLY_IN 0-50%") && gram.result.includes("ORBIT 50-100%"), gram.result.slice(0, 200));

  // ───────────────────── E. the REAL directed render with physics ─────────────────────
  // the DESIGNED prop the KNOCK targets: registered, then built into a
  // real library .blend, then named in the shot text so it rides
  const regAsset = await T("create_asset", { category: "PROP", name: "E2E Storm Vessel", description: "a heavy bronze storm vessel with a flared rim and lightning runes" });
  check("E0 the prop registers as an asset row", regAsset.status === "OK", regAsset.result.slice(0, 110));
  const builtProp = await T("blender_asset_build", { kind: "PROP", refName: "E2E Storm Vessel", guidance: "a heavy bronze storm vessel, wide body, flared rim, lightning runes" });
  check("E0b the designed prop builds in the real Blender runtime", builtProp.status === "OK" && builtProp.result.includes("DESIGNED prop"), builtProp.result.slice(0, 180));
  const lin = await T("create_character", { name: "E2E Blade Saint Lin", role: "PROTAGONIST", appearance: "a young sword cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade with a jade edge", personality: "stoic" });
  check("E0c the cast registers (the hero gives the knock its direction and the cloth its chains)", lin.status === "OK", lin.result.slice(0, 110));
  if (!shot1) throw new Error("shot 1 missing - cannot continue");
  console.log("   (real directed render follows - the beats land, the world obeys)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("E1 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("E2 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("E3 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as {
      grammar?: { beats?: number; moves?: string[]; windBeats?: number };
      physics?: { programs?: number; kinds?: string[]; boundBeats?: number[]; strikes?: number; bounces?: number; maxSpeed?: number; settleFrame?: number | null; maxSwing?: number; notes?: string[] };
      secondary?: { chains?: number; windBeats?: number[]; maxDeflection?: number };
      propsLoaded?: string[];
    };
    check("E4 the worker state reports the directed beats + the wind", state.grammar?.beats === 2 && state.grammar?.windBeats === 1, JSON.stringify(state.grammar));
    check("E5 the physics state reports all three programs with their kinds", state.physics?.programs === 3 && ["KNOCK", "DEBRIS", "SWAY"].every((k) => state.physics?.kinds?.includes(k)), JSON.stringify(state.physics));
    check("E6 the designed prop actually rode the shot", (state.propsLoaded ?? []).some((n) => n.includes("Storm Vessel")), JSON.stringify(state.propsLoaded));
    check("E7 the knock STRUCK on the bound beat (the wreckage begins where the cut lands)", (state.physics?.strikes ?? 0) >= 2 && state.physics?.boundBeats?.includes(1), JSON.stringify(state.physics));
    check("E8 real ballistics happened (bounces + a body that actually moved)", (state.physics?.bounces ?? 0) >= 1 && (state.physics?.maxSpeed ?? 0) > 2.0, JSON.stringify(state.physics));
    check("E9 the wreckage SETTLED (the world comes to rest - physics truth)", typeof state.physics?.settleFrame === "number" && (state.physics?.settleFrame ?? 0) > 0, JSON.stringify(state.physics));
    check("E10 the lantern swung with the wind call (the cloth's own driver)", (state.physics?.maxSwing ?? 0) > 2.0, JSON.stringify(state.physics));
    check("E11 no honest-skip notes (every program anchored)", (state.physics?.notes ?? []).length === 0, JSON.stringify(state.physics?.notes));
    check("E12 the cloth rode the same beats (one clock, one world)", (state.secondary?.chains ?? 0) >= 10 && (state.secondary?.windBeats ?? []).includes(0), JSON.stringify(state.secondary));
  }

  // the control render: same production, a clean stage (no physics, no grammar)
  const ctrlJob = await createRenderJob(labId, shot2Row!.id, "PREVIEW");
  let ctrlFinal = ctrlJob;
  const ctrlDeadline = Date.now() + 480_000;
  while (ctrlFinal.status === "RENDERING" && Date.now() < ctrlDeadline) {
    await new Promise((r) => setTimeout(r, 4000));
    ctrlFinal = (await tickRenderJob(ctrlJob.id))!;
  }
  if (ctrlFinal.status === "REVIEW") {
    const ctrlStateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${ctrlJob.id}.json`), "utf-8");
    const ctrlState = JSON.parse(ctrlStateRaw) as { physics?: unknown };
    check("E13 the control render's stage stays clean (no physics key in the state)", ctrlState.physics === undefined, JSON.stringify(ctrlState.physics));
  } else {
    check("E13 the control render's stage stays clean (no physics key in the state)", false, `control job ended ${ctrlFinal.status}`);
  }

  // ───────────────────── F. the context line ─────────────────────
  const ctx = await buildCompactContext(labId);
  const designLine = ctx?.design ?? "";
  check("F1 the context design line reports the physics preset", designLine.includes("physics 'E2E Gate Break'"), designLine.slice(0, 340));

  // ───────────────────── G. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "let the world obey" }) });
  check("G1 anonymous direction is 401", anon.status === 401);
  const strangerEmail = `stranger57-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger57", "stranger-pass-57");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-57");
  const strangerPost = await call(strangerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "let the world obey" }) });
  check("G2 a non-member cannot direct the body laws (403)", strangerPost.status === 403);
  const ownerGet = await call(ownerJar, `/api/dsh?projectId=${labId}`);
  check("G3 the OWNER reads the production's direction (bypass intact)", ownerGet.status === 200 && Array.isArray(await ownerGet.json()));
  const ownerRenders = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
  check("G4 the OWNER reads the render standing anywhere (bypass intact)", ownerRenders.status === 200);

  // ───────────────────── H. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  await db.user.delete({ where: { id: stranger.id } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverPresets = await db.designPreset.count({ where: { projectId: labId } });
  check("H1 every throwaway row is gone (cascade holds)", !leftover && leftoverPresets === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("E2E crashed:", e);
    process.exit(1);
  });

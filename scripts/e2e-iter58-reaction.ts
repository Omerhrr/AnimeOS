// Iteration 58 E2E: THE BODY ANSWERS THE WORLD - the REACTION law.
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the four-kind physics vocabulary (physics.ts), the
//      worker's REACTION law in the physics pass (impulse away from
//      the beat's violence, damped spring, dip, buckle, settle, the
//      published stagger), the bridge's frame order (the body moves
//      BEFORE the cloth reads the stagger - same frame, never late),
//      the state's reaction evidence, the doctrine (THE BODY ANSWERS
//      THE WORLD + rule 36), the built-ins (The Clash staggers now,
//      The Recoil joins)
//   B. accounts + throwaway production
//   C. the registry: a REACTION-carrying preset + honest refusals
//      (target on REACTION, unknown kind naming the new vocabulary)
//   D. applying: The Recoil built-in, the saved preset, inline
//      REACTION, clear
//   E. a REAL directed render: the KNOCK sends the designed prop
//      flying and the REACTION staggers the hero ON THE SAME BEAT -
//      the state reports the staggers fired, the max offset, the max
//      lean, the recover frame; the cloth rides the same clock; a
//      control render whose stage stays clean
//   F. the context line reports the preset
//   G. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   H. cleanup (exact rows)
// Run: npx tsx scripts/e2e-iter58-reaction.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter58-body-answer";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter58" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter58" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter58", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter58" },
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
  console.log("== Iteration 58: the body answers the world - the REACTION law ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const physics = readFileSync("src/lib/animation/physics.ts", "utf8");
  check("A1 the vocabulary grew to the four body laws (REACTION joins)", physics.includes('PHYSICS_KINDS = ["KNOCK", "DEBRIS", "SWAY", "REACTION"]'));
  check("A2 the compiler still clamps intensity and refuses non-numbers", physics.includes("intensity = clamp01(v);") && physics.includes("intensity must be a number 0..1"));
  check("A3 only KNOCK takes a target (the body staggers on its own law)", physics.includes("only KNOCK takes a target") && physics.includes("the body staggers on its own law"));
  check("A4 the header teaches the REACTION law (Newton's third law + the cloth whip)", physics.includes("THE BODY ANSWERS THE WORLD (iteration 58, probed)") && physics.includes("Newton's third law") && physics.includes("CLOTH whips"));

  const builtIns = physics.match(/export const BUILT_IN_PHYSICS[\s\S]*?];/)?.[0] ?? "";
  const clashBlock = builtIns.slice(Math.max(0, builtIns.indexOf('name: "The Clash"')), Math.max(0, builtIns.indexOf('name: "The Ruin"')));
  check("A5 The Clash now staggers too (the shockwave answers the body)", builtIns.includes('name: "The Clash"') && clashBlock.includes('kind: "REACTION"'), clashBlock.slice(0, 160));
  check("A6 The Recoil joins the built-in wreckage language", builtIns.includes('name: "The Recoil"') && builtIns.split("REACTION").length >= 3, builtIns.slice(-420));

  const physPass = readFileSync("bridges/blender/physics_pass.py", "utf8");
  check("A7 the pass performs exactly the four body laws", physPass.includes('PHYSICS_KINDS = ("KNOCK", "DEBRIS", "SWAY", "REACTION")'));
  check("A8 the probed stagger constants are law", physPass.includes("REACTION_STIFFNESS = 46.0") && physPass.includes("REACTION_DAMPING = 8.5") && physPass.includes("REACTION_SETTLE_X = 0.006") && physPass.includes("REACTION_LEAN_MAX = 6.5"));
  check("A9 the recoil points AWAY from the beat's violence (Newton's third law)", physPass.includes("recoil AWAY from where the hit came") && physPass.includes("ux * 0.65 + dx * 0.35"));
  check("A10 the body lurches, dips and buckles (root offset + dip + spine/head lean)", physPass.includes("the body sinks into the stagger") && physPass.includes('r["spine"].rotation_euler.x +=') && physPass.includes('r["head"].rotation_euler.x +='));
  check("A11 the stagger settles to REST and stamps the LAST rest honestly", physPass.includes("the LAST rest is the honest one") && physPass.includes('r["recover_frame"] = None  # a re-stagger forgets the earlier rest'));
  check("A12 the stagger is published for the cloth (the same-frame whip hook)", physPass.includes('r["figure"]["_stagger"] = {"vx": v[0], "vy": v[1], "jerk": jerk}'));
  check("A13 two REACTION programs merge into one body law (the figure has one body)", physPass.includes("merged into one body law - the figure has one body") && physPass.includes('rig.pop("reaction_progs", [])'));
  check("A14 no figure on the stage: the reaction skips honestly", physPass.includes("REACTION: no figure stands on the stage - skipped honestly"));
  check("A15 the wind has no force on the body law (the cloth answers the air)", physPass.includes("the wind has NO force here: the cloth answers the air, the body"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  const physCall = bridge.indexOf("physics_pass.apply_physics(phys_rig");
  const secCall = bridge.indexOf("apply_secondary_motion(figure, sec_chains");
  check("A16 the frame order is law: the body moves BEFORE the cloth reads the stagger", physCall > 0 && secCall > 0 && physCall < secCall, `phys@${physCall} sec@${secCall}`);
  check("A17 the cloth answers the body (the stagger whip feeds the chains)", bridge.includes("THE CLOTH ANSWERS THE BODY") && bridge.includes('figure.get("_stagger")') && bridge.includes("jerk_kick * ch[\"gain\"]"));
  check("A18 the worker state reports the reaction evidence (staggers, offset, lean, recover)", bridge.includes('prep["reaction"] = {') && bridge.includes('"reactions": phys_rig.get("reactions", 0)') && bridge.includes('"maxOffset": round(phys_rig.get("max_offset", 0.0), 3)') && bridge.includes('"recoverFrame": r["recover_frame"]'));
  check("A19 the beat context still lands once per frame (fx AND physics share the clock)", bridge.includes("fbi, fwind, fx_vel = -1, 0.0, 0.0"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A20 the registry stands at 74 tools (the body law rides the physics pair)", toolCount === 74, `count=${toolCount}`);
  check("A21 design_physics teaches the REACTION kind (merge + cloth whip)", tools.includes("REACTION (THE BODY ANSWERS THE WORLD") && tools.includes("multiple REACTION programs merge into one body law"));
  check("A22 set_shot_physics names The Recoil and the stagger", tools.includes("The Shove, The Recoil") && tools.includes("a REACTION staggers the FIGURE itself"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A23 the curriculum grew THE BODY ANSWERS THE WORLD", prompts.includes("- THE BODY ANSWERS THE WORLD") && prompts.includes("A blast that scatters the props while the hero stands statue-still is a lie the audience feels"));
  check("A24 rule 36 teaches the paired cause and effect", prompts.includes("36. THE BODY ANSWERS THE VIOLENCE") && prompts.includes("so the recoil and the wreckage land on the SAME beat"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter58 Body Answer Lab ${MARK}`, logline: "a throwaway production for the body's answer proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway reaction lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the registry ─────────────────────
  const bodyLaw = await T("design_physics", { name: "E2E Body Law", programs: JSON.stringify([
    { kind: "KNOCK", intensity: 0.85, beats: [1], target: "E2E Storm Vessel", note: "the blast sends the vessel flying" },
    { kind: "REACTION", intensity: 0.8, beats: [1], note: "the hero staggers from the blast - same beat, cause and effect" },
  ]) });
  check("C1 a paired law registers (KNOCK + REACTION on the SAME beat)", bodyLaw.status === "OK" && bodyLaw.result.includes("registered") && bodyLaw.result.includes("REACTION@1"), bodyLaw.result.slice(0, 220));
  const bodyRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "PHYSICS", name: "E2E Body Law" } } });
  const bodySpec = bodyRow ? (JSON.parse(bodyRow.spec) as { programs: Array<{ kind: string; beats: unknown }> }) : null;
  check("C2 the stored programs pair the strike and the stagger on beat 1", bodySpec?.programs?.length === 2 && JSON.stringify(bodySpec.programs[1].beats) === "[1]", JSON.stringify(bodySpec?.programs));

  const ghostKind = await T("design_physics", { name: "E2E Explosion", programs: JSON.stringify([{ kind: "EXPLOSION" }]) });
  check("C3 an unknown kind refuses and names the FOUR-kind vocabulary", ghostKind.status === "ERROR" && ghostKind.result.includes('unknown kind "EXPLOSION"') && ghostKind.result.includes("KNOCK, DEBRIS, SWAY, REACTION"), ghostKind.result.slice(0, 170));
  const badTarget = await T("design_physics", { name: "E2E Targeted Stagger", programs: JSON.stringify([{ kind: "REACTION", target: "hero" }]) });
  check("C4 a target on REACTION refuses (the body staggers on its own law)", badTarget.status === "ERROR" && badTarget.result.includes("only KNOCK takes a target"), badTarget.result.slice(0, 170));
  const badInt = await T("design_physics", { name: "E2E Bad Intensity", programs: JSON.stringify([{ kind: "REACTION", intensity: "hard" }]) });
  check("C5 a non-numeric intensity refuses", badInt.status === "ERROR" && badInt.result.includes("intensity must be a number 0..1"), badInt.result.slice(0, 140));

  // ───────────────────── D. applying the body law ─────────────────────
  const ep = await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Recoil" });
  check("D1 the episode registers", ep.status === "OK", ep.result.slice(0, 90));
  const scn = await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate blast stagger", environmentName: null });
  check("D2 the scene registers", scn.status === "OK", scn.result.slice(0, 90));
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Blade Saint Lin holds the gate as the blast lands - the E2E Storm Vessel takes the hit and Lin staggers with it", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the quiet after - E2E Blade Saint Lin stands alone", shotType: "MEDIUM", movement: "STATIC" });
  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  check("D3 two shots broke down clean (no grammar, no fx, no physics)", shots.length === 2 && shots.every((s) => !s.physics && !s.fx && !s.grammar), JSON.stringify(shots.map((s) => ({ ph: s.physics, fx: s.fx, g: s.grammar }))));

  const recoil = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 2, physics: "The Recoil" });
  check("D4 The Recoil applies by name (a pure REACTION law)", recoil.status === "OK" && recoil.result.includes("built-in 'The Recoil'") && recoil.result.includes("REACTION"), recoil.result.slice(0, 200));
  const saved = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 1, physics: "E2E Body Law" });
  check("D5 the saved paired preset applies over it", saved.status === "OK" && saved.result.includes("preset 'E2E Body Law'"), saved.result.slice(0, 180));
  const shot1 = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 1 } });
  const storedPhys = shot1?.physics ? JSON.parse(shot1.physics) : null;
  check("D6 the shot column carries the paired programs bound to beat 1", Array.isArray(storedPhys) && storedPhys.length === 2 && storedPhys[0].kind === "KNOCK" && storedPhys[1].kind === "REACTION" && JSON.stringify(storedPhys[1].beats) === "[1]", JSON.stringify(storedPhys));
  const inline = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 2, physics: JSON.stringify([{ kind: "REACTION", intensity: 0.5, beats: [0] }]) });
  check("D7 an inline REACTION applies too", inline.status === "OK" && inline.result.includes("inline programs") && inline.result.includes("REACTION"), inline.result.slice(0, 160));
  const cleared = await T("set_shot_physics", { sceneNumber: 1, shotNumber: 2, physics: "" });
  check("D8 an empty physics clears the shot back to a clean stage", cleared.status === "OK" && cleared.result.includes("Physics cleared"), cleared.result.slice(0, 120));
  const shot2Row = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 2 } });
  check("D9 the cleared column is null again", shot2Row?.physics === null, shot2Row?.physics ?? "null");

  // direct the lens so the beats exist to answer (the doctrine's order)
  const gram = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([
    { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.7, note: "push in through the gust" },
    { move: "ORBIT", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", note: "orbit as the blast lands" },
  ]) });
  check("D10 the lens is directed first (2 beats, one wind, one pose pair)", gram.status === "OK" && gram.result.includes("DOLLY_IN 0-50%") && gram.result.includes("ORBIT 50-100%"), gram.result.slice(0, 200));

  // ───────────────────── E. the REAL directed render: the body answers ─────────────────────
  const regAsset = await T("create_asset", { category: "PROP", name: "E2E Storm Vessel", description: "a heavy bronze storm vessel with a flared rim and lightning runes" });
  check("E0 the prop registers as an asset row", regAsset.status === "OK", regAsset.result.slice(0, 110));
  const builtProp = await T("blender_asset_build", { kind: "PROP", refName: "E2E Storm Vessel", guidance: "a heavy bronze storm vessel, wide body, flared rim, lightning runes" });
  check("E0b the designed prop builds in the real Blender runtime", builtProp.status === "OK" && builtProp.result.includes("DESIGNED prop"), builtProp.result.slice(0, 180));
  const lin = await T("create_character", { name: "E2E Blade Saint Lin", role: "PROTAGONIST", appearance: "a young sword cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade with a jade edge", personality: "stoic" });
  check("E0c the cast registers (the hero gives the stagger its body and the cloth its chains)", lin.status === "OK", lin.result.slice(0, 110));
  if (!shot1) throw new Error("shot 1 missing - cannot continue");
  console.log("   (real directed render follows - the blast lands, the body answers)");
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
      physics?: {
        programs?: number; kinds?: string[]; boundBeats?: number[]; strikes?: number; bounces?: number;
        maxSpeed?: number; settleFrame?: number | null; maxSwing?: number; notes?: string[];
        reaction?: { reactions?: number; maxOffset?: number; maxLean?: number; recoverFrame?: number | null; boundBeats?: number[] };
      };
      secondary?: { chains?: number; windBeats?: number[]; maxDeflection?: number };
      propsLoaded?: string[];
    };
    check("E4 the worker state reports the directed beats + the wind", state.grammar?.beats === 2 && state.grammar?.windBeats === 1, JSON.stringify(state.grammar));
    check("E5 the physics state carries the REACTION kind", (state.physics?.kinds ?? []).includes("REACTION"), JSON.stringify(state.physics));
    check("E6 the reaction FIRED on its bound beat (the stagger lands where the cut lands)", (state.physics?.reaction?.reactions ?? 0) >= 1 && (state.physics?.reaction?.boundBeats ?? []).includes(1), JSON.stringify(state.physics?.reaction));
    check("E7 the body actually LEFT ITS MARK (a real stagger offset)", (state.physics?.reaction?.maxOffset ?? 0) > 0.01, JSON.stringify(state.physics?.reaction));
    check("E8 the body BUCKLED (a real lean: spine folds, head lags)", (state.physics?.reaction?.maxLean ?? 0) > 0.5, JSON.stringify(state.physics?.reaction));
    check("E9 the body came back to rest (the recover frame is stamped)", typeof state.physics?.reaction?.recoverFrame === "number" && (state.physics?.reaction?.recoverFrame ?? 0) > 0, JSON.stringify(state.physics?.reaction));
    check("E10 the strike and the stagger landed on the SAME beat (cause and effect)", (state.physics?.strikes ?? 0) >= 1 && (state.physics?.boundBeats ?? []).length === 1 && (state.physics?.reaction?.boundBeats ?? []).join() === (state.physics?.boundBeats ?? []).join(), JSON.stringify(state.physics));
    check("E11 no honest-skip notes (every program anchored)", (state.physics?.notes ?? []).length === 0, JSON.stringify(state.physics?.notes));
    check("E12 the cloth rode the same clock (chains + the wind beat)", (state.secondary?.chains ?? 0) >= 10 && (state.secondary?.windBeats ?? []).includes(0), JSON.stringify(state.secondary));
    check("E13 the cloth actually moved (the whip has room to read)", (state.secondary?.maxDeflection ?? 0) > 5.0, JSON.stringify(state.secondary));
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
    check("E14 the control render's stage stays clean (no physics key in the state)", ctrlState.physics === undefined, JSON.stringify(ctrlState.physics));
  } else {
    check("E14 the control render's stage stays clean (no physics key in the state)", false, `control job ended ${ctrlFinal.status}`);
  }

  // ───────────────────── F. the context line ─────────────────────
  const ctx = await buildCompactContext(labId);
  const designLine = ctx?.design ?? "";
  check("F1 the context design line reports the body law", designLine.includes("physics 'E2E Body Law'"), designLine.slice(0, 340));

  // ───────────────────── G. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "the body answers" }) });
  check("G1 anonymous direction is 401", anon.status === 401);
  const strangerEmail = `stranger58-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger58", "stranger-pass-58");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-58");
  const strangerPost = await call(strangerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "the body answers" }) });
  check("G2 a non-member cannot direct the body law (403)", strangerPost.status === 403);
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

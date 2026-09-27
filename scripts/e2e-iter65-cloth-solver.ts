// Iteration 65 E2E: THE CLOTH IS SOLVED - solver-grade cloth riding the
// directed beats. Proves, against the RUNNING studio, the REAL database
// and the REAL Blender runtime:
//   A. source: the cloth pass (the probe's law - the pin convention, the
//      anchor armature, the stack order, the kind tuning), the bridge
//      integration (build, the frame order, the state contract, the
//      honest fallbacks), the doctrine (THE CLOTH IS SOLVED + rule 43),
//      and the registry (still 80 tools)
//   B. the probe: the REAL Blender solver probe re-run (pin convention,
//      storm vs calm, folds, bit-exact determinism, timing)
//   C. accounts + throwaway production
//   D. a REAL directed render: the storm grammar's wind call drives the
//      solver - the state names the simmed parts, the springs that kept
//      the hair, and the anchor sway the air actually called for; a
//      control render's calm stage keeps its springs honest
//   E. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   F. cleanup (exact rows)
// Run: npx tsx scripts/e2e-iter65-cloth-solver.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { runtimeBlenderBin } from "../src/lib/blender/runtime";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter65-cloth-solver";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter65" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter65" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter65", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter65" },
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

function runProbe(blender: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(blender, ["-b", "-P", "tmp/cloth_probe.py"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("error", reject);
    child.on("close", () => resolve(out));
  });
}

async function main() {
  console.log("== Iteration 65: the cloth is solved - solver-grade cloth riding the beats ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const pass = readFileSync("bridges/blender/cloth_pass.py", "utf8");
  check("A1 the pass teaches the probed law (weight 1 pins, the anchor armature)", pass.includes("weight 1 pins - probed law") && pass.includes("one-bone") && pass.includes("AirArm_"));
  check("A2 only cloth rides the solver (hair keeps the springs)", pass.includes('CLOTH_KINDS = ("CLOTH", "SKIRT")') && !pass.includes('"HAIR"'), pass.split("\n")[0] ?? "");
  check("A3 the probed anchor constants are law", pass.includes("ANCHOR_MAX = 0.85") && pass.includes("KICK_IMPULSE = 1.2") && pass.includes("STAGGER_ANGLE = 0.45"));
  check("A4 the stack order is Armature -> Subsurf -> Cloth", pass.indexOf('"AirAnchor", "ARMATURE"') < pass.indexOf('"Subd", "SUBSURF"') && pass.indexOf('"Subd", "SUBSURF"') < pass.indexOf('"Cloth", "CLOTH"'));
  check("A5 the pin and deform groups pin the same band (weight 1)", pass.includes('pin.add([v.index], 1.0, "REPLACE")') && pass.includes('air.add([v.index], 1.0, "REPLACE")') && pass.includes('st.vertex_group_mass = "Pin"'));
  check("A6 honest refusals keep the spring (coarse geometry, no height, already solved)", pass.includes("too coarse to solve") && pass.includes("has no height to pin") && pass.includes("already carries a solver"));
  check("A7 the air model is the springs' own (the wind call, the drive, the stagger)", pass.includes("drive = (wind * 1.45 + agit * 0.45 + 0.12) * intensity") && pass.includes("figure.get(\"_stagger\")") && pass.includes("STAGGER_ANGLE * gain"));
  check("A8 the anchors are deterministic (explicit matrices about the hang point)", pass.includes("Matrix.Rotation(ax, 4, \"X\") @ Matrix.Rotation(ay, 4, \"Y\")") && pass.includes("to_h.inverted()"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  const buildCall = bridge.indexOf("cloth_pass.build_cloth_rig(bpy, scn, figure, sec_chains, frames_total)");
  const frameCall = bridge.indexOf("cloth_pass.apply_cloth_frame(cloth_rig, figure, t_sec");
  const physCall = bridge.indexOf("physics_pass.apply_physics(phys_rig");
  const secCall = bridge.indexOf("apply_secondary_motion(figure, sec_chains");
  check("A9 the bridge builds the solver rig after the spring rig", buildCall > 0 && bridge.indexOf("import cloth_pass") > 0, `build@${buildCall}`);
  check("A10 the frame order is law: physics, then the springs, then the solver's anchors", physCall > 0 && secCall > physCall && frameCall > secCall, `phys@${physCall} sec@${secCall} cloth@${frameCall}`);
  check("A11 simmed chains skip their springs (one part, one law)", bridge.includes('if ch.get("sim"):') && bridge.includes("this part rides the real cloth solver now"));
  check("A12 the springs publish the kick the solver's anchors answer", bridge.includes('st["last_kick"] = kick'));
  check("A13 the state names what ran (simmed, springs, maxAnchorSway, notes)", bridge.includes('"cloth": "blender-cloth-sim"') && bridge.includes('"hair": "damped-spring"') && bridge.includes('sol["maxAnchorSway"]'));
  check("A14 the solver report rides the secondary evidence honestly", bridge.includes("anchor sway the air called for") && bridge.includes("a fallback names its springs"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A15 the registry stands at 81 tools (the solver extends the render, it adds no tool)", toolCount === 81, `count=${toolCount}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A16 the curriculum grew THE CLOTH IS SOLVED", prompts.includes("- THE CLOTH IS SOLVED") && prompts.includes("a robe that answers nothing is a costume"));
  check("A17 rule 43 teaches the solver read-back", prompts.includes("43. THE CLOTH IS SOLVED") && prompts.includes("read the render's secondary.solver line"));

  // ───────────────────── B. the REAL Blender probe re-run ─────────────────────
  const blender = runtimeBlenderBin();
  if (blender && fs.existsSync("tmp/cloth_probe.py")) {
    const out = await runProbe(blender);
    const resultLine = out.split("\n").find((l) => l.startsWith("PROBE-RESULT "));
    if (resultLine) {
      const probe = JSON.parse(resultLine.slice("PROBE-RESULT ".length)) as Record<string, unknown> & { failures?: string[] };
      check("B1 the probe proves the pin convention (weight 1 holds, weight 0 falls)", probe.endDropWeight1 === 0 && (probe.endDropWeight0 as number) > 0.01, JSON.stringify(probe).slice(0, 200));
      check("B2 the probe proves the storm is visible cloth motion", (probe.stormTipX as number) > (probe.calmTipX as number) * 4 && (probe.stormTipX as number) > 0.02, `calm=${probe.calmTipX} storm=${probe.stormTipX}`);
      check("B3 the probe proves real folds (pairwise distances change)", (probe.pairDistSpan as number) > 0.002, `span=${probe.pairDistSpan}`);
      check("B4 the probe proves bit-exact determinism across rebuilds", probe.determinismDrift === 0, `drift=${probe.determinismDrift}`);
      check("B5 the probe proves the sim fits the render budget", (probe.secondsPerFrame as number) < 0.05, `${probe.secondsPerFrame}s/frame`);
    } else {
      check("B1 the probe ran and reported", false, out.slice(-300));
    }
  } else {
    console.log("SKIP B1-B5 (probe or blender missing)");
  }

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter65 Cloth Solver Lab ${MARK}`, logline: "a throwaway production for the solver-grade cloth proof", visualStyle: "DONGHUA" }, ownerUser);
  check("C2 the throwaway cloth lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the REAL directed render: the storm solves ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Storm" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Gate storm", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Storm Saint Yun stands on the gate as the storm lands - robes and sash torn by the wind", shotType: "WIDE", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the calm after - E2E Storm Saint Yun stands alone in still air", shotType: "MEDIUM", movement: "STATIC" });
  const lin = await T("create_character", { name: "E2E Storm Saint Yun", role: "PROTAGONIST", appearance: "an elder sword cultivator with a flowing beard and a topknot, storm-grey layered robes with a long wind-torn sash, obsidian blade", personality: "stoic" });
  check("D1 the cast registers (the elder gives the cloth its 13 parts and the hair its springs)", lin.status === "OK", lin.result.slice(0, 110));
  const gram = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([
    { move: "DOLLY_IN", from: 0, to: 0.5, wind: 0.95, note: "the storm hits on the push" },
    { move: "ORBIT", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", wind: 0.4, note: "the gust holds through the orbit" },
  ]) });
  check("D2 the storm grammar is directed (two beats, both wind calls)", gram.status === "OK" && gram.result.includes("DOLLY_IN 0-50%") && gram.result.includes("ORBIT 50-100%"), gram.result.slice(0, 200));

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const shot1 = shots.find((s) => s.number === 1);
  const shot2Row = shots.find((s) => s.number === 2);
  if (!shot1 || !shot2Row) throw new Error("shots missing - cannot continue");

  console.log("   (real directed render follows - the storm hits, the solver answers)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("D3 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("D4 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("D5 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as {
      grammar?: { beats?: number; windBeats?: number };
      secondary?: {
        chains?: number; cloth?: number; hair?: number; windBeats?: number[]; maxDeflection?: number;
        solver?: { cloth?: string; hair?: string; simmed?: string[]; springs?: string[]; maxAnchorSway?: number; notes?: string[] };
      };
    };
    check("D6 the worker state reports the directed beats + both wind calls", state.grammar?.beats === 2 && state.grammar?.windBeats === 2, JSON.stringify(state.grammar));
    check("D7 the secondary rig chained the cloth AND the hair", (state.secondary?.chains ?? 0) >= 15 && (state.secondary?.cloth ?? 0) >= 10 && (state.secondary?.hair ?? 0) >= 1, JSON.stringify({ c: state.secondary?.chains, cl: state.secondary?.cloth, h: state.secondary?.hair }));
    const solver = state.secondary?.solver;
    check("D8 the solver line exists and names the real cloth sim", solver?.cloth === "blender-cloth-sim" && solver?.hair === "damped-spring", JSON.stringify(solver));
    check("D9 all thirteen cloth parts ride the solver (sash, 2 sleeves, 2 cuffs, 8 panels)", (solver?.simmed ?? []).length === 13 && (solver?.simmed ?? []).includes("SashTail") && (solver?.simmed ?? []).includes("SkirtPanel0") && (solver?.simmed ?? []).includes("LCuff"), JSON.stringify(solver?.simmed));
    check("D10 the hair kept its springs (the honest division of labor)", (solver?.springs ?? []).length >= 1 && (solver?.springs ?? []).includes("HairBack"), JSON.stringify(solver?.springs));
    check("D11 the air actually called the anchors (a real maxAnchorSway)", (solver?.maxAnchorSway ?? 0) > 1.0, `sway=${solver?.maxAnchorSway}deg`);
    check("D12 the wind beats landed where the grammar called them", (state.secondary?.windBeats ?? []).includes(0), JSON.stringify(state.secondary?.windBeats));
    check("D13 the springs still moved the hair (the whip has room to read)", (state.secondary?.maxDeflection ?? 0) > 0.5, JSON.stringify(state.secondary?.maxDeflection));
    check("D14 no fallback notes (every cloth part qualified)", (solver?.notes ?? []).length === 0, JSON.stringify(solver?.notes));
  }

  // the control render: the calm stage - still solved, honestly quiet
  const ctrlJob = await createRenderJob(labId, shot2Row.id, "PREVIEW");
  let ctrlFinal = ctrlJob;
  const ctrlDeadline = Date.now() + 480_000;
  while (ctrlFinal.status === "RENDERING" && Date.now() < ctrlDeadline) {
    await new Promise((r) => setTimeout(r, 4000));
    ctrlFinal = (await tickRenderJob(ctrlJob.id))!;
  }
  check("D15 the calm control renders too", ctrlFinal.status === "REVIEW" && Boolean(ctrlFinal.outputUrl), `control ended ${ctrlFinal.status}`);
  if (ctrlFinal.status === "REVIEW") {
    const ctrlStateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${ctrlJob.id}.json`), "utf-8");
    const ctrlState = JSON.parse(ctrlStateRaw) as {
      secondary?: { solver?: { cloth?: string; simmed?: string[]; maxAnchorSway?: number }; windBeats?: number[] };
      grammar?: unknown;
    };
    check("D16 the calm stage is still solved (the solver is always on)", ctrlState.secondary?.solver?.cloth === "blender-cloth-sim" && (ctrlState.secondary?.solver?.simmed ?? []).length === 13, JSON.stringify(ctrlState.secondary?.solver));
    check("D17 the calm stage called no wind beats (honest stillness)", (ctrlState.secondary?.windBeats ?? []).length === 0, JSON.stringify(ctrlState.secondary?.windBeats));
    check("D18 the calm stage carries no grammar", ctrlState.grammar === undefined, JSON.stringify(ctrlState.grammar));
  }

  // ───────────────────── E. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "solve the cloth" }) });
  check("E1 anonymous direction is 401", anon.status === 401);
  const viewerLogin = await register("reader@studio.dev", "Silent Reader", "viewing123");
  check("E2 the seeded reader holds VIEWER", viewerLogin.role === "VIEWER");
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  const viewerPost = await call(viewerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "solve the cloth" }) });
  check("E3 a VIEWER cannot direct the solver (403)", viewerPost.status === 403);
  const ownerRenders = await call(ownerJar, `/api/render-jobs?projectId=${labId}`);
  check("E4 the OWNER reads the render standing anywhere (bypass intact)", ownerRenders.status === 200);

  // ───────────────────── F. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverJobs = await db.renderJob.count({ where: { projectId: labId } });
  check("F1 every throwaway row is gone (cascade holds)", !leftover && leftoverJobs === 0);
  // the job files and clips go with them
  for (const jid of [job.id, ctrlJob.id]) {
    for (const p of [
      path.join(process.cwd(), "public", "renders", `.job-${jid}.json`),
      path.join(process.cwd(), "public", "renders", "cuts", `${jid}.mp4`),
      path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4"),
      path.join(process.cwd(), "public", ctrlFinal.outputUrl ?? "/x.mp4"),
    ]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
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

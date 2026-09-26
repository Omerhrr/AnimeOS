// Iteration 56 E2E: THE BEATS IGNITE - named FX programs riding the
// grammar beats. Proves, against the RUNNING studio, the REAL database
// and the REAL Blender runtime:
//   A. source: the fx vocabulary + compiler (fx.ts), the worker's fx
//      pass (normalize, build, per-frame apply, honest skips, seed
//      law), the two fx tools (registry 72), doctrine (THE BEATS
//      IGNITE + rule 34), the schema's fx column + FX preset kind,
//      the payload injection, the render view's fx chips
//   B. accounts + throwaway production
//   C. the fx registry: design_fx programs + honest refusals
//      (unknown kind, bad hex, non-numeric intensity, empty)
//   D. set_shot_fx: built-in by name, saved preset, inline, unknown
//      refusal, clear - the shot column carries the compiled programs
//   E. a REAL directed render with fx: the worker state reports the
//      programs, the kinds, the burst that fired on the bound beat,
//      the trail's peak glow and the widest ring - plus a control
//      render whose stage stays clean (no fx key in the state)
//   F. the context line reports the fx preset
//   G. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   H. cleanup (exact rows)
// Run: npx tsx scripts/e2e-iter56-fx.ts   (or bun)
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter56-beats-ignite";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter56" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter56" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter56", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter56" },
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
  console.log("== Iteration 56: the beats ignite - named FX riding the grammar ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const fx = readFileSync("src/lib/animation/fx.ts", "utf8");
  check("A1 the fx vocabulary is exactly the four kinds the worker performs", fx.includes('FX_KINDS = ["TRAIL", "BURST", "AURA", "MOTES"]'));
  check("A2 the compiler clamps intensity and refuses non-numbers", fx.includes("intensity = clamp01(v);") && fx.includes("intensity must be a number 0..1"));
  check("A3 a color the worker cannot parse is refused at design time", fx.includes("color must be a hex RGB like #7dd3fc"));
  check("A4 beat bindings are ALL or bounded indices", fx.includes('beats must be "ALL" or an array of 0-based grammar beat indices') && fx.includes("n > 11"));
  check("A5 the built-in spectacle language ships four named programs", fx.includes('name: "The Slash"') && fx.includes('name: "Cultivator\'s Aura"') && fx.includes('name: "The Aftermath"') && fx.includes('name: "Storm Break"'));
  check("A6 the column round-trips (serialize + honest parse)", fx.includes("export function serializeFx") && fx.includes("export function parseStoredFx"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A7 the worker imports the fx pass and normalizes honestly", bridge.includes("import fx_pass") && bridge.includes("fx_pass.normalize_fx(fx_raw, len(grammar) if grammar else 1)"));
  check("A8 the frame loop drives the fx AFTER the pose and the springs", /apply_secondary_motion\(figure, sec_chains, grammar, shot,\n\s+t, t_sec, 1\.0 \/ fps, pose_s, pose_e, pose_t\)\n\s+# v8\.0: THE WORLD ANSWERS THE BEATS/.test(bridge));
  check("A9 the pose velocity mirrors the springs' own drag measure", bridge.includes("fx_vel = sum(abs(fx_row[i] - fx_rig[\"prev_row\"][i]) for i in range(12)) * fps"));
  check("A10 the state reports the evidence (fired bursts, trail peak, max ring)", bridge.includes('frep["burstsFired"] = fx_rig["fired"]') && bridge.includes('frep["trailPeak"] = round(fx_rig["trail_peak"], 1)') && bridge.includes('frep["maxRing"] = round(fx_rig["max_ring"], 2)'));

  const fxPass = readFileSync("bridges/blender/fx_pass.py", "utf8");
  check("A11 the pass performs exactly the four kinds", fxPass.includes('FX_KINDS = ("TRAIL", "BURST", "AURA", "MOTES")'));
  check("A12 the burst lands where the cut lands (fires on entering a bound beat)", fxPass.includes("if beat_idx in b[\"bound\"]:") && fxPass.includes("rig[\"fired\"] += 1"));
  check("A13 the aura breathes with the wind call the cloth hangs from", fxPass.includes("breathe = 1.0 + 0.14 * math.sin(t_sec * 1.35 + a[\"phase\"]) + wind * 0.45"));
  check("A14 a program that cannot anchor is skipped with an honest note", fxPass.includes('notes.append("TRAIL: no blade or hand to ride - skipped honestly")') && fxPass.includes("every beat binding lies beyond the grammar's"));
  check("A15 the seed law holds (deterministic scatter per job + program)", fxPass.includes("rng = mulberry32(fnv1a(str(job_id)) ^ (0xF10 + pi))"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A16 the registry grew to 72 tools (design_fx 71, set_shot_fx 72)", toolCount === 72, `count=${toolCount}`);
  check("A17 the fx resolution order is saved -> built-in -> inline", tools.includes("// resolve: saved FX preset -> built-in -> inline programs"));
  check("A18 set_shot_fx teaches the order of operations (lens first)", tools.includes("direct the lens first (set_shot_grammar) so the beats have something to answer"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A19 the shot column carries the fx programs", schema.includes("fx          String?  // JSON: Array<{ kind, color?, intensity?, beats?, note? }>"));
  check("A20 the preset registry names the FX kind", schema.includes("GRAMMAR | SEQUENCE | SCULPT | FX"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A21 the curriculum grew THE BEATS IGNITE", prompts.includes("- THE BEATS IGNITE") && prompts.includes("spectacle without the grammar's clock is a screensaver"));
  check("A22 rule 34 teaches the directed spectacle + the evidence read", prompts.includes("34. CALL THE WORLD ONTO THE BEATS") && prompts.includes("Never promise spectacle a render's worker state did not report"));

  const render = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A23 the payload carries the shot's fx (corrupt column degrades clean)", render.includes("the worker compiles them into real emissive geometry that") && render.includes("Array.isArray(fx) && fx.length > 0 ? { fx } : {}"));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A24 the job card flags the fx programs (amber chips)", renderView.includes("DIRECTED FX chips: the effect programs answering the beats") && renderView.includes("bg-amber-400/10 border-amber-400/40 text-amber-300"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter56 Beats Ignite Lab ${MARK}`, logline: "a throwaway production for the directed fx proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway fx lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the fx registry ─────────────────────
  const slash = await T("design_fx", { name: "E2E Crimson Slash", programs: JSON.stringify([
    { kind: "TRAIL", intensity: 0.9, note: "the blade draws a crimson ribbon" },
    { kind: "BURST", color: "#f97316", beats: [1], intensity: 0.8, note: "the cut lands at the second beat" },
  ]) });
  check("C1 a named fx program registers with its bound burst", slash.status === "OK" && slash.result.includes("registered") && slash.result.includes("BURST@1 #f97316"), slash.result.slice(0, 220));
  const slashRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "FX", name: "E2E Crimson Slash" } } });
  const slashSpec = slashRow ? (JSON.parse(slashRow.spec) as { programs: Array<{ kind: string; color: string | null; beats: unknown }> }) : null;
  check("C2 the stored programs carry kind, color and the beat binding", slashSpec?.programs?.length === 2 && slashSpec.programs[1].color === "#f97316" && JSON.stringify(slashSpec.programs[1].beats) === "[1]", JSON.stringify(slashSpec?.programs));

  const ghostKind = await T("design_fx", { name: "E2E Sparks", programs: JSON.stringify([{ kind: "SPARKS" }]) });
  check("C3 an unknown kind refuses with the vocabulary", ghostKind.status === "ERROR" && ghostKind.result.includes('unknown kind "SPARKS"') && ghostKind.result.includes("TRAIL, BURST, AURA, MOTES"), ghostKind.result.slice(0, 160));
  const badHex = await T("design_fx", { name: "E2E Bad Hex", programs: JSON.stringify([{ kind: "AURA", color: "crimson" }]) });
  check("C4 a non-hex color refuses at design time", badHex.status === "ERROR" && badHex.result.includes("color must be a hex RGB"), badHex.result.slice(0, 160));
  const badInt = await T("design_fx", { name: "E2E Bad Intensity", programs: JSON.stringify([{ kind: "TRAIL", intensity: "blazing" }]) });
  check("C5 a non-numeric intensity refuses", badInt.status === "ERROR" && badInt.result.includes("intensity must be a number 0..1"), badInt.result.slice(0, 140));
  const emptyFx = await T("design_fx", { name: "E2E Empty", programs: "[]" });
  check("C6 an empty program refuses (clearing belongs to the shot)", emptyFx.status === "ERROR" && emptyFx.result.includes("at least 1 effect"), emptyFx.result.slice(0, 140));
  const overdrive = await T("design_fx", { name: "E2E Overdrive", programs: JSON.stringify([{ kind: "AURA", intensity: 2.2 }]) });
  check("C7 an over-driven intensity clamps to 1.0", overdrive.status === "OK", overdrive.result.slice(0, 100));
  const clampedRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "FX", name: "E2E Overdrive" } } });
  const clampedSpec = clampedRow ? (JSON.parse(clampedRow.spec) as { programs: Array<{ intensity: number }> }) : null;
  check("C8 the clamp is stored (the worker never sees 2.2)", clampedSpec?.programs?.[0]?.intensity === 1, JSON.stringify(clampedSpec?.programs));
  const update = await T("design_fx", { name: "E2E Crimson Slash", programs: JSON.stringify([
    { kind: "TRAIL", intensity: 0.9 },
    { kind: "BURST", color: "#f97316", beats: [1], intensity: 0.8 },
  ]) });
  check("C9 re-registering updates in place", update.status === "OK" && update.result.includes("updated"), update.result.slice(0, 120));

  // ───────────────────── D. applying fx to a shot ─────────────────────
  const ep = await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Ignition" });
  check("D1 the episode registers", ep.status === "OK", ep.result.slice(0, 90));
  const scn = await T("create_scene", { episodeNumber: 1, number: 1, title: "Cliffside duel", environmentName: null });
  check("D2 the scene registers", scn.status === "OK", scn.result.slice(0, 90));
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Blade Saint Lin draws the obsidian blade as the storm breaks", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "LUNGE" });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the aftermath - E2E Blade Saint Lin stands over the broken gate", shotType: "WIDE", movement: "STATIC" });
  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  check("D3 two shots broke down clean (no grammar, no fx)", shots.length === 2 && shots.every((s) => !s.fx && !s.grammar), JSON.stringify(shots.map((s) => ({ fx: s.fx, g: s.grammar }))));

  const ghostApply = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 1, fx: "E2E Ghost Spectacle" });
  check("D4 an unknown fx name refuses with the registry (built-ins named)", ghostApply.status === "ERROR" && ghostApply.result.includes("No fx program named") && ghostApply.result.includes("'The Slash' (built-in)"), ghostApply.result.slice(0, 220));

  const builtin = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 1, fx: "The Slash" });
  check("D5 a built-in applies by name", builtin.status === "OK" && builtin.result.includes("built-in 'The Slash'") && builtin.result.includes("TRAIL"), builtin.result.slice(0, 200));
  const saved = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 1, fx: "E2E Crimson Slash" });
  check("D6 the saved preset applies over it", saved.status === "OK" && saved.result.includes("preset 'E2E Crimson Slash'"), saved.result.slice(0, 180));
  const shot1 = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 1 } });
  const storedFx = shot1?.fx ? JSON.parse(shot1.fx) : null;
  check("D7 the shot column carries the compiled programs (burst bound to beat 1)", Array.isArray(storedFx) && storedFx.length === 2 && JSON.stringify(storedFx[1].beats) === "[1]" && storedFx[1].color === "#f97316", JSON.stringify(storedFx));
  check("D8 the stored intensity survived the serialize round trip", storedFx?.[0]?.intensity === 0.9, JSON.stringify(storedFx));

  const inline = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 2, fx: JSON.stringify([{ kind: "MOTES", intensity: 0.5 }]) });
  check("D9 an inline program array applies too", inline.status === "OK" && inline.result.includes("inline programs") && inline.result.includes("MOTES"), inline.result.slice(0, 160));
  const cleared = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 2, fx: "" });
  check("D10 an empty fx clears the shot back to a clean stage", cleared.status === "OK" && cleared.result.includes("FX cleared"), cleared.result.slice(0, 120));
  const shot2Row = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: 2 } });
  check("D11 the cleared column is null again", shot2Row?.fx === null, shot2Row?.fx ?? "null");

  // direct the lens so the beats exist to answer (rule 34 order of operations)
  const gram = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([
    { move: "CRANE", from: 0, to: 0.5, wind: 0.8, note: "crane down through the gust" },
    { move: "DOLLY_IN", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", note: "push in as the cut lands" },
  ]) });
  check("D12 the lens is directed first (2 beats, one wind, one pose pair)", gram.status === "OK" && gram.result.includes("CRANE 0-50%") && gram.result.includes("DOLLY_IN 50-100%"), gram.result.slice(0, 200));

  // ───────────────────── E. the REAL directed render with fx ─────────────────────
  // grow the saved preset to the full spectacle (all four kinds answer the two
  // beats) and re-apply: set_shot_fx REPLACES the shot's programs - the last
  // application is what the worker compiles
  const full = await T("design_fx", { name: "E2E Crimson Slash", programs: JSON.stringify([
    { kind: "TRAIL", intensity: 0.9, note: "the blade draws a crimson ribbon" },
    { kind: "BURST", color: "#f97316", beats: [1], intensity: 0.8, note: "the cut lands at the second beat" },
    { kind: "AURA", intensity: 0.7, note: "the qi shell charges through the gust" },
    { kind: "MOTES", intensity: 0.5, note: "spirit dust drifts through the hold" },
  ]) });
  check("E0 the preset grows to the full four-kind spectacle", full.status === "OK" && full.result.includes("updated"), full.result.slice(0, 140));
  const reapplied = await T("set_shot_fx", { sceneNumber: 1, shotNumber: 1, fx: "E2E Crimson Slash" });
  check("E0b the full program re-applies to the hero shot", reapplied.status === "OK" && reapplied.result.includes("preset 'E2E Crimson Slash'"), reapplied.result.slice(0, 140));
  const lin = await T("create_character", { name: "E2E Blade Saint Lin", role: "PROTAGONIST", appearance: "a young sword cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade with a crimson edge", personality: "stoic" });
  check("E1 the cast registers (the blade gives the trail its anchor)", lin.status === "OK", lin.result.slice(0, 110));
  if (!shot1) throw new Error("shot 1 missing - cannot continue");
  console.log("   (real directed render follows - the worker plays the beats, the world answers them)");
  const job = await createRenderJob(labId, shot1.id, "PREVIEW");
  check("E2 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 480_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("E3 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("E4 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as {
      grammar?: { beats?: number; moves?: string[]; windBeats?: number };
      fx?: { programs?: number; kinds?: string[]; boundBeats?: number[]; burstsFired?: number; trailPeak?: number; maxRing?: number; notes?: string[] };
      secondary?: { chains?: number; windBeats?: number[]; maxDeflection?: number };
    };
    check("E5 the worker state reports the directed beats + the wind", state.grammar?.beats === 2 && state.grammar?.windBeats === 1, JSON.stringify(state.grammar));
    check("E6 the fx state reports all four programs with their kinds", state.fx?.programs === 4 && ["TRAIL", "BURST", "AURA", "MOTES"].every((k) => state.fx?.kinds?.includes(k)), JSON.stringify(state.fx));
    check("E7 the burst FIRED on the bound beat (the spectacle landed at the cut)", state.fx?.burstsFired === 1 && state.fx?.boundBeats?.includes(1), JSON.stringify(state.fx));
    check("E8 the trail flared with the pose velocity (real peak glow)", (state.fx?.trailPeak ?? 0) > 0.5, JSON.stringify(state.fx));
    check("E9 the ring actually expanded (max ring above the hidden epsilon)", (state.fx?.maxRing ?? 0) > 0.1, JSON.stringify(state.fx));
    check("E10 no honest-skip notes (every program anchored)", (state.fx?.notes ?? []).length === 0, JSON.stringify(state.fx?.notes));
    check("E11 the cloth rode the same beats (the grammar is one clock)", (state.secondary?.chains ?? 0) >= 10 && (state.secondary?.windBeats ?? []).includes(0), JSON.stringify(state.secondary));
  }

  // the control render: same production, a clean stage (no fx, no grammar)
  const ctrlJob = await createRenderJob(labId, shot2Row!.id, "PREVIEW");
  let ctrlFinal = ctrlJob;
  const ctrlDeadline = Date.now() + 480_000;
  while (ctrlFinal.status === "RENDERING" && Date.now() < ctrlDeadline) {
    await new Promise((r) => setTimeout(r, 4000));
    ctrlFinal = (await tickRenderJob(ctrlJob.id))!;
  }
  if (ctrlFinal.status === "REVIEW") {
    const ctrlStateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${ctrlJob.id}.json`), "utf-8");
    const ctrlState = JSON.parse(ctrlStateRaw) as { fx?: unknown };
    check("E12 the control render's stage stays clean (no fx key in the state)", ctrlState.fx === undefined, JSON.stringify(ctrlState.fx));
  } else {
    check("E12 the control render's stage stays clean (no fx key in the state)", false, `control job ended ${ctrlFinal.status}`);
  }

  // ───────────────────── F. the context line ─────────────────────
  const ctx = await buildCompactContext(labId);
  const designLine = ctx?.design ?? "";
  check("F1 the context design line reports the fx preset", designLine.includes("fx 'E2E Crimson Slash'"), designLine.slice(0, 320));

  // ───────────────────── G. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "ignite the beats" }) });
  check("G1 anonymous direction is 401", anon.status === 401);
  const strangerEmail = `stranger56-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger56", "stranger-pass-56");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-56");
  const strangerPost = await call(strangerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "ignite the beats" }) });
  check("G2 a non-member cannot direct the fx (403)", strangerPost.status === 403);
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

// Iteration 54 E2E: per-beat secondary motion (cloth/hair riding the
// grammar beats) and DSH directing a full sequence with named grammars.
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the grammar's wind field, the worker's secondary motion
//      rig (pivots, springs, MOVE_ENERGY, wind), the two sequence tools
//      (registry 68), doctrine (THE SEQUENCE IS DIRECTED + rule 32),
//      the schema's SEQUENCE preset kind, the render view's wind flag
//   B. accounts + throwaway production
//   C. the wind grammar: wind compiles, clamps, refuses non-numbers
//   D. the sequence registry: design_sequence programs + honest refusals
//   E. direct_sequence: program + inline slots across a scene, the flow
//      read (cut clashes, pose cuts, wind beats, untouched shots), the
//      shot rows carry the compiled beats in order
//   F. a REAL directed render with wind: the worker state reports the
//      beats, the wind beat AND the secondary chains that rode them
//      (chains > 0, a real max deflection)
//   G. the context line reports the sequence program
//   H. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   I. cleanup (exact rows)
// Run: bun scripts/e2e-iter54-secondary-sequence.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter54-secondary-sequence";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter54" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter54" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter54", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter54" },
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
  console.log("== Iteration 54: the robes ride the beats, the sequence is one sentence ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const grammar = readFileSync("src/lib/animation/grammar.ts", "utf8");
  check("A1 the grammar beat carries a directed wind field", grammar.includes("wind?: number | null; // 0..1 directed gust") && grammar.includes("clamp01"));
  check("A2 the compiler validates wind (numbers only, clamped)", grammar.includes("wind must be a number 0..1") && grammar.includes("wind = clamp01(w);"));
  check("A3 the serializer + parser carry wind through the shot column", grammar.includes("b.wind !== null && b.wind !== undefined ? { wind: b.wind }") && grammar.includes("Number.isFinite(Number(rawWind))"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A4 the worker carries the secondary motion rig", bridge.includes("MOVE_ENERGY") && bridge.includes("def build_secondary_rig") && bridge.includes("def apply_secondary_motion") && bridge.includes("SEC_KINDS"));
  check("A5 cloth and hair RIDE THE GRAMMAR BEATS (the docstring says so)", bridge.includes("SECONDARY MOTION pass: cloth and hair RIDE THE GRAMMAR"));
  check("A6 the pivot recipe hangs cloth from its anchor, not its middle", bridge.includes('piv.location = (loc[0], loc[1], loc[2] + dz)') && bridge.includes('ob.location = (loc[0], loc[1], loc[2] - dz)'));
  check("A7 the beat boundary whips the cloth (pose jump across the cut)", bridge.includes("sum(abs(b[i] - a[i]) for i in range(2, 12)) / 190.0"));
  check("A8 the spring is deterministic (fixed dt, per-chain phases)", bridge.includes("Semi-implicit damped spring at fixed dt") && bridge.includes('"phase": i * 1.7'));
  check("A9 the worker normalizes per-beat wind", bridge.includes('"wind": max(0.0, min(1.0, float(b["wind"])))'));
  check("A10 the worker state reports the secondary chains + wind beats", bridge.includes('rep["windBeats"] = sorted(st["wind_beats"])') && bridge.includes('rep["maxDeflection"] = round(st["maxd"], 1)'));
  check("A11 the frame loop drives the chains after the pose", bridge.includes("apply_secondary_motion(figure, sec_chains, grammar, shot,"));
  check("A12 the shared vocabulary covers sash, skirt, sleeves, cuffs, hair, beard", bridge.includes('("SashTail", "CLOTH")') && bridge.includes('("SkirtPanel", "SKIRT")') && bridge.includes('("HairBraid", "HAIR")') && bridge.includes('("BeardChin", "HAIR")'));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A13 the registry grew to 70 tools (design_sculpt 69, blender_retopo 70)", toolCount === 70, `count=${toolCount}`);
  check("A14 design_sequence validates every slot's grammar at design time", tools.includes("design-time validation: a typo never reaches a shoot") && tools.includes("a sequence program needs at least 2 slots"));
  check("A15 direct_sequence applies slots in order and reads the flow", tools.includes("SEQUENCE DIRECTED") && tools.includes("Flow read:") && tools.includes("shot(s) beyond the plan left untouched"));
  check("A16 the wind beats flow into the sequence read", tools.includes("wind beat(s) - the robes and hair ride those beats"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A17 the preset registry names the SEQUENCE kind", schema.includes("MATERIAL | LIGHTING | MOTION | VARIATION | GRAMMAR | SEQUENCE"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A18 the curriculum grew THE SEQUENCE IS DIRECTED", prompts.includes("- THE SEQUENCE IS DIRECTED") && prompts.includes("cloth and hair RIDE the grammar"));
  check("A19 rule 32 teaches the wind and the cutting", prompts.includes("32. DRESS THE BEATS, CUT THE SEQUENCE") && prompts.includes("One scene, one sentence."));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A20 the job card flags wind beats on the grammar chips", renderView.includes("a W flag marks a directed wind call") && renderView.includes("W${b.wind!.toFixed(1)}"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter54 Secondary Sequence Lab ${MARK}`, logline: "a throwaway production for the per-beat secondary motion / sequence directing proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway secondary lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the wind grammar ─────────────────────
  const gram = await T("design_grammar", { name: "E2E Storm Reveal", beats: JSON.stringify([
    { move: "CRANE", from: 0, to: 0.5, wind: 0.8, note: "crane down through the gust" },
    { move: "DOLLY_IN", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", note: "push in as the robes whip" },
  ]) });
  check("C1 a grammar with a wind beat lands as blocking law", gram.status === "OK" && gram.result.includes("registered"), gram.result.slice(0, 180));
  const gramRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "GRAMMAR", name: "E2E Storm Reveal" } } });
  const gramSpec = gramRow ? (JSON.parse(gramRow.spec) as { beats: Array<{ move: string; wind: number | null; poseEnd?: string }> }) : null;
  check("C2 the stored beat carries wind 0.8 + the pose pair", gramSpec?.beats[0]?.wind === 0.8 && gramSpec?.beats[1]?.poseEnd === "LUNGE", JSON.stringify(gramSpec?.beats));

  const gusty = await T("design_grammar", { name: "E2E Bad Wind", beats: JSON.stringify([{ move: "CRANE", from: 0, to: 0.5, wind: "gusty" }, { move: "ORBIT", from: 0.5, to: 1 }]) });
  check("C3 a non-numeric wind refuses honestly", gusty.status === "ERROR" && gusty.result.includes("wind must be a number 0..1"), gusty.result.slice(0, 140));
  await T("design_grammar", { name: "E2E Storm Reveal", beats: JSON.stringify([
    { move: "CRANE", from: 0, to: 0.5, wind: 1.5 },
    { move: "DOLLY_IN", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE" },
  ]) });
  const clamped = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "GRAMMAR", name: "E2E Storm Reveal" } } });
  const clampedSpec = clamped ? (JSON.parse(clamped.spec) as { beats: Array<{ wind: number | null }> }) : null;
  check("C4 an over-driven wind clamps to 1.0 (a hurricane is still a number)", clampedSpec?.beats[0]?.wind === 1, JSON.stringify(clampedSpec?.beats));

  // ───────────────────── D. the sequence registry ─────────────────────
  const program = await T("design_sequence", { name: "E2E Raid on the Fortress", description: "the raid: find, hold, break, withdraw", slots: JSON.stringify([
    { grammar: "The Reveal", note: "open over the fortress" },
    { grammar: "E2E Storm Reveal", note: "the wind carries the reveal" },
    { grammar: "The Assault", poseStart: "DRAW", poseEnd: "SLASH" },
    { grammar: "The Withdrawal" },
  ]) });
  check("D1 a sequence program registers with its slot chain", program.status === "OK" && program.result.includes("registered") && program.result.includes("4 slots"), program.result.slice(0, 240));
  const progRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "E2E Raid on the Fortress" } } });
  const progSpec = progRow ? (JSON.parse(progRow.spec) as { slots: Array<{ grammar: string; poseStart: string | null }> }) : null;
  check("D2 the program stores the ordered slots with poses", progSpec?.slots?.length === 4 && progSpec.slots[2].grammar === "The Assault" && progSpec.slots[2].poseStart === "DRAW", JSON.stringify(progSpec?.slots));

  const ghostSlot = await T("design_sequence", { name: "E2E Broken Raid", slots: JSON.stringify([{ grammar: "The Reveal" }, { grammar: "No Such Grammar" }]) });
  check("D3 a slot naming an unknown grammar refuses with the registry", ghostSlot.status === "ERROR" && ghostSlot.result.includes("slot 2: no grammar named") && ghostSlot.result.includes("(built-in)"), ghostSlot.result.slice(0, 220));
  const loneSlot = await T("design_sequence", { name: "E2E Lone Raid", slots: JSON.stringify([{ grammar: "The Reveal" }]) });
  check("D4 a one-slot program refuses (that is set_shot_grammar)", loneSlot.status === "ERROR" && loneSlot.result.includes("at least 2 slots"), loneSlot.result.slice(0, 140));
  const update = await T("design_sequence", { name: "E2E Raid on the Fortress", slots: JSON.stringify([
    { grammar: "The Reveal" }, { grammar: "E2E Storm Reveal" }, { grammar: "The Assault", poseStart: "DRAW", poseEnd: "SLASH" }, { grammar: "The Withdrawal" },
  ]) });
  check("D5 re-registering a program updates in place", update.status === "OK" && update.result.includes("updated"), update.result.slice(0, 140));

  // ───────────────────── E. directing the full sequence ─────────────────────
  const ep = await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Storm Raid" });
  check("E1 the episode registers", ep.status === "OK", ep.result.slice(0, 90));
  const scn = await T("create_scene", { episodeNumber: 1, number: 1, title: "Fortress approach", environmentName: null });
  check("E2 the scene registers", scn.status === "OK", scn.result.slice(0, 90));
  for (const n of [1, 2, 3, 4, 5]) {
    await T("create_shot", {
      sceneNumber: 1, number: n,
      description: n === 2
        ? "E2E Cultivator Lin stands into the storm as the fortress gates open"
        : `the raid moves through the fortress - beat ${n}, E2E Cultivator Lin in frame`,
      shotType: n === 1 ? "ESTABLISHING" : "MEDIUM",
      movement: "STATIC",
      ...(n === 2 ? { poseStart: "STANCE", poseEnd: "LUNGE" } : {}),
    });
  }
  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing - cannot continue");
  const shotsBefore = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  check("E3 five shots broke down", shotsBefore.length === 5 && shotsBefore.every((s) => s.grammar === null), `${shotsBefore.length} shots`);

  const ghostProgram = await T("direct_sequence", { sceneNumber: 1, program: "E2E Ghost Program" });
  check("E4 an unknown program refuses with the registry", ghostProgram.status === "ERROR" && ghostProgram.result.includes("No sequence program named"), ghostProgram.result.slice(0, 160));

  const directed = await T("direct_sequence", { sceneNumber: 1, program: "E2E Raid on the Fortress" });
  check("E5 the program directs the scene's shots IN ORDER", directed.status === "OK" && directed.result.includes("SEQUENCE DIRECTED (program 'E2E Raid on the Fortress')") && directed.result.includes("Shot 001 <- The Reveal (CRANE>DOLLY_IN)") && directed.result.includes("Shot 004 <- The Withdrawal"), directed.result.slice(0, 320));
  check("E6 the flow read counts the wind beats + the pose cut + the untouched shot", directed.status === "OK" && directed.result.includes("1 wind beat(s) - the robes and hair ride those beats") && directed.result.includes("1 pose change(s) across cuts") && directed.result.includes("1 shot(s) beyond the plan left untouched"), directed.result.slice(-360));

  const shotsAfter = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const g = (i: number) => (shotsAfter[i]?.grammar ? (JSON.parse(shotsAfter[i].grammar as string) as Array<{ move: string; wind?: number; poseStart?: string }>) : null);
  check("E7 shot 1 carries The Reveal's compiled beats", g(0)?.length === 2 && g(0)?.[0].move === "CRANE" && g(0)?.[1].move === "DOLLY_IN", JSON.stringify(g(0)));
  check("E8 shot 2 carries the saved wind grammar (wind rides the column)", g(1)?.[0].wind === 1 && g(1)?.[1].poseStart === "STANCE", JSON.stringify(g(1)));
  check("E9 shot 3 carries The Assault + the slot's global pose pair", g(2)?.[0].move === "TRACKING" && shotsAfter[2]?.poseStart === "DRAW" && shotsAfter[2]?.poseEnd === "SLASH", JSON.stringify(g(2)));
  check("E10 shot 5 beyond the plan stays untouched", shotsAfter[4]?.grammar === null, shotsAfter[4]?.grammar ?? "null");
  const progUsage = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "E2E Raid on the Fortress" } } });
  check("E11 consuming the program bumps its usage count", (progUsage?.usageCount ?? 0) >= 1, `usage=${progUsage?.usageCount}`);

  const inline = await T("direct_sequence", { sceneNumber: 1, slots: JSON.stringify([{ grammar: "The Standoff" }, { grammar: "The Ascent" }]) });
  check("E12 inline slots direct too", inline.status === "OK" && inline.result.includes("SEQUENCE DIRECTED (inline slots)") && inline.result.includes("Shot 001 <- The Standoff (PAN>DOLLY_IN)"), inline.result.slice(0, 260));
  const badInline = await T("direct_sequence", { sceneNumber: 1, slots: JSON.stringify([{ grammar: "The Standoff" }, { grammar: "Still No Grammar" }]) });
  check("E13 an inline slot naming an unknown grammar refuses mid-flight", badInline.status === "ERROR" && badInline.result.includes("slot 2: no grammar named"), badInline.result.slice(0, 160));

  // restore the program for the render pass
  await T("direct_sequence", { sceneNumber: 1, program: "E2E Raid on the Fortress" });

  // ───────────────────── F. the REAL directed render with wind ─────────────────────
  const lin = await T("create_character", { name: "E2E Cultivator Lin", role: "PROTAGONIST", appearance: "a young cultivator in storm-grey layered robes with a topknot and a wind-torn sash, obsidian blade", personality: "stoic" });
  check("F1 the cast registers (the designed figure carries the cloth)", lin.status === "OK", lin.result.slice(0, 110));
  const shot2 = shotsAfter[1];
  if (!shot2) throw new Error("shot 2 missing - cannot continue");
  console.log("   (real directed render follows - the worker plays the grammar, the cloth rides it)");
  const job = await createRenderJob(labId, shot2.id, "PREVIEW");
  check("F2 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 420_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("F3 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("F4 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as {
      grammar?: { beats?: number; moves?: string[]; beatPoses?: number; windBeats?: number };
      secondary?: { chains?: number; cloth?: number; hair?: number; windBeats?: number[]; maxDeflection?: number };
      figureSource?: string;
    };
    check("F5 the worker state reports the directed beats + the wind beat", state.grammar?.beats === 2 && state.grammar?.moves?.[0] === "CRANE" && state.grammar?.windBeats === 1, JSON.stringify(state.grammar));
    check("F6 the figure is the DESIGNED cast (the cloth/hair vocabulary exists)", (state.figureSource ?? "").includes("E2E Cultivator Lin") || state.figureSource === "procedural:v4.0-designed", state.figureSource ?? "none");
    check("F7 the secondary rig chained the cloth AND the hair", (state.secondary?.chains ?? 0) >= 12 && (state.secondary?.cloth ?? 0) >= 10 && (state.secondary?.hair ?? 0) >= 1, JSON.stringify(state.secondary));
    check("F8 the cloth actually RODE the beats (real deflection, wind beat hit)", (state.secondary?.maxDeflection ?? 0) > 0.5 && (state.secondary?.windBeats ?? []).includes(0), JSON.stringify(state.secondary));
  }

  // ───────────────────── G. the context line ─────────────────────
  const ctx = await buildCompactContext(labId);
  const designLine = ctx?.design ?? "";
  check("G1 the context design line reports the sequence program", designLine.includes("sequence 'E2E Raid on the Fortress'"), designLine.slice(0, 260));
  check("G2 the context design line reports the grammar presets too", designLine.includes("grammar 'E2E Storm Reveal'"), designLine.slice(0, 260));

  // ───────────────────── H. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "direct the sequence" }) });
  check("H1 anonymous directing is 401", anon.status === 401);
  const strangerEmail = `stranger54-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger54", "stranger-pass-54");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-54");
  const strangerPost = await call(strangerJar, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "direct the sequence" }) });
  check("H2 a non-member cannot direct the sequence (403)", strangerPost.status === 403);
  const ownerGet = await call(ownerJar, `/api/dsh?projectId=${labId}`);
  check("H3 the OWNER reads the production's direction (bypass intact)", ownerGet.status === 200 && Array.isArray(await ownerGet.json()));
  const ownerDesign = await call(ownerJar, `/api/design-reviews?projectId=${labId}`);
  check("H4 the OWNER reads the design standing anywhere (bypass intact)", ownerDesign.status === 200);

  // ───────────────────── I. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  await db.user.delete({ where: { id: stranger.id } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverPresets = await db.designPreset.count({ where: { projectId: labId } });
  check("I1 every throwaway row is gone (cascade holds)", !leftover && leftoverPresets === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

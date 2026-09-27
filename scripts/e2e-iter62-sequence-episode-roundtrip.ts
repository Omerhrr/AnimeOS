// Iteration 62 E2E: the sequence graduates to the full episode (slots
// carry fx/physics programs, scope:'episode' cuts every scene in story
// order) + the GLTF/FBX round-trip hardening (per-check verification:
// names, materials, bones, actions, uvs - not one drift number).
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the hardened roundtrip.py (purge, per-check rows,
//      add_leaf_bones), the upgraded sequence tools (registry 79),
//      doctrine (rules 30/32 + the curriculum laws), the UI chip
//   B. accounts + throwaway production
//   C. the sequence registry: slots carry fx/physics, honest refusals
//   D. directing: scene scope (world bindings stamp the shots) +
//      episode scope across scenes in story order + honest refusals
//      + render:true queues the whole sentence
//   E. the round trip: a REAL prop build, GLB + FBX exports verified
//      per-check, the AssetExport row carries the checks
//   F. the HTTP role matrix (anon 401, OWNER unblocked)
//   G. cleanup (exact rows)
// Run: bun scripts/e2e-iter62-sequence-episode-roundtrip.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { latestExportsFor } from "../src/lib/blender/roundtrip";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter62-seq-episode-roundtrip";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter62" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter62" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter62", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter62" },
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

async function main() {
  console.log("== Iteration 62: the sentence cuts the episode, the file survives the trip ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const rt = readFileSync("bridges/blender/roundtrip.py", "utf8");
  check("A1 the wipe PURGES the orphaned source datablocks (counts stop lying)", rt.includes("def _purge_orphans") && rt.includes("orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)"));
  check("A2 the FBX export keeps bone NAMES exact (add_leaf_bones=False)", rt.includes("add_leaf_bones=False") && rt.includes("bake_anim=True"));
  check("A3 the GLB export carries the animation explicitly", rt.includes("export_animations=True"));
  check("A4 the verdict is PER-CHECK (eight identity checks)", rt.includes('"MESH_NAMES"') && rt.includes('"MESH_COUNT"') && rt.includes('"MATERIAL_NAMES"') && rt.includes('"ARMATURE_BONES"') && rt.includes('"ACTION"') && rt.includes('"UV_SETS"') && rt.includes('"DIMS"') && rt.includes('"TRIS"'));
  check("A5 verified means EVERY check green", rt.includes("verified = all(c[\"ok\"] for c in checks)"));
  check("A6 materials compare by NAME, not just count", rt.includes('materials_missing = [n for n in src["materialNames"] if n not in set(re_stats["materialNames"])]'));
  check("A7 the ACTION check judges the frame RANGE (FBX may rename the take)", rt.includes("the RANGE is the identity") && rt.includes("_action_check(src[\"actions\"], re_stats[\"actions\"])"));

  const rtTs = readFileSync("src/lib/blender/roundtrip.ts", "utf8");
  check("A8 the TS report carries the checks + the failed count", rtTs.includes("export interface RoundtripCheck") && rtTs.includes("checksFailed = (report.checks ?? []).filter((c) => !c.ok).length"));
  check("A9 the export chip row carries checksFailed", rtTs.includes("checksFailed: number | null"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A10 the registry stands at 80 tools (learn_sequence_flow joined in iter 63)", toolCount === 80, `count=${toolCount}`);
  check("A11 design_sequence slots carry fx/physics (validated at design time)", tools.includes("optional fx / physics program names (a design_fx / design_physics preset") && tools.includes("no fx program named") && tools.includes("no physics program named"));
  check("A12 direct_sequence cuts the WHOLE EPISODE in story order", tools.includes("scope:'episode' cuts the WHOLE EPISODE in story order") && tools.includes("episodeNumber:") && tools.includes("episode allocates the slots across every scene of the episode"));
  check("A13 the sequence stamps the world the same way the shot tools do", tools.includes("compiling every grammar exactly like") && tools.includes("set_shot_fx / set_shot_physics"));
  check("A14 blender_export names the per-check verdict", tools.includes("MATERIAL_NAMES (by name, not just count)") && tools.includes("ARMATURE_BONES (by name)") && tools.includes("an unverified export is a hope, not a deliverable"));
  check("A15 the scene-scope contract survives (regression anchors intact)", tools.includes("SEQUENCE DIRECTED") && tools.includes("Flow read:") && tools.includes("shot(s) beyond the plan left untouched") && tools.includes("wind beat(s) - the robes and hair ride those beats"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A16 rule 30 teaches the per-check verification", prompts.includes("verified PER-CHECK (mesh names, mesh count, material NAMES, armature bone NAMES, the action's frame range, UV sets") && prompts.includes("a failed check says WHICH identity the trip lost"));
  check("A17 rule 32 cuts the whole episode with the world riding", prompts.includes("scope:'episode' cuts the WHOLE EPISODE in story order, scene by scene") && prompts.includes("a slot may also bind fx and physics programs so the world answers on the right shots") && prompts.includes("scope:'episode' is the whole paragraph"));
  check("A18 the curriculum laws grew with the frontiers", prompts.includes("with optional per-slot poses AND per-slot fx / physics programs") && prompts.includes("let the ROUND TRIP verify it PER-CHECK") && prompts.includes("Direct at the shot, the sequence AND the episode"));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A19 the export chip names the failed checks", renderView.includes("UNVER:${failed}") && renderView.includes("every round-trip check green"));

  const apiClient = readFileSync("src/lib/api-client.ts", "utf8");
  check("A20 the API chip type carries checksFailed", apiClient.includes("checksFailed?: number | null;"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter62 Sequence Episode Lab ${MARK}`, logline: "a throwaway production for the episode-scope sequence + round-trip hardening proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the sequence registry carries the world ─────────────────────
  const program = await T("design_sequence", { name: "E2E Raid on the Fortress", description: "the raid: find, hold, break, withdraw - the world answers", slots: JSON.stringify([
    { grammar: "The Reveal", fx: "The Slash", note: "the reveal flares" },
    { grammar: "The Standoff" },
    { grammar: "The Assault", poseStart: "DRAW", poseEnd: "SLASH", fx: "The Slash", physics: "The Clash" },
    { grammar: "The Withdrawal" },
  ]) });
  check("C1 a program with fx/physics slots registers", program.status === "OK" && program.result.includes("+fx The Slash") && program.result.includes("+physics The Clash"), program.result.slice(0, 260));
  const progRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SEQUENCE", name: "E2E Raid on the Fortress" } } });
  const progSpec = progRow ? (JSON.parse(progRow.spec) as { slots: Array<{ grammar: string; fx: string | null; physics: string | null }> }) : null;
  check("C2 the stored slots carry the world bindings", progSpec?.slots?.length === 4 && progSpec.slots[0].fx === "The Slash" && progSpec.slots[2].physics === "The Clash" && progSpec.slots[1].fx === null, JSON.stringify(progSpec?.slots));

  const ghostFx = await T("design_sequence", { name: "E2E Broken Raid", slots: JSON.stringify([{ grammar: "The Reveal" }, { grammar: "The Standoff", fx: "No Such FX" }]) });
  check("C3 a slot naming an unknown fx refuses with the registry", ghostFx.status === "ERROR" && ghostFx.result.includes("slot 2: no fx program named 'No Such FX'") && ghostFx.result.includes("(built-in)"), ghostFx.result.slice(0, 220));
  const ghostPhys = await T("design_sequence", { name: "E2E Broken Raid", slots: JSON.stringify([{ grammar: "The Reveal" }, { grammar: "The Standoff", physics: "No Such Law" }]) });
  check("C4 a slot naming an unknown physics refuses with the registry", ghostPhys.status === "ERROR" && ghostPhys.result.includes("slot 2: no physics program named 'No Such Law'"), ghostPhys.result.slice(0, 220));
  const badPhys = await T("design_sequence", { name: "E2E Broken Raid", slots: JSON.stringify([{ grammar: "The Reveal" }, { grammar: "The Standoff", physics: JSON.stringify([{ kind: "GRAVITY_SLAM" }]) }]) });
  check("C5 an inline physics program that cannot compile refuses", badPhys.status === "ERROR" && badPhys.result.includes("slot 2 physics"), badPhys.result.slice(0, 200));

  // ───────────────────── D. directing the sentence ─────────────────────
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Storm Raid" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Fortress approach", environmentName: null });
  await T("create_scene", { episodeNumber: 1, number: 2, title: "The gates break", environmentName: null });
  for (const scn of [1, 2]) {
    for (const n of [1, 2, 3]) {
      await T("create_shot", {
        sceneNumber: scn, number: n,
        description: `the raid moves through the fortress - scene ${scn} beat ${n}, E2E Cultivator Lin in frame`,
        shotType: n === 1 ? "ESTABLISHING" : "MEDIUM",
        movement: "STATIC",
      });
    }
  }
  const ep1Scenes = await db.scene.findMany({
    where: { episode: { season: { projectId: labId }, number: 1 } },
    orderBy: { number: "asc" },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  check("D1 two scenes with three shots each broke down", ep1Scenes.length === 2 && ep1Scenes.every((s) => s.shots.length === 3), `${ep1Scenes.map((s) => s.shots.length).join(",")}`);

  const directed = await T("direct_sequence", { sceneNumber: 1, program: "E2E Raid on the Fortress" });
  check("D2 the program directs the scene IN ORDER (regression contract)", directed.status === "OK" && directed.result.includes("SEQUENCE DIRECTED (program 'E2E Raid on the Fortress')") && directed.result.includes("Shot 001 <- The Reveal (CRANE>DOLLY_IN) [fx: TRAIL") && directed.result.includes("Shot 003 <- The Assault (TRACKING>ORBIT)"), directed.result.slice(0, 420));
  check("D3 the flow read counts the world bindings + the unused slot", directed.status === "OK" && directed.result.includes("2 fx + 1 physics binding(s) - the world answers on those shots") && directed.result.includes("1 slot(s) had no shot to direct"), directed.result.slice(-420));

  const scene1Shots = await db.shot.findMany({ where: { sceneId: ep1Scenes[0].id }, orderBy: { number: "asc" } });
  const fx1 = scene1Shots[0]?.fx ? (JSON.parse(scene1Shots[0].fx) as Array<{ kind: string }>) : null;
  const fx3 = scene1Shots[2]?.fx ? (JSON.parse(scene1Shots[2].fx) as Array<{ kind: string }>) : null;
  const phys3 = scene1Shots[2]?.physics ? (JSON.parse(scene1Shots[2].physics) as Array<{ kind: string }>) : null;
  check("D4 shot 1 carries the slot's fx (compiled like set_shot_fx)", (fx1 ?? []).some((p) => p.kind === "TRAIL"), scene1Shots[0]?.fx ?? "null");
  check("D5 shot 3 carries BOTH the fx and the physics", (fx3 ?? []).some((p) => p.kind === "TRAIL") && (phys3 ?? []).some((p) => p.kind === "KNOCK"), `${scene1Shots[2]?.fx ?? "null"} / ${scene1Shots[2]?.physics ?? "null"}`);
  check("D6 shot 2 without a binding keeps a clean stage", scene1Shots[1]?.fx === null && scene1Shots[1]?.physics === null, `${scene1Shots[1]?.fx} / ${scene1Shots[1]?.physics}`);

  const episodeDirected = await T("direct_sequence", { scope: "episode", episodeNumber: 1, slots: JSON.stringify([
    { grammar: "The Ascent" },
    { grammar: "The Reveal", fx: "Cultivator's Aura" },
    { grammar: "The Assault" },
    { grammar: "The Standoff" },
  ]) });
  check("D7 episode scope cuts ACROSS the scenes in story order", episodeDirected.status === "OK" && episodeDirected.result.includes("SEQUENCE DIRECTED (inline slots) across 4 shot(s) of episode 1 (2 scene(s) in story order)") && episodeDirected.result.includes("Sc1 S001 <- The Ascent") && episodeDirected.result.includes("Sc2 S001 <- The Standoff"), episodeDirected.result.slice(0, 460));
  check("D8 the flow read reports the untouched tail", episodeDirected.status === "OK" && episodeDirected.result.includes("2 shot(s) beyond the plan left untouched"), episodeDirected.result.slice(-260));
  const ep1Reload = await db.scene.findMany({
    where: { episode: { season: { projectId: labId }, number: 1 } },
    orderBy: { number: "asc" },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  const sc2grammar = ep1Reload[1].shots[0].grammar ? (JSON.parse(ep1Reload[1].shots[0].grammar) as Array<{ move: string }>) : null;
  check("D9 scene 2's first shot carries its slot's grammar", sc2grammar?.[0]?.move === "PAN", ep1Reload[1].shots[0].grammar ?? "null");
  const sc2fx = ep1Reload[1].shots[0].fx;
  check("D10 the scene-2 shot kept a clean stage (its slot named no world)", sc2fx === null, sc2fx ?? "null");

  const ghostEp = await T("direct_sequence", { scope: "episode", episodeNumber: 99, program: "E2E Raid on the Fortress" });
  check("D11 an unknown episode refuses honestly", ghostEp.status === "ERROR" && ghostEp.result.includes("No episode 99 with shots"), ghostEp.result.slice(0, 160));
  const ghostProgram = await T("direct_sequence", { scope: "episode", program: "E2E Ghost Program" });
  check("D12 an unknown program refuses with the registry (episode scope)", ghostProgram.status === "ERROR" && ghostProgram.result.includes("No sequence program named"), ghostProgram.result.slice(0, 160));
  const ghostSlotFx = await T("direct_sequence", { sceneNumber: 1, slots: JSON.stringify([{ grammar: "The Reveal" }, { grammar: "The Standoff", fx: "No Such FX" }]) });
  check("D13 an inline slot naming an unknown fx refuses mid-flight", ghostSlotFx.status === "ERROR" && ghostSlotFx.result.includes("slot 2: no fx program named"), ghostSlotFx.result.slice(0, 160));

  const queued = await T("direct_sequence", { sceneNumber: 2, program: "E2E Raid on the Fortress", render: true });
  const queuedCount = (queued.result.match(/render job\(s\) queued/g) ?? []).length;
  check("D14 render:true queues the whole sentence", queued.status === "OK" && queued.result.includes("3 PREVIEW render job(s) queued") && queuedCount === 1, queued.result.slice(-300));

  // ───────────────────── E. the round trip, verified per-check ─────────────────────
  const prop = await T("create_asset", { category: "PROP", name: "E2E Roundtrip Saber", description: "a slender spirit saber, an engraved jade blade with a polished gold guard and a wrapped grip, faint cyan runes" });
  check("E1 the prop registers", prop.status === "OK", prop.result.slice(0, 110));
  console.log("   (real Blender build follows - the saber designs, then two exports verify)");
  const build = await T("blender_asset_build", { kind: "PROP", refName: "E2E Roundtrip Saber" });
  check("E2 the saber builds READY", build.status === "OK" && build.result.includes("built and accepted into the library"), build.result.slice(0, 200));
  const assetRow = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Roundtrip Saber" } } });
  if (!assetRow) throw new Error("asset row missing - cannot continue");

  const glb = await T("blender_export", { refName: "E2E Roundtrip Saber", kind: "PROP", format: "GLB" });
  check("E3 the GLB export verifies with EVERY check green", glb.status === "OK" && glb.result.includes("VERIFIED - every check green") && glb.result.includes("MESH_NAMES") && glb.result.includes("MATERIAL_NAMES") && glb.result.includes("UV_SETS"), glb.result.slice(0, 420));
  const glbRow = await db.assetExport.findFirst({ where: { assetId: assetRow.id, format: "GLB" }, orderBy: { createdAt: "desc" } });
  const glbReport = glbRow?.report ? (JSON.parse(glbRow.report) as { checks: Array<{ name: string; ok: boolean; detail: string }>; uvsSrc: number; verified: boolean }) : null;
  check("E4 the AssetExport row carries the per-check report", glbRow?.verified === true && (glbReport?.checks.length ?? 0) >= 6 && glbReport?.checks.every((c) => c.ok) === true, JSON.stringify(glbReport?.checks.map((c) => `${c.name}:${c.ok}`)));
  check("E5 the identity checks actually ran (uvs, materials, tris)", (glbReport?.uvsSrc ?? 0) > 0 && glbReport?.checks.some((c) => c.name === "MATERIAL_NAMES") === true && glbReport?.checks.some((c) => c.name === "TRIS") === true, JSON.stringify({ uvs: glbReport?.uvsSrc }));

  const fbx = await T("blender_export", { refName: "E2E Roundtrip Saber", kind: "PROP", format: "FBX" });
  check("E6 the FBX export verifies with the hardened bone law", fbx.status === "OK" && fbx.result.includes("VERIFIED - every check green"), fbx.result.slice(0, 300));
  const fbxRow = await db.assetExport.findFirst({ where: { assetId: assetRow.id, format: "FBX" }, orderBy: { createdAt: "desc" } });
  const fbxReport = fbxRow?.report ? (JSON.parse(fbxRow.report) as { checks: Array<{ name: string; ok: boolean }>; notes: string[]; verified: boolean }) : null;
  check("E7 the FBX notes carry the hardened flags", fbxReport?.verified === true && fbxReport.notes.some((n) => n.includes("add_leaf_bones=False")) === true, JSON.stringify(fbxReport?.notes));

  const exports = await latestExportsFor(labId);
  check("E8 the chip row carries checksFailed 0 on both formats", (exports[assetRow.id]?.checksFailed ?? -1) === 0, JSON.stringify(exports[assetRow.id]));

  // ───────────────────── F. the HTTP role matrix ─────────────────────
  const anon = await call(null, "/api/dsh", { method: "POST", body: JSON.stringify({ projectId: labId, message: "direct the sequence" }) });
  check("F1 anonymous directing is 401", anon.status === 401);
  const ownerGet = await call(ownerJar, `/api/dsh?projectId=${labId}`);
  check("F2 the OWNER reads the production's direction (bypass intact)", ownerGet.status === 200);

  // ───────────────────── G. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverPresets = await db.designPreset.count({ where: { projectId: labId } });
  check("G1 every throwaway row is gone (cascade holds)", !leftover && leftoverPresets === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

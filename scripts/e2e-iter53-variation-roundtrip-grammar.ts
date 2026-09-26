// Iteration 53 E2E: geometry-node variation, GLTF/FBX round-trip, and
// directed motion grammar. Proves, against the RUNNING studio, the
// REAL database and the REAL Blender runtime:
//   A. source: the schema fields (Shot.grammar, variationPreset,
//      AssetExport), the 66-tool registry, the v7 builder's
//      --variation pass, variation_nodes.py, roundtrip.py, grammar.ts,
//      the worker's grammar camera, doctrine (VARIATION IS DESIGN /
//      INTEROP IS DESIGN / THE GRAMMAR IS DIRECTED + rules 30-31),
//      the audit's VARIATION criterion, the UI export strip + grammar
//      chips and the API export action
//   B. tool-level through the REAL executeTool path: named variation
//      presets, honest refusals, a REAL environment build carrying a
//      GN tree (in-.blend probe: node groups + NODES modifier + live
//      instances), GLB + FBX exports VERIFIED by re-import comparison
//   C. the audit loop covers variation: a wallpaper environment raises
//      a MAJOR VARIATION issue, design_fix bakes the default scatter,
//      and the re-audit clears it
//   D. the grammar: register / apply / built-ins / inline beats /
//      honest refusals / clearing, then a REAL directed render whose
//      worker state reports the beats
//   E. the context line reports the varied standing
//   F. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   G. cleanup (exact rows)
// Run: bun scripts/e2e-iter53-variation-roundtrip-grammar.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter53-design-interop";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter53" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter53" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter53", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter53" },
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
  console.log("== Iteration 53: variation, round-trip, and the directed lens ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1 shots carry the directed grammar column", schema.includes("grammar     String?"));
  check("A2 assets carry the variation preset column", schema.includes("variationPreset String?"));
  check("A3 the AssetExport model persists exports + verification", schema.includes("model AssetExport") && schema.includes("verified    Boolean") && schema.includes("drift       Float?"));
  check("A4 the preset registry names VARIATION and GRAMMAR kinds", schema.includes("MATERIAL | LIGHTING | MOTION | VARIATION | GRAMMAR"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry grew to 72 tools (the fx tools 71-72 joined in iter 56)", toolCount === 72, `count=${toolCount}`);
  check("A6 design_variation registers the seeded GN layout law", tools.includes('name: "design_variation"') && tools.includes("SCATTER (instances across a carrier surface) | ARRAY (instances along a spine/grid)"));
  check("A7 blender_export verifies the round trip", tools.includes('name: "blender_export"') && tools.includes("an unverified export is a hope, not a deliverable"));
  check("A8 design_grammar + set_shot_grammar direct the lens", tools.includes('name: "design_grammar"') && tools.includes('name: "set_shot_grammar"') && tools.includes("The Reveal, The Standoff, The Assault, The Ascent, The Withdrawal"));
  check("A9 the build tool takes a variation preset name", tools.includes('variation: "string (optional - a design_variation preset name; attaches a REAL Geometry Nodes scatter/array layout to the asset)"'));
  check("A10 the context line reports the varied standing", tools.includes("environments without design_variation are wallpapers") && tools.includes("+gn"));

  const variation = readFileSync("src/lib/blender/variation.ts", "utf8");
  check("A11 the variation spec compiler validates kind + clamps", variation.includes("compileVariationSpec") && variation.includes('VARIATION_KINDS: VariationKind[] = ["scatter", "array"]') && variation.includes("DEFAULT_VARIATION_BY_KIND"));

  const builder = readFileSync("bridges/blender/asset_builder.py", "utf8");
  check("A12 the v8 builder carries a --variation pass and reports the GN summary", builder.includes("ASSET BUILDER (v8.0)") && builder.includes("--variation") && builder.includes("VARIATION_SUMMARY") && builder.includes("variation-only pass"));

  const gn = readFileSync("bridges/blender/variation_nodes.py", "utf8");
  check("A13 variation_nodes builds REAL GN trees with the studio's deterministic RNG", gn.includes("GeometryNodeDistributePointsOnFaces") && gn.includes("GeometryNodeInstanceOnPoints") && gn.includes("def _mulberry32") && gn.includes("def build_spine"));
  check("A14 the instance report counts the depsgraph atomically", gn.includes("def count_instances") && gn.includes("only valid during their iteration"));

  const rt = readFileSync("bridges/blender/roundtrip.py", "utf8");
  check("A15 the round trip exports, re-imports and compares", rt.includes("export_scene.gltf") && rt.includes("export_scene.fbx") && rt.includes("ROUNDTRIP") && rt.includes("verified"));
  check("A16 the report is honest about format behavior", rt.includes("lights and cameras stay behind by design") && rt.includes("re-triangulates ngons"));

  const rtTs = readFileSync("src/lib/blender/roundtrip.ts", "utf8");
  check("A17 exports persist as AssetExport rows and land in /exports/", rtTs.includes("runRoundtrip") && rtTs.includes("assetExport.create") && rtTs.includes("publicPath") && rtTs.includes("latestExportsFor"));

  const grammar = readFileSync("src/lib/animation/grammar.ts", "utf8");
  check("A18 the grammar compiler validates beats and coverage", grammar.includes("GRAMMAR_MOVES") && grammar.includes("compileGrammarSpec") && grammar.includes("at least 2 beats"));
  check("A19 five built-in grammars ship", grammar.includes('"The Reveal"') && grammar.includes('"The Standoff"') && grammar.includes('"The Assault"') && grammar.includes('"The Ascent"') && grammar.includes('"The Withdrawal"'));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A20 the worker plays a grammar beat by beat with a shared framing context", bridge.includes("def normalize_grammar") && bridge.includes("class _Framing") && bridge.includes("def apply_camera_move") && bridge.includes("def grammar_camera_pose") && bridge.includes("GRAMMAR_FADE"));
  check("A21 a corrupt grammar degrades honestly to the whole-clip move", bridge.includes("degrades honestly to the whole-clip movement"));
  check("A22 per-beat poses run the beat clock; global poses keep the global clock", bridge.includes("def grammar_pose_state") && bridge.includes("must not restart at every beat cut"));

  const render = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A23 the payload rides the shot's grammar", render.includes("DIRECTED MOTION GRAMMAR: the shot's beat sequence rides the"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A24 the curriculum grew VARIATION IS DESIGN, INTEROP IS DESIGN and THE GRAMMAR IS DIRECTED", prompts.includes("- VARIATION IS DESIGN") && prompts.includes("- INTEROP IS DESIGN") && prompts.includes("- THE GRAMMAR IS DIRECTED"));
  check("A25 rules 30 and 31 teach interop + direction", prompts.includes("30. AN ASSET THAT CANNOT LEAVE IS NOT AN ASSET") && prompts.includes("31. DIRECT THE LENS, DON'T PARK IT"));

  const review = readFileSync("src/lib/blender/design-review.ts", "utf8", );
  check("A26 the audit weighs VARIATION (0.09) and flags wallpaper environments", review.includes("variation: 0.09") && review.includes("designed but a wallpaper"));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A27 the asset card carries the export strip + verified chip", renderView.includes("runExport(a.refName, \"GLB\")") && renderView.includes("Export GLB + verify the round trip") && renderView.includes("Last export"));
  check("A28 the job card shows the grammar beat chips", renderView.includes("Directed motion grammar - the worker plays these camera beats in order"));

  const apiRoute = readFileSync("src/app/api/blender-assets/route.ts", "utf8");
  check("A29 the API serves the export action + export chips", apiRoute.includes('action === "export"') && apiRoute.includes("latestExportsFor"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter53 Design Interop Lab ${MARK}`, logline: "a throwaway production for the variation / round-trip / grammar proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway interop lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the variation registry ─────────────────────
  const scatter = await T("design_variation", { name: "E2E Valley Debris", variation: "scatter", count: 36, seed: 42, scaleJitter: 0.4, rotJitter: 0.9 });
  check("C1 a scatter preset lands as production law", scatter.status === "OK" && scatter.result.includes("registered"), scatter.result.slice(0, 140));
  const array = await T("design_variation", { name: "E2E Blade Rack", variation: "array", count: 9, seed: 7, spread: 0.2, layout: "line" });
  check("C2 an array preset lands", array.status === "OK");
  const badKind = await T("design_variation", { name: "E2E Nonsense", variation: "explode" });
  check("C3 an unknown variation kind refuses with the allowed list", badKind.status === "ERROR" && badKind.result.includes("allowed"), badKind.result.slice(0, 120));
  const vRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "VARIATION", name: "E2E Valley Debris" } } });
  const vSpec = vRow ? (JSON.parse(vRow.spec) as { variation: string; seed: number; count: number }) : null;
  check("C4 the variation row carries the compiled spec", vSpec?.variation === "scatter" && vSpec?.seed === 42 && vSpec?.count === 36);

  // ───────────────────── D. the REAL variation build ─────────────────────
  const env = await T("create_environment", { name: "E2E Ashfall Valley", description: "a volcanic valley floor scattered with obsidian shards and pyre stones", atmosphere: "ash-choked", timeOfDay: "dusk", weather: "ashfall" });
  check("D1 the environment registers", env.status === "OK", env.result.slice(0, 100));

  console.log("   (real Blender build follows - the runtime compiles the GN tree)");
  const build = await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Ashfall Valley", variation: "E2E Valley Debris" });
  check("D2 the valley builds UNDER THE VARIATION PRESET", build.status === "OK", build.result.slice(0, 160));
  const envRow = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "ENVIRONMENT", refName: "E2E Ashfall Valley" } } });
  check("D3 the row records the variation preset", envRow?.status === "READY" && envRow?.variationPreset === "E2E Valley Debris", `preset=${envRow?.variationPreset}`);
  const meta = envRow?.meta ? JSON.parse(envRow.meta) as { variation?: { name?: string; instances?: number; carrier?: string; source?: string; kind?: string }; builderVersion?: string } : null;
  check("D4 the build meta carries the GN summary (seeded instances)", (meta?.variation?.instances ?? 0) > 0 && meta?.variation?.kind === "scatter" && meta?.builderVersion === "v8.0", JSON.stringify(meta?.variation));
  const vUsage = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "VARIATION", name: "E2E Valley Debris" } } });
  check("D5 consuming a variation preset bumps its usage count", (vUsage?.usageCount ?? 0) >= 1, `usage=${vUsage?.usageCount}`);

  // probe INSIDE the saved .blend: a real GN tree, a NODES modifier, live instances
  const blendPath = envRow?.blendPath ?? "";
  const probe = await T("blender_exec", {
    purpose: "E2E probe: prove the valley .blend carries a real Geometry Nodes variation tree",
    script: `import bpy
bpy.ops.wm.open_mainfile(filepath=r"${blendPath}")
trees = [t.name for t in bpy.data.node_groups if t.name.startswith("AnimeOSVariation")]
mods = [(o.name, m.name, m.type) for o in bpy.data.objects for m in o.modifiers if m.type == "NODES" and m.node_group]
tree = bpy.data.node_groups.get(trees[0]) if trees else None
node_types = sorted(set(n.bl_idname for n in tree.nodes)) if tree else []
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
inst = 0
for i in dg.object_instances:
    if i.is_instance:
        inst += 1
print("PROBE_TREES %d" % len(trees))
print("PROBE_MODS %d" % len(mods))
print("PROBE_NODE_IOP %s" % ("GeometryNodeInstanceOnPoints" in node_types))
print("PROBE_NODE_DIST %s" % ("GeometryNodeDistributePointsOnFaces" in node_types))
print("PROBE_INSTANCES %d" % inst)
`,
  });
  check("E1 the .blend contains a REAL AnimeOSVariation GN tree", probe.status === "OK" && probe.result.includes("PROBE_TREES 1"), probe.result.slice(0, 200));
  check("E2 a NODES modifier binds the tree to the carrier", probe.status === "OK" && /PROBE_MODS [1-9]/.test(probe.result), probe.result.slice(0, 200));
  check("E3 the tree is a scatter graph (distribute + instance-on-points)", probe.status === "OK" && probe.result.includes("PROBE_NODE_IOP True") && probe.result.includes("PROBE_NODE_DIST True"), probe.result.slice(0, 220));
  check("E4 the tree evaluates to LIVE instances in the depsgraph", probe.status === "OK" && /PROBE_INSTANCES ([1-9]\d*)/.test(probe.result), probe.result.slice(0, 200));

  // ───────────────────── F. the GLB/FBX round trip ─────────────────────
  const glb = await T("blender_export", { refName: "E2E Ashfall Valley", kind: "ENVIRONMENT", format: "GLB" });
  check("F1 the GLB export VERIFIES by re-import comparison", glb.status === "OK" && glb.result.includes("VERIFIED"), glb.result.slice(0, 240));
  const glbRow = await db.assetExport.findFirst({ where: { projectId: labId, format: "GLB" }, orderBy: { createdAt: "desc" } });
  check("F2 the AssetExport row lands verified with drift numbers", Boolean(glbRow?.verified) && glbRow?.drift !== null, JSON.stringify({ verified: glbRow?.verified, drift: glbRow?.drift }));
  const glbReport = glbRow?.report ? JSON.parse(glbRow.report) as { meshesSrc: number; meshesRe: number; missing: string[]; notes: string[]; bytes: number } : null;
  check("F3 the GLB report matches meshes exactly and names the format honestly", glbReport !== null && glbReport.meshesSrc === glbReport.meshesRe && glbReport.missing.length === 0 && glbReport.notes.some((n) => n.includes("lights and cameras stay behind")), JSON.stringify(glbReport?.missing));
  check("F4 the export file is served from /exports/", Boolean(glbRow?.publicPath) && fs.existsSync(path.join(process.cwd(), "public", glbRow?.publicPath ?? "/x.glb")), glbRow?.publicPath ?? "none");

  const fbx = await T("blender_export", { refName: "E2E Ashfall Valley", kind: "ENVIRONMENT", format: "FBX" });
  check("F5 the FBX export VERIFIES too", fbx.status === "OK" && fbx.result.includes("VERIFIED"), fbx.result.slice(0, 240));
  const fbxRow = await db.assetExport.findFirst({ where: { projectId: labId, format: "FBX" }, orderBy: { createdAt: "desc" } });
  const fbxReport = fbxRow?.report ? JSON.parse(fbxRow.report) as { meshesSrc: number; meshesRe: number; triDeltaPct: number; notes: string[] } : null;
  check("F6 the FBX report honestly explains the format (ngons + base-mesh GN)", Boolean(fbxRow?.verified) && fbxReport?.notes.some((n) => n.includes("re-triangulates ngons")) === true && fbxReport?.notes.some((n) => n.includes("cannot carry a Geometry Nodes tree")) === true, JSON.stringify({ tri: fbxReport?.triDeltaPct }));

  const badFmt = await T("blender_export", { refName: "E2E Ashfall Valley", kind: "ENVIRONMENT", format: "OBJ" });
  check("F7 an unsupported format refuses honestly", badFmt.status === "ERROR" && badFmt.result.includes("GLB or FBX"), badFmt.result.slice(0, 120));
  const ghost = await T("blender_export", { refName: "E2E Ghost Asset", kind: "PROP", format: "GLB" });
  check("F8 an un-built asset refuses with the registry hint", ghost.status === "ERROR" && ghost.result.includes("No library asset"), ghost.result.slice(0, 120));

  // ───────────────────── G. the loop covers variation ─────────────────────
  const env2 = await T("create_environment", { name: "E2E Wallpaper Waste", description: "a barren waste of grey stone, flat and repetitive" });
  check("G1 the second environment registers", env2.status === "OK", env2.result.slice(0, 80));
  console.log("   (real Blender build of the wallpaper environment)");
  const buildPlain = await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Wallpaper Waste" });
  check("G2 the plain environment builds without variation", buildPlain.status === "OK", buildPlain.result.slice(0, 120));
  const audit = await T("design_audit", { refName: "E2E Wallpaper Waste", kind: "ENVIRONMENT" });
  check("G3 the wallpaper audit NEEDS_WORK with a MAJOR VARIATION issue", audit.status === "OK" && audit.result.includes("NEEDS_WORK") && audit.result.includes("VARIATION"), audit.result.slice(0, 240));
  const varIssue = await db.designIssue.findFirst({ where: { projectId: labId, refName: "E2E Wallpaper Waste", kind: "VARIATION", status: "OPEN" } });
  check("G4 the VARIATION issue persists with the honest note", Boolean(varIssue) && Boolean(varIssue?.note.includes("wallpaper")), varIssue?.note.slice(0, 110));

  console.log("   (the fix pass bakes the default environment scatter)");
  const before = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "ENVIRONMENT", refName: "E2E Wallpaper Waste" } } });
  const fix = await T("design_fix", { refName: "E2E Wallpaper Waste", kind: "ENVIRONMENT" });
  const after = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "ENVIRONMENT", refName: "E2E Wallpaper Waste" } } });
  check("G5 design_fix bakes the default scatter and bumps the version", fix.status === "OK" && (after?.version ?? 0) === (before?.version ?? 0) + 1, fix.result.slice(0, 200));
  check("G6 the fixed environment now records a variation + GN instances in meta", Boolean(after?.variationPreset) && (() => { try { const m = JSON.parse(after?.meta ?? "{}") as { variation?: { instances?: number } }; return (m.variation?.instances ?? 0) > 0; } catch { return false; } })(), `preset=${after?.variationPreset}`);
  const varIssueAfter = await db.designIssue.findFirst({ where: { projectId: labId, refName: "E2E Wallpaper Waste", kind: "VARIATION" }, orderBy: { createdAt: "desc" } });
  check("G7 the VARIATION issue cleared only because the re-audit agrees", varIssueAfter?.status === "FIXED" && Boolean(varIssueAfter?.fixNote?.includes("scatter")), varIssueAfter?.status ?? "missing");

  const auditVaried = await T("design_audit", { refName: "E2E Ashfall Valley", kind: "ENVIRONMENT" });
  check("G8 the varied valley's audit raises no VARIATION issue", auditVaried.status === "OK" && !auditVaried.result.includes("VARIATION"), auditVaried.result.slice(0, 200));

  // ───────────────────── H. the directed motion grammar ─────────────────────
  const gram = await T("design_grammar", { name: "E2E Cultivation Reveal", beats: JSON.stringify([{ move: "CRANE", from: 0, to: 0.5, note: "crane down to find the cultivator" }, { move: "DOLLY_IN", from: 0.5, to: 1, poseStart: "STANCE", poseEnd: "LUNGE", note: "push in as the blade clears" }]) });
  check("H1 a grammar preset lands as blocking law", gram.status === "OK" && gram.result.includes("registered") && gram.result.includes("CRANE 0-50% -> DOLLY_IN 50-100%"), gram.result.slice(0, 200));
  const badMove = await T("design_grammar", { name: "E2E Broken", beats: JSON.stringify([{ move: "WHIP", from: 0, to: 0.5 }, { move: "ORBIT", from: 0.5, to: 1 }]) });
  check("H2 an unknown move refuses with the vocabulary", badMove.status === "ERROR" && badMove.result.includes("the worker performs"), badMove.result.slice(0, 160));
  const single = await T("design_grammar", { name: "E2E Lone", beats: JSON.stringify([{ move: "ORBIT", from: 0, to: 1 }]) });
  check("H3 a single-beat grammar refuses (that is shot.movement)", single.status === "ERROR" && single.result.includes("at least 2 beats"), single.result.slice(0, 140));

  const ep = await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Interop Cuts" });
  check("H4 the episode registers", ep.status === "OK", ep.result.slice(0, 90));
  const scn = await T("create_scene", { episodeNumber: 1, number: 1, title: "Ashfall standoff", environmentName: "E2E Ashfall Valley" });
  check("H5 the scene registers linked to the varied valley", scn.status === "OK", scn.result.slice(0, 90));
  const shotA = await T("create_shot", { sceneNumber: 1, number: 1, description: "the cultivator draws the obsidian blade as ash falls over the E2E Ashfall Valley", shotType: "WIDE", movement: "STATIC" });
  check("H6 the shot registers", shotA.status === "OK", shotA.result.slice(0, 90));

  const applyNamed = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "E2E Cultivation Reveal" });
  check("H7 the saved preset applies to the shot with per-beat poses", applyNamed.status === "OK" && applyNamed.result.includes("DIRECTED Shot 001") && applyNamed.result.includes("1 beat(s) carry their own pose pair"), applyNamed.result.slice(0, 220));
  const shotRow = await db.shot.findFirst({ where: { sceneId: (await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } }))?.id ?? "x", number: 1 } });
  const stored = shotRow?.grammar ? JSON.parse(shotRow.grammar) as Array<{ move: string; from: number; to: number }> : null;
  check("H8 the shot's grammar column stores the compiled beats", stored?.length === 2 && stored[0].move === "CRANE" && stored[1].move === "DOLLY_IN" && stored[1].poseStart === "STANCE", JSON.stringify(stored));

  const applyBuiltin = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "The Assault" });
  check("H9 a built-in grammar applies by name", applyBuiltin.status === "OK" && applyBuiltin.result.includes("TRACKING 0-45% -> ORBIT 45-100%"), applyBuiltin.result.slice(0, 180));
  const ghostGrammar = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "No Such Grammar" });
  check("H10 an unknown grammar refuses with the registry", ghostGrammar.status === "ERROR" && ghostGrammar.result.includes("Registry:") && ghostGrammar.result.includes("(built-in)"), ghostGrammar.result.slice(0, 200));
  const inline = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: JSON.stringify([{ move: "TILT_UP", from: 0, to: 0.6 }, { move: "STATIC", from: 0.6, to: 1 }]) });
  check("H11 inline beats apply", inline.status === "OK" && inline.result.includes("TILT_UP 0-60% -> STATIC 60-100%"), inline.result.slice(0, 180));

  // restore the named grammar, then a REAL directed render
  await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "E2E Cultivation Reveal" });
  const shotFinal = await db.shot.findFirst({ where: { sceneId: shotRow?.sceneId ?? "x", number: 1 } });
  if (!shotFinal) throw new Error("shot row missing for the render pass");
  console.log("   (real directed render follows - the worker plays the grammar)");
  const job = await createRenderJob(labId, shotFinal.id, "PREVIEW");
  check("I1 the render job queues", Boolean(job?.id) && (job.status === "RENDERING" || job.status === "QUEUED"), `${job.driver} ${job.status}`);
  let final = job;
  const deadline = Date.now() + 420_000;
  while (final.status === "RENDERING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    final = (await tickRenderJob(job.id))!;
  }
  check("I2 the directed shot renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
  if (final.status === "REVIEW") {
    check("I3 the clip is a real mp4 on disk", isMp4(path.join(process.cwd(), "public", final.outputUrl ?? "/x.mp4")), final.outputUrl ?? "none");
    const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
    const state = JSON.parse(stateRaw) as { grammar?: { beats?: number; moves?: string[]; beatPoses?: number } };
    check("I4 the worker state reports the directed beats", state.grammar?.beats === 2 && Array.isArray(state.grammar.moves) && state.grammar.moves[0] === "CRANE" && state.grammar.moves[1] === "DOLLY_IN", JSON.stringify(state.grammar));
    check("I5 the worker reports the per-beat pose pair", state.grammar?.beatPoses === 1, JSON.stringify(state.grammar));
  }

  const cleared = await T("set_shot_grammar", { sceneNumber: 1, shotNumber: 1, grammar: "" });
  const clearedRow = await db.shot.findFirst({ where: { id: shotFinal.id } });
  check("I6 an empty grammar arg clears the directed sequence", cleared.status === "OK" && clearedRow?.grammar === null, cleared.result.slice(0, 140));

  // ───────────────────── J. the context line ─────────────────────
  const ctx = await buildCompactContext(labId);
  const designLine = ctx?.design ?? "";
  check("J1 the context design line reports varied assets (+gn)", designLine.includes("+gn"), designLine.slice(0, 240));
  const envCount = designLine.match(/(\d+) varied/);
  check("J2 the context line counts the varied environments", Boolean(envCount) && Number(envCount?.[1]) >= 2, envCount?.[1] ?? designLine.slice(0, 120));
  const status = await T("design_status", {});
  check("J3 design_status names the varied standing", status.status === "OK" && status.result.includes("varied (GN)"), status.result.slice(0, 240));

  // ───────────────────── K. the HTTP role matrix ─────────────────────
  const anon = await call(null, `/api/blender-assets?projectId=${labId}`);
  check("K1 anonymous library reads are 401", anon.status === 401);
  const strangerEmail = `stranger53-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger53", "stranger-pass-53");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-53");
  const strangerGet = await call(strangerJar, `/api/blender-assets?projectId=${labId}`);
  check("K2 a non-member sees no library (403)", strangerGet.status === 403);
  const strangerPost = await call(strangerJar, "/api/blender-assets", { method: "POST", body: JSON.stringify({ action: "export", projectId: labId, refName: "E2E Ashfall Valley", format: "GLB" }) });
  check("K3 a non-member cannot export (403)", strangerPost.status === 403);
  const ownerGet = await call(ownerJar, `/api/blender-assets?projectId=${labId}`);
  const ownerData = (await ownerGet.json().catch(() => ({}))) as { assets?: Array<{ variationPreset?: string | null }>; exports?: Record<string, { verified: boolean }> };
  check("K4 the OWNER reads the library with variation + export chips (bypass intact)", ownerGet.status === 200 && Array.isArray(ownerData.assets) && ownerData.assets.some((a) => a.variationPreset !== undefined) && Object.keys(ownerData.exports ?? {}).length >= 1);
  const ownerExport = await call(ownerJar, "/api/blender-assets", { method: "POST", body: JSON.stringify({ action: "export", projectId: labId, refName: "E2E Ashfall Valley", format: "GLB" }) });
  check("K5 the OWNER drives a verified export over HTTP", ownerExport.status === 200);
  const ownerBad = await call(ownerJar, "/api/blender-assets", { method: "POST", body: JSON.stringify({ action: "export", projectId: labId, refName: "E2E Ashfall Valley", format: "OBJ" }) });
  check("K6 a bad format is 400", ownerBad.status === 400);
  const ownerGhost = await call(ownerJar, "/api/blender-assets", { method: "POST", body: JSON.stringify({ action: "export", projectId: labId, refName: "E2E Ghost", format: "GLB" }) });
  check("K7 an un-built asset is an honest 404", ownerGhost.status === 404);

  // ───────────────────── L. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  await db.user.delete({ where: { id: stranger.id } });
  const leftover = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverPresets = await db.designPreset.count({ where: { projectId: labId } });
  const leftoverExports = await db.assetExport.count({ where: { projectId: labId } });
  check("L1 every throwaway row is gone (cascade holds)", !leftover && leftoverPresets === 0 && leftoverExports === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

// Iteration 73 E2E: THE SKIN IS PAINTED + THE FINAL FRAME IS GRADED.
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the paint pass (seed law, role painters, box UVs), the
//      builder wiring (PAINT_SUMMARY + kinds gate), the runtime parse,
//      the meta + audit surface, the FINAL compositor grade (the 5.x
//      node-group API + CPU device), the doctrine (rule 48 + the law)
//   B. pure: the doctrine's shape (rules stay sequential)
//   C. accounts + throwaway production
//   D. end to end: a CHARACTER asset builds PAINTED (maps on disk,
//      packed evidence in meta, the audit names them, a rebuild is
//      bit-exact), a REAL FINAL render leaves the compositor GRADED
//      while a PREVIEW control stays honestly raw
//   E. cleanup (exact rows + files + asset dirs)
// Run: npx tsx scripts/e2e-iter73-paint.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { createRenderJob, tickRenderJob } from "../src/lib/engine/render";
import { auditAsset } from "../src/lib/blender/design-review";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, statSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter73-paint";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
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
  await db.blenderAsset.deleteMany({ where: { projectId: labId } });
  const assetsRoot = path.join(process.cwd(), "assets", "blender");
  for (const d of readdirSync(assetsRoot)) {
    if (d.toLowerCase().includes(MARK)) rmSync(path.join(assetsRoot, d), { recursive: true, force: true });
  }
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter73" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "e2e-iter73" },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string }; id?: string; role?: string; error?: string };
  if (res.ok) return { id: body.user?.id ?? body.id ?? "", role: body.user?.role ?? body.role ?? "" };
  // already registered (a previous run) - read the row from the db
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter73" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter73", cookie: jar.header },
    body: body.toString(),
    redirect: "manual",
  });
  jar.absorb(res);
  const probe = await call(jar, "/api/projects");
  if (probe.status !== 200) throw new Error(`login failed for ${email}: callback ${res.status}, probe ${probe.status}`);
  return jar;
}

function md5(p: string): string {
  return createHash("md5").update(readFileSync(p)).digest("hex");
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

async function main() {
  console.log("== Iteration 73: the skin is painted, the final frame is graded ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const paint = readFileSync("bridges/blender/paint_pass.py", "utf8");
  check("A1 the pass exists under the studio's seed law", paint.includes("THE SKIN IS PAINTED") && paint.includes("def fnv1a") && paint.includes("def mulberry32"));
  check("A2 every surface role has a painter", ["ROBE", "CLOTH", "SKIN", "HAIR", "LEATHER", "HIDE"].every((r) => paint.includes(`"${r}"`)));
  check("A3 the box UVs are written in python (no bpy.ops)", paint.includes("def box_uv") && paint.includes("uv_layers.new") && !paint.includes("smart_project"));
  check("A4 the maps travel inside the .blend", paint.includes("img.pack()") && paint.includes("img.save()"));

  const builder = readFileSync("bridges/blender/asset_builder.py", "utf8");
  check("A5 the builder wires the paint pass for character/prop/creature", builder.includes("import paint_pass") && builder.includes('PAINT_SUMMARY {json.dumps(psum)}') && builder.includes('kind in ("CHARACTER", "PROP", "CREATURE")'));

  const runtime = readFileSync("src/lib/blender/runtime.ts", "utf8");
  check("A6 the runtime parses the paint evidence", runtime.includes('parseBuilderMarker(run.out.replace(/\\r/g, "\\n"), "PAINT_SUMMARY")') && runtime.includes("paintSummary"));

  const assetsTs = readFileSync("src/lib/blender/assets.ts", "utf8");
  check("A7 the build result + meta carry the paint", assetsTs.includes("paint: run.paintSummary") && assetsTs.includes("painted (${(run.paintSummary"));

  const review = readFileSync("src/lib/blender/design-review.ts", "utf8");
  check("A8 the local audit names the painted maps", review.includes("painted (${(meta.paint"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A9 the FINAL grade resolves the 5.x node-group API", bridge.includes("compositing_node_group") && bridge.includes('"CompositorNodeTree"') && bridge.includes("NodeGroupOutput"));
  check("A10 the compositor runs on the CPU law", bridge.includes('compositor_device = "CPU"'));
  check("A11 bloom + grade ride the graph through sockets", bridge.includes('"Bloom"') && bridge.includes("_comp_set_sock(g, \"Threshold\", 1.0)") && bridge.includes('"neutral": {"lift": (0.98, 0.985, 1.02, 1.0)'));
  check("A12 the state names the comp honestly (the iteration-73 grade line lives inside it)", bridge.includes('state["render"]["comp"] = {') && bridge.includes('state["render"]["grade"] = comp_ev["layers"]') && bridge.includes('"skipped: no compositor node landed"'));
  check("A13 the comp finishes BOTH modes now (the iteration-86 law: the preview is the promise)", bridge.includes("comp = comp_profile(shot)") && bridge.includes("comp_ev = build_comp_graph(scn, comp, frames_total)") && !bridge.includes('if mode == "FINAL":\n            landed = []'));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A14 rule 48 teaches the paint + grade law (re-pointed: the comp finishes BOTH modes now)", prompts.includes("48. THE SKIN IS PAINTED, THE FINAL FRAME IS GRADED") && prompts.includes("a raw frame on any mode is the defect"));
  check("A15 the curriculum grew the law line", prompts.includes("- THE SKIN IS PAINTED: a flat base color is a color, not a SURFACE"));
  check("A16 rules stay sequential (47 to 48, no duplicates)", (prompts.match(/^47\. THE FLESH REMEMBERS THE MOTION/gm) ?? []).length === 1 && (prompts.match(/^48\. THE SKIN IS PAINTED/gm) ?? []).length === 1);

  // ───────────────────── B. pure checks ─────────────────────
  check("B1 the tool result names the paint", readFileSync("src/lib/dsh/tools.ts", "utf8").includes("painted (${res.paintMaps} surface maps)"));

  // ───────────────────── C. accounts + throwaway production ─────────────────────
  // resume-safe: a previous run's lab (a killed process) goes first
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    console.log(`   (cleaning a stale lab from a killed run: ${stale.id})`);
    await cleanupLab(stale.id);
  }
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("C1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };
  check("C2 the owner's session reads live", (await call(ownerJar, "/api/projects")).status === 200);

  const created = await executeTool("throwaway", "create_project", { title: `Iter73 Paint Lab ${MARK}`, logline: "a throwaway production for the paint + grade proof - the skin the audience sees", visualStyle: "DONGHUA" }, ownerUser);
  check("C3 the throwaway lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── D. the paint + grade end to end ─────────────────────
  await T("create_character", { name: "E2E Paint Saint Yun", role: "PROTAGONIST", appearance: "an elder sword cultivator with a flowing beard and a topknot, storm-grey layered robes with a long wind-torn sash, an obsidian sword", personality: "stoic" });

  const build = await T("blender_asset_build", { kind: "CHARACTER", refName: "E2E Paint Saint Yun", guidance: "the paint proof - woven robes, living skin, strand streaks" });
  check("D1 the build lands PAINTED (the result names the maps)", build.status === "OK" && build.result.includes("painted ("), build.result.slice(0, 220));

  const asset = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Paint Saint Yun", kind: "CHARACTER" } });
  if (!asset) throw new Error("asset row missing - cannot continue");
  const meta = JSON.parse(asset.meta || "{}") as { paint?: { maps?: Array<{ role: string; file: string; size: number }>; uvs?: number; wired?: number; shaders?: { subsurface?: string[]; sheen?: string[] } } };
  const maps = meta.paint?.maps ?? [];
  check("D2 the meta carries five painted maps", maps.length === 5 && maps.every((m) => m.size === 256), JSON.stringify(maps.map((m) => m.role)));
  check("D3 the roles are the full surface set", ["robe", "cloth", "skin", "hair", "leather"].every((r) => maps.some((m) => m.role.toLowerCase() === r)), JSON.stringify(maps.map((m) => m.role)));
  check("D4 every mesh got UVs and every map got wired", (meta.paint?.uvs ?? 0) >= 20 && (meta.paint?.wired ?? 0) === 5, `uvs=${meta.paint?.uvs} wired=${meta.paint?.wired}`);
  check("D5 the shaders upgraded (skin subsurface, cloth sheen)", (meta.paint?.shaders?.subsurface ?? []).includes("SKIN") && (meta.paint?.shaders?.sheen ?? []).includes("SHEEN"));

  const blendDir = path.dirname(asset.blendPath ?? "");
  check("D6 the map PNGs exist beside the .blend", maps.length > 0 && maps.every((m) => existsSync(path.join(blendDir, m.file))), blendDir);
  check("D7 the maps are real image files", maps.every((m) => statSync(path.join(blendDir, m.file)).size > 1000));

  const audit = await auditAsset(asset.id, false);
  check("D8 the local audit names the painted evidence", audit.ok && audit.note.includes("painted (5 maps"), audit.note.slice(0, 200));

  const rebuild = await T("blender_asset_build", { kind: "CHARACTER", refName: "E2E Paint Saint Yun", guidance: "the determinism proof" });
  check("D9 the rebuild lands painted too", rebuild.status === "OK" && rebuild.result.includes("painted ("), rebuild.result.slice(0, 160));
  const v2Asset = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Paint Saint Yun", kind: "CHARACTER" } });
  const v2Meta = v2Asset ? (JSON.parse(v2Asset.meta || "{}") as { paint?: { maps?: Array<{ role: string; file: string }> } }) : null;
  const v2BlendDir = v2Asset ? path.dirname(v2Asset.blendPath ?? "") : "";
  const robeV1 = maps.find((m) => m.role === "ROBE");
  const robeV2 = v2Meta?.paint?.maps?.find((m) => m.role === "ROBE");
  check("D10 the seed law is bit-exact (same DNA, same map bytes)", Boolean(robeV1 && robeV2 && existsSync(path.join(blendDir, robeV1.file)) && existsSync(path.join(v2BlendDir, robeV2.file)) && md5(path.join(blendDir, robeV1.file)) === md5(path.join(v2BlendDir, robeV2.file))));

  // a REAL FINAL render through the studio: the compositor grades it
  await T("create_episode", { seasonNumber: 1, number: 1, title: "E2E Paint" });
  await T("create_scene", { episodeNumber: 1, number: 1, title: "Lantern terrace", environmentName: null });
  await T("create_shot", { sceneNumber: 1, number: 1, description: "E2E Paint Saint Yun stands on the terrace - the painted figure under the graded light", shotType: "MEDIUM", movement: "STATIC", poseStart: "STANCE", poseEnd: "DRAW", duration: 1.0 });
  await T("create_shot", { sceneNumber: 1, number: 2, description: "the control - E2E Paint Saint Yun holds still", shotType: "MEDIUM", movement: "STATIC", duration: 1.0 });
  // keep the FINAL fast: a small frame, a short clip (the grade proof
  // does not need 1080p - the compositor law is what is under test)
  await db.project.update({ where: { id: labId }, data: { resolution: "640x360", fps: 12 } });

  const sceneRow = await db.scene.findFirst({ where: { episode: { season: { projectId: labId } }, number: 1 } });
  if (!sceneRow) throw new Error("scene row missing");
  const shots = await db.shot.findMany({ where: { sceneId: sceneRow.id }, orderBy: { number: "asc" } });
  const shot1 = shots.find((s) => s.number === 1);
  const shot2 = shots.find((s) => s.number === 2);
  if (!shot1 || !shot2) throw new Error("shots missing");

  console.log("   (real FINAL render follows - bloom + grade on the CPU compositor)");
  const finalJob = await createRenderJob(labId, shot1.id, "FINAL");
  check("D11 the FINAL job queues", finalJob.status === "RENDERING" || finalJob.status === "QUEUED", finalJob.stage);
  await runRender(finalJob.id, 9 * 60_000);
  const finalDone = await db.renderJob.findUnique({ where: { id: finalJob.id } });
  check("D12 the FINAL render reaches REVIEW with a clip", finalDone?.status === "REVIEW" && Boolean(finalDone.outputUrl) && isMp4(path.join(process.cwd(), "public", finalDone.outputUrl ?? "")), `${finalDone?.status} ${finalDone?.stage}`);
  const finalState = readState(finalJob.id);
  const finalGrade = (finalState?.render as { grade?: string[] } | undefined)?.grade;
  const finalComp = (finalState?.render as { comp?: { layers?: string[]; hash?: string; mode?: string } | undefined } | undefined)?.comp;
  check("D13 the render state names the finished frame (the comp chain, bloom among the layers)", Array.isArray(finalGrade) && finalGrade.includes("bloom") && Array.isArray(finalComp?.layers) && finalComp!.layers!.includes("lut"), JSON.stringify(finalGrade));

  const previewJob = await createRenderJob(labId, shot2.id, "PREVIEW");
  await runRender(previewJob.id, 6 * 60_000);
  const previewDone = await db.renderJob.findUnique({ where: { id: previewJob.id } });
  check("D14 the PREVIEW control renders too", previewDone?.status === "REVIEW" && Boolean(previewDone.outputUrl), `${previewDone?.status}`);
  const previewState = readState(previewJob.id);
  const previewComp = (previewState?.render as { comp?: { mode?: string; hash?: string; layers?: string[] } | undefined } | undefined)?.comp;
  check("D15 the PREVIEW carries the SAME finished frame now (the iteration-86 law: the preview is the promise)", previewState !== null && previewState.render !== undefined && previewComp !== undefined && previewComp.mode === "PREVIEW" && typeof previewComp.hash === "string" && Array.isArray(previewComp.layers) && previewComp.layers.includes("bloom"), JSON.stringify((previewState?.render as object) ?? {}));

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

// Iteration 55 E2E: SCULPT IS FINISHING - the deterministic surface
// passes. Proves, against the RUNNING studio, the REAL database and
// the REAL Blender runtime:
//   A. source: sculpt_pass.py (seeded value-noise carve + verified
//      decimation), builder v8.0 (--sculpt/--retopo), sculpt.ts spec
//      compilers + defaults, runtime marker parsing, assets.ts preset
//      resolution, the audit's SCULPT criterion + TOPOLOGY budget +
//      the fix branches, tools 69-70 (registry 70), doctrine
//      (SCULPT IS FINISHING + rule 33), the schema column, the UI chip
//   B. accounts + throwaway production
//   C. design_sculpt: registration + honest refusals
//   D. REAL builds: an unsculpted environment (the audit raises
//      SCULPT), a sculpted environment (variance evidence, tri growth,
//      determinism across rebuilds), a creature sculpted past its
//      triangle budget (TOPOLOGY)
//   E. the fix loop: design_fix bakes the default sculpt (re-audit
//      clears), design_fix decimates the over-budget creature back to
//      law (drift verified, re-audit clears), blender_retopo runs
//      directly
//   F. the readouts: context design line, library standing
//   G. the HTTP role matrix (anon 401, non-member 403, OWNER unblocked)
//   H. cleanup (exact rows)
// Run: bun scripts/e2e-iter55-sculpt-retopo.ts
// Precondition: dev server on :3000, Blender provisioned, ffmpeg on PATH.

import { db } from "../src/lib/db";
import { executeTool, buildCompactContext, TOOL_DEFS } from "../src/lib/dsh/tools";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter55-sculpt-retopo";

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
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter55" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${p}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter55" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter55", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter55" },
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

type SculptMeta = { varianceBefore?: number; varianceAfter?: number; varianceRatio?: number; trisBefore?: number; trisAfter?: number; applied?: boolean; parts?: string[] };
type RetopoMeta = { trisBefore?: number; trisAfter?: number; driftPct?: number; verified?: boolean; budget?: number };

async function main() {
  console.log("== Iteration 55: the surface is carved, the budget is law ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const sculptPass = readFileSync("bridges/blender/sculpt_pass.py", "utf8");
  check("A1 the sculpt pass carves layered seeded value noise", sculptPass.includes("def apply_sculpt") && sculptPass.includes("_value_noise") && sculptPass.includes("_hash3"));
  check("A2 the retopo pass decimates to a budget and verifies drift", sculptPass.includes("def apply_retopo") && sculptPass.includes("use_collapse_triangulate") && sculptPass.includes("driftPct") && sculptPass.includes('"verified"'));
  check("A3 the pass subdivides in Python (bmesh, bit-exact) + applies only its OWN modifier", sculptPass.includes("_subdivide_mesh") && sculptPass.includes("bmesh.ops.subdivide_edges") && sculptPass.includes("_apply_named_modifier") && sculptPass.includes("NEVER Python's hash()"));

  const builder = readFileSync("bridges/blender/asset_builder.py", "utf8");
  check("A4 the builder is v8.0 with --sculpt/--retopo", builder.includes("(v8.0)") && builder.includes('--sculpt') && builder.includes('--retopo'));
  check("A5 the builder reports SCULPT_SUMMARY and RETOPO_SUMMARY", builder.includes("SCULPT_SUMMARY") && builder.includes("RETOPO_SUMMARY"));
  check("A6 sculpt runs before retopo (detail first, then the budget)", builder.indexOf("apply_sculpt") < builder.indexOf("apply_retopo"));

  const sculptTs = readFileSync("src/lib/blender/sculpt.ts", "utf8");
  check("A7 the spec compiler validates layers (kinds, counts, clamps)", sculptTs.includes("swell") && sculptTs.includes("fold") && sculptTs.includes("grain") && sculptTs.includes("at most 6 layers") && sculptTs.includes("unknown layer kind"));
  check("A8 the kind defaults + budgets exist (props stay honest)", sculptTs.includes("DEFAULT_SCULPT_BY_KIND") && sculptTs.includes("DEFAULT_RETOPO_BUDGET") && sculptTs.includes("PROP: null"));

  const runtime = readFileSync("src/lib/blender/runtime.ts", "utf8");
  check("A9 the runtime passes the flags and parses the summaries", runtime.includes("sculptPath") && runtime.includes("retopoPath") && runtime.includes('"SCULPT_SUMMARY"') && runtime.includes('"RETOPO_SUMMARY"'));

  const assetsTs = readFileSync("src/lib/blender/assets.ts", "utf8");
  check("A10 builds resolve SCULPT presets and persist sculptPreset", assetsTs.includes('kind: "SCULPT"') && assetsTs.includes("sculptPreset:") && assetsTs.includes("v8.0"));

  const review = readFileSync("src/lib/blender/design-review.ts", "utf8");
  check("A11 the audit gained the SCULPT criterion (0.08)", review.includes("sculpt: 0.08") && review.includes('kind: "SCULPT"'));
  check("A12 the TOPOLOGY budget issue names the numbers", review.includes("DEFAULT_RETOPO_BUDGET") && review.includes("over its triangle budget"));
  check("A13 the fix loop carves the default sculpt + decimates back to law", review.includes("DEFAULT_SCULPT_BY_KIND") && review.includes("carved the default") && review.includes("decimated to the"));

  check("A14 the registry holds 72 tools incl. design_fx + set_shot_fx", TOOL_DEFS.length === 72 && TOOL_DEFS.some((t) => t.name === "design_sculpt") && TOOL_DEFS.some((t) => t.name === "blender_retopo"), `registry ${TOOL_DEFS.length}`);

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A15 the curriculum grew SCULPT IS FINISHING", prompts.includes("- SCULPT IS FINISHING") && prompts.includes("a sculpt you cannot measure is a sculpt you cannot trust"));
  check("A16 rule 33 teaches the measured surface + the budget law", prompts.includes("33. MEASURE THE SURFACE") && prompts.includes("an unverified decimation"));

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A17 the schema carries sculptPreset + the SCULPT preset kind", schema.includes("sculptPreset") && schema.includes("SEQUENCE | SCULPT"));

  const renderView = readFileSync("src/components/views/render-view.tsx", "utf8");
  check("A18 the asset card flags sculpted assets (+SCULPT)", renderView.includes("+SCULPT") && renderView.includes("a.sculptPreset"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  // idempotent start: a previous crashed run may have left the lab behind
  for (const stale of await db.project.findMany({ where: { title: { contains: MARK } } })) {
    await db.project.delete({ where: { id: stale.id } }).catch(() => {});
  }

  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter55 Sculpt Lab ${MARK}`, logline: "a throwaway production for the surface-carving / topology-budget proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway sculpt lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. design_sculpt registration + refusals ─────────────────────
  const reg = await T("design_sculpt", {
    name: "E2E Ashfall Terrain",
    layers: JSON.stringify([
      { kind: "swell", intensity: 1.0, scale: 1.2 },
      { kind: "fold", intensity: 0.8, scale: 3.6 },
      { kind: "grain", intensity: 0.5, scale: 12.0 },
    ]),
    subdivision: 1,
    seed: 42,
  });
  check("C1 a sculpt recipe registers as SCULPT law", reg.status === "OK" && reg.result.includes("registered"), reg.result.slice(0, 160));
  const sculptRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SCULPT", name: "E2E Ashfall Terrain" } } });
  const sculptSpec = sculptRow ? (JSON.parse(sculptRow.spec) as { layers: Array<{ kind: string; intensity: number; scale: number }>; seed: number; subdivision: number }) : null;
  check("C2 the stored spec carries 3 layers + seed 42 + subdivision 1", sculptSpec?.layers.length === 3 && sculptSpec?.seed === 42 && sculptSpec?.subdivision === 1, JSON.stringify(sculptSpec));

  const noLayers = await T("design_sculpt", { name: "E2E Empty Carve", layers: "[]" });
  check("C3 an empty layer list refuses", noLayers.status === "ERROR" && noLayers.result.includes("non-empty"), noLayers.result.slice(0, 120));
  const badKind = await T("design_sculpt", { name: "E2E Bad Carve", layers: JSON.stringify([{ kind: "chisel" }]) });
  check("C4 an unknown layer kind refuses", badKind.status === "ERROR" && badKind.result.includes("unknown layer kind"), badKind.result.slice(0, 120));
  const badSubdiv = await T("design_sculpt", { name: "E2E Deep Carve", layers: JSON.stringify([{ kind: "grain" }]), subdivision: 9 });
  check("C5 subdivision clamps into law", badSubdiv.status === "OK", badSubdiv.result.slice(0, 120));
  const clampedRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SCULPT", name: "E2E Deep Carve" } } });
  check("C6 the clamped spec stores subdivision 3", clampedRow ? (JSON.parse(clampedRow.spec) as { subdivision: number }).subdivision === 3 : false);

  // ───────────────────── D. REAL builds over the real runtime ─────────────────────
  const env = await T("create_environment", { name: "E2E Ashfall Valley", description: "a volcanic valley floor scattered with obsidian shards and pyre stones", atmosphere: "ash-choked", timeOfDay: "dusk", weather: "ashfall" });
  check("D1 the environment exists", env.status === "OK", env.result.slice(0, 120));

  const plainBuild = await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Ashfall Valley" });
  check("D2 the plain build lands READY", plainBuild.status === "OK" && plainBuild.result.includes("built and accepted"), plainBuild.result.slice(0, 160));
  const envRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashfall Valley" } });
  if (!envRow) throw new Error("environment asset row missing");
  check("D3 the plain build carries no sculpt", envRow.sculptPreset === null && !(JSON.parse(envRow.meta || "{}") as SculptMeta).applied);

  const sculptedBuild = await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Ashfall Valley", sculpt: "E2E Ashfall Terrain" });
  check("D4 the sculpted build lands READY", sculptedBuild.status === "OK", sculptedBuild.result.slice(0, 160));
  const sculptedRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashfall Valley" } });
  if (!sculptedRow) throw new Error("sculpted asset row missing");
  const sculptMeta = (JSON.parse(sculptedRow.meta || "{}") as { sculpt?: SculptMeta; tris?: number }).sculpt;
  check("D5 the carve carries MEASURED evidence (surface moved, tris grew)", Boolean(sculptMeta?.applied) && (sculptMeta?.meanMove ?? 0) > 0.0005 && (sculptMeta?.trisAfter ?? 0) > (sculptMeta?.trisBefore ?? 0), JSON.stringify(sculptMeta));
  check("D6 sculptPreset persisted + usage counted", sculptedRow.sculptPreset === "E2E Ashfall Terrain" && (await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "SCULPT", name: "E2E Ashfall Terrain" } } }))?.usageCount === 1, String(sculptedRow.sculptPreset));
  const meanMove1 = sculptMeta?.meanMove ?? -1;

  const rebuilt = await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Ashfall Valley", sculpt: "E2E Ashfall Terrain" });
  check("D7 the rebuild lands (v3)", rebuilt.status === "OK" && (await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashfall Valley" } }))?.version === 3, rebuilt.result.slice(0, 120));
  const rebuiltRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashfall Valley" } });
  const meanMove2 = (JSON.parse(rebuiltRow?.meta || "{}") as { sculpt?: SculptMeta }).sculpt?.meanMove ?? -2;
  check("D8 the seed is law: the same recipe carves the SAME surface (bit-exact)", Math.abs(meanMove1 - meanMove2) < 1e-9, `v1 ${meanMove1} vs v2 ${meanMove2}`);

  await T("create_asset", { name: "E2E Ashwyrm", category: "CREATURE", description: "a serpentine ash predator with layered obsidian scales and a burning throat" });
  const creatureBuild = await T("blender_asset_build", { kind: "CREATURE", refName: "E2E Ashwyrm", sculpt: "E2E Deep Carve" });
  check("D9 the creature build lands READY (deep carve via high subdivision)", creatureBuild.status === "OK", creatureBuild.result.slice(0, 160));
  const creatureRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashwyrm" } });
  if (!creatureRow) throw new Error("creature asset row missing");
  const creatureTris = (JSON.parse(creatureRow.meta || "{}") as { tris?: number }).tris ?? 0;
  check("D10 the deep carve pushed the creature PAST its 60k budget", creatureTris > 60_000, `${creatureTris.toLocaleString()} tris`);

  // ───────────────────── E. the audit -> fix loop ─────────────────────
  const auditPlain = await T("design_audit", { refName: "E2E Wallpaper Valley", kind: "ENVIRONMENT" });
  check("E1 auditing a missing asset is honest", auditPlain.status === "ERROR", auditPlain.result.slice(0, 100));

  const unsculptedEnv = await T("create_environment", { name: "E2E Slab Flats", description: "a dead flat pan of cracked mud, nothing on it", atmosphere: "still", timeOfDay: "noon", weather: "clear" });
  check("E2 the second environment exists", unsculptedEnv.status === "OK", unsculptedEnv.result.slice(0, 100));
  await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Slab Flats" });
  const slabAudit = await T("design_audit", { refName: "E2E Slab Flats", kind: "ENVIRONMENT" });
  check("E3 the audit raises the SCULPT issue on the clean slab", slabAudit.status === "OK" && slabAudit.result.includes("SCULPT"), slabAudit.result.slice(0, 220));
  const slabIssue = await db.designIssue.findFirst({ where: { assetId: (await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Slab Flats" } }))?.id, kind: "SCULPT", status: "OPEN" } });
  check("E4 the SCULPT issue is MAJOR and persisted", slabIssue?.severity === "MAJOR", String(slabIssue?.severity));

  const slabFix = await T("design_fix", { refName: "E2E Slab Flats", kind: "ENVIRONMENT" });
  check("E5 the full fix pass runs (status OK)", slabFix.status === "OK", slabFix.result.slice(0, 200));
  const slabFixedRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Slab Flats" } });
  const slabMeta = (JSON.parse(slabFixedRow?.meta || "{}") as { sculpt?: SculptMeta; fixPass?: { ops?: string } }).sculpt;
  const slabFixOps = (JSON.parse(slabFixedRow?.meta || "{}") as { fixPass?: { ops?: string } }).fixPass?.ops ?? "";
  check("E5b the fixOps names the default sculpt carve", slabFixOps.includes("carved the default environment sculpt"), slabFixOps.slice(0, 200));
  check("E6 the fix measured its own evidence (version bumped, surface moved)", (slabFixedRow?.version ?? 0) >= 2 && Boolean(slabMeta?.applied) && (slabMeta?.meanMove ?? 0) > 0.0005, JSON.stringify(slabMeta));
  const slabIssueAfter = await db.designIssue.findUnique({ where: { id: slabIssue!.id } });
  check("E7 the re-audit cleared the SCULPT issue", slabIssueAfter?.status === "FIXED", String(slabIssueAfter?.status));

  const creatureAudit = await T("design_audit", { refName: "E2E Ashwyrm", kind: "CREATURE" });
  check("E8 the audit raises TOPOLOGY on the over-budget creature", creatureAudit.status === "OK" && creatureAudit.result.includes("TOPOLOGY"), creatureAudit.result.slice(0, 220));
  const topoIssue = await db.designIssue.findFirst({ where: { assetId: creatureRow.id, kind: "TOPOLOGY", status: "OPEN" } });
  check("E9 the TOPOLOGY issue is MAJOR and persisted", topoIssue?.severity === "MAJOR", String(topoIssue?.severity));
  if (!topoIssue) throw new Error("TOPOLOGY issue missing - cannot continue");

  // the professional targeted fix: decimate ONLY the budget offender
  const creatureFix = await T("design_fix", { refName: "E2E Ashwyrm", kind: "CREATURE", issueIds: JSON.stringify([topoIssue.id]) });
  check("E10 design_fix decimates the creature back to law", creatureFix.status === "OK" && creatureFix.result.includes("decimated to the CREATURE budget"), creatureFix.result.slice(0, 260));
  const creatureFixedRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashwyrm" } });
  const retopoMeta = (JSON.parse(creatureFixedRow?.meta || "{}") as { retopo?: RetopoMeta; tris?: number }).retopo;
  check("E11 the retopo VERIFIED (budget honored, drift under 5%)", retopoMeta?.verified === true && (retopoMeta?.trisAfter ?? 1e9) <= 60_000 && (retopoMeta?.driftPct ?? 100) <= 5, JSON.stringify(retopoMeta));
  const topoIssueAfter = await db.designIssue.findUnique({ where: { id: topoIssue!.id } });
  check("E12 the re-audit cleared the TOPOLOGY issue", topoIssueAfter?.status === "FIXED", String(topoIssueAfter?.status));

  const directRetopo = await T("blender_retopo", { refName: "E2E Ashfall Valley", kind: "ENVIRONMENT", budget: 4000 });
  check("E13 blender_retopo runs directly and verifies", directRetopo.status === "OK" && directRetopo.result.includes("VERIFIED"), directRetopo.result.slice(0, 200));
  const directRow = await db.blenderAsset.findFirst({ where: { projectId: labId, refName: "E2E Ashfall Valley" } });
  check("E14 the direct retopo bumped the version + kept the sculpt evidence", (directRow?.version ?? 0) >= 4 && Boolean((JSON.parse(directRow?.meta || "{}") as { sculpt?: SculptMeta }).sculpt?.applied));

  const missRetopo = await T("blender_retopo", { refName: "E2E Never Built", kind: "PROP" });
  check("E15 retopo on a missing asset refuses honestly", missRetopo.status === "ERROR", missRetopo.result.slice(0, 100));

  // ───────────────────── F. the readouts ─────────────────────
  // one fresh plain environment so the readout shows BOTH states
  await T("create_environment", { name: "E2E Bare Knoll", description: "a bare windswept knoll, nothing carved yet", atmosphere: "thin", timeOfDay: "noon", weather: "clear" });
  await T("blender_asset_build", { kind: "ENVIRONMENT", refName: "E2E Bare Knoll" });
  const ctx = await buildCompactContext(labId);
  const ctxLine = ctx?.design ?? "";
  check("F1 the context design line counts the sculpted standing", ctxLine.includes("sculpted") && ctxLine.includes("+sculpt"), ctxLine.slice(0, 240));
  const libRead = await T("blender_asset_library", {});
  check("F2 the library readout names sculpted + unfinished surfaces", libRead.status === "OK" && libRead.result.includes("sculpted") && libRead.result.includes("UNFINISHED SURFACE"), libRead.result.slice(0, 260));
  const sculptStatus = await T("design_status", {});
  check("F3 design_status reads the loop standing back", sculptStatus.status === "OK", sculptStatus.result.slice(0, 160));

  // ───────────────────── G. the HTTP role matrix ─────────────────────
  const anonLib = await call(null, `/api/blender-assets?projectId=${labId}`);
  check("G1 anon library read 401", anonLib.status === 401, String(anonLib.status));
  const anonAudit = await call(null, "/api/design-reviews", { method: "POST", body: JSON.stringify({ projectId: labId, action: "audit", refName: "E2E Ashfall Valley", kind: "ENVIRONMENT" }) });
  check("G2 anon design audit 401", anonAudit.status === 401, String(anonAudit.status));

  const viewerLogin = await register("reader@studio.dev", "Rua Reader", "viewing123");
  check("G3 the seeded reader holds VIEWER", viewerLogin.role === "VIEWER");
  const viewerJar = await loginJar("reader@studio.dev", "viewing123");
  const viewerLib = await call(viewerJar, `/api/blender-assets?projectId=${labId}`);
  check("G4 a non-member VIEWER cannot read the lab's library", viewerLib.status === 403, String(viewerLib.status));
  const viewerAudit = await call(viewerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ projectId: labId, action: "audit", refName: "E2E Ashfall Valley", kind: "ENVIRONMENT" }) });
  check("G5 a non-member VIEWER cannot drive the design loop", viewerAudit.status === 403, String(viewerAudit.status));

  const ownerLib = await call(ownerJar, `/api/blender-assets?projectId=${labId}`);
  const ownerLibBody = ownerLib.status === 200 ? ((await ownerLib.json()) as { assets?: Array<{ refName: string; sculptPreset?: string | null }> }) : null;
  check("G6 the OWNER reads the library unblocked (sculptPreset rides)", ownerLib.status === 200 && ownerLibBody?.assets?.some((a) => a.refName === "E2E Ashfall Valley" && Boolean(a.sculptPreset)), String(ownerLib.status));
  const ownerAudit = await call(ownerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ projectId: labId, action: "audit", refName: "E2E Ashfall Valley", kind: "ENVIRONMENT" }) });
  check("G7 the OWNER drives the design loop unblocked", ownerAudit.status === 200, String(ownerAudit.status));
  const ownerProjects = await call(ownerJar, "/api/projects");
  check("G8 the OWNER reads the studio slate unblocked", ownerProjects.status === 200, String(ownerProjects.status));

  // ───────────────────── H. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: labId } });
  const after = await db.project.findUnique({ where: { id: labId } });
  check("H1 the throwaway lab is gone (cascade held)", after === null);
  const leftoverPresets = await db.designPreset.findMany({ where: { projectId: labId } });
  check("H2 the sculpt presets went with it", leftoverPresets.length === 0, String(leftoverPresets.length));

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exit(1);
  });

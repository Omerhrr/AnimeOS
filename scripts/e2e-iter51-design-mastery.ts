// Iteration 51 E2E: the DSH becomes a Blender professional.
// Proves, against the RUNNING studio, the REAL database and the REAL
// Blender runtime:
//   A. source: the design-mastery schema (DesignPreset / DesignReview
//      / DesignIssue + asset quality fields), the five new DSH tools,
//      the v5 builders (PROP + CREATURE + material recipes + lighting
//      rigs), the DESIGN MASTERY doctrine (rules 27 + 28), the design
//      context line, the prop-riding render payloads and the gated
//      design-reviews API
//   B. tool-level through the REAL executeTool path: named material
//      recipes and lighting rigs land as production laws, a registered
//      prop and creature build into REAL versioned .blend assets, a
//      build under designed recipes records the pairing, the SELF-
//      CORRECTING LOOP (design_audit -> design_fix -> re-audit) runs a
//      REAL bpy pass with a version bump and an honest issue lifecycle,
//      design_status reads the standing back
//   C. designed props and creatures ride render payloads exactly when
//      the shot text names them
//   D. the HTTP role matrix on the design-reviews API (reads are reads
//      for the crew, audit/fix/retire are writes, the OWNER is never
//      blocked anywhere - not even on a production they have no seat
//      on, with no membership row at all)
// Run: bun scripts/e2e-iter51-design-mastery.ts
// Precondition: dev server on :3000, Blender provisioned (the runtime
// self-provisions otherwise). The script creates its own throwaway
// production and stranger account and cleans every row it made.

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import { assetsForRender } from "../src/lib/blender/assets";
import { readFileSync } from "node:fs";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter51-design-mastery";

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

async function call(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "e2e-iter51" };
  const extra = (init.headers ?? {}) as Record<string, string>;
  if (jar) headers.cookie = jar.header;
  return fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...extra }, redirect: "manual" });
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar = new Jar();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { "user-agent": "e2e-iter51" } });
  jar.absorb(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const body = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${BASE}/`, json: "true" });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "e2e-iter51", cookie: jar.header },
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
    headers: { "content-type": "application/json", "user-agent": "e2e-iter51" },
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

interface IssueRow { id: string; severity: string; kind: string; note: string; status: string }

async function main() {
  console.log("== Iteration 51: the DSH becomes a Blender professional ==\n");

  // ───────────────────── A. source-level checks ─────────────────────
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1 the design-mastery tables exist (DesignPreset, DesignReview, DesignIssue)", ["model DesignPreset", "model DesignReview", "model DesignIssue"].every((m) => schema.includes(m)));
  check("A2 presets are unique per production+kind+name; issues carry a lifecycle", schema.includes("@@unique([projectId, kind, name])") && schema.includes('status    String    @default("OPEN") // OPEN | FIXING | FIXED | WONTFIX'));
  check("A3 assets carry the self-review grade (qualityScore + lastReviewAt)", schema.includes("qualityScore  Float?") && schema.includes("lastReviewAt  DateTime?"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const designTools = ["design_material", "design_lighting", "design_audit", "design_fix", "design_status"];
  check("A4 the five design tools are registered", designTools.every((t) => tools.includes(`name: "${t}"`)));
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A5 the registry grew to 61 tools", toolCount === 61, `count=${toolCount}`);
  check("A6 the build tool now takes four kinds + recipe names", tools.includes('kind: "CHARACTER | ENVIRONMENT | PROP | CREATURE",') && tools.includes("material: \"string (optional - a design_material recipe name") && tools.includes("lighting: \"string (optional - a design_lighting rig name"));

  const builder = readFileSync("bridges/blender/asset_builder.py", "utf8");
  check("A7 the v5 builder supports PROP + CREATURE kinds", builder.includes('kind == "PROP"') && builder.includes('kind == "CREATURE"') && builder.includes("ASSET BUILDER (v5.0)"));
  check("A8 the builder consumes material recipes and lighting rigs", builder.includes("--material") && builder.includes("--rig") && builder.includes("recipe is law over the DNA defaults"));

  const bridge = readFileSync("bridges/blender/animeos_bridge.py", "utf8");
  check("A9 the bridge builds designed props and creatures", bridge.includes("def build_designed_prop") && bridge.includes("def build_designed_creature"));

  const prompts = readFileSync("src/lib/dsh/prompts.ts", "utf8");
  check("A10 DESIGN MASTERY is doctrine (curriculum + rules 27 and 28)", prompts.includes("## DESIGN MASTERY") && prompts.includes("27. DESIGNS ARE AUDITED, NOT ASSUMED") && prompts.includes("28. DESIGN BEFORE RENDER, REGISTER BEFORE DESIGN"));
  check("A11 the self-correcting loop is the stated professional standard", prompts.includes("THE SELF-CORRECTING DESIGN LOOP is the professional standard") && prompts.includes("NEVER call a design done on exit code alone"));

  check("A12 the design context line exists (the standing the director reads)", tools.includes("function designContextLine") && tools.includes("design: designContextLine("));

  const review = readFileSync("src/lib/blender/design-review.ts", "utf8");
  check("A13 the loop is honest about its provider (local audit + vision critique)", review.includes('provider: "vision+local" | "local"') && review.includes("localAudit") && review.includes("visionCritique"));
  check("A14 a fix that did not survive the re-audit stays OPEN", review.includes("but the re-audit still flags"));

  const render = readFileSync("src/lib/engine/render.ts", "utf8");
  check("A15 designed props/creatures ride render payloads named by the shot text", render.includes('shot.scene.title ?? ""') && render.includes("assetRefs.props.length > 0"));
  check("A16 the worker loads named props as real library assets", bridge.includes("propsLoaded") && bridge.includes("PropAnchor"));

  const reviewsRoute = readFileSync("src/app/api/design-reviews/route.ts", "utf8");
  check("A17 the design-reviews API gates reads and writes", (reviewsRoute.match(/requireProjectAccess/g) ?? []).length >= 2 && reviewsRoute.includes("{ write: true }"));

  // ───────────────────── B. accounts + throwaway production ─────────────────────
  const ownerLogin = await register("director@studio.dev", "Lin Director", "anchored2026");
  check("B1 the seeded director holds OWNER", ownerLogin.role === "OWNER");
  const ownerJar = await loginJar("director@studio.dev", "anchored2026");
  const ownerUser = { id: ownerLogin.id, name: "Lin Director", role: "OWNER" };

  const created = await executeTool("throwaway", "create_project", { title: `Iter51 Design Lab ${MARK}`, logline: "a throwaway production for the design-mastery proof", visualStyle: "DONGHUA" }, ownerUser);
  check("B2 the throwaway design lab exists", created.status === "OK", created.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("throwaway project missing - cannot continue");
  const labId = lab.id;
  const T = (name: string, args: Record<string, unknown>) => executeTool(labId, name, args, ownerUser);

  // ───────────────────── C. the recipe registries ─────────────────────
  const mat = await T("design_material", { name: "E2E Spirit Steel", baseColor: "#4a5568", roughness: 0.22, metallic: 0.9 });
  check("C1 a material recipe lands as production law", mat.status === "OK" && mat.result.includes("registered"), mat.result.slice(0, 100));
  const matRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "MATERIAL", name: "E2E Spirit Steel" } } });
  check("C2 the recipe row carries a JSON spec", Boolean(matRow) && Boolean(matRow && (JSON.parse(matRow.spec) as { roughness?: number }).roughness === 0.22));
  const mat2 = await T("design_material", { name: "E2E Spirit Steel", baseColor: "#3d4655", roughness: 0.18 });
  const matRows = await db.designPreset.findMany({ where: { projectId: labId, kind: "MATERIAL", name: "E2E Spirit Steel" } });
  check("C3 re-designing a recipe UPDATES it (never duplicates)", mat2.status === "OK" && matRows.length === 1 && (JSON.parse(matRows[0].spec) as { baseColor?: string }).baseColor === "#3d4655");
  const rig = await T("design_lighting", { name: "E2E Moonlit", keyEnergy: 520, keyColor: "#cfe0ff", rimEnergy: 280, bgStrength: 0.6, camLens: 60 });
  check("C4 a lighting rig lands", rig.status === "OK" && rig.result.includes("registered"), rig.result.slice(0, 100));
  const matEmpty = await T("design_material", { name: "E2E Empty" });
  check("C5 a recipe with no parameters refuses honestly", matEmpty.status === "ERROR");

  // ───────────────────── D. design anything (real builds) ─────────────────────
  const prop = await T("create_asset", { category: "PROP", name: "E2E Azure Seal", description: "a great azure spirit seal, an ornate artifact engraved with glowing runes, polished gold accents" });
  check("D1 the prop registers in the production's asset registry", prop.status === "OK", prop.result.slice(0, 100));
  const creature = await T("create_asset", { category: "CREATURE", name: "E2E Crimson Wyrm", description: "a massive crimson spirit serpent, a divine horned wyrm with a glowing scarlet mane" });
  check("D2 the creature registers", creature.status === "OK", creature.result.slice(0, 100));

  const buildBad = await T("blender_asset_build", { kind: "PROP", refName: "E2E No Such Prop" });
  check("D3 building an unregistered name refuses with the registered list", buildBad.status === "ERROR" && buildBad.result.includes("Registered assets"), buildBad.result.slice(0, 140));

  console.log("   (real Blender builds follow - the runtime is doing actual work)");
  const build = await T("blender_asset_build", { kind: "PROP", refName: "E2E Azure Seal", guidance: "clean artifact silhouette, energy in the runes only" });
  const buildOk = build.status === "OK";
  check("D4 the DESIGNED prop builds into a real .blend (v1)", buildOk && build.result.includes("v1"), build.result.slice(0, 160));
  const propAsset = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Azure Seal" } } });
  const propBlend = propAsset?.blendPath ?? "";
  check("D5 the prop asset is READY with real geometry on disk", propAsset?.status === "READY" && fs.existsSync(propBlend) && (propAsset?.meta ? (JSON.parse(propAsset.meta) as { objects: number }).objects >= 4 : false) && (propAsset?.meta ? (JSON.parse(propAsset.meta) as { tris: number }).tris > 0 : false));

  const buildRigged = await T("blender_asset_build", { kind: "PROP", refName: "E2E Azure Seal", material: "E2E Spirit Steel", lighting: "E2E Moonlit" });
  const propAsset2 = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Azure Seal" } } });
  const meta2 = propAsset2?.meta ? JSON.parse(propAsset2.meta) as { materialRecipe?: { name: string } | null; lightingRig?: { name: string } | null; builderVersion?: string } : null;
  check("D6 the rebuild under designed recipes records the pairing (v2, v5 builder)", buildRigged.status === "OK" && propAsset2?.version === 2 && meta2?.materialRecipe?.name === "E2E Spirit Steel" && meta2?.lightingRig?.name === "E2E Moonlit" && meta2?.builderVersion === "v5.0", buildRigged.result.slice(0, 140));
  const steelRow = await db.designPreset.findUnique({ where: { projectId_kind_name: { projectId: labId, kind: "MATERIAL", name: "E2E Spirit Steel" } } });
  check("D7 consuming a recipe bumps its usage count", (steelRow?.usageCount ?? 0) >= 1, `usage=${steelRow?.usageCount}`);
  const buildGhost = await T("blender_asset_build", { kind: "PROP", refName: "E2E Azure Seal", material: "E2E No Such Recipe" });
  check("D8 an unknown recipe name degrades honestly (build still lands)", buildGhost.status === "OK", buildGhost.result.slice(0, 120));
  const buildRiggedFinal = await T("blender_asset_build", { kind: "PROP", refName: "E2E Azure Seal", material: "E2E Spirit Steel", lighting: "E2E Moonlit" });
  const propAssetFinal = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Azure Seal" } } });
  const metaFinal = propAssetFinal?.meta ? JSON.parse(propAssetFinal.meta) as { materialRecipe?: { name: string } | null; lightingRig?: { name: string } | null } : null;
  check("D8b the final Seal build is rigged (recipes recorded)", buildRiggedFinal.status === "OK" && metaFinal?.materialRecipe?.name === "E2E Spirit Steel" && metaFinal?.lightingRig?.name === "E2E Moonlit");

  const buildCreature = await T("blender_asset_build", { kind: "CREATURE", refName: "E2E Crimson Wyrm" });
  const creatureAsset = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "CREATURE", refName: "E2E Crimson Wyrm" } } });
  check("D9 the DESIGNED creature builds into a real .blend", buildCreature.status === "OK" && creatureAsset?.status === "READY" && fs.existsSync(creatureAsset.blendPath ?? ""), buildCreature.result.slice(0, 160));

  // a prop built WITHOUT recipes keeps the honest defaults (for the loop)
  const plain = await T("create_asset", { category: "PROP", name: "E2E Plain Lantern", description: "a small bronze lantern, weathered" });
  check("D10 the second prop registers", plain.status === "OK");
  const buildPlain = await T("blender_asset_build", { kind: "PROP", refName: "E2E Plain Lantern" });
  check("D11 the plain prop builds (no recipes, default rig)", buildPlain.status === "OK", buildPlain.result.slice(0, 140));
  const plainAsset = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Plain Lantern" } } });

  // ───────────────────── E. the self-correcting design loop ─────────────────────
  const audit = await T("design_audit", { refName: "E2E Plain Lantern", kind: "PROP" });
  const auditOk = audit.status === "OK";
  const auditState = auditOk ? (audit.result.match(/DESIGN AUDIT (NEEDS_WORK|PASSED)/)?.[1] ?? "?") : "?";
  check("E1 design_audit lands a persisted review with a state and bar", auditOk && (auditState === "NEEDS_WORK" || auditState === "PASSED"), audit.result.slice(0, 200));
  const plainReview = await db.designReview.findFirst({ where: { projectId: labId, targetRef: "E2E Plain Lantern" }, orderBy: { createdAt: "desc" } });
  check("E2 the review row carries overall, bar and a provider-honest verdict", Boolean(plainReview) && plainReview?.bar === 0.72 && ["vision+local", "local"].includes(((() => { try { return (JSON.parse(plainReview?.verdict ?? "{}") as { provider?: string }).provider ?? ""; } catch { return ""; } })())));
  const auditOpen = await T("design_audit", { refName: "E2E No Such Asset" });
  check("E3 auditing a missing design refuses honestly", auditOpen.status === "ERROR");

  // the plain prop must carry the default-rig/material advisories (honesty)
  const plainIssues = await db.designIssue.findMany({ where: { projectId: labId, refName: "E2E Plain Lantern", status: "OPEN" } });
  const kinds = new Set(plainIssues.map((i) => i.kind));
  check("E4 the audit names real, concrete issues (severity + kind)", plainIssues.length > 0 && [...kinds].every((k) => ["GEOMETRY", "MATERIAL", "SILHOUETTE", "PROPORTION", "PALETTE", "LIGHTING", "DETAIL", "IDENTITY"].includes(k)), `issues=${plainIssues.length} kinds=${[...kinds].join(",")}`);

  const sweep = await T("design_audit", { library: true });
  check("E5 a library sweep lands a LIBRARY rollup", sweep.status === "OK" && sweep.result.includes("LIBRARY audit"), sweep.result.slice(0, 120));
  const rollup = await db.designReview.findFirst({ where: { projectId: labId, kind: "LIBRARY" }, orderBy: { createdAt: "desc" } });
  check("E6 the rollup row exists", Boolean(rollup));

  console.log("   (the fix pass runs a REAL bpy refinement against the .blend)");
  const beforeFix = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Plain Lantern" } } });
  const fix = await T("design_fix", { refName: "E2E Plain Lantern", kind: "PROP" });
  const afterFix = await db.blenderAsset.findUnique({ where: { projectId_kind_refName: { projectId: labId, kind: "PROP", refName: "E2E Plain Lantern" } } });
  check("E7 design_fix runs a real bpy pass and bumps the version", fix.status === "OK" && (afterFix?.version ?? 0) === (beforeFix?.version ?? 0) + 1, fix.result.slice(0, 160));
  check("E8 the fixed .blend exists on disk (a NEW versioned file)", Boolean(afterFix?.blendPath) && afterFix?.blendPath !== beforeFix?.blendPath && fs.existsSync(afterFix?.blendPath ?? ""));
  const reAudit = await db.designReview.findFirst({ where: { projectId: labId, targetRef: "E2E Plain Lantern", createdAt: { gt: plainReview?.createdAt ?? new Date(0) } }, orderBy: { createdAt: "desc" } });
  check("E9 the fix pass RE-AUDITS (a fresh review lands)", Boolean(reAudit) && reAudit?.id !== plainReview?.id);
  const lifecycle = await db.designIssue.findMany({ where: { projectId: labId, refName: "E2E Plain Lantern" } });
  const lifecycleHonest = lifecycle.length > 0 && lifecycle.every((i) => ["OPEN", "FIXING", "FIXED", "WONTFIX"].includes(i.status) && (i.status !== "FIXED" || Boolean(i.fixNote)) && (i.status !== "OPEN" || !i.fixedAt));
  check("E10 the issue lifecycle is honest (FIXED carries the fix note)", lifecycleHonest, `rows=${lifecycle.map((i) => `${i.kind}:${i.status}`).join(",")}`);
  const auditRigged = await T("design_audit", { refName: "E2E Azure Seal", kind: "PROP" });
  check("E11 the recipe-built prop audits cleaner (no default-rig/material advisories)", auditRigged.status === "OK" && !auditRigged.result.includes("default studio rig") && !auditRigged.result.includes("DNA color defaults"), auditRigged.result.slice(0, 220));
  const status = await T("design_status", {});
  check("E12 design_status reads the standing back", status.status === "OK" && status.result.includes("DESIGN STATUS") && status.result.includes("E2E Azure Seal"), status.result.slice(0, 200));

  // ───────────────────── F. props ride render payloads ─────────────────────
  const withProp = await assetsForRender(labId, [], null, "the seal cracks as the seal glows - E2E Azure Seal spins");
  check("F1 a shot text naming the prop gets the DESIGNED prop in the payload", withProp.props.length === 1 && withProp.props[0].name === "E2E Azure Seal" && fs.existsSync(withProp.props[0].path), `props=${withProp.props.map((p) => p.name).join(",")}`);
  const withCreature = await assetsForRender(labId, [], null, "the E2E Crimson Wyrm coils around the pillar");
  check("F2 a shot text naming the creature gets the DESIGNED creature", withCreature.props.some((p) => p.name === "E2E Crimson Wyrm"));
  const noText = await assetsForRender(labId, [], null, "an empty corridor with no named artifacts");
  check("F3 an unnamed shot loads no props (honest absence)", noText.props.length === 0, `props=${noText.props.map((p) => p.name).join(",")}`);

  // ───────────────────── G. the HTTP role matrix ─────────────────────
  const anon = await call(null, `/api/design-reviews?projectId=${labId}`);
  check("G1 anonymous reads are 401", anon.status === 401);

  const strangerEmail = `stranger51-${Date.now()}@studio.dev`;
  const stranger = await register(strangerEmail, "Stranger51", "stranger-pass-51");
  const strangerJar = await loginJar(strangerEmail, "stranger-pass-51");
  const strangerGet = await call(strangerJar, `/api/design-reviews?projectId=${labId}`);
  check("G2 a non-member sees no design standing (403)", strangerGet.status === 403);
  const strangerPost = await call(strangerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ action: "audit", projectId: labId, library: true }) });
  check("G3 a non-member cannot drive the design loop (403)", strangerPost.status === 403);

  const ownerGet = await call(ownerJar, `/api/design-reviews?projectId=${labId}`);
  const ownerData = (await ownerGet.json().catch(() => ({}))) as { bySeverity?: unknown; assets?: unknown[] };
  check("G4 the OWNER reads the design standing (bypass ordered before any lookup)", ownerGet.status === 200 && Boolean(ownerData.bySeverity) && Array.isArray(ownerData.assets));

  // a crew VIEWER may read but never drive the loop
  await db.projectMembership.create({ data: { projectId: labId, userId: stranger.id, craft: "REVIEW" } });
  const crewGet = await call(strangerJar, `/api/design-reviews?projectId=${labId}`);
  check("G5 a crew member reads the standing (reads are reads)", crewGet.status === 200);
  const crewPost = await call(strangerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ action: "audit", projectId: labId, library: true }) });
  check("G6 a VIEWER crew member is read-only (403 at the proxy)", crewPost.status === 403, `got ${crewPost.status}`);
  await db.projectMembership.delete({ where: { projectId_userId: { projectId: labId, userId: stranger.id } } });

  // the OWNER drives the loop on a stranger's production with no seat
  const strangerProject = await db.project.create({ data: { title: `Stranger Lab ${MARK}`, logline: "not the owner's production", visualStyle: "ANIME" } });
  const ownerDrive = await call(ownerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ action: "audit", projectId: strangerProject.id, library: true }) });
  const ownerDriveData = (await ownerDrive.json().catch(() => ({}))) as { ok?: boolean; audited?: number };
  check("G7 the OWNER drives the loop anywhere, unblocked (empty sweep passes)", ownerDrive.status === 200 && ownerDriveData.ok === true && ownerDriveData.audited === 0, JSON.stringify(ownerDriveData).slice(0, 120));
  const ownerFixMissing = await call(ownerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ action: "fix", projectId: strangerProject.id, refName: "No Such Asset" }) });
  check("G8 fixing a missing asset is a 404, never a crash", ownerFixMissing.status === 404);

  const stillOpen = await db.designIssue.findMany({ where: { projectId: labId, status: "OPEN" } });
  const retire = await call(ownerJar, "/api/design-reviews", { method: "POST", body: JSON.stringify({ action: "retire", projectId: labId, issueIds: [stillOpen[0]?.id ?? "no-such"], note: "deliberate roadmap for the E2E" }) });
  const retireData = (await retire.json().catch(() => ({}))) as { ok?: boolean; retired?: number };
  check("G9 retire marks an open issue WONTFIX with a note", retire.status === 200 && retireData.ok === true && (retireData.retired ?? 0) === 1, JSON.stringify(retireData).slice(0, 100));

  // ───────────────────── H. cleanup (exact rows) ─────────────────────
  await db.project.delete({ where: { id: strangerProject.id } });
  await db.project.delete({ where: { id: labId } });
  await db.user.delete({ where: { id: stranger.id } });
  const leftoverLab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  const leftoverReviews = await db.designReview.count({ where: { projectId: labId } });
  check("H1 every throwaway row is gone (cascade holds)", !leftoverLab && leftoverReviews === 0);

  console.log(`\n${failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("E2E crashed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

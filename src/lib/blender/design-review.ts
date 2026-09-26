import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import { runBlenderScript, runAssetBuilder, runtimeBlenderBin } from "@/lib/blender/runtime";
import { DEFAULT_MOTION_BY_ARCHETYPE } from "@/lib/blender/motion";
import { DEFAULT_VARIATION_BY_KIND } from "@/lib/blender/variation";

// ─────────────────────────────────────────────────────────────
// THE SELF-CORRECTING DESIGN LOOP (the studio checks its own work)
//
// A professional 3D designer does not call a design done when the
// build command exits 0: they LOOK at it, name what is wrong, fix
// it, and look again. This module is that loop, persisted:
//
//   design_audit   -> one DesignReview row with per-criterion scores
//                     (local deterministic audit ALWAYS, plus a
//                     vision critique when the provider answers) and
//                     one DesignIssue row per concrete finding.
//   design_fix     -> compiles a targeted bpy refinement script from
//                     the OPEN issues, runs it against the accepted
//                     .blend (real Blender), saves a new VERSION,
//                     re-renders the preview, re-audits, and marks
//                     issues FIXED only when the re-audit agrees.
//   design_status  -> the standing readout (what is open, how bad,
//                     what already cleared the bar).
//
// Honesty rules: the local audit never invents vision numbers (the
// verdict names its provider); a fix that did not survive the
// re-audit stays OPEN with the fix note attached.
// ─────────────────────────────────────────────────────────────

export const DESIGN_BAR = 0.72;

export type DesignCriteria = {
  geometry: number; // real, named part hierarchy with sane density
  material: number; // designed materials, principled params in range
  silhouette: number; // the preview reads as the thing it is
  palette: number; // coherent, purposeful colors
  lighting: number; // judged under a DESIGNED rig or honestly default
  detail: number; // finishing pass present (bevels, smoothing, runes)
  motion: number; // a baked performance (armature + loop) or honest N/A
  variation: number; // a GN scatter/array (the set breathes) or honest N/A
};

export interface ReviewVerdict {
  criteria: DesignCriteria;
  overall: number;
  note: string;
  provider: "vision+local" | "local";
  issues: Array<{ severity: "CRITICAL" | "MAJOR" | "MINOR"; kind: string; note: string }>;
}

const CRITERIA_KEYS: Array<keyof DesignCriteria> = ["geometry", "material", "silhouette", "palette", "lighting", "detail", "motion", "variation"];

// The weighted overall: geometry and silhouette still lead, MOTION
// carries production weight (a statue is not a donghua asset) and
// VARIATION holds the fourth law (a wallpaper is not a set).
const CRITERIA_WEIGHTS: Record<keyof DesignCriteria, number> = {
  geometry: 0.22,
  material: 0.14,
  silhouette: 0.18,
  palette: 0.09,
  lighting: 0.09,
  detail: 0.07,
  motion: 0.12,
  variation: 0.09,
};

function weightedOverall(c: DesignCriteria): number {
  return clamp01(CRITERIA_KEYS.reduce((acc, k) => acc + c[k] * CRITERIA_WEIGHTS[k], 0));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function previewBytes(previewPath: string | null): number {
  if (!previewPath) return 0;
  const rel = previewPath.replace(/^\/assets-blender\//, "");
  try {
    return fs.statSync(path.join(process.cwd(), "public", "assets-blender", rel)).size;
  } catch {
    return 0;
  }
}

// Per-kind builder-contract minimums: the deterministic builders
// always emit at least this much real hierarchy (v5.0 builders).
const KIND_FLOOR: Record<string, { objects: number; tris: number }> = {
  CHARACTER: { objects: 20, tris: 2000 },
  ENVIRONMENT: { objects: 8, tris: 800 },
  PROP: { objects: 4, tris: 300 },
  CREATURE: { objects: 6, tris: 600 },
};

function scoreRatio(value: number, floor: number): number {
  if (floor <= 0) return 1;
  return clamp01(value / floor);
}

/** The LOCAL deterministic audit - provider-free, always available. */
function localAudit(asset: {
  kind: string;
  status: string;
  version: number;
  previewPath: string | null;
  loopPath: string | null;
  motionPreset: string | null;
  variationPreset: string | null;
  identityScore: number | null;
  meta: string | null;
}): ReviewVerdict {
  const bytes = previewBytes(asset.previewPath);

  type AssetMeta = {
    objects?: number;
    tris?: number;
    lightingRig?: { name: string } | null;
    materialRecipe?: { name: string } | null;
    motion?: { name?: string; archetype?: string; motion?: string } | null;
    variation?: { name?: string; kind?: string; instances?: number } | null;
    dna?: { archetype?: string } | null;
  };
  let meta: AssetMeta | null = null;
  try {
    meta = JSON.parse(asset.meta || "null") as AssetMeta;
  } catch {
    meta = null;
  }
  const objects = meta?.objects ?? 0;
  const tris = meta?.tris ?? 0;
  const floor = KIND_FLOOR[asset.kind] ?? KIND_FLOOR.PROP;

  const geometry = asset.status === "READY"
    ? clamp01((scoreRatio(objects, floor.objects) + scoreRatio(tris, floor.tris)) / 2)
    : 0;
  // materials: the builders emit a deterministic multi-material set;
  // a designed recipe lifts it (the recipe IS the material pass).
  const material = meta?.materialRecipe ? 0.9 : asset.status === "READY" ? 0.68 : 0.2;
  // silhouette/detail: a contentful preview render is the evidence we
  // can read without a provider (a black void render is tiny on disk).
  const silhouette = bytes >= 30_000 ? 0.78 : bytes > 0 ? 0.35 : 0;
  let detail = 0.5;
  if (meta?.lightingRig) detail += 0.2;
  if (asset.kind === "CHARACTER" && asset.identityScore !== null && asset.identityScore >= 0.6) detail += 0.15;
  if (asset.version >= 4) detail -= 0.1; // heavy churn - the design text may be unstable
  detail = clamp01(detail);
  const palette = meta?.materialRecipe ? 0.8 : 0.6;
  const lighting = meta?.lightingRig ? 0.85 : 0.55; // honest: default studio rig

  // MOTION: props and creatures are judged on their performance
  // (a baked armature + the rendered loop on disk are the evidence);
  // characters perform through the directed pose system and sets are
  // static by design - both score as honest N/A.
  const loopOnDisk = asset.loopPath ? loopBytes(asset.loopPath) > 1_000 : false;
  let motion: number;
  const motionIssues: ReviewVerdict["issues"] = [];
  if (asset.kind === "PROP" || asset.kind === "CREATURE") {
    if (asset.motionPreset && loopOnDisk) {
      motion = 0.92;
    } else if (asset.motionPreset) {
      motion = 0.5;
      motionIssues.push({ severity: "MAJOR", kind: "MOTION", note: "a motion preset is recorded but the preview loop is missing on disk - rebuild with motion to re-bake the performance" });
    } else {
      motion = 0.3;
      motionIssues.push({ severity: "MAJOR", kind: "MOTION", note: "designed but motionless - a production-grade asset performs: register design_motion and rebuild with motion:<name> (design_fix bakes the archetype default)" });
    }
  } else {
    motion = asset.kind === "CHARACTER" ? 0.8 : 0.8;
  }

  // VARIATION: environments are judged on their layout law (a GN
  // scatter/array inside the file is the evidence); characters, props
  // and creatures score as honest N/A - a sword rack IS variation,
  // but it is the ENVIRONMENT's job to breathe at scale.
  const gnApplied = Boolean(meta?.variation?.instances && (meta?.variation?.instances as number) > 0) || Boolean(asset.variationPreset);
  let variation: number;
  const variationIssues: ReviewVerdict["issues"] = [];
  if (asset.kind === "ENVIRONMENT") {
    if (gnApplied) {
      variation = 0.92;
    } else {
      variation = 0.3;
      variationIssues.push({ severity: "MAJOR", kind: "VARIATION", note: "designed but a wallpaper - a production set breathes: register design_variation (a seeded scatter) and rebuild with variation:<name> (design_fix bakes the default environment scatter)" });
    }
  } else {
    variation = 0.8;
  }

  const criteria: DesignCriteria = { geometry, material, silhouette, palette, lighting, detail, motion, variation };
  const overall = weightedOverall(criteria);

  const issues: ReviewVerdict["issues"] = [...motionIssues, ...variationIssues];
  if (asset.status !== "READY") {
    issues.push({ severity: "CRITICAL", kind: "GEOMETRY", note: `asset is ${asset.status}, not READY - the last build did not produce an accepted .blend` });
  } else {
    if (objects < floor.objects || tris < floor.tris) {
      issues.push({ severity: "MAJOR", kind: "GEOMETRY", note: `hierarchy under the ${asset.kind} floor (${objects} objects / ${tris.toLocaleString()} tris vs ${floor.objects} / ${floor.tris.toLocaleString()})` });
    }
    if (bytes < 30_000) {
      issues.push({ severity: "MAJOR", kind: "SILHOUETTE", note: `preview frame looks empty (${bytes} bytes on disk) - re-render the preview` });
    }
    if (asset.kind === "CHARACTER" && asset.identityScore === null) {
      issues.push({ severity: "MINOR", kind: "IDENTITY", note: "never vision-inspected against the canonical sheet - run blender_asset_inspect" });
    }
    if (asset.kind === "CHARACTER" && asset.identityScore !== null && asset.identityScore < 0.5) {
      issues.push({ severity: "MAJOR", kind: "IDENTITY", note: `identity vs the sheet is low (${Math.round(asset.identityScore * 100)}%) - refine with blender_exec or rebuild` });
    }
    if (!meta?.lightingRig) {
      issues.push({ severity: "MINOR", kind: "LIGHTING", note: "previewed under the default studio rig - design a rig with design_lighting and rebuild" });
    }
    if (!meta?.materialRecipe) {
      issues.push({ severity: "MINOR", kind: "MATERIAL", note: "built from DNA color defaults - design a material recipe with design_material and rebuild" });
    }
    if (asset.version >= 4) {
      issues.push({ severity: "MINOR", kind: "GEOMETRY", note: `version churn (v${asset.version}) - the design text itself may be unstable; stabilize it before the next rebuild` });
    }
  }
  const note = asset.status !== "READY"
    ? "the asset is not in an accepted state"
    : `local audit: ${objects} objects, ${tris.toLocaleString()} tris, ${(bytes / 1024).toFixed(0)}KB preview${meta?.lightingRig ? ", designed rig" : ", default rig"}${asset.motionPreset && loopOnDisk ? ", performing" : asset.motionPreset ? ", motion unbaked" : ", motionless"}${gnApplied ? ", varied (GN)" : asset.kind === "ENVIRONMENT" ? ", wallpaper" : ""}`;
  return { criteria, overall, note, provider: "local", issues };
}

function loopBytes(loopPath: string | null): number {
  if (!loopPath) return 0;
  const rel = loopPath.replace(/^\/assets-blender\//, "");
  try {
    return fs.statSync(path.join(process.cwd(), "public", "assets-blender", rel)).size;
  } catch {
    return 0;
  }
}

/** The vision critique - a design-expert read of the preview. */
async function visionCritique(asset: { previewPath: string | null; kind: string; refName: string }): Promise<{ ok: boolean; criteria?: Partial<DesignCriteria>; issues?: ReviewVerdict["issues"]; note?: string; error?: string }> {
  const data = publicImageAsDataUrl(asset.previewPath ?? "");
  if (!data) return { ok: false, error: "no preview file to critique" };
  try {
    const zai = await ZAI.create();
    const res = (await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `You are a senior 3D art director at a donghua/anime studio reviewing a ${asset.kind.toLowerCase()} asset preview ("${asset.refName}") built in Blender.`,
                "Judge it like production art, not like a photo. Score each criterion 0..1:",
                'silhouette (does the shape read instantly as its archetype), material (do surfaces look designed: roughness, metalness, energy where promised),',
                'palette (coherent, purposeful colors), lighting (does the lit preview reveal form clearly), detail (a finishing pass: bevels, smoothing, runes, variation), proportion (sane relative sizes).',
                "List concrete, actionable issues with severity (CRITICAL | MAJOR | MINOR) and kind (GEOMETRY | MATERIAL | SILHOUETTE | PROPORTION | PALETTE | LIGHTING | DETAIL | IDENTITY).",
                "Reply with STRICT JSON only, no markdown fences:",
                '{"criteria":{"silhouette":0.0,"material":0.0,"palette":0.0,"lighting":0.0,"detail":0.0,"proportion":0.0},"issues":[{"severity":"MINOR","kind":"MATERIAL","note":"..."}],"note":"one sentence overall"}',
                "This is a stylized procedural build - judge DESIGN quality (shape language, material intent, readability), not photorealism.",
              ].join("\n"),
            },
            { type: "image_url", image_url: { url: data } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = res.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      criteria?: Record<string, number>;
      issues?: ReviewVerdict["issues"];
      note?: string;
    };
    return { ok: true, criteria: parsed.criteria, issues: parsed.issues, note: parsed.note };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "vision critique failed" };
  }
}

async function landEvent(projectId: string, summary: string, payload: unknown): Promise<void> {
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "PROJECT",
      summary,
      payload: JSON.stringify(payload).slice(0, 4000),
    },
  }).catch(() => {});
}

export interface AuditResult {
  ok: boolean;
  error?: string;
  reviewId: string;
  state: string;
  overall: number;
  bar: number;
  provider: string;
  issues: Array<{ id: string; severity: string; kind: string; note: string; status: string }>;
  note: string;
}

/** Audit ONE library asset: land a DesignReview + DesignIssue rows. */
export async function auditAsset(assetId: string, useVision = true): Promise<AuditResult> {
  const asset = await db.blenderAsset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, error: "asset not found", reviewId: "", state: "RUNNING", overall: 0, bar: DESIGN_BAR, provider: "local", issues: [], note: "" };

  const local = localAudit(asset);
  let verdict: ReviewVerdict = local;

  if (useVision && asset.status === "READY") {
    const vis = await visionCritique({ previewPath: asset.previewPath, kind: asset.kind, refName: asset.refName });
    if (vis.ok && vis.criteria) {
      // vision scores carry the perceptual criteria; local carries the
      // structural ones (geometry) - motion stays local (the loop on
      // disk is the evidence, not a vibe). Merge honestly, name the provider.
      const vc = vis.criteria;
      const merged: DesignCriteria = {
        geometry: local.criteria.geometry,
        material: vc.material !== undefined ? clamp01(vc.material) : local.criteria.material,
        silhouette: vc.silhouette !== undefined ? clamp01(vc.silhouette) : local.criteria.silhouette,
        palette: vc.palette !== undefined ? clamp01(vc.palette) : local.criteria.palette,
        lighting: vc.lighting !== undefined ? clamp01(vc.lighting) : local.criteria.lighting,
        detail: vc.detail !== undefined ? clamp01(vc.detail) : local.criteria.detail,
        motion: local.criteria.motion,
        variation: local.criteria.variation,
      };
      const overall = weightedOverall(merged);
      verdict = {
        criteria: merged,
        overall,
        note: vis.note ? `${vis.note} | ${local.note}` : local.note,
        provider: "vision+local",
        issues: [...(vis.issues ?? []).slice(0, 8), ...local.issues],
      };
    }
  }

  const openCritical = verdict.issues.some((i) => i.severity === "CRITICAL");
  const openMajor = verdict.issues.filter((i) => i.severity === "MAJOR").length;
  const state = openCritical || verdict.overall < DESIGN_BAR ? "NEEDS_WORK" : openMajor > 0 ? "NEEDS_WORK" : "PASSED";

  const review = await db.designReview.create({
    data: {
      projectId: asset.projectId,
      assetId: asset.id,
      targetRef: asset.refName,
      kind: asset.kind,
      state,
      bar: DESIGN_BAR,
      overall: verdict.overall,
      verdict: JSON.stringify({ criteria: verdict.criteria, note: verdict.note, provider: verdict.provider }),
      issuesFound: verdict.issues.length,
    },
  });
  const issueRows: Array<{ id: string; severity: string; kind: string; note: string; status: string }> = [];
  for (const issue of verdict.issues) {
    const created = await db.designIssue.create({
      data: {
        projectId: asset.projectId,
        reviewId: review.id,
        assetId: asset.id,
        refName: asset.refName,
        severity: issue.severity,
        kind: issue.kind,
        note: issue.note.slice(0, 400),
      },
    });
    issueRows.push({ id: created.id, severity: created.severity, kind: created.kind, note: created.note, status: created.status });
  }
  await db.blenderAsset.update({
    where: { id: asset.id },
    data: { qualityScore: verdict.overall, lastReviewAt: new Date() },
  });
  await landEvent(
    asset.projectId,
    `Design audit ${state}: ${asset.kind.toLowerCase()} ${asset.refName} scored ${(verdict.overall * 100).toFixed(0)}% (bar ${(DESIGN_BAR * 100).toFixed(0)}%), ${verdict.issues.length} issue(s)`,
    { reviewId: review.id, overall: verdict.overall, provider: verdict.provider },
  );
  return {
    ok: true,
    reviewId: review.id,
    state,
    overall: verdict.overall,
    bar: DESIGN_BAR,
    provider: verdict.provider,
    issues: issueRows.map((i) => ({ id: i.id, severity: i.severity, kind: i.kind, note: i.note, status: i.status })),
    note: verdict.note,
  };
}

/** Audit every READY asset in the production, then a LIBRARY rollup. */
export async function auditLibrary(projectId: string, useVision = true): Promise<{ ok: boolean; audited: number; passed: number; needsWork: number; skipped: number; rollup: AuditResult }> {
  const rows = await db.blenderAsset.findMany({ where: { projectId }, orderBy: { refName: "asc" } });
  let passed = 0;
  let needsWork = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status !== "READY") {
      skipped += 1;
      continue;
    }
    const res = await auditAsset(row.id, useVision);
    if (res.state === "PASSED") passed += 1;
    else needsWork += 1;
  }
  const rollup = await landLibraryRollup(projectId, rows.length, passed, needsWork, skipped);
  return { ok: true, audited: rows.length, passed, needsWork, skipped, rollup };
}

async function landLibraryRollup(projectId: string, total: number, passed: number, needsWork: number, skipped: number): Promise<AuditResult> {
  const openIssues = await db.designIssue.count({ where: { projectId, status: "OPEN" } });
  const overall = total === 0 ? 1 : clamp01((passed + 0.5 * needsWork) / Math.max(1, total));
  const state = openIssues === 0 ? "PASSED" : "NEEDS_WORK";
  const review = await db.designReview.create({
    data: {
      projectId,
      assetId: null,
      targetRef: "LIBRARY",
      kind: "LIBRARY",
      state,
      bar: DESIGN_BAR,
      overall,
      verdict: JSON.stringify({
        criteria: null,
        note: `library sweep: ${passed}/${total} ready assets cleared the bar, ${needsWork} need work, ${skipped} skipped (not READY), ${openIssues} open issue(s)`,
        provider: "local",
      }),
      issuesFound: 0,
    },
  });
  return {
    ok: true,
    reviewId: review.id,
    state,
    overall,
    bar: DESIGN_BAR,
    provider: "local",
    issues: [],
    note: `library sweep: ${passed}/${total} cleared, ${needsWork} need work, ${skipped} skipped, ${openIssues} open issue(s)`,
  };
}

// ── the fix pass ─────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Compile the targeted bpy refinement script from the issue kinds.
 * Every op is a REAL, standard Blender pass a professional would run:
 * bevel + subsurf finishing, normal recalculation, roughness/metal
 * normalization, palette pull toward the accent, origin/scale hygiene.
 */
function compileFixScript(opts: {
  blendPath: string;
  outBlendPath: string;
  outPreviewPath: string;
  kinds: Set<string>;
  accentHex: string;
  lightRig: Record<string, unknown> | null;
  hasPerf?: boolean; // a baked armature: origin recentering would fight the rig
}): string {
  const ops: string[] = [];
  const kinds = opts.kinds;
  ops.push(`
import bpy, math, mathutils, os, sys

blend_in = r"${esc(opts.blendPath)}"
bpy.ops.wm.open_mainfile(filepath=blend_in)
scn = bpy.context.scene
fixed = []

def meshes():
    return [o for o in scn.objects if o.type == "MESH"]
`);

  if (kinds.has("GEOMETRY") || kinds.has("DETAIL")) {
    ops.push(`
# finishing pass: bevel edges + one subsurf level on dense-enough meshes
for ob in meshes():
    if ob.data and len(ob.data.polygons) >= 4:
        if "FixBevel" not in ob.modifiers:
            bev = ob.modifiers.new("FixBevel", "BEVEL")
            bev.width = 0.004
            bev.segments = 2
            bev.limit_method = "ANGLE"
            bev.angle_limit = math.radians(50)
        if "FixSubsurf" not in ob.modifiers and len(ob.data.polygons) <= 6000:
            ss = ob.modifiers.new("FixSubsurf", "SUBSURF")
            ss.levels = 1
            ss.render_levels = 1
fixed.append("bevel+subsurf finishing on %d meshes" % len(meshes()))
`);
  }

  if (kinds.has("SILHOUETTE") || kinds.has("GEOMETRY") || kinds.has("PROPORTION")) {
    if (opts.hasPerf) {
      ops.push(`
# performing asset: shade_smooth only - origin recentering would fight
# the bone bindings the baked performance depends on
for ob in meshes():
    try:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
fixed.append("shade_smooth on %d meshes (origins kept: rig-bound)" % len(meshes()))
`);
    } else {
    ops.push(`
# normal + origin hygiene: shading artifacts and off-center origins
# are the two most common silhouette killers on procedural builds
for ob in meshes():
    try:
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.ops.object.shade_smooth()
    except Exception:
        pass
    try:
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    except Exception:
        pass
fixed.append("shade_smooth + origin recentered on %d meshes" % len(meshes()))
`);
    }
  }

  if (kinds.has("MATERIAL")) {
    ops.push(`
# material normalization: sane specular, extreme roughness pulled in,
# named-metal parts made metallic (a dull gold reads as clay)
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    b = mat.node_tree.nodes.get("Principled BSDF")
    if not b:
        continue
    r = b.inputs["Roughness"].default_value
    if r > 0.92:
        b.inputs["Roughness"].default_value = 0.55
        fixed.append("roughness %s %.2f -> 0.55" % (mat.name, r))
    if r < 0.05:
        b.inputs["Roughness"].default_value = 0.15
        fixed.append("roughness %s %.2f -> 0.15" % (mat.name, r))
    if "Specular" in b.inputs and b.inputs["Specular"].default_value <= 0.01:
        b.inputs["Specular"].default_value = 0.4
    low = mat.name.lower()
    if any(w in low for w in ("gold", "silver", "bronze", "steel", "metal", "blade", "guard", "pommel")):
        b.inputs["Metallic"].default_value = 0.85
        fixed.append("metallic on %s" % mat.name)
`);
  }

  if (kinds.has("PALETTE")) {
    ops.push(`
# palette coherence: pull every base color 18% toward the accent so
# the asset reads as ONE designed object, not a parts bin
accent = mathutils.Color((0.5, 0.5, 0.5))
_h = "${esc(opts.accentHex)}".lstrip("#")
try:
    if len(_h) == 6:
        accent = mathutils.Color((
            ((int(_h[0:2], 16) / 255.0) ** 2.2),
            ((int(_h[2:4], 16) / 255.0) ** 2.2),
            ((int(_h[4:6], 16) / 255.0) ** 2.2),
        ))
except Exception:
    pass
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    b = mat.node_tree.nodes.get("Principled BSDF")
    if not b or mat.name in ("PropGlowMat", "CreatureGlowMat"):
        continue
    c = b.inputs["Base Color"].default_value
    mixed = [c[i] * 0.82 + accent[i] * 0.18 for i in range(3)]
    b.inputs["Base Color"].default_value = (*mixed, c[3])
fixed.append("palette pulled toward accent")
`);
  }

  if (kinds.has("LIGHTING")) {
    ops.push(`
# lighting is preview-owned; the re-render below applies the stored
# DESIGNED rig (or the neutral studio rig when none is stored)
fixed.append("preview re-rendered for the lighting pass")
`);
  }

  ops.push(`
tris = 0
for ob in meshes():
    dg = bpy.context.evaluated_depsgraph_get()
    ob_eval = ob.evaluated_get(dg)
    me = ob_eval.to_mesh()
    if me:
        me.calc_loop_triangles()
        tris += sum(len(p.vertices) - 2 for p in me.loop_triangles)
        ob_eval.to_mesh_clear()
ops_line = " | ".join(fixed) if fixed else "none"
print("FIX_TRIS %d" % tris, flush=True)
print("FIX_OPS %s" % ops_line, flush=True)

out = r"${esc(opts.outBlendPath)}"
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print("FIX_BLEND %s" % out, flush=True)
`);

  // preview render (same neutral studio rig as the builder; the
  // builder's own rig builder lives there, keep this one lean)
  ops.push(`
import json
world = bpy.data.worlds.new("PreviewWorld")
scn.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.045, 0.05, 0.062, 1.0)
    bg.inputs[1].default_value = 1.0

def add_light(name, loc, energy, color=(1.0, 0.96, 0.9), size=2.0):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.size = size
    ob = bpy.data.objects.new(name, data)
    ob.location = loc
    scn.collection.objects.link(ob)
    return ob

key = add_light("PreviewKey", (2.2, -2.6, 3.0), 420)
key.rotation_euler = (math.radians(52), 0, math.radians(38))
fill = add_light("PreviewFill", (-2.8, -1.4, 1.6), 140, color=(0.75, 0.82, 0.95))
fill.rotation_euler = (math.radians(78), 0, math.radians(-64))
rim = add_light("PreviewRim", (0.4, 2.8, 2.4), 220, color=(0.92, 0.86, 1.0))
rim.rotation_euler = (math.radians(-40), 0, math.radians(180))

cam_data = bpy.data.cameras.new("PreviewCam")
cam_data.lens = 55
cam = bpy.data.objects.new("PreviewCam", cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
target = bpy.data.objects.new("PreviewTarget", None)
scn.collection.objects.link(target)
con = cam.constraints.new("TRACK_TO")
con.target = target
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"

mins = [1e9, 1e9, 1e9]
maxs = [-1e9, -1e9, -1e9]
for ob in scn.objects:
    if ob.type == "MESH":
        for corner in ob.bound_box:
            wc = ob.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i])
                maxs[i] = max(maxs[i], wc[i])
if mins[0] < 1e8:
    center = mathutils.Vector(((mins[0]+maxs[0])/2, (mins[1]+maxs[1])/2, (mins[2]+maxs[2])/2))
    dims = (maxs[0]-mins[0], maxs[1]-mins[1], maxs[2]-mins[2])
    radius = 0.5 * math.sqrt(dims[0]**2 + dims[1]**2 + dims[2]**2) or 0.8
else:
    center = mathutils.Vector((0, 0, 0.5))
    radius = 0.8
target.location = (center.x, center.y, center.z)
half_fov = math.atan(12.0 / cam_data.lens)
dist = (radius * 1.18) / math.tan(half_fov)
cam.location = center + mathutils.Vector((0.55, -1.0, 0.38)).normalized() * dist

scn.render.engine = "CYCLES"
scn.cycles.device = "CPU"
scn.cycles.samples = 40
scn.render.resolution_x = 512
scn.render.resolution_y = 512
preview_out = r"${esc(opts.outPreviewPath)}"
scn.render.filepath = preview_out
bpy.ops.render.render(write_still=True)
if os.path.exists(preview_out):
    print("FIX_PREVIEW %s" % preview_out, flush=True)
print("FIX_OK", flush=True)
`);

  return ops.join("\n");
}

export interface FixResult {
  ok: boolean;
  error?: string;
  assetId: string;
  refName: string;
  versionBefore: number;
  versionAfter: number | null;
  attempted: number;
  fixed: number;
  stillOpen: number;
  fixLog: string;
  reAudit?: { state: string; overall: number; reviewId: string };
}

/**
 * The fix pass: take an asset's OPEN issues (or the named ones),
 * run a REAL bpy refinement against the accepted .blend, save a new
 * VERSION, re-render the preview, re-audit, and mark issues FIXED
 * only when the re-audit no longer raises their kind.
 */
export async function fixIssues(assetId: string, issueIds?: string[]): Promise<FixResult> {
  const asset = await db.blenderAsset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, error: "asset not found", assetId, refName: "", versionBefore: 0, versionAfter: null, attempted: 0, fixed: 0, stillOpen: 0, fixLog: "" };
  if (!runtimeBlenderBin()) {
    return { ok: false, error: "no Blender binary - provision the runtime first", assetId, refName: asset.refName, versionBefore: asset.version, versionAfter: null, attempted: 0, fixed: 0, stillOpen: 0, fixLog: "" };
  }
  if (asset.status !== "READY" || !asset.blendPath || !fs.existsSync(asset.blendPath)) {
    return { ok: false, error: "asset has no accepted .blend on disk - rebuild it first", assetId, refName: asset.refName, versionBefore: asset.version, versionAfter: null, attempted: 0, fixed: 0, stillOpen: 0, fixLog: "" };
  }

  const openIssues = await db.designIssue.findMany({
    where: { assetId, status: "OPEN" },
    orderBy: [{ severity: "asc" }, { createdAt: "asc" }],
  });
  const targets = issueIds?.length ? openIssues.filter((i) => issueIds.includes(i.id)) : openIssues;
  if (targets.length === 0) {
    return { ok: true, assetId, refName: asset.refName, versionBefore: asset.version, versionAfter: asset.version, attempted: 0, fixed: 0, stillOpen: 0, fixLog: "no open issues to fix" };
  }
  for (const t of targets) {
    await db.designIssue.update({ where: { id: t.id }, data: { status: "FIXING" } });
  }

  const kinds = new Set(targets.map((t) => t.kind));
  type FixAssetMeta = { dna?: { accentColor?: string; archetype?: string }; lightingRig?: { spec: Record<string, unknown> } | null; motion?: { archetype?: string; motion?: string } | null; variation?: { name?: string; instances?: number } | null; };
  let meta: FixAssetMeta | null = null;
  try {
    meta = JSON.parse(asset.meta || "null") as FixAssetMeta;
  } catch {
    meta = null;
  }
  const accentHex = meta?.dna?.accentColor ?? "#a8842c";

  const newVersion = asset.version + 1;
  const project = await db.project.findUnique({ where: { id: asset.projectId }, select: { title: true } });
  const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "asset";
  const workDir = path.join(process.cwd(), "assets", "blender", slugOf(project?.title ?? "project"), asset.kind.toLowerCase(), `${slugOf(asset.refName)}-v${newVersion}`);
  fs.mkdirSync(workDir, { recursive: true });
  const outBlend = path.join(workDir, `${slugOf(asset.refName)}.blend`);
  const outPreview = path.join(workDir, `${slugOf(asset.refName)}.png`);

  // THE MOTION FIX: a motionless prop or creature gets a REAL baked
  // performance through the builder's motion-only pass (archetype
  // default motion), landing a new .blend with the armature + Action
  // and the animated preview loop beside it.
  let motionBaked: { blendPath: string; loopPath: string | null; previewPath: string | null; ops: string; motionName: string } | null = null;
  let currentBlend = asset.blendPath;
  let hasPerf = Boolean(asset.motionPreset);
  let tracked = targets;
  if (kinds.has("MOTION")) {
    if (asset.kind !== "PROP" && asset.kind !== "CREATURE") {
      // defensive: motion issues only arise for props/creatures
      for (const t of targets.filter((x) => x.kind === "MOTION")) {
        await db.designIssue.update({
          where: { id: t.id },
          data: { status: "WONTFIX", fixNote: "characters perform through the directed pose system, environments are static by design - no motion bake applies", updatedAt: new Date() },
        });
      }
      tracked = tracked.filter((x) => x.kind !== "MOTION");
    } else {
      const archetypeRaw = String(meta?.motion?.archetype ?? meta?.dna?.archetype ?? "");
      const archetype = asset.kind === "PROP"
        ? "prop"
        : (["serpent", "bird", "quadruped"].includes(archetypeRaw) ? archetypeRaw : "quadruped");
      const motionName = DEFAULT_MOTION_BY_ARCHETYPE[archetype] ?? "breathe";
      const motionFile = path.join(workDir, "fix-motion.json");
      fs.writeFileSync(motionFile, JSON.stringify({ motion: motionName, speed: 1, amplitude: 1, cycleFrames: 24, size: 1.0, archetype }, null, 2));
      const dnaFile = path.join(workDir, "fix-dna.json");
      fs.writeFileSync(dnaFile, JSON.stringify({ name: asset.refName }));
      const motionRun = await runAssetBuilder({
        kind: asset.kind as "PROP" | "CREATURE",
        dnaPath: dnaFile,
        outDir: workDir,
        name: asset.refName,
        fromBlend: asset.blendPath ?? undefined,
        motionPath: motionFile,
        timeoutMs: 6 * 60_000,
      });
      if (!motionRun.ok || !motionRun.blendPath || !fs.existsSync(motionRun.blendPath)) {
        const failNote = `motion bake failed: ${motionRun.log.slice(-200)}`;
        for (const t of targets.filter((x) => x.kind === "MOTION")) {
          await db.designIssue.update({ where: { id: t.id }, data: { status: "OPEN", fixNote: failNote, updatedAt: new Date() } });
        }
        await landEvent(asset.projectId, `Design fix FAILED for ${asset.kind.toLowerCase()} ${asset.refName}: the motion bake errored`, { assetId: asset.id });
        return {
          ok: false,
          error: failNote,
          assetId: asset.id,
          refName: asset.refName,
          versionBefore: asset.version,
          versionAfter: null,
          attempted: targets.length,
          fixed: 0,
          stillOpen: targets.length,
          fixLog: motionRun.log.slice(-3000),
        };
      }
      motionBaked = {
        blendPath: motionRun.blendPath,
        loopPath: motionRun.loopPath,
        previewPath: motionRun.previewPath,
        ops: `baked ${motionName} performance (armature + looping action)`,
        motionName,
      };
      currentBlend = motionRun.blendPath; // the motion pass saved the new version here
      hasPerf = true;
    }
  }

  // THE VARIATION FIX: a wallpaper environment gets a REAL seeded GN
  // scatter through the builder's variation-only pass (the default
  // environment layout), landing a new .blend whose carrier breathes.
  let variationBaked: { blendPath: string; previewPath: string | null; ops: string; name: string } | null = null;
  if (kinds.has("VARIATION")) {
    if (asset.kind !== "ENVIRONMENT") {
      // defensive: variation issues only arise for environments
      for (const t of targets.filter((x) => x.kind === "VARIATION")) {
        await db.designIssue.update({
          where: { id: t.id },
          data: { status: "WONTFIX", fixNote: "environments carry the layout law - characters, props and creatures are instanced by the SET, not by themselves", updatedAt: new Date() },
        });
      }
      tracked = tracked.filter((x) => x.kind !== "VARIATION");
    } else {
      const defaultSpec = DEFAULT_VARIATION_BY_KIND.ENVIRONMENT;
      if (!defaultSpec) {
        for (const t of targets.filter((x) => x.kind === "VARIATION")) {
          await db.designIssue.update({ where: { id: t.id }, data: { status: "OPEN", fixNote: "no default variation spec for environments - register one with design_variation", updatedAt: new Date() } });
        }
        tracked = tracked.filter((x) => x.kind !== "VARIATION");
      } else {
      const variationFile = path.join(workDir, "fix-variation.json");
      fs.writeFileSync(variationFile, JSON.stringify(defaultSpec, null, 2));
      const dnaFile = path.join(workDir, "fix-dna.json");
      fs.writeFileSync(dnaFile, JSON.stringify({ name: asset.refName }));
      const variationRun = await runAssetBuilder({
        kind: "ENVIRONMENT",
        dnaPath: dnaFile,
        outDir: workDir,
        name: asset.refName,
        fromBlend: currentBlend ?? asset.blendPath ?? undefined,
        variationPath: variationFile,
        timeoutMs: 6 * 60_000,
      });
      if (!variationRun.ok || !variationRun.blendPath || !fs.existsSync(variationRun.blendPath)) {
        const failNote = `variation bake failed: ${variationRun.log.slice(-200)}`;
        for (const t of targets.filter((x) => x.kind === "VARIATION")) {
          await db.designIssue.update({ where: { id: t.id }, data: { status: "OPEN", fixNote: failNote, updatedAt: new Date() } });
        }
        await landEvent(asset.projectId, `Design fix FAILED for ${asset.kind.toLowerCase()} ${asset.refName}: the variation bake errored`, { assetId: asset.id });
        return {
          ok: false,
          error: failNote,
          assetId: asset.id,
          refName: asset.refName,
          versionBefore: asset.version,
          versionAfter: null,
          attempted: targets.length,
          fixed: 0,
          stillOpen: targets.length,
          fixLog: variationRun.log.slice(-3000),
        };
      }
      variationBaked = {
        blendPath: variationRun.blendPath,
        previewPath: variationRun.previewPath,
        ops: `baked the default environment scatter (${variationRun.variationSummary?.instances ?? "?"} seeded instances)`,
        name: defaultSpec.name,
      };
      currentBlend = variationRun.blendPath; // the variation pass saved the new version here
      }
    }
  }

  // The remaining issue kinds ride the standard bpy refinement pass
  // (LIGHTING is preview-owned; a pure motion/variation fix skips the
  // pass - the builder already rendered the preview).
  const bpyOps = ["GEOMETRY", "DETAIL", "SILHOUETTE", "PROPORTION", "MATERIAL", "PALETTE"];
  const needsBpyPass = bpyOps.some((k) => kinds.has(k));
  let fixLog = "";
  let fixOps: string;
  if (!needsBpyPass) {
    if (!motionBaked && !variationBaked) {
      // nothing actionable ran (e.g. only LIGHTING): honest no-op
      for (const t of tracked) {
        await db.designIssue.update({ where: { id: t.id }, data: { status: "OPEN", fixNote: "nothing to run for this issue kind - address it by rebuilding under a designed rig", updatedAt: new Date() } });
      }
      return { ok: true, assetId: asset.id, refName: asset.refName, versionBefore: asset.version, versionAfter: asset.version, attempted: targets.length, fixed: 0, stillOpen: targets.length, fixLog: "no runnable fix op for these issue kinds" };
    }
    fixOps = variationBaked && !motionBaked ? variationBaked.ops : motionBaked ? motionBaked.ops : "no-op";
    fixLog = variationBaked && !motionBaked ? `VARIATION_BAKE ${variationBaked.ops}` : motionBaked ? `MOTION_BAKE ${motionBaked.ops}` : "";
  } else {
  const script = compileFixScript({
    blendPath: currentBlend ?? asset.blendPath!,
    outBlendPath: outBlend,
    outPreviewPath: outPreview,
    kinds,
    accentHex,
    lightRig: meta?.lightingRig?.spec ?? null,
    hasPerf,
  });
  const run = await runBlenderScript(script, `design-fix-${slugOf(asset.refName).slice(0, 20)}`, 5 * 60_000);

  fixLog = run.log.slice(-3000);
  const marker = (m: string) => {
    // parse from the FULL normalized log: the 6KB display tail may not
    // reach back to the markers printed before the preview render
    const match = run.fullLog.match(new RegExp(`^${m} (.+)$`, "m"));
    return match ? match[1].trim() : null;
  };
  const okRun = run.ok && marker("FIX_BLEND") && fs.existsSync(outBlend);

  if (!okRun) {
    // the fix pass itself failed: reopen the issues with the log
    const diag = `ok:${run.ok} marker:${Boolean(marker("FIX_BLEND"))} exists:${fs.existsSync(outBlend)}`;
    for (const t of targets) {
      await db.designIssue.update({
        where: { id: t.id },
        data: { status: "OPEN", fixNote: `fix pass failed: ${run.log.slice(-200)}`, updatedAt: new Date() },
      });
    }
    await landEvent(asset.projectId, `Design fix FAILED for ${asset.kind.toLowerCase()} ${asset.refName}: the bpy pass errored`, { assetId: asset.id });
    return { ok: false, error: `the bpy fix pass failed (${diag}): ${run.log.slice(-300)}`, assetId, refName: asset.refName, versionBefore: asset.version, versionAfter: null, attempted: targets.length, fixed: 0, stillOpen: targets.length, fixLog };
  }
  fixOps = motionBaked ? `${motionBaked.ops} + ${marker("FIX_OPS") ?? "bpy refinement pass"}` : variationBaked ? `${variationBaked.ops} + ${marker("FIX_OPS") ?? "bpy refinement pass"}` : marker("FIX_OPS") ?? "bpy refinement pass";
  }

  // accepted: promote the new version (blend + preview + loop) into the row
  const previewPublic = path.join(process.cwd(), "public", "assets-blender", `${asset.id}.png`);
  if (fs.existsSync(outPreview)) {
    try { fs.copyFileSync(outPreview, previewPublic); } catch { /* preview optional */ }
  } else if (motionBaked?.previewPath && fs.existsSync(motionBaked.previewPath)) {
    try { fs.copyFileSync(motionBaked.previewPath, previewPublic); } catch { /* preview optional */ }
  } else if (variationBaked?.previewPath && fs.existsSync(variationBaked.previewPath)) {
    try { fs.copyFileSync(variationBaked.previewPath, previewPublic); } catch { /* preview optional */ }
  }
  let loopPublicPath: string | null = null;
  if (motionBaked?.loopPath && fs.existsSync(motionBaked.loopPath)) {
    const loopPublic = path.join(process.cwd(), "public", "assets-blender", `${asset.id}.mp4`);
    try {
      fs.copyFileSync(motionBaked.loopPath, loopPublic);
      loopPublicPath = `/assets-blender/${asset.id}.mp4`;
    } catch { /* loop optional */ }
  }
  const newMeta = meta ?? {};
  await db.blenderAsset.update({
    where: { id: asset.id },
    data: {
      version: newVersion,
      blendPath: outBlend,
      previewPath: fs.existsSync(previewPublic) ? `/assets-blender/${asset.id}.png` : asset.previewPath,
      loopPath: loopPublicPath ?? asset.loopPath,
      motionPreset: motionBaked ? `${motionBaked.motionName} (archetype default)` : asset.motionPreset,
      motionBakedAt: motionBaked ? new Date() : asset.motionBakedAt,
      variationPreset: variationBaked ? `${variationBaked.name} (default)` : asset.variationPreset,
      buildLog: (motionBaked ? `${fixLog}\n` : "") + (motionBaked && !needsBpyPass ? "" : fixLog).slice(-4000),
      meta: JSON.stringify({
        ...newMeta,
        motion: motionBaked
          ? { ...(newMeta.motion ?? {}), name: `${motionBaked.motionName} (archetype default)`, bakedBy: "design_fix" }
          : newMeta.motion,
        variation: variationBaked
          ? { ...(newMeta.variation ?? {}), name: `${variationBaked.name} (default)`, bakedBy: "design_fix", instances: 48 }
          : newMeta.variation,
        fixPass: { ops: fixOps, fromVersion: asset.version, at: new Date().toISOString() },
      }).slice(0, 4000),
    },
  });

  // RE-AUDIT: the re-audit decides what is actually fixed
  const reAudit = await auditAsset(asset.id, true);
  const reRaised = new Set(reAudit.issues.filter((i) => i.status === "OPEN").map((i) => i.kind));
  let fixed = 0;
  let stillOpen = 0;
  for (const t of tracked) {
    if (reRaised.has(t.kind)) {
      stillOpen += 1;
      await db.designIssue.update({
        where: { id: t.id },
        data: { status: "OPEN", fixNote: `fix pass ran (${fixOps}) but the re-audit still flags ${t.kind}`, updatedAt: new Date() },
      });
    } else {
      fixed += 1;
      await db.designIssue.update({
        where: { id: t.id },
        data: { status: "FIXED", fixNote: `fixed by: ${fixOps}`, fixedAt: new Date(), updatedAt: new Date() },
      });
    }
  }
  await landEvent(
    asset.projectId,
    `Design fix landed: ${asset.kind.toLowerCase()} ${asset.refName} v${asset.version} -> v${newVersion} (${fixOps}); ${fixed}/${targets.length} issue(s) cleared by the re-audit`,
    { assetId: asset.id, version: newVersion, reAudit: { state: reAudit.state, overall: reAudit.overall } },
  );
  return {
    ok: true,
    assetId: asset.id,
    refName: asset.refName,
    versionBefore: asset.version,
    versionAfter: newVersion,
    attempted: targets.length,
    fixed,
    stillOpen,
    fixLog,
    reAudit: { state: reAudit.state, overall: reAudit.overall, reviewId: reAudit.reviewId },
  };
}

/** The standing readout: reviews, open issues by severity, per-asset grades. */
export async function designStatus(projectId: string) {
  const [openIssues, recentReviews, assets] = await Promise.all([
    db.designIssue.findMany({
      where: { projectId, status: { in: ["OPEN", "FIXING"] } },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 40,
    }),
    db.designReview.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    db.blenderAsset.findMany({
      where: { projectId },
      select: { id: true, kind: true, refName: true, status: true, version: true, qualityScore: true, lastReviewAt: true, motionPreset: true, loopPath: true, variationPreset: true },
      orderBy: [{ kind: "asc" }, { refName: "asc" }],
    }),
  ]);
  const bySeverity = {
    CRITICAL: openIssues.filter((i) => i.severity === "CRITICAL").length,
    MAJOR: openIssues.filter((i) => i.severity === "MAJOR").length,
    MINOR: openIssues.filter((i) => i.severity === "MINOR").length,
  };
  return {
    openIssues: openIssues.map((i) => ({
      id: i.id, refName: i.refName, severity: i.severity, kind: i.kind, note: i.note, status: i.status,
      fixNote: i.fixNote, createdAt: i.createdAt.toISOString(),
    })),
    bySeverity,
    reviews: recentReviews.map((r) => ({
      id: r.id, targetRef: r.targetRef, kind: r.kind, state: r.state,
      overall: r.overall, bar: r.bar, issuesFound: r.issuesFound,
      verdict: r.verdict, createdAt: r.createdAt.toISOString(),
    })),
    assets: assets.map((a) => ({
      ...a,
      lastReviewAt: a.lastReviewAt ? a.lastReviewAt.toISOString() : null,
    })),
  };
}

/** Resolve (manually retire) named issues - used for WONTFIX decisions. */
export async function retireIssues(projectId: string, issueIds: string[], note: string): Promise<number> {
  const rows = await db.designIssue.findMany({ where: { projectId, id: { in: issueIds }, status: { in: ["OPEN", "FIXING"] } } });
  for (const row of rows) {
    await db.designIssue.update({
      where: { id: row.id },
      data: { status: "WONTFIX", fixNote: note.slice(0, 300) || "retired by the creator", updatedAt: new Date() },
    });
  }
  return rows.length;
}

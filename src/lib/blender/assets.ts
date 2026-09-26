import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { characterDesignDna, environmentDna, propDna, creatureDna } from "@/lib/animation/design";
import { publicImageAsDataUrl } from "@/lib/continuity-art";
import { runAssetBuilder, runtimeBlenderBin } from "@/lib/blender/runtime";
import type { MotionSpec } from "@/lib/blender/motion";
import type { VariationSpec } from "@/lib/blender/variation";
import type { SculptSpec } from "@/lib/blender/sculpt";
import { writeSculptSpec } from "@/lib/blender/sculpt";

// ─────────────────────────────────────────────────────────────
// BLENDER ASSET LIBRARY (design once, render many)
//
// The studio's design-time asset pipeline: characters and
// environments become persistent, versioned .blend files built by
// the studio's own Blender runtime, previewed, vision-inspected
// against the canonical model sheets, and consumed by every render
// job afterwards. This is the seam that turns Blender from an
// integration into a native capability: quality is produced in a
// design-time loop (build -> preview -> inspect -> refine) instead
// of a render-time one-shot.
//
// Disk layout:
//   assets/blender/{projectSlug}/{kind}/{refSlug}-v{n}.blend   (library, gitignored)
//   public/assets-blender/{assetId}.png                         (preview, served)
// ─────────────────────────────────────────────────────────────

const LIBRARY_ROOT = path.join(process.cwd(), "assets", "blender");
const PREVIEW_PUBLIC_DIR = path.join(process.cwd(), "public", "assets-blender");

export type BlenderAssetKind = "CHARACTER" | "ENVIRONMENT" | "PROP" | "CREATURE";
export const BLENDER_ASSET_KINDS: BlenderAssetKind[] = ["CHARACTER", "ENVIRONMENT", "PROP", "CREATURE"];

export function isBlenderAssetKind(v: string): v is BlenderAssetKind {
  return (BLENDER_ASSET_KINDS as string[]).includes(v);
}

export interface BuildAssetResult {
  ok: boolean;
  assetId: string;
  version: number;
  status: string;
  blendPath: string | null;
  previewPath: string | null;
  objects: number;
  tris: number;
  buildMs: number;
  log: string;
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "asset";
}

export async function landDesignEvent(projectId: string, summary: string, payload: unknown): Promise<void> {
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

/** Resolve the design DNA for any of the four kinds from the DB rows.
 * CHARACTER/ENVIRONMENT resolve from their dedicated tables; PROP and
 * CREATURE resolve from the production's Asset registry (create_asset
 * rows: PROP/EFFECT/VEHICLE categories for props, CREATURE for beasts). */
async function designDnaFor(projectId: string, kind: BlenderAssetKind, refName: string) {
  if (kind === "CHARACTER") {
    const character = await db.character.findFirst({
      where: { projectId, name: refName },
      include: { states: true },
    });
    if (!character) return { ok: false as const, error: `No character named "${refName}" in this production.` };
    const st = [...character.states]
      .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
    const dna = characterDesignDna({
      name: character.name,
      role: character.role,
      appearance: character.appearance,
      modelSheetPrompt: character.modelSheetPrompt,
      stateClothing: st?.clothing ?? null,
      stateWeapon: st?.weapon ?? null,
    });
    return { ok: true as const, dna, modelSheetUrl: character.modelSheetUrl };
  }
  if (kind === "ENVIRONMENT") {
    const environment = await db.environment.findFirst({ where: { projectId, name: refName } });
    if (!environment) return { ok: false as const, error: `No environment named "${refName}" in this production.` };
    const dna = environmentDna({
      name: environment.name,
      description: environment.description,
      atmosphere: environment.atmosphere,
      timeOfDay: environment.timeOfDay,
      weather: environment.weather,
    });
    return { ok: true as const, dna, modelSheetUrl: null };
  }
  // PROP + CREATURE resolve from the Asset registry
  const candidates = await db.asset.findMany({
    where: { projectId, name: { equals: refName } },
  });
  if (candidates.length === 0) {
    const known = await db.asset.findMany({
      where: { projectId },
      select: { name: true, category: true },
      orderBy: { name: "asc" },
      take: 12,
    });
    const list = known.map((a) => `${a.name} (${a.category})`).join(", ");
    return {
      ok: false as const,
      error: `No registered asset named "${refName}" in this production.${list ? ` Registered assets: ${list}.` : " Register one with create_asset first."}`,
    };
  }
  const row = kind === "CREATURE"
    ? (candidates.find((c) => c.category === "CREATURE") ?? candidates[0])
    : (candidates.find((c) => ["PROP", "EFFECT", "VEHICLE"].includes(c.category)) ?? candidates[0]);
  if (kind === "CREATURE") {
    const dna = creatureDna({ name: row.name, description: row.description });
    return { ok: true as const, dna, modelSheetUrl: null };
  }
  const dna = propDna({ name: row.name, description: row.description, category: row.category });
  return { ok: true as const, dna, modelSheetUrl: null };
}

/**
 * Build (or rebuild) the library asset for one of the FOUR kinds
 * (character, environment, prop, creature): compiles the design DNA,
 * runs the deterministic v5 builder in the studio's Blender runtime,
 * versions the .blend + preview into the library, and upserts the
 * BlenderAsset row with the full audit. Named material recipes and
 * lighting rigs (DesignPreset rows) are consumed and counted.
 */
export async function buildBlenderAsset(
  projectId: string,
  kind: BlenderAssetKind,
  refName: string,
  guidance?: string | null,
  presets?: { materialName?: string | null; lightingName?: string | null; motionName?: string | null; variationName?: string | null; sculptName?: string | null },
): Promise<BuildAssetResult> {
  if (!runtimeBlenderBin()) {
    return {
      ok: false, assetId: "", version: 0, status: "FAILED", blendPath: null, previewPath: null,
      objects: 0, tris: 0, buildMs: 0, log: "no Blender binary - provision the runtime first",
    };
  }
  const resolved = await designDnaFor(projectId, kind, refName);
  if (!resolved.ok) {
    return {
      ok: false, assetId: "", version: 0, status: "FAILED", blendPath: null, previewPath: null,
      objects: 0, tris: 0, buildMs: 0, log: resolved.error,
    };
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { title: true } });

  const existing = await db.blenderAsset.findUnique({
    where: { projectId_kind_refName: { projectId, kind, refName } },
  });
  const asset = await db.blenderAsset.upsert({
    where: { projectId_kind_refName: { projectId, kind, refName } },
    create: { projectId, kind, refName, status: "BUILDING", designSource: resolved.dna.source },
    update: { status: "BUILDING", designSource: resolved.dna.source, buildLog: null },
  });
  const version = (existing?.version ?? 0) + 1;

  const started = Date.now();
  const workDir = path.join(LIBRARY_ROOT, slugOf(project?.title ?? "project"), kind.toLowerCase(), `${slugOf(refName)}-v${version}`);
  const dnaFile = path.join(workDir, "dna.json");
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(dnaFile, JSON.stringify(resolved.dna, null, 2));

  // DESIGNED presets: a named material recipe and/or lighting rig the
  // designer registered with design_material / design_lighting. The
  // recipe is law over the DNA defaults; the rig drives the preview.
  let materialPreset: { name: string; spec: Record<string, unknown> } | null = null;
  let lightingPreset: { name: string; spec: Record<string, unknown> } | null = null;
  if (presets?.materialName) {
    const row = await db.designPreset.findUnique({
      where: { projectId_kind_name: { projectId, kind: "MATERIAL", name: presets.materialName } },
    });
    if (row) {
      materialPreset = { name: row.name, spec: JSON.parse(row.spec || "{}") as Record<string, unknown> };
      await db.designPreset.update({ where: { id: row.id }, data: { usageCount: { increment: 1 } } });
    }
  }
  if (presets?.lightingName) {
    const row = await db.designPreset.findUnique({
      where: { projectId_kind_name: { projectId, kind: "LIGHTING", name: presets.lightingName } },
    });
    if (row) {
      lightingPreset = { name: row.name, spec: JSON.parse(row.spec || "{}") as Record<string, unknown> };
      await db.designPreset.update({ where: { id: row.id }, data: { usageCount: { increment: 1 } } });
    }
  }
  const materialFile = materialPreset ? path.join(workDir, "material.json") : null;
  if (materialPreset && materialFile) fs.writeFileSync(materialFile, JSON.stringify(materialPreset.spec, null, 2));
  const rigFile = lightingPreset ? path.join(workDir, "rig.json") : null;
  if (lightingPreset && rigFile) fs.writeFileSync(rigFile, JSON.stringify(lightingPreset.spec, null, 2));

  // DESIGNED motion preset (design_motion): the performance is baked
  // into the .blend as a REAL armature + looping Action, and the
  // animated preview loop proves it. Props and creatures only.
  let motionPreset: { name: string; spec: MotionSpec } | null = null;
  if (presets?.motionName) {
    if (kind === "CHARACTER" || kind === "ENVIRONMENT") {
      return {
        ok: false, assetId: "", version: 0, status: "FAILED", blendPath: null, previewPath: null,
        objects: 0, tris: 0, buildMs: 0,
        log: `motion presets apply to PROP and CREATURE assets - a ${kind.toLowerCase()} ${kind === "CHARACTER" ? "performs through the directed pose system" : "is static by design"}`,
      };
    }
    const row = await db.designPreset.findUnique({
      where: { projectId_kind_name: { projectId, kind: "MOTION", name: presets.motionName } },
    });
    if (row) {
      let spec: MotionSpec | null = null;
      try {
        spec = JSON.parse(row.spec || "null") as MotionSpec | null;
      } catch {
        spec = null;
      }
      if (spec && typeof spec.motion === "string") {
        motionPreset = { name: row.name, spec };
        await db.designPreset.update({ where: { id: row.id }, data: { usageCount: { increment: 1 } } });
      }
    }
  }
  const motionFile = motionPreset ? path.join(workDir, "motion.json") : null;
  if (motionPreset && motionFile) {
    const dnaRecord = resolved.dna as unknown as Record<string, unknown>;
    const archetype = kind === "PROP"
      ? "prop"
      : ["serpent", "bird", "quadruped"].includes(String(dnaRecord.archetype ?? ""))
        ? String(dnaRecord.archetype)
        : "quadruped";
    const size = Math.max(0.3, Math.min(12, Number(dnaRecord.size ?? 1) || 1));
    fs.writeFileSync(motionFile, JSON.stringify({ ...motionPreset.spec, size, archetype }, null, 2));
  }

  // DESIGNED variation preset (design_variation): the layout law is
  // compiled into the spec file the builder's --variation flag
  // consumes; the GN tree it produces travels inside the .blend.
  let variationPreset: { name: string; spec: VariationSpec } | null = null;
  if (presets?.variationName) {
    const row = await db.designPreset.findUnique({
      where: { projectId_kind_name: { projectId, kind: "VARIATION", name: presets.variationName } },
    });
    if (row) {
      let spec: VariationSpec | null = null;
      try {
        spec = JSON.parse(row.spec || "null") as VariationSpec | null;
      } catch {
        spec = null;
      }
      if (spec && typeof spec.variation === "string") {
        variationPreset = { name: row.name, spec };
        await db.designPreset.update({ where: { id: row.id }, data: { usageCount: { increment: 1 } } });
      }
    }
  }
  const variationFile = variationPreset ? path.join(workDir, "variation.json") : null;
  if (variationPreset && variationFile) {
    fs.writeFileSync(variationFile, JSON.stringify(variationPreset.spec, null, 2));
  }

  // DESIGNED sculpt preset (design_sculpt): the surface law is written
  // as the spec file the builder's --sculpt flag carves into the mesh
  // before the save - layered seeded noise, deterministic.
  let sculptPreset: { name: string; spec: SculptSpec } | null = null;
  if (presets?.sculptName) {
    const row = await db.designPreset.findUnique({
      where: { projectId_kind_name: { projectId, kind: "SCULPT", name: presets.sculptName } },
    });
    if (row) {
      let spec: SculptSpec | null = null;
      try {
        spec = JSON.parse(row.spec || "null") as SculptSpec | null;
      } catch {
        spec = null;
      }
      if (spec && Array.isArray(spec.layers) && spec.layers.length > 0) {
        sculptPreset = { name: row.name, spec };
        await db.designPreset.update({ where: { id: row.id }, data: { usageCount: { increment: 1 } } });
      }
    }
  }
  const sculptFile = sculptPreset ? writeSculptSpec(sculptPreset.spec, workDir) : null;

  const run = await runAssetBuilder({
    kind,
    dnaPath: dnaFile,
    outDir: workDir,
    name: refName,
    ...(materialFile ? { materialPath: materialFile } : {}),
    ...(rigFile ? { rigPath: rigFile } : {}),
    ...(motionFile ? { motionPath: motionFile } : {}),
    ...(variationFile ? { variationPath: variationFile } : {}),
    ...(sculptFile ? { sculptPath: sculptFile } : {}),
    ...(motionPreset || sculptPreset ? { timeoutMs: 6 * 60_000 } : {}),
  });
  const buildMs = Date.now() - started;

  if (!run.ok || !run.blendPath) {
    const updated = await db.blenderAsset.update({
      where: { id: asset.id },
      data: { status: "FAILED", buildLog: run.log.slice(-4000) },
    });
    await landDesignEvent(projectId, `Blender asset build FAILED for ${kind.toLowerCase()} ${refName}`, { error: run.log.slice(-600) });
    return {
      ok: false, assetId: updated.id, version, status: "FAILED", blendPath: null,
      previewPath: null, objects: run.objects, tris: run.tris, buildMs, log: run.log,
    };
  }

  // accepted: versioned .blend stays in the library; preview goes public
  const finalBlend = run.blendPath;
  fs.mkdirSync(PREVIEW_PUBLIC_DIR, { recursive: true });
  const previewPublic = run.previewPath ? path.join(PREVIEW_PUBLIC_DIR, `${asset.id}.png`) : null;
  if (run.previewPath && previewPublic) {
    try { fs.copyFileSync(run.previewPath, previewPublic); } catch { /* preview optional */ }
  }
  // the animated preview loop lands beside the still (the performance proof)
  const loopPublic = run.loopPath && motionPreset ? path.join(PREVIEW_PUBLIC_DIR, `${asset.id}.mp4`) : null;
  if (run.loopPath && loopPublic) {
    try { fs.copyFileSync(run.loopPath, loopPublic); } catch { /* loop optional */ }
  }

  const meta = {
    builderVersion: "v8.0",
    dna: resolved.dna,
    guidance: guidance ?? null,
    materialRecipe: materialPreset ? { name: materialPreset.name, spec: materialPreset.spec } : null,
    lightingRig: lightingPreset ? { name: lightingPreset.name, spec: lightingPreset.spec } : null,
    motion: motionPreset
      ? { name: motionPreset.name, ...run.motionSummary, spec: motionPreset.spec }
      : null,
    variation: variationPreset
      ? { name: variationPreset.name, ...run.variationSummary, spec: variationPreset.spec }
      : null,
    sculpt: sculptPreset
      ? { name: sculptPreset.name, ...run.sculptSummary, applied: true }
      : null,
    objects: run.objects,
    tris: run.tris,
    buildMs,
    builtAt: new Date().toISOString(),
  };
  const updated = await db.blenderAsset.update({
    where: { id: asset.id },
    data: {
      status: "READY",
      version,
      blendPath: finalBlend,
      previewPath: previewPublic ? `/assets-blender/${asset.id}.png` : null,
      motionPreset: motionPreset ? motionPreset.name : null,
      loopPath: loopPublic && fs.existsSync(loopPublic) ? `/assets-blender/${asset.id}.mp4` : null,
      motionBakedAt: motionPreset ? new Date() : asset.motionBakedAt,
      variationPreset: variationPreset ? variationPreset.name : asset.variationPreset,
      // a plain rebuild produces a FRESH uncarved .blend - an old sculpt
      // claim would be a lie the audit believed, so it resets (motion
      // semantics: the column always names what is actually in the file)
      sculptPreset: sculptPreset ? sculptPreset.name : null,
      buildLog: run.log.slice(-4000),
      meta: JSON.stringify(meta),
    },
  });
  await landDesignEvent(
    projectId,
    `Blender asset built: ${kind.toLowerCase()} ${refName} v${version} (${run.objects} objects, ${(run.tris).toLocaleString()} tris, ${(buildMs / 1000).toFixed(1)}s${motionPreset ? `, performing '${motionPreset.name}'` : ""}${variationPreset ? `, varied '${variationPreset.name}'` : ""}${sculptPreset ? `, sculpted '${sculptPreset.name}'` : ""})`,
    { assetId: updated.id, version, blendPath: finalBlend, motion: motionPreset?.name ?? null, variation: variationPreset?.name ?? null, sculpt: sculptPreset?.name ?? null },
  );
  return {
    ok: true, assetId: updated.id, version, status: "READY", blendPath: finalBlend,
    previewPath: updated.previewPath, objects: run.objects, tris: run.tris, buildMs, log: run.log,
  };
}

export interface InspectAssetResult {
  ok: boolean;
  error?: string;
  score: number | null;
  note: string | null;
  skipped?: boolean;
}

/**
 * Vision-inspect an asset preview against its canonical model sheet
 * (CHARACTER assets). Environment assets honestly skip: they carry
 * no sheet - their identity is judged on the render pass.
 */
export async function inspectBlenderAsset(assetId: string): Promise<InspectAssetResult> {
  const asset = await db.blenderAsset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, error: "asset not found", score: null, note: null };
  if (asset.kind === "ENVIRONMENT") {
    const note = "Environment assets carry no canonical sheet - identity is judged on the render pass, not the asset preview";
    await db.blenderAsset.update({ where: { id: assetId }, data: { inspectNote: note, inspectedAt: new Date() } });
    return { ok: true, skipped: true, score: null, note };
  }
  if (!asset.previewPath) return { ok: false, error: "asset has no preview to inspect - build it first", score: null, note: null };
  const character = await db.character.findFirst({ where: { projectId: asset.projectId, name: asset.refName } });
  if (!character?.modelSheetUrl) {
    return { ok: false, error: `no model sheet for ${asset.refName} - generate one first (the anchor is what identity is scored against)`, score: null, note: null };
  }
  const previewData = publicImageAsDataUrl(asset.previewPath);
  const sheetData = publicImageAsDataUrl(character.modelSheetUrl);
  if (!previewData) return { ok: false, error: "asset preview file missing on disk", score: null, note: null };
  if (!sheetData) return { ok: false, error: "model sheet file missing on disk", score: null, note: null };

  let raw = "";
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
                "You are a casting director judging how closely a 3D ASSET matches a character's canonical model sheet.",
                "Image 1 is the Blender asset preview. Image 2 is the canonical sheet.",
                "Score similarity 0 to 1 plus per-aspect scores (face, hair, wardrobe, weapon, palette, style) when visible.",
                "Reply with STRICT JSON only, no markdown fences:",
                '{"similarity": 0.0, "aspects": {"face": 0.0, "hair": 0.0}, "note": "one sentence on what matches or drifted"}',
                "Judge only what is visible. The asset is a stylized 3D build - judge identity (colors, silhouette, hair, wardrobe, weapon), not rendering style.",
              ].join("\n"),
            },
            { type: "image_url", image_url: { url: previewData } },
            { type: "image_url", image_url: { url: sheetData } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    raw = res.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "vision inspection failed", score: null, note: null };
  }

  let parsed: { similarity?: number; note?: string } | null = null;
  try {
    const body = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(body) as { similarity?: number; note?: string };
  } catch {
    return { ok: false, error: `vision model returned unparsable verdict: ${raw.slice(0, 120)}`, score: null, note: null };
  }
  const score = typeof parsed?.similarity === "number" ? Math.max(0, Math.min(1, parsed.similarity)) : null;
  if (score === null) return { ok: false, error: "verdict carried no similarity number", score: null, note: null };
  const note = String(parsed?.note ?? "").slice(0, 400);
  await db.blenderAsset.update({
    where: { id: assetId },
    data: { identityScore: score, inspectNote: note, inspectedAt: new Date() },
  });
  return { ok: true, score, note };
}

/** Library readout for the DSH tool + panel. */
export async function blenderAssetLibrary(projectId: string) {
  const rows = await db.blenderAsset.findMany({
    where: { projectId },
    orderBy: [{ kind: "asc" }, { refName: "asc" }],
  });
  const ready = rows.filter((r) => r.status === "READY");
  const scored = ready.filter((r) => r.identityScore !== null);
  return {
    total: rows.length,
    ready: ready.length,
    building: rows.filter((r) => r.status === "BUILDING").length,
    failed: rows.filter((r) => r.status === "FAILED").length,
    avgIdentity: scored.length
      ? scored.reduce((acc, r) => acc + (r.identityScore ?? 0), 0) / scored.length
      : null,
    assets: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      refName: r.refName,
      status: r.status,
      version: r.version,
      previewPath: r.previewPath,
      blendPath: r.blendPath,
      motionPreset: r.motionPreset,
      loopPath: r.loopPath,
      variationPreset: r.variationPreset,
      sculptPreset: r.sculptPreset,
      identityScore: r.identityScore,
      inspectNote: r.inspectNote,
      inspectedAt: r.inspectedAt ? r.inspectedAt.toISOString() : null,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

/** READY library assets for one shot's detected cast + environment +
 * described props - attached to every Blender payload (missing names
 * honestly absent). Props and creatures match when their NAME appears
 * in the shot description or scene title (case-insensitive): a shot
 * that says "the Azure Seal cracks" gets the Azure Seal asset. */
export async function assetsForRender(
  projectId: string,
  castNames: string[],
  environmentName: string | null,
  propsText?: string | null,
): Promise<{
  cast: Array<{ name: string; path: string }>;
  environment: { name: string; path: string } | null;
  props: Array<{ name: string; path: string }>;
}> {
  const rows = await db.blenderAsset.findMany({
    where: { projectId, status: "READY" },
  });
  const byRef = new Map(rows.map((r) => [`${r.kind}:${r.refName.toLowerCase()}`, r]));
  const cast: Array<{ name: string; path: string }> = [];
  for (const name of castNames) {
    const row = byRef.get(`CHARACTER:${name.toLowerCase()}`);
    if (row?.blendPath && fs.existsSync(row.blendPath)) {
      cast.push({ name, path: row.blendPath });
    }
  }
  let environment: { name: string; path: string } | null = null;
  if (environmentName) {
    const row = byRef.get(`ENVIRONMENT:${environmentName.toLowerCase()}`);
    if (row?.blendPath && fs.existsSync(row.blendPath)) {
      environment = { name: environmentName, path: row.blendPath };
    }
  }
  const props: Array<{ name: string; path: string }> = [];
  const text = (propsText ?? "").toLowerCase();
  if (text) {
    for (const row of rows) {
      if (row.kind !== "PROP" && row.kind !== "CREATURE") continue;
      const name = row.refName.toLowerCase();
      if (name.length < 3) continue; // too generic to match honestly
      if (text.includes(name) && row.blendPath && fs.existsSync(row.blendPath)) {
        props.push({ name: row.refName, path: row.blendPath });
      }
    }
  }
  return { cast, environment, props };
}

/** Refresh an asset's preview from its accepted .blend (no rebuild).
 * The asset's stored material recipe + lighting ride along so the
 * preview shows the DESIGNED materials under the DESIGNED rig. */
export async function refreshAssetPreview(assetId: string): Promise<{ ok: boolean; log: string; previewPath: string | null }> {
  const asset = await db.blenderAsset.findUnique({ where: { id: assetId } });
  if (!asset) return { ok: false, log: "asset not found", previewPath: null };
  if (!asset.blendPath || !fs.existsSync(asset.blendPath)) {
    return { ok: false, log: "asset .blend missing on disk - rebuild it", previewPath: null };
  }
  const project = await db.project.findUnique({ where: { id: asset.projectId }, select: { title: true } });
  const outDir = path.join(LIBRARY_ROOT, slugOf(project?.title ?? "project"), asset.kind.toLowerCase(), `${slugOf(asset.refName)}-preview-${Date.now().toString(36)}`);
  fs.mkdirSync(outDir, { recursive: true });
  const dnaFile = path.join(outDir, "dna.json");
  fs.writeFileSync(dnaFile, JSON.stringify({ name: asset.refName }));
  type PreviewMeta = { materialRecipe?: { spec: Record<string, unknown> } | null; lightingRig?: { spec: Record<string, unknown> } | null };
  let meta: PreviewMeta | null = null;
  try {
    meta = JSON.parse(asset.meta || "null") as PreviewMeta;
  } catch {
    meta = null;
  }
  const materialSpec = meta?.materialRecipe?.spec ?? null;
  const materialFile = materialSpec ? path.join(outDir, "material.json") : null;
  if (materialFile && materialSpec) fs.writeFileSync(materialFile, JSON.stringify(materialSpec, null, 2));
  const rigSpec = meta?.lightingRig?.spec ?? null;
  const rigFile = rigSpec ? path.join(outDir, "rig.json") : null;
  if (rigFile && rigSpec) fs.writeFileSync(rigFile, JSON.stringify(rigSpec, null, 2));
  const run = await runAssetBuilder({
    kind: asset.kind as BlenderAssetKind,
    dnaPath: dnaFile,
    outDir,
    name: asset.refName,
    fromBlend: asset.blendPath,
    ...(materialFile ? { materialPath: materialFile } : {}),
    ...(rigFile ? { rigPath: rigFile } : {}),
  });
  if (!run.ok || !run.previewPath) {
    await db.blenderAsset.update({ where: { id: assetId }, data: { buildLog: run.log.slice(-4000) } });
    return { ok: false, log: run.log, previewPath: null };
  }
  fs.mkdirSync(PREVIEW_PUBLIC_DIR, { recursive: true });
  const previewPublic = path.join(PREVIEW_PUBLIC_DIR, `${assetId}.png`);
  fs.copyFileSync(run.previewPath, previewPublic);
  await db.blenderAsset.update({
    where: { id: assetId },
    data: { previewPath: `/assets-blender/${assetId}.png`, buildLog: run.log.slice(-4000) },
  });
  return { ok: true, log: run.log, previewPath: `/assets-blender/${assetId}.png` };
}

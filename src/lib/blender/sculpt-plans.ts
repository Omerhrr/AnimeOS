import { db } from "@/lib/db";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import ZAI from "z-ai-web-dev-sdk";
import { compileSculptSpec, DEFAULT_SCULPT_BY_KIND, type SculptSpec, SCULPT_LAYER_KINDS } from "@/lib/blender/sculpt";
import { runtimeBlenderBin } from "@/lib/blender/runtime";

// ─────────────────────────────────────────────────────────────
// THE SURFACE IS READ BEFORE IT IS CARVED (iteration 61 -
// vision-guided sculpt planning, the learned layer)
//
// A sculpt recipe chosen without reading the surface is a guess
// wearing a lab coat. This is the planning layer that reads first:
//
//   1. THE PROBE (deterministic, local): the asset's actual .blend
//      is opened READ-ONLY by bridges/blender/surface_probe.py and
//      measured - tris, verts, bbox, Laplacian roughness (the same
//      detail metric the sculpt pass itself reports), the spread of
//      that roughness, tri density, and a flatness number (1.0 =
//      the clean builder slab the audit calls unfinished).
//   2. THE VISION READ (provider-honest): the asset's own preview
//      PNG is shown to the vision model TOGETHER WITH the probe's
//      numbers, and it plans the treatment in the production's
//      vocabulary (swell / fold / grain, intensity, scale). When
//      the vision pass cannot run, the plan degrades to a
//      deterministic LOCAL plan driven by the probe numbers alone -
//      named honestly (vision+local | local), never silently.
//   3. THE COMPILE: the planned layers go through the same
//      compileSculptSpec law design_sculpt obeys - unknown kinds
//      and wild numbers are refused at the boundary, so a plan can
//      never carry a carve the worker cannot perform.
//   4. THE MEMORY: the compiled plan is saved as a named SculptPlan
//      keyed (project, kind) - shaped like the retopo flow memory.
//      Every carve the plan drives (blender_asset_build plan:'name')
//      appends what the pass MEASURED to the plan's record; every
//      re-audit that stops raising SCULPT after a plan's carve earns
//      the plan a clear and raises it in the consult ranking
//      (design_fix prefers the best-verified plan over the kind's
//      default recipe).
//
// The record is honest: outcomes are appended whatever they
// measured - a plan's failures are part of its lesson.
// ─────────────────────────────────────────────────────────────

export interface SurfacePartRead {
  name: string;
  verts: number;
  tris: number;
  bboxDims: number[];
  roughness: number;
  roughnessSpread: number;
  meanEdge: number;
  relativeRoughness: number;
  density: number;
}

export interface SurfaceRead {
  parts: SurfacePartRead[];
  total: {
    objects: number;
    verts: number;
    tris: number;
    bboxDims: number[] | null;
    roughness: number;
    roughnessSpread: number;
    relativeRoughness: number;
    density: number;
    flatness: number;
  };
  flatRef: number;
}

/** Run the read-only probe over a .blend. Deterministic: the same
 * file always lands the same numbers (fixed stride sampling, no
 * randomness anywhere). */
export async function probeSurface(blendPath: string): Promise<{ ok: true; read: SurfaceRead } | { ok: false; error: string }> {
  const bin = runtimeBlenderBin();
  if (!bin) return { ok: false, error: "no Blender binary - provision the runtime first" };
  const probe = path.join(process.cwd(), "bridges", "blender", "surface_probe.py");
  if (!fs.existsSync(probe)) return { ok: false, error: "surface_probe.py missing from bridges/blender" };
  if (!fs.existsSync(blendPath)) return { ok: false, error: `the .blend is not on disk (${blendPath})` };
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "animeos-probe-"));
  const run = await new Promise<{ code: number | null; out: string; timedOut: boolean }>((resolve) => {
    const child = spawn(bin, ["-b", blendPath, "-P", probe, "--", "--out", outDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let out = "";
    let timedOut = false;
    const killer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }, 90_000);
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", (e: Error) => { out += `\n${e.message}`; });
    child.on("exit", (code) => {
      clearTimeout(killer);
      resolve({ code, out, timedOut });
    });
  });
  const normalized = run.out.replace(/\r/g, "\n");
  const marker = normalized.split("\n").find((l) => l.startsWith("SURFACE_READ "));
  let read: SurfaceRead | null = null;
  if (marker) {
    try {
      read = JSON.parse(marker.slice("SURFACE_READ ".length)) as SurfaceRead;
    } catch {
      read = null;
    }
  }
  if (!read) {
    return { ok: false, error: `the surface probe did not land a readable read: ${normalized.slice(-300)}` };
  }
  if ((read as { error?: string }).error) {
    return { ok: false, error: `the surface probe refused: ${(read as unknown as { error: string }).error}` };
  }
  return { ok: true, read };
}

/** The probe read as compact text - what DSH (and the vision pass)
 * reads: the surface's evidence, not its vibe. */
export function surfaceReadLine(read: SurfaceRead): string {
  const t = read.total;
  const parts = read.parts
    .slice()
    .sort((a, b) => b.tris - a.tris)
    .slice(0, 4)
    .map((p) => `${p.name}: ${p.tris.toLocaleString()} tris, roughness ${p.roughness}, density ${p.density}`)
    .join(" | ");
  return `surface read: ${t.objects} object(s), ${t.verts.toLocaleString()} verts, ${t.tris.toLocaleString()} tris, roughness ${t.roughness} (spread ${t.roughnessSpread}), density ${t.density}, flatness ${t.flatness}${parts ? ` - ${parts}` : ""}`;
}

// ─────────────────────────────────────────────────────────────
// THE VISION READ - a sculptor's look at the asset's own preview
// ─────────────────────────────────────────────────────────────

export interface PlannedLayer {
  kind: string;
  intensity: number;
  scale: number;
}

export interface VisionPlan {
  ok: boolean;
  layers?: PlannedLayer[];
  subdivision?: number;
  note?: string;
  error?: string;
}

async function visionSurfacePlan(
  previewDataUrl: string,
  ctx: {
    kind: string;
    refName: string;
    readLine: string;
    guidance: string | null;
  },
): Promise<VisionPlan> {
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
                `You are a senior sculptor finishing assets at a 3D donghua/anime studio. BEFORE any carve is made, you read the surface: below is the asset's own preview image and the MEASURED read of its actual mesh.`,
                `ASSET: ${ctx.refName} (kind: ${ctx.kind})`,
                ctx.guidance ? `DESIGN GUIDANCE: ${ctx.guidance}` : "",
                `MEASURED SURFACE READ: ${ctx.readLine}`,
                `Plan the surface FINISH in the studio's three-layer vocabulary:`,
                `- swell: broad organic mass (terrain hills, drapery billows, muscle) - base amplitude 0.055 units, scale ~1.4`,
                `- fold: ridged creases and striations (cloth folds, hide, panel lines) - base amplitude 0.032, scale ~4.5`,
                `- grain: fine high-frequency tooth (weathering, skin, dust) - base amplitude 0.0075, scale ~14`,
                `Rules: 1..4 layers; intensity 0..2 each; scale 0.05..60 (higher = finer). A surface that already reads rough (low flatness) needs LESS grain; a clean slab (flatness near 1) needs the full treatment. A ${ctx.kind} should read as production art, not a polished slab - but do not bury a hero silhouette in noise.`,
                `Reply with STRICT JSON only, no markdown fences:`,
                `{"layers":[{"kind":"swell","intensity":1.0,"scale":1.2}],"subdivision":1,"note":"one sentence on what you saw and why this treatment"}`,
                `"subdivision" is the grid level applied before carving (0..3) - raise it only if the measured tris are far below the kind's budget.`,
              ].filter(Boolean).join("\n"),
            },
            { type: "image_url", image_url: { url: previewDataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = res.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      layers?: Array<{ kind?: string; intensity?: number; scale?: number }>;
      subdivision?: number;
      note?: string;
    };
    const layers: PlannedLayer[] = (Array.isArray(parsed.layers) ? parsed.layers : [])
      .filter((l) => l && SCULPT_LAYER_KINDS.includes(String(l.kind ?? "").toLowerCase() as never))
      .slice(0, 4)
      .map((l) => ({
        kind: String(l.kind).toLowerCase(),
        intensity: Number(l.intensity ?? 1),
        scale: Number(l.scale ?? 0),
      }));
    if (layers.length === 0) return { ok: false, error: "the vision read proposed no layer in the studio's vocabulary" };
    return {
      ok: true,
      layers,
      subdivision: Number.isFinite(Number(parsed.subdivision)) ? Number(parsed.subdivision) : 1,
      note: typeof parsed.note === "string" ? parsed.note.slice(0, 400) : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "vision surface plan failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// THE LOCAL FALLBACK - the probe numbers alone drive the plan
// (deterministic; the provider is named honestly when this runs)
// ─────────────────────────────────────────────────────────────

export function localSculptLayers(kind: string, read: SurfaceRead): PlannedLayer[] {
  const flatness = read.total.flatness;
  const density = read.total.density;
  const rawBase = DEFAULT_SCULPT_BY_KIND[kind] ?? DEFAULT_SCULPT_BY_KIND.ENVIRONMENT;
  if (!rawBase) {
    // unreachable: ENVIRONMENT carries a default by law - guarded for the type
    return [];
  }
  const base = rawBase;
  // how hard to carve: a flat slab gets the full kind treatment, an
  // already-rough surface gets a lighter pass (the carve reads the
  // substrate, it does not bury it)
  const strength = Math.max(0.45, Math.min(1.25, 0.45 + 0.8 * flatness));
  const layers = base.layers.map((l) => ({ kind: l.kind, intensity: +(l.intensity * strength).toFixed(3), scale: l.scale }));
  // a dense substrate (tris per unit area far above the kind's norm)
  // needs no extra subdivision to hold grain
  void density;
  return layers;
}

// ─────────────────────────────────────────────────────────────
// THE MEMORY - shaped like the retopo flow memory
// ─────────────────────────────────────────────────────────────

export interface SculptOutcome {
  assetRef: string;
  meanMove: number | null;
  roughnessRatio: number | null;
  trisBefore: number | null;
  trisAfter: number | null;
  at: string;
}

export interface SculptPlanReading {
  surface: { tris: number; verts: number; roughness: number; roughnessSpread: number; flatness: number; density: number };
  vision: { note: string | null; provider: "vision+local" | "local" };
  cited: string[];
}

export interface SculptPlanRow {
  id: string;
  kind: string;
  name: string;
  spec: SculptSpec;
  reading: SculptPlanReading | null;
  outcomes: SculptOutcome[];
  runs: number;
  clears: number;
  learnedFrom: string | null;
}

const MAX_OUTCOMES = 24;

function parseOutcomes(raw: string | null | undefined): SculptOutcome[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as SculptOutcome[]) : [];
  } catch {
    return [];
  }
}

function parseReading(raw: string | null | undefined): SculptPlanReading | null {
  try {
    const parsed = JSON.parse(raw || "null") as SculptPlanReading | null;
    return parsed && parsed.surface ? parsed : null;
  } catch {
    return null;
  }
}

function toRow(r: {
  id: string; kind: string; name: string; spec: string; reading: string; outcomes: string; runs: number; clears: number; learnedFrom: string | null;
}): SculptPlanRow {
  let spec: SculptSpec = { name: r.name, layers: [], subdivision: 1, seed: 7, parts: [] };
  try {
    const parsed = JSON.parse(r.spec) as SculptSpec;
    if (parsed && Array.isArray(parsed.layers)) spec = parsed;
  } catch { /* keep the safe default */ }
  return {
    id: r.id, kind: r.kind, name: r.name, spec,
    reading: parseReading(r.reading), outcomes: parseOutcomes(r.outcomes),
    runs: r.runs, clears: r.clears, learnedFrom: r.learnedFrom,
  };
}

/** The full planning flow: probe -> vision read (provider-honest,
 * local fallback) -> compile -> save. The plan is the memory: it is
 * saved even when its carve has not run yet (a plan nobody can name
 * is a read nobody can reuse). */
export async function planSculpt(input: {
  projectId: string;
  assetId: string;
  name: string;
  useVision?: boolean;
}): Promise<
  | { ok: true; plan: SculptPlanRow; read: SurfaceRead; provider: "vision+local" | "local"; note: string | null; created: boolean }
  | { ok: false; error: string }
> {
  const asset = await db.blenderAsset.findUnique({ where: { id: input.assetId } });
  if (!asset) return { ok: false, error: "asset not found" };
  if (!asset.blendPath || asset.status !== "READY") {
    return { ok: false, error: `${asset.refName} has no accepted .blend on disk - build it first (blender_asset_build)` };
  }
  const probeRes = await probeSurface(asset.blendPath);
  if (!probeRes.ok) return { ok: false, error: probeRes.error };
  const read = probeRes.read;

  // THE VISION READ (the learned assist on the deterministic pass):
  // the preview + the measured numbers, planned in the studio's
  // vocabulary. A pass that cannot run degrades to the local plan -
  // named honestly, never silently.
  let provider: "vision+local" | "local" = "local";
  let layers: PlannedLayer[] | null = null;
  let subdivision: number | null = null;
  let note: string | null = null;
  if (input.useVision !== false && asset.previewPath) {
    const previewFile = asset.previewPath.startsWith("/")
      ? path.join(process.cwd(), "public", asset.previewPath.replace(/^\/+/, ""))
      : asset.previewPath;
    if (fs.existsSync(previewFile)) {
      const b64 = fs.readFileSync(previewFile).toString("base64");
      const vision = await visionSurfacePlan(`data:image/png;base64,${b64}`, {
        kind: asset.kind,
        refName: asset.refName,
        readLine: surfaceReadLine(read),
        guidance: null,
      });
      if (vision.ok && vision.layers) {
        provider = "vision+local";
        layers = vision.layers;
        subdivision = vision.subdivision ?? null;
        note = vision.note ?? null;
      } else {
        note = `vision read unavailable (${vision.error ?? "unknown"}) - planned from the probe numbers alone`;
      }
    } else {
      note = "no preview on disk - planned from the probe numbers alone";
    }
  }
  if (!layers) layers = localSculptLayers(asset.kind, read);

  // THE COMPILE: the same boundary law design_sculpt obeys - a plan
  // can never carry a carve the worker cannot perform.
  const compiled = compileSculptSpec({
    name: input.name,
    layers,
    subdivision,
    seed: null,
    parts: null,
  });
  if (!compiled.ok) return { ok: false, error: `the planned treatment does not compile: ${compiled.error}` };

  const cited = [
    `flatness ${read.total.flatness}`,
    `roughness ${read.total.roughness}`,
    `roughness spread ${read.total.roughnessSpread}`,
    `density ${read.total.density}`,
    `${read.total.tris.toLocaleString()} tris`,
  ];
  const reading: SculptPlanReading = {
    surface: {
      tris: read.total.tris,
      verts: read.total.verts,
      roughness: read.total.roughness,
      roughnessSpread: read.total.roughnessSpread,
      flatness: read.total.flatness,
      density: read.total.density,
    },
    vision: { note, provider },
    cited,
  };

  const existing = await db.sculptPlan.findUnique({
    where: { projectId_kind_name: { projectId: input.projectId, kind: asset.kind, name: input.name } },
  });
  const row = await db.sculptPlan.upsert({
    where: { projectId_kind_name: { projectId: input.projectId, kind: asset.kind, name: input.name } },
    create: {
      projectId: input.projectId,
      kind: asset.kind,
      name: input.name,
      spec: JSON.stringify(compiled.spec),
      reading: JSON.stringify(reading),
      outcomes: JSON.stringify([]),
      learnedFrom: `${asset.kind}:${asset.refName} v${asset.version}`,
    },
    update: {
      spec: JSON.stringify(compiled.spec),
      reading: JSON.stringify(reading),
      learnedFrom: existing?.learnedFrom ?? `${asset.kind}:${asset.refName} v${asset.version}`,
    },
  });
  await db.productionEvent.create({
    data: {
      projectId: input.projectId,
      actor: "DSH",
      type: "DESIGN",
      summary: `Sculpt plan '${input.name}' planned for ${asset.kind.toLowerCase()} ${asset.refName} from a measured surface read (${provider}): ${compiled.spec.layers.map((l) => `${l.kind}@${l.intensity}`).join(", ")}`,
      payload: JSON.stringify({ planId: row.id, reading, cited }).slice(0, 4000),
    },
  });
  return { ok: true, plan: toRow(row), read, provider, note, created: !existing };
}

/** Application: the plan's carve ran - append what the pass measured,
 * whatever it measured (a plan's failures are part of its lesson). */
export async function recordSculptOutcome(
  projectId: string,
  kind: string,
  name: string,
  outcome: Omit<SculptOutcome, "at">,
): Promise<SculptPlanRow | null> {
  const plan = await db.sculptPlan.findUnique({
    where: { projectId_kind_name: { projectId, kind, name } },
  });
  if (!plan) return null;
  const outcomes = [...parseOutcomes(plan.outcomes), { ...outcome, at: new Date().toISOString() }].slice(-MAX_OUTCOMES);
  const updated = await db.sculptPlan.update({
    where: { id: plan.id },
    data: { outcomes: JSON.stringify(outcomes), runs: { increment: 1 } },
  });
  return toRow(updated);
}

/** Reinforcement: the re-audit stopped raising SCULPT after this
 * plan's carve - the plan earns a clear and rises in the consult
 * ranking. */
export async function reinforceSculptPlan(projectId: string, kind: string, name: string): Promise<void> {
  await db.sculptPlan.updateMany({
    where: { projectId, kind, name },
    data: { clears: { increment: 1 } },
  });
}

export async function findSculptPlan(projectId: string, kind: string, name: string): Promise<SculptPlanRow | null> {
  const exact = await db.sculptPlan.findUnique({
    where: { projectId_kind_name: { projectId, kind, name } },
  });
  if (exact) return toRow(exact);
  // A plan is named per kind, but DSH may recall the name without the
  // kind - resolve within the production before refusing.
  const loose = await db.sculptPlan.findFirst({ where: { projectId, name } });
  return loose ? toRow(loose) : null;
}

/** The plan design_fix consults: the kind's best-proven record -
 * plans that cleared the re-audit rank first, then by runs and
 * provenance. A plan with no provenance (never driven a carve)
 * never beats the kind's default recipe. */
export async function bestSculptPlan(projectId: string, kind: string): Promise<SculptPlanRow | null> {
  const rows = await db.sculptPlan.findMany({
    where: { projectId, kind },
    orderBy: [{ clears: "desc" as const }, { runs: "desc" as const }],
    take: 12,
  });
  const plans = rows.map(toRow).filter((p) => p.runs > 0);
  if (plans.length === 0) return null;
  const score = (p: SculptPlanRow) => p.clears * 10 + p.runs * 0.2 + (p.outcomes.length > 0 && (p.outcomes[p.outcomes.length - 1].roughnessRatio ?? 0) > 1 ? 1 : 0);
  return plans.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export async function listSculptPlans(projectId: string): Promise<SculptPlanRow[]> {
  const rows = await db.sculptPlan.findMany({
    where: { projectId },
    orderBy: [{ kind: "asc" as const }, { clears: "desc" as const }],
    take: 24,
  });
  return rows.map(toRow);
}

/** The context line: the production's learned sculpt standing, read
 * before any carve. */
export function sculptPlansContextLine(plans: SculptPlanRow[]): string | null {
  if (plans.length === 0) return null;
  const parts = plans.slice(0, 6).map((p) => {
    const last = p.outcomes.length > 0 ? p.outcomes[p.outcomes.length - 1] : null;
    return `${p.kind} '${p.name}' (${p.spec.layers.map((l) => l.kind).join("+")} @sub ${p.spec.subdivision}; ${p.runs} run${p.runs === 1 ? "" : "s"}, ${p.clears} clear${p.clears === 1 ? "" : "s"}${last && last.roughnessRatio !== null ? `, last ratio ${last.roughnessRatio}` : ""})`;
  });
  return `learned sculpt plans: ${parts.join(" | ")}`;
}

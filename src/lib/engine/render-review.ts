import fs from "fs";
import path from "path";
import sharp from "sharp";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { extractRenderPoster } from "@/lib/identity";

// ─────────────────────────────────────────────────────────────
// THE RENDER IS JUDGED (iteration 59 - the learned assist layer)
//
// A finished render is not APPROVED because the engine exited
// clean - it is judged. This pass pulls a representative frame
// from the finished clip and runs TWO layers over it:
//   LOCAL (deterministic): sharp decodes the frame and MEASURES
//   it - luminance mean/spread, saturation, near-black and
//   clipped-white fractions, a 16-bin histogram. Exposure and
//   contrast are scored from the measurements, and measured
//   pathologies raise issues by name.
//   VISION (learned): the frame is shown to the vision model
//   together with the shot's DIRECTED INTENT (the grammar beats,
//   the fx and physics the production put on the shot) and it
//   scores readability, palette, intent and composition like a
//   cinematographer watching dailies.
// The merge is provider-honest: the provider is named, the local
// pass never invents vision numbers, and a layer that could not
// run is named as absent - never silently skipped.
// The DSH inspection reads the review as EVIDENCE; the review is
// one per render job (the pixels do not change until a new
// attempt renders new ones). And when the fresh attempt was
// queued by the render-fix loop (iteration 60: fixOfJobId names
// the lineage), THIS review is also the judge of the fix that
// preceded it - an issue the new pixels stop raising is FIXED,
// a kind still raised goes back to OPEN with the honest note
// (the way design_fix's re-audit judges its fixes).
// ─────────────────────────────────────────────────────────────

export const RENDER_BAR = 0.72;

export type RenderCriterion =
  | "exposure"
  | "contrast"
  | "readability"
  | "palette"
  | "intent"
  | "composition";

export const RENDER_CRITERIA_WEIGHTS: Record<RenderCriterion, number> = {
  exposure: 0.16,
  contrast: 0.12,
  readability: 0.2,
  palette: 0.12,
  intent: 0.28,
  composition: 0.12,
};

export type RenderIssueKind =
  | "EXPOSURE"
  | "CONTRAST"
  | "READABILITY"
  | "PALETTE"
  | "INTENT"
  | "COMPOSITION"
  | "STAGE";

export const RENDER_ISSUE_KINDS: RenderIssueKind[] = [
  "EXPOSURE", "CONTRAST", "READABILITY", "PALETTE", "INTENT", "COMPOSITION", "STAGE",
];

export interface FrameMetrics {
  width: number;
  height: number;
  lumaMean: number; // 0..1 mean luminance (Rec.709 luma)
  lumaStd: number; // 0..1 luminance spread
  satMean: number; // 0..1 mean saturation (HSV-style, per-pixel max/min)
  darkFrac: number; // fraction of pixels with luma < 0.095 (near-black)
  brightFrac: number; // fraction of pixels with luma > 0.9 (clipped white)
  peakBin: number; // 0..15 the dominant histogram bin
  histogram: number[]; // 16 normalized bins
}

export interface RenderReviewIssue {
  severity: "CRITICAL" | "MAJOR" | "MINOR";
  kind: RenderIssueKind;
  note: string;
}

export interface RenderVerdict {
  criteria: Partial<Record<RenderCriterion, number>>;
  metrics: FrameMetrics | null;
  frame: string | null; // the reviewed frame's public path
  intent: { grammar: string; fx: string[]; physics: string[] } | null;
  issues: RenderReviewIssue[];
  note: string;
  provider: "vision+local" | "vision" | "local";
}

export interface DirectedIntent {
  grammar: string;
  fx: string[];
  physics: string[];
}

/** Trapezoid score: 1 inside the ideal window, falling linearly to 0 at the zero points. */
function trap(x: number, lo: number, hi: number, zLo: number, zHi: number): number {
  if (Number.isNaN(x)) return 0;
  if (x <= zLo || x >= zHi) return 0;
  if (x < lo) return (x - zLo) / (lo - zLo);
  if (x > hi) return (zHi - x) / (zHi - hi);
  return 1;
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

// ─────────────────────────────────────────────────────────────
// THE LOCAL PASS - deterministic measurement of the frame
// ─────────────────────────────────────────────────────────────

/** Decode a frame with sharp and measure it. Deterministic: the same bytes always land the same numbers. */
export async function measureFrame(framePath: string): Promise<FrameMetrics> {
  const { data, info } = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const n = info.width * info.height;
  const hist = new Array<number>(16).fill(0);
  let ySum = 0;
  let ySqSum = 0;
  let satSum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    ySum += y;
    ySqSum += y * y;
    hist[Math.min(15, Math.floor(y * 16))]++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    satSum += mx === 0 ? 0 : (mx - mn) / mx;
    if (y < 0.095) dark++;
    if (y > 0.9) bright++;
  }
  const mean = ySum / n;
  const std = Math.sqrt(Math.max(0, ySqSum / n - mean * mean));
  let peakBin = 0;
  for (let b = 1; b < 16; b++) if (hist[b] > hist[peakBin]) peakBin = b;
  return {
    width: info.width,
    height: info.height,
    lumaMean: +mean.toFixed(4),
    lumaStd: +std.toFixed(4),
    satMean: +(satSum / n).toFixed(4),
    darkFrac: +(dark / n).toFixed(4),
    brightFrac: +(bright / n).toFixed(4),
    peakBin,
    histogram: hist.map((v) => +(v / n).toFixed(4)),
  };
}

export interface LocalJudgement {
  criteria: { exposure: number; contrast: number };
  issues: RenderReviewIssue[];
}

/**
 * Judge the measured frame: exposure and contrast are scored from the
 * measurements (trapezoid windows), and measured pathologies raise
 * issues by name. No vibes - every issue cites its number.
 */
export function judgeLocalFrame(m: FrameMetrics): LocalJudgement {
  const issues: RenderReviewIssue[] = [];
  if (m.lumaMean <= 0.085) {
    issues.push({ severity: "MAJOR", kind: "EXPOSURE", note: `the frame measures near-black (mean luminance ${m.lumaMean.toFixed(2)}) - the stage is unreadable` });
  } else if (m.lumaMean < 0.14) {
    issues.push({ severity: "MINOR", kind: "EXPOSURE", note: `the frame measures dark (mean luminance ${m.lumaMean.toFixed(2)})` });
  }
  if (m.lumaMean >= 0.9) {
    issues.push({ severity: "MAJOR", kind: "EXPOSURE", note: `the frame measures blown out (mean luminance ${m.lumaMean.toFixed(2)})` });
  } else if (m.brightFrac > 0.45) {
    issues.push({ severity: "MINOR", kind: "EXPOSURE", note: `${pct(m.brightFrac)} of the frame clips to white` });
  }
  if (m.lumaStd < 0.03) {
    issues.push({ severity: "MAJOR", kind: "CONTRAST", note: `the frame measures flat and washed (luminance spread ${m.lumaStd.toFixed(3)})` });
  } else if (m.lumaStd < 0.045) {
    issues.push({ severity: "MINOR", kind: "CONTRAST", note: `the frame measures low-contrast (luminance spread ${m.lumaStd.toFixed(3)})` });
  }
  if (m.darkFrac > 0.62 && m.lumaMean > 0.085) {
    issues.push({ severity: "MAJOR", kind: "STAGE", note: `${pct(m.darkFrac)} of the frame sits near-black - the stage reads empty` });
  }
  if (m.satMean > 0.8) {
    issues.push({ severity: "MINOR", kind: "PALETTE", note: `the frame measures oversaturated (mean saturation ${m.satMean.toFixed(2)})` });
  }
  return {
    criteria: {
      exposure: +trap(m.lumaMean, 0.16, 0.72, 0.03, 0.95).toFixed(4),
      contrast: +trap(m.lumaStd, 0.055, 0.34, 0.012, 0.62).toFixed(4),
    },
    issues,
  };
}

// ─────────────────────────────────────────────────────────────
// THE INTENT CONTEXT - what the shot was DIRECTED to do
// ─────────────────────────────────────────────────────────────

/** Read the shot's directed columns defensively - a corrupt column is an absent intent, never a crash. */
export function directedIntentOf(shot: { grammar: string | null; fx: string | null; physics: string | null }): DirectedIntent | null {
  let grammar = "";
  try {
    const g = JSON.parse(shot.grammar || "null") as Array<{ move?: string; from?: number; to?: number; wind?: number }> | null;
    if (Array.isArray(g) && g.length > 0) {
      grammar = g
        .map((b) => `${b.move ?? "?"} ${Math.round((b.from ?? 0) * 100)}-${Math.round((b.to ?? 0) * 100)}%${typeof b.wind === "number" && b.wind > 0 ? ` W${b.wind}` : ""}`)
        .join(", ");
    }
  } catch {
    grammar = "";
  }
  let fx: string[] = [];
  try {
    const f = JSON.parse(shot.fx || "null") as Array<{ kind?: string; beats?: unknown }> | null;
    if (Array.isArray(f)) fx = f.filter((p) => p?.kind).map((p) => `${p.kind}${Array.isArray(p.beats) ? `@${(p.beats as number[]).join(".")}` : ""}`);
  } catch {
    fx = [];
  }
  let physics: string[] = [];
  try {
    const p = JSON.parse(shot.physics || "null") as Array<{ kind?: string; target?: string; beats?: unknown }> | null;
    if (Array.isArray(p)) physics = p.filter((x) => x?.kind).map((x) => `${x.kind}${x.target ? `>${x.target}` : ""}`);
  } catch {
    physics = [];
  }
  if (!grammar && fx.length === 0 && physics.length === 0) return null;
  return { grammar, fx, physics };
}

// ─────────────────────────────────────────────────────────────
// THE VISION PASS - a cinematographer's read of the frame
// ─────────────────────────────────────────────────────────────

async function visionFrameReview(
  frameDataUrl: string,
  ctx: {
    title: string;
    style: string;
    scene: string;
    shot: string;
    spec: string;
    intent: DirectedIntent | null;
  },
): Promise<{ ok: boolean; criteria?: Partial<Record<RenderCriterion, number>>; issues?: RenderReviewIssue[]; note?: string; error?: string }> {
  const intentLines: string[] = [];
  if (ctx.intent) {
    if (ctx.intent.grammar) intentLines.push(`DIRECTED GRAMMAR: ${ctx.intent.grammar} (the camera performs these beats across the clip; this frame is one moment of it)`);
    if (ctx.intent.fx.length > 0) intentLines.push(`DIRECTED FX: ${ctx.intent.fx.join(", ")}`);
    if (ctx.intent.physics.length > 0) intentLines.push(`DIRECTED PHYSICS: ${ctx.intent.physics.join(", ")}`);
  }
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
                `You are a senior cinematographer reviewing dailies at a 3D donghua/anime studio: ONE representative frame pulled from a finished Blender render of a directed shot (40% through the clip). Judge it like production dailies, not like a photo.`,
                `PRODUCTION: ${ctx.title} (${ctx.style})`,
                ctx.scene,
                ctx.shot,
                `SPEC: ${ctx.spec}`,
                ...(intentLines.length > 0 ? intentLines : ["(the shot carries no directed grammar, fx or physics - judge it as directed)"]),
                "Score each criterion 0..1:",
                "- readability (the subject reads clearly against the stage: silhouette, separation, legibility of the action)",
                "- palette (coherent, purposeful color in the show's register)",
                "- intent (does THIS frame serve the shot's dramatic intent as directed above; an empty stage when the direction promises presence scores low here)",
                "- composition (framing, subject placement, depth)",
                "Also list concrete, actionable issues with severity (CRITICAL | MAJOR | MINOR) and kind (EXPOSURE | CONTRAST | READABILITY | PALETTE | INTENT | COMPOSITION | STAGE). STAGE means the frame reads as an empty or near-empty stage when the direction promises presence.",
                'Reply with STRICT JSON only, no markdown fences:',
                '{"criteria":{"readability":0.0,"palette":0.0,"intent":0.0,"composition":0.0},"issues":[{"severity":"MINOR","kind":"COMPOSITION","note":"..."}],"note":"one sentence overall"}',
                "One frame is a sample, not the whole clip: when the frame alone cannot judge something (motion, timing), say so in the note instead of guessing. This is a stylized procedural render - judge DESIGN quality (readability, framing, light logic), not photorealism.",
              ].join("\n"),
            },
            { type: "image_url", image_url: { url: frameDataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never)) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = res.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as {
      criteria?: Record<string, number>;
      issues?: Array<{ severity?: string; kind?: string; note?: string }>;
      note?: string;
    };
    const criteria: Partial<Record<RenderCriterion, number>> = {};
    for (const key of ["readability", "palette", "intent", "composition"] as RenderCriterion[]) {
      const v = parsed.criteria?.[key];
      criteria[key] = typeof v === "number" ? Math.min(1, Math.max(0, v)) : undefined;
      if (criteria[key] === undefined) delete criteria[key];
    }
    const issues: RenderReviewIssue[] = (Array.isArray(parsed.issues) ? parsed.issues : [])
      .filter((i) => i && i.note && RENDER_ISSUE_KINDS.includes(String(i.kind ?? "").toUpperCase() as RenderIssueKind))
      .slice(0, 8)
      .map((i) => ({
        severity: (["CRITICAL", "MAJOR", "MINOR"].includes(String(i.severity ?? "").toUpperCase()) ? String(i.severity).toUpperCase() : "MINOR") as RenderReviewIssue["severity"],
        kind: String(i.kind ?? "COMPOSITION").toUpperCase() as RenderIssueKind,
        note: String(i.note).slice(0, 300),
      }));
    return { ok: true, criteria, issues, note: typeof parsed.note === "string" ? parsed.note.slice(0, 400) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "vision review failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// THE MERGE - weighted overall over the criteria that ran
// ─────────────────────────────────────────────────────────────

function weightedOverall(criteria: Partial<Record<RenderCriterion, number>>): number | null {
  let sum = 0;
  let wsum = 0;
  for (const [k, w] of Object.entries(RENDER_CRITERIA_WEIGHTS) as Array<[RenderCriterion, number]>) {
    const v = criteria[k];
    if (typeof v === "number") {
      sum += v * w;
      wsum += w;
    }
  }
  return wsum > 0 ? +(sum / wsum).toFixed(4) : null;
}

export interface RenderReviewResult {
  ok: true;
  review: {
    id: string;
    targetRef: string;
    state: string;
    overall: number | null;
    provider: string;
    framePath: string | null;
    issuesFound: number;
    verdict: RenderVerdict | null;
  };
}

/**
 * Review ONE finished render job. Reuses the existing review (the
 * pixels did not change); a new attempt earns a new one. The layers
 * are provider-honest: the provider names what actually ran.
 */
export async function reviewRenderJob(renderJobId: string, opts?: { useVision?: boolean }): Promise<RenderReviewResult | { ok: false; error: string }> {
  const existing = await db.renderReview.findUnique({ where: { renderJobId } });
  if (existing) {
    let verdict: RenderVerdict | null = null;
    try {
      verdict = existing.verdict ? (JSON.parse(existing.verdict) as RenderVerdict) : null;
    } catch {
      verdict = null;
    }
    return {
      ok: true,
      review: {
        id: existing.id, targetRef: existing.targetRef, state: existing.state,
        overall: existing.overall, provider: existing.provider, framePath: existing.framePath,
        issuesFound: existing.issuesFound, verdict,
      },
    };
  }

  const job = await db.renderJob.findUnique({
    where: { id: renderJobId },
    include: {
      shot: { include: { scene: { include: { environment: true, episode: { include: { season: { include: { project: true } } } } } } } },
    },
  });
  if (!job) return { ok: false, error: `render job ${renderJobId} not found` };
  if (!job.outputUrl) return { ok: false, error: `the render has no finished clip yet (status ${job.status}) - review what exists, not what is promised` };
  const clipAbs = path.join(process.cwd(), "public", job.outputUrl.split("?")[0].replace(/^\//, ""));
  if (!fs.existsSync(clipAbs)) return { ok: false, error: `the clip file is missing on disk (${job.outputUrl})` };

  const shot = job.shot;
  const scene = shot?.scene;
  const targetRef = scene && shot ? `Sc${scene.number} Sh${String(shot.number).padStart(3, "0")}` : `job ${job.id.slice(-6)}`;

  // The frame: the existing poster primitive (ffmpeg, 40% through the clip, cached).
  const posterDataUrl = await extractRenderPoster(clipAbs, job.id);
  if (!posterDataUrl) return { ok: false, error: "no frame could be extracted from the clip (ffmpeg missing or an empty clip)" };
  const framePath = `/renders/posters/${job.id}.jpg`;
  const frameAbs = path.join(process.cwd(), "public", "renders", "posters", `${job.id}.jpg`);

  // THE LOCAL PASS - always, when a frame exists.
  let metrics: FrameMetrics | null = null;
  let localJudge: LocalJudgement | null = null;
  try {
    metrics = await measureFrame(frameAbs);
    localJudge = judgeLocalFrame(metrics);
  } catch {
    metrics = null;
    localJudge = null;
  }

  // THE INTENT CONTEXT - what the shot was directed to do.
  const intent = shot ? directedIntentOf(shot) : null;

  // THE VISION PASS - the learned layer.
  const useVision = opts?.useVision !== false;
  let vision: Awaited<ReturnType<typeof visionFrameReview>> | null = null;
  if (useVision) {
    vision = await visionFrameReview(posterDataUrl, {
      title: job.shot?.scene?.episode?.season?.project?.title ?? "Production",
      style: job.shot?.scene?.episode?.season?.project?.visualStyle ?? "3D",
      scene: scene ? `SCENE ${scene.number} "${scene.title}" - ${scene.description ?? ""} (${scene.environment?.weather ?? ""}, ${scene.environment?.lighting ?? ""})` : "(scene unlinked)",
      shot: shot ? `SHOT ${String(shot.number).padStart(3, "0")} (attempt ${job.attempt}): ${shot.description}` : `(shot detached) ${job.mode} render`,
      spec: shot ? `type=${shot.shotType}, lens=${shot.lens ?? "default"}, movement=${shot.movement ?? "static"}, duration=${shot.duration}s, lighting=${shot.lighting ?? "default"}` : `mode=${job.mode}`,
      intent,
    });
  }

  // THE MERGE - local owns the measured criteria, vision owns the perceptual ones.
  const criteria: Partial<Record<RenderCriterion, number>> = {};
  if (localJudge) {
    criteria.exposure = localJudge.criteria.exposure;
    criteria.contrast = localJudge.criteria.contrast;
  }
  let issues: RenderReviewIssue[] = localJudge ? [...localJudge.issues] : [];
  let note = "";
  let provider: RenderVerdict["provider"] | "none" = localJudge ? "local" : "none";
  if (vision?.ok) {
    for (const key of ["readability", "palette", "intent", "composition"] as RenderCriterion[]) {
      const v = vision.criteria?.[key];
      if (typeof v === "number") criteria[key] = v;
    }
    if (vision.criteria?.exposure !== undefined && criteria.exposure === undefined) criteria.exposure = vision.criteria.exposure;
    issues = [...issues, ...(vision.issues ?? [])].slice(0, 12);
    note = vision.note ?? "";
    provider = localJudge ? "vision+local" : "vision";
  } else if (useVision && vision && !vision.ok) {
    note = localJudge ? "the vision pass did not answer; the verdict rests on the local measurements alone" : `no layer could judge the frame: ${vision.error ?? "unknown"}`;
  } else if (!useVision) {
    note = localJudge ? "vision skipped by request; the verdict rests on the local measurements alone" : "no frame to judge";
  }

  const overall = weightedOverall(criteria);
  const hasMajor = issues.some((i) => i.severity === "MAJOR" || i.severity === "CRITICAL");
  const state = overall !== null && overall >= RENDER_BAR && !hasMajor ? "PASSED" : "NEEDS_WORK";

  const verdict: RenderVerdict = {
    criteria,
    metrics,
    frame: framePath,
    intent,
    issues,
    note,
    provider: provider === "none" ? "local" : provider,
  };

  // Persist: one review per job, issues recreated under it.
  const review = await db.renderReview.upsert({
    where: { renderJobId: job.id },
    create: {
      projectId: job.projectId,
      renderJobId: job.id,
      shotId: job.shotId,
      targetRef,
      state,
      bar: RENDER_BAR,
      overall,
      verdict: JSON.stringify(verdict),
      issuesFound: issues.length,
      framePath,
      provider: verdict.provider,
    },
    update: {
      state,
      bar: RENDER_BAR,
      overall,
      verdict: JSON.stringify(verdict),
      issuesFound: issues.length,
      framePath,
      provider: verdict.provider,
    },
  });
  await db.renderIssue.deleteMany({ where: { renderJobId: job.id } });
  if (issues.length > 0) {
    await db.renderIssue.createMany({
      data: issues.map((i) => ({
        projectId: job.projectId,
        reviewId: review.id,
        renderJobId: job.id,
        refName: targetRef,
        severity: i.severity,
        kind: i.kind,
        note: i.note.slice(0, 400),
      })),
    });
  }

  await db.productionEvent.create({
    data: {
      projectId: job.projectId,
      actor: "DSH",
      type: "EVALUATION",
      summary: `Pixel review - ${targetRef} attempt ${job.attempt}: ${overall !== null ? pct(overall) : "unmeasured"} (${verdict.provider}), ${issues.length} issue(s) - ${state}`,
      payload: JSON.stringify({ renderJobId: job.id, targetRef, state, overall, provider: verdict.provider, issues: issues.slice(0, 6) }).slice(0, 4000),
    },
  });

  // THE FIX RETURNS TO THE PIXELS (iteration 60): when this attempt
  // was queued by the render-fix loop, this fresh review is THE JUDGE
  // of the issues it set out to fix. Never blocks the review itself.
  await reconcileRenderFixes(job.id).catch(() => {});

  return {
    ok: true,
    review: {
      id: review.id, targetRef, state, overall, provider: verdict.provider,
      framePath, issuesFound: issues.length, verdict,
    },
  };
}

/**
 * The evaluator's hook: make sure a review exists for this job, then
 * return it. Never blocks inspection - an honest error names the gap.
 */
export async function ensureRenderReview(renderJobId: string): Promise<RenderReviewResult | { ok: false; error: string }> {
  return reviewRenderJob(renderJobId);
}

// ─────────────────────────────────────────────────────────────
// THE FIX RETURNS TO THE PIXELS - the reconciliation (iteration
// 60). Called when a fresh review lands: if the job fixes a
// previous attempt (fixOfJobId), the freshly-raised kinds judge
// that attempt's FIXING issues. Judged by KIND, exactly like
// design_fix's re-audit judges its own fixes: the kind the new
// pixels stop raising is FIXED; a kind still raised goes back to
// OPEN (so a later render_fix can target it again) with the
// honest note that the re-review still flags it.
// ─────────────────────────────────────────────────────────────
export async function reconcileRenderFixes(renderJobId: string): Promise<{ cleared: number; held: number } | null> {
  const job = await db.renderJob.findUnique({
    where: { id: renderJobId },
    select: { id: true, fixOfJobId: true, attempt: true, status: true },
  });
  if (!job?.fixOfJobId) return null;
  const review = await db.renderReview.findUnique({ where: { renderJobId }, include: { issues: true } });
  if (!review) return null;
  const fixing = await db.renderIssue.findMany({ where: { renderJobId: job.fixOfJobId, status: "FIXING" } });
  if (fixing.length === 0) return null;
  const raised = new Set(review.issues.map((i) => i.kind));
  let cleared = 0;
  let held = 0;
  for (const t of fixing) {
    if (raised.has(t.kind)) {
      held += 1;
      await db.renderIssue.update({
        where: { id: t.id },
        data: {
          status: "OPEN",
          fixNote: `${t.fixNote ?? "fix queued"} - but attempt ${job.attempt}'s review still flags ${t.kind}`,
        },
      });
    } else {
      cleared += 1;
      await db.renderIssue.update({
        where: { id: t.id },
        data: { status: "FIXED", fixNote: `cleared by attempt ${job.attempt}'s pixel review`, fixedAt: new Date() },
      });
    }
  }
  await db.productionEvent.create({
    data: {
      projectId: review.projectId,
      actor: "DSH",
      type: "EVALUATION",
      summary: `Render fix judged - ${cleared}/${fixing.length} issue(s) cleared by attempt ${job.attempt}'s review${held ? `, ${held} still flagged (the loop may run again)` : ""}`,
      payload: JSON.stringify({ renderJobId, fixOfJobId: job.fixOfJobId, cleared, held, raisedKinds: [...raised] }).slice(0, 4000),
    },
  });
  return { cleared, held };
}

/** The pixel evidence as compact text for the DSH inspection prompt (or null when no review ran). */
export function formatPixelEvidence(review: RenderReviewResult["review"]): string | null {
  const v = review.verdict;
  if (!v) return null;
  const crit = Object.entries(v.criteria)
    .filter(([, x]) => typeof x === "number")
    .map(([k, x]) => `${k} ${(x as number).toFixed(2)}`)
    .join(", ");
  const lines: string[] = [];
  lines.push(`PIXEL REVIEW (provider ${review.provider}, overall ${review.overall !== null ? pct(review.overall) : "unmeasured"}, state ${review.state}):`);
  if (crit) lines.push(`  criteria: ${crit}`);
  if (v.metrics) lines.push(`  measured: lumaMean ${v.metrics.lumaMean}, lumaStd ${v.metrics.lumaStd}, satMean ${v.metrics.satMean}, near-black ${(v.metrics.darkFrac * 100).toFixed(1)}%, clipped-white ${(v.metrics.brightFrac * 100).toFixed(1)}%`);
  if (v.intent) {
    if (v.intent.grammar) lines.push(`  directed grammar: ${v.intent.grammar}`);
    if (v.intent.fx.length > 0) lines.push(`  directed fx: ${v.intent.fx.join(", ")}`);
    if (v.intent.physics.length > 0) lines.push(`  directed physics: ${v.intent.physics.join(", ")}`);
  }
  for (const i of v.issues.slice(0, 6)) lines.push(`  ${i.severity} ${i.kind}: ${i.note}`);
  if (v.note) lines.push(`  reviewer note: ${v.note}`);
  lines.push("  The pixel review is EVIDENCE, not a verdict: weigh it, then decide like a director. Findings it raises should appear in your findings.");
  return lines.join("\n");
}

/** The context line: the studio's pixel-review standing, read before promising render quality. */
export function renderPixelContextLine(
  latest: { targetRef: string; state: string; overall: number | null; provider: string; issuesFound: number } | null,
): string | null {
  if (!latest) return null;
  const pctOverall = latest.overall !== null ? pct(latest.overall) : "unmeasured";
  const issueNames = latest.issuesFound > 0 ? `, ${latest.issuesFound} issue(s)` : ", clean";
  return `latest pixel review: ${latest.targetRef} ${latest.state} ${pctOverall} (${latest.provider}${issueNames})`;
}

import { db } from "@/lib/db";
import { stageFor } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// RENDER PIPELINE (simulated engine driver)
//
// Architecture per the vision doc:
//   Scene → Shot → Validation → Render → DSH Inspection → Revision → Approve
//
// The Blender Bridge is an interface; this driver simulates the heavy
// engine work with timed stages so the production state machine,
// render queue, and DSH evaluation loop are all exercised end-to-end.
// Swap `createRenderJob` internals for a real bpy worker later —
// nothing above this layer changes.
// ─────────────────────────────────────────────────────────────

export async function createRenderJob(projectId: string, shotId: string | null, mode: "PREVIEW" | "FINAL") {
  const lastAttempt = await db.renderJob.findFirst({
    where: { projectId, shotId, mode },
    orderBy: { attempt: "desc" },
  });

  const job = await db.renderJob.create({
    data: {
      projectId,
      shotId,
      mode,
      status: "RENDERING",
      stage: "Validating scene graph",
      attempt: (lastAttempt?.attempt ?? 0) + 1,
      durationMs: mode === "PREVIEW" ? 16000 : 28000,
      startedAt: new Date(),
    },
  });

  if (shotId) {
    await db.shot.update({ where: { id: shotId }, data: { status: "RENDERING" } }).catch(() => {});
  }

  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "RENDER",
      summary: `Render job ${job.id.slice(-6)} queued — ${mode} attempt ${job.attempt}`,
      payload: JSON.stringify({ jobId: job.id, shotId, mode }),
    },
  });

  return job;
}

/**
 * Advance a job's progress based on elapsed wall-clock time.
 * Returns the refreshed job. When a job crosses 100% the caller is
 * responsible for triggering the DSH evaluation pass exactly once.
 */
export async function tickRenderJob(jobId: string) {
  let job = await db.renderJob.findUnique({ where: { id: jobId }, include: { evaluation: true } });
  if (!job) return null;

  if (job.status === "RENDERING" && job.startedAt) {
    const elapsed = Date.now() - job.startedAt.getTime();
    const ratio = Math.min(1, elapsed / job.durationMs);
    const progress = Math.floor(ratio * 100);

    if (ratio >= 1) {
      job = await db.renderJob.update({
        where: { id: jobId },
        data: { status: "REVIEW", progress: 100, stage: "Awaiting DSH inspection", finishedAt: new Date() },
        include: { evaluation: true },
      });
    } else if (Math.abs(progress - job.progress) >= 1) {
      job = await db.renderJob.update({
        where: { id: jobId },
        data: { progress, stage: stageFor(progress) },
        include: { evaluation: true },
      });
    }
  }

  return job;
}

/** Tick every active job in a project (used by queue list polling). */
export async function tickProjectJobs(projectId: string) {
  const active = await db.renderJob.findMany({
    where: { projectId, status: { in: ["QUEUED", "RENDERING"] } },
    select: { id: true },
  });
  for (const j of active) await tickRenderJob(j.id);
}

const PARAM_FIELDS = [
  "fogDensity",
  "lightningIntensity",
  "energyIntensity",
  "cameraDistance",
  "rimLightIntensity",
] as const;

export type TunableParam = (typeof PARAM_FIELDS)[number];

export function isTunableParam(p: string): p is TunableParam {
  return (PARAM_FIELDS as readonly string[]).includes(p);
}

/**
 * Apply an approved DSH evaluation's modification actions to the live
 * scene/shot state, then mark them applied. This closes the
 * "DSH modifies the scene → render again" loop.
 */
export async function applyEvaluationActions(evaluationId: string) {
  const evaluation = await db.evaluation.findUnique({
    where: { id: evaluationId },
    include: { renderJob: { include: { shot: { include: { scene: true } } } } },
  });
  if (!evaluation || evaluation.applied) return null;

  const actions = JSON.parse(evaluation.actions || "[]") as Array<{
    type: string;
    param: string;
    to: number | string;
  }>;

  const shot = evaluation.renderJob.shot;
  const scene = shot?.scene;

  for (const action of actions) {
    if (!scene) break;
    if (action.type === "ADJUST_SCENE" && isTunableParam(action.param) && typeof action.to === "number") {
      await db.scene.update({ where: { id: scene.id }, data: { [action.param]: action.to } });
    }
    if (action.type === "ADJUST_SHOT" && typeof action.to === "string") {
      if (action.param === "movement") await db.shot.update({ where: { id: shot.id }, data: { movement: action.to } });
      if (action.param === "lighting") await db.shot.update({ where: { id: shot.id }, data: { lighting: action.to } });
      if (action.param === "lens") await db.shot.update({ where: { id: shot.id }, data: { lens: action.to } });
      if (action.param === "description") await db.shot.update({ where: { id: shot.id }, data: { description: action.to } });
    }
  }

  await db.evaluation.update({ where: { id: evaluationId }, data: { applied: true } });

  if (evaluation.renderJob.shot) {
    await db.shot.update({
      where: { id: evaluation.renderJob.shot.id },
      data: { status: evaluation.verdict === "APPROVED" ? "APPROVED" : "REVIEW" },
    });
  }
  if (scene) {
    await db.scene.update({
      where: { id: scene.id },
      data: { status: evaluation.verdict === "APPROVED" ? "APPROVED" : "REVIEW" },
    });
  }

  await db.productionEvent.create({
    data: {
      projectId: evaluation.renderJob.projectId,
      actor: "DSH",
      type: "STATE_CHANGE",
      summary: `Applied ${actions.length} modification(s) from evaluation ${evaluationId.slice(-6)} (${evaluation.verdict})`,
      payload: evaluation.actions,
    },
  });

  return true;
}

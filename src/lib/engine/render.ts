import { db } from "@/lib/db";
import fs from "fs";
import path from "path";
import { stageFor } from "@/lib/types";
import { bridgeStatus, submitRenderJob, pollJobProgress } from "@/lib/bridge/blender";

// ─────────────────────────────────────────────────────────────
// RENDER PIPELINE (pluggable engine driver)
//
// Architecture per the vision doc:
//   Scene → Shot → Validation → Render → DSH Inspection → Revision → Approve
//
// Two drivers behind the same job lifecycle:
//   • BLENDER   - a live Blender instance running the AnimeOS bridge
//     add-on (bridges/blender/animeos_bridge.py). Jobs are submitted
//     over HTTP, progress is polled, and the finished frame is pulled
//     back into public/renders/.
//   • SIMULATOR - the built-in timed-stage driver, used whenever no
//     Blender is attached (and as automatic fallback mid-job). The
//     production state machine, render queue, and DSH evaluation loop
//     are identical for both drivers.
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

  let driver = "SIMULATOR";
  let stage = "Validating scene graph";

  // Live Blender attached? Hand the job to the real engine.
  const bridge = await bridgeStatus(true);
  if (bridge.reachable && bridge.host && shotId) {
    const shot = await db.shot.findUnique({
      where: { id: shotId },
      include: { scene: true },
    });
    if (shot) {
      const project = await db.project.findUnique({ where: { id: projectId } });
      const submit = await submitRenderJob({
        jobId: job.id,
        shot: {
          number: shot.number,
          description: shot.description,
          shotType: shot.shotType,
          lens: shot.lens,
          movement: shot.movement,
          lighting: shot.lighting,
        },
        scene: {
          number: shot.scene.number,
          title: shot.scene.title,
          fogDensity: shot.scene.fogDensity,
          lightningIntensity: shot.scene.lightningIntensity,
          energyIntensity: shot.scene.energyIntensity,
          cameraDistance: shot.scene.cameraDistance,
          rimLightIntensity: shot.scene.rimLightIntensity,
        },
        project: {
          title: project?.title ?? "AnimeOS",
          visualStyle: project?.visualStyle ?? "DONGHUA",
          resolution: project?.resolution ?? "1920x1080",
          fps: project?.fps ?? 24,
        },
        mode,
      });
      if (submit.submitted) {
        driver = "BLENDER";
        stage = `Blender: job submitted → ${bridge.host}`;
      } else {
        stage = `Blender submit failed (${submit.error ?? "unknown"}) - simulator taking over`;
      }
    }
  }

  const finalJob = await db.renderJob.update({
    where: { id: job.id },
    data: { driver, stage },
  });

  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "RENDER",
      summary: `Render job ${job.id.slice(-6)} queued - ${mode} attempt ${job.attempt} (${driver})`,
      payload: JSON.stringify({ jobId: job.id, shotId, mode, driver }),
    },
  });

  return finalJob;
}

/**
 * Advance a job's progress. BLENDER jobs poll the live engine;
 * SIMULATOR jobs advance on elapsed wall-clock time.
 * When a job crosses 100% the caller is responsible for triggering
 * the DSH evaluation pass exactly once.
 */
export async function tickRenderJob(jobId: string) {
  let job = await db.renderJob.findUnique({ where: { id: jobId }, include: { evaluation: true } });
  if (!job) return null;

  if (job.status !== "RENDERING") return job;

  if (job.driver === "BLENDER") {
    const prog = await pollJobProgress(job.id);

    if (prog.polled && typeof prog.progress === "number") {
      const progress = Math.min(100, Math.floor(prog.progress * 100));
      if (prog.done) {
        if (prog.pngBase64) persistRenderFrame(job.id, prog.pngBase64);
        if (prog.error) {
          job = await db.renderJob.update({
            where: { id: jobId },
            data: { status: "FAILED", stage: `Blender: ${prog.error}`.slice(0, 120), progress: 100, finishedAt: new Date() },
            include: { evaluation: true },
          });
        } else {
          job = await db.renderJob.update({
            where: { id: jobId },
            data: { status: "REVIEW", progress: 100, stage: prog.stage?.slice(0, 120) || "Blender render complete - awaiting DSH inspection", finishedAt: new Date() },
            include: { evaluation: true },
          });
        }
      } else if (progress !== job.progress) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { progress, stage: prog.stage ?? stageFor(progress) },
          include: { evaluation: true },
        });
      }
    } else {
      // Bridge lost mid-job - degrade to the simulator cleanly.
      job = await db.renderJob.update({
        where: { id: jobId },
        data: { driver: "SIMULATOR", stage: "Blender bridge lost - simulator taking over", startedAt: new Date() },
        include: { evaluation: true },
      });
    }
    return job;
  }

  if (job.startedAt) {
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

function persistRenderFrame(jobId: string, base64: string) {
  try {
    const dir = path.join(process.cwd(), "public", "renders");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${jobId}.png`), Buffer.from(base64, "base64"));
  } catch {
    // non-fatal - the frame already exists on the Blender host
  }
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

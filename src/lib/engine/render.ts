import { db } from "@/lib/db";
import fs from "fs";
import path from "path";
import { stageFor } from "@/lib/types";
import {
  bridgeStatus, submitRenderJob, pollJobProgress,
  pollLocalJob, localJobStale,
} from "@/lib/bridge/blender";
import { renderShotClip, detectFfmpeg } from "@/lib/bridge/motion";

// ─────────────────────────────────────────────────────────────
// RENDER PIPELINE (pluggable engine drivers)
//
// Architecture per the vision doc:
//   Scene → Shot → Validation → Render → DSH Inspection → Revision → Approve
//
// Every driver behind the same job lifecycle now produces REAL
// ANIMATED SHOTS - a sequenced clip per shot's camera grammar, not
// a still:
//   • BLENDER        - a workstation Blender running the AnimeOS
//     bridge server (env host over HTTP), rendering the frame
//     range with Cycles and returning the finished clip.
//   • BLENDER_LOCAL  - a locally-installed headless Blender: each
//     job spawns its own worker subprocess (one 3D render at a
//     time), progress flows through a state file.
//   • MOTION         - the built-in ffmpeg engine: deterministic
//     camera program (movement / shot type / lens / lighting /
//     fog / lightning / energy) animated over the shot's key art.
//   • SIMULATOR      - wall-clock fallback when no engine exists.
//
// The production state machine, render queue, and DSH evaluation
// loop are identical for all four drivers.
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
  let clipMs = 0;

  // Pick the first engine that can take the job.
  const bridge = await bridgeStatus(true);
  const shot = shotId
    ? await db.shot.findUnique({ where: { id: shotId }, include: { scene: true } })
    : null;

  if (bridge.reachable && shot) {
    const project = await db.project.findUnique({ where: { id: projectId } });
    const payload = {
      jobId: job.id,
      shot: {
        number: shot.number,
        description: shot.description,
        shotType: shot.shotType,
        lens: shot.lens,
        movement: shot.movement,
        lighting: shot.lighting,
        duration: shot.duration,
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
    };
    const submit = await submitRenderJob(payload);
    if (submit.submitted) {
      driver = submit.path === "local" ? "BLENDER_LOCAL" : "BLENDER";
      stage = submit.path === "local"
        ? "Blender: headless sequence worker spawned"
        : `Blender: job submitted → ${bridge.host}`;
      clipMs = Math.round(shot.duration * 1000);
    } else {
      stage = `Blender submit failed (${submit.error ?? "unknown"}) - trying the built-in engine`;
    }
  }

  // MOTION engine: built-in ffmpeg camera-grammar renderer.
  if (driver === "SIMULATOR" && shot && (await detectFfmpeg())) {
    driver = "MOTION";
    clipMs = Math.round(shot.duration * 1000);
    stage = "Motion: planning camera program";
    startMotionJob(job.id, shot, mode);
  }

  const finalJob = await db.renderJob.update({
    where: { id: job.id },
    data: { driver, stage, ...(clipMs > 0 ? { durationMs: clipMs } : {}) },
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

// ── MOTION engine runner (async, updates the job as ffmpeg encodes) ──

function startMotionJob(jobId: string, shot: { scene: { id: string; fogDensity: number; lightningIntensity: number; energyIntensity: number; cameraDistance: number; rimLightIntensity: number }; shotType: string; lens: string | null; movement: string | null; lighting: string | null; duration: number; number: number; artworkUrl: string | null }, mode: "PREVIEW" | "FINAL") {
  void (async () => {
    let lastPct = -1;
    try {
      const sceneProject = await db.scene.findUnique({ where: { id: shot.scene.id }, select: { episode: { select: { season: { select: { projectId: true } } } } } });
      const projectRow = sceneProject
        ? await db.project.findUnique({ where: { id: sceneProject.episode.season.projectId } })
        : null;
      const result = await renderShotClip({
        jobId,
        shotType: shot.shotType,
        lens: shot.lens,
        movement: shot.movement,
        lighting: shot.lighting,
        fogDensity: shot.scene.fogDensity,
        lightningIntensity: shot.scene.lightningIntensity,
        energyIntensity: shot.scene.energyIntensity,
        cameraDistance: shot.scene.cameraDistance,
        rimLightIntensity: shot.scene.rimLightIntensity,
        duration: shot.duration,
        fps: projectRow?.fps ?? 24,
        resolution: projectRow?.resolution ?? "1920x1080",
        mode,
        artworkUrl: shot.artworkUrl,
        shotNumber: shot.number,
        onProgress: (ratio) => {
          const pct = Math.floor(ratio * 25) * 4;
          if (pct > lastPct) {
            lastPct = pct;
            void db.renderJob.update({
              where: { id: jobId },
              data: { progress: pct, stage: stageFor(pct) },
            }).catch(() => {});
          }
        },
      });
      if (result.outputUrl) {
        await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "REVIEW",
            progress: 100,
            stage: `Motion clip ready - ${result.programNote}`.slice(0, 120),
            outputUrl: result.outputUrl,
            finishedAt: new Date(),
          },
        });
      } else {
        await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            progress: 100,
            stage: `Motion engine failed (${result.error ?? "unknown"})`.slice(0, 120),
            finishedAt: new Date(),
          },
        });
      }
    } catch (err) {
      await db.renderJob.update({
        where: { id: jobId },
        data: { status: "FAILED", progress: 100, stage: `Motion engine error: ${err instanceof Error ? err.message : "unknown"}`.slice(0, 120), finishedAt: new Date() },
      }).catch(() => {});
    }
  })();
}

/**
 * Advance a job's progress. BLENDER jobs poll the live engine (HTTP
 * for env hosts, state files for local workers), MOTION jobs update
 * themselves from ffmpeg, SIMULATOR jobs advance on elapsed
 * wall-clock time. When a job crosses 100% the caller is responsible
 * for triggering the DSH evaluation pass exactly once.
 */
export async function tickRenderJob(jobId: string) {
  let job = await db.renderJob.findUnique({ where: { id: jobId }, include: { evaluation: true } });
  if (!job) return null;

  if (job.status !== "RENDERING") return job;

  if (job.driver === "BLENDER_LOCAL") {
    if (localJobStale(job.id)) {
      return db.renderJob.update({
        where: { id: jobId },
        data: { status: "FAILED", progress: 100, stage: "Blender worker went quiet - job failed", finishedAt: new Date() },
        include: { evaluation: true },
      });
    }
    const prog = pollLocalJob(job.id);
    if (prog.polled && prog.done) {
      if (prog.error || !prog.mp4Path) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { status: "FAILED", progress: 100, stage: `Blender: ${prog.error ?? "no clip produced"}`.slice(0, 120), finishedAt: new Date() },
          include: { evaluation: true },
        });
      } else if (fs.existsSync(prog.mp4Path)) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "REVIEW", progress: 100,
            stage: (prog.stage?.slice(0, 60) || "Blender clip ready") + " - awaiting DSH inspection",
            outputUrl: `/renders/${job.id}.mp4`,
            finishedAt: new Date(),
          },
          include: { evaluation: true },
        });
      } else {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { status: "FAILED", progress: 100, stage: "Blender clip missing on disk", finishedAt: new Date() },
          include: { evaluation: true },
        });
      }
    } else if (prog.polled && typeof prog.progress === "number") {
      const progress = Math.min(99, Math.floor(prog.progress * 100));
      if (progress !== job.progress) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { progress, stage: prog.stage ?? stageFor(progress) },
          include: { evaluation: true },
        });
      }
    }
    return job;
  }

  if (job.driver === "BLENDER") {
    const prog = await pollJobProgress(job.id);

    if (prog.polled && typeof prog.progress === "number") {
      const progress = Math.min(100, Math.floor(prog.progress * 100));
      if (prog.done) {
        if (prog.mp4Base64) persistRenderMp4(job.id, prog.mp4Base64);
        else if (prog.pngBase64) persistRenderFrame(job.id, prog.pngBase64);
        if (prog.error) {
          job = await db.renderJob.update({
            where: { id: jobId },
            data: { status: "FAILED", stage: `Blender: ${prog.error}`.slice(0, 120), progress: 100, finishedAt: new Date() },
            include: { evaluation: true },
          });
        } else {
          const hasClip = Boolean(prog.mp4Base64) && fs.existsSync(path.join(process.cwd(), "public", "renders", `${job.id}.mp4`));
          job = await db.renderJob.update({
            where: { id: jobId },
            data: {
              status: "REVIEW", progress: 100,
              stage: prog.stage?.slice(0, 120) || "Blender render complete - awaiting DSH inspection",
              ...(hasClip ? { outputUrl: `/renders/${job.id}.mp4` } : {}),
              finishedAt: new Date(),
            },
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

function persistRenderMp4(jobId: string, base64: string) {
  try {
    const dir = path.join(process.cwd(), "public", "renders");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${jobId}.mp4`), Buffer.from(base64, "base64"));
  } catch {
    // non-fatal - the clip already exists on the Blender host
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

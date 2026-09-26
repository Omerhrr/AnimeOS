import { db } from "@/lib/db";
import fs from "fs";
import path from "path";
import { stageFor } from "@/lib/types";
import { hasPoseProgram } from "@/lib/animation/poses";
import {
  isSpeakingCloseup,
  speechPayload, type SpeechProgram,
} from "@/lib/animation/lipsync";
import {
  audioDrivenSpeechProgram, describeAudioSpeechProgram,
  type AudioTake,
} from "@/lib/animation/viseme-audio";
import {
  neuralSpeechProgram, describeNeuralSpeechProgram,
} from "@/lib/animation/viseme-neural";
import {
  bridgeStatus, submitRenderJob, pollJobProgress,
  pollLocalJob, localJobStale,
} from "@/lib/bridge/blender";
import { renderShotClip, detectFfmpeg } from "@/lib/bridge/motion";
import { characterDesignDna, environmentDna } from "@/lib/animation/design";
import { detectCast } from "@/lib/ai/art";
import { assetsForRender } from "@/lib/blender/assets";
import {
  img2vidHost, img2vidProvider, submitImg2VidJob, pollImg2VidJob,
  submitImg2VidZaiJob, pollImg2VidZaiJob,
} from "@/lib/bridge/img2vid";
import { finishTelemetry, takeoverSpan } from "@/lib/engine/telemetry";

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
//     time), progress flows through a state file. Shots carrying a
//     pose program get the skeletal stand-in articulated between
//     their start/end poses.
//   • IMG2VID        - interpolation-model provider: hero shots with
//     a pose program route here first when the built-in engines are
//     unavailable. Two providers speak the driver contract: an
//     attached host (env ANIMEOS_IMG2VID_HOST) or the BUILT-IN z.ai
//     video model (real img2vid, active by default; ANIMEOS_IMG2VID
//     =off disables). The provider animates the key art inside the
//     frame and the clip downloads back.
//   • MOTION         - the built-in ffmpeg engine: deterministic
//     camera program (movement / shot type / lens / lighting /
//     fog / lightning / energy) animated over the shot's key art;
//     pose pairs play as a blocking approximation.
//   • SIMULATOR      - wall-clock fallback when no engine exists.
//
// The production state machine, render queue, and DSH evaluation
// loop are identical for all five drivers.
// ─────────────────────────────────────────────────────────────

/**
 * Build a shot's lip-sync program with REAL AUDIO as the timing
 * score and a NEURAL PHONEME PLAN as the shape score: each VOICE
 * cue's rendered take (public/voices/{cueId}.wav) is read from disk
 * and analyzed into visemes, the plan's wide/round identity is
 * conformed onto the audio envelope, and the ACOUSTIC MODEL SLOT
 * re-times the plan's units onto the take's real syllable timeline
 * (a refused model degrades to the audio-only pass; ANIMEOS_ACOUSTIC
 * =off keeps the plan's even spread). Spans without a decodable take
 * perform from the plan (or the per-character text table as the last
 * resort).
 */
async function shotSpeechProgram(shot: {
  shotType: string;
  dialogue: string | null;
  duration: number;
  audioCues: Array<{ kind: string; startMs: number; voiceDurationMs: number | null; voiceUrl: string | null }>;
}): Promise<{ program: SpeechProgram; note: string | null } | null> {
  if (!isSpeakingCloseup(shot.shotType, shot.dialogue)) return null;
  const voiceCues = shot.audioCues
    .filter((c) => c.kind === "VOICE")
    .sort((a, b) => a.startMs - b.startMs);
  const takes: AudioTake[] = voiceCues.map((c) => {
    let wav: Buffer | null = null;
    if (c.voiceUrl) {
      try {
        const file = path.join(process.cwd(), "public", c.voiceUrl.split("?")[0].replace(/^\//, ""));
        if (fs.existsSync(file)) wav = fs.readFileSync(file);
      } catch {
        wav = null; // unreadable take falls back to the text performance
      }
    }
    return { startMs: c.startMs, durationMs: c.voiceDurationMs ?? 0, wav };
  });
  let program: SpeechProgram;
  let note: string | null;
  try {
    // the neural pass degrades internally (offline model -> audio-only -> text)
    const neural = await neuralSpeechProgram({ dialogue: shot.dialogue, shotDurationMs: Math.round(shot.duration * 1000), takes });
    program = neural;
    note = describeNeuralSpeechProgram(neural);
  } catch {
    const audio = audioDrivenSpeechProgram({ dialogue: shot.dialogue, shotDurationMs: Math.round(shot.duration * 1000), takes });
    program = audio;
    note = describeAudioSpeechProgram(audio);
  }
  return { program, note };
}

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
  let providerTaskId: string | null = null;

  // Pick the first engine that can take the job.
  const bridge = await bridgeStatus(true);
  const shot = shotId
    ? await db.shot.findUnique({
        where: { id: shotId },
        include: { scene: { include: { episode: true, environment: true } }, audioCues: true },
      })
    : null;

  // LIP-SYNC: a speaking closeup (SPEECH dialogue + tight framing)
  // performs its lines - the viseme program is derived from the REAL
  // TTS takes when they exist (audio-driven), the Blender stand-in
  // drives its mouth rig from it, the img2vid prompt receives the
  // lines as speech direction, and MOTION plans a blocking speech
  // beat.
  const built = shot ? await shotSpeechProgram(shot) : null;
  const speech: SpeechProgram | null = built?.program ?? null;
  const lipNote = built?.note ?? null;

  if (bridge.reachable && shot) {
    const project = await db.project.findUnique({ where: { id: projectId } });

    // DESIGN PASS: compile the production's design text (model-sheet
    // anchors, appearance notes, the active state's wardrobe/weapon,
    // the environment brief) into renderable DNA so the 3D worker
    // builds the DESIGNED characters and set, not anonymous stand-ins.
    const episodeNumber = shot.scene.episode.number;
    const castRows = await db.character.findMany({ where: { projectId }, include: { states: true } });
    const cast = detectCast(castRows, shot.description)
      .slice(0, 2)
      .map((c) => {
        const st = [...c.states]
          .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
          .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
        return characterDesignDna({
          name: c.name,
          role: c.role,
          appearance: c.appearance,
          modelSheetPrompt: c.modelSheetPrompt,
          stateClothing: st?.clothing ?? null,
          stateWeapon: st?.weapon ?? null,
        });
      });
    const env = shot.scene.environment
      ? environmentDna({
          name: shot.scene.environment.name,
          description: shot.scene.environment.description,
          atmosphere: shot.scene.environment.atmosphere,
          timeOfDay: shot.scene.environment.timeOfDay,
          weather: shot.scene.environment.weather,
          sceneTimeOfDay: shot.scene.timeOfDay,
          sceneWeather: shot.scene.weather,
        })
      : null;

    // ASSET LIBRARY: READY .blend assets for this exact cast and
    // environment ride every payload - the worker loads the DESIGNED
    // asset instead of rebuilding procedurally (missing names are
    // honestly absent and the worker falls back to the DNA builders).
    // DESIGNED props and creatures ride too when the shot text names
    // them: a shot that says "the Azure Seal cracks" gets the Azure
    // Seal asset.
    const assetRefs = await assetsForRender(
      projectId,
      cast.map((c) => c.name),
      shot.scene.environment?.name ?? null,
      `${shot.description ?? ""} ${shot.scene.title ?? ""}`,
    );

    const payload = {
      jobId: job.id,
      shot: {
        number: shot.number,
        description: shot.description,
        shotType: shot.shotType,
        lens: shot.lens,
        movement: shot.movement,
        poseStart: shot.poseStart,
        poseEnd: shot.poseEnd,
        // DIRECTED MOTION GRAMMAR: the shot's beat sequence rides the
        // payload when one is set - the worker plays it beat by beat
        // (a corrupt stored grammar is sent as-is; the worker's
        // normalize_grammar degrades honestly to the whole-clip move)
        ...(shot.grammar ? (() => { try { const g = JSON.parse(shot.grammar); return Array.isArray(g) ? { grammar: g } : {}; } catch { return {}; } })() : {}),
        lighting: shot.lighting,
        duration: shot.duration,
        ...(speech ? { speech: speechPayload(speech) } : {}),
        ...(cast.length > 0 ? { cast } : {}),
      },
      scene: {
        number: shot.scene.number,
        title: shot.scene.title,
        fogDensity: shot.scene.fogDensity,
        lightningIntensity: shot.scene.lightningIntensity,
        energyIntensity: shot.scene.energyIntensity,
        cameraDistance: shot.scene.cameraDistance,
        rimLightIntensity: shot.scene.rimLightIntensity,
        ...(env ? { environment: env } : {}),
      },
      ...((assetRefs.cast.length > 0 || assetRefs.environment || assetRefs.props.length > 0) ? { assets: assetRefs } : {}),
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

  // IMG2VID: the optional PREVIZ slot. Hero shots that carry a pose
  // program route to the attached host first, then the built-in model
  // on explicit opt-in, before the built-in engines; the provider
  // produces a motion previz animatic between the poses. The designed
  // engines (Blender, MOTION) stay the render path of record.
  if (driver === "SIMULATOR" && shot && hasPoseProgram(shot.poseStart, shot.poseEnd) && img2vidProvider()) {
    const project = await db.project.findUnique({ where: { id: projectId } });
    const fps = project?.fps ?? 24;
    const resMatch = String(project?.resolution ?? "1920x1080").match(/(\d{2,5})x(\d{2,5})/);
    const width = resMatch ? parseInt(resMatch[1], 10) : 1920;
    const height = resMatch ? parseInt(resMatch[2], 10) : 1080;
    const base = process.env.ANIMEOS_PUBLIC_URL ?? "";
    const imageUrl = shot.artworkUrl ? (base ? `${base}${shot.artworkUrl}` : shot.artworkUrl) : null;

    // 1) attached host protocol provider
    if (img2vidHost()) {
      const submit = await submitImg2VidJob({
        jobId: job.id,
        imageUrl,
        poseStart: shot.poseStart,
        poseEnd: shot.poseEnd,
        movement: shot.movement,
        shotType: shot.shotType,
        fps,
        frames: Math.max(2, Math.round(shot.duration * fps)),
        width,
        height,
        mode,
        speechLines: speech && speech.spans.length > 0 ? speech.spans.map((s) => s.text) : null,
      });
      if (submit.submitted) {
        driver = "IMG2VID";
        clipMs = Math.round(shot.duration * 1000);
        stage = "Img2Vid: pose interpolation job submitted to the attached provider";
      } else {
        stage = `Img2Vid submit failed (${submit.error ?? "unknown"}) - trying the built-in engine`;
      }
    }

    // 2) built-in z.ai video model (the real provider, no setup)
    if (driver === "SIMULATOR" && img2vidProvider() === "zai") {
      const submit = await submitImg2VidZaiJob({
        jobId: job.id,
        imageUrl,
        poseStart: shot.poseStart,
        poseEnd: shot.poseEnd,
        movement: shot.movement,
        shotType: shot.shotType,
        lighting: shot.lighting,
        duration: shot.duration,
        mode,
        speechLines: speech && speech.spans.length > 0 ? speech.spans.map((s) => s.text) : null,
      });
      if (submit.submitted && submit.taskId) {
        driver = "IMG2VID";
        clipMs = Math.round(shot.duration * 1000);
        stage = "Img2Vid previz: interpolation model generating the pose animatic";
        providerTaskId = submit.taskId;
      } else {
        stage = `Img2Vid submit failed (${submit.error ?? "unknown"}) - trying the built-in engine`;
      }
    }
  }

  // MOTION engine: built-in ffmpeg camera-grammar renderer.
  if (driver === "SIMULATOR" && shot && (await detectFfmpeg())) {
    driver = "MOTION";
    clipMs = Math.round(shot.duration * 1000);
    stage = "Motion: planning camera program";
    startMotionJob(job.id, shot, mode, speech);
  }

  const finalJob = await db.renderJob.update({
    where: { id: job.id },
    data: {
      driver,
      stage: lipNote ? `${stage} + ${lipNote}`.slice(0, 200) : stage,
      ...(clipMs > 0 ? { durationMs: clipMs } : {}),
      ...(providerTaskId ? { providerTaskId } : {}),
      ...(lipNote ? { lipNote } : {}),
    },
  });

  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "RENDER",
      summary: `Render job ${job.id.slice(-6)} queued - ${mode} attempt ${job.attempt} (${driver}${lipNote ? `, ${lipNote}` : ""})`,
      payload: JSON.stringify({ jobId: job.id, shotId, mode, driver, ...(lipNote ? { lipSync: lipNote } : {}) }),
    },
  });

  return finalJob;
}

// ── MOTION engine runner (async, updates the job as ffmpeg encodes) ──

function startMotionJob(jobId: string, shot: { scene: { id: string; fogDensity: number; lightningIntensity: number; energyIntensity: number; cameraDistance: number; rimLightIntensity: number }; shotType: string; lens: string | null; movement: string | null; poseStart: string | null; poseEnd: string | null; lighting: string | null; duration: number; number: number; artworkUrl: string | null }, mode: "PREVIEW" | "FINAL", speech: SpeechProgram | null = null) {
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
        poseStart: shot.poseStart,
        poseEnd: shot.poseEnd,
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
        speechSpans: speech && speech.spans.length > 0 ? speech.spans.map((s) => ({ startMs: s.startMs, endMs: s.endMs })) : null,
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
        const prev = await db.renderJob.findUnique({ where: { id: jobId }, select: { telemetry: true, startedAt: true, durationMs: true } });
        const telemetry = finishTelemetry(prev?.telemetry, "MOTION", prev?.startedAt, (prev?.durationMs ?? 16000) / 1000, "built-in ffmpeg");
        await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "REVIEW",
            progress: 100,
            stage: `Motion clip ready - ${result.programNote}`.slice(0, 120),
            outputUrl: result.outputUrl,
            finishedAt: new Date(),
            telemetry: JSON.stringify(telemetry),
          },
        });
      } else {
        const prev = await db.renderJob.findUnique({ where: { id: jobId }, select: { telemetry: true, startedAt: true, durationMs: true } });
        const telemetry = finishTelemetry(prev?.telemetry, "MOTION", prev?.startedAt, (prev?.durationMs ?? 16000) / 1000, "built-in ffmpeg");
        await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "FAILED",
            progress: 100,
            stage: `Motion engine failed (${result.error ?? "unknown"})`.slice(0, 120),
            finishedAt: new Date(),
            telemetry: JSON.stringify(telemetry),
          },
        });
      }
    } catch (err) {
      const prev = await db.renderJob.findUnique({ where: { id: jobId }, select: { telemetry: true, startedAt: true, durationMs: true } });
      const telemetry = finishTelemetry(prev?.telemetry, "MOTION", prev?.startedAt, (prev?.durationMs ?? 16000) / 1000, "built-in ffmpeg");
      await db.renderJob.update({
        where: { id: jobId },
        data: { status: "FAILED", progress: 100, stage: `Motion engine error: ${err instanceof Error ? err.message : "unknown"}`.slice(0, 120), finishedAt: new Date(), telemetry: JSON.stringify(telemetry) },
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
        data: { status: "FAILED", progress: 100, stage: "Blender worker went quiet - job failed", finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "BLENDER_LOCAL", job.startedAt, job.durationMs / 1000, "local worker")) },
        include: { evaluation: true },
      });
    }
    const prog = pollLocalJob(job.id);
    if (prog.polled && prog.done) {
      if (prog.error || !prog.mp4Path) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { status: "FAILED", progress: 100, stage: `Blender: ${prog.error ?? "no clip produced"}`.slice(0, 120), finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "BLENDER_LOCAL", job.startedAt, job.durationMs / 1000, "local worker")) },
          include: { evaluation: true },
        });
      } else if (fs.existsSync(prog.mp4Path)) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "REVIEW", progress: 100,
            stage: [job.lipNote, prog.stage?.slice(0, 60) || "Blender clip ready"].filter(Boolean).join(" - ") + " - awaiting DSH inspection",
            outputUrl: `/renders/${job.id}.mp4`,
            finishedAt: new Date(),
            telemetry: JSON.stringify(finishTelemetry(job.telemetry, "BLENDER_LOCAL", job.startedAt, job.durationMs / 1000, "local worker")),
          },
          include: { evaluation: true },
        });
      } else {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { status: "FAILED", progress: 100, stage: "Blender clip missing on disk", finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "BLENDER_LOCAL", job.startedAt, job.durationMs / 1000, "local worker")) },
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

  if (job.driver === "IMG2VID") {
    const prog = job.providerTaskId
      ? await pollImg2VidZaiJob(job.id, job.providerTaskId)
      : await pollImg2VidJob(job.id);
    if (prog.polled && prog.done) {
      if (prog.error || !prog.mp4Path) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { status: "FAILED", progress: 100, stage: `Img2Vid: ${prog.error ?? "no clip produced"}`.slice(0, 120), finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "IMG2VID", job.startedAt, job.durationMs / 1000, job.providerTaskId ? "z.ai interpolation" : "host provider")) },
          include: { evaluation: true },
        });
      } else if (fs.existsSync(prog.mp4Path)) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: {
            status: "REVIEW", progress: 100,
            stage: [job.lipNote, job.providerTaskId ? "Img2Vid clip ready - z.ai interpolation model rendered the pose beat" : "Img2Vid clip ready - pose interpolation rendered"].filter(Boolean).join(" - ").slice(0, 200),
            outputUrl: `/renders/${job.id}.mp4`,
            finishedAt: new Date(),
            telemetry: JSON.stringify(finishTelemetry(job.telemetry, "IMG2VID", job.startedAt, job.durationMs / 1000, job.providerTaskId ? "z.ai interpolation" : "host provider")),
          },
          include: { evaluation: true },
        });
      } else {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { status: "FAILED", progress: 100, stage: "Img2Vid clip missing on disk", finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "IMG2VID", job.startedAt, job.durationMs / 1000, job.providerTaskId ? "z.ai interpolation" : "host provider")) },
          include: { evaluation: true },
        });
      }
    } else if (prog.polled && !prog.done) {
      // async model work in flight - creep progress so the queue card lives
      const creep = Math.min(92, job.progress + 4);
      if (creep !== job.progress) {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: { progress: creep, stage: job.providerTaskId ? "Img2Vid: z.ai model interpolating the pose beat" : "Img2Vid: interpolating poses" },
          include: { evaluation: true },
        });
      }
    } else if (!prog.polled) {
      // provider lost mid-job - re-render locally with the MOTION engine
      const shot = job.shotId
        ? await db.shot.findUnique({ where: { id: job.shotId }, include: { scene: true, audioCues: true } })
        : null;
      if (shot && (await detectFfmpeg())) {
        // rebuild the speech program so the takeover keeps the lip-sync
        // (audio-driven when the takes are on disk)
        const rebuilt = await shotSpeechProgram(shot);
        const takeoverSpeech = rebuilt?.program ?? null;
        job = await db.renderJob.update({
          where: { id: jobId },
          data: {
            driver: "MOTION",
            stage: "Img2Vid provider lost - MOTION engine taking over",
            startedAt: new Date(),
            // close the IMG2VID span and remember the trail so the
            // readout shows the real chain (provider latency per span)
            telemetry: takeoverSpan(job.telemetry, "IMG2VID", job.startedAt, "Img2Vid provider lost -> MOTION engine took over"),
          },
          include: { evaluation: true },
        });
        startMotionJob(job.id, shot, (job.mode as "PREVIEW" | "FINAL") ?? "PREVIEW", takeoverSpeech);
      } else {
        job = await db.renderJob.update({
          where: { id: jobId },
          data: {
            driver: "SIMULATOR",
            stage: "Img2Vid provider lost - simulator taking over",
            startedAt: new Date(),
            telemetry: takeoverSpan(job.telemetry, "IMG2VID", job.startedAt, "Img2Vid provider lost -> simulator took over"),
          },
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
            data: { status: "FAILED", stage: `Blender: ${prog.error}`.slice(0, 120), progress: 100, finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "BLENDER", job.startedAt, job.durationMs / 1000, "workstation Cycles")) },
            include: { evaluation: true },
          });
        } else {
          const hasClip = Boolean(prog.mp4Base64) && fs.existsSync(path.join(process.cwd(), "public", "renders", `${job.id}.mp4`));
          job = await db.renderJob.update({
            where: { id: jobId },
            data: {
              status: "REVIEW", progress: 100,
              stage: [job.lipNote, prog.stage?.slice(0, 120) || "Blender render complete - awaiting DSH inspection"].filter(Boolean).join(" - ").slice(0, 200),
              ...(hasClip ? { outputUrl: `/renders/${job.id}.mp4` } : {}),
              finishedAt: new Date(),
              telemetry: JSON.stringify(finishTelemetry(job.telemetry, "BLENDER", job.startedAt, job.durationMs / 1000, "workstation Cycles")),
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
        data: {
          driver: "SIMULATOR",
          stage: "Blender bridge lost - simulator taking over",
          startedAt: new Date(),
          telemetry: takeoverSpan(job.telemetry, "BLENDER", job.startedAt, "Blender bridge lost -> simulator took over"),
        },
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
        data: { status: "REVIEW", progress: 100, stage: "Awaiting DSH inspection", finishedAt: new Date(), telemetry: JSON.stringify(finishTelemetry(job.telemetry, "SIMULATOR", job.startedAt, job.durationMs / 1000, "wall-clock")) },
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

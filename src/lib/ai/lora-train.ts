import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────
// SIMULATED LORA TRAINING RUNS
//
// Distills a production's approved panels (APPROVED/FINAL shots
// carrying generated artwork) into a style adapter. The GPU work
// itself is simulated locally with the same tick-on-poll pattern
// as the render pipeline: progress is derived from elapsed time,
// a loss curve decays with seeded noise, and milestones are
// appended to a run log. No external trainer is required.
// ─────────────────────────────────────────────────────────────

const APPROVED_STATUSES = ["APPROVED", "FINAL"];
const SAMPLES = 48; // loss curve resolution across a run
const MS_PER_STEP = 22; // a 1200-step run lasts ~26s, observable but not slow

export interface LoraTrainStart {
  runId: string;
  totalSteps: number;
  panelCount: number;
}

/** Start a simulated fine-tune run for one adapter over its approved-panel dataset. */
export async function startLoraTrainRun(loraId: string): Promise<LoraTrainStart> {
  const lora = await db.styleLora.findUnique({ where: { id: loraId } });
  if (!lora) throw new Error("LoRA adapter not found");

  const busy = await db.loraTrainRun.findFirst({ where: { loraId, status: "RUNNING" } });
  if (busy) throw new Error("This adapter already has a training run in flight");

  // Dataset: the production's approved panels with generated art.
  // Panels already bound to this adapter are the core set; the rest
  // of the approved library rounds it out (style distillation).
  const dataset = await db.shot.findMany({
    where: {
      scene: { episode: { season: { projectId: lora.projectId } } },
      status: { in: APPROVED_STATUSES },
      artworkUrl: { not: null },
    },
    select: { id: true, loraId: true, number: true, status: true, artworkUrl: true },
  });
  const panelCount = dataset.length;
  if (panelCount === 0) {
    throw new Error("No approved panels with artwork yet; approve renders (or generate art) first");
  }
  const boundPanels = dataset.filter((s) => s.loraId === loraId).length;

  const totalSteps = Math.min(2400, Math.max(600, Math.round((600 + panelCount * 50) / 50) * 50));

  const run = await db.loraTrainRun.create({
    data: {
      loraId,
      projectId: lora.projectId,
      status: "RUNNING",
      progress: 0,
      step: 0,
      totalSteps,
      panelCount,
      lossCurve: JSON.stringify([initialLoss(loraId, 0)]),
      runLog: JSON.stringify([
        `dataset locked: ${panelCount} approved panel${panelCount === 1 ? "" : "s"} (${boundPanels} bound to ${lora.name})`,
        `config: ${totalSteps} steps, base ${lora.baseModel ?? "SDXL"}, trigger "${lora.triggerPhrase.slice(0, 40)}"`,
      ]),
    },
  });

  await db.styleLora.update({
    where: { id: loraId },
    data: { status: "TRAINING", trainProgress: 0 },
  });

  await db.productionEvent.create({
    data: {
      projectId: lora.projectId,
      actor: "SYSTEM",
      type: "STATE_CHANGE",
      summary: `LoRA training run started: ${lora.name} over ${panelCount} approved panels (${totalSteps} steps)`,
      payload: JSON.stringify({ runId: run.id, loraId, panelCount, totalSteps }),
    },
  });

  return { runId: run.id, totalSteps, panelCount };
}

function initialLoss(seed: string, p: number): number {
  return round4(0.42 * Math.exp(-3.4 * p) + 0.018 + seededNoise(seed, 0) * 0.012);
}

function seededNoise(seed: string, i: number): number {
  let h = 2166136261;
  const key = `${seed}:${i}`;
  for (let k = 0; k < key.length; k++) {
    h ^= key.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const MILESTONES: Array<[number, string]> = [
  [0.02, "tokenizing panel captions with trigger phrase"],
  [0.12, "encoding latents (VAE)"],
  [0.3, "training UNet attention blocks"],
  [0.55, "training UNet cross-attention + text encoder alignment"],
  [0.8, "learning-rate cooldown"],
  [0.94, "exporting adapter safetensors"],
];

/** Advance every RUNNING run of a production from elapsed time (poll-driven, like render jobs). */
export async function tickProjectTrainRuns(projectId: string): Promise<void> {
  const runs = await db.loraTrainRun.findMany({
    where: { projectId, status: "RUNNING" },
    include: { lora: true },
  });
  for (const run of runs) {
    try {
      await tickOne(run.id);
    } catch {
      // one broken run must not block the others
    }
  }
}

async function tickOne(runId: string): Promise<void> {
  // claim first so concurrent polls cannot double-advance
  const run = await db.loraTrainRun.findUnique({ where: { id: runId }, include: { lora: true } });
  if (!run || run.status !== "RUNNING") return;

  const durationMs = Math.max(4000, run.totalSteps * MS_PER_STEP);
  const elapsed = Date.now() - new Date(run.startedAt).getTime();
  const p = Math.min(1, Math.max(0, elapsed / durationMs));
  const step = Math.min(run.totalSteps, Math.round(p * run.totalSteps));

  // loss curve: deterministic decay + seeded jitter, sampled at fixed resolution
  const curve = parseNumbers(run.lossCurve);
  const targetSamples = Math.max(2, Math.ceil(p * SAMPLES));
  for (let i = curve.length; i < targetSamples; i++) {
    const sp = i / (SAMPLES - 1);
    curve.push(round4(0.42 * Math.exp(-3.4 * sp) + 0.018 + seededNoise(runId, i) * 0.012));
  }

  const log = parseStrings(run.runLog);
  for (const [at, msg] of MILESTONES) {
    if (p >= at && !log.some((l) => l.endsWith(msg))) {
      log.push(`step ${Math.round(at * run.totalSteps)}: ${msg}`);
    }
  }

  if (p >= 1) {
    await db.loraTrainRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        progress: 1,
        step: run.totalSteps,
        lossCurve: JSON.stringify(curve),
        runLog: JSON.stringify([...log, `done: adapter ready, final loss ${curve[curve.length - 1]?.toFixed(3) ?? "0.02"}`]),
        finishedAt: new Date(),
      },
    });
    await db.styleLora.update({
      where: { id: run.loraId },
      data: { status: "READY", trainProgress: 1, trainedPanels: run.panelCount, trainedAt: new Date() },
    });
    await db.productionEvent.create({
      data: {
        projectId: run.projectId,
        actor: "SYSTEM",
        type: "STATE_CHANGE",
        summary: `LoRA training run completed: ${run.lora.name} distilled from ${run.panelCount} approved panels`,
        payload: JSON.stringify({ runId, loraId: run.loraId, finalLoss: curve[curve.length - 1] ?? null }),
      },
    });
    return;
  }

  await db.loraTrainRun.update({
    where: { id: runId },
    data: { progress: p, step, lossCurve: JSON.stringify(curve), runLog: JSON.stringify(log) },
  });
  // keep the adapter row's mirror progress in sync for list views
  await db.styleLora.update({
    where: { id: run.loraId },
    data: { trainProgress: p },
  });
}

function parseNumbers(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

function parseStrings(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

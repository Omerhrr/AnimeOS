import { db } from "@/lib/db";
import { generateShotPanelArt } from "@/lib/ai/art";
import {
  checkShotUniverseFacts,
  universeReRenderQueue,
  type UniverseQueueItem,
} from "@/lib/universe-facts";

// ─────────────────────────────────────────────────────────────
// SUPERVISED AUTO RE-PAINT RUNNER
//
// The re-render queue's one-click "Re-render + re-check" walked one
// shot per click; the runner walks the WHOLE queue without the
// clicks, under the director's supervision:
//
//   • Each step takes the queue's worst-confidence shot, re-paints
//     the panel with a FACT-AWARE prompt (the active canon plus the
//     exact facts that were flagged, restated as corrections), then
//     re-runs the real vision check.
//
//   • Outcomes: FIXED (all facts hold now) clears the row;
//     STILL_BROKEN stops the auto-retry for that shot and waits for
//     a human decision (the row stays queued); ERROR records what
//     went wrong and moves on.
//
//   • Supervision: the director can PAUSE (finishes the current
//     step, holds before the next), RESUME, or ABORT between
//     steps. Run state lives in the DB (RepaintRun), so refreshes
//     and DSH see exactly the same progress.
// ─────────────────────────────────────────────────────────────

export const REPAINT_EVENT_KIND = "REPAINT_RUN";

export interface RepaintStep {
  shotId: string;
  ref: string;
  factTexts: string[];
  beforeWorst: number;
  afterSummary: string;
  afterBroken: number;
  outcome: "FIXED" | "STILL_BROKEN" | "ERROR";
  error?: string;
  at: string;
}

export interface RepaintRunView {
  id: string;
  status: "RUNNING" | "PAUSED" | "DONE" | "ABORTED";
  cap: number;
  index: number;
  total: number;
  steps: RepaintStep[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function viewOf(run: {
  id: string;
  status: string;
  cap: number;
  index: number;
  steps: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RepaintRunView {
  const steps = safeSteps(run.steps);
  return {
    id: run.id,
    status: (["RUNNING", "PAUSED", "DONE", "ABORTED"].includes(run.status) ? run.status : "DONE") as RepaintRunView["status"],
    cap: run.cap,
    index: run.index,
    total: run.cap,
    steps,
    error: run.error,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function safeSteps(raw: string): RepaintStep[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RepaintStep[]) : [];
  } catch {
    return [];
  }
}

function refFromItem(item: UniverseQueueItem): string {
  return item.ref;
}

/**
 * Start a supervised run over the project's re-render queue (worst
 * confidence first), capped at maxItems. Refuses when a run is
 * already active. The loop is fired and not awaited; callers get
 * the run row immediately and poll it (UI) or read the events (DSH).
 */
export async function startRepaintRun(projectId: string, maxItems = 3): Promise<
  { ok: true; run: RepaintRunView } | { ok: false; error: string }
> {
  const active = await db.repaintRun.findFirst({ where: { projectId, status: { in: ["RUNNING", "PAUSED"] } } });
  if (active) {
    return { ok: false, error: `A re-paint run is already ${active.status.toLowerCase()} (${active.id.slice(-6)}) - pause/abort it or resume it before starting another.` };
  }
  const queue = await universeReRenderQueue(projectId);
  if (queue.length === 0) {
    return { ok: false, error: "The re-render queue is empty: no confident universe-fact violations to re-paint. Run check_universe_facts on the flagged panels first." };
  }

  const items = queue.slice(0, Math.max(1, Math.min(8, Math.round(maxItems))));
  const run = await db.repaintRun.create({
    data: {
      projectId,
      status: "RUNNING",
      cap: items.length,
      index: 0,
      steps: "[]",
    },
  });

  await db.continuityEvent.create({
    data: {
      projectId,
      entityType: "REPAINT_RUN",
      entityName: "Supervised auto re-paint",
      kind: "CUSTOM",
      description: `Supervised re-paint run ${run.id.slice(-6)} started: ${items.length} queued panel(s), worst confidence first. Each step re-paints with fact-aware prompts and re-checks with the vision model.`,
      severity: "INFO",
    },
  });

  void runLoop(run.id, items).catch(() => {});
  return { ok: true, run: viewOf(run) };
}

/**
 * The runner loop: one DB-checked pause/abort gate per step, each
 * step = fact-aware re-paint + real vision re-check + outcome record.
 */
async function runLoop(runId: string, items: UniverseQueueItem[]): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const run = await db.repaintRun.findUnique({ where: { id: runId } });
    if (!run) return;
    if (run.status === "PAUSED") return; // parked: resume() re-kicks the loop from here
    if (run.status !== "RUNNING") return; // aborted (or finished) mid-queue

    const item = items[i];
    const step = await runStep(item);
    const steps = safeSteps((await db.repaintRun.findUnique({ where: { id: runId } }))?.steps ?? "[]");
    steps.push(step);
    await db.repaintRun.update({
      where: { id: runId },
      // index tracks the ACCUMULATED step count so a resumed run
      // continues where the pre-pause steps left off (a fresh loop
      // counter would rewind it)
      data: { index: steps.length, steps: JSON.stringify(steps).slice(0, 6000) },
    });
  }

  // natural completion: only a still-RUNNING run becomes DONE. An
  // abort (or pause) that landed during the FINAL step must win -
  // the loop ends without seeing another gate.
  const final = await db.repaintRun.findUnique({ where: { id: runId } });
  if (final?.status === "RUNNING") {
    await db.repaintRun.update({
      where: { id: runId },
      data: { status: "DONE" },
    });
  }
}

/** One supervised step: fact-aware re-paint, re-check, outcome. */
async function runStep(item: UniverseQueueItem): Promise<RepaintStep> {
  const base: RepaintStep = {
    shotId: item.shotId,
    ref: refFromItem(item),
    factTexts: item.items.map((f) => f.factText),
    beforeWorst: item.worst,
    afterSummary: "",
    afterBroken: 0,
    outcome: "ERROR",
    at: new Date().toISOString(),
  };
  try {
    // the re-paint is FACT-AWARE: the flagged facts ride the prompt as corrections
    await generateShotPanelArt(item.shotId, "MANHUA", { emphasisFacts: base.factTexts });
    const check = await checkShotUniverseFacts(item.shotId);
    if (!check.ok) {
      return { ...base, outcome: "ERROR", error: check.error, afterSummary: check.error };
    }
    const stillBroken = check.result.verdicts.filter((v) => !v.holds && v.confidence >= 0.6);
    const outcome: RepaintStep["outcome"] = stillBroken.length === 0 ? "FIXED" : "STILL_BROKEN";
    return {
      ...base,
      outcome,
      afterBroken: stillBroken.length,
      afterSummary: check.result.summary,
      ...(outcome === "STILL_BROKEN" ? { error: stillBroken.map((v) => `${(v.confidence * 100).toFixed(0)}% ${v.text}: ${v.note}`).join(" | ") } : {}),
    };
  } catch (err) {
    return { ...base, outcome: "ERROR", error: err instanceof Error ? err.message : "re-paint step failed" };
  }
}

/**
 * Resume a paused run: it re-reads the queue fresh (facts may have
 * changed while paused) and continues from where it stopped,
 * skipping steps already recorded.
 */
export async function resumeRepaintRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  const run = await db.repaintRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "Run not found" };
  if (run.status !== "PAUSED") return { ok: false, error: `Run is ${run.status.toLowerCase()} - only a PAUSED run can resume` };
  await db.repaintRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
  const queue = await universeReRenderQueue(run.projectId);
  const done = new Set(safeSteps(run.steps).map((s) => s.shotId));
  const remaining = queue.filter((q) => !done.has(q.shotId)).slice(0, run.cap);
  if (remaining.length === 0) {
    await db.repaintRun.update({ where: { id: runId }, data: { status: "DONE" } });
    return { ok: true };
  }
  void runLoop(runId, remaining).catch(() => {});
  return { ok: true };
}

export async function setRepaintRunStatus(runId: string, status: "PAUSED" | "ABORTED"): Promise<{ ok: boolean; error?: string }> {
  const run = await db.repaintRun.findUnique({ where: { id: runId } });
  if (!run) return { ok: false, error: "Run not found" };
  if (run.status !== "RUNNING") return { ok: false, error: `Run is ${run.status.toLowerCase()} - nothing to ${status.toLowerCase()}` };
  await db.repaintRun.update({ where: { id: runId }, data: { status } });
  if (status === "ABORTED") {
    await db.continuityEvent.create({
      data: {
        projectId: run.projectId,
        entityType: "REPAINT_RUN",
        entityName: "Supervised auto re-paint",
        kind: "CUSTOM",
        description: `Supervised re-paint run ${run.id.slice(-6)} aborted by the director after ${run.index}/${run.cap} step(s).`,
        severity: "INFO",
      },
    });
  }
  return { ok: true };
}

/** Latest run for the project (the panel shows one at a time). */
export async function latestRepaintRun(projectId: string): Promise<RepaintRunView | null> {
  const run = await db.repaintRun.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
  if (!run) return null;
  return viewOf(run);
}

import { db } from "@/lib/db";
import { runPlanSteps, latestPlan, getPlan, type PlanView } from "@/lib/dsh/plans";
import { startRepaintRun, latestRepaintRun } from "@/lib/universe-repaint";
import { universeReRenderQueue } from "@/lib/universe-facts";
import { tickProjectJobs } from "@/lib/engine/render";
import { postDailyDigest } from "@/lib/digest";

// ─────────────────────────────────────────────────────────────
// CADENCE SCHEDULER - the studio runs between conversations
//
// A StudioSchedule is a recurring job nobody has to click:
//
//   • PLAN_RUN       - run an approved plan on a cadence. The
//     nightly breakdown pattern: DSH lands a breakdown plan, the
//     creator approves it once, and this schedule walks a few steps
//     per night (maxSteps) until the plan is DONE. planId pins an
//     explicit plan; null picks the project's latest ACTIVE plan at
//     fire time, so a finished plan hands the slot to the next one.
//   • REPAINT_QUEUE  - render-queue supervision: tick every active
//     render job (advance progress, fail stale workers), then start
//     a supervised re-paint pass whenever the universe-facts
//     re-render queue is dirty and no run is live.
//   • DAILY_DIGEST   - post a digest of the last 24 hours (renders,
//     plan steps, schedule fires, canon/identity health, queue
//     pressure) to the creator as a DIGEST production event; the
//     digest panel on the DSH view shows it.
//
// nextRunAt is the single source of truth for "due". Every fire
// claims its slot first (lastRunAt + nextRunAt advance BEFORE the
// work runs, so a slow fire or a concurrent manual tick cannot
// double-run), then the outcome lands on the row (lastStatus +
// lastReport) and as a production event the creator can audit.
// The in-process loop (started by src/instrumentation.ts) checks
// due schedules every minute; POST /api/schedules (action "run")
// and the DSH steer_schedule tool fire one immediately.
// ─────────────────────────────────────────────────────────────

export type ScheduleKind = "PLAN_RUN" | "REPAINT_QUEUE" | "DAILY_DIGEST";
export type ScheduleCadence = "HOURLY" | "DAILY" | "WEEKLY";
export type FireStatus = "OK" | "SKIPPED" | "ERROR";

const SCHEDULE_KINDS: ScheduleKind[] = ["PLAN_RUN", "REPAINT_QUEUE", "DAILY_DIGEST"];
const SCHEDULE_CADENCES: ScheduleCadence[] = ["HOURLY", "DAILY", "WEEKLY"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ScheduleRow {
  id: string;
  projectId: string;
  name: string;
  kind: string;
  planId: string | null;
  cadence: string;
  intervalHours: number;
  hourUtc: number;
  weekday: number;
  maxSteps: number;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastStatus: string | null;
  lastReport: string | null;
  runCount: number;
  createdAt: Date;
}

export interface ScheduleView {
  id: string;
  projectId: string;
  name: string;
  kind: ScheduleKind;
  planId: string | null;
  planTitle: string | null;
  cadence: ScheduleCadence;
  cadenceLabel: string;
  intervalHours: number;
  hourUtc: number;
  weekday: number;
  maxSteps: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: FireStatus | null;
  lastReport: string | null;
  runCount: number;
  createdAt: string;
}

/** Next fire time for a cadence, strictly after `from`. */
export function computeNextRun(
  cadence: string,
  intervalHours: number,
  hourUtc: number,
  weekday: number,
  from: Date,
): Date {
  const next = new Date(from.getTime());
  if (cadence === "HOURLY") {
    const hours = Math.min(24, Math.max(1, Math.round(intervalHours) || 1));
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(from.getUTCHours() + hours);
    if (next.getTime() <= from.getTime()) next.setUTCHours(next.getUTCHours() + hours);
    return next;
  }
  const hour = Math.min(23, Math.max(0, Math.round(hourUtc) || 0));
  if (cadence === "WEEKLY") {
    const day = Math.min(6, Math.max(0, Math.round(weekday) || 0));
    const at = new Date(from.getTime());
    at.setUTCDate(at.getUTCDate() + ((day - at.getUTCDay() + 7) % 7));
    at.setUTCHours(hour, 0, 0, 0);
    if (at.getTime() <= from.getTime()) at.setUTCDate(at.getUTCDate() + 7);
    return at;
  }
  // DAILY: today at hourUtc when it is still ahead, else tomorrow
  const at = new Date(from.getTime());
  at.setUTCHours(hour, 0, 0, 0);
  if (at.getTime() <= from.getTime()) at.setUTCDate(at.getUTCDate() + 1);
  return at;
}

/** Human cadence line for UI, DSH results and events. */
export function describeCadence(cadence: string, intervalHours: number, hourUtc: number, weekday: number): string {
  if (cadence === "HOURLY") {
    const hours = Math.min(24, Math.max(1, Math.round(intervalHours) || 1));
    return hours === 1 ? "every hour" : `every ${hours}h`;
  }
  const hour = String(Math.min(23, Math.max(0, Math.round(hourUtc) || 0))).padStart(2, "0");
  if (cadence === "WEEKLY") {
    const day = WEEKDAY_NAMES[Math.min(6, Math.max(0, Math.round(weekday) || 0))];
    return `weekly on ${day} at ${hour}:00 UTC`;
  }
  return `nightly at ${hour}:00 UTC`;
}

function viewOf(row: ScheduleRow, planTitle: string | null): ScheduleView {
  const kind = (SCHEDULE_KINDS as string[]).includes(row.kind) ? (row.kind as ScheduleKind) : (row.kind === "DAILY_DIGEST" ? "DAILY_DIGEST" : "PLAN_RUN");
  const cadence = (SCHEDULE_CADENCES as string[]).includes(row.cadence) ? (row.cadence as ScheduleCadence) : "DAILY";
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    kind,
    planId: row.planId,
    planTitle,
    cadence,
    cadenceLabel: describeCadence(row.cadence, row.intervalHours, row.hourUtc, row.weekday),
    intervalHours: row.intervalHours,
    hourUtc: row.hourUtc,
    weekday: row.weekday,
    maxSteps: row.maxSteps,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastStatus: (["OK", "SKIPPED", "ERROR"] as string[]).includes(row.lastStatus ?? "") ? (row.lastStatus as FireStatus) : null,
    lastReport: row.lastReport,
    runCount: row.runCount,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSchedules(projectId: string, take = 30): Promise<ScheduleView[]> {
  const rows = await db.studioSchedule.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    take,
  });
  const planIds = [...new Set(rows.map((r) => r.planId).filter((v): v is string => Boolean(v)))];
  const plans = planIds.length > 0
    ? await db.dshPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, title: true } })
    : [];
  const titles = new Map(plans.map((p) => [p.id, p.title]));
  return rows.map((r) => viewOf(r as ScheduleRow, r.planId ? titles.get(r.planId) ?? null : null));
}

export interface CreateScheduleInput {
  name: string;
  kind: string;
  planId?: string | null;
  cadence?: string;
  intervalHours?: number;
  hourUtc?: number;
  weekday?: number;
  maxSteps?: number;
}

/** Validate + land a schedule (enabled, first fire computed from now). */
export async function createSchedule(
  projectId: string,
  input: CreateScheduleInput,
): Promise<{ ok: true; schedule: ScheduleView } | { ok: false; error: string }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required - what does this cadence do?" };
  const kind = String(input.kind ?? "PLAN_RUN").toUpperCase();
  if (!SCHEDULE_KINDS.includes(kind as ScheduleKind)) {
    return { ok: false, error: "kind must be PLAN_RUN | REPAINT_QUEUE | DAILY_DIGEST" };
  }
  const cadence = String(input.cadence ?? "DAILY").toUpperCase();
  if (!SCHEDULE_CADENCES.includes(cadence as ScheduleCadence)) {
    return { ok: false, error: "cadence must be HOURLY | DAILY | WEEKLY" };
  }
  let planId: string | null = null;
  if (kind === "PLAN_RUN" && input.planId) {
    const plan = await db.dshPlan.findFirst({ where: { id: String(input.planId), projectId } });
    if (!plan) return { ok: false, error: "planId does not match a plan of this production" };
    planId = plan.id;
  }
  const intervalHours = Math.min(24, Math.max(1, Math.round(Number(input.intervalHours ?? 1)) || 1));
  const hourUtc = Math.min(23, Math.max(0, Math.round(Number(input.hourUtc ?? 2)) || 0));
  const weekday = Math.min(6, Math.max(0, Math.round(Number(input.weekday ?? 1)) || 0));
  const maxSteps = Math.min(3, Math.max(1, Math.round(Number(input.maxSteps ?? 3)) || 3));
  const row = await db.studioSchedule.create({
    data: {
      projectId,
      name: name.slice(0, 120),
      kind,
      planId,
      cadence,
      intervalHours,
      hourUtc,
      weekday,
      maxSteps,
      enabled: true,
      nextRunAt: computeNextRun(cadence, intervalHours, hourUtc, weekday, new Date()),
    },
  });
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "SCHEDULE",
      summary: `Schedule '${row.name}' registered - ${kind === "PLAN_RUN" ? "runs an approved plan" : kind === "DAILY_DIGEST" ? "posts the daily digest to the creator" : "render-queue supervision"}, ${describeCadence(cadence, intervalHours, hourUtc, weekday)}`,
      payload: JSON.stringify({ scheduleId: row.id, kind, cadence }),
    },
  }).catch(() => {});
  return { ok: true, schedule: viewOf(row as ScheduleRow, null) };
}

interface FireOutcome {
  status: FireStatus;
  report: string;
}

/** Execute one schedule fire. Claims nothing - the caller advances the row. */
async function fireSchedule(row: ScheduleRow): Promise<FireOutcome> {
  if (row.kind === "DAILY_DIGEST") {
    const result = await postDailyDigest(row.projectId);
    if (!result.ok) return { status: "ERROR", report: result.error ?? "the digest failed to build" };
    return {
      status: "OK",
      report: `posted the digest to the creator: ${result.digest.headline} - ${result.digest.lines.length - 1} section(s) riding it`,
    };
  }

  if (row.kind === "REPAINT_QUEUE") {
    // supervision part 1: advance every active render job (progress,
    // completions, stale-worker failures) for this production
    let ticked = 0;
    try {
      const active = await db.renderJob.count({ where: { projectId: row.projectId, status: { in: ["QUEUED", "RENDERING"] } } });
      if (active > 0) await tickProjectJobs(row.projectId);
      ticked = active;
    } catch {
      ticked = 0;
    }
    // supervision part 2: the universe-facts re-render queue
    const live = await latestRepaintRun(row.projectId);
    if (live && (live.status === "RUNNING" || live.status === "PAUSED")) {
      return { status: "SKIPPED", report: `re-paint run already ${live.status.toLowerCase()} (${live.index}/${live.total} steps) - nothing started; ${ticked} render job(s) ticked` };
    }
    const queue = await universeReRenderQueue(row.projectId);
    if (queue.length === 0) {
      return { status: "SKIPPED", report: `re-render queue clean - nothing to re-paint; ${ticked} render job(s) ticked` };
    }
    const started = await startRepaintRun(row.projectId, 3);
    if (!started.ok) {
      return { status: "SKIPPED", report: `${started.error} (${ticked} render job(s) ticked)` };
    }
    return { status: "OK", report: `started a supervised re-paint pass over ${started.run.total} queued panel(s), worst confidence first; ${ticked} render job(s) ticked` };
  }

  // PLAN_RUN: explicit plan, else the project's latest ACTIVE plan
  let plan: PlanView | null = null;
  if (row.planId) {
    plan = await getPlan(row.planId);
    if (!plan) return { status: "ERROR", report: "the pinned plan no longer exists - update or disable this schedule" };
  } else {
    plan = await latestPlan(row.projectId, ["ACTIVE"]);
    if (!plan) return { status: "SKIPPED", report: "no ACTIVE plan to run - approve a proposal (or pin a planId) before the next fire" };
  }
  if (plan.status !== "ACTIVE") {
    return { status: "SKIPPED", report: `plan '${plan.title}' is ${plan.status.toLowerCase()} - approval is still the gate, nothing ran` };
  }
  const result = await runPlanSteps(plan.id, row.maxSteps);
  if (!result.ok || !result.plan) {
    return { status: "ERROR", report: result.error ?? "the plan run failed" };
  }
  const p = result.plan;
  const failedNote = p.failed > 0 ? ` - a step FAILED and the plan parks there for a supervised retry` : "";
  return {
    status: "OK",
    report: `plan '${p.title}' ${p.done}/${p.total} steps done${p.failed ? `, ${p.failed} failed` : ""}${p.status === "DONE" ? " - plan complete" : `, ${p.total - p.done - p.failed} step(s) remain for the next fire`}${failedNote}`,
  };
}

/** Fire every enabled schedule whose nextRunAt has passed. Returns how many fired. */
export async function fireDueSchedules(now: Date = new Date()): Promise<{ fired: number; outcomes: Array<{ id: string; name: string; status: FireStatus; report: string }> }> {
  const due = await db.studioSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 12,
  });
  const outcomes: Array<{ id: string; name: string; status: FireStatus; report: string }> = [];
  for (const row of due) {
    // claim first: a slow fire or a concurrent manual tick must not double-run
    const nextRunAt = computeNextRun(row.cadence, row.intervalHours, row.hourUtc, row.weekday, now);
    await db.studioSchedule.update({
      where: { id: row.id },
      data: { lastRunAt: now, nextRunAt },
    });
    let outcome: FireOutcome;
    try {
      outcome = await fireSchedule(row as ScheduleRow);
    } catch (err) {
      outcome = { status: "ERROR", report: err instanceof Error ? err.message.slice(0, 400) : "unknown scheduler error" };
    }
    await db.studioSchedule.update({
      where: { id: row.id },
      data: {
        lastStatus: outcome.status,
        lastReport: outcome.report.slice(0, 600),
        runCount: { increment: 1 },
      },
    });
    await db.productionEvent.create({
      data: {
        projectId: row.projectId,
        actor: "SYSTEM",
        type: "SCHEDULE",
        summary: `Schedule '${row.name}' ${outcome.status} - ${outcome.report.split("\n")[0].slice(0, 180)}`,
        payload: JSON.stringify({ scheduleId: row.id, kind: row.kind, status: outcome.status, report: outcome.report, nextRunAt: nextRunAt.toISOString() }),
      },
    }).catch(() => {});
    outcomes.push({ id: row.id, name: row.name, status: outcome.status, report: outcome.report });
  }
  return { fired: outcomes.length, outcomes };
}

/** Fire one schedule right now (Run now button / DSH), advancing its cadence. */
export async function fireScheduleNow(scheduleId: string): Promise<{ ok: boolean; error?: string; status?: FireStatus; report?: string; nextRunAt?: string }> {
  const row = await db.studioSchedule.findUnique({ where: { id: scheduleId } });
  if (!row) return { ok: false, error: "Schedule not found" };
  if (!row.enabled) return { ok: false, error: "Schedule is disabled - enable it first" };
  const now = new Date();
  const nextRunAt = computeNextRun(row.cadence, row.intervalHours, row.hourUtc, row.weekday, now);
  await db.studioSchedule.update({
    where: { id: row.id },
    data: { lastRunAt: now, nextRunAt },
  });
  let outcome: FireOutcome;
  try {
    outcome = await fireSchedule(row as ScheduleRow);
  } catch (err) {
    outcome = { status: "ERROR", report: err instanceof Error ? err.message.slice(0, 400) : "unknown scheduler error" };
  }
  await db.studioSchedule.update({
    where: { id: row.id },
    data: { lastStatus: outcome.status, lastReport: outcome.report.slice(0, 600), runCount: { increment: 1 } },
  });
  await db.productionEvent.create({
    data: {
      projectId: row.projectId,
      actor: "SYSTEM",
      type: "SCHEDULE",
      summary: `Schedule '${row.name}' fired now - ${outcome.status}: ${outcome.report.split("\n")[0].slice(0, 160)}`,
      payload: JSON.stringify({ scheduleId: row.id, kind: row.kind, status: outcome.status, report: outcome.report, nextRunAt: nextRunAt.toISOString() }),
    },
  }).catch(() => {});
  return { ok: true, status: outcome.status, report: outcome.report, nextRunAt: nextRunAt.toISOString() };
}

// ─── In-process loop (booted from src/instrumentation.ts) ───────

const LOOP_INTERVAL_MS = 60_000;
const WARMUP_DELAY_MS = 15_000;

/** Start the minute loop; safe to call twice (dev HMR guard). */
export function startSchedulerLoop(): void {
  const g = globalThis as unknown as { __animeosScheduler?: NodeJS.Timeout; __animeosSchedulerWarmup?: NodeJS.Timeout };
  if (g.__animeosScheduler) return;
  g.__animeosSchedulerWarmup = setTimeout(() => {
    void fireDueSchedules().catch(() => {});
  }, WARMUP_DELAY_MS);
  g.__animeosScheduler = setInterval(() => {
    void fireDueSchedules().catch((err) => {
      console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err);
    });
  }, LOOP_INTERVAL_MS);
  console.log("[scheduler] cadence loop started (checks every 60s)");
}

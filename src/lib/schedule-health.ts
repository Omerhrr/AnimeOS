import { db } from "@/lib/db";
import { describeCadence, type ScheduleRow } from "@/lib/scheduler";

// ─────────────────────────────────────────────────────────────
// SCHEDULE HEALTH - the cadence gets a report card
//
// Every schedule fire lands a SCHEDULE production event whose
// payload carries {scheduleId, kind, status, report}. This module
// reads that event history back (plus the live rows) as a health
// digest: per-schedule outcome counts over a window, consecutive
// error streaks, overdue detection (an armed schedule whose
// nextRunAt slipped far past) and a one-line headline for the
// cadence panel, the DSH context and the studio pulse tool.
// Pure helpers are exported for the E2E.
// ─────────────────────────────────────────────────────────────

export interface ScheduleHealthRow {
  scheduleId: string;
  name: string;
  kind: string;
  enabled: boolean;
  cadenceLabel: string;
  runCount: number;
  nextRunAt: string | null;
  overdue: boolean;
  lastStatus: "OK" | "SKIPPED" | "ERROR" | null;
  lastReport: string;
  window: { ok: number; skipped: number; error: number; fires: number };
  errorStreak: number; // consecutive ERROR outcomes, newest first (SKIPPED resets)
  okRate: number | null; // OK share of window fires
  headline: string;
}

export interface ScheduleHealthDigest {
  rows: ScheduleHealthRow[];
  armed: number;
  overdue: number;
  erroring: number; // schedules with errorStreak >= 2 or lastStatus ERROR
  windowDays: number;
  window: { ok: number; skipped: number; error: number; fires: number };
  headline: string;
}

export const SCHEDULE_HEALTH_WINDOW_DAYS = 14;
/** An armed schedule is OVERDUE when its next run slipped this far past. */
export const SCHEDULE_OVERDUE_TOLERANCE_MS = 60 * 60 * 1000;

/**
 * Per-schedule health from the schedule rows plus their SCHEDULE
 * events (payload JSON {scheduleId, status, report}). Pure - the E2E
 * drives it with synthetic rows and events.
 */
export function scheduleHealthFromEvents(
  schedules: Array<Pick<ScheduleRow, "id" | "name" | "kind" | "enabled" | "cadence" | "intervalHours" | "hourUtc" | "weekday" | "lastStatus" | "lastReport" | "runCount" | "nextRunAt">>,
  events: Array<{ payload: string | null; createdAt: Date }>,
  now: Date = new Date(),
): ScheduleHealthDigest {
  const since = now.getTime() - SCHEDULE_HEALTH_WINDOW_DAYS * 24 * 3600 * 1000;
  const bySchedule = new Map<string, Array<{ status: string; report: string; at: Date }>>();
  for (const ev of events) {
    if (ev.createdAt.getTime() < since) continue;
    if (!ev.payload) continue;
    let body: { scheduleId?: string; status?: string; report?: string } | null = null;
    try {
      body = JSON.parse(ev.payload) as { scheduleId?: string; status?: string; report?: string };
    } catch {
      body = null;
    }
    if (!body?.scheduleId) continue;
    // registration events carry a scheduleId but no fire status: they are not fires
    const st = String(body.status ?? "");
    if (st !== "OK" && st !== "SKIPPED" && st !== "ERROR") continue;
    const list = bySchedule.get(body.scheduleId) ?? [];
    list.push({ status: st, report: String(body.report ?? ""), at: ev.createdAt });
    bySchedule.set(body.scheduleId, list);
  }

  const rows: ScheduleHealthRow[] = schedules.map((s) => {
    const fires = (bySchedule.get(s.id) ?? []).sort((a, b) => b.at.getTime() - a.at.getTime());
    const ok = fires.filter((f) => f.status === "OK").length;
    const skipped = fires.filter((f) => f.status === "SKIPPED").length;
    const error = fires.filter((f) => f.status === "ERROR").length;
    let errorStreak = 0;
    for (const f of fires) {
      if (f.status === "ERROR") errorStreak += 1;
      else break; // any non-error outcome breaks the streak
    }
    const nextRunAt = s.nextRunAt ? s.nextRunAt.toISOString() : null;
    const overdue = s.enabled && Boolean(s.nextRunAt) && s.nextRunAt!.getTime() < now.getTime() - SCHEDULE_OVERDUE_TOLERANCE_MS;
    const okRate = fires.length > 0 ? ok / fires.length : null;
    const lastStatus = (["OK", "SKIPPED", "ERROR"] as const).includes(s.lastStatus as "OK" | "SKIPPED" | "ERROR")
      ? (s.lastStatus as "OK" | "SKIPPED" | "ERROR")
      : null;
    const lastReport = String(s.lastReport ?? "");
    const bits: string[] = [`${s.enabled ? "armed" : "disarmed"}`];
    if (fires.length > 0) bits.push(`${fires.length} fire(s) in ${SCHEDULE_HEALTH_WINDOW_DAYS}d: ${ok} OK / ${skipped} skipped / ${error} error`);
    else bits.push("no fires in the window");
    if (errorStreak >= 2) bits.push(`${errorStreak} errors in a row`);
    if (overdue) bits.push("OVERDUE");
    return {
      scheduleId: s.id,
      name: s.name,
      kind: s.kind,
      enabled: s.enabled,
      cadenceLabel: describeCadence(s.cadence, s.intervalHours, s.hourUtc, s.weekday),
      runCount: s.runCount,
      nextRunAt,
      overdue,
      lastStatus,
      lastReport,
      window: { ok, skipped, error, fires: fires.length },
      errorStreak,
      okRate,
      headline: `${s.name}: ${bits.join(", ")}`,
    };
  });

  const window = rows.reduce(
    (acc, r) => ({ ok: acc.ok + r.window.ok, skipped: acc.skipped + r.window.skipped, error: acc.error + r.window.error, fires: acc.fires + r.window.fires }),
    { ok: 0, skipped: 0, error: 0, fires: 0 },
  );
  const armed = rows.filter((r) => r.enabled).length;
  const overdue = rows.filter((r) => r.overdue).length;
  const erroring = rows.filter((r) => r.errorStreak >= 2 || (r.enabled && r.lastStatus === "ERROR")).length;

  let headline: string;
  if (rows.length === 0) {
    headline = "no schedules registered - the studio only works while you are in the room";
  } else {
    const parts = [`${armed} of ${rows.length} armed`];
    if (overdue > 0) parts.push(`${overdue} overdue`);
    if (window.fires > 0) parts.push(`${window.fires} fire(s) in ${SCHEDULE_HEALTH_WINDOW_DAYS}d: ${window.ok} OK / ${window.skipped} skipped / ${window.error} error`);
    if (erroring > 0) parts.push(`${erroring} needs attention`);
    headline = parts.join(", ");
  }

  return { rows, armed, overdue, erroring, windowDays: SCHEDULE_HEALTH_WINDOW_DAYS, window, headline };
}

/** The digest over a production's live schedules + their SCHEDULE events. */
export async function scheduleHealthData(projectId: string, now: Date = new Date()): Promise<ScheduleHealthDigest> {
  const [schedules, events] = await Promise.all([
    db.studioSchedule.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    db.productionEvent.findMany({
      where: { projectId, type: "SCHEDULE" },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return scheduleHealthFromEvents(schedules, events, now);
}

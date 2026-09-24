import { db } from "@/lib/db";
import { canonHealthData } from "@/lib/canon-health";
import { identityDriftData } from "@/lib/identity";

// ─────────────────────────────────────────────────────────────
// DAILY DIGEST - the studio writes to the creator
//
// One readable message covering a window of studio activity, built
// from the production-event ledger (renders queued, plan steps
// executed, schedule fires, evaluations) plus the live health
// headlines (canon score, identity drift curves, queue pressure).
//
// Delivery is the cadence scheduler: a DAILY_DIGEST schedule fires
// between conversations (default nightly), postDailyDigest lands
// the message as a DIGEST production event, and the digest panel on
// the DSH view shows it. DSH can also post one on demand
// (post_digest) when the creator asks for a catch-up.
//
// buildDigestFromEvents is pure - the E2E drives it directly.
// ─────────────────────────────────────────────────────────────

export const DIGEST_WINDOW_HOURS = 24;

export interface DigestInput {
  projectTitle: string;
  windowHours: number;
  now: Date;
  events: Array<{ type: string; summary: string; createdAt: Date }>;
  canonHeadline: string | null;
  driftHeadline: string | null;
  queueCounts: { active: number; rerender: number };
}

export interface DailyDigest {
  headline: string;
  lines: string[];
  windowHours: number;
  events: number;
}

const BUCKET_LABELS: Record<string, string> = {
  RENDER: "renders",
  PLAN: "plans",
  TOOL_CALL: "plan steps",
  SCHEDULE: "schedule fires",
  EVALUATION: "DSH inspections",
  STATE_CHANGE: "evaluation fixes",
  CONTINUITY: "continuity writes",
};

/** Roll a window of production events into one digest. Pure. */
export function buildDigestFromEvents(input: DigestInput): DailyDigest {
  const since = input.now.getTime() - input.windowHours * 3600 * 1000;
  const windowed = input.events.filter((e) => e.createdAt.getTime() >= since);

  const counts = new Map<string, number>();
  for (const e of windowed) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);

  const lines: string[] = [];
  lines.push(`${input.projectTitle}, last ${input.windowHours}h: ${windowed.length} production event(s)`);

  // renders
  const renders = counts.get("RENDER") ?? 0;
  lines.push(`Renders: ${renders > 0 ? `${renders} job(s) queued or worked` : "none queued"}`);

  // plan activity: steps executed + plan lifecycle events
  const steps = counts.get("TOOL_CALL") ?? 0;
  const planEvents = counts.get("PLAN") ?? 0;
  const latestPlan = windowed.find((e) => e.type === "PLAN" || e.type === "TOOL_CALL");
  lines.push(
    steps + planEvents > 0
      ? `Plans: ${steps} step(s) executed, ${planEvents} plan event(s)${latestPlan ? ` - latest: ${latestPlan.summary.slice(0, 120)}` : ""}`
      : "Plans: quiet",
  );

  // schedule fires with an honest error count (summaries carry the status)
  const fires = windowed.filter((e) => e.type === "SCHEDULE" && /\b(OK|SKIPPED|ERROR)\b/.test(e.summary));
  const errors = fires.filter((e) => /\bERROR\b/.test(e.summary));
  lines.push(
    fires.length > 0
      ? `Schedules: ${fires.length} fire(s)${errors.length ? `, ${errors.length} ERROR(s) - check the cadence panel` : ""}`
      : "Schedules: no fires",
  );

  // health headlines (whatever the caller could read; null = honest absence)
  lines.push(`Canon: ${input.canonHeadline ?? "no active facts registered"}`);
  lines.push(`Identity drift: ${input.driftHeadline ?? "no curves yet"}`);
  lines.push(`Queue now: ${input.queueCounts.active} active render job(s), re-render queue ${input.queueCounts.rerender} panel(s)`);

  return {
    headline: lines[0],
    lines,
    windowHours: input.windowHours,
    events: windowed.length,
  };
}

/** Build AND land the digest for one production (a DIGEST production event). */
export async function postDailyDigest(
  projectId: string,
  windowHours = DIGEST_WINDOW_HOURS,
): Promise<{ ok: true; digest: DailyDigest } | { ok: false; error: string }> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { title: true } });
  if (!project) return { ok: false, error: "Production not found" };

  const hours = Math.min(168, Math.max(1, Math.round(windowHours) || DIGEST_WINDOW_HOURS));
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const [events, canon, drift, activeJobs, rerenderQueue] = await Promise.all([
    db.productionEvent.findMany({
      where: { projectId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { type: true, summary: true, createdAt: true },
    }),
    canonHealthData(projectId).then((c) => c.digest.headline).catch(() => null),
    identityDriftData(projectId).then((d) => d.headline).catch(() => null),
    db.renderJob.count({ where: { projectId, status: { in: ["QUEUED", "RENDERING"] } } }),
    db.continuityEvent.count({ where: { projectId, kind: { in: ["FACT_BROKEN", "ART_DRIFT", "IDENTITY_DRIFT"] } } }).catch(() => 0),
  ]);

  const digest = buildDigestFromEvents({
    projectTitle: project.title,
    windowHours: hours,
    now: new Date(),
    events,
    canonHeadline: canon,
    driftHeadline: drift,
    queueCounts: { active: activeJobs, rerender: rerenderQueue },
  });

  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "DIGEST",
      summary: digest.headline.slice(0, 300),
      payload: JSON.stringify({ text: digest.lines.join("\n"), windowHours: digest.windowHours, events: digest.events }),
    },
  });

  return { ok: true, digest };
}

export interface DigestRow {
  id: string;
  headline: string;
  text: string;
  windowHours: number;
  events: number;
  createdAt: string;
}

/** The digest panel's feed: the most recent posted digests. */
export async function listDigests(projectId: string, take = 7): Promise<DigestRow[]> {
  const rows = await db.productionEvent.findMany({
    where: { projectId, type: "DIGEST" },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((r) => {
    let text = r.summary;
    let windowHours = DIGEST_WINDOW_HOURS;
    let events = 0;
    try {
      const parsed = JSON.parse(r.payload ?? "{}") as { text?: unknown; windowHours?: unknown; events?: unknown };
      if (typeof parsed.text === "string") text = parsed.text;
      if (typeof parsed.windowHours === "number") windowHours = parsed.windowHours;
      if (typeof parsed.events === "number") events = parsed.events;
    } catch { /* summary fallback already set */ }
    return {
      id: r.id,
      headline: r.summary,
      text,
      windowHours,
      events,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

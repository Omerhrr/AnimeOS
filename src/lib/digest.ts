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

// ─── Delivery beyond the studio ─────────────────────────────
//
// A digest is only useful if it reaches the creator. Two targets:
//
//   • WEBHOOK - POST the digest JSON to any URL (Slack/Discord
//     gateways, automation hubs, a phone's push bridge).
//   • EMAIL   - SMTP via nodemailer, configured with
//     ANIMEOS_SMTP_URL (smtp://user:pass@host:port). Without the
//     env the outcome is an honest "no transport", never a silent
//     drop.

export interface DeliveryTarget {
  webhookUrl?: string | null;
  email?: string | null;
}

export interface DeliveryOutcome {
  kind: "webhook" | "email";
  target: string; // redacted display form
  ok: boolean;
  detail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.slice(0, 24)}`;
  } catch {
    return url.slice(0, 40);
  }
}

/** Deliver one digest to its targets; every outcome is recorded, none throw. */
export async function deliverDigest(
  digest: DailyDigest,
  projectTitle: string,
  targets: DeliveryTarget,
): Promise<DeliveryOutcome[]> {
  const outcomes: DeliveryOutcome[] = [];
  const body = JSON.stringify({
    project: projectTitle,
    headline: digest.headline,
    lines: digest.lines,
    windowHours: digest.windowHours,
    events: digest.events,
    postedAt: new Date().toISOString(),
  });

  const webhookUrl = String(targets.webhookUrl ?? "").trim();
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(8000),
      });
      outcomes.push({ kind: "webhook", target: redactUrl(webhookUrl), ok: res.ok, detail: `webhook responded ${res.status}` });
    } catch (err) {
      outcomes.push({ kind: "webhook", target: redactUrl(webhookUrl), ok: false, detail: err instanceof Error ? err.message.slice(0, 120) : "webhook failed" });
    }
  }

  const email = String(targets.email ?? "").trim();
  if (email) {
    if (!EMAIL_RE.test(email)) {
      outcomes.push({ kind: "email", target: email, ok: false, detail: "not a valid email address" });
    } else {
      try {
        const { default: nodemailer } = await import("nodemailer");
        const smtpUrl = String(process.env.ANIMEOS_SMTP_URL ?? "").trim();
        if (!smtpUrl) {
          outcomes.push({ kind: "email", target: email, ok: false, detail: "no SMTP transport configured (set ANIMEOS_SMTP_URL)" });
        } else {
          const transport = nodemailer.createTransport(smtpUrl);
          const info = await transport.sendMail({
            from: String(process.env.ANIMEOS_SMTP_FROM ?? "AnimeOS Studio <studio@animeos.local>"),
            to: email,
            subject: `${projectTitle} - ${digest.headline}`.slice(0, 140),
            text: digest.lines.join("\n"),
          });
          outcomes.push({ kind: "email", target: email, ok: true, detail: `email accepted (${info.messageId ?? "sent"})` });
        }
      } catch (err) {
        outcomes.push({ kind: "email", target: email, ok: false, detail: err instanceof Error ? err.message.slice(0, 120) : "email failed" });
      }
    }
  }
  return outcomes;
}

function describeDeliveries(outcomes: DeliveryOutcome[]): string | null {
  if (outcomes.length === 0) return null;
  return outcomes.map((o) => `${o.kind} ${o.ok ? "OK" : "FAILED"} (${o.detail.slice(0, 60)})`).join(", ");
}

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

/** Build AND land the digest for one production (a DIGEST production event), then deliver it. */
export async function postDailyDigest(
  projectId: string,
  windowHours = DIGEST_WINDOW_HOURS,
  targets: DeliveryTarget = {},
): Promise<{ ok: true; digest: DailyDigest; deliveries: DeliveryOutcome[] } | { ok: false; error: string }> {
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

  const deliveries = await deliverDigest(digest, project.title, targets).catch(() => [
    { kind: "webhook" as const, target: "?", ok: false, detail: "delivery crashed" },
  ]);
  const deliveryLine = describeDeliveries(deliveries);

  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "DIGEST",
      summary: `${digest.headline.slice(0, 300)}${deliveryLine ? ` - delivered: ${deliveryLine.slice(0, 120)}` : ""}`,
      payload: JSON.stringify({ text: digest.lines.join("\n"), windowHours: digest.windowHours, events: digest.events, deliveries }),
    },
  });

  return { ok: true, digest, deliveries };
}

export interface DigestRow {
  id: string;
  headline: string;
  text: string;
  windowHours: number;
  events: number;
  createdAt: string;
  deliveries: Array<{ kind: string; target: string; ok: boolean; detail: string }>;
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
    let deliveries: Array<{ kind: string; target: string; ok: boolean; detail: string }> = [];
    try {
      const parsed = JSON.parse(r.payload ?? "{}") as { text?: unknown; windowHours?: unknown; events?: unknown; deliveries?: unknown };
      if (typeof parsed.text === "string") text = parsed.text;
      if (typeof parsed.windowHours === "number") windowHours = parsed.windowHours;
      if (typeof parsed.events === "number") events = parsed.events;
      if (Array.isArray(parsed.deliveries)) {
        deliveries = (parsed.deliveries as Array<Record<string, unknown>>).map((d) => ({
          kind: String(d.kind ?? "?"),
          target: String(d.target ?? "?"),
          ok: Boolean(d.ok),
          detail: String(d.detail ?? ""),
        }));
      }
    } catch { /* summary fallback already set */ }
    return {
      id: r.id,
      headline: r.summary,
      text,
      windowHours,
      events,
      deliveries,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

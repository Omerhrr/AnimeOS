import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { canonHealthData } from "@/lib/canon-health";
import { identityDriftData } from "@/lib/identity";
import { buildMemberDigest } from "@/lib/studio/member-digests";
import { presenceBucket } from "@/lib/studio/presence";

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

// ── THE SLATE IS SIGNED (iteration 104) ──
//
// Every outbound webhook payload is a SLATE: the receiving delivery
// target (a Slack/Discord gateway, an automation hub, a phone's push
// bridge) executes on what it receives, so it must be able to VERIFY
// the slate's authenticity before acting. The law:
//
//   X-AnimeOS-Signature: sha256=HMAC_SHA256(secret, `${ts}.${body}`)
//   X-AnimeOS-Timestamp: <unix seconds at signing>
//
// The secret is the production's OWN (generated once, lazily, stored
// on the project row) unless ANIMEOS_WEBHOOK_SECRET sets a global
// one. The receiver verifies the signature over the RAW body and
// rejects a stale timestamp (the replay window is 5 minutes) - a
// forged or replayed slate reads as refused.
//
// Beside the signature stands the DOMAIN ALLOWLIST: when
// ANIMEOS_WEBHOOK_ALLOWLIST names hosts (comma-separated; a leading
// dot admits subdomains), the network layer refuses any webhookUrl
// outside it - at the PEN (create_schedule) and again at DELIVERY
// (defense in depth, the same law the SSRF guard obeys). An unset
// allowlist leaves the SSRF private-host law standing alone.

export const WEBHOOK_SIGNATURE_TOLERANCE_SEC = 300;

/** The signing law (pure): the exact header value the receiver verifies. */
export function webhookSignature(secret: string, body: string, timestamp: number): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** The verification law (pure): what a listening delivery target runs
 *  before executing on a slate. Tampered bodies, wrong secrets and
 *  stale timestamps all read refused, with the reason named. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  signature: string | null | undefined,
  timestamp: number | null | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec: number = WEBHOOK_SIGNATURE_TOLERANCE_SEC,
): { ok: boolean; reason?: string } {
  if (!signature || typeof signature !== "string") return { ok: false, reason: "missing signature" };
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return { ok: false, reason: "missing timestamp" };
  if (Math.abs(nowSec - timestamp) > toleranceSec) return { ok: false, reason: "stale timestamp (replay window exceeded)" };
  const expected = Buffer.from(webhookSignature(secret, body, timestamp).slice(7), "hex");
  const given = String(signature).startsWith("sha256=") ? String(signature).slice(7) : String(signature);
  let givenBuf: Buffer;
  try {
    givenBuf = Buffer.from(given, "hex");
  } catch {
    return { ok: false, reason: "malformed signature" };
  }
  if (givenBuf.length !== expected.length || !timingSafeEqual(givenBuf, expected)) {
    return { ok: false, reason: "signature mismatch" };
  }
  return { ok: true };
}

/**
 * The domain allowlist law (pure): null admits everything (the SSRF
 * law stands alone); a configured list refuses any host outside it -
 * a leading-dot entry admits that host's subdomains.
 */
export function webhookAllowlistRefusal(url: string, allowlistRaw: string | null | undefined): string | null {
  const raw = String(allowlistRaw ?? "").trim();
  if (!raw) return null;
  const hosts = raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (hosts.length === 0) return null;
  let u: URL;
  try {
    u = new URL(String(url ?? "").trim());
  } catch {
    return "webhookUrl is not a valid URL";
  }
  const host = u.hostname.toLowerCase();
  const ok = hosts.some((h) => h === host || (h.startsWith(".") && host.endsWith(h)) || (h.startsWith("*.") && host.endsWith(h.slice(1))));
  if (ok) return null;
  return `webhookUrl host '${host}' is not on the delivery allowlist (${hosts.join(", ")}) - the network layer refuses`;
}

/** The secret resolution law: the env override wins; otherwise the
 *  production's own secret, generated once and persisted lazily. */
export async function resolveWebhookSecret(projectId: string | null): Promise<{ secret: string; source: "env" | "project" } | null> {
  const envSecret = String(process.env.ANIMEOS_WEBHOOK_SECRET ?? "").trim();
  if (envSecret) return { secret: envSecret, source: "env" };
  if (!projectId) return null;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { webhookSecret: true } });
  if (project?.webhookSecret) return { secret: project.webhookSecret, source: "project" };
  const secret = randomBytes(32).toString("hex");
  await db.project.update({ where: { id: projectId }, data: { webhookSecret: secret } }).catch(() => null);
  return { secret, source: "project" };
}

// SSRF guard (audit, iteration 68): the digest webhook POSTs to a
// member-supplied URL, so the URL must be a public http(s) one -
// never a loopback, link-local, private-range or cloud-metadata
// host. Applied at the PEN (create_schedule refuses) and again at
// DELIVERY (the outcome records the refusal - defense in depth).
// ANIMEOS_WEBHOOK_ALLOW_PRIVATE=1 (iteration 71) is the documented
// DEV/TEST escape: it lets the E2E suite point a channel at a local
// receiver to prove delivery over the real runtime. Production
// deployments never set it; the guard then bites at both layers.
const PRIVATE_HOST_RE = /^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?fc00:|\[?fd..:|\[?fe80:)/i;

export function webhookUrlRefusal(url: string): string | null {
  const raw = String(url ?? "").trim();
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "webhookUrl is not a valid URL";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return "webhookUrl must be an http(s) URL";
  }
  if (PRIVATE_HOST_RE.test(u.hostname)) {
    if (process.env.ANIMEOS_WEBHOOK_ALLOW_PRIVATE === "1") return null;
    return "webhookUrl must not point at a loopback or private address";
  }
  return null;
}

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
  projectId: string | null = null,
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
    const refusal = webhookUrlRefusal(webhookUrl);
    if (refusal) {
      outcomes.push({ kind: "webhook", target: redactUrl(webhookUrl), ok: false, detail: refusal });
    } else {
      const allowlistRefusal = webhookAllowlistRefusal(webhookUrl, process.env.ANIMEOS_WEBHOOK_ALLOWLIST);
      if (allowlistRefusal) {
        outcomes.push({ kind: "webhook", target: redactUrl(webhookUrl), ok: false, detail: allowlistRefusal });
      } else {
        // THE SLATE IS SIGNED: the receiving target can verify the
        // slate before executing on it; a missing secret reads honest
        // (unsigned), never silently
        const secret = await resolveWebhookSecret(projectId);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        let signNote = "unsigned (no signing secret)";
        if (secret) {
          const ts = Math.floor(Date.now() / 1000);
          headers["X-AnimeOS-Signature"] = webhookSignature(secret.secret, body, ts);
          headers["X-AnimeOS-Timestamp"] = String(ts);
          signNote = `signed (${secret.source} secret)`;
        }
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(8000),
          });
          outcomes.push({ kind: "webhook", target: redactUrl(webhookUrl), ok: res.ok, detail: `webhook responded ${res.status}, ${signNote}` });
        } catch (err) {
          outcomes.push({ kind: "webhook", target: redactUrl(webhookUrl), ok: false, detail: err instanceof Error ? err.message.slice(0, 120) : "webhook failed" });
        }
      }
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

  const deliveries = await deliverDigest(digest, project.title, targets, projectId).catch(() => [
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

/** Post ONE MEMBER's digest as a DIGEST production event (iteration
 * 68): the same honest ledger read the daily digest keeps, scoped to
 * the member's attributed events and their crew-thread comments.
 * A quiet member is reported honestly - a digest is never invented. */
export async function postMemberDigest(
  projectId: string,
  memberRef: string,
  windowHours = DIGEST_WINDOW_HOURS,
): Promise<{ ok: true; digest: ReturnType<typeof buildMemberDigest> } | { ok: false; error: string }> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, title: true } });
  if (!project) return { ok: false, error: "Production not found" };
  if (!memberRef.trim()) return { ok: false, error: "name the member (name or email)" };
  const member = await db.user.findFirst({
    where: { OR: [{ email: { equals: memberRef.trim() } }, { name: { equals: memberRef.trim() } }] },
    select: { id: true, name: true, role: true, lastSeenAt: true },
  });
  if (!member) {
    return { ok: false, error: `no member named '${memberRef.trim()}' in the studio roster` };
  }
  const hours = Math.min(168, Math.max(1, Math.round(windowHours) || DIGEST_WINDOW_HOURS));
  const now = new Date();
  const since = new Date(now.getTime() - hours * 3_600_000);
  const [events, commentCount] = await Promise.all([
    db.productionEvent.findMany({
      where: { projectId, userId: member.id, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" as const },
      select: { type: true, summary: true, payload: true, createdAt: true },
      take: 1000,
    }),
    db.comment.count({ where: { projectId, authorId: member.id, createdAt: { gte: since } } }),
  ]);
  const digest = buildMemberDigest({
    member: { name: member.name, role: member.role },
    events: events.map((e) => ({ type: e.type, summary: e.summary, createdAt: e.createdAt, payload: e.payload })),
    comments: commentCount,
    windowHours: hours,
    now,
  });
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "SYSTEM",
      type: "DIGEST",
      summary: `${digest.headline.slice(0, 300)}`,
      payload: JSON.stringify({ text: digest.lines.join("\n"), windowHours: hours, events: digest.events, member: member.name, presence: presenceBucket(member.lastSeenAt, now), memberDigest: true }),
      userId: member.id,
    },
  });
  return { ok: true, digest };
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

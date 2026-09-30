import { db } from "@/lib/db";
import { deliverDigest, type DailyDigest, type DeliveryOutcome } from "@/lib/digest";

// ─────────────────────────────────────────────────────────────
// PER-MEMBER OUTBOUND NOTIFICATIONS (iteration 71)
//
// The studio floor is a PULL surface - you read it while you are in
// the room. This is the PUSH half: members who subscribe their own
// channels get the studio's news where they actually are - a digest
// posted (post_digest), a release slated (schedule_release or the
// calendar's dialog) - and every attempt lands on an honest ledger
// (NotificationDelivery: SENT | REFUSED | FAILED with the detail).
//
// Channels per member:
//   • WEBHOOK - a member-supplied public http(s) endpoint
//     (SSRF-guarded at the pen and again at delivery, the same law
//     the digest webhook obeys; ANIMEOS_WEBHOOK_ALLOW_PRIVATE=1 is
//     the documented dev/test escape).
//   • EMAIL   - the studio's SMTP transport (ANIMEOS_SMTP_URL) to
//     the member's account address. Without the env the outcome is
//     an honest "no transport" row, never a silent drop.
//
// Audience: the production's crew plus every OWNER (ownership is
// implicit and global), each member only ever receiving the kinds
// they subscribed to. A member with no subscription receives
// nothing and owes no rows.
// ─────────────────────────────────────────────────────────────

export type NotifyKind = "DIGEST" | "RELEASE";

export interface NotifyFanout {
  reached: number; // members that got at least one SENT row
  refused: number; // REFUSED rows (the guard said no)
  failed: number; // FAILED rows (the transport said no)
  skipped: number; // subscribed members with no working channel configured
}

/** Deliver one notification to ONE member's channels and record every
 * outcome on the ledger. Never throws - a broken channel is a row. */
export async function deliverToMember(
  member: { id: string; email: string; notifyWebhook: string | null; notifyEmail: boolean },
  kind: NotifyKind,
  title: string,
  lines: string[],
  projectId: string | null,
): Promise<DeliveryOutcome[]> {
  const digest: DailyDigest = {
    headline: title,
    lines,
    windowHours: 0,
    events: 0,
  };
  const outcomes = await deliverDigest(digest, title, {
    webhookUrl: member.notifyWebhook,
    email: member.notifyEmail ? member.email : null,
  }, projectId).catch(() => [{ kind: "webhook" as const, target: "?", ok: false, detail: "delivery crashed" }]);
  for (const o of outcomes) {
    await db.notificationDelivery.create({
      data: {
        userId: member.id,
        kind,
        status: o.ok ? "SENT" : o.detail.includes("must not point") || o.detail.includes("not a valid") || o.detail.includes("must be an http(s)") ? "REFUSED" : "FAILED",
        detail: `${o.kind}: ${o.detail}`.slice(0, 300),
        projectId,
      },
    }).catch(() => {});
  }
  return outcomes;
}

/** Fan one notification out to every subscribed member of a
 * production (its crew + every OWNER). Returns the honest counts. */
export async function notifyMembers(
  projectId: string,
  kind: NotifyKind,
  title: string,
  lines: string[],
): Promise<NotifyFanout> {
  const members = await db.user.findMany({
    where: {
      OR: [
        { role: "OWNER", ...(kind === "DIGEST" ? { notifyOnDigest: true } : { notifyOnRelease: true }) },
        {
          memberships: { some: { projectId } },
          ...(kind === "DIGEST" ? { notifyOnDigest: true } : { notifyOnRelease: true }),
        },
      ],
    },
    select: { id: true, email: true, notifyWebhook: true, notifyEmail: true },
  });
  const fanout: NotifyFanout = { reached: 0, refused: 0, failed: 0, skipped: 0 };
  for (const m of members) {
    if (!m.notifyWebhook && !m.notifyEmail) {
      fanout.skipped += 1;
      continue;
    }
    const outcomes = await deliverToMember(m, kind, title, lines, projectId);
    if (outcomes.some((o) => o.ok)) fanout.reached += 1;
    fanout.refused += outcomes.filter((o) => !o.ok && o.detail.includes("must not point")).length;
    fanout.failed += outcomes.filter((o) => !o.ok && !o.detail.includes("must not point")).length;
  }
  return fanout;
}

/** The member-facing line for a tool result: what actually left. */
export function describeFanout(f: NotifyFanout): string {
  if (f.reached === 0 && f.refused === 0 && f.failed === 0) {
    return f.skipped > 0
      ? `${f.skipped} subscribed member(s) have no working channel configured yet - set one in the dashboard's outbound panel.`
      : "No member has subscribed their channels yet - the outbound panel on the dashboard is where that happens.";
  }
  const parts: string[] = [];
  if (f.reached > 0) parts.push(`${f.reached} member channel(s) reached`);
  if (f.refused > 0) parts.push(`${f.refused} refused by the SSRF guard`);
  if (f.failed > 0) parts.push(`${f.failed} failed (see the delivery ledger)`);
  if (f.skipped > 0) parts.push(`${f.skipped} subscribed member(s) with no working channel`);
  return `Outbound: ${parts.join(", ")}.`;
}

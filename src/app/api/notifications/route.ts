export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionUser } from "@/lib/auth";
import { webhookUrlRefusal } from "@/lib/digest";

// ─────────────────────────────────────────────────────────────
// PER-MEMBER OUTBOUND NOTIFICATIONS (iteration 71): each member's
// own channels and delivery ledger. GET reads the config plus the
// last 50 deliveries (the webhook URL is redacted on read - the
// ledger stores the detail, never the full secret-bearing URL).
// PATCH is SELF-SERVICE: any signed-in member edits their OWN
// channels (a webhook is validated by the same SSRF law the digest
// webhook obeys - refused at the pen, refused again at delivery).
// ─────────────────────────────────────────────────────────────

function redact(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.slice(0, 24)}`;
  } catch {
    return url.slice(0, 40);
  }
}

export async function GET(req: Request) {
  const user = await sessionUser(req, { touch: true });
  if (!user) return NextResponse.json({ error: "Sign in to use the studio" }, { status: 401 });

  const [row, deliveries] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        notifyWebhook: true,
        notifyEmail: true,
        notifyOnDigest: true,
        notifyOnRelease: true,
      },
    }),
    db.notificationDelivery.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!row) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  return NextResponse.json({
    config: {
      email: row.email,
      webhookRedacted: redact(row.notifyWebhook),
      notifyEmail: row.notifyEmail,
      notifyOnDigest: row.notifyOnDigest,
      notifyOnRelease: row.notifyOnRelease,
      smtpConfigured: Boolean(process.env.ANIMEOS_SMTP_URL),
    },
    deliveries: deliveries.map((d) => ({
      id: d.id,
      kind: d.kind,
      status: d.status,
      detail: d.detail,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: Request) {
  const user = await sessionUser(req, { touch: true });
  if (!user) return NextResponse.json({ error: "Sign in to use the studio" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const data: {
    notifyWebhook?: string | null;
    notifyEmail?: boolean;
    notifyOnDigest?: boolean;
    notifyOnRelease?: boolean;
  } = {};

  if ("notifyWebhook" in body) {
    const raw = body.notifyWebhook;
    if (raw === null || raw === "") {
      data.notifyWebhook = null; // clear the channel
    } else {
      const url = String(raw).trim();
      const refusal = webhookUrlRefusal(url);
      if (refusal) return NextResponse.json({ error: refusal }, { status: 400 });
      data.notifyWebhook = url;
    }
  }
  if ("notifyEmail" in body) data.notifyEmail = Boolean(body.notifyEmail);
  if ("notifyOnDigest" in body) data.notifyOnDigest = Boolean(body.notifyOnDigest);
  if ("notifyOnRelease" in body) data.notifyOnRelease = Boolean(body.notifyOnRelease);

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update - send notifyWebhook / notifyEmail / notifyOnDigest / notifyOnRelease" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { notifyWebhook: true, notifyEmail: true, notifyOnDigest: true, notifyOnRelease: true },
  });
  return NextResponse.json({
    ok: true,
    config: {
      webhookRedacted: redact(updated.notifyWebhook),
      notifyEmail: updated.notifyEmail,
      notifyOnDigest: updated.notifyOnDigest,
      notifyOnRelease: updated.notifyOnRelease,
    },
  });
}

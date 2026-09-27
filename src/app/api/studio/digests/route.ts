export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { buildMemberDigest } from "@/lib/studio/member-digests";
import { presenceBucket } from "@/lib/studio/presence";

// ─────────────────────────────────────────────────────────────
// MEMBER DIGESTS (iteration 68): one digest per member of the
// studio - what each of them actually caused in the window, built
// from the attributed production-event ledger and the crew threads.
// Crew-readable (VIEWER included): the crew reads each other.
// No mutation, ever - a digest is a read of the honest ledgers.
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const rawHours = Number(searchParams.get("hours") ?? 24);
  const windowHours = Number.isFinite(rawHours) ? Math.max(1, Math.min(168, Math.round(rawHours))) : 24;
  const now = new Date();
  const since = new Date(now.getTime() - windowHours * 3_600_000);

  const [members, events, comments, memberships] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, lastSeenAt: true },
    }),
    db.productionEvent.findMany({
      where: { projectId, userId: { not: null }, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" as const },
      select: { userId: true, type: true, summary: true, payload: true, createdAt: true },
      take: 2000,
    }),
    db.comment.groupBy({
      by: ["authorId"],
      where: { projectId, createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.projectMembership.findMany({
      where: { projectId },
      select: { userId: true, craft: true },
    }),
  ]);

  const eventsByUser = new Map<string, typeof events>();
  for (const e of events) {
    if (!e.userId) continue;
    eventsByUser.set(e.userId, [...(eventsByUser.get(e.userId) ?? []), e]);
  }
  const commentsByUser = new Map<string, number>();
  for (const c of comments) commentsByUser.set(c.authorId, c._count._all);
  const craftByUser = new Map(memberships.map((m) => [m.userId, m.craft]));

  return NextResponse.json({
    now: now.toISOString(),
    windowHours,
    members: members.map((m) => {
      const bucket = presenceBucket(m.lastSeenAt, now);
      const digest = buildMemberDigest({
        member: { name: m.name, role: m.role },
        events: (eventsByUser.get(m.id) ?? []).map((e) => ({ type: e.type, summary: e.summary, createdAt: e.createdAt, payload: e.payload })),
        comments: commentsByUser.get(m.id) ?? 0,
        windowHours,
        now,
      });
      return {
        id: m.id,
        email: m.email,
        role: m.role,
        craft: craftByUser.get(m.id) ?? null,
        onCrew: craftByUser.has(m.id) || m.role === "OWNER",
        bucket,
        digest,
      };
    }),
  });
}

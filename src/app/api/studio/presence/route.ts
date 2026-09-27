export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionUser } from "@/lib/auth";
import { presenceBucket, PRESENCE_LABEL } from "@/lib/studio/presence";

// ─────────────────────────────────────────────────────────────
// STUDIO PRESENCE (iteration 68): who is in the room. Crew-readable
// (every signed-in member reads the floor). The caller's own
// lastSeenAt is bumped by the session read itself (the touch), so
// polling this endpoint IS the heartbeat - presence is kept alive
// by the studio simply working.
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await sessionUser(req, { touch: true });
  if (!user) return NextResponse.json({ error: "Sign in to use the studio" }, { status: 401 });

  const now = new Date();
  const [members, memberships] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, lastSeenAt: true, createdAt: true },
    }),
    db.projectMembership.findMany({
      select: { userId: true, projectId: true, craft: true, project: { select: { title: true } } },
    }),
  ]);

  const craftsByUser = new Map<string, Array<{ projectId: string; projectTitle: string; craft: string }>>();
  for (const m of memberships) {
    craftsByUser.set(m.userId, [...(craftsByUser.get(m.userId) ?? []), { projectId: m.projectId, projectTitle: m.project.title, craft: m.craft }]);
  }

  return NextResponse.json({
    now: now.toISOString(),
    counts: {
      online: members.filter((m) => presenceBucket(m.lastSeenAt, now) === "online").length,
      recent: members.filter((m) => presenceBucket(m.lastSeenAt, now) === "recent").length,
    },
    members: members.map((m) => {
      const bucket = presenceBucket(m.lastSeenAt, now);
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        lastSeenAt: m.lastSeenAt ? m.lastSeenAt.toISOString() : null,
        bucket,
        label: PRESENCE_LABEL[bucket],
        seats: craftsByUser.get(m.id) ?? [],
      };
    }),
  });
}

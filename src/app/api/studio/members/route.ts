// ─────────────────────────────────────────────────────────────
// STUDIO ROSTER
// GET   - any signed-in member sees the roster (who is in the
//         studio, what they can do, when they were last active).
// PATCH - OWNER only: change a member's role. The LAST OWNER can
//         never be demoted - the studio always keeps at least one
//         administrator. Role changes are effective immediately
//         for every DB-backed check (the member's proxy gate
//         catches up on their next sign-in).
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { authGuardResponse, countOwners, requireRole, requireUser, STUDIO_ROLES, type StudioRole } from "@/lib/auth";

export async function GET(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return authGuardResponse(guard)!;

  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, email: true, name: true, role: true, lastSeenAt: true, createdAt: true },
  });
  return Response.json({ users, selfId: guard.user.id });
}

export async function PATCH(req: Request) {
  const guard = await requireRole(req, "OWNER");
  if (!guard.ok) return authGuardResponse(guard)!;

  let body: { userId?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = String(body.userId ?? "");
  const role = String(body.role ?? "") as StudioRole;
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 });
  if (!STUDIO_ROLES.includes(role)) {
    return Response.json({ error: `role must be one of ${STUDIO_ROLES.join(", ")}` }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return Response.json({ error: "Member not found" }, { status: 404 });

  if (target.role === "OWNER" && role !== "OWNER") {
    const owners = await countOwners();
    if (owners <= 1) {
      return Response.json(
        { error: "Cannot demote the last OWNER - promote another member first" },
        { status: 409 },
      );
    }
  }

  const user = await db.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });

  return Response.json({
    user,
    note:
      target.id === guard.user.id
        ? `You set your own role to ${role}.`
        : `${user.name} is now ${role}. Their next sign-in picks it up everywhere.`,
  });
}

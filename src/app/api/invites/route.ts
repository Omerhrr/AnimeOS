export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// INVITE LINKS (Iteration 50: doors that hand out keys)
//
// The OWNER's keyring. An invite is a single-use code that
// carries the role the newcomer arrives with (EDITOR | VIEWER -
// ownership is earned in the roster, never invited) and,
// optionally, a crew seat on one production with a craft lens.
//
//   GET    - every invite, newest first, status computed
//   POST   - cut a new key {role, projectId?, craft?, expiresInDays?}
//   PATCH  - revoke an unused key {id, action: "revoke"}
//
// OWNER-only throughout: keys are cut by the studio's
// administrator and by nobody else (the OWNER bypass is
// unconditional; every other role is refused here outright).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isCraft } from "@/lib/access";

type InviteStatus = "ACTIVE" | "USED" | "EXPIRED" | "REVOKED";

function inviteStatus(row: { usedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null }): InviteStatus {
  if (row.revokedAt) return "REVOKED";
  if (row.usedAt) return "USED";
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return "EXPIRED";
  return "ACTIVE";
}

export async function GET(req: Request) {
  const guard = await requireRole(req, "OWNER");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const rows = await db.invite.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      project: { select: { id: true, title: true } },
      createdBy: { select: { name: true } },
      usedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    invites: rows.map((r) => ({
      id: r.id,
      code: r.code,
      role: r.role,
      projectId: r.projectId,
      projectTitle: r.project?.title ?? null,
      craft: r.craft,
      status: inviteStatus(r),
      createdByName: r.createdBy.name,
      usedBy: r.usedBy ? { id: r.usedBy.id, name: r.usedBy.name, email: r.usedBy.email } : null,
      usedAt: r.usedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireRole(req, "OWNER");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: { role?: unknown; projectId?: unknown; craft?: unknown; expiresInDays?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = String(body.role ?? "VIEWER").toUpperCase();
  if (role !== "EDITOR" && role !== "VIEWER") {
    return NextResponse.json(
      { error: "Invite role must be EDITOR or VIEWER - ownership is earned in the roster, never invited" },
      { status: 400 }
    );
  }

  const rawProject = String(body.projectId ?? "").trim();
  const craft = body.craft ? String(body.craft).toUpperCase() : null;
  let projectId: string | null = null;
  if (rawProject) {
    const project = await db.project.findUnique({ where: { id: rawProject }, select: { id: true, title: true } });
    if (!project) return NextResponse.json({ error: "Production not found" }, { status: 404 });
    projectId = project.id;
    if (craft && !isCraft(craft)) {
      return NextResponse.json(
        { error: `Craft must be one of DIRECTING, ART, VOICE, REVIEW` },
        { status: 400 }
      );
    }
  }

  let expiresAt: Date | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    const days = Math.round(Number(body.expiresInDays));
    if (Number.isFinite(days) && days > 0) {
      expiresAt = new Date(Date.now() + Math.min(365, days) * 24 * 3600 * 1000);
    } else if (days !== 0) {
      return NextResponse.json({ error: "expiresInDays must be a positive number of days" }, { status: 400 });
    }
  }

  const code = randomBytes(12).toString("base64url"); // 16-char URL-safe code
  const invite = await db.invite.create({
    data: {
      code,
      role,
      projectId,
      craft: projectId ? craft : null,
      createdById: guard.user.id,
      expiresAt,
    },
  });

  if (projectId) {
    await db.productionEvent.create({
      data: {
        projectId,
        actor: "USER",
        type: "PROJECT",
        summary: `${guard.user.name} cut a crew invite: ${role} seat${craft ? `, ${craft} lens` : ""} (code ${code.slice(0, 4)}…)`,
        payload: JSON.stringify({ inviteId: invite.id, role, craft, by: guard.user.name }),
      },
    }).catch(() => null);
  }

  return NextResponse.json(
    {
      id: invite.id,
      code: invite.code,
      role: invite.role,
      projectId: invite.projectId,
      craft: invite.craft,
      expiresAt: invite.expiresAt?.toISOString() ?? null,
      note: projectId
        ? `Invite cut - registers as ${role}${craft ? ` with a ${craft} lens` : ""} straight onto this production's crew.`
        : `Invite cut - registers as ${role}.`,
    },
    { status: 201 }
  );
}

export async function PATCH(req: Request) {
  const guard = await requireRole(req, "OWNER");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: { id?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  if (body.action !== "revoke") {
    return NextResponse.json({ error: "action must be 'revoke'" }, { status: 400 });
  }

  const invite = await db.invite.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: "This invite has already been redeemed - it cannot be revoked, only recorded" }, { status: 409 });
  if (invite.revokedAt) return NextResponse.json({ error: "Invite is already revoked" }, { status: 409 });

  await db.invite.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true, note: "Invite revoked - the code opens nothing now." });
}

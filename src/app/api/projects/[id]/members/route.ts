export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// PER-PROJECT CREW (Iteration 49: membership scoping)
//
// GET     - the crew of one production. OWNER: implicit (they are
//           on every crew), plus the roster candidates they can
//           add. Crew members: read-only view of their crew.
// POST    - OWNER only: add a member {userId, craft?}.
// PATCH   - OWNER: anyone's craft. A member may retune their OWN
//           craft lens (emphasis is personal, not a permission).
// DELETE  - OWNER only: remove a member ?userId=.
//
// Craft is the member's LENS on the production (which dashboard
// panels lead): DIRECTING | ART | VOICE | REVIEW. Writes inside
// the production stay gated by the global studio role.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { requireProjectAccess, isCraft } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const CRAFT_DEFAULT = "REVIEW";

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const project = await db.project.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!project) return NextResponse.json({ error: "Production not found" }, { status: 404 });

  // Owner sees every crew; a crew member sees their own crew;
  // strangers get the same 403 the rest of the surface speaks.
  const access = await requireProjectAccess(req, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const members = await db.projectMembership.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, lastSeenAt: true } },
    },
  });

  let candidates: Array<{ id: string; name: string; email: string; role: string }> = [];
  if (guard.user.role === "OWNER") {
    const all = await db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    });
    const onCrew = new Set(members.map((m) => m.user.id));
    candidates = all.filter((u) => !onCrew.has(u.id));
  }

  return NextResponse.json({
    projectId: project.id,
    title: project.title,
    viaOwner: access.viaOwner,
    selfId: guard.user.id,
    selfCraft: access.craft,
    members: members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.user.role,
      craft: m.craft,
      lastSeenAt: m.user.lastSeenAt,
      joinedAt: m.createdAt,
    })),
    candidates,
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireRole(req, "OWNER");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const userId = String(body.userId ?? "");
  const craft = body.craft === undefined ? CRAFT_DEFAULT : String(body.craft);
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!isCraft(craft)) return NextResponse.json({ error: "craft must be one of DIRECTING, ART, VOICE, REVIEW" }, { status: 400 });

  const project = await db.project.findUnique({ where: { id }, select: { title: true } });
  if (!project) return NextResponse.json({ error: "Production not found" }, { status: 404 });
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
  if (!user) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const membership = await db.projectMembership.upsert({
    where: { projectId_userId: { projectId: id, userId } },
    create: { projectId: id, userId, craft },
    update: { craft },
    include: { user: { select: { name: true } } },
  });

  await db.productionEvent.create({
    data: {
      projectId: id,
      actor: "USER",
      type: "PROJECT",
      summary: `${user.name} joined the crew of '${project.title}' (${craft} lens) - added by ${guard.user.name}`,
      payload: JSON.stringify({ userId, craft, by: guard.user.name }),
    },
  });

  return NextResponse.json({ id: membership.id, userId, craft, note: `${user.name} is on the crew (${craft}).` });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const userId = String(body.userId ?? "");
  const craft = String(body.craft ?? "");
  if (!userId || !craft) return NextResponse.json({ error: "userId and craft are required" }, { status: 400 });
  if (!isCraft(craft)) return NextResponse.json({ error: "craft must be one of DIRECTING, ART, VOICE, REVIEW" }, { status: 400 });

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    include: { user: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "That member is not on this crew" }, { status: 404 });

  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // OWNER retunes anyone; a member may retune their own lens.
  const isSelf = guard.user.id === userId;
  if (guard.user.role !== "OWNER" && !isSelf) {
    return NextResponse.json({ error: "Only an OWNER can change another member's craft" }, { status: 403 });
  }

  const updated = await db.projectMembership.update({
    where: { id: membership.id },
    data: { craft },
  });

  await db.productionEvent.create({
    data: {
      projectId: id,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: isSelf
        ? `${guard.user.name} retuned their own lens on this production to ${craft}`
        : `${membership.user.name}'s lens retuned to ${craft} by ${guard.user.name}`,
      payload: JSON.stringify({ userId, craft, by: guard.user.name }),
    },
  });

  return NextResponse.json({ id: updated.id, craft: updated.craft, note: `Lens set to ${craft}.` });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await requireRole(req, "OWNER");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const membership = await db.projectMembership.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    include: { user: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "That member is not on this crew" }, { status: 404 });

  await db.projectMembership.delete({ where: { id: membership.id } });

  await db.productionEvent.create({
    data: {
      projectId: id,
      actor: "USER",
      type: "PROJECT",
      summary: `${membership.user.name} left the crew of this production - removed by ${guard.user.name}`,
      payload: JSON.stringify({ userId, by: guard.user.name }),
    },
  });

  return NextResponse.json({ ok: true, note: `${membership.user.name} is off the crew.` });
}

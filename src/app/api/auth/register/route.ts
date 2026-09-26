// ─────────────────────────────────────────────────────────────
// STUDIO REGISTRATION
// The FIRST account ever registered becomes OWNER automatically.
// Everyone after that registers as VIEWER and waits for an OWNER
// to promote them from the roster panel (honest, safe default -
// an open signup can never write anything) - UNLESS they arrive
// through an invite: an OWNER-cut key that carries its role
// (EDITOR | VIEWER) and, optionally, a crew seat on one
// production. The key is spent exactly once, in the same
// transaction that seats the member; revoked, expired and
// already-used keys open nothing.
// ─────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  let body: { email?: unknown; name?: unknown; password?: unknown; invite?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");
  const inviteCode = String(body.invite ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  if (name.length < 1 || name.length > 60) {
    return Response.json({ error: "Name must be 1-60 characters" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "That email is already registered" }, { status: 409 });
  }

  // Resolve the invite BEFORE touching the user table so a bad key
  // fails fast and is never consumed. A key must be: real, not
  // revoked, not expired, not already redeemed.
  let invite: {
    id: string;
    role: string;
    projectId: string | null;
    craft: string | null;
  } | null = null;
  if (inviteCode) {
    const row = await db.invite.findUnique({
      where: { code: inviteCode },
      select: { id: true, role: true, projectId: true, craft: true, usedAt: true, expiresAt: true, revokedAt: true },
    });
    if (!row) {
      return Response.json({ error: "This invite doesn't exist - check the link with your OWNER" }, { status: 404 });
    }
    if (row.revokedAt) {
      return Response.json({ error: "This invite was revoked by the studio OWNER" }, { status: 410 });
    }
    if (row.usedAt) {
      return Response.json({ error: "This invite has already been used - invites are single-use" }, { status: 410 });
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      return Response.json({ error: "This invite has expired - ask your OWNER for a fresh one" }, { status: 410 });
    }
    invite = { id: row.id, role: row.role, projectId: row.projectId, craft: row.craft };
  }

  const userCount = await db.user.count();
  // The first account is the studio OWNER no matter what it arrives
  // with - there is nobody above it to invite it.
  const isFirstAccount = userCount === 0;
  const role = isFirstAccount ? "OWNER" : (invite?.role ?? "VIEWER");
  const passwordHash = await bcrypt.hash(password, 10);

  // User + crew seat + spent key land together or not at all.
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name, passwordHash, role },
      select: { id: true, email: true, name: true, role: true },
    });
    if (invite && invite.projectId) {
      await tx.projectMembership.create({
        data: {
          projectId: invite.projectId,
          userId: created.id,
          craft: invite.craft ?? "REVIEW",
        },
      });
    }
    if (invite) {
      await tx.invite.update({
        where: { id: invite.id },
        data: { usedById: created.id, usedAt: new Date() },
      });
    }
    return created;
  });

  let note: string;
  if (isFirstAccount) {
    note = "First account - you are the studio OWNER.";
  } else if (invite && invite.projectId) {
    note = `Registered as ${role} with a seat on your production's crew${invite.craft ? ` (${invite.craft} lens)` : ""} - welcome aboard.`;
  } else if (invite) {
    note = `Registered as ${role} through your invite - welcome aboard.`;
  } else {
    note = "Registered as VIEWER (read-only) until an OWNER promotes you.";
  }

  return Response.json({ user, note }, { status: 201 });
}

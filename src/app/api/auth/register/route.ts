// ─────────────────────────────────────────────────────────────
// STUDIO REGISTRATION
// The FIRST account ever registered becomes OWNER automatically.
// Everyone after that registers as VIEWER and waits for an OWNER
// to promote them from the roster panel (honest, safe default -
// an open signup can never write anything).
// ─────────────────────────────────────────────────────────────

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  let body: { email?: unknown; name?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");

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

  const userCount = await db.user.count();
  const role = userCount === 0 ? "OWNER" : "VIEWER";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.create({
    data: { email, name, passwordHash, role },
    select: { id: true, email: true, name: true, role: true },
  });

  return Response.json({
    user,
    note:
      role === "OWNER"
        ? "First account - you are the studio OWNER."
        : "Registered as VIEWER (read-only) until an OWNER promotes you.",
  }, { status: 201 });
}

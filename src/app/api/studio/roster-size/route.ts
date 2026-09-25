// ─────────────────────────────────────────────────────────────
// ROSTER SIZE (public, count only)
// The sign-in page uses it to show the "first account becomes
// OWNER" hint. Deliberately returns a COUNT - never names or
// emails, which stay behind the session gate.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";

export async function GET() {
  const users = await db.user.count();
  return Response.json({ users });
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (body.role !== undefined) data.role = body.role ? String(body.role).trim().slice(0, 120) : null;
  if (body.color !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(body.color))) data.color = String(body.color);
  try {
    const artist = await db.artist.update({ where: { id }, data });
    return NextResponse.json({ id: artist.id });
  } catch {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  // Shots fall back to unassigned (FK is SetNull).
  await db.artist.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

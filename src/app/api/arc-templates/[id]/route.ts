export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseArcTemplateSegments } from "@/lib/comic/arc-templates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim().slice(0, 300) : null;
  if (body.segments !== undefined) {
    const segments = parseArcTemplateSegments(body.segments);
    if (!segments) {
      return NextResponse.json(
        { error: "segments must be a non-empty list of {frac, kind: 'auto' | 'state'} with positive fracs" },
        { status: 400 },
      );
    }
    data.segments = JSON.stringify(segments);
  }
  try {
    const row = await db.arcTemplate.update({ where: { id }, data });
    return NextResponse.json({ id: row.id });
  } catch {
    return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await db.arcTemplate.delete({ where: { id } }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  await db.productionEvent.create({
    data: {
      projectId: row.projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `Arc template '${row.name}' deleted`,
    },
  });
  return NextResponse.json({ ok: true });
}

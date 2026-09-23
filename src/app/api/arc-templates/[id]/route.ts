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
  if (body.scope !== undefined) {
    const scope = String(body.scope).trim().toUpperCase();
    if (scope === "STUDIO") {
      // promote to the studio library: detach from the production,
      // dedupe against the shared rows (NULLs skip the unique index)
      const want = String(data.name ?? "").trim().toLowerCase();
      const row = await db.arcTemplate.findUnique({ where: { id } });
      if (!row) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
      const name = typeof data.name === "string" ? data.name : row.name;
      const studioRows = await db.arcTemplate.findMany({
        where: { scope: "STUDIO", id: { not: id } },
        select: { name: true },
      });
      if (studioRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
        return NextResponse.json({ error: `A template named '${name}' already exists in the studio library` }, { status: 409 });
      }
      data.scope = "STUDIO";
      data.projectId = null;
    } else if (scope === "PROJECT") {
      // demote to one production: needs the target production id
      const projectId = String(body.projectId ?? "");
      if (!projectId) return NextResponse.json({ error: "projectId required to move a template into a production" }, { status: 400 });
      data.scope = "PROJECT";
      data.projectId = projectId;
    } else {
      return NextResponse.json({ error: "scope must be PROJECT or STUDIO" }, { status: 400 });
    }
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
      // studio rows have no owning production; the event still lands (actor USER)
      projectId: row.projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `Arc template '${row.name}' deleted${row.scope === "STUDIO" ? " from the studio library" : ""}`,
    },
  });
  return NextResponse.json({ ok: true });
}

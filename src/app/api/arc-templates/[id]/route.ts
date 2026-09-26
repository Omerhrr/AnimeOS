export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { parseArcTemplateSegments } from "@/lib/comic/arc-templates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  // Scope the patch: PROJECT rows need that production's crew;
  // STUDIO-library rows stay studio-level (role-gated upstream).
  const existingRow = await db.arcTemplate.findUnique({ where: { id }, select: { projectId: true } });
  if (!existingRow) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  if (existingRow.projectId) {
    const access = await requireProjectAccess(req, existingRow.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
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
  // Shape versioning: when the PATCH actually moves the shape, the
  // replaced one is archived into `versions` (newest-first) with a
  // migration note and the version bumps - earlier applies stay
  // explainable against the shape they were stamped with. A PATCH
  // that re-sends the same shape is a no-op (no bump, no history).
  let bumped = false;
  if (data.segments !== undefined) {
    const row = await db.arcTemplate.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
    const nextShape = String(data.segments);
    if (nextShape !== row.segments) {
      let history: Array<{ version: number; segments: unknown; note: string; at: string }> = [];
      try {
        const parsed = JSON.parse(row.versions);
        if (Array.isArray(parsed)) history = parsed;
      } catch {
        history = [];
      }
      const note = body.note ? String(body.note).trim().slice(0, 200) : "";
      let oldSegments: unknown = row.segments;
      try {
        oldSegments = JSON.parse(row.segments); // history stores the SHAPE, not its JSON encoding
      } catch {
        oldSegments = [];
      }
      history.unshift({
        version: row.version,
        segments: oldSegments,
        note: note || `shape moved on update (v${row.version} -> v${row.version + 1})`,
        at: new Date().toISOString(),
      });
      data.versions = JSON.stringify(history);
      data.version = row.version + 1;
      bumped = true;
    }
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
    return NextResponse.json({ id: row.id, version: row.version, bumped });
  } catch {
    return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const existingRow = await db.arcTemplate.findUnique({ where: { id }, select: { projectId: true } });
  if (!existingRow) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  if (existingRow.projectId) {
    const access = await requireProjectAccess(req, existingRow.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
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

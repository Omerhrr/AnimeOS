export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/arc-templates/:id/use - record ONE application of a saved
// template. Called by the Arc templates dialog right after an apply
// that stamped lines (DSH applies increment inside the tool core
// itself). Only applies that actually MOVED lines count, so the
// per-scope usage number stays an honest "this scope really uses
// this shape" signal.
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const templateRow = await db.arcTemplate.findUnique({ where: { id }, select: { projectId: true } });
  if (!templateRow) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  if (templateRow.projectId) {
    const access = await requireProjectAccess(req, templateRow.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const row = await db.arcTemplate.update({
    where: { id },
    data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
  }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  return NextResponse.json({ id: row.id, usageCount: row.usageCount, lastUsedAt: row.lastUsedAt });
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/arc-templates/:id/use - record ONE application of a saved
// template. Called by the Arc templates dialog right after an apply
// that stamped lines (DSH applies increment inside the tool core
// itself). Only applies that actually MOVED lines count, so the
// per-scope usage number stays an honest "this scope really uses
// this shape" signal.
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await db.arcTemplate.update({
    where: { id },
    data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
  }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Arc template not found" }, { status: 404 });
  return NextResponse.json({ id: row.id, usageCount: row.usageCount, lastUsedAt: row.lastUsedAt });
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const CUE_KINDS = new Set(["SFX", "VOICE", "BGM", "AMBIENCE"]);

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const cue = await db.audioCue.findUnique({ where: { id }, include: { shot: true } });
  if (!cue) return NextResponse.json({ error: "Cue not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.kind !== undefined && CUE_KINDS.has(String(body.kind))) data.kind = String(body.kind);
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 120);
    if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
    data.label = label;
  }
  if (body.volume !== undefined && Number.isFinite(Number(body.volume))) {
    data.volume = Math.min(1, Math.max(0.05, Number(body.volume)));
  }
  const timelineMs = Math.max(1, Math.round((cue.shot.duration ?? 4) * 1000));
  if (body.startMs !== undefined) {
    const n = Math.round(Number(body.startMs));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "startMs must be a number" }, { status: 400 });
    data.startMs = Math.min(timelineMs - 50, Math.max(0, n));
  }
  if (body.durationMs !== undefined) {
    const n = Math.round(Number(body.durationMs));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "durationMs must be a number" }, { status: 400 });
    data.durationMs = Math.min(Math.max(timelineMs, 50), Math.max(50, n));
  }
  const updated = await db.audioCue.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.audioCue.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

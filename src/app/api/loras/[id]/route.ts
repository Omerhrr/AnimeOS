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
  if (body.triggerPhrase !== undefined) {
    const trigger = String(body.triggerPhrase).trim().slice(0, 300);
    if (!trigger) return NextResponse.json({ error: "triggerPhrase cannot be empty" }, { status: 400 });
    data.triggerPhrase = trigger;
  }
  if (body.weight !== undefined) {
    const w = Number(body.weight);
    if (!Number.isFinite(w)) return NextResponse.json({ error: "weight must be a number" }, { status: 400 });
    data.weight = Math.min(1.2, Math.max(0.1, w));
  }
  if (body.baseModel !== undefined) data.baseModel = body.baseModel ? String(body.baseModel).trim().slice(0, 60) : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim().slice(0, 300) : null;
  try {
    const lora = await db.styleLora.update({ where: { id }, data });
    return NextResponse.json({ id: lora.id });
  } catch {
    return NextResponse.json({ error: "LoRA not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  // Detach the adapter from any shots that use it and clear the
  // per-shot strength override (the FK itself is SetNull).
  await db.shot.updateMany({ where: { loraId: id }, data: { loraId: null, loraStrength: null } });
  await db.styleLora.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

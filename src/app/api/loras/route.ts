export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Style LoRA registry for a production.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const loras = await db.styleLora.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { shots: true } } },
  });
  return NextResponse.json(loras);
}

export async function POST(req: Request) {
  const body = await req.json();
  const projectId = body.projectId ? String(body.projectId) : "";
  const name = String(body.name ?? "").trim().slice(0, 80);
  const triggerPhrase = String(body.triggerPhrase ?? "").trim().slice(0, 300);
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!name || !triggerPhrase) {
    return NextResponse.json({ error: "name and triggerPhrase are required" }, { status: 400 });
  }
  const exists = await db.styleLora.findUnique({ where: { projectId_name: { projectId, name } } });
  if (exists) return NextResponse.json({ error: `A LoRA named '${name}' already exists in this production` }, { status: 409 });
  const weightNum = Number(body.weight);
  const lora = await db.styleLora.create({
    data: {
      projectId,
      name,
      triggerPhrase,
      weight: Number.isFinite(weightNum) ? Math.min(1.2, Math.max(0.1, weightNum)) : 0.8,
      baseModel: body.baseModel ? String(body.baseModel).trim().slice(0, 60) : null,
      notes: body.notes ? String(body.notes).trim().slice(0, 300) : null,
    },
  });
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `Style LoRA '${lora.name}' registered (trigger: ${lora.triggerPhrase})`,
    },
  });
  return NextResponse.json({ id: lora.id });
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const ch = await db.character.create({
    data: {
      projectId: String(body.projectId),
      name: String(body.name ?? "Unnamed"),
      role: body.role ? String(body.role) : null,
      age: body.age ? String(body.age) : null,
      personality: body.personality ? String(body.personality) : null,
      backstory: body.backstory ? String(body.backstory) : null,
      appearance: body.appearance ? JSON.stringify({ notes: String(body.appearance) }) : null,
      abilities: body.abilities ? JSON.stringify(body.abilities) : null,
      animationLib: JSON.stringify(body.animationLib ?? ["idle", "walk", "run"]),
      derivativeType: body.derivativeType ? String(body.derivativeType) : null,
      parentId: body.parentId ? String(body.parentId) : null,
    },
  });
  await db.productionEvent.create({
    data: { projectId: body.projectId, actor: "USER", type: "TOOL_CALL", summary: `character.create → ${ch.name}` },
  });
  return NextResponse.json({ id: ch.id });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, ...rest } = body;
  const data: Record<string, unknown> = {};
  for (const key of ["name", "role", "age", "personality", "backstory"]) {
    if (rest[key] !== undefined) data[key] = String(rest[key]);
  }
  if (rest.abilities !== undefined) data.abilities = JSON.stringify(rest.abilities);
  const ch = await db.character.update({ where: { id: String(id) }, data });
  return NextResponse.json({ id: ch.id });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.character.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

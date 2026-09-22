export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const maxNum = await db.shot.aggregate({ where: { sceneId: String(body.sceneId) }, _max: { number: true } });
  const shot = await db.shot.create({
    data: {
      sceneId: String(body.sceneId),
      number: Number(body.number ?? (maxNum._max.number ?? 0) + 1),
      description: String(body.description ?? "Untitled shot"),
      shotType: String(body.shotType ?? "MEDIUM"),
      lens: body.lens ? String(body.lens) : null,
      movement: body.movement ? String(body.movement) : null,
      duration: Number(body.duration ?? 4),
      lighting: body.lighting ? String(body.lighting) : null,
    },
  });
  return NextResponse.json({ id: shot.id });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, ...rest } = body;
  const data: Record<string, unknown> = {};
  for (const key of ["description", "shotType", "lens", "movement", "lighting", "status"]) {
    if (rest[key] !== undefined) data[key] = String(rest[key]);
  }
  if (rest.duration !== undefined) data.duration = Number(rest.duration);
  if (rest.number !== undefined) data.number = Number(rest.number);
  if (rest.dialogue !== undefined) {
    if (rest.dialogue === null || rest.dialogue === "") {
      data.dialogue = null;
    } else {
      try {
        const parsed = JSON.parse(String(rest.dialogue));
        if (!Array.isArray(parsed)) throw new Error("dialogue must be an array");
        if (parsed.length > 8) throw new Error("at most 8 lines per shot");
        for (const line of parsed) {
          if (typeof line !== "object" || line === null || typeof line.text !== "string" || !line.text.trim()) {
            throw new Error("each line needs non-empty text");
          }
        }
        data.dialogue = String(rest.dialogue);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid dialogue JSON";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
  }
  if (rest.artworkUrl !== undefined) data.artworkUrl = rest.artworkUrl ? String(rest.artworkUrl) : null;
  const shot = await db.shot.update({ where: { id: String(id) }, data });
  return NextResponse.json({ id: shot.id });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.shot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

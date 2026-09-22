export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Artist roster for a production (multi-artist shot assignment).

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const artists = await db.artist.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { shots: true } } },
  });
  return NextResponse.json(artists);
}

export async function POST(req: Request) {
  const body = await req.json();
  const projectId = body.projectId ? String(body.projectId) : "";
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const exists = await db.artist.findFirst({ where: { projectId, name } });
  if (exists) return NextResponse.json({ error: `Artist '${name}' is already on the roster` }, { status: 409 });
  const artist = await db.artist.create({
    data: {
      projectId,
      name,
      role: body.role ? String(body.role).trim().slice(0, 120) : null,
      color: /^#[0-9a-fA-F]{6}$/.test(String(body.color ?? "")) ? String(body.color) : "#7c9cff",
    },
  });
  return NextResponse.json({ id: artist.id });
}

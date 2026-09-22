export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const events = await db.continuityEvent.findMany({
    where: { projectId },
    orderBy: [{ episodeNumber: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(events);
}

export async function POST(req: Request) {
  const body = await req.json();
  const ev = await db.continuityEvent.create({
    data: {
      projectId: String(body.projectId),
      entityType: String(body.entityType ?? "PROP"),
      entityName: String(body.entityName ?? "Unknown"),
      kind: String(body.kind ?? "CUSTOM"),
      episodeNumber: body.episodeNumber ? Number(body.episodeNumber) : null,
      description: String(body.description ?? ""),
      severity: String(body.severity ?? "INFO"),
    },
  });
  await db.productionEvent.create({
    data: { projectId: String(body.projectId), actor: "USER", type: "CONTINUITY", summary: `Continuity watch: ${ev.entityName} - ${ev.kind}` },
  });
  return NextResponse.json({ id: ev.id });
}

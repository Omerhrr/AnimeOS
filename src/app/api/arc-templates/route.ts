export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseArcTemplateSegments } from "@/lib/comic/arc-templates";

// User-defined arc templates saved per production: reusable beat
// shapes next to the built-ins (possession spread, full takeover,
// recovery arc). Segments are stored as JSON [{frac, kind}].

function safeSegments(json: string): Array<{ frac: number; kind: "auto" | "state" }> {
  try {
    return parseArcTemplateSegments(JSON.parse(json)) ?? [];
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const rows = await db.arcTemplate.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(
    rows.map((r) => ({ id: r.id, name: r.name, description: r.description, segments: safeSegments(r.segments) })),
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const projectId = String(body.projectId ?? "");
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const segments = parseArcTemplateSegments(body.segments);
  if (!segments) {
    return NextResponse.json(
      { error: "segments must be a non-empty list of {frac, kind: 'auto' | 'state'} with positive fracs" },
      { status: 400 },
    );
  }
  const exists = await db.arcTemplate.findUnique({ where: { projectId_name: { projectId, name } } });
  if (exists) return NextResponse.json({ error: `A template named '${name}' already exists in this production` }, { status: 409 });
  const row = await db.arcTemplate.create({
    data: {
      projectId,
      name,
      description: body.description ? String(body.description).trim().slice(0, 300) : null,
      segments: JSON.stringify(segments),
    },
  });
  await db.productionEvent.create({
    data: {
      projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `Arc template '${row.name}' saved (shape: ${segments.map((s) => s.kind).join(" -> ")})`,
    },
  });
  return NextResponse.json({ id: row.id });
}

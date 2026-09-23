export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseArcTemplateSegments } from "@/lib/comic/arc-templates";

// Arc templates with two scopes: PROJECT rows belong to one
// production (that series' own beat vocabulary), STUDIO rows form
// the studio library (projectId null) and are shared with EVERY
// production. Segments are stored as JSON [{frac, kind}].

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
  // this production's rows PLUS the studio library - every caller
  // sees the shared shapes regardless of which show they opened
  const rows = await db.arcTemplate.findMany({
    where: { OR: [{ projectId }, { scope: "STUDIO" }] },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      segments: safeSegments(r.segments),
      scope: r.scope,
      projectId: r.projectId,
    })),
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const projectId = String(body.projectId ?? "");
  const scope = String(body.scope ?? "PROJECT").trim().toUpperCase() === "STUDIO" ? "STUDIO" : "PROJECT";
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
  if (scope === "STUDIO") {
    // studio rows bypass the (projectId, name) unique index (SQLite
    // treats NULLs as distinct), so dedupe here across the library
    const studioRows = await db.arcTemplate.findMany({ where: { scope: "STUDIO" }, select: { name: true } });
    if (studioRows.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: `A template named '${name}' already exists in the studio library` }, { status: 409 });
    }
  } else {
    const exists = await db.arcTemplate.findUnique({ where: { projectId_name: { projectId, name } } });
    if (exists) return NextResponse.json({ error: `A template named '${name}' already exists in this production` }, { status: 409 });
  }
  const row = await db.arcTemplate.create({
    data: {
      // studio rows carry no projectId: they outlive any production
      projectId: scope === "STUDIO" ? null : projectId,
      scope,
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
      summary: `Arc template '${row.name}' saved${scope === "STUDIO" ? " in the studio library (shared across productions)" : ""} (shape: ${segments.map((s) => s.kind).join(" -> ")})`,
    },
  });
  return NextResponse.json({ id: row.id });
}

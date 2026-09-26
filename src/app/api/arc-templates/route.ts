export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
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

type VersionEntry = { version: number; segments: Array<{ frac: number; kind: "auto" | "state" }>; note: string; at: string };

function safeVersions(json: string): VersionEntry[] {
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((e) => e && typeof e === "object" && Number.isFinite(Number(e.version)) && Array.isArray(e.segments))
      .map((e) => {
        // entries carry the shape as an array; tolerate a raw JSON string encoding
        let segments = e.segments;
        if (typeof segments === "string") {
          try { segments = JSON.parse(segments); } catch { segments = []; }
        }
        return {
          version: Number(e.version),
          segments: safeSegments(JSON.stringify(segments)),
          note: typeof e.note === "string" ? e.note : "",
          at: typeof e.at === "string" ? e.at : "",
        };
      });
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  // this production's rows PLUS the studio library - every crew
  // member sees the shared shapes regardless of which show they opened
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
      version: r.version,
      versions: safeVersions(r.versions),
      // per-scope usage: how many line-stamping applies this shape took
      usageCount: r.usageCount,
      lastUsedAt: r.lastUsedAt,
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
  const access = await requireProjectAccess(req, projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
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

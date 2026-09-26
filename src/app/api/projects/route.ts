export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { sessionUser, requireRole } from "@/lib/auth";
import { visibleProjectIds } from "@/lib/access";

/** The production list IS the slate: an OWNER sees every production
 *  (implicit, global access - no membership row can ever restrict
 *  them); everyone else sees exactly the productions whose crew
 *  they are on. */
export async function GET(req: Request) {
  await ensureSeed();
  const user = await sessionUser(req, { touch: true });
  if (!user) return NextResponse.json({ error: "Sign in to use the studio" }, { status: 401 });
  const visibleIds = await visibleProjectIds(user);
  const projects = await db.project.findMany({
    where: visibleIds === null ? {} : { id: { in: visibleIds } },
    include: {
      seasons: { include: { episodes: true } },
      characters: true,
      renderJobs: { orderBy: { createdAt: "desc" } },
      memberships: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(
    projects.map((p) => ({
      id: p.id,
      title: p.title,
      logline: p.logline,
      format: p.format,
      animationType: p.animationType,
      visualStyle: p.visualStyle,
      originalLanguage: p.originalLanguage,
      subtitleLanguages: JSON.parse(p.subtitleLanguages || "[]"),
      fps: p.fps,
      resolution: p.resolution,
      status: p.status,
      episodeCount: p.seasons.reduce((n, s) => n + s.episodes.length, 0),
      characterCount: p.characters.length,
      renderCount: p.renderJobs.length,
      crewCount: p.memberships.length + (user.role === "OWNER" ? 1 : 0),
      onCrew: visibleIds !== null,
      createdAt: p.createdAt,
    }))
  );
}

export async function POST(req: Request) {
  // Creating is a direction act: DB-fresh EDITOR+ (the proxy's JWT
  // gate already refuses VIEWERs; this re-reads the row so a
  // demotion lands on the very next call).
  const guard = await requireRole(req, "EDITOR");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const project = await db.project.create({
    data: {
      title: String(body.title ?? "Untitled Production"),
      logline: body.logline ? String(body.logline) : null,
      format: String(body.format ?? "SERIES"),
      animationType: String(body.animationType ?? "3D"),
      visualStyle: String(body.visualStyle ?? "DONGHUA"),
      originalLanguage: String(body.originalLanguage ?? "zh-CN"),
      subtitleLanguages: JSON.stringify(Array.isArray(body.subtitleLanguages) ? body.subtitleLanguages : []),
      fps: Number(body.fps ?? 24),
      resolution: String(body.resolution ?? "1920x1080"),
    },
  });
  await db.season.create({ data: { projectId: project.id, number: 1, title: "Season 1" } });
  // The creator leads their own production: an immediate membership
  // (OWNERs see everything anyway; EDITOR/VIEWER creators need the
  // row to see what they just made).
  await db.projectMembership.create({
    data: { projectId: project.id, userId: guard.user.id, craft: "DIRECTING" },
  });
  await db.productionEvent.create({
    data: { projectId: project.id, actor: "USER", type: "PROJECT", summary: `Production '${project.title}' created (${project.visualStyle}/${project.animationType}) by ${guard.user.name}` },
  });
  return NextResponse.json({ id: project.id });
}

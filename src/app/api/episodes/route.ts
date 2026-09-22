export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Create an episode (inside season, season auto-created if needed). */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const projectId = String(body.projectId ?? "");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const seasonNumber = Number(body.seasonNumber ?? 1);
  let season = await db.season.findFirst({ where: { projectId, number: seasonNumber } });
  if (!season) {
    season = await db.season.create({ data: { projectId, number: seasonNumber, title: `Season ${seasonNumber}` } });
  }
  const ep = await db.episode.create({
    data: {
      seasonId: season.id,
      number: Number(body.number ?? 1),
      title: String(body.title ?? `Episode ${body.number ?? 1}`),
      synopsis: body.synopsis ? String(body.synopsis) : null,
    },
  });
  return NextResponse.json({ id: ep.id });
}

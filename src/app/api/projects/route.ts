export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

export async function GET() {
  await ensureSeed();
  const projects = await db.project.findMany({
    include: {
      seasons: { include: { episodes: true } },
      characters: true,
      renderJobs: { orderBy: { createdAt: "desc" } },
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
      createdAt: p.createdAt,
    }))
  );
}

export async function POST(req: Request) {
  const body = await req.json();
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
  await db.productionEvent.create({
    data: { projectId: project.id, actor: "USER", type: "PROJECT", summary: `Production '${project.title}' created (${project.visualStyle}/${project.animationType})` },
  });
  return NextResponse.json({ id: project.id });
}

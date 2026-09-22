export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Create an episode (inside season, season auto-created if needed). */
export async function POST(req: Request) {
  const body = await req.json();
  const seasonNumber = Number(body.seasonNumber ?? 1);
  let season = await db.season.findFirst({ where: { projectId: String(body.projectId), number: seasonNumber } });
  if (!season) {
    season = await db.season.create({ data: { projectId: String(body.projectId), number: seasonNumber, title: `Season ${seasonNumber}` } });
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

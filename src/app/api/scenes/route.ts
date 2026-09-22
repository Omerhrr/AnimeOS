export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkSceneContinuity, checkSceneCapabilities } from "@/lib/continuity";

/** Scene detail with capability + continuity analysis (§26/§27). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const scene = await db.scene.findUnique({
    where: { id },
    include: { shots: { orderBy: { number: "asc" } }, environment: true },
  });
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const projectId = (await db.scene.findUnique({ where: { id }, include: { episode: { include: { season: true } } } }))!.episode.season.projectId;
  const [continuity, capabilities] = await Promise.all([
    checkSceneContinuity(projectId, id),
    checkSceneCapabilities(projectId, id),
  ]);
  return NextResponse.json({ scene, continuity: continuity.conflicts, capabilities });
}

export async function POST(req: Request) {
  const body = await req.json();
  const maxNum = await db.scene.aggregate({ where: { episodeId: String(body.episodeId) }, _max: { number: true } });
  const scene = await db.scene.create({
    data: {
      episodeId: String(body.episodeId),
      number: Number(body.number ?? (maxNum._max.number ?? 0) + 1),
      title: String(body.title ?? `Scene ${(maxNum._max.number ?? 0) + 1}`),
      description: body.description ? String(body.description) : null,
      environmentId: body.environmentId ? String(body.environmentId) : null,
      timeOfDay: body.timeOfDay ? String(body.timeOfDay) : null,
      weather: body.weather ? String(body.weather) : null,
    },
  });
  return NextResponse.json({ id: scene.id });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, ...rest } = body;
  const data: Record<string, unknown> = {};
  for (const key of ["title", "description", "timeOfDay", "weather", "status"]) {
    if (rest[key] !== undefined) data[key] = String(rest[key]);
  }
  if (rest.environmentId !== undefined) data.environmentId = rest.environmentId ? String(rest.environmentId) : null;
  for (const key of ["fogDensity", "lightningIntensity", "energyIntensity", "cameraDistance", "rimLightIntensity"]) {
    if (rest[key] !== undefined) data[key] = Number(rest[key]);
  }
  const scene = await db.scene.update({ where: { id: String(id) }, data });
  return NextResponse.json({ id: scene.id });
}

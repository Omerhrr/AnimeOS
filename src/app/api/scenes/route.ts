export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkSceneContinuity, checkSceneCapabilities } from "@/lib/continuity";
import { characterDesignDna, environmentDna } from "@/lib/animation/design";
import { detectCast } from "@/lib/ai/art";

/** Scene detail with capability + continuity analysis (§26/§27) and
 * the scene's DESIGN DNA (§37.1): the cast's compiled character DNA
 * and the environment's compiled set DNA, the exact structures the
 * Blender worker renders from - so the browser preview and the 3D
 * renders agree on the production's look. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const scene = await db.scene.findUnique({
    where: { id },
    include: { shots: { orderBy: { number: "asc" } }, environment: true },
  });
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const withEpisode = (await db.scene.findUnique({ where: { id }, include: { episode: { include: { season: true } } } }))!;
  const projectId = withEpisode.episode.season.projectId;
  const [continuity, capabilities] = await Promise.all([
    checkSceneContinuity(projectId, id),
    checkSceneCapabilities(projectId, id),
  ]);

  // DESIGN DNA: cast detected across the scene's shot descriptions
  // (any mention casts them in this scene), environment compiled with
  // the scene-level time-of-day / weather overrides applied.
  const characterRows = await db.character.findMany({ where: { projectId }, include: { states: true } });
  const descriptions = scene.shots.map((s) => s.description).join(" ; ");
  const episodeNumber = withEpisode.episode.number;
  const cast = detectCast(characterRows, descriptions)
    .slice(0, 3)
    .map((c) => {
      const st = [...c.states]
        .filter((s) => s.episodeNumber === null || s.episodeNumber <= episodeNumber)
        .sort((a, b) => (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())[0];
      return characterDesignDna({
        name: c.name,
        role: c.role,
        appearance: c.appearance,
        modelSheetPrompt: c.modelSheetPrompt,
        stateClothing: st?.clothing ?? null,
        stateWeapon: st?.weapon ?? null,
      });
    });
  const env = scene.environment
    ? environmentDna({
        name: scene.environment.name,
        description: scene.environment.description,
        atmosphere: scene.environment.atmosphere,
        timeOfDay: scene.environment.timeOfDay,
        weather: scene.environment.weather,
        sceneTimeOfDay: scene.timeOfDay,
        sceneWeather: scene.weather,
      })
    : null;

  return NextResponse.json({ scene, continuity: continuity.conflicts, capabilities, design: { cast, environment: env } });
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

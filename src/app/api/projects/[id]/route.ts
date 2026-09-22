export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Full production universe - the persistent animated state (§47). */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      seasons: {
        orderBy: { number: "asc" },
        include: {
          episodes: {
            orderBy: { number: "asc" },
            include: {
              scenes: {
                orderBy: { number: "asc" },
                include: {
                  environment: true,
                  shots: {
                    orderBy: { number: "asc" },
                    include: {
                      lora: true,
                      artist: true,
                      audioCues: { orderBy: { startMs: "asc" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      characters: {
        orderBy: { createdAt: "asc" },
        include: {
          states: { orderBy: { episodeNumber: "asc" } },
          relationsFrom: { include: { to: true } },
          relationsTo: { include: { from: true } },
          derivatives: true,
        },
      },
      environments: { orderBy: { createdAt: "asc" } },
      loras: { orderBy: { createdAt: "asc" }, include: { _count: { select: { shots: true } } } },
      artists: { orderBy: { createdAt: "asc" }, include: { _count: { select: { shots: true } } } },
      assets: { orderBy: { createdAt: "asc" }, include: { versions: { orderBy: { version: "asc" } } } },
      terminology: { orderBy: { createdAt: "asc" } },
      continuityEvents: { orderBy: { createdAt: "desc" } },
      productionEvents: { orderBy: { createdAt: "desc" }, take: 60 },
      dshMessages: { orderBy: { createdAt: "asc" } },
      renderJobs: { orderBy: { createdAt: "desc" }, include: { shot: { include: { scene: true } }, evaluation: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const key of ["title", "logline", "format", "animationType", "visualStyle", "originalLanguage", "resolution", "status"]) {
    if (body[key] !== undefined) data[key] = String(body[key]);
  }
  if (body.fps !== undefined) data.fps = Number(body.fps);
  if (body.subtitleLanguages !== undefined) data.subtitleLanguages = JSON.stringify(body.subtitleLanguages);
  // Per-production art style tuning (nullable free-text directives)
  for (const key of ["artStylePrompt", "artPalettePrompt", "artNegativePrompt"]) {
    if (body[key] !== undefined) {
      const v = String(body[key] ?? "").trim();
      data[key] = v.length > 0 ? v.slice(0, 600) : null;
    }
  }
  const project = await db.project.update({ where: { id }, data });
  if (Object.keys(data).some((k) => k.startsWith("art"))) {
    await db.productionEvent.create({
      data: {
        projectId: project.id,
        actor: "USER",
        type: "STATE_CHANGE",
        summary: `Art style direction updated - new panel art & model sheets will follow it`,
        payload: JSON.stringify({
          artStylePrompt: project.artStylePrompt,
          artPalettePrompt: project.artPalettePrompt,
          artNegativePrompt: project.artNegativePrompt,
        }),
      },
    });
  }
  return NextResponse.json({ id: project.id });
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";

// ─────────────────────────────────────────────────────────────
// ARC PLAYBACK FEED (per episode)
//
// The playable arc chips inside a DSH reply fetch this feed: the
// episode's shots in story order (scene number, then shot number),
// each carrying its dialogue and VOICE cues, so the console can run
// the SAME take-collection chain the ruler bars use
// (buildArcTakes / mergeArcTakes) against the arc span the tool
// call landed. Cue fields are exactly what ArcPlaybackShot wants;
// nothing else is exposed.
// ─────────────────────────────────────────────────────────────

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const episodeRow = await db.episode.findUnique({ where: { id }, select: { season: { select: { projectId: true } } } });
  if (!episodeRow) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  const access = await requireProjectAccess(req, episodeRow.season.projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      scenes: {
        orderBy: { number: "asc" },
        include: {
          shots: {
            orderBy: { number: "asc" },
            include: {
              audioCues: {
                where: { kind: "VOICE" },
                orderBy: { startMs: "asc" },
                select: {
                  kind: true, label: true, voiceUrl: true,
                  voiceDurationMs: true, voiceActor: true, voiceStateLabel: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!episode) return NextResponse.json({ error: "Episode not found" }, { status: 404 });

  return NextResponse.json({
    episode: { id: episode.id, number: episode.number, title: episode.title },
    shots: episode.scenes.flatMap((scene) =>
      [...scene.shots]
        .sort((a, b) => a.number - b.number)
        .map((shot) => ({
          id: shot.id,
          sceneNumber: scene.number,
          number: shot.number,
          dialogue: shot.dialogue,
          audioCues: shot.audioCues,
        })),
    ),
  });
}

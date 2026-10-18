export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { episodeReleaseVerdict } from "@/lib/identity-matrix";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER } from "@/lib/identity-repair";
import { buildReleaseReview } from "@/lib/release-review";
import { buildRepairWorkOrders } from "@/lib/repair-work-order";

// ─────────────────────────────────────────────────────────────
// THE RELEASE REVIEW, SERVED (iteration 233) - the panel learns to
// read the map. One read returns the review the 232 law builds (the
// gate's own reads turned into the durable map), the WORK ORDERS the
// 233 law derives from it (the map's steps made executable, the
// answerer named), and the episode tray (the review defaults to the
// episode that carries the most shots - the same deterministic pick
// the receipt rode). READ for the whole crew: the review is a map,
// not a lever - the gate keeps its teeth beside it.
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      seasons: {
        orderBy: { number: "asc" as const },
        select: {
          episodes: {
            orderBy: { number: "asc" as const },
            select: { id: true, number: true, title: true, scenes: { select: { _count: { select: { shots: true } } } } },
          },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "production not found" }, { status: 404 });
  const episodes = project.seasons.flatMap((s) =>
    s.episodes.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      shotCount: e.scenes.reduce((a, sc) => a + sc._count.shots, 0),
    })),
  );
  const wanted = (searchParams.get("episodeId") ?? "").trim();
  const episode = wanted
    ? episodes.find((e) => e.id === wanted)
    : [...episodes].sort((a, b) => b.shotCount - a.shotCount || a.number - b.number)[0];
  if (!episode) return NextResponse.json({ error: "no episode carries shots - nothing to review" }, { status: 404 });

  // the gate's own reads: every source the studio scores, one bar each
  const sources = ["AI_KEYFRAME", "RENDER"] as const;
  const reads: Awaited<ReturnType<typeof episodeReleaseVerdict>>[] = [];
  for (const source of sources) {
    reads.push(await episodeReleaseVerdict(projectId, episode.id, source));
  }
  const review = buildReleaseReview({
    projectId,
    episodeId: episode.id,
    episodeTag: `E${episode.number}`,
    episodeTitle: episode.title,
    reads,
    repairBudget: { members: REPAIR_MAX_MEMBERS, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });

  return NextResponse.json({
    review,
    workOrders: buildRepairWorkOrders(review),
    episodes,
  });
}

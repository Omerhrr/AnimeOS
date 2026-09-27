export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { notifyMembers } from "@/lib/studio/notify";

// ─────────────────────────────────────────────────────────────
// THE RELEASE CALENDAR (iteration 68): when the show meets its
// audience. One read returns every episode of the production as the
// calendar needs it - slated episodes with their date, platform and
// production standing, the DUE/RELEASED computation done at read
// time (no state to drift), and the unscheduled tray. WRITE (PATCH)
// stays EDITOR+: slating a release is a studio decision, reading it
// is the crew's.
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const now = new Date();
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      seasons: {
        orderBy: { number: "asc" as const },
        select: {
          number: true,
          episodes: {
            orderBy: { number: "asc" as const },
            select: {
              id: true,
              number: true,
              title: true,
              synopsis: true,
              status: true,
              releaseAt: true,
              releasePlatform: true,
              createdAt: true,
              scenes: { select: { shots: { select: { status: true }, orderBy: { number: "asc" as const } } } },
            },
          },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "production not found" }, { status: 404 });

  const episodes = project.seasons.flatMap((s) =>
    s.episodes.map((e) => {
      const shots = e.scenes.flatMap((sc) => sc.shots.map((sh) => sh.status));
      const shotCount = shots.length;
      const approvedShots = shots.filter((st) => st === "APPROVED" || st === "FINAL").length;
      const daysUntil = e.releaseAt ? Math.ceil((e.releaseAt.getTime() - now.getTime()) / 86_400_000) : null;
      return {
        id: e.id,
        seasonNumber: s.number,
        number: e.number,
        title: e.title,
        synopsis: e.synopsis,
        status: e.status,
        releaseAt: e.releaseAt ? e.releaseAt.toISOString() : null,
        releasePlatform: e.releasePlatform,
        daysUntil,
        state: !e.releaseAt ? "UNSCHEDULED" : e.releaseAt.getTime() <= now.getTime() ? "DUE" : "SLATED",
        sceneCount: e.scenes.length,
        shotCount,
        approvedShots,
      };
    }),
  );

  return NextResponse.json({
    now: now.toISOString(),
    episodes,
    slated: episodes.filter((e) => e.state === "SLATED").sort((a, b) => (a.releaseAt ?? "").localeCompare(b.releaseAt ?? "")),
    due: episodes.filter((e) => e.state === "DUE").sort((a, b) => (a.releaseAt ?? "").localeCompare(b.releaseAt ?? "")),
    unscheduled: episodes.filter((e) => e.state === "UNSCHEDULED"),
  });
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const episodeId = String(body.episodeId ?? "");
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });
  const episode = await db.episode.findUnique({ where: { id: episodeId }, select: { id: true, number: true, title: true, season: { select: { projectId: true } } } });
  if (!episode) return NextResponse.json({ error: "episode not found" }, { status: 404 });
  const access = await requireProjectAccess(req, episode.season.projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const data: { releaseAt?: Date | null; releasePlatform?: string | null } = {};
  if (body.releaseAt !== undefined) {
    const raw = String(body.releaseAt ?? "").trim();
    if (raw === "") {
      data.releaseAt = null;
    } else {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: `releaseAt '${raw}' is not a date ISO understands` }, { status: 400 });
      data.releaseAt = parsed;
    }
  }
  if (body.releasePlatform !== undefined) {
    const raw = String(body.releasePlatform ?? "").trim();
    data.releasePlatform = raw ? raw.slice(0, 40) : null;
  }
  const updated = await db.episode.update({ where: { id: episode.id }, data });
  // v71: PER-MEMBER OUTBOUND - the dialog's slate change is news the
  // subscribed crew asked for (same fan-out the schedule_release tool runs)
  const slatedFor = updated.releaseAt ? updated.releaseAt.toISOString().slice(0, 10) : null;
  const fanout = await notifyMembers(
    episode.season.projectId,
    "RELEASE",
    `EP${episode.number} ${slatedFor ? `slated for ${slatedFor}` : "unscheduled"}${updated.releasePlatform ? ` on ${updated.releasePlatform}` : ""}`,
    [`EP${episode.number} '${episode.title}' is ${slatedFor ? `slated for ${slatedFor}${updated.releasePlatform ? ` on ${updated.releasePlatform}` : ""}` : "off the release calendar"}.`],
  ).catch(() => ({ reached: 0, refused: 0, failed: 0, skipped: 0 }));
  return NextResponse.json({
    id: updated.id,
    releaseAt: updated.releaseAt ? updated.releaseAt.toISOString() : null,
    releasePlatform: updated.releasePlatform,
    outbound: fanout,
  });
}

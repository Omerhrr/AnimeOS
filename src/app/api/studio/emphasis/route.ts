export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// PER-ROLE DASHBOARD EMPHASIS (Iteration 49)
//
// One endpoint the dashboard reads: WHO the caller is (role +
// craft lens on this production) and WHAT matters to them, read
// fresh from the real rows - never inferred on the client.
//
//   OWNER      → the wide lens: studio-wide overview (every
//                production, the roster's liveness, the gate) and
//                full per-project emphasis. Never blocked.
//   DIRECTING  → story funnel + DSH direction + gate state
//   ART        → identity drift + panel coverage
//   VOICE      → voice cast + takes + auditions
//   REVIEW     → approval queue + open threads + revisions
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionUser } from "@/lib/auth";
import { requireProjectAccess, craftOn, CRAFTS } from "@/lib/access";

export async function GET(req: Request) {
  const user = await sessionUser(req, { touch: true });
  if (!user) return NextResponse.json({ error: "Sign in to use the studio" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";

  // Studio-wide slice: OWNER only (their lens is the whole studio).
  let studio: {
    role: string;
    projectCount: number;
    memberCount: number;
    projects: Array<{ id: string; title: string; status: string; episodeCount: number; renderCount: number; crewCount: number; gate: boolean }>;
    roster: Array<{ name: string; role: string; lastSeenAt: string | Date | null }>;
  } | null = null;
  if (user.role === "OWNER") {
    const [allProjects, allUsers] = await Promise.all([
      db.project.findMany({
        orderBy: { createdAt: "asc" },
        include: {
          seasons: { include: { episodes: { select: { id: true } } } },
          renderJobs: { select: { id: true } },
          memberships: { select: { id: true } },
        },
      }),
      db.user.findMany({ orderBy: { lastSeenAt: "desc" }, select: { name: true, role: true, lastSeenAt: true } }),
    ]);
    studio = {
      role: user.role,
      projectCount: allProjects.length,
      memberCount: allUsers.length,
      projects: allProjects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        episodeCount: p.seasons.reduce((n, s) => n + s.episodes.length, 0),
        renderCount: p.renderJobs.length,
        crewCount: p.memberships.length,
        gate: p.approvalGate,
      })),
      roster: allUsers.slice(0, 6),
    };
  }

  if (!projectId) {
    return NextResponse.json({
      self: { id: user.id, name: user.name, role: user.role, craft: null, viaOwner: user.role === "OWNER" },
      crafts: CRAFTS,
      studio,
      project: null,
    });
  }

  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const craft = await craftOn(user, projectId);

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true, logline: true, status: true, approvalGate: true, visualStyle: true,
      seasons: {
        select: {
          episodes: {
            select: {
              number: true,
              status: true,
              scenes: { select: { shots: { select: { id: true, status: true, duration: true, artworkUrl: true } } } },
            },
          },
        },
      },
      characters: {
        select: {
          name: true,
          voiceArtist: { select: { name: true, voiceId: true } },
        },
      },
      renderJobs: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, status: true, progress: true, stage: true, attempt: true, mode: true, shotId: true, createdAt: true },
      },
      productionEvents: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, actor: true, type: true, summary: true, createdAt: true },
      },
      dshMessages: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, role: true, content: true, createdAt: true } },
      identityScores: {
        orderBy: { scoredAt: "desc" },
        take: 6,
        select: { id: true, shotId: true, worst: true, source: true, scoredAt: true },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Production not found" }, { status: 404 });

  // Story funnel (the DIRECTING lens)
  const episodes = project.seasons.flatMap((s) => s.episodes);
  const allShots = episodes.flatMap((e) => e.scenes.flatMap((sc) => sc.shots));
  const approvedShots = allShots.filter((s) => s.status === "APPROVED" || s.status === "FINAL").length;
  const totalDurationSec = allShots.reduce((n, s) => n + s.duration, 0);

  // Render + gate (the REVIEW lens)
  const activeJobs = project.renderJobs.filter((j) => ["QUEUED", "RENDERING", "INSPECTING"].includes(j.status));
  const awaitingApproval = project.renderJobs.filter((j) => j.status === "REVIEW").length;
  const needsRevision = project.renderJobs.filter((j) => j.status === "NEEDS_REVISION").length;

  // Workplace threads (the REVIEW lens)
  const [openThreads, openThreadCount] = await Promise.all([
    db.comment.findMany({
      where: { projectId, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, anchorType: true, anchorId: true, authorName: true, body: true, createdAt: true },
    }),
    db.comment.count({ where: { projectId, resolved: false } }),
  ]);

  // Art coverage + identity drift (the ART lens)
  const panelsWithArt = allShots.filter((s) => Boolean(s.artworkUrl)).length;
  const identityAvg = project.identityScores.length > 0
    ? Math.round((project.identityScores.reduce((n, s) => n + s.worst, 0) / project.identityScores.length) * 100)
    : null;

  // Voice (the VOICE lens)
  const [takeCount, auditionCount] = await Promise.all([
    db.audioCue.count({ where: { shot: { scene: { episode: { season: { projectId } } } }, kind: "VOICE", voiceUrl: { not: null } } }),
    db.stateAudition.count({ where: { state: { character: { projectId } } } }),
  ]);
  const voiceCast = project.characters
    .filter((c) => c.voiceArtist)
    .map((c) => ({ character: c.name, artist: c.voiceArtist!.name, voiceId: c.voiceArtist!.voiceId }));

  return NextResponse.json({
    self: { id: user.id, name: user.name, role: user.role, craft, viaOwner: access.viaOwner },
    crafts: CRAFTS,
    studio,
    project: {
      id: project.id,
      title: project.title,
      logline: project.logline,
      status: project.status,
      approvalGate: project.approvalGate,
      visualStyle: project.visualStyle,
      funnel: {
        episodes: episodes.length,
        scenes: episodes.reduce((n, e) => n + e.scenes.length, 0),
        shots: allShots.length,
        approvedShots,
        totalDurationSec: Math.round(totalDurationSec),
      },
      render: {
        active: activeJobs,
        awaitingApproval,
        needsRevision,
      },
      threads: { openCount: openThreadCount, latest: openThreads },
      art: { panels: allShots.length, panelsWithArt, pending: allShots.length - panelsWithArt },
      identity: { latest: project.identityScores, avg: identityAvg },
      voice: { cast: voiceCast, takes: takeCount, auditions: auditionCount },
      dsh: project.dshMessages,
      events: project.productionEvents,
    },
  });
}

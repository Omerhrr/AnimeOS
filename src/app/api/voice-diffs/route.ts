export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireProjectAccess, projectOfRow } from "@/lib/access";
import {
  diffEpisodeById, diffProjectEpisodes, reRenderStaleTakes, reRenderStaleAcrossProject,
} from "@/lib/ai/voice-diff";

// ─────────────────────────────────────────────────────────────
// PER-EPISODE (AND SEASON-WIDE) VOICE DIRECTION DIFF
//
// GET  ?episodeId=  diff one episode
// GET  ?projectId=  batch diff every episode of the production
// POST { episodeId }        re-render ONLY the stale takes of one episode
// POST { projectId, limit } batch re-render stale takes across ALL
//                           episodes, capped per call (default 16, max 32)
//
// See src/lib/ai/voice-diff.ts for the shared core; the DSH tools
// diff_episode_direction / diff_all_episodes reuse the same logic.
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const episodeId = searchParams.get("episodeId");
  const projectId = searchParams.get("projectId");
  if (!episodeId && !projectId) {
    return NextResponse.json({ error: "episodeId or projectId required" }, { status: 400 });
  }
  const access = await requireProjectAccess(req, episodeId ? await projectOfRow("episode", episodeId) : projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (episodeId) {
    const diff = await diffEpisodeById(episodeId);
    if (!diff) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    return NextResponse.json({ episodes: [diff] });
  }
  return NextResponse.json({ episodes: await diffProjectEpisodes(projectId!) });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // season-wide batch: re-render stale takes across ALL episodes, capped
  if (body.projectId) {
    const projectId = String(body.projectId);
    const access = await requireProjectAccess(req, projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const limit = body.limit === undefined ? undefined : Number(body.limit);
    if (limit !== undefined && !Number.isFinite(limit)) {
      return NextResponse.json({ error: "limit must be a number" }, { status: 400 });
    }
    const outcome = await reRenderStaleAcrossProject(projectId, { actor: "USER", limit });
    return NextResponse.json(outcome);
  }

  const episodeId = body.episodeId ? String(body.episodeId) : "";
  if (!episodeId) return NextResponse.json({ error: "episodeId or projectId required" }, { status: 400 });
  const epProject = await projectOfRow("episode", episodeId);
  const access = await requireProjectAccess(req, epProject, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const outcome = await reRenderStaleTakes(episodeId, { actor: "USER" });
  if (!outcome) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  return NextResponse.json(outcome);
}

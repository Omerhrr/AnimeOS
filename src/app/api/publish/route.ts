export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess, projectOfRow } from "@/lib/access";
import { PLATFORM_PRESETS, stagePublishPackage, listPublishEvents } from "@/lib/comic/publish";
import { uploadStagedPackage } from "@/lib/comic/upload";

// ─────────────────────────────────────────────────────────────
// PLATFORM PUBLISHING (the delivery spine's last mile)
//
// GET ?projectId=         -> the platform presets + recently
//                            staged publish packages
// POST { episodeId, platform } -> stage a publish package for one
//                            episode on one platform (local,
//                            honest: no network upload happens)
// POST { action: "upload", eventId } -> run the platform's real
//                            upload adapter on a staged package
//                            (credential-gated; every outcome
//                            recorded on the event)
// ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  const access = await requireProjectAccess(req, projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const recent = await listPublishEvents(projectId).catch(() => []);
  return NextResponse.json({
    presets: PLATFORM_PRESETS.map((p) => ({
      id: p.id,
      label: p.label,
      blurb: p.blurb,
      orientation: p.orientation,
      width: p.width,
      height: p.height,
      maxDurationSec: p.maxDurationSec,
      titleMaxChars: p.titleMaxChars,
      subtitleFormat: p.subtitleFormat,
      notes: p.notes,
      envKeys: p.envKeys,
    })),
    recent,
  });
}

export async function POST(req: Request) {
  let body: { episodeId?: unknown; platform?: unknown; action?: unknown; eventId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "a JSON body is required" }, { status: 400 });
  }

  if (body.action === "upload") {
    const eventId = String(body.eventId ?? "");
    if (!eventId) return NextResponse.json({ error: "eventId is required for the upload action" }, { status: 400 });
    const eventRow = await db.productionEvent.findUnique({ where: { id: eventId }, select: { projectId: true } });
    if (!eventRow) return NextResponse.json({ error: "Publish event not found" }, { status: 404 });
    const access = await requireProjectAccess(req, eventRow.projectId, { write: true });
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const result = await uploadStagedPackage(eventId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.outcome);
  }

  const episodeId = String(body.episodeId ?? "");
  const platform = String(body.platform ?? "");
  if (!episodeId || !platform) {
    return NextResponse.json({ error: "episodeId and platform are required" }, { status: 400 });
  }
  const episodeProject = await projectOfRow("episode", episodeId);
  const access = await requireProjectAccess(req, episodeProject, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await stagePublishPackage(episodeId, platform);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.pkg);
}

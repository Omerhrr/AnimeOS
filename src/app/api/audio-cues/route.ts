export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Sound-design cues for a shot's motion panel. VOICE cues carry the
// resolved standing cast (the character's cast artist voice) so the
// editor can show who performs the line before any take is rendered.

const CUE_KINDS = new Set(["SFX", "VOICE", "BGM", "AMBIENCE"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shotId = searchParams.get("shotId");
  if (!shotId) return NextResponse.json({ error: "shotId required" }, { status: 400 });
  const cues = await db.audioCue.findMany({
    where: { shotId },
    orderBy: { startMs: "asc" },
  });

  // resolve per-speaker voice casting once for the shot's VOICE cues
  const shot = await db.shot.findUnique({
    where: { id: shotId },
    select: { scene: { select: { episode: { select: { season: { select: { projectId: true } } } } } } },
  });
  const projectId = shot?.scene.episode?.season.projectId;
  let castBySpeaker = new Map<string, { artistName: string; voiceId: string | null }>();
  if (projectId) {
    const characters = await db.character.findMany({
      where: { projectId, voiceArtistId: { not: null } },
      include: { voiceArtist: true },
    });
    castBySpeaker = new Map(
      characters
        .filter((c) => c.voiceArtist)
        .map((c) => [c.name.toLowerCase(), { artistName: c.voiceArtist!.name, voiceId: c.voiceArtist!.voiceId }]),
    );
  }

  const enriched = cues.map((cue) => {
    // the acoustic slot's persisted audit is stored as JSON text -
    // parse it for the client (a corrupt report reads as null)
    let acousticReport: unknown = null;
    if (cue.acousticReport) {
      try {
        acousticReport = JSON.parse(cue.acousticReport);
      } catch {
        acousticReport = null;
      }
    }
    if (cue.kind !== "VOICE" || !cue.label.includes(": ")) {
      return { ...cue, acousticReport, cast: null };
    }
    const speaker = cue.label.split(":")[0].trim().toLowerCase();
    const cast = castBySpeaker.get(speaker) ?? null;
    return { ...cue, acousticReport, cast };
  });
  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const body = await req.json();
  const shotId = body.shotId ? String(body.shotId) : "";
  if (!shotId) return NextResponse.json({ error: "shotId required" }, { status: 400 });
  const shot = await db.shot.findUnique({ where: { id: shotId } });
  if (!shot) return NextResponse.json({ error: "Shot not found" }, { status: 404 });

  const kind = CUE_KINDS.has(String(body.kind)) ? String(body.kind) : "SFX";
  const label = String(body.label ?? "New cue").trim().slice(0, 120) || "New cue";
  const timelineMs = Math.max(1, Math.round((shot.duration ?? 4) * 1000));
  const startMs = clampInt(body.startMs, 0, timelineMs - 50, 0);
  const durationMs = clampInt(body.durationMs, 50, Math.max(timelineMs, 50), 600);
  const volume = Number.isFinite(Number(body.volume)) ? Math.min(1, Math.max(0.05, Number(body.volume))) : 0.8;

  const cue = await db.audioCue.create({ data: { shotId, kind, label, startMs, durationMs, volume } });
  return NextResponse.json(cue);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

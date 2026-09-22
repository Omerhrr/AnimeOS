export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Sound-design cues for a shot's motion panel.

const CUE_KINDS = new Set(["SFX", "VOICE", "BGM", "AMBIENCE"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shotId = searchParams.get("shotId");
  if (!shotId) return NextResponse.json({ error: "shotId required" }, { status: 400 });
  const cues = await db.audioCue.findMany({
    where: { shotId },
    orderBy: { startMs: "asc" },
  });
  return NextResponse.json(cues);
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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { isDeliveryId } from "@/lib/comic/delivery";
import { auditVoiceTakeAcoustics } from "@/lib/animation/acoustic";

type Ctx = { params: Promise<{ id: string }> };

const CUE_KINDS = new Set(["SFX", "VOICE", "BGM", "AMBIENCE"]);

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const cue = await db.audioCue.findUnique({ where: { id }, include: { shot: true } });
  if (!cue) return NextResponse.json({ error: "Cue not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.kind !== undefined && CUE_KINDS.has(String(body.kind))) data.kind = String(body.kind);
  if (body.label !== undefined) {
    const label = String(body.label).trim().slice(0, 120);
    if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
    data.label = label;
  }
  if (body.volume !== undefined && Number.isFinite(Number(body.volume))) {
    data.volume = Math.min(1, Math.max(0.05, Number(body.volume)));
  }
  const timelineMs = Math.max(1, Math.round((cue.shot.duration ?? 4) * 1000));
  if (body.startMs !== undefined) {
    const n = Math.round(Number(body.startMs));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "startMs must be a number" }, { status: 400 });
    data.startMs = Math.min(timelineMs - 50, Math.max(0, n));
  }
  if (body.durationMs !== undefined) {
    const n = Math.round(Number(body.durationMs));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "durationMs must be a number" }, { status: 400 });
    data.durationMs = Math.min(Math.max(timelineMs, 50), Math.max(50, n));
  }
  // standing voice direction: an explicit delivery profile pins every
  // future render, null returns the cue to auto (character-state) resolution
  if (body.voiceDelivery !== undefined) {
    if (body.voiceDelivery === null || body.voiceDelivery === "" || body.voiceDelivery === "AUTO") {
      data.voiceDelivery = null;
    } else if (isDeliveryId(body.voiceDelivery)) {
      data.voiceDelivery = body.voiceDelivery;
    }
  }
  if (body.voiceNote !== undefined) {
    const note = String(body.voiceNote ?? "").trim().slice(0, 200);
    data.voiceNote = note.length > 0 ? note : null;
  }
  const updated = await db.audioCue.update({ where: { id }, data });
  return NextResponse.json(updated);
}

// ── POST : the acoustic slot's persisted audit for a VOICE cue's
//    take (runs + syllable anchors +, under ANIMEOS_ACOUSTIC=neural,
//    the ASR's word evidence). The report lands on the cue row and
//    the sound timeline badges it.
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const cue = await db.audioCue.findUnique({
    where: { id },
    include: { shot: { select: { dialogue: true } } },
  });
  if (!cue) return NextResponse.json({ error: "Cue not found" }, { status: 404 });
  if (cue.kind !== "VOICE") {
    return NextResponse.json({ error: "acoustic audits apply to VOICE cues only" }, { status: 400 });
  }
  const result = await auditVoiceTakeAcoustics(
    { id: cue.id, label: cue.label, startMs: cue.startMs, durationMs: cue.durationMs, voiceDurationMs: cue.voiceDurationMs, voiceUrl: cue.voiceUrl },
    cue.shot.dialogue,
    (url: string) => {
      try {
        const file = path.join(process.cwd(), "public", url.split("?")[0].replace(/^\//, ""));
        return fs.existsSync(file) ? fs.readFileSync(file) : null;
      } catch {
        return null;
      }
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  await db.audioCue.update({ where: { id }, data: { acousticReport: JSON.stringify(result.report) } });
  return NextResponse.json(result.report);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.audioCue.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

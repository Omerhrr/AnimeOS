export const dynamic = "force-dynamic";

import { unlink } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess, projectOfRow } from "@/lib/access";

// ─────────────────────────────────────────────────────────────
// PER-STATE AUDITION HISTORY
//
// GET /api/state-auditions?stateId=<id>
//   The auditioned reads of ONE development state, newest first
//   (capped at 12 - the same cap the recorder prunes to). Each row
//   carries the full performance snapshot: the WAV under
//   /auditions/, the line that was read, the voice, register,
//   effective speed/pitch, and when it was rendered.
//
// DELETE /api/state-auditions?id=<row id>
//   Removes one history row and unlinks its WAV file.
// ─────────────────────────────────────────────────────────────

const CAP = 12;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const stateId = url.searchParams.get("stateId") ?? "";
  if (!stateId) return NextResponse.json({ error: "stateId is required" }, { status: 400 });
  const state = await db.characterState.findUnique({
    where: { id: stateId },
    select: { id: true, label: true, episodeNumber: true, voiceVariant: true, speedHint: true, pitchHint: true, character: { select: { projectId: true } } },
  });
  if (!state) return NextResponse.json({ error: "State not found" }, { status: 404 });
  const access = await requireProjectAccess(req, state.character.projectId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const rows = await db.stateAudition.findMany({
    where: { stateId },
    orderBy: { createdAt: "desc" },
    take: CAP,
  });
  return NextResponse.json({ state, auditions: rows });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const row = await db.stateAudition.findUnique({ where: { id }, select: { url: true, stateId: true } });
  if (!row) return NextResponse.json({ error: "Audition row not found" }, { status: 404 });
  const auditionProject = await projectOfRow("characterState", row.stateId);
  const access = await requireProjectAccess(req, auditionProject, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  await db.stateAudition.delete({ where: { id } });
  if (row.url.startsWith("/auditions/")) {
    await unlink(path.join(process.cwd(), "public", row.url)).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

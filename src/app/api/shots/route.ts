export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();
  const maxNum = await db.shot.aggregate({ where: { sceneId: String(body.sceneId) }, _max: { number: true } });
  const shot = await db.shot.create({
    data: {
      sceneId: String(body.sceneId),
      number: Number(body.number ?? (maxNum._max.number ?? 0) + 1),
      description: String(body.description ?? "Untitled shot"),
      shotType: String(body.shotType ?? "MEDIUM"),
      lens: body.lens ? String(body.lens) : null,
      movement: body.movement ? String(body.movement) : null,
      duration: Number(body.duration ?? 4),
      lighting: body.lighting ? String(body.lighting) : null,
    },
  });
  return NextResponse.json({ id: shot.id });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, ...rest } = body;

  // ── Validation helpers ─────────────────────────────────
  // loraId must reference a LoRA from the shot's production;
  // artistId must reference a roster member of the same project.
  async function validatedRefs(sceneId: string, candidate: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    if (candidate.loraId !== undefined) {
      const loraId = candidate.loraId ? String(candidate.loraId) : null;
      if (loraId) {
        const lora = await db.styleLora.findUnique({ where: { id: loraId }, include: { project: { include: { seasons: { include: { episodes: { include: { scenes: true } } } } } } } });
        if (!lora || !lora.project.seasons.some((s) => s.episodes.some((e) => e.scenes.some((sc) => sc.id === sceneId)))) {
          throw new Error("loraId does not belong to this shot's production");
        }
        data.loraId = loraId;
      } else {
        data.loraId = null;
        data.loraStrength = null;
      }
    }
    if (candidate.loraStrength !== undefined) {
      if (candidate.loraStrength === null || candidate.loraStrength === "") {
        data.loraStrength = null;
      } else {
        const n = Number(candidate.loraStrength);
        if (!Number.isFinite(n)) throw new Error("loraStrength must be a number");
        data.loraStrength = Math.min(1.2, Math.max(0.1, n));
      }
    }
    if (candidate.artistId !== undefined) {
      const artistId = candidate.artistId ? String(candidate.artistId) : null;
      if (artistId) {
        const artist = await db.artist.findUnique({ where: { id: artistId }, include: { project: { include: { seasons: { include: { episodes: { include: { scenes: true } } } } } } } });
        if (!artist || !artist.project.seasons.some((s) => s.episodes.some((e) => e.scenes.some((sc) => sc.id === sceneId)))) {
          throw new Error("artistId does not belong to this shot's production");
        }
        data.artistId = artistId;
      } else {
        data.artistId = null;
      }
    }
    return data;
  }

  function buildFieldData(rest: Record<string, unknown>) {
    const data: Record<string, unknown> = {};
    for (const key of ["description", "shotType", "lens", "movement", "lighting", "status"]) {
      if (rest[key] !== undefined) data[key] = String(rest[key]);
    }
    if (rest.duration !== undefined) data.duration = Number(rest.duration);
    if (rest.number !== undefined) data.number = Number(rest.number);
    if (rest.dialogue !== undefined) {
      if (rest.dialogue === null || rest.dialogue === "") {
        data.dialogue = null;
      } else {
        const parsed = JSON.parse(String(rest.dialogue));
        if (!Array.isArray(parsed)) throw new Error("dialogue must be an array");
        if (parsed.length > 8) throw new Error("at most 8 lines per shot");
        for (const line of parsed) {
          if (typeof line !== "object" || line === null || typeof line.text !== "string" || !line.text.trim()) {
            throw new Error("each line needs non-empty text");
          }
        }
        data.dialogue = String(rest.dialogue);
      }
    }
    if (rest.artworkUrl !== undefined) data.artworkUrl = rest.artworkUrl ? String(rest.artworkUrl) : null;
    return data;
  }

  // ── Bulk variant: { ids: [...], artistId?, loraId?, loraStrength? } ──
  if (Array.isArray(body.ids)) {
    const ids = body.ids.map(String).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ error: "ids cannot be empty" }, { status: 400 });
    try {
      let updated = 0;
      for (const shotId of ids) {
        const shot = await db.shot.findUnique({ where: { id: shotId } });
        if (!shot) continue;
        const refData = await validatedRefs(shot.sceneId, rest);
        if (Object.keys(refData).length === 0) throw new Error("bulk update needs artistId, loraId and/or loraStrength");
        await db.shot.update({ where: { id: shotId }, data: refData });
        updated += 1;
      }
      return NextResponse.json({ updated });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Bulk update failed" }, { status: 400 });
    }
  }

  // ── Single-shot variant ────────────────────────────────
  const data = buildFieldData(rest);
  try {
    const existing = await db.shot.findUnique({ where: { id: String(id) } });
    if (!existing) return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    const refData = await validatedRefs(existing.sceneId, rest);
    Object.assign(data, refData);
    const shot = await db.shot.update({ where: { id: String(id) }, data });
    return NextResponse.json({ id: shot.id });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("belong") || err.message.includes("loraStrength"))) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && err.message.includes("dialogue")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.shot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

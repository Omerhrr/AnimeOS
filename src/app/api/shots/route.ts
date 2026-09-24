export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePose, poseChip } from "@/lib/animation/poses";
import { presetPosesForStateLabel, resolveActiveState } from "@/lib/animation/state-poses";

/** Pose chips must name the shared vocabulary (or an alias) - typos 400 so renders never silently no-op. */
function poseField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const pose = normalizePose(value);
  if (!pose) throw new Error(`unknown pose '${String(value)}' - valid: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT`);
  return pose;
}

export async function POST(req: Request) {
  const body = await req.json();
  let poseStart: string | null;
  let poseEnd: string | null;
  try {
    poseStart = poseField(body.poseStart) ?? null;
    poseEnd = poseField(body.poseEnd) ?? null;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid pose" }, { status: 400 });
  }
  const maxNum = await db.shot.aggregate({ where: { sceneId: String(body.sceneId) }, _max: { number: true } });
  const shot = await db.shot.create({
    data: {
      sceneId: String(body.sceneId),
      number: Number(body.number ?? (maxNum._max.number ?? 0) + 1),
      description: String(body.description ?? "Untitled shot"),
      shotType: String(body.shotType ?? "MEDIUM"),
      lens: body.lens ? String(body.lens) : null,
      movement: body.movement ? String(body.movement) : null,
      poseStart,
      poseEnd,
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
    const poseStart = poseField(rest.poseStart);
    if (poseStart !== undefined) data.poseStart = poseStart;
    const poseEnd = poseField(rest.poseEnd);
    if (poseEnd !== undefined) data.poseEnd = poseEnd;
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
  try {
    const data = buildFieldData(rest);
    const existing = await db.shot.findUnique({ where: { id: String(id) } });
    if (!existing) return NextResponse.json({ error: "Shot not found" }, { status: 404 });
    const refData = await validatedRefs(existing.sceneId, rest);
    Object.assign(data, refData);

    // ── applyStatePoses: land the cast's state pose preset on this shot ──
    // Resolves the detected cast (description match, same rule the art
    // prompts use), takes each character's episode-active development
    // state, and the first state carrying a pose pair (or, with auto,
    // the library preset for its label) supplies the shot's program.
    let statePoseInfo: Record<string, unknown> | null = null;
    if (rest.applyStatePoses === true) {
      const scene = await db.scene.findUnique({
        where: { id: existing.sceneId },
        include: { episode: { include: { season: { include: { project: { include: { characters: { include: { states: true } } } } } } } } },
      });
      const project = scene?.episode.season.project;
      if (project) {
        const desc = existing.description.toLowerCase();
        const detected = project.characters
          .filter((c) => desc.includes(c.name.toLowerCase().split(" ")[0]))
          .slice(0, 3);
        let applied: { poseStart: string; poseEnd: string; source: string } | null = null;
        for (const ch of detected) {
          const active = resolveActiveState(ch.states, scene!.episode.number);
          if (!active) continue;
          const start = active.poseStart ? normalizePose(active.poseStart) : null;
          const end = active.poseEnd ? normalizePose(active.poseEnd) : null;
          if (start || end) {
            applied = { poseStart: start ?? "STANCE", poseEnd: end ?? "STANCE", source: `${ch.name} state "${active.label}" preset` };
            break;
          }
          if (rest.auto !== false) {
            const lib = presetPosesForStateLabel(active.label);
            if (lib) {
              applied = { poseStart: lib.poseStart, poseEnd: lib.poseEnd, source: `${ch.name} state "${active.label}" library preset (${lib.note})` };
              break;
            }
          }
        }
        if (applied) {
          // explicit pose fields in the same request win over the preset
          if (data.poseStart === undefined) data.poseStart = applied.poseStart;
          if (data.poseEnd === undefined) data.poseEnd = applied.poseEnd;
          statePoseInfo = {
            applied: true,
            source: applied.source,
            previous: poseChip(existing.poseStart, existing.poseEnd),
            now: poseChip(data.poseStart as string, data.poseEnd as string),
          };
        } else {
          statePoseInfo = {
            applied: false,
            reason: detected.length === 0
              ? "no cast member is referenced by this shot's description"
              : "no episode-effective state carries a pose preset (and none matched the library)",
          };
        }
      } else {
        statePoseInfo = { applied: false, reason: "scene not found" };
      }
    }

    const shot = await db.shot.update({ where: { id: String(id) }, data });
    return NextResponse.json({ id: shot.id, statePoses: statePoseInfo });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("belong") || err.message.includes("loraStrength"))) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Error && (err.message.includes("dialogue") || err.message.includes("unknown pose"))) {
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

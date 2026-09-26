export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { isVoiceId } from "@/lib/comic/voice-catalog";
import { normalizePose } from "@/lib/animation/poses";
import { presetPosesForStateLabel } from "@/lib/animation/state-poses";

// PATCH a character development state. Exposes the state's voice
// performance (variant voice + speed/pitch hints) and the state's
// POSE PRESET: the start/end pair the character performs while this
// state is episode-effective. "auto" re-resolves the library preset
// from the label; explicit poseStart/poseEnd win; empty string clears.
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = body.id ? String(body.id) : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const state = await db.characterState.findUnique({ where: { id }, include: { character: true } });
  if (!state) return NextResponse.json({ error: "State not found" }, { status: 404 });

  const access = await requireProjectAccess(req, state.character.projectId, { write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const clampHint = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 100) / 100;
  const data: Record<string, unknown> = {};
  const changes: string[] = [];
  if (body.voiceVariant !== undefined) {
    const voice = body.voiceVariant ? String(body.voiceVariant).trim() : "";
    if (voice && !isVoiceId(voice)) {
      return NextResponse.json({ error: `Unknown voice '${voice}'` }, { status: 400 });
    }
    data.voiceVariant = voice || null;
    changes.push(voice ? `variant voice '${voice}'` : "variant voice cleared");
  }
  if (body.speedHint !== undefined) {
    // null clears the hint; numbers clamp to the 0.5-2.0 pace window
    if (body.speedHint === null) {
      data.speedHint = null;
      changes.push("speed hint cleared");
    } else {
      const n = Number(body.speedHint);
      if (!Number.isFinite(n)) return NextResponse.json({ error: "speedHint must be a number or null" }, { status: 400 });
      data.speedHint = clampHint(n, 0.5, 2);
      changes.push(`speed hint x${data.speedHint}`);
    }
  }
  if (body.pitchHint !== undefined) {
    // null clears the hint; <1 reads deeper, >1 reads higher (0.5-2.0)
    if (body.pitchHint === null) {
      data.pitchHint = null;
      changes.push("pitch hint cleared");
    } else {
      const n = Number(body.pitchHint);
      if (!Number.isFinite(n)) return NextResponse.json({ error: "pitchHint must be a number or null" }, { status: 400 });
      data.pitchHint = clampHint(n, 0.5, 2);
      changes.push(`pitch hint x${data.pitchHint}`);
    }
  }
  if (body.auto === true) {
    const preset = presetPosesForStateLabel(state.label);
    if (preset) {
      data.poseStart = preset.poseStart;
      data.poseEnd = preset.poseEnd;
      changes.push(`pose preset from the state library (${preset.poseStart} -> ${preset.poseEnd}: ${preset.note})`);
    } else {
      return NextResponse.json({ error: `No library pose preset matches the state label '${state.label}'` }, { status: 400 });
    }
  }
  for (const field of ["poseStart", "poseEnd"] as const) {
    if (body[field] === undefined) continue;
    const raw = body[field] === null ? "" : String(body[field]).trim();
    if (!raw) {
      data[field] = null;
      changes.push(field === "poseStart" ? "start pose cleared" : "end pose cleared");
      continue;
    }
    const pose = normalizePose(raw);
    if (!pose) {
      return NextResponse.json({ error: `Unknown pose '${raw}' (valid: STANCE, WALK, LUNGE, SLASH, CAST, DRAW, BLOCK, LEAP, CROUCH, FALL, RISE, BOW, POINT)` }, { status: 400 });
    }
    data[field] = pose;
    changes.push(field === "poseStart" ? `start pose ${pose}` : `end pose ${pose}`);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.characterState.update({ where: { id }, data });
  await db.productionEvent.create({
    data: {
      projectId: state.character.projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `State performance updated on ${state.character.name} "${state.label}": ${changes.join(", ")}; direction diff will flag affected takes stale`,
    },
  });
  return NextResponse.json({ id: updated.id, voiceVariant: updated.voiceVariant, speedHint: updated.speedHint, pitchHint: updated.pitchHint, poseStart: updated.poseStart, poseEnd: updated.poseEnd });
}

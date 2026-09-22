export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isVoiceId } from "@/lib/comic/voice-catalog";

// PATCH a character development state. Currently exposes the state
// voice variant: bind (or clear) the TTS voice that performs the
// character's lines while this state is episode-effective, overriding
// the cast artist's normal voice for those episodes.
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

  const data: Record<string, unknown> = {};
  if (body.voiceVariant !== undefined) {
    const voice = body.voiceVariant ? String(body.voiceVariant).trim() : "";
    if (voice && !isVoiceId(voice)) {
      return NextResponse.json({ error: `Unknown voice '${voice}'` }, { status: 400 });
    }
    data.voiceVariant = voice || null;
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
      summary: data.voiceVariant
        ? `State voice variant: ${state.character.name} "${state.label}" now speaks with '${String(data.voiceVariant)}' while episode-effective`
        : `State voice variant cleared on ${state.character.name} "${state.label}"`,
    },
  });
  return NextResponse.json({ id: updated.id, voiceVariant: updated.voiceVariant });
}

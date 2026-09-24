export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { trainCharacterVoice } from "@/lib/ai/voice-clone";

// ── Voice-clone slot: train a character's voice from their rendered
//    takes through the configured cloning provider.
//
// POST { characterId } -> { characterId, characterName, voiceId,
//                           takes, totalMs, trainedAt }
// Honest refusals (no provider env, no takes, provider error) come
// back as 400 with the reason. The DSH tool train_voice_clone rides
// the same module.
export async function POST(req: Request) {
  let body: { characterId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "a JSON body is required" }, { status: 400 });
  }
  const characterId = String(body.characterId ?? "");
  if (!characterId) return NextResponse.json({ error: "characterId is required" }, { status: 400 });
  const result = await trainCharacterVoice(characterId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.result);
}

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { VoiceRenderError, renderVoiceTake } from "@/lib/ai/voice-render";

// Real TTS voice renders for VOICE audio cues. A rendered take is a
// 24kHz mono WAV stored under public/voices/{cueId}.wav; the cue keeps
// the actual duration so stems and manifests can carry real speech.
//
// WHO speaks: per-artist voice casting. A character cast to a roster
// artist (Character.voiceArtist) is performed with that artist's TTS
// voice; uncast speakers fall back to the deterministic hash voice.
//
// HOW the line is played: state-aware delivery. Priority is an
// explicit request override, then the dialogue line's own delivery
// (line-level direction inside the shot), then the cue's standing
// direction (voiceDelivery, set by the creator or DSH), then the
// speaker's episode-effective CharacterState.
//
// Every take stamps its input snapshot (voiceSig) so the direction
// diff can re-render only takes whose inputs moved.

export async function GET() {
  const { VOICES } = await import("@/lib/comic/voice-catalog");
  return NextResponse.json({ voices: VOICES });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cueId = body.cueId ? String(body.cueId) : "";
  if (!cueId) return NextResponse.json({ error: "cueId required" }, { status: 400 });

  try {
    const result = await renderVoiceTake(cueId, { voice: body.voice, speed: body.speed, delivery: body.delivery });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof VoiceRenderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: `Voice render failed: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }
}

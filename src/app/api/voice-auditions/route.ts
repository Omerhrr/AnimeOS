export const dynamic = "force-dynamic";

import ZAI from "z-ai-web-dev-sdk";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryProfile, isDeliveryId, shapeLineForDelivery } from "@/lib/comic/delivery";
import { parseDialogue } from "@/lib/comic/dialogue";
import { isVoiceId } from "@/lib/comic/voice-catalog";
import { wavDurationMs } from "@/lib/ai/voice-render";

// ─────────────────────────────────────────────────────────────
// VOICE AUDITION (casting board preview)
//
// A throwaway TTS render used to audition a voice BEFORE casting:
// no cue is touched, no take is stored, nothing enters the stems.
// The sample line is, in priority order: an explicit line from the
// board, the character's own first dialogue line in the production
// (speaker lookup), or a classic audition read.
// ─────────────────────────────────────────────────────────────

const AUDITION_LINES = [
  "You should not have come here.",
  "The storm bends, but it does not break me.",
  "One breath. One strike. It ends now.",
];

function defaultAuditionLine(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return AUDITION_LINES[(h >>> 0) % AUDITION_LINES.length];
}

/** First dialogue line the character speaks anywhere in the production. */
async function firstLineForSpeaker(projectId: string, speaker: string): Promise<string | null> {
  try {
    const shots = await db.shot.findMany({
      where: { scene: { episode: { season: { projectId } } }, dialogue: { not: null } },
      select: { dialogue: true },
      orderBy: { createdAt: "asc" },
    });
    const want = speaker.trim().toLowerCase();
    for (const shot of shots) {
      for (const line of parseDialogue(shot.dialogue)) {
        if (line.speaker && line.speaker.trim().toLowerCase() === want && line.text.trim()) {
          return line.text.trim();
        }
      }
    }
  } catch {
    // fall through to the default audition read
  }
  return null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const voiceId = String(body.voiceId ?? "");
  if (!isVoiceId(voiceId)) {
    return NextResponse.json({ error: "voiceId must be a catalog voice: tongtong, chuichui, xiaochen, jam, kazi, douji, luodo" }, { status: 400 });
  }
  const deliveryId = isDeliveryId(body.delivery) ? body.delivery : "NEUTRAL";
  const profile = deliveryProfile(deliveryId);

  const speaker = body.speaker ? String(body.speaker).trim().slice(0, 60) : "";
  const projectId = body.projectId ? String(body.projectId) : "";
  const explicit = body.text ? String(body.text).trim().slice(0, 300) : "";

  let text = explicit;
  let source: "custom" | "character line" | "sample" = explicit ? "custom" : "sample";
  if (!text && speaker && projectId) {
    const line = await firstLineForSpeaker(projectId, speaker);
    if (line) {
      text = line;
      source = "character line";
    }
  }
  if (!text) text = defaultAuditionLine(voiceId);
  if (text.length > 1024) text = text.slice(0, 1023);

  const spoken = shapeLineForDelivery(text, deliveryId);
  const speed = Math.min(2, Math.max(0.5, Math.round(profile.speedMul * 100) / 100));

  let wav: Buffer;
  try {
    const zai = await ZAI.create();
    const res = await zai.audio.tts.create({
      input: spoken,
      voice: voiceId,
      speed,
      response_format: "wav",
      stream: false,
    });
    wav = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  } catch (err) {
    return NextResponse.json(
      { error: `Audition render failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 },
    );
  }
  if (wav.length < 100) return NextResponse.json({ error: "Audition render came back empty" }, { status: 502 });

  return NextResponse.json({
    audio: wav.toString("base64"),
    mimeType: "audio/wav",
    durationMs: wavDurationMs(wav),
    text,
    spoken,
    source,
    delivery: {
      id: deliveryId,
      label: profile.label,
      speed,
    },
    voiceId,
    speaker: speaker || null,
  });
}

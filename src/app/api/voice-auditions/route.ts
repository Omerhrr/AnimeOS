export const dynamic = "force-dynamic";

import ZAI from "z-ai-web-dev-sdk";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryProfile, isDeliveryId, shapeLineForDelivery } from "@/lib/comic/delivery";
import { parseDialogue } from "@/lib/comic/dialogue";
import { isVoiceId } from "@/lib/comic/voice-catalog";
import { wavDurationMs } from "@/lib/ai/voice-render";
import { resolveVoiceCast } from "@/lib/ai/voice-casting";
import { shiftWavPlayback, ttsSpeedAndPitchFactor } from "@/lib/ai/wav-dsp";

// ─────────────────────────────────────────────────────────────
// VOICE AUDITION (casting board preview)
//
// A throwaway TTS render used to audition a voice BEFORE casting:
// no cue is touched, no take is stored, nothing enters the stems.
// The sample line is, in priority order: an explicit line from the
// board, the character's own first dialogue line in the production
// (speaker lookup), or a classic audition read.
//
// STATE AUDITIONS: pass a characterState id to hear how that state
// performs - its variant voice (when one is bound) plus its
// speed/pitch hints, all without persisting anything.
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

  const deliveryId = isDeliveryId(body.delivery) ? body.delivery : "NEUTRAL";
  const profile = deliveryProfile(deliveryId);

  // STATE audition: a development state supplies the variant voice and
  // the speed/pitch hints; the character name supplies the line lookup
  let stateBlock: {
    stateId: string;
    stateLabel: string;
    episodeNumber: number | null;
    variantVoiceId: string | null;
    speedHint: number | null;
    pitchHint: number | null;
  } | null = null;
  let stateSpeaker = "";
  const stateId = body.stateId ? String(body.stateId) : "";
  if (stateId) {
    const state = await db.characterState.findUnique({ where: { id: stateId }, include: { character: true } });
    if (!state) return NextResponse.json({ error: "State not found" }, { status: 404 });
    const speedHint = state.speedHint != null && Number.isFinite(state.speedHint) ? state.speedHint : null;
    const pitchHint = state.pitchHint != null && Number.isFinite(state.pitchHint) ? state.pitchHint : null;
    stateBlock = {
      stateId: state.id,
      stateLabel: state.label,
      episodeNumber: state.episodeNumber,
      variantVoiceId: state.voiceVariant && isVoiceId(state.voiceVariant) ? state.voiceVariant : null,
      speedHint: speedHint != null ? Math.min(2, Math.max(0.5, speedHint)) : null,
      pitchHint: pitchHint != null ? Math.min(2, Math.max(0.5, pitchHint)) : null,
    };
    stateSpeaker = state.character?.name ?? "";
  }

  const projectId = body.projectId ? String(body.projectId) : "";
  let voiceId = String(body.voiceId ?? stateBlock?.variantVoiceId ?? "");
  // a state with no variant voice auditions on the character's current
  // cast/default voice, exactly as a take in that state would perform
  if (!voiceId && stateBlock) {
    voiceId = (await resolveVoiceCast(stateSpeaker, projectId)).voiceId;
  }
  if (!isVoiceId(voiceId)) {
    return NextResponse.json(
      { error: "voiceId must be a catalog voice (or a state with a variant voice): tongtong, chuichui, xiaochen, jam, kazi, douji, luodo" },
      { status: 400 },
    );
  }

  const speaker = (body.speaker ? String(body.speaker).trim() : stateSpeaker).slice(0, 60);
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
  // state speed hint multiplies the register's pace; the pitch hint is
  // realized by rendering at compensated speed then shifting playback
  const hintSpeed = stateBlock?.speedHint ?? 1;
  const targetSpeed = Math.min(2, Math.max(0.5, Math.round(profile.speedMul * hintSpeed * 100) / 100));
  const { ttsSpeed, factor } = ttsSpeedAndPitchFactor(targetSpeed, stateBlock?.pitchHint ?? 1);

  let wav: Buffer;
  try {
    const zai = await ZAI.create();
    const res = await zai.audio.tts.create({
      input: spoken,
      voice: voiceId,
      speed: ttsSpeed,
      response_format: "wav",
      stream: false,
    });
    wav = shiftWavPlayback(Buffer.from(new Uint8Array(await res.arrayBuffer())), factor);
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
      speed: targetSpeed,
    },
    pitch: stateBlock?.pitchHint ?? 1,
    voiceId,
    speaker: speaker || null,
    variant: stateBlock,
  });
}

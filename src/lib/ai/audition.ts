import { mkdir, writeFile } from "fs/promises";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { deliveryProfile, shapeLineForDelivery, type DeliveryId } from "@/lib/comic/delivery";
import { parseDialogue } from "@/lib/comic/dialogue";
import { shiftWavPlayback, ttsSpeedAndPitchFactor } from "@/lib/ai/wav-dsp";
import { wavDurationMs } from "@/lib/ai/voice-render";
import type { AuditionPreview } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// AUDITION CORE (shared by the casting board API and DSH)
//
// A throwaway TTS render used to hear a performance BEFORE it is
// bound: no cue is touched, no take is stored, nothing enters the
// stems. The sample line is, in priority order: an explicit line,
// the character's own first dialogue line in the production
// (speaker lookup), or a classic audition read.
//
// Two consumers:
//  - /api/voice-auditions (casting board): returns the WAV as base64
//  - set_state_voice_variant (DSH): after binding a variant it renders
//    an audition of the NEW performance, saves it under
//    public/auditions/ and attaches a playable preview to the tool
//    result so the proposal lives inside the same turn
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
export async function firstLineForSpeaker(projectId: string, speaker: string): Promise<string | null> {
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

export interface AuditionRequest {
  projectId: string;
  speaker: string;
  voiceId: string; // validated catalog voice
  deliveryId: DeliveryId;
  /** State speed hint: multiplier on the register's pace (1 = none). */
  speedHint?: number | null;
  /** State pitch hint: playback pitch factor (<1 deeper, >1 higher). */
  pitchHint?: number | null;
  /** Explicit line; when empty the speaker's own first line (or a sample read) is used. */
  text?: string;
}

export interface AuditionRender {
  wav: Buffer;
  text: string;
  spoken: string;
  source: "custom" | "character line" | "sample";
  voiceId: string;
  deliveryId: DeliveryId;
  targetSpeed: number; // effective pace incl. hint
  pitch: number; // effective pitch factor
  durationMs: number | null;
}

/** Render one audition take: TTS at compensated speed, then the pitch-bend playback shift. */
export async function renderAudition(req: AuditionRequest): Promise<AuditionRender> {
  const profile = deliveryProfile(req.deliveryId);

  let text = req.text?.trim() ?? "";
  let source: AuditionRender["source"] = text ? "custom" : "sample";
  if (!text && req.speaker && req.projectId) {
    const line = await firstLineForSpeaker(req.projectId, req.speaker);
    if (line) {
      text = line;
      source = "character line";
    }
  }
  if (!text) text = defaultAuditionLine(req.voiceId);
  if (text.length > 1024) text = text.slice(0, 1023);

  const spoken = shapeLineForDelivery(text, req.deliveryId);
  // state speed hint multiplies the register's pace; the pitch hint is
  // realized by rendering at compensated speed then shifting playback
  const hintSpeed = req.speedHint != null && Number.isFinite(req.speedHint) ? Math.min(2, Math.max(0.5, req.speedHint)) : 1;
  const targetSpeed = Math.min(2, Math.max(0.5, Math.round(profile.speedMul * hintSpeed * 100) / 100));
  const hintPitch = req.pitchHint != null && Number.isFinite(req.pitchHint) ? Math.min(2, Math.max(0.5, req.pitchHint)) : 1;
  const { ttsSpeed, factor } = ttsSpeedAndPitchFactor(targetSpeed, hintPitch);

  const zai = await ZAI.create();
  const res = await zai.audio.tts.create({
    input: spoken,
    voice: req.voiceId,
    speed: ttsSpeed,
    response_format: "wav",
    stream: false,
  });
  const wav = shiftWavPlayback(Buffer.from(new Uint8Array(await res.arrayBuffer())), factor);

  return {
    wav,
    text,
    spoken,
    source,
    voiceId: req.voiceId,
    deliveryId: req.deliveryId,
    targetSpeed,
    pitch: hintPitch,
    durationMs: wavDurationMs(wav),
  };
}

/**
 * Audition a state's NEW performance right after a variant bind and
 * save it as a static WAV. Returns the preview the DSH tool attaches
 * to its result, or null when the render fails (the bind itself stays
 * successful and the failure is noted in the result text instead).
 */
export async function renderVariantAudition(opts: {
  projectId: string;
  characterName: string;
  stateId: string;
  stateLabel: string;
  voiceId: string;
  deliveryId: DeliveryId;
  speedHint?: number | null;
  pitchHint?: number | null;
}): Promise<AuditionPreview | null> {
  try {
    const rendered = await renderAudition({
      projectId: opts.projectId,
      speaker: opts.characterName,
      voiceId: opts.voiceId,
      deliveryId: opts.deliveryId,
      speedHint: opts.speedHint,
      pitchHint: opts.pitchHint,
    });
    if (rendered.wav.length < 100) return null;

    const dir = path.join(process.cwd(), "public", "auditions");
    await mkdir(dir, { recursive: true });
    const file = `variant-${opts.stateId}.wav`;
    await writeFile(path.join(dir, file), rendered.wav);

    return {
      url: `/auditions/${file}?v=${Date.now()}`,
      mimeType: "audio/wav",
      durationMs: rendered.durationMs,
      text: rendered.text,
      source: rendered.source === "character line" ? "character line" : "sample",
      voiceId: rendered.voiceId,
      deliveryId: rendered.deliveryId,
      speed: rendered.targetSpeed,
      pitch: rendered.pitch,
      stateLabel: opts.stateLabel,
      characterName: opts.characterName,
    };
  } catch {
    return null;
  }
}

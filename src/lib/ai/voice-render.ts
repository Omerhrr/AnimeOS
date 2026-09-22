import { mkdir, writeFile } from "fs/promises";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { resolveTakePlan, VoicePlanError, type TakeOverrides } from "@/lib/ai/voice-plan";
import { shiftWavPlayback, ttsSpeedAndPitchFactor } from "@/lib/ai/wav-dsp";

// ─────────────────────────────────────────────────────────────
// VOICE RENDER CORE
//
// Renders one VOICE cue into a real TTS take (24kHz mono WAV under
// public/voices/{cueId}.wav, playback-rate shifted when a state pitch
// hint is active) and stamps the cue with the take's input snapshot
// (voiceSig) so the per-episode direction diff can tell which takes
// are stale. Shared by the render API route and the selective
// re-render in the direction-diff route.
// ─────────────────────────────────────────────────────────────

export class VoiceRenderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Parse the real playback duration (ms) out of a standard WAV file buffer. */
export function wavDurationMs(buf: Buffer): number | null {
  try {
    if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
    let off = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === "fmt ") {
        // fmt body: audioFormat(2) channels(2) sampleRate(4) byteRate(4)
        byteRate = buf.readUInt32LE(off + 8 + 8);
      }
      if (id === "data") {
        dataSize = size;
        break;
      }
      off += 8 + size + (size % 2);
    }
    if (byteRate <= 0 || dataSize <= 0) return null;
    return Math.round((dataSize / byteRate) * 1000);
  } catch {
    return null;
  }
}

export interface RenderTakeResult {
  cue: Record<string, unknown>; // the updated AudioCue row
  bytes: number;
  text: string; // shaped text that was spoken
  delivery: {
    id: string;
    label: string;
    source: string;
    stateLabel: string | null;
    speed: number;
  };
  cast: {
    artistName: string | null;
    voiceId: string;
    source: string;
    variant: { voiceId: string; stateLabel: string } | null; // state voice variant that overrode the cast voice, if any
  };
  hints: { stateLabel: string; speed: number | null; pitch: number | null } | null; // state performance hints active on this take
  stateOverride: string | null; // per-line state override the dialogue line forces (null = auto)
  pitch: number; // effective pitch factor the take was bent by (1 = natural)
  direction: {
    note: string | null;
    standingDelivery: string | null;
    lineDelivery: string | null;
  };
}

export async function renderVoiceTake(cueId: string, overrides: TakeOverrides = {}): Promise<RenderTakeResult> {
  const cue = await db.audioCue.findUnique({
    where: { id: cueId },
    include: {
      shot: { include: { scene: { include: { episode: { include: { season: true } } } } } },
    },
  });
  if (!cue) throw new VoiceRenderError("Cue not found", 404);
  if (cue.kind !== "VOICE") throw new VoiceRenderError("Voice renders apply to VOICE cues only", 400);

  const projectId = cue.shot.scene.episode.season.projectId;
  const episodeNumber = cue.shot.scene.episode?.number ?? null;

  let plan;
  try {
    plan = await resolveTakePlan(cue, projectId, episodeNumber, overrides);
  } catch (err) {
    if (err instanceof VoicePlanError) throw new VoiceRenderError(err.message, 400);
    throw err;
  }

  let wav: Buffer;
  try {
    const zai = await ZAI.create();
    // state pitch hint: render at compensated speed, then shift the
    // playback rate so the take lands on plan.speed with the bend
    const { ttsSpeed, factor } = ttsSpeedAndPitchFactor(plan.speed, plan.pitch);
    const res = await zai.audio.tts.create({
      input: plan.spoken,
      voice: plan.voiceId, // state voice variant when active, else the cast voice
      speed: ttsSpeed,
      response_format: "wav",
      stream: false,
    });
    const arrayBuffer = await res.arrayBuffer();
    wav = shiftWavPlayback(Buffer.from(new Uint8Array(arrayBuffer)), factor);
  } catch (err) {
    throw new VoiceRenderError(`TTS render failed: ${err instanceof Error ? err.message : "unknown error"}`, 502);
  }
  if (wav.length < 100) throw new VoiceRenderError("TTS returned an empty take", 502);

  const dir = path.join(process.cwd(), "public", "voices");
  await mkdir(dir, { recursive: true });
  const file = `${cueId}.wav`;
  await writeFile(path.join(dir, file), wav);

  const actualMs = wavDurationMs(wav) ?? Math.round((wav.length / (24000 * 2)) * 1000);

  // Widen the cue slot when the real take needs more room (stays inside the shot timeline)
  const timelineMs = Math.max(1, Math.round((cue.shot.duration ?? 4) * 1000));
  const maxSlot = Math.max(50, timelineMs - cue.startMs);
  const durationMs = actualMs && actualMs > cue.durationMs ? Math.min(maxSlot, actualMs) : cue.durationMs;

  const stateLabel = plan.stateOverride
    ? [plan.variant ? `${plan.variant.stateLabel} (voice variant)` : plan.delivery.stateLabel, "line override"]
        .filter(Boolean).join(" - ")
    : plan.variant ? `${plan.variant.stateLabel} (voice variant)` : plan.delivery.stateLabel;

  const updated = await db.audioCue.update({
    where: { id: cueId },
    data: {
      voiceUrl: `/voices/${file}?v=${Date.now()}`,
      voiceActor: plan.voiceId, // the voice actually performed (variant or cast)
      voiceCast: plan.cast.artistName,
      voiceSpeed: plan.baseSpeed, // base only; effective speed = base x delivery multiplier
      voiceDurationMs: actualMs,
      voiceState: plan.delivery.id,
      voiceStateLabel: stateLabel,
      voiceSig: JSON.stringify(plan.sig), // snapshot for the direction diff
      durationMs,
    },
  });

  return {
    cue: updated as unknown as Record<string, unknown>,
    bytes: wav.length,
    text: plan.spoken,
    delivery: {
      id: plan.delivery.id,
      label: plan.delivery.id.charAt(0) + plan.delivery.id.slice(1).toLowerCase(),
      source: plan.delivery.source,
      stateLabel: plan.delivery.stateLabel,
      speed: plan.speed,
    },
    cast: {
      artistName: plan.cast.artistName,
      voiceId: plan.voiceId,
      source: plan.cast.source,
      variant: plan.variant ? { voiceId: plan.variant.voiceId, stateLabel: plan.variant.stateLabel } : null,
    },
    hints: plan.hints
      ? { stateLabel: plan.hints.stateLabel, speed: plan.hints.speed, pitch: plan.hints.pitch }
      : null,
    stateOverride: plan.stateOverride,
    pitch: plan.pitch,
    direction: {
      note: cue.voiceNote,
      standingDelivery: cue.voiceDelivery,
      lineDelivery: plan.delivery.source === "line" ? plan.delivery.id : null,
    },
  };
}

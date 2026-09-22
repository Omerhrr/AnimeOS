export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import {
  classifyStateDelivery, deliveryProfile, isDeliveryId, shapeLineForDelivery,
  type DeliveryId,
} from "@/lib/comic/delivery";

// Real TTS voice renders for VOICE audio cues. A rendered take is a
// 24kHz mono WAV stored under public/voices/{cueId}.wav; the cue keeps
// the actual duration so stems and manifests can carry real speech.
// Takes are performed in the speaker's current character state:
// the delivery (neutral / excited / injured) resolves from the
// character's episode-effective CharacterState label unless the
// caller overrides it.

export const VOICES = [
  { id: "tongtong", blurb: "Warm, gentle" },
  { id: "chuichui", blurb: "Bright, playful" },
  { id: "xiaochen", blurb: "Calm, steady" },
  { id: "jam", blurb: "British, refined" },
  { id: "kazi", blurb: "Clear, neutral" },
  { id: "douji", blurb: "Natural, flowing" },
  { id: "luodo", blurb: "Expressive, resonant" },
] as const;

const VOICE_IDS: Set<string> = new Set(VOICES.map((v) => v.id));
type VoiceId = (typeof VOICES)[number]["id"];

export async function GET() {
  return NextResponse.json({ voices: VOICES });
}

/** Deterministic default casting: the same speaker always lands on the same voice. */
export function defaultVoiceFor(speaker: string): string {
  let h = 2166136261;
  for (let i = 0; i < speaker.length; i++) {
    h ^= speaker.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return VOICES[(h >>> 0) % VOICES.length].id;
}

/** Parse the real playback duration (ms) out of a standard WAV file buffer. */
function wavDurationMs(buf: Buffer): number | null {
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

// ── character-state delivery resolution ──

interface ResolvedDelivery {
  id: DeliveryId;
  source: "auto" | "manual";
  stateLabel: string | null; // character state the delivery came from
}

/**
 * Resolve the speaker's current state for this shot's episode and
 * classify it into a delivery profile. Same-episode TEMPORARY states
 * (dramatic beats like "Battle-damaged (temple fight)") win over the
 * latest PERMANENT progression state; no match reads neutral.
 */
async function resolveAutoDelivery(
  speaker: string,
  episodeNumber: number | null,
  projectId: string,
): Promise<ResolvedDelivery> {
  const fallback: ResolvedDelivery = { id: "NEUTRAL", source: "auto", stateLabel: null };
  if (!speaker) return fallback;
  try {
    const characters = await db.character.findMany({
      where: { projectId },
      include: { states: true },
    });
    const character = characters.find((c) => c.name.trim().toLowerCase() === speaker.toLowerCase());
    if (!character) return fallback;

    const candidates = character.states.filter((s) => {
      if (s.episodeNumber == null) return false;
      if (s.stateType === "TEMPORARY") return s.episodeNumber === episodeNumber;
      return episodeNumber == null || s.episodeNumber <= episodeNumber;
    });
    // temporary beats first, then the latest episode-resolved state
    candidates.sort((a, b) => {
      const ta = a.stateType === "TEMPORARY" ? 1 : 0;
      const tb = b.stateType === "TEMPORARY" ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return (b.episodeNumber ?? -1) - (a.episodeNumber ?? -1);
    });

    for (const state of candidates) {
      const hit = classifyStateDelivery(state.label);
      if (hit) return { id: hit, source: "auto", stateLabel: state.label };
    }
    // no classified state: fall back to the canonical condition summary
    const canonical = classifyStateDelivery(character.canonicalState ?? "");
    if (canonical) return { id: canonical, source: "auto", stateLabel: character.canonicalState?.slice(0, 80) ?? null };
    return fallback;
  } catch {
    return fallback;
  }
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

  const cue = await db.audioCue.findUnique({
    where: { id: cueId },
    include: {
      shot: { include: { scene: { include: { episode: { include: { season: true } } } } } },
    },
  });
  if (!cue) return NextResponse.json({ error: "Cue not found" }, { status: 404 });
  if (cue.kind !== "VOICE") {
    return NextResponse.json({ error: "Voice renders apply to VOICE cues only" }, { status: 400 });
  }

  // VOICE labels may carry a "Speaker: line" prefix: speak only the line
  const rawLabel = cue.label;
  const text = (rawLabel.includes(": ") ? rawLabel.split(": ").slice(1).join(": ") : rawLabel).trim();
  if (!text) return NextResponse.json({ error: "Cue label has no speakable text" }, { status: 400 });
  if (text.length > 1024) {
    return NextResponse.json({ error: `Line is ${text.length} chars, TTS accepts up to 1024` }, { status: 400 });
  }

  const speaker = rawLabel.includes(": ") ? rawLabel.split(":")[0].trim() : "";

  // delivery: manual override wins, otherwise resolve from the
  // speaker's character state at this shot's episode
  let delivery: ResolvedDelivery;
  if (isDeliveryId(body.delivery)) {
    delivery = { id: body.delivery, source: "manual", stateLabel: null };
  } else {
    delivery = await resolveAutoDelivery(
      speaker,
      cue.shot.scene.episode?.number ?? null,
      cue.shot.scene.episode.season.projectId,
    );
  }
  const profile = deliveryProfile(delivery.id);

  const voice = (VOICE_IDS.has(String(body.voice))
    ? String(body.voice)
    : defaultVoiceFor(speaker || rawLabel)) as VoiceId;
  const speedNum = Number(body.speed);
  const baseSpeed = Number.isFinite(speedNum) ? Math.min(2, Math.max(0.5, speedNum)) : 1.0;
  // the delivery bends the performance; the cue keeps the user's base
  // speed so re-renders never compound the multiplier
  const speed = Math.min(2, Math.max(0.5, Math.round(baseSpeed * profile.speedMul * 100) / 100));

  // performance shaping leans the read into the state
  const spoken = shapeLineForDelivery(text, profile.id);

  let wav: Buffer;
  try {
    const zai = await ZAI.create();
    const res = await zai.audio.tts.create({
      input: spoken,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });
    const arrayBuffer = await res.arrayBuffer();
    wav = Buffer.from(new Uint8Array(arrayBuffer));
  } catch (err) {
    return NextResponse.json(
      { error: `TTS render failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 },
    );
  }
  if (wav.length < 100) return NextResponse.json({ error: "TTS returned an empty take" }, { status: 502 });

  const dir = path.join(process.cwd(), "public", "voices");
  await mkdir(dir, { recursive: true });
  const file = `${cueId}.wav`;
  await writeFile(path.join(dir, file), wav);

  const actualMs = wavDurationMs(wav) ?? Math.round((wav.length / (24000 * 2)) * 1000);

  // Widen the cue slot when the real take needs more room (stays inside the shot timeline)
  const timelineMs = Math.max(1, Math.round((cue.shot.duration ?? 4) * 1000));
  const maxSlot = Math.max(50, timelineMs - cue.startMs);
  const durationMs = actualMs && actualMs > cue.durationMs ? Math.min(maxSlot, actualMs) : cue.durationMs;

  const updated = await db.audioCue.update({
    where: { id: cueId },
    data: {
      voiceUrl: `/voices/${file}?v=${Date.now()}`,
      voiceActor: voice,
      voiceSpeed: baseSpeed, // base only; effective speed = base x delivery multiplier
      voiceDurationMs: actualMs,
      voiceState: profile.id,
      voiceStateLabel: delivery.stateLabel,
      durationMs,
    },
  });

  return NextResponse.json({
    cue: updated,
    bytes: wav.length,
    text: spoken,
    delivery: {
      id: profile.id,
      label: profile.label,
      source: delivery.source,
      stateLabel: delivery.stateLabel,
      speed,
    },
  });
}

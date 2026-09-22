export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliveryProfile, isDeliveryId } from "@/lib/comic/delivery";
import { isVoiceId } from "@/lib/comic/voice-catalog";
import { currentTakeForLine, renderAudition } from "@/lib/ai/audition";
import { resolveVoiceCast } from "@/lib/ai/voice-casting";

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
// speed/pitch hints, all without persisting anything. The render
// core lives in lib/ai/audition.ts, shared with the DSH bind tool.
//
// A/B: when the auditioned line already has a stored take, the
// response carries it as the current side, so the board can play
// old vs new back to back before anything is committed.
// ─────────────────────────────────────────────────────────────

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

  let rendered;
  try {
    rendered = await renderAudition({
      projectId,
      speaker,
      voiceId,
      deliveryId,
      speedHint: stateBlock?.speedHint,
      pitchHint: stateBlock?.pitchHint,
      text: explicit || undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Audition render failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 },
    );
  }
  if (rendered.wav.length < 100) return NextResponse.json({ error: "Audition render came back empty" }, { status: 502 });

  // A/B side: the stored take of the same line, when one exists
  // (sample reads have no production line to compare against)
  const current = rendered.source === "sample" || !speaker
    ? null
    : await currentTakeForLine(projectId, speaker, rendered.text);

  return NextResponse.json({
    audio: rendered.wav.toString("base64"),
    mimeType: "audio/wav",
    durationMs: rendered.durationMs,
    text: rendered.text,
    spoken: rendered.spoken,
    source: rendered.source,
    delivery: {
      id: rendered.deliveryId,
      label: profile.label,
      speed: rendered.targetSpeed,
    },
    pitch: rendered.pitch,
    voiceId: rendered.voiceId,
    speaker: speaker || null,
    variant: stateBlock,
    current,
  });
}

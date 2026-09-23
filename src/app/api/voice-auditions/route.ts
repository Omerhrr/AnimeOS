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
//
// ENSEMBLE AUDITIONS: pass ensemble (2..6 entries of {speaker?,
// stateId?}) to render EVERY speaker in ONE call - each row keeps
// the full single-audition shape (proposed render + the stored take
// of the same line as its A side), so the board lays out
// multi-speaker A/B rows and can play the ensemble in sequence.
// An entry that cannot resolve (unknown state, no speaker) is
// skipped and reported instead of sinking the batch.
// ─────────────────────────────────────────────────────────────

const ENSEMBLE_MAX = 6;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const deliveryId = isDeliveryId(body.delivery) ? body.delivery : "NEUTRAL";
  const profile = deliveryProfile(deliveryId);

  // ENSEMBLE branch: one call, one row per speaker, nothing persisted
  if (body.ensemble !== undefined && body.ensemble !== null && body.ensemble !== "") {
    const raw = body.ensemble;
    const list = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: "ensemble must be an array of {speaker?, stateId?} entries" }, { status: 400 });
    }
    if (list.length < 2) {
      return NextResponse.json({ error: "an ensemble audition needs at least 2 speakers" }, { status: 400 });
    }
    if (list.length > ENSEMBLE_MAX) {
      return NextResponse.json({ error: `ensemble supports at most ${ENSEMBLE_MAX} speakers per batch (got ${list.length})` }, { status: 400 });
    }
    const explicit = body.text ? String(body.text).trim().slice(0, 300) : "";
    const rows: Array<Record<string, unknown>> = [];
    const skipped: Array<{ entry: string; reason: string }> = [];
    const seen = new Set<string>();
    for (const item of list) {
      const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const stateId = entry.stateId ? String(entry.stateId) : "";
      const speakerArg = entry.speaker ? String(entry.speaker).trim().slice(0, 60) : "";
      let speaker = speakerArg;
      let voiceId = "";
      let speedHint: number | null = null;
      let pitchHint: number | null = null;
      let variant: Record<string, unknown> | null = null;
      if (stateId) {
        const state = await db.characterState.findUnique({ where: { id: stateId }, include: { character: true } });
        if (!state) {
          skipped.push({ entry: speakerArg || stateId, reason: "state not found" });
          continue;
        }
        speedHint = state.speedHint != null && Number.isFinite(state.speedHint) ? Math.min(2, Math.max(0.5, state.speedHint)) : null;
        pitchHint = state.pitchHint != null && Number.isFinite(state.pitchHint) ? Math.min(2, Math.max(0.5, state.pitchHint)) : null;
        speaker = speaker || state.character?.name || "";
        variant = {
          stateId: state.id,
          stateLabel: state.label,
          episodeNumber: state.episodeNumber,
          variantVoiceId: state.voiceVariant && isVoiceId(state.voiceVariant) ? state.voiceVariant : null,
          speedHint,
          pitchHint,
        };
        voiceId = variant.variantVoiceId as string | null ?? "";
        if (!voiceId) voiceId = (await resolveVoiceCast(speaker, String(body.projectId ?? ""))).voiceId;
      } else if (speakerArg) {
        voiceId = (await resolveVoiceCast(speaker, String(body.projectId ?? ""))).voiceId;
      } else {
        skipped.push({ entry: "(entry)", reason: "needs a speaker or a stateId" });
        continue;
      }
      if (!isVoiceId(voiceId)) {
        skipped.push({ entry: speaker, reason: `no catalog voice resolves for this speaker (got '${voiceId}')` });
        continue;
      }
      const key = `${speaker.toLowerCase()}::${stateId}`;
      if (seen.has(key)) {
        skipped.push({ entry: speaker, reason: "duplicate speaker in the batch" });
        continue;
      }
      seen.add(key);
      try {
        const rendered = await renderAudition({
          projectId: String(body.projectId ?? ""),
          speaker,
          voiceId,
          deliveryId,
          speedHint,
          pitchHint,
          text: explicit || undefined,
        });
        if (rendered.wav.length < 100) {
          skipped.push({ entry: speaker, reason: "render came back empty" });
          continue;
        }
        const current = rendered.source === "sample" || !speaker
          ? null
          : await currentTakeForLine(String(body.projectId ?? ""), speaker, rendered.text);
        rows.push({
          audio: rendered.wav.toString("base64"),
          mimeType: "audio/wav",
          durationMs: rendered.durationMs,
          text: rendered.text,
          spoken: rendered.spoken,
          source: rendered.source,
          delivery: { id: rendered.deliveryId, label: profile.label, speed: rendered.targetSpeed },
          pitch: rendered.pitch,
          voiceId: rendered.voiceId,
          speaker: speaker || null,
          variant,
          current,
        });
      } catch (err) {
        skipped.push({ entry: speaker, reason: `render failed: ${err instanceof Error ? err.message : "unknown error"}` });
      }
    }
    return NextResponse.json({ ensemble: true, rows, skipped });
  }

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

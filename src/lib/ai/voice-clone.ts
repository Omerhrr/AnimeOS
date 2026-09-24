// ─────────────────────────────────────────────────────────────
// VOICE-CLONE SLOT - a character's voice is trained once,
// performed everywhere
//
// The voice catalog is a fixed roster of TTS voices, cast by artist.
// A character's own voice - the one the show actually established
// across their rendered takes - has never been reproducible. This
// slot closes that gap through a provider seam, honestly:
//
//   TRAIN    - the character's rendered VOICE takes (the real WAVs
//     under public/voices/, capped) are POSTed to the configured
//     cloning provider (ANIMEOS_VOICE_CLONE_URL, optional
//     ANIMEOS_VOICE_CLONE_KEY bearer), which returns the trained
//     voice id. Persisted on the character (cloneVoiceId) with the
//     training time, and the event lands in the production history.
//   PERFORM  - when a cue resolves to a character with a trained
//     voice AND the provider is configured, the take is rendered
//     through the provider ({ voiceId, text, speed } -> WAV) instead
//     of catalog TTS. A state voice VARIANT still outranks the clone
//     (deliberate per-state direction), and every failure degrades
//     to the catalog voice with an honest "clone-fallback" note.
//   HONESTY  - no provider configured, no takes to train from, or a
//     failed render: every path reports what happened and falls back
//     to the catalog. Nothing pretends to be a clone.
// ─────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

export interface CloneProvider {
  url: string;
  key: string | null;
}

/** The env-gated cloning provider; null when the studio has none. */
export function cloneProvider(): CloneProvider | null {
  const url = String(process.env.ANIMEOS_VOICE_CLONE_URL ?? "").trim();
  if (!url) return null;
  const key = String(process.env.ANIMEOS_VOICE_CLONE_KEY ?? "").trim() || null;
  return { url, key };
}

export interface ReferenceTake {
  name: string;
  base64: string;
  bytes: number;
}

const MAX_REFERENCE_TAKES = 6;
const MAX_TAKE_BYTES = 2 * 1024 * 1024; // 2MB per take (~40s of 24kHz mono)

/** The character's rendered VOICE takes, newest first, capped. */
export async function collectReferenceTakes(characterId: string): Promise<{ takes: ReferenceTake[]; skipped: number; totalMs: number }> {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return { takes: [], skipped: 0, totalMs: 0 };
  const cues = await db.audioCue.findMany({
    where: {
      kind: "VOICE",
      voiceUrl: { not: null },
      label: { startsWith: `${character.name}: ` },
      shot: { scene: { episode: { season: { projectId: character.projectId } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  const takes: ReferenceTake[] = [];
  let skipped = 0;
  let totalMs = 0;
  for (const cue of cues) {
    if (takes.length >= MAX_REFERENCE_TAKES) break;
    const file = path.join(process.cwd(), "public", String(cue.voiceUrl).split("?")[0].replace(/^\//, ""));
    try {
      if (!fs.existsSync(file)) { skipped += 1; continue; }
      const bytes = fs.statSync(file).size;
      if (bytes > MAX_TAKE_BYTES) { skipped += 1; continue; }
      const buf = fs.readFileSync(file);
      takes.push({ name: path.basename(file), base64: buf.toString("base64"), bytes });
      totalMs += cue.voiceDurationMs ?? 0;
    } catch {
      skipped += 1;
    }
  }
  return { takes, skipped, totalMs };
}

export interface CloneTrainResult {
  characterId: string;
  characterName: string;
  voiceId: string;
  takes: number;
  totalMs: number;
  trainedAt: string;
}

async function clonePost(body: Record<string, unknown>, timeoutMs: number): Promise<{ status: number; json: Record<string, unknown> | null; buf: Buffer | null; contentType: string }> {
  const provider = cloneProvider();
  if (!provider) throw new Error("no clone provider");
  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json, buf: null, contentType };
  }
  const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  return { status: res.status, json: null, buf, contentType };
}

/**
 * Train the character's voice from their rendered takes. Honest at
 * every step: no provider, no takes, a provider error or a missing
 * voiceId in the response all return an error string instead of
 * pretending. Success persists cloneVoiceId + lands an event.
 */
export async function trainCharacterVoice(characterId: string): Promise<{ ok: true; result: CloneTrainResult } | { ok: false; error: string }> {
  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return { ok: false, error: "Character not found" };
  if (!cloneProvider()) {
    return { ok: false, error: "no clone provider configured (set ANIMEOS_VOICE_CLONE_URL) - the catalog voice keeps performing" };
  }

  const { takes, totalMs } = await collectReferenceTakes(characterId);
  if (takes.length === 0) {
    return { ok: false, error: "no rendered takes to train from - render voice takes for this character's lines first (direct_voice_takes, or Render voices on the sound timeline)" };
  }

  let voiceId: string | null = null;
  try {
    const res = await clonePost({ characterName: character.name, takes: takes.map((t) => ({ name: t.name, audio_base64: t.base64 })) }, 60_000);
    if (!res.json) return { ok: false, error: `clone provider returned no JSON (${res.status})` };
    voiceId = String(res.json.voiceId ?? "") || null;
    if (!voiceId) {
      const detail = String(res.json.error ?? res.json.message ?? "").slice(0, 120);
      return { ok: false, error: `clone provider returned no voice id${detail ? `: ${detail}` : ""}` };
    }
  } catch (err) {
    return { ok: false, error: `clone provider unreachable: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}` };
  }

  const trainedAt = new Date();
  await db.character.update({ where: { id: characterId }, data: { cloneVoiceId: voiceId, cloneTrainedAt: trainedAt } });
  await db.productionEvent.create({
    data: {
      projectId: character.projectId,
      actor: "USER",
      type: "STATE_CHANGE",
      summary: `Voice clone trained - ${character.name}: ${voiceId} (${takes.length} reference take${takes.length === 1 ? "" : "s"}, ${(totalMs / 1000).toFixed(1)}s of performed audio)`,
      payload: JSON.stringify({ characterId, voiceId, takes: takes.length, totalMs }),
    },
  });

  return {
    ok: true,
    result: { characterId: character.id, characterName: character.name, voiceId, takes: takes.length, totalMs, trainedAt: trainedAt.toISOString() },
  };
}

/**
 * Render one line with the character's trained voice through the
 * provider. Returns null on ANY failure - the caller falls back to
 * the catalog voice and names the degradation.
 */
export async function clonedTake(voiceId: string, text: string, speed: number): Promise<Buffer | null> {
  if (!cloneProvider()) return null;
  try {
    const res = await clonePost({ voiceId, text, speed, response_format: "wav" }, 60_000);
    if (res.buf && res.contentType.includes("audio") && res.buf.length > 100) return res.buf;
    if (res.json) {
      const audio = String(res.json.audio_base64 ?? "");
      if (audio.length > 100) return Buffer.from(audio, "base64");
    }
    return null;
  } catch {
    return null;
  }
}

/** Whether the character has a trained voice that can currently perform. */
export function cloneActiveFor(character: { cloneVoiceId: string | null } | null | undefined): boolean {
  return Boolean(character?.cloneVoiceId && cloneProvider());
}

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { analyzeTakeVisemes } from "@/lib/animation/viseme-audio";
import type { Viseme } from "@/lib/animation/lipsync";

// ─────────────────────────────────────────────────────────────
// AUDIO-RENDER CACHE - THE STEM IS REMEMBERED (iteration 102)
//
// The voice pipeline paid the TTS provider for the SAME take over
// and over: a dialogue cue re-rendered (a re-queue, a fix loop, a
// nightly batch) re-called the rate-limited API with an unchanged
// structure, and one 429 storm could grind a batch cadence to a
// halt. The law: a take is a PURE FUNCTION of its structure - the
// voice that performs it, the exact text, the delivery style and
// the speed/pitch hints - so the first take EARNED under a structure
// is REMEMBERED under that structure's composite hash:
//
//   key = sha256-16( canonical({voiceId, text, deliveryStyle,
//                                  speed, pitch}) )
//
// A re-render with an unchanged structure instantly fetches the
// cached STEM (the post-DSP wav, byte-identical) and its VISEME
// MANIFEST (the mouth program derived from that audio) instead of
// making the external call; a changed structure is a new key and a
// fresh take - the cache never guesses a near-miss into a hit.
//
// The rate-limit law rides beside it: a 429 from the TTS provider
// backs off on a fixed doubling schedule (1s, 2s, 4s - three
// retries) before surfacing the failure honestly.
//
// Storage lives in .cache/audio/ (gitignored, self-healing): one
// wav + one json manifest per key. Every read validates; a corrupt
// entry reads as a miss (the cache never serves bytes it cannot
// vouch for). Counters name the cache's own honesty - hits, misses,
// saves, rate-limit waits - for the ledger and the E2E.
// ─────────────────────────────────────────────────────────────

export const AUDIO_CACHE_VERSION = 102;
export const AUDIO_CACHE_DIR = path.join(process.cwd(), ".cache", "audio");

export interface AudioCacheKeyInput {
  voiceId: string; // the voice the take was REQUESTED under (the clone's own id when cloning)
  text: string; // the exact spoken text
  deliveryStyle: string; // the delivery profile id (the take's performance style)
  speed: number; // the speed HINT (1 = natural)
  pitch: number; // the pitch HINT (1 = natural)
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The composite structural hash (pure): the same law the take
 * signature uses for its fields, hashed into one 16-hex key. Any
 * structural change (one character of text, one hint step, a
 * different voice or delivery) lands a different key.
 */
export function audioCacheKey(input: AudioCacheKeyInput): string {
  const canonical = JSON.stringify({
    v: String(input.voiceId ?? ""),
    t: String(input.text ?? ""),
    d: String(input.deliveryStyle ?? ""),
    s: r2(Number(input.speed) || 1),
    p: r2(Number(input.pitch) || 1),
    ver: AUDIO_CACHE_VERSION,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

// ── the manifest ──

export interface AudioCacheManifest {
  key: string;
  version: number;
  voiceId: string; // the requested voice
  performedVoice: string; // the voice that actually performed (a degraded clone names its fallback)
  degraded: boolean;
  deliveryStyle: string;
  speed: number;
  pitch: number;
  ms: number; // the stem's real playback duration
  bytes: number; // the stem's size
  savedAt: string; // ISO
  visemes: Viseme[] | null; // the whole-take mouth program derived from this audio
}

// ── the honest counters ──

const stats = { hits: 0, misses: 0, saved: 0, corruptReads: 0, rateLimitWaits: 0 };

export function audioCacheStats(): { hits: number; misses: number; saved: number; corruptReads: number; rateLimitWaits: number } {
  return { ...stats };
}

export function audioCacheResetStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.saved = 0;
  stats.corruptReads = 0;
  stats.rateLimitWaits = 0;
}

// ── the store ──

function stemPath(key: string): string {
  return path.join(AUDIO_CACHE_DIR, `${key}.wav`);
}

function manifestPath(key: string): string {
  return path.join(AUDIO_CACHE_DIR, `${key}.json`);
}

/**
 * Read one cached take: the stem and its manifest, validated against
 * each other (the manifest's key, the stem's size). Any corruption
 * reads as a miss - named in the counters, never served.
 */
export function audioCacheGet(key: string): { wav: Buffer; manifest: AudioCacheManifest } | null {
  try {
    const raw = fs.readFileSync(stemPath(key));
    const manifest = JSON.parse(fs.readFileSync(manifestPath(key), "utf8")) as AudioCacheManifest;
    if (manifest.key !== key || manifest.version !== AUDIO_CACHE_VERSION) {
      stats.corruptReads += 1;
      return null;
    }
    if (typeof manifest.bytes !== "number" || manifest.bytes !== raw.length) {
      stats.corruptReads += 1;
      return null;
    }
    stats.hits += 1;
    return { wav: raw, manifest };
  } catch {
    stats.misses += 1;
    return null;
  }
}

/**
 * Store one earned take: the stem (post-DSP, the bytes a future hit
 * serves) and its manifest with the whole-take viseme program.
 * Best-effort by law - a failed cache write never fails the render
 * (the take is still delivered; the cache simply stays cold).
 */
export function audioCachePut(key: string, wav: Buffer, meta: Omit<AudioCacheManifest, "key" | "version" | "bytes" | "savedAt" | "visemes">, durationMs?: number): AudioCacheManifest | null {
  try {
    fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
    const visemes = wholeTakeVisemes(wav, durationMs);
    const manifest: AudioCacheManifest = {
      key,
      version: AUDIO_CACHE_VERSION,
      bytes: wav.length,
      savedAt: new Date().toISOString(),
      visemes,
      ...meta,
    };
    const tmp = stemPath(`${key}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, wav);
    fs.renameSync(tmp, stemPath(key));
    fs.writeFileSync(manifestPath(key), JSON.stringify(manifest));
    stats.saved += 1;
    return manifest;
  } catch {
    return null;
  }
}

/** Remove one cached entry (the E2E's exact cleanup). */
export function audioCacheDelete(key: string): void {
  try { fs.unlinkSync(stemPath(key)); } catch { /* already gone */ }
  try { fs.unlinkSync(manifestPath(key)); } catch { /* already gone */ }
}

/** The cache's footprint (the ledger read): entries, stems, bytes. */
export function audioCacheInventory(): { entries: number; bytes: number } {
  try {
    const files = fs.readdirSync(AUDIO_CACHE_DIR).filter((f) => f.endsWith(".wav"));
    let bytes = 0;
    for (const f of files) {
      try { bytes += fs.statSync(path.join(AUDIO_CACHE_DIR, f)).size; } catch { /* raced */ }
    }
    return { entries: files.length, bytes };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

// ── the viseme manifest ──

const visemeMemo = new Map<string, Viseme[] | null>();
const VISEME_MEMO_CAP = 32;

function memoKey(wav: Buffer, span?: { startMs: number; endMs: number }): string {
  const base = createHash("sha256").update(wav).digest("hex").slice(0, 16);
  if (!span) return base;
  return `${base}:${Math.round(span.startMs)}-${Math.round(span.endMs)}`;
}

function memoSet(k: string, v: Viseme[] | null): void {
  if (visemeMemo.size >= VISEME_MEMO_CAP) visemeMemo.delete(visemeMemo.keys().next().value as string);
  visemeMemo.set(k, v);
}

/**
 * The SPAN viseme memo (the payload assembly's read): the mouth
 * program one dialogue span performs over one take, memoized by the
 * take's audio CONTENT + the span window - a re-render of an
 * unchanged take skips the repeated frame-by-frame DSP. Same bytes,
 * same span, same table - or it is not a cache.
 */
export function cachedSpanVisemes(wav: Buffer, span: { startMs: number; endMs: number }): Viseme[] | null {
  const k = memoKey(wav, span);
  const memo = visemeMemo.get(k);
  if (memo !== undefined) return memo;
  const visemes = analyzeTakeVisemes(wav, span);
  memoSet(k, visemes);
  return visemes;
}

/**
 * The whole-take viseme manifest: the mouth program the take's own
 * audio performs over its full duration, derived once per AUDIO
 * CONTENT. Stored alongside the stem at save time; served from the
 * manifest on a hit.
 */
export function wholeTakeVisemes(wav: Buffer, durationMs?: number): Viseme[] | null {
  const k = memoKey(wav);
  const memo = visemeMemo.get(k);
  if (memo !== undefined) return memo;
  const ms = Math.max(0, Math.round(durationMs ?? 0));
  const visemes = ms > 0 ? analyzeTakeVisemes(wav, { startMs: 0, endMs: ms }) : null;
  memoSet(k, visemes);
  return visemes;
}

// ── the 429 law ──

/** The fixed doubling schedule: attempt 1 waits 1s, then 2s, then 4s; a fourth failure surfaces. */
export const TTS_BACKOFF_MS = [1000, 2000, 4000];

/** The delay before RETRY `attempt` (1-indexed); null when the schedule is spent. Pure. */
export function ttsBackoffDelay(attempt: number): number | null {
  const i = Math.round(attempt) - 1;
  if (i < 0 || i >= TTS_BACKOFF_MS.length) return null;
  return TTS_BACKOFF_MS[i];
}

/**
 * Whether an error is the provider's rate limit (a 429 status or the
 * rate-limit wording) - the ONLY error the backoff law retries.
 * Everything else surfaces immediately: a bad voice is not a storm.
 */
export function isRateLimitError(err: unknown): boolean {
  const status = (err as { status?: unknown; statusCode?: unknown })?.status ?? (err as { statusCode?: unknown })?.statusCode;
  if (status === 429 || status === "429") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b429\b|rate[ _-]?limit/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one provider call under the rate-limit law: a 429 backs off on
 * the doubling schedule and retries; anything else (or a spent
 * schedule) surfaces honestly. Each wait names itself in the counters.
 */
export async function withRateLimitBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = ttsBackoffDelay(attempt);
      if (delay === null || !isRateLimitError(err)) throw err;
      stats.rateLimitWaits += 1;
      await sleep(delay);
    }
  }
}

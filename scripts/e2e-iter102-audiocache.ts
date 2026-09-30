// Iteration 102 E2E: THE STEM IS REMEMBERED (the audio-render cache).
// Proves, against the RUNNING studio, the REAL database and the REAL
// TTS provider:
//   A. source: the cache module, the voice-render integration, the
//      viseme memo in the neural pass, the registry still at 90
//   B. pure: the key law (structural, sensitive to every field, blind
//      to sub-hint rounding), the 429 backoff schedule, the rate-limit
//      matcher, the store round trip + corruption reads as a miss,
//      the viseme memo (same bytes+span -> same table)
//   C. the REAL render path over the real TTS provider: the first
//      render earns and stores the stem + manifest, the re-render
//      fetches byte-identical audio with NO second provider call, a
//      different line is a new key, a SECOND CUE with the same line
//      shares the remembered take (the key is structural, not
//      per-cue); the counters name every outcome; exact cleanup
// Run: PHASE=a|b|all npx tsx scripts/e2e-iter102-audiocache.ts

import { db } from "../src/lib/db";
import { executeTool } from "../src/lib/dsh/tools";
import {
  audioCacheKey, audioCacheGet, audioCachePut, audioCacheDelete, audioCacheInventory, audioCacheStats, audioCacheResetStats,
  ttsBackoffDelay, isRateLimitError, withRateLimitBackoff, wholeTakeVisemes, cachedSpanVisemes, AUDIO_CACHE_DIR,
} from "../src/lib/ai/audio-cache";
import { renderVoiceTake } from "../src/lib/ai/voice-render";
import { readFileSync, readdirSync } from "node:fs";
import fs from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARK = "iter102-audiocache";
const PHASE = (process.env.PHASE ?? "all").toLowerCase();

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}

function synthWav(seconds: number, freq = 220, sampleRate = 24000): Buffer {
  // a real PCM16 mono WAV: a sine at -6dBFS - parseable, voiced, loud enough for the gate
  const n = Math.round(seconds * sampleRate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function cleanupLab(labId: string, cacheKeys: string[], cueFiles: string[]): Promise<void> {
  const cues = await db.audioCue.findMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } }, select: { id: true } });
  await db.audioCue.deleteMany({ where: { shot: { scene: { episode: { season: { projectId: labId } } } } } });
  await db.renderJob.deleteMany({ where: { projectId: labId } });
  await db.productionEvent.deleteMany({ where: { projectId: labId } });
  await db.shot.deleteMany({ where: { scene: { episode: { season: { projectId: labId } } } } });
  await db.scene.deleteMany({ where: { episode: { season: { projectId: labId } } } });
  await db.episode.deleteMany({ where: { season: { projectId: labId } } });
  await db.season.deleteMany({ where: { projectId: labId } });
  await db.character.deleteMany({ where: { projectId: labId } });
  await db.projectMembership.deleteMany({ where: { projectId: labId } });
  await db.project.delete({ where: { id: labId } }).catch(() => {});
  for (const k of cacheKeys) audioCacheDelete(k);
  for (const f of cueFiles) {
    try { fs.unlinkSync(path.join(process.cwd(), "public", "voices", f)); } catch { /* best effort */ }
  }
  for (const c of cues) {
    try { fs.unlinkSync(path.join(process.cwd(), "public", "voices", `${c.id}.wav`)); } catch { /* best effort */ }
  }
}

async function register(email: string, name: string, password: string): Promise<{ id: string; role: string }> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `e2e-${MARK}` },
    body: JSON.stringify({ email, name, password }),
  });
  const body = (await res.json()) as { user?: { id: string; role: string } };
  if (res.ok) return { id: body.user?.id ?? "", role: body.user?.role ?? "" };
  const row = await db.user.findUnique({ where: { email } });
  return { id: row?.id ?? "", role: row?.role ?? "" };
}

async function run() {
  console.log(`== Iteration 102: the stem is remembered (phase: ${PHASE}) ==\n`);

  if (PHASE === "a" || PHASE === "all") {

  // ── A. the sources stand ──
  const src = readFileSync("src/lib/ai/audio-cache.ts", "utf8");
  check("A1 the cache law stands (the key, the store, the counters, the backoff, the memo)",
    src.includes("export function audioCacheKey") && src.includes("export function audioCacheGet")
    && src.includes("export function audioCachePut") && src.includes("export function audioCacheDelete")
    && src.includes("export function audioCacheStats") && src.includes("withRateLimitBackoff<T>")
    && src.includes("export function cachedSpanVisemes") && src.includes("export function wholeTakeVisemes"));
  check("A2 the key is the STRUCTURE's composite hash (voice + text + delivery + speed/pitch hints, versioned)",
    src.includes("voiceId") && src.includes("deliveryStyle") && src.includes("pitch")
    && src.includes("ver: AUDIO_CACHE_VERSION") && src.includes("sha256"));

  const vrSrc = readFileSync("src/lib/ai/voice-render.ts", "utf8");
  check("A3 the voice render obeys the cache (lookup before TTS, the 429 retry, the store on miss only)",
    vrSrc.includes("audioCacheGet(cacheKey)") && vrSrc.includes("withRateLimitBackoff")
    && vrSrc.includes("if (!fromCache)") && vrSrc.indexOf("audioCacheGet(cacheKey)") < vrSrc.indexOf("zai.audio.tts.create"));

  const vnSrc = readFileSync("src/lib/animation/viseme-neural.ts", "utf8");
  check("A4 the viseme manifest is remembered too (the neural pass reads the span memo)",
    vnSrc.includes("cachedSpanVisemes") && vnSrc.includes("THE VISEME MANIFEST IS REMEMBERED"));

  const gi = readFileSync(".gitignore", "utf8");
  check("A5 the cache is gitignored (the stems never ride the repo)", gi.includes(".cache"));

  const tools = readFileSync("src/lib/dsh/tools.ts", "utf8");
  const defsMatch = tools.match(/export const TOOL_DEFS[\s\S]*?\n\];/);
  const toolCount = defsMatch ? (defsMatch[0].match(/\n    name: "/g) ?? []).length : -1;
  check("A6 the registry stands at 90 tools (the cache is infrastructure, not a tool)", toolCount === 90, `count=${toolCount}`);

  // ── B. the pure laws ──
  const k0 = audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1, pitch: 1 });
  check("B1 the key law: deterministic across calls",
    k0 === audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1, pitch: 1 })
    && /^[0-9a-f]{16}$/.test(k0), k0);
  check("B2 the key law: every structural field moves the key (one character of text is structural)",
    audioCacheKey({ voiceId: "voice_b", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1, pitch: 1 }) !== k0
    && audioCacheKey({ voiceId: "voice_a", text: "The ridge holds ", deliveryStyle: "neutral", speed: 1, pitch: 1 }) !== k0
    && audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "angry", speed: 1, pitch: 1 }) !== k0
    && audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1.1, pitch: 1 }) !== k0
    && audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1, pitch: 0.9 }) !== k0);
  check("B3 the key law: sub-hint rounding is NOT structural (the take sig's own r2 law)",
    audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1.001, pitch: 1.0004 }) === k0
    && audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: NaN, pitch: NaN }) === audioCacheKey({ voiceId: "voice_a", text: "The ridge holds.", deliveryStyle: "neutral", speed: 1, pitch: 1 }));

  check("B4 the 429 schedule: 1s, 2s, 4s, then spent",
    ttsBackoffDelay(1) === 1000 && ttsBackoffDelay(2) === 2000 && ttsBackoffDelay(3) === 4000
    && ttsBackoffDelay(4) === null && ttsBackoffDelay(0) === null);
  check("B5 the rate-limit matcher: a 429 status or the wording, never other failures",
    isRateLimitError({ status: 429 }) && isRateLimitError(new Error("HTTP 429 Too Many Requests"))
    && isRateLimitError(new Error("rate limit exceeded")) && isRateLimitError(new Error("RateLimit hit"))
    && !isRateLimitError(new Error("invalid voice")) && !isRateLimitError({ status: 500 })
    && !isRateLimitError(new Error("timeout")));

  audioCacheResetStats();
  let waits = 0;
  const flaky = async () => {
    waits += 1;
    if (waits < 3) throw Object.assign(new Error("HTTP 429 slow down"), { status: 429 });
    return "earned";
  };
  const earned = await withRateLimitBackoff(flaky);
  const s1 = audioCacheStats();
  check("B6 the backoff law rides the call: two 429s waited, the third attempt earned",
    earned === "earned" && s1.rateLimitWaits === 2 && waits === 3, JSON.stringify(s1));
  const doomed = async () => {
    throw new Error("HTTP 429 again");
  };
  let threw = false;
  try { await withRateLimitBackoff(doomed); } catch { threw = true; }
  const s2 = audioCacheStats();
  check("B7 the spent schedule surfaces honestly (three waits, then the failure)",
    threw && s2.rateLimitWaits === 5, JSON.stringify(s2));
  audioCacheResetStats();

  const wav = synthWav(0.6, 200);
  const put = audioCachePut("e2e102key", wav, { voiceId: "voice_a", performedVoice: "voice_a", degraded: false, deliveryStyle: "neutral", speed: 1, pitch: 1, ms: 600 }, 600);
  const got = audioCacheGet("e2e102key");
  check("B8 the store round trip: byte-identical stem, the manifest validated",
    !!put && !!got && got.wav.equals(wav) && got.manifest.key === "e2e102key"
    && got.manifest.bytes === wav.length && got.manifest.performedVoice === "voice_a" && got.manifest.degraded === false,
    JSON.stringify(got?.manifest ?? {}));
  const s3 = audioCacheStats();
  check("B9 the counters named the round trip (one miss on the pre-put read? no - put only; one hit)", s3.hits === 1 && s3.saved === 1, JSON.stringify(s3));
  fs.writeFileSync(path.join(AUDIO_CACHE_DIR, "e2e102key.wav"), wav.subarray(0, 40));
  const corrupt = audioCacheGet("e2e102key");
  check("B10 corruption reads as a miss, never served (the size no longer vouches)",
    corrupt === null && audioCacheStats().corruptReads === 1, JSON.stringify(audioCacheStats()));
  audioCacheResetStats();
  audioCacheDelete("e2e102key");
  check("B11 the deleted entry reads as an honest miss", audioCacheGet("e2e102key") === null && audioCacheStats().misses === 1);

  const memo1 = wholeTakeVisemes(wav, 600);
  const memo2 = wholeTakeVisemes(wav, 600);
  check("B12 the whole-take viseme manifest: a real sine lands a table, the memo returns the SAME derivation",
    Array.isArray(memo1) && memo1!.length > 0 && memo2 === memo1
    && memo1![0].e > memo1![0].s && memo1![0].o >= 0 && memo1![0].o <= 1,
    JSON.stringify(memo1?.slice(0, 2)));
  const span1 = cachedSpanVisemes(wav, { startMs: 0, endMs: 300 });
  const span1Again = cachedSpanVisemes(wav, { startMs: 0, endMs: 300 });
  const span2 = cachedSpanVisemes(wav, { startMs: 100, endMs: 400 });
  check("B13 the span memo: the same content+span returns the same table, a moved span re-derives",
    span1 !== null && span1Again === span1 && span2 !== null,
    `span1=${span1?.length} span2=${span2?.length}`);
  check("B14 the manifest rides the visemes (the stored manifest carries the take's own program)",
    !!put && put.visemes !== null && Array.isArray(put.visemes) && put.visemes.length === memo1!.length);
  }

  if (PHASE === "b" || PHASE === "b2" || PHASE === "all") {

  // ── C. the REAL render path over the real TTS provider ──
  const ownerRow = await register("director@studio.dev", "Lin Director", "anchored2026");
  const owner = await executeTool("throwaway", "create_project", { title: `Iter102 AudioCache Lab ${MARK}`, logline: "the remembered stem proof", visualStyle: "DONGHUA" }, { id: ownerRow.id, name: "Lin Director", role: ownerRow.role });
  check("C1 the lab exists", owner.status === "OK", owner.result.slice(0, 120));
  const lab = await db.project.findFirst({ where: { title: { contains: MARK } } });
  if (!lab) throw new Error("lab missing");
  const labId = lab.id;
  await db.character.create({ data: { projectId: labId, name: "Lin Yue", role: "PROTAGONIST" } });
  const season = await db.season.findFirstOrThrow({ where: { projectId: labId, number: 1 } }); // create_project seeds it
  const ep = await db.episode.create({ data: { seasonId: season.id, number: 1, title: "The Remembered Stem" } });
  const scene = await db.scene.create({ data: { episodeId: ep.id, number: 1, title: "The Ridge" } });
  const shot = await db.shot.create({ data: { sceneId: scene.id, number: 1, description: "The cache lab shot", shotType: "CLOSEUP", duration: 6 } });

  const LINE_A = "The ridge remembers every step.";
  const LINE_B = "But the valley forgets the river.";
  const cueA1 = await db.audioCue.create({ data: { shotId: shot.id, kind: "VOICE", label: `Lin Yue: ${LINE_A}`, startMs: 200, durationMs: 3000 } });
  const cueA2 = await db.audioCue.create({ data: { shotId: shot.id, kind: "VOICE", label: `Lin Yue: ${LINE_A}`, startMs: 3400, durationMs: 2500 } });
  const cueB = await db.audioCue.create({ data: { shotId: shot.id, kind: "VOICE", label: `Lin Yue: ${LINE_B}`, startMs: 0, durationMs: 3000 } });

  const cacheKeys: string[] = [];
  audioCacheResetStats();
  const invBefore = audioCacheInventory();

  // R1: the first render earns the take (a real TTS call)
  const r1 = await renderVoiceTake(cueA1.id);
  const sR1 = audioCacheStats();
  check("C2 the first render earned the take over the real provider (a miss and a save named)",
    sR1.misses >= 1 && sR1.saved >= 1 && sR1.hits === 0, JSON.stringify(sR1));
  check("C3 the take landed on the cue (voiceUrl, duration, the sig stamped)",
    !!r1.cue.voiceUrl && (r1.cue.voiceDurationMs as number) > 0 && !!r1.cue.voiceSig, JSON.stringify({ url: r1.cue.voiceUrl, ms: r1.cue.voiceDurationMs }));

  // the key the structure computed - the result carries the evidence
  const keyA = r1.cache.key;
  check("C3b the result names the cache evidence (the key, an honest miss)", keyA.length === 16 && r1.cache.hit === false);
  cacheKeys.push(keyA);
  const entryA = audioCacheGet(keyA);
  check("C4 the earned take is REMEMBERED under its structure (stem + manifest + viseme program)",
    !!entryA && entryA.manifest.key === keyA && entryA.manifest.ms === r1.cue.voiceDurationMs
    && Array.isArray(entryA.manifest.visemes) && entryA.manifest.visemes!.length > 0
    && entryA.manifest.performedVoice === String(r1.cast.voiceId),
    JSON.stringify({ key: keyA, ms: entryA?.manifest.ms, visemes: entryA?.manifest.visemes?.length }));

  // R2: the re-render of the SAME cue fetches the remembered stem - no second provider call
  const bytesBefore = readFileSync(path.join(process.cwd(), "public", "voices", `${cueA1.id}.wav`));
  const savedBefore = audioCacheStats().saved;
  const r2 = await renderVoiceTake(cueA1.id);
  const sR2 = audioCacheStats();
  const bytesAfter = readFileSync(path.join(process.cwd(), "public", "voices", `${cueA1.id}.wav`));
  check("C5 the re-render served the remembered stem (byte-identical, zero new saves)",
    bytesAfter.equals(bytesBefore) && bytesAfter.equals(entryA!.wav)
    && audioCacheStats().saved === savedBefore && sR2.hits >= 1,
    JSON.stringify(sR2));

  // R3: a different line is a different structure - a fresh take
  const hitsBefore = audioCacheStats().hits;
  const r3 = await renderVoiceTake(cueB.id);
  const bytesB = readFileSync(path.join(process.cwd(), "public", "voices", `${cueB.id}.wav`));
  const sR3 = audioCacheStats();
  check("C6 a changed line earns its own take (a miss, a new save, the hit count untouched, different audio)",
    sR3.misses >= 1 && sR3.saved === savedBefore + 1 && sR3.hits === hitsBefore
    && !bytesB.equals(bytesBefore) && r3.cache.hit === false,
    JSON.stringify(sR3));
  const keyB = r3.cache.key;
  cacheKeys.push(keyB);
  check("C7 the second structure landed its own key (the cache never guesses a near-miss)", keyB !== keyA);

  // R4: a SECOND CUE with the SAME line shares the remembered take - the key is structural, not per-cue
  const hitsBeforeR4 = audioCacheStats().hits;
  await renderVoiceTake(cueA2.id);
  const sR4 = audioCacheStats();
  const bytesA2 = readFileSync(path.join(process.cwd(), "public", "voices", `${cueA2.id}.wav`));
  check("C8 the same line on a second cue is a cache HIT (one take per structure, the studio never pays twice)",
    sR4.hits === hitsBeforeR4 + 1 && bytesA2.equals(bytesBefore),
    JSON.stringify(sR4));

  const inv = audioCacheInventory();
  check("C9 the cache footprint grew by the two structures (the ledger reads the disk)",
    inv.entries >= invBefore.entries + 2, JSON.stringify({ before: invBefore, after: inv }));

  // ── D. cleanup ──
  await cleanupLab(labId, cacheKeys, [`${cueA1.id}.wav`, `${cueA2.id}.wav`, `${cueB.id}.wav`]);
  const leftovers = await db.project.findMany({ where: { title: { contains: MARK } } });
  check("D1 the lab is gone exactly (the project, the cues' files, the cache entries)",
    leftovers.length === 0 && audioCacheGet(keyA) === null && audioCacheGet(keyB) === null);
  }

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 102 (${PHASE})`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error("E2E crashed:", err);
  process.exit(1);
});

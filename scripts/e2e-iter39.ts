// E2E: the neural acoustic rung (ASR-guided re-weighting behind the
// DSP slot), real upload adapters (credential-gated network flows),
// curve-aware fact suggestions, and the voice-clone slot.
// Steps:
//   plan - pure checks: the curve-aware suggestion matrix (hold-rate
//          rule + the new curve rule, dedupe, sort), the acoustic
//          provider's neural rung (tokenizers, bounded-skip
//          alignment, ASR re-weighting incl. the mismatched-transcript
//          hands-off), the upload adapters' metadata shapes +
//          credential gate, the voice-clone provider gate, the
//          49-tool registry, routes/files on disk.
//   tool - live pipeline: the neural rung REALLY running through the
//          ASR seam on a real synthesized take (skipped word collapses
//          to SIL; the builtin-dsp default never calls ASR; a
//          mismatched transcript hands off), REAL upload flows
//          against a local platform receiver (YouTube resumable
//          init+PUT with the byte count verified, TikTok init-JSON,
//          Bilibili multipart, the honest no-credential refusal,
//          the ingest skip) with outcomes appended to the PUBLISH
//          event, curve-driven suggestions through the REAL verdict
//          pipeline, and the clone slot trained through a REAL local
//          provider (reference takes received, voice persisted,
//          clone-performed take, the honest clone-fallback degrade,
//          DSH train_voice_clone + upload_package through the tool
//          path).
import { mock } from "bun:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import {
  acousticProvider, tokenizeLine, alignTokens, reweightUnitsForAsr,
} from "@/lib/animation/acoustic";
import { neuralSpeechProgram, describeNeuralSpeechProgram } from "@/lib/animation/viseme-neural";
import { retireSuggestionsFromRows, canonHealthData, CURVE_SUGGEST_DELTA, CURVE_SUGGEST_MIN_PANELS, type FactHealthRow } from "@/lib/canon-health";
import type { FactDrift } from "@/lib/canon-health";
import { stagePublishPackage } from "@/lib/comic/publish";
import { uploadStagedPackage, metadataFor } from "@/lib/comic/upload";
import { trainCharacterVoice, collectReferenceTakes, cloneProvider, cloneActiveFor } from "@/lib/ai/voice-clone";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { buildEpisodeCut } from "@/lib/comic/cut";
import { PrismaClient } from "@prisma/client";

// ── in-process SDK mock: chat.completions for the phoneme plan,
//    createVision for fact verdicts, audio.asr for the neural rung,
//    audio.tts for the catalog fallback in clone-degrade renders. ──
const NEURAL_PLAN_RAW = JSON.stringify({
  lines: [
    { units: [
      { ph: "B", v: "M_B_P", w: 0.6 }, { ph: "R", v: "AH", w: 0.9 }, { ph: "IY", v: "IY", w: 1.3 }, { ph: "DH", v: "TH", w: 0.6 },
      { ph: "T", v: "M_B_P", w: 0.5 }, { ph: "IH", v: "IY", w: 1.0 }, { ph: "L", v: "N_L", w: 0.8 }, { ph: "T", v: "M_B_P", w: 0.5 }, { ph: "UW", v: "UW", w: 1.3 },
    ] },
  ],
});
let visionQueue: string[] = [];
let asrText = "";
let asrCalls = 0;
let ttsCalls = 0;
mock.module("z-ai-web-dev-sdk", () => ({
  default: {
    create: async () => ({
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content: NEURAL_PLAN_RAW } }] }),
          createVision: async () => ({ choices: [{ message: { content: visionQueue.shift() ?? "" } }] }),
        },
      },
      audio: {
        asr: {
          create: async () => {
            asrCalls += 1;
            return { text: asrText };
          },
        },
        tts: {
          create: async () => {
            ttsCalls += 1;
            // a minimal valid WAV (44-byte header + a little data)
            const header = Buffer.alloc(44);
            header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + 88, 4);
            header.write("WAVE", 8, "ascii"); header.write("fmt ", 12, "ascii");
            header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
            header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
            header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
            header.write("data", 36, "ascii"); header.writeUInt32LE(88, 40);
            const buf = Buffer.concat([header, Buffer.alloc(88)]);
            return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
          },
        },
      },
    }),
  },
}));

const FACT_VERDICT = (id: string, holds: boolean, conf: number, note: string) => JSON.stringify({
  summary: holds ? "holds" : "broken",
  verdicts: [{ id, holds, confidence: conf, note }],
});

const db = new PrismaClient();
const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function synthPng(file: string, filter: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  execSync(`ffmpeg -y -loglevel error -f lavfi -i ${filter} -frames:v 1 "${file}"`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`ffmpeg did not write ${file}`);
}

function makeWav(bursts: Array<[number, number]>, totalMs: number, freq = 220, sampleRate = 24000): Buffer {
  const totalSamples = Math.floor((totalMs / 1000) * sampleRate);
  const samples = new Int16Array(totalSamples);
  for (const [s, e] of bursts) {
    const from = Math.floor((s / 1000) * sampleRate);
    const to = Math.min(totalSamples, Math.floor((e / 1000) * sampleRate));
    for (let i = from; i < to; i++) {
      const t = (i - from) / sampleRate;
      const env = Math.min(1, t / 0.03, Math.max(0.001, (e - s) / 1000 - t) / 0.03);
      samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 12000 * env);
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + totalSamples * 2, 4);
  header.write("WAVE", 8, "ascii"); header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii"); header.writeUInt32LE(totalSamples * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── 1. curve-aware fact suggestions ──
  check("the curve suggestion thresholds read honestly", CURVE_SUGGEST_DELTA === 0.12 && CURVE_SUGGEST_MIN_PANELS === 3, `${CURVE_SUGGEST_DELTA}/${CURVE_SUGGEST_MIN_PANELS}`);
  const rows: FactHealthRow[] = [
    { factId: "f1", text: "fact one", category: "WORLD", active: true, status: "VIOLATED", checkedPanels: 4, held: 1, broken: 3, worstBrokenConfidence: 0.8, lastCheckedAt: null, lastConfidence: null, lastNote: "" },
    { factId: "f2", text: "fact two", category: "RULE", active: true, status: "HELD", checkedPanels: 3, held: 3, broken: 0, worstBrokenConfidence: null, lastCheckedAt: null, lastConfidence: null, lastNote: "" },
    { factId: "f3", text: "fact three", category: "WORLD", active: false, status: "HELD", checkedPanels: 3, held: 3, broken: 0, worstBrokenConfidence: null, lastCheckedAt: null, lastConfidence: null, lastNote: "" },
  ];
  const curves: FactDrift[] = [
    { factId: "f1", text: "fact one", category: "WORLD", points: [], first: 0.9, last: 0.5, delta: -0.4, trend: "DECLINING", holdRate: 0.25, panels: 4 },
    { factId: "f2", text: "fact two", category: "RULE", points: [], first: 0.9, last: 0.55, delta: -0.35, trend: "DECLINING", holdRate: 1, panels: 4 },
    { factId: "f3", text: "fact three", category: "WORLD", points: [], first: 0.9, last: 0.4, delta: -0.5, trend: "DECLINING", holdRate: 1, panels: 4 },
    { factId: "f4", text: "fact four", category: "WORLD", points: [], first: 0.9, last: 0.8, delta: -0.1, trend: "STABLE", holdRate: 1, panels: 4 },
  ];
  const sugs = retireSuggestionsFromRows(rows, curves);
  check("the hold-rate rule still fires first", sugs[0]?.factId === "f1" && sugs[0].trend === "DECLINING" && sugs[0].reason.includes("the curve is sliding -40%"), sugs[0]?.reason.slice(0, 80));
  check("the curve rule suggests a fact the hold rate missed", sugs.some((s) => s.factId === "f2" && s.reason.includes("confidence sliding -35%") && s.reason.includes("before the re-render queue floods")), sugs.find((s) => s.factId === "f2")?.reason.slice(0, 80) ?? "absent");
  check("a curve-only suggestion skips inactive facts", !sugs.some((s) => s.factId === "f3"), "f3 absent");
  check("a STABLE or shallow curve earns nothing", !sugs.some((s) => s.factId === "f4"), "f4 absent");
  const noCurves = retireSuggestionsFromRows(rows, []);
  check("no curves keeps the hold-rate-only behavior", noCurves.length === 1 && noCurves[0].factId === "f1" && noCurves[0].trend === null, `${noCurves.length} pick(s)`);
  const shallow = retireSuggestionsFromRows(
    [{ ...rows[1], checkedPanels: 2, held: 2, broken: 0 }],
    [{ factId: "f2", text: "fact two", category: "RULE", points: [], first: 0.9, last: 0.6, delta: -0.3, trend: "DECLINING", holdRate: 1, panels: 2 }],
  );
  check("a curve under the panel floor earns nothing", shallow.length === 0, `${shallow.length} pick(s)`);

  // ── 2. the neural acoustic rung ──
  process.env.ANIMEOS_ACOUSTIC = "neural";
  check("ANIMEOS_ACOUSTIC=neural opens the neural rung", acousticProvider() === "neural", acousticProvider());
  process.env.ANIMEOS_ACOUSTIC = "asr";
  check("ANIMEOS_ACOUSTIC=asr is an alias", acousticProvider() === "neural", acousticProvider());
  delete process.env.ANIMEOS_ACOUSTIC;
  check("the default rung stays builtin-dsp", acousticProvider() === "builtin-dsp", acousticProvider());

  check("the tokenizer splits latin words and strips punctuation", JSON.stringify(tokenizeLine("The blade chose-me.")) === JSON.stringify(["the", "blade", "chose", "me"]), tokenizeLine("The blade chose-me.").join("|"));
  check("the tokenizer reads CJK as characters", tokenizeLine("剑选择了她").join("|") === "剑|选|择|了|她", tokenizeLine("剑选择了她").join("|"));
  const align = alignTokens(["the", "blade", "chose", "me"], ["ah", "the", "blade", "chose", "me"]);
  check("the bounded-skip alignment confirms in order", align.confirmed.size === 4 && align.missing === 0, `confirmed=${align.confirmed.size}`);
  const alignSkip = alignTokens(["the", "blade", "chose", "me"], ["the", "blade", "me"]);
  check("a skipped dialogue token counts as missing", alignSkip.confirmed.size === 3 && alignSkip.missing === 1, `confirmed=${alignSkip.confirmed.size} missing=${alignSkip.missing}`);

  const units = [
    { ph: "B", v: "M_B_P" as const, w: 0.5 }, { ph: "R", v: "AH" as const, w: 1.0 }, { ph: "IY", v: "IY" as const, w: 1.5 },
    { ph: "DH", v: "TH" as const, w: 0.5 }, { ph: "IH", v: "IY" as const, w: 0.5 }, { ph: "L", v: "N_L" as const, w: 1.0 },
    { ph: "T", v: "M_B_P" as const, w: 0.5 }, { ph: "UW", v: "UW" as const, w: 1.5 },
  ];
  const full = reweightUnitsForAsr(units, "Breathes till two", "breathes till two");
  check("a full transcript leaves the plan untouched", full !== null && full.units.every((u, i) => u.v === units[i].v && u.w === units[i].w) && full.confirmed === 3 && full.missing === 0, full ? `confirmed=${full.confirmed}` : "null");
  const partial = reweightUnitsForAsr(units, "Breathes till two", "breathes two");
  check("a skipped word's units collapse to SIL", partial !== null && partial.missing === 1 && partial.units.filter((u) => u.v === "SIL").length === 3 && partial.units[3].v === "TH" && partial.units[7].v === "UW", partial ? `sil=${partial.units.filter((u) => u.v === "SIL").length} confirmed=${partial.confirmed}` : "null");
  const garbage = reweightUnitsForAsr(units, "Breathes till two", "completely different words entirely");
  check("a mismatched transcript hands off honestly", garbage === null, garbage ? "reweighted" : "null");
  check("an empty transcript hands off", reweightUnitsForAsr(units, "Breathes till two", "") === null, "null");
  check("a one-token line cannot be aligned", reweightUnitsForAsr(units, "Two", "two") === null, "null");

  // ── 3. upload adapters ──
  const ytMeta = metadataFor("YOUTUBE", { title: "T", description: "D", tags: ["a", "b"] });
  check("the YouTube metadata carries snippet + private status", Boolean((ytMeta.snippet as Record<string, unknown>).title) && (ytMeta.status as Record<string, unknown>).privacyStatus === "private", JSON.stringify(Object.keys(ytMeta)));
  const ttMeta = metadataFor("TIKTOK", { title: "T", description: "D", tags: [] });
  check("the vertical init carries post_info + source_info", Boolean((ttMeta.post_info as Record<string, unknown>).title) && Boolean(ttMeta.source_info), JSON.stringify(Object.keys(ttMeta)));
  const biliMeta = metadataFor("BILIBILI", { title: "T", description: "D", tags: ["a"] });
  check("the Bilibili metadata flattens tags", (biliMeta.tags as string).includes("a"), String(biliMeta.tags));
  check("the registry holds 49 tools with the new verbs", TOOL_DEFS.length === 49 && TOOL_DEFS.some((t) => t.name === "upload_package" && t.args.platform) && TOOL_DEFS.some((t) => t.name === "train_voice_clone" && t.args.characterName), `${TOOL_DEFS.length} tools`);
  check("the upload + clone modules and routes are on disk", fs.existsSync("src/lib/comic/upload.ts") && fs.existsSync("src/lib/ai/voice-clone.ts") && fs.existsSync("src/app/api/voice-clone/route.ts"), "files");
  const charsView = fs.readFileSync("src/components/views/characters-view.tsx", "utf8");
  check("the characters view carries the clone chip + train button", charsView.includes("CLONED") && charsView.includes("Train voice clone"), "ui");
  const renderView = fs.readFileSync("src/components/views/render-view.tsx", "utf8");
  check("the publishing panel carries the upload button", renderView.includes("upload(r.id)") && renderView.includes("Upload FAILED"), "ui");
  const canonHealth = fs.readFileSync("src/lib/canon-health.ts", "utf8");
  check("the canon-health suggestions read the drift curves", canonHealth.includes("retireSuggestionsFromRows(rows, drift.curves)"), "curve-aware");

  // ── 4. voice-clone gate ──
  delete process.env.ANIMEOS_VOICE_CLONE_URL;
  check("no clone provider env means an honest null", cloneProvider() === null && cloneActiveFor({ cloneVoiceId: "clone_x" }) === false, "null");
  process.env.ANIMEOS_VOICE_CLONE_URL = "http://127.0.0.1:59901/clone";
  check("the provider reads url + optional key", cloneProvider()?.url === "http://127.0.0.1:59901/clone" && cloneProvider()?.key === null, cloneProvider()?.url ?? "");
  process.env.ANIMEOS_VOICE_CLONE_KEY = "secret-key";
  check("the key rides when present", cloneProvider()?.key === "secret-key", "key");
  delete process.env.ANIMEOS_VOICE_CLONE_KEY;
  delete process.env.ANIMEOS_VOICE_CLONE_URL;
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  // ── the local platform + clone receivers ──
  const received: Array<{ path: string; method: string; bytes: number; auth: string | null; form: string | null; body: Record<string, unknown> | null }> = [];
  const server = Bun.serve({
    port: 59901,
    fetch: async (req) => {
      const url = new URL(req.url);
      const auth = req.headers.get("authorization");
      const ctype = req.headers.get("content-type") ?? "";
      // multipart must consume the body as formData (a body cannot be
      // read twice), so branch before any raw byte read
      if (ctype.includes("multipart/form-data")) {
        const fd = await req.formData();
        const file = fd.get("file") as File | null;
        const form = [...fd.entries()].map(([k]) => k).join(",");
        const body = { access_key: String(fd.get("access_key") ?? ""), meta: String(fd.get("meta") ?? ""), fileSize: file?.size ?? 0 };
        received.push({ path: url.pathname, method: req.method, bytes: 0, auth, form, body });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const buf = Buffer.from(await req.arrayBuffer());
      let form: string | null = null;
      let body: Record<string, unknown> | null = null;
      if (ctype.includes("application/json")) {
        try { body = JSON.parse(buf.toString("utf8")) as Record<string, unknown>; } catch { body = null; }
      }
      received.push({ path: url.pathname, method: req.method, bytes: buf.length, auth, form, body });
      if (url.pathname === "/yt-init") {
        return new Response(null, { status: 200, headers: { Location: "http://127.0.0.1:59901/yt-put" } });
      }
      if (url.pathname === "/tiktok-init") {
        return new Response(JSON.stringify({ data: { upload_url: "http://127.0.0.1:59901/tiktok-put" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/clone-train") {
        return new Response(JSON.stringify({ voiceId: "clone_linx9" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/clone-render") {
        return new Response(JSON.stringify({ audio_base64: makeWav([[0, 300]], 320, 200).toString("base64") }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const proj = await db.project.create({
    data: {
      title: "Iter39 E2E",
      logline: "neural acoustic + upload adapters + curve suggestions + voice clone",
      characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: [
              {
                number: 1,
                title: "Embers",
                synopsis: "Lin Yue answers the stair.",
                scenes: {
                  create: [
                    {
                      number: 1,
                      title: "Ash Steps",
                      shots: { create: [
                        { number: 1, description: "Lin Yue speaks on the stair", shotType: "CLOSEUP", movement: "STATIC", duration: 4 },
                        { number: 2, description: "the two moons over the ash stair", shotType: "ESTABLISHING", movement: "STATIC", duration: 3 },
                      ] },
                    },
                    {
                      number: 2,
                      title: "Cold Camp",
                      shots: { create: [
                        { number: 1, description: "the moons over the cold camp", shotType: "ESTABLISHING", movement: "STATIC", duration: 3 },
                      ] },
                    },
                  ],
                },
              },
              {
                number: 2,
                title: "Cinders",
                scenes: {
                  create: {
                    number: 2,
                    title: "Night Road",
                    shots: { create: [
                      { number: 1, description: "the moons over the night road", shotType: "ESTABLISHING", movement: "STATIC", duration: 3 },
                    ] },
                  },
                },
              },
            ],
          },
        },
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
  });
  const projectId = proj.id;
  const [ep1, ep2] = proj.seasons[0].episodes;
  const [shotSpeak, shotMoons] = ep1.scenes[0].shots;
  const shotEp2 = ep2.scenes[0].shots[0];
  const createdFiles: string[] = [];

  async function ensurePanelArt(shot: { id: string }, filter: string) {
    const disk = path.join(process.cwd(), "public", "panels", `${shot.id}.png`);
    synthPng(disk, filter);
    const nowT = new Date();
    await db.shot.update({ where: { id: shot.id }, data: { artworkUrl: `/panels/${shot.id}.png?v=${nowT.getTime()}`, artGeneratedAt: nowT } });
    createdFiles.push(disk);
  }

  try {
    // ── 1. the neural rung REALLY hears the take ──
    await db.shot.update({
      where: { id: shotSpeak.id },
      data: { dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]) },
    });
    const voiceDir = path.join(process.cwd(), "public", "voices");
    fs.mkdirSync(voiceDir, { recursive: true });
    const wavPath = path.join(voiceDir, "e39-take.wav");
    execSync(
      `ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=210:duration=0.8" -f lavfi -i "anullsrc=r=24000:cl=mono:d=0.4" -f lavfi -i "sine=frequency=260:duration=0.8" -filter_complex "[0][1][2]concat=n=3:v=0:a=1" -ar 24000 -ac 1 -c:a pcm_s16le "${wavPath}"`,
    );
    createdFiles.push(wavPath);
    const takeWav = fs.readFileSync(wavPath);

    // the builtin-dsp default NEVER calls ASR
    process.env.ANIMEOS_ACOUSTIC = "builtin-dsp";
    asrCalls = 0;
    const dspProgram = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2200, wav: takeWav }],
    });
    check("the builtin-dsp default never calls ASR", asrCalls === 0 && dspProgram.asrSpans === 0 && dspProgram.acousticSpans === 1, `asr=${asrCalls} spans=${dspProgram.acousticSpans}`);

    // the neural rung: the ASR heard the line minus one word
    process.env.ANIMEOS_ACOUSTIC = "neural";
    asrText = "breathes two";
    asrCalls = 0;
    const neuralProgram = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2200, wav: takeWav }],
    });
    check("the neural rung transcribes through the ASR seam", asrCalls === 1, `calls=${asrCalls}`);
    check("the skipped word is reported, the rest confirmed", neuralProgram.asrSpans === 1 && neuralProgram.asrConfirmed === 2 && neuralProgram.asrMissing === 1, `confirmed=${neuralProgram.asrConfirmed} missing=${neuralProgram.asrMissing}`);
    check("the DSP warp still owns the timing after the re-weight", neuralProgram.acousticSpans === 1 && neuralProgram.acousticAnchors >= 2, `spans=${neuralProgram.acousticSpans} anchors=${neuralProgram.acousticAnchors}`);
    check("the note names the ASR evidence and the re-time", (describeNeuralSpeechProgram(neuralProgram) ?? "").includes("ASR-confirmed 2 words (1 skipped)") && (describeNeuralSpeechProgram(neuralProgram) ?? "").includes("acoustic re-timed"), describeNeuralSpeechProgram(neuralProgram) ?? "");
    check("the conformed program stays a valid viseme table", neuralProgram.audioTakes === 1 && neuralProgram.audioVisemes > 0, `audio=${neuralProgram.audioVisemes}`);

    // a mismatched transcript hands off honestly (DSP-only) - a fresh
    // take (different bytes) so the ASR cache cannot answer for it
    asrText = "completely different words entirely";
    const mismatchWav = makeWav([[0, 700], [900, 1800]], 1900, 205);
    const mismatch = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2200, wav: mismatchWav }],
    });
    check("a mismatched transcript keeps the plan untouched", mismatch.asrSpans === 0 && mismatch.acousticSpans === 1, `asr=${mismatch.asrSpans} dsp=${mismatch.acousticSpans}`);
    process.env.ANIMEOS_ACOUSTIC = "off";
    const offProgram = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2200, wav: takeWav }],
    });
    check("the off rung restores the even spread", offProgram.acousticSpans === 0 && offProgram.asrSpans === 0, `dsp=${offProgram.acousticSpans}`);
    delete process.env.ANIMEOS_ACOUSTIC;

    // ── 2. curve-aware suggestions through the REAL verdict pipeline ──
    const fact = await db.universeFact.create({ data: { projectId, text: "two moons hang over the road", category: "WORLD" } });
    await ensurePanelArt(shotMoons, "gradients=s=640x360:c0=0x223344:c1=0x445566");
    await ensurePanelArt(shotEp2, "gradients=s=640x360:c0=0x334455:c1=0x556677");
    await ensurePanelArt(shotSpeak, "gradients=s=640x360:c0=0x112233:c1=0x778899");
    // three panels across two episodes: confidence 0.9 -> 0.75 -> 0.4 (all HELD,
    // so the hold-rate rule CANNOT fire - only the curve rule can)
    visionQueue = [
      FACT_VERDICT(fact.id, true, 0.9, "both moons"),
      FACT_VERDICT(fact.id, true, 0.75, "both moons"),
      FACT_VERDICT(fact.id, true, 0.4, "moons faint"),
    ];
    const checkMod = await import("@/lib/universe-facts");
    await checkMod.checkShotUniverseFacts(shotMoons.id);
    await checkMod.checkShotUniverseFacts(shotEp2.id);
    await checkMod.checkShotUniverseFacts(shotSpeak.id);
    const health = await canonHealthData(projectId);
    const curvePick = health.suggestions.find((s) => s.factId === fact.id);
    check("a DECLINING curve suggests a fact the hold rate would miss", Boolean(curvePick && curvePick.trend === "DECLINING" && curvePick.reason.includes("confidence sliding")), curvePick?.reason.slice(0, 90) ?? "absent");
    check("the rows confirm the hold rate never dipped", health.rows.find((r) => r.factId === fact.id)?.held === 3, "3 held / 0 broken");

    // ── 3. REAL upload flows against the local platform receiver ──
    const cut = await buildEpisodeCut(ep1.id, "PREVIEW");
    createdFiles.push(
      path.join(process.cwd(), "public", "renders", "cuts", cut.file),
      path.join(process.cwd(), "public", "renders", "cuts", cut.manifestFile.split("/").pop() ?? ""),
    );
    const cutAbs = path.join(process.cwd(), "public", cut.url.replace(/^\//, "").split("?")[0]);
    const cutBytes = fs.statSync(cutAbs).size;

    process.env.ANIMEOS_YT_API_BASE = "http://127.0.0.1:59901/yt-init";
    process.env.ANIMEOS_YT_ACCESS_TOKEN = "test-yt-token";
    const ytStaged = await stagePublishPackage(ep1.id, "YOUTUBE");
    const ytEventId = await db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH" }, orderBy: { createdAt: "desc" } });
    const ytUpload = await uploadStagedPackage(ytEventId!.id);
    check("the YouTube adapter REALLY uploads through the resumable flow", ytUpload.ok && ytUpload.outcome.ok && ytUpload.outcome.detail.includes("resumable flow"), ytUpload.ok ? ytUpload.outcome.detail : "upload error");
    const ytInit = received.find((r) => r.path === "/yt-init");
    const ytPut = received.find((r) => r.path === "/yt-put");
    check("the init carried the bearer token + YouTube metadata shape", Boolean(ytInit?.auth?.includes("test-yt-token") && (ytInit.body?.snippet as Record<string, unknown> | undefined)?.title && (ytInit.body?.status as Record<string, unknown> | undefined)?.privacyStatus === "private"), JSON.stringify(Object.keys(ytInit?.body?.snippet ?? {})));
    check("the PUT carried the REAL cut bytes", Boolean(ytPut && ytPut.bytes === cutBytes), `${ytPut?.bytes} vs ${cutBytes}`);
    const ytEventAfter = await db.productionEvent.findUnique({ where: { id: ytEventId!.id } });
    check("the outcome landed on the PUBLISH event", Boolean(ytEventAfter && ytEventAfter.summary.includes("uploaded: last OK") && (JSON.parse(ytEventAfter.payload ?? "{}") as { updates?: unknown[] }).updates?.length === 1), ytEventAfter?.summary.slice(-80) ?? "none");

    process.env.ANIMEOS_TIKTOK_API_BASE = "http://127.0.0.1:59901/tiktok-init";
    process.env.ANIMEOS_TIKTOK_TOKEN = "test-tt-token";
    const ttStaged = await stagePublishPackage(ep1.id, "TIKTOK");
    void ttStaged;
    const ttEventId = await db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH", summary: { contains: "TikTok" } }, orderBy: { createdAt: "desc" } });
    const ttUpload = await uploadStagedPackage(ttEventId!.id);
    check("the TikTok adapter performs init-then-put with the JSON upload url", ttUpload.ok && ttUpload.outcome.ok && ttUpload.outcome.detail.includes("init+put"), ttUpload.ok ? ttUpload.outcome.detail : "upload error");
    const ttPut = received.find((r) => r.path === "/tiktok-put");
    check("the TikTok PUT carried the cut bytes", Boolean(ttPut && ttPut.bytes === cutBytes), `${ttPut?.bytes} vs ${cutBytes}`);

    process.env.ANIMEOS_BILI_API_BASE = "http://127.0.0.1:59901/bili-add";
    process.env.ANIMEOS_BILI_ACCESS_KEY = "test-bili-key";
    const biliStaged = await stagePublishPackage(ep1.id, "BILIBILI");
    void biliStaged;
    const biliEventId = await db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH", summary: { contains: "Bilibili" } }, orderBy: { createdAt: "desc" } });
    const biliUpload = await uploadStagedPackage(biliEventId!.id);
    check("the Bilibili adapter submits multipart with the access key", biliUpload.ok && biliUpload.outcome.ok && biliUpload.outcome.detail.includes("multipart"), biliUpload.ok ? biliUpload.outcome.detail : "upload error");
    const biliForm = received.find((r) => r.path === "/bili-add");
    check("the multipart form carried the key, the meta and the REAL file bytes", Boolean(biliForm?.form?.includes("access_key") && biliForm?.form?.includes("meta") && biliForm?.form?.includes("file") && (biliForm?.body?.fileSize as number) === cutBytes), `${biliForm?.form ?? "none"} fileSize=${biliForm?.body?.fileSize ?? 0} vs ${cutBytes}`);

    // honest refusals: no DOUYIN credential; ingest skips by design
    delete process.env.ANIMEOS_DOUYIN_TOKEN;
    const douyinStaged = await stagePublishPackage(ep1.id, "DOUYIN");
    void douyinStaged;
    const douyinEventId = await db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH", summary: { contains: "Douyin" } }, orderBy: { createdAt: "desc" } });
    const douyinUpload = await uploadStagedPackage(douyinEventId!.id);
    check("a missing credential refuses with the env key named", douyinUpload.ok && !douyinUpload.outcome.ok && douyinUpload.outcome.detail.includes("ANIMEOS_DOUYIN_TOKEN"), douyinUpload.outcome.detail.slice(0, 80));
    const ingestStaged = await stagePublishPackage(ep1.id, "STUDIO_INGEST");
    void ingestStaged;
    const ingestEventId = await db.productionEvent.findFirst({ where: { projectId, type: "PUBLISH", summary: { contains: "Studio ingest" } }, orderBy: { createdAt: "desc" } });
    const ingestUpload = await uploadStagedPackage(ingestEventId!.id);
    check("ingest is an honest skip, not a fake upload", ingestUpload.ok && ingestUpload.outcome.kind === "skip" && ingestUpload.outcome.ok && ingestUpload.outcome.detail.includes("local package drop"), ingestUpload.outcome.detail.slice(0, 80));

    // the DSH tool path: staging + upload + the honest chain
    delete process.env.ANIMEOS_TIKTOK_TOKEN;
    const toolNoStage = await executeTool(projectId, "upload_package", { episodeNumber: 2, platform: "YOUTUBE" });
    check("upload_package names the missing staging step", toolNoStage.status === "ERROR" && toolNoStage.result.includes("stage one with publish_cut"), toolNoStage.result.slice(0, 80));
    const toolUpload = await executeTool(projectId, "upload_package", { episodeNumber: 1, platform: "YOUTUBE" });
    check("upload_package REALLY uploads through the tool path", toolUpload.status === "OK" && toolUpload.result.includes("Upload OK"), toolUpload.result.slice(0, 100));

    // ── 4. the voice-clone slot through the REAL local provider ──
    process.env.ANIMEOS_VOICE_CLONE_URL = "http://127.0.0.1:59901/clone-train";
    const character = await db.character.findFirst({ where: { projectId, name: "Lin Yue" } });
    if (!character) throw new Error("fixture character missing");

    const noTakes = await trainCharacterVoice(character.id);
    check("training with no rendered takes refuses honestly", !noTakes.ok && (noTakes.error ?? "").includes("no rendered takes"), noTakes.error ?? "");

    // give the character real rendered takes (VOICE cues labeled "Lin Yue: ...")
    const cue1 = await db.audioCue.create({
      data: { shotId: shotSpeak.id, kind: "VOICE", label: "Lin Yue: The blade chose me.", startMs: 200, durationMs: 2200, voiceUrl: `/voices/e39-ref1.wav?v=${Date.now()}`, voiceDurationMs: 2000 },
    });
    const cue2 = await db.audioCue.create({
      data: { shotId: shotSpeak.id, kind: "VOICE", label: "Lin Yue: Yours to answer.", startMs: 2600, durationMs: 1200, voiceUrl: `/voices/e39-ref2.wav?v=${Date.now()}`, voiceDurationMs: 1000 },
    });
    fs.writeFileSync(path.join(voiceDir, "e39-ref1.wav"), makeWav([[0, 1800]], 1900, 210));
    fs.writeFileSync(path.join(voiceDir, "e39-ref2.wav"), makeWav([[0, 900]], 950, 230));
    createdFiles.push(path.join(voiceDir, "e39-ref1.wav"), path.join(voiceDir, "e39-ref2.wav"));

    const refs = await collectReferenceTakes(character.id);
    check("the reference collector gathers the character's takes", refs.takes.length === 2 && refs.totalMs === 3000, `takes=${refs.takes.length} ms=${refs.totalMs}`);

    const trained = await trainCharacterVoice(character.id);
    check("the clone REALLY trains through the local provider", trained.ok && trained.result.voiceId === "clone_linx9" && trained.result.takes === 2, trained.ok ? `${trained.result.voiceId} (${trained.result.takes} takes)` : trained.error);
    const trainReq = received.find((r) => r.path === "/clone-train");
    check("the training POST carried the name + reference audio", Boolean((trainReq?.body?.characterName === "Lin Yue" && Array.isArray(trainReq?.body?.takes) && (trainReq.body.takes as unknown[]).length === 2)), JSON.stringify(Object.keys(trainReq?.body ?? {})));
    const trainedChar = await db.character.findUnique({ where: { id: character.id } });
    check("the voice id persists on the character", trainedChar?.cloneVoiceId === "clone_linx9" && trainedChar?.cloneTrainedAt != null, trainedChar?.cloneVoiceId ?? "none");
    const cloneEvent = await db.productionEvent.findFirst({ where: { projectId, summary: { contains: "Voice clone trained" } } });
    check("the training lands a production event", Boolean(cloneEvent && cloneEvent.summary.includes("clone_linx9")), cloneEvent?.summary.slice(0, 80) ?? "none");

    // the clone performs: the render path uses the provider's voice
    process.env.ANIMEOS_VOICE_CLONE_URL = "http://127.0.0.1:59901/clone-render";
    const rendered = await renderVoiceTake(cue1.id);
    check("the trained voice REALLY performs the line", rendered.cast.source === "clone" && rendered.cast.voiceId === "clone_linx9", `${rendered.cast.source}:${rendered.cast.voiceId}`);
    check("the clone render came from the provider, not catalog TTS", ttsCalls === 0 && Boolean(received.find((r) => r.path === "/clone-render")), `tts=${ttsCalls}`);

    // the honest degrade: the provider cannot render -> catalog fallback
    process.env.ANIMEOS_VOICE_CLONE_URL = "http://127.0.0.1:59999/dead";
    const degraded = await renderVoiceTake(cue2.id);
    check("a failed clone render degrades to the catalog voice", degraded.cast.source === "clone-fallback" && degraded.cast.voiceId !== "clone_linx9" && ttsCalls > 0, `${degraded.cast.source}:${degraded.cast.voiceId}`);
    check("the degrade stamps the sig with the voice that performed", Boolean(degraded.cue.voiceSig && !JSON.stringify(JSON.parse(degraded.cue.voiceSig ?? "{}")).includes("clone_linx9")), String((JSON.parse(degraded.cue.voiceSig ?? "{}") as { v?: string }).v));
    process.env.ANIMEOS_VOICE_CLONE_URL = "http://127.0.0.1:59901/clone-train";

    // the DSH tool path
    const toolClone = await executeTool(projectId, "train_voice_clone", { characterName: "Lin Yue" });
    check("train_voice_clone REALLY trains through the tool path", toolClone.status === "OK" && toolClone.result.includes("clone_linx9"), toolClone.result.slice(0, 90));
    const toolGhost = await executeTool(projectId, "train_voice_clone", { characterName: "Nobody" });
    check("train_voice_clone names the cast on a miss", toolGhost.status === "ERROR" && toolGhost.result.includes("Cast:"), toolGhost.result.slice(0, 70));
    delete process.env.ANIMEOS_VOICE_CLONE_URL;
    const toolNoProvider = await executeTool(projectId, "train_voice_clone", { characterName: "Lin Yue" });
    check("training without a provider refuses honestly", toolNoProvider.status === "ERROR" && toolNoProvider.result.includes("ANIMEOS_VOICE_CLONE_URL"), toolNoProvider.result.slice(0, 90));
  } finally {
    server.stop(true);
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of [...new Set(createdFiles)]) {
      try { fs.rmSync(f, { force: true }); } catch { /* already gone */ }
    }
    // sweep inline-rendered clips the cut builder left in public/renders
    const rendersDir = path.join(process.cwd(), "public", "renders");
    if (fs.existsSync(rendersDir)) {
      for (const f of fs.readdirSync(rendersDir)) {
        if (f.startsWith("cut-")) fs.rmSync(path.join(rendersDir, f), { force: true });
      }
    }
    delete process.env.ANIMEOS_YT_API_BASE; delete process.env.ANIMEOS_YT_ACCESS_TOKEN;
    delete process.env.ANIMEOS_TIKTOK_API_BASE; delete process.env.ANIMEOS_TIKTOK_TOKEN;
    delete process.env.ANIMEOS_BILI_API_BASE; delete process.env.ANIMEOS_BILI_ACCESS_KEY;
    delete process.env.ANIMEOS_VOICE_CLONE_URL; delete process.env.ANIMEOS_VOICE_CLONE_KEY;
    delete process.env.ANIMEOS_ACOUSTIC;
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

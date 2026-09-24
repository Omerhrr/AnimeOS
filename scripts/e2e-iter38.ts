// E2E: the acoustic-model slot (WAV re-timing of the viseme plan),
// the reworded-fact re-audit helper, and platform publishing on the
// delivery spine.
// Steps:
//   plan - pure checks: the acoustic provider gate (env matrix), the
//          DSP segmentation of a synthesized multi-burst WAV (runs,
//          gaps, syllable anchors, speech/gap totals), the re-timing
//          warp (spoken units over real speech time, SIL in real
//          gaps, valley snapping, monotonic clamping, shape-table
//          identity, coverage that stops at the take's speech end
//          instead of the span end), the platform preset table +
//          conformance matrix + SRT builder + package builder
//          (clamped metadata, subtitle formats, honest integration),
//          the 47-tool registry, doctrine (intro ACOUSTIC MODEL SLOT,
//          rule 22 re-audit loop, rule 23 publish_cut), routes + UI
//          on disk.
//   tool - live pipeline: fixture project with a speaking closeup
//          carrying a REAL synthesized two-burst WAV take on disk
//          (the neural+acoustic program REALLY re-times on the real
//          audio, the env-off path keeps the even spread), the
//          re-audit helper through REAL vision verdicts across two
//          panels (reword -> re-audit -> fresh verdicts under the
//          new wording) with the honest refusals + an art-less
//          target, a REAL episode cut (MOTION inline render) staged
//          for YOUTUBE (ready, SRT from the manifest) and DOUYIN
//          (honest 16:9-on-9:16 FAIL), the publish_cut DSH tool +
//          context line, and the publishing API round trip.
import { mock } from "bun:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { buildCompactContext } from "@/lib/dsh/tools";
import {
  neuralSpeechProgram, describeNeuralSpeechProgram, planVisemesFromPlan, NEURAL_VISEME_SHAPES,
} from "@/lib/animation/viseme-neural";
import {
  acousticProvider, analyzeAcoustics, retimedPlanVisemes, describeAcoustics,
} from "@/lib/animation/acoustic";
import {
  PLATFORM_PRESETS, platformPreset, checkConformance, buildSrt, buildPublishPackage,
  stagePublishPackage, listPublishEvents,
} from "@/lib/comic/publish";
import { reauditTargetsForFact, reauditRewordedFact, checkShotUniverseFacts } from "@/lib/universe-facts";
import { buildEpisodeCut } from "@/lib/comic/cut";
import { buildSystemPrompt } from "@/lib/dsh/prompts";
import { PrismaClient } from "@prisma/client";

// ── in-process SDK mock: chat.completions.create answers the neural
//    plan; chat.completions.createVision answers fact verdicts (the
//    same seam as iters 34-37). ──
const NEURAL_PLAN_RAW = JSON.stringify({
  lines: [
    { units: [
      { ph: "DH", v: "TH", w: 0.6 }, { ph: "AH", v: "AH", w: 1.3 }, { ph: "B", v: "M_B_P", w: 0.6 },
      { ph: "R", v: "AH", w: 0.9 }, { ph: "IY", v: "IY", w: 1.3 }, { ph: "Z", v: "S_SH", w: 0.8 },
    ] },
  ],
});
let visionQueue: string[] = [];
mock.module("z-ai-web-dev-sdk", () => ({
  default: {
    create: async () => ({
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { content: NEURAL_PLAN_RAW } }] }),
          createVision: async () => ({ choices: [{ message: { content: visionQueue.shift() ?? "" } }] }),
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

/** A PCM16 mono WAV with tone bursts (pure bytes, no ffmpeg). */
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
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + totalSamples * 2, 4);
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
  header.writeUInt32LE(totalSamples * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer)]);
}

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── 1. the acoustic provider gate ──
  delete process.env.ANIMEOS_ACOUSTIC;
  check("the acoustic slot ships ON (builtin DSP aligner)", acousticProvider() === "builtin-dsp", acousticProvider());
  for (const v of ["off", "OFF", "false", "0", "none", "no"]) {
    process.env.ANIMEOS_ACOUSTIC = v;
    check(`ANIMEOS_ACOUSTIC=${v} closes the slot`, acousticProvider() === "off", acousticProvider());
  }
  process.env.ANIMEOS_ACOUSTIC = "on";
  check("ANIMEOS_ACOUSTIC=on opens the slot", acousticProvider() === "builtin-dsp", acousticProvider());
  delete process.env.ANIMEOS_ACOUSTIC;

  // ── 2. the DSP segmentation ──
  // three tone bursts (0.4s, 0.4s, 0.5s) with real silences between,
  // over a 2.0s span that also carries leading + trailing silence
  const wav = makeWav([[500, 900], [1200, 1600], [1700, 2200]], 2400, 210);
  const span = { startMs: 0, endMs: 2400 };
  const profile = analyzeAcoustics(wav, span);
  check("the analyzer segments three speech runs", profile?.runs.length === 3, profile ? profile.runs.map((r) => `${r.s}-${r.e}`).join(" ") : "null");
  check("the analyzer picks syllable anchors inside the runs", Boolean(profile && profile.nuclei.length >= 3 && profile.nuclei.length <= 18), profile ? `${profile.nuclei.length} anchors: ${describeAcoustics(profile)}` : "null");
  check("the run times ride the clip timeline", Boolean(profile && profile.runs[0].s >= 480 && profile.runs[0].s <= 540 && profile.runs[2].e <= 2260 && profile.runs[2].e >= 2140), profile ? profile.runs.map((r) => `${r.s}..${r.e}`).join(" ") : "null");
  check("speech + gap time reconstructs the span", Boolean(profile && Math.abs(profile.speechMs + profile.gapMs - 2400) < 120), profile ? `${profile.speechMs}+${profile.gapMs}` : "null");
  check("the gaps are the silences between bursts", Boolean(profile && profile.gaps.length >= 3 && profile.gapMs >= 900 && profile.gapMs <= 1500), profile ? profile.gaps.map((g) => `${g.s}-${g.e}`).join(" ") : "null");
  check("garbage bytes refuse to null", analyzeAcoustics(Buffer.from("not a wav"), span) === null, "null");
  check("a near-silent take refuses to null", analyzeAcoustics(makeWav([], 800), { startMs: 0, endMs: 800 }) === null, "null");

  // ── 3. the re-timing warp ──
  const units = [
    { ph: "DH", v: "TH" as const, w: 1.3 }, { ph: "AH", v: "AH" as const, w: 1.3 },
    { ph: "SIL", v: "SIL" as const, w: 1.0 },
    { ph: "B", v: "M_B_P" as const, w: 0.6 }, { ph: "R", v: "AH" as const, w: 0.9 },
    { ph: "IY", v: "IY" as const, w: 1.3 }, { ph: "Z", v: "S_SH" as const, w: 0.8 },
  ];
  const retimed = profile ? retimedPlanVisemes(units, span, profile, NEURAL_VISEME_SHAPES) : [];
  check("the warp returns segments for the spoken units (splits + starvation allowed)", retimed.length >= 5 && retimed.length <= 9, `${retimed.length} segments (6 spoken units: a unit interrupted by a pause continues after it)`);
  check("the warp is monotonic and clipped to the span", retimed.every((v, i) => i === 0 || v.s >= retimed[i - 1].e) && retimed.every((v) => v.s >= span.startMs && v.e <= span.endMs), "monotonic");
  const tablePairs = Object.values(NEURAL_VISEME_SHAPES).map((s) => `${s.w.toFixed(2)}:${s.r.toFixed(2)}`);
  check("the warp keeps the shape-table identity", retimed.every((v) => tablePairs.includes(`${v.w.toFixed(2)}:${v.r.toFixed(2)}`)), "pairs from table");
  const valleys = profile && profile.nuclei.length >= 2 ? profile.nuclei.slice(1).map((n, i) => (profile.nuclei[i] + n) / 2) : [];
  const snapped = retimed.filter((v, i) => i > 0 && valleys.some((val) => Math.abs(val - v.s) < 1)).length;
  check("interior boundaries snap to acoustic valleys", snapped >= 1, `${snapped} of ${retimed.length - 1} on valleys (${valleys.map((v) => v.toFixed(0)).join(",")})`);
  // spoken midpoints sit on real speech (a snapped boundary may drift
  // VALLEY_SNAP_MS off, so allow that slack); run without the SIL so
  // every segment is a spoken one
  const runList = profile?.runs ?? [];
  const spokenUnits = units.filter((u) => u.v !== "SIL");
  const spokenRetime = profile ? retimedPlanVisemes(spokenUnits, span, profile, NEURAL_VISEME_SHAPES) : [];
  const offSpeech = spokenRetime.filter((v) => {
    const mid = (v.s + v.e) / 2;
    return !runList.some((r) => mid >= r.s - 75 && mid <= r.e + 75);
  }).length;
  check("spoken midpoints land on the real speech runs", offSpeech === 0, `${offSpeech} off-speech of ${spokenRetime.length}`);
  const lastEnd = retimed[retimed.length - 1]?.e ?? 0;
  const even = planVisemesFromPlan(units, span);
  const evenLastEnd = even[even.length - 1]?.e ?? 0;
  check("coverage stops at the take's speech end (the even spread runs to the span end)", lastEnd < 2400 && evenLastEnd === 2400, `retimed ends ${lastEnd}, even spread ends ${evenLastEnd}`);
  check("an all-SIL plan warps to nothing", profile ? retimedPlanVisemes([{ ph: "S", v: "SIL", w: 1 }], span, profile, NEURAL_VISEME_SHAPES).length === 0 : false, "empty");
  check("a leading SIL lands in a real gap", (() => {
    if (!profile) return false;
    const silFirst = retimedPlanVisemes([
      { ph: "S", v: "SIL", w: 1 }, { ph: "AH", v: "AH", w: 1.3 },
    ], span, profile, NEURAL_VISEME_SHAPES);
    const first = silFirst[0];
    return first && (profile.gaps ?? []).some((g) => first.s >= g.s - 1 && first.e <= g.e + 1);
  })(), "SIL in gap");

  // ── 4. platform presets + conformance ──
  check("five platform presets ship", PLATFORM_PRESETS.length === 5 && new Set(PLATFORM_PRESETS.map((p) => p.id)).size === 5, PLATFORM_PRESETS.map((p) => p.id).join(","));
  check("every preset carries positive limits", PLATFORM_PRESETS.every((p) => p.maxDurationSec > 0 && p.maxFileSizeMb > 0 && p.titleMaxChars > 0 && p.maxTags > 0), "limits");
  check("vertical platforms burn captions, landscape ones take SRT", PLATFORM_PRESETS.filter((p) => p.orientation === "VERTICAL").every((p) => p.subtitleFormat === "none") && PLATFORM_PRESETS.filter((p) => p.orientation === "LANDSCAPE").every((p) => p.subtitleFormat === "srt"), "formats");
  check("the preset lookup is case-insensitive and honest on garbage", platformPreset("youtube")?.id === "YOUTUBE" && platformPreset("nope") === null && platformPreset("") === null, "lookup");
  const yt = platformPreset("YOUTUBE")!;
  const douyin = platformPreset("DOUYIN")!;
  const fit: import("@/lib/comic/publish").CutMedia = { durationMs: 4 * 1000, width: 1920, height: 1080, fps: 24, bytes: 5 * 1024 * 1024 };
  const okChecks = checkConformance(yt, fit);
  check("a conforming cut passes every check", okChecks.every((c) => c.ok), okChecks.map((c) => `${c.ok ? "OK" : "FAIL"} ${c.label}`).join(" "));
  const longCut = checkConformance(yt, { ...fit, durationMs: 13 * 3600 * 1000 });
  check("an over-cap duration fails honestly", longCut.find((c) => c.label === "duration")?.ok === false, "duration FAIL");
  const verticalPlatform = checkConformance(douyin, fit);
  check("a 16:9 cut FAILS the 9:16 platform canvas", verticalPlatform.find((c) => c.label === "canvas")?.ok === false, verticalPlatform.find((c) => c.label === "canvas")?.detail ?? "");
  const bigFile = checkConformance(douyin, { ...fit, bytes: 9 * 1024 * 1024 * 1024 });
  check("an oversized file fails", bigFile.find((c) => c.label === "file size")?.ok === false, "file size FAIL");
  const lowFps = checkConformance(yt, { ...fit, fps: 12 });
  check("a non-broadcast frame rate fails", lowFps.find((c) => c.label === "frame rate")?.ok === false, "fps FAIL");

  // ── 5. SRT + the package builder ──
  const srt = buildSrt([
    { startMs: 1500, endMs: 3000, text: "The blade chose me." },
    { startMs: 3600, endMs: 5200, text: "Yours to answer." },
  ]);
  check("the SRT carries numbered timecodes", srt.includes("1\n00:00:01,500 --> 00:00:03,000\nThe blade chose me.") && srt.includes("2\n00:00:03,600 --> 00:00:05,200\nYours to answer."), srt.split("\n").slice(0, 3).join(" | "));
  const pkgInput = {
    preset: yt,
    project: { title: "Ash Crown", visualStyle: "DONGHUA", animationType: "3D" },
    episode: { number: 1, title: "The Breathes Till Two", synopsis: "Lin Yue answers the stair." },
    media: fit,
    cutUrl: "/renders/cuts/ash-crown-ep1.mp4",
    subtitleCues: [{ startMs: 1500, endMs: 3000, text: "The blade chose me." }],
    subtitleNote: "timed through the cut manifest",
  };
  const pkg = buildPublishPackage(pkgInput);
  check("the title is clamped to the platform limit", pkg.title.length <= yt.titleMaxChars && pkg.title.includes("EP01"), pkg.title);
  check("the description carries the synopsis + provenance credits", pkg.description.includes("Lin Yue answers the stair.") && pkg.description.includes("not generated footage"), "desc");
  check("tags are deterministic and clamped", pkg.tags.length <= yt.maxTags && pkg.tags.includes("donghua") && pkg.tags.includes("EP01"), pkg.tags.join(","));
  check("the SRT sidecar builds with the manifest note", pkg.subtitle.format === "srt" && pkg.subtitle.cues === 1 && pkg.subtitle.filename === "ash-crown-ep1.srt" && pkg.subtitle.content?.includes("-->"), pkg.subtitle.filename ?? "none");
  check("an empty dialogue episode refuses the subtitle honestly", buildPublishPackage({ ...pkgInput, subtitleCues: [] }).subtitle.note.includes("no SPEECH dialogue"), "note");
  check("a vertical platform burns captions instead", buildPublishPackage({ ...pkgInput, preset: douyin }).subtitle.format === "none", "none");
  check("the checklist names the cut file and the hand-off honesty", pkg.checklist.some((c) => c.includes("ash-crown-ep1.mp4")) && pkg.checklist.some((c) => c.includes("manual until credentials")), "checklist");
  check("the integration slot is honest without credentials", pkg.integration.configured === false && pkg.integration.detail.includes("ANIMEOS_YT_CLIENT_ID"), pkg.integration.detail.slice(0, 60));
  check("ready mirrors the conformance verdicts", pkg.ready === true && buildPublishPackage({ ...pkgInput, media: { ...fit, width: 1920, height: 1080 } }).ready === true && buildPublishPackage({ ...pkgInput, preset: douyin }).ready === false, "ready");

  // ── 6. registry + doctrine + files on disk ──
  check("the registry holds 47 tools with publish_cut", TOOL_DEFS.length === 47 && TOOL_DEFS.some((t) => t.name === "publish_cut" && t.args.platform && t.args.episodeNumber), `${TOOL_DEFS.length} tools`);
  const prompt = buildSystemPrompt("{}", "");
  check("the intro teaches the acoustic model slot", prompt.includes("ACOUSTIC MODEL SLOT") && prompt.includes("ANIMEOS_ACOUSTIC=off"), "intro");
  check("rule 22 teaches the re-audit loop", prompt.includes("RE-AUDIT HELPER") && prompt.includes("OLD wording"), "rule 22");
  check("rule 23 teaches platform publishing", prompt.includes("publish_cut") && prompt.includes("NO network upload ever happens silently"), "rule 23");
  check("the acoustic module is on disk", fs.existsSync("src/lib/animation/acoustic.ts"), "file");
  check("the publish module + route are on disk", fs.existsSync("src/lib/comic/publish.ts") && fs.existsSync("src/app/api/publish/route.ts"), "files");
  const canonRoute = fs.readFileSync("src/app/api/canon-health/route.ts", "utf8");
  check("the canon-health route gained the reaudit POST", canonRoute.includes("reaudit") && canonRoute.includes("oldText"), "route");
  const renderView = fs.readFileSync("src/components/views/render-view.tsx", "utf8");
  check("the render view carries the publishing panel", renderView.includes("PublishingPanel") && renderView.includes("Stage package"), "ui");
  const contView = fs.readFileSync("src/components/views/continuity-view.tsx", "utf8");
  check("the reword flow chains the re-audit", contView.includes("re-auditing the panels that judged the old wording") && contView.includes("Fact reworded + re-audited"), "ui");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const proj = await db.project.create({
    data: {
      title: "Iter38 E2E",
      logline: "acoustic retime + re-audit helper + platform publishing",
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
                        { number: 3, description: "art-less panel awaiting paint", shotType: "WIDE", movement: "STATIC", duration: 3 },
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
                    title: "Cold Camp",
                    shots: { create: [
                      { number: 1, description: "the moons over the cold camp", shotType: "ESTABLISHING", movement: "STATIC", duration: 3 },
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
  const [shotSpeak, shotMoons, shotArtless] = ep1.scenes[0].shots;
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
    // ── 1. the acoustic re-time REALLY runs on a real take ──
    await db.shot.update({
      where: { id: shotSpeak.id },
      data: { dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]) },
    });
    // a REAL two-burst take on disk: 0.8s tone, 0.6s silence, 0.8s tone
    const voiceDir = path.join(process.cwd(), "public", "voices");
    fs.mkdirSync(voiceDir, { recursive: true });
    const wavPath = path.join(voiceDir, "e38-take.wav");
    execSync(
      `ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=210:duration=0.8" -f lavfi -i "anullsrc=r=24000:cl=mono:d=0.6" -f lavfi -i "sine=frequency=260:duration=0.8" -filter_complex "[0][1][2]concat=n=3:v=0:a=1" -ar 24000 -ac 1 -c:a pcm_s16le "${wavPath}"`,
    );
    createdFiles.push(wavPath);
    await db.audioCue.create({
      data: { shotId: shotSpeak.id, kind: "VOICE", label: "Lin Yue line 1", startMs: 300, durationMs: 2400, voiceUrl: `/voices/e38-take.wav?v=${Date.now()}`, voiceDurationMs: 2200 },
    });

    const program = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2200, wav: fs.readFileSync(wavPath) }],
    });
    check("the neural plan arrives through the real LLM seam", program.planOk, `planOk=${program.planOk}`);
    check("the acoustic slot REALLY re-times the plan from the WAV", program.acousticSpans === 1 && program.acousticAnchors >= 2, `spans=${program.acousticSpans} anchors=${program.acousticAnchors}`);
    check("the conformed program stays a valid viseme table", program.audioTakes === 1 && program.audioVisemes > 0, `audio=${program.audioVisemes}`);
    const tablePairs = Object.values(NEURAL_VISEME_SHAPES).map((s) => `${s.w.toFixed(2)}:${s.r.toFixed(2)}`);
    check("the re-timed identity still comes from the shape table", program.visemes.every((v) => tablePairs.includes(`${v.w.toFixed(2)}:${v.r.toFixed(2)}`)), "pairs");
    check("the note names the acoustic re-time", (describeNeuralSpeechProgram(program) ?? "").includes("acoustic re-timed on"), describeNeuralSpeechProgram(program) ?? "");

    // the env kill switch keeps the plan's even spread
    process.env.ANIMEOS_ACOUSTIC = "off";
    const offProgram = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "Breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2200, wav: fs.readFileSync(wavPath) }],
    });
    delete process.env.ANIMEOS_ACOUSTIC;
    check("ANIMEOS_ACOUSTIC=off keeps the even spread", offProgram.acousticSpans === 0 && offProgram.audioTakes === 1, `spans=${offProgram.acousticSpans} takes=${offProgram.audioTakes}`);

    // ── 2. the re-audit helper through the REAL vision pipeline ──
    const fact = await db.universeFact.create({
      data: { projectId, text: "two moons hang over the ash stair", category: "WORLD" },
    });
    await ensurePanelArt(shotMoons, "gradients=s=640x360:c0=0x223344:c1=0x445566");
    await ensurePanelArt(shotEp2, "gradients=s=640x360:c0=0x334455:c1=0x556677");

    // prior audits under the OLD wording: panel 1 broken-confident, panel 2 broken
    visionQueue = [FACT_VERDICT(fact.id, false, 0.85, "only one moon"), FACT_VERDICT(fact.id, false, 0.7, "moons look wrong")];
    const prior1 = await checkShotUniverseFacts(shotMoons.id);
    const prior2 = await checkShotUniverseFacts(shotEp2.id);
    check("the prior audits really landed under the old wording", prior1.ok && prior2.ok, `${prior1.ok ? "p1" : prior1.error} / ${prior2.ok ? "p2" : prior2.error}`);
    const targetsBefore = await reauditTargetsForFact(fact.text);
    check("the helper finds the panels that audited the old wording", targetsBefore.length === 2 && targetsBefore.every((t) => t.hasArt), targetsBefore.map((t) => t.ref).join(","));

    // refusal: nothing was reworded yet
    const sameText = await reauditRewordedFact(fact.id, fact.text);
    check("a re-audit without a reword refuses honestly", !sameText.ok && (sameText.error ?? "").includes("already the fact's current wording"), sameText.error ?? "");

    // reword, then re-audit: fresh verdicts - panel 1 HOLDS, panel 2 still broken
    const newText = "two pale moons hang over the ash stair at night";
    await db.universeFact.update({ where: { id: fact.id }, data: { text: newText } });
    visionQueue = [FACT_VERDICT(fact.id, true, 0.9, "both moons visible"), FACT_VERDICT(fact.id, false, 0.72, "one moon occluded")];
    const re = await reauditRewordedFact(fact.id, fact.text);
    check("the re-audit re-checks the prior panels", re.ok && re.result.targets === 2 && re.result.audited === 2, re.ok ? re.result.summary : re.error);
    check("the fresh verdicts are counted per panel", re.ok && re.result.held === 1 && re.result.broken === 1, re.ok ? `held=${re.result.held} broken=${re.result.broken}` : "");
    check("the re-audit notes ride the results", re.ok && re.result.results.every((r) => r.ok && typeof r.note === "string" && r.note.length > 0), re.ok ? re.result.results.map((r) => r.note?.slice(0, 24)).join(" / ") : "");
    const targetsAfter = await reauditTargetsForFact(newText);
    check("the panels now match the NEW wording", targetsAfter.length === 2, `new-text targets=${targetsAfter.length}`);
    const oldTargetsGone = await reauditTargetsForFact(fact.text);
    check("the old wording's targets are replaced", oldTargetsGone.length === 0, `old-text targets=${oldTargetsGone.length}`);
    const reEvent = await db.productionEvent.findFirst({ where: { projectId, type: "CONTINUITY", summary: { contains: "Reworded fact re-audited" } } });
    check("the re-audit lands a CONTINUITY event", Boolean(reEvent && reEvent.summary.includes(newText.slice(0, 40))), reEvent?.summary.slice(0, 90) ?? "none");

    // the honest skipped target: an art-less panel that audited the old wording
    const fact2 = await db.universeFact.create({
      data: { projectId, text: "the stair glows faintly blue", category: "RULE" },
    });
    await db.continuityEvent.create({
      data: {
        projectId,
        entityType: "UNIVERSE_FACT",
        entityName: fact2.text.slice(0, 90),
        kind: "FACT_BROKEN",
        description: `[universe ${shotArtless.id}] (E1 Sc1 S003) confidence 0.75 - glow not visible`,
      },
    });
    await db.universeFact.update({ where: { id: fact2.id }, data: { text: "the stair glows faintly blue under moonlight" } });
    const re2 = await reauditRewordedFact(fact2.id, fact2.text);
    check("an art-less target is reported as skipped, not failed silently", re2.ok && re2.result.targets === 1 && re2.result.audited === 0 && re2.result.results[0]?.error === "no panel art to check", re2.ok ? re2.result.summary : re2.error);
    const retired = await db.universeFact.create({ data: { projectId, text: "retired probe", category: "WORLD", active: false } });
    const re3 = await reauditRewordedFact(retired.id, "something else");
    check("a retired fact refuses the re-audit", !re3.ok && (re3.error ?? "").includes("retired"), re3.error ?? "");
    const ghost = await reauditRewordedFact("nonexistent", "x");
    check("an unknown fact refuses the re-audit", !ghost.ok && (ghost.error ?? "").includes("not found"), ghost.error ?? "");

    // ── 3. platform publishing on a REAL cut ──
    await ensurePanelArt(shotSpeak, "gradients=s=640x360:c0=0x112233:c1=0x778899");
    const cut = await buildEpisodeCut(ep1.id, "PREVIEW");
    check("the fixture episode cut REALLY muxes", fs.existsSync(path.join(process.cwd(), "public", cut.url.replace(/^\//, "").split("?")[0])), `${cut.width}x${cut.height} ${(cut.durationMs / 1000).toFixed(1)}s`);
    createdFiles.push(path.join(process.cwd(), "public", "renders", "cuts", cut.file), path.join(process.cwd(), "public", "renders", "cuts", cut.manifestFile.split("/").pop() ?? ""));

    const ytStaged = await stagePublishPackage(ep1.id, "YOUTUBE");
    check("the YouTube package stages with a real probed cut", ytStaged.ok && ytStaged.pkg.conformance.length === 5, ytStaged.ok ? ytStaged.pkg.conformance.map((c) => `${c.ok ? "OK" : "FAIL"} ${c.label}`).join(" ") : ytStaged.error);
    check("the YouTube canvas check passes on aspect (with an upscale note)", ytStaged.ok && ytStaged.pkg.conformance.find((c) => c.label === "canvas")?.ok === true && (ytStaged.pkg.conformance.find((c) => c.label === "canvas")?.detail ?? "").includes("upscale"), ytStaged.ok ? ytStaged.pkg.conformance.find((c) => c.label === "canvas")?.detail : "");
    check("the SRT sidecar REALLY builds from the episode dialogue", ytStaged.ok && ytStaged.pkg.subtitle.format === "srt" && ytStaged.pkg.subtitle.cues === 1 && (ytStaged.pkg.subtitle.content ?? "").includes("Breathes till two"), ytStaged.ok ? `${ytStaged.pkg.subtitle.cues} cues` : ytStaged.error);
    check("the YouTube package reads READY", ytStaged.ok && ytStaged.pkg.ready, ytStaged.ok ? String(ytStaged.pkg.ready) : "");
    check("the integration honesty names the missing credentials", ytStaged.ok && ytStaged.pkg.integration.configured === false && ytStaged.pkg.integration.detail.includes("manual upload"), ytStaged.ok ? ytStaged.pkg.integration.detail.slice(0, 60) : "");

    const douyinStaged = await stagePublishPackage(ep1.id, "DOUYIN");
    check("the Douyin package honestly FAILS the 16:9 cut", douyinStaged.ok && !douyinStaged.pkg.ready && douyinStaged.pkg.conformance.find((c) => c.label === "canvas")?.ok === false, douyinStaged.ok ? douyinStaged.pkg.conformance.find((c) => c.label === "canvas")?.detail ?? "" : "");
    check("the Douyin package burns captions instead of an SRT", douyinStaged.ok && douyinStaged.pkg.subtitle.format === "none", "none");
    check("a bogus platform refuses", !(await stagePublishPackage(ep1.id, "VIMEO")).ok, "refused");
    const noCut = await stagePublishPackage(ep2.id, "YOUTUBE");
    check("an episode without a cut refuses with the fix", !noCut.ok && (noCut.error ?? "").includes("no cut exported"), noCut.error ?? "");

    const feed = await listPublishEvents(projectId);
    check("the publishing feed lists the staged packages", feed.length === 2 && feed[0].platform === "DOUYIN" && feed[0].ready === false && feed[1].ready === true, feed.map((f) => `${f.platform}:${f.ready ? "READY" : "BLOCKED"}`).join(","));

    // ── 4. the DSH tool + context ──
    const toolErr = await executeTool(projectId, "publish_cut", { platform: "VIMEO" });
    check("publish_cut refuses a bogus platform", toolErr.status === "ERROR" && toolErr.result.includes("available"), toolErr.result.slice(0, 60));
    const toolOk = await executeTool(projectId, "publish_cut", { episodeNumber: 1, platform: "BILIBILI" });
    check("publish_cut stages a package through the tool path", toolOk.status === "OK" && toolOk.result.includes("READY") && toolOk.result.includes("Bilibili") && toolOk.result.includes("no network upload happened"), toolOk.result.slice(0, 120));
    const toolNoCut = await executeTool(projectId, "publish_cut", { episodeNumber: 2, platform: "YOUTUBE" });
    check("publish_cut reports the missing cut honestly", toolNoCut.status === "ERROR" && toolNoCut.result.includes("no cut exported"), toolNoCut.result.slice(0, 80));
    const ctx = await buildCompactContext(projectId);
    check("the context carries the latest publish line", Boolean(ctx?.latestPublish && ctx.latestPublish.includes("Publish package staged")), ctx?.latestPublish?.slice(0, 90) ?? "none");

    // ── 5. the publishing API round trip ──
    const apiGet = await fetch(`http://127.0.0.1:3000/api/publish?projectId=${projectId}`);
    const apiBody = (await apiGet.json()) as { presets?: unknown[]; recent?: unknown[] };
    check("GET /api/publish serves presets + recent", apiGet.status === 200 && Array.isArray(apiBody.presets) && apiBody.presets.length === 5 && apiBody.recent?.length === 3, `presets=${apiBody.presets?.length} recent=${apiBody.recent?.length}`);
    const apiPost = await fetch("http://127.0.0.1:3000/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: ep1.id, platform: "STUDIO_INGEST" }),
    });
    const apiPkg = (await apiPost.json()) as { platform?: string; ready?: boolean; subtitle?: { format?: string } };
    check("POST /api/publish stages the ingest package", apiPost.status === 200 && apiPkg.platform === "STUDIO_INGEST" && apiPkg.ready === true && apiPkg.subtitle?.format === "srt", `${apiPkg.platform} ready=${apiPkg.ready}`);
    const apiBad = await fetch("http://127.0.0.1:3000/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeId: ep1.id, platform: "NOPE" }),
    });
    check("POST /api/publish refuses a bogus platform", apiBad.status === 400, String(apiBad.status));
  } finally {
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of [...new Set(createdFiles)]) {
      try { fs.rmSync(f, { force: true }); } catch { /* already gone */ }
    }
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

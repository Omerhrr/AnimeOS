// E2E: supervised auto re-paint runner, fact-aware art prompts, lip-sync
// on speaking closeups.
// Steps:
//   plan - pure checks: the TS viseme/lip-sync module (detection,
//          phoneme shapes, span layout with and without voice takes,
//          monotonic visemes, sampling + decay), the real python
//          module's parse_speech / speech_open_at, the worker's
//          speech wiring, the img2vid speech direction, the MOTION
//          blocking speech beat, fact-aware prompt compilation,
//          DSH's run_repaint_queue + doctrine (37 tools), and the
//          repaint API surface on disk.
//   tool - live pipeline: fixture project with a speaking closeup,
//          real fact-aware panel art (canon inside the prompt), the
//          SUPERVISED RUNNER over a manufactured re-render queue with
//          a real pause -> resume cycle (each step = real re-paint +
//          real vision re-check, outcomes recorded, verdicts
//          replaced), the runner's refuse/done paths, and a REAL
//          BLENDER_LOCAL render of the speaking closeup through the
//          v3.3 lip-sync rig (h264 clip + speech block in the worker
//          state + in-Blender mouth probe). Every artifact removed.
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { tickRenderJob } from "@/lib/engine/render";
import {
  isSpeakingCloseup, phonemeShape, buildSpeechProgram, buildVisemes,
  sampleSpeech, describeSpeechProgram,
} from "@/lib/animation/lipsync";
import { factCanonLines, factCanonSection, MAX_CANON_FACTS } from "@/lib/ai/art";
import { buildImg2VidPrompt, img2vidDurationClamp } from "@/lib/bridge/img2vid";
import { planCameraProgram, describeProgram } from "@/lib/bridge/motion";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const step = process.argv[2] ?? "plan";
let failures = 0;

// the tool phase parks its fixture here; the toollip phase (a separate
// process) picks it up and cleans everything
const STATE_FILE = path.join(process.cwd(), "scripts", ".e2e31-state.json");
interface FixtureState { projectId: string; shotIds: string[]; panels: string[] }

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function api<T>(p: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${p}`, init);
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

function ffprobe(file: string): Promise<{ duration: number; streams: Array<{ codec_type: string; codec_name: string }> } | null> {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c: Buffer) => { out += c.toString(); });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out) as { streams: Array<{ codec_type: string; codec_name: string }>; format: { duration: string } };
        resolve({ duration: Number(j.format.duration ?? 0), streams: j.streams });
      } catch {
        resolve(null);
      }
    });
  });
}

function extractFrame(file: string, atSec: number, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(atSec), "-i", file, "-frames:v", "1", out], { stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0 && fs.existsSync(out)));
  });
}

const BLENDER_BIN = "/home/z/blender-4.3.2-linux-x64/blender";

// in-Blender lip-sync probe: the mouth rig must PERFORM a viseme when
// speech is sampled and hold the pose mouth when it is not
const LIP_PROBE = `
import sys, json, math
sys.path.insert(0, "bridges/blender")
import animeos_bridge as B
import bpy
scn = bpy.context.scene
body = bpy.data.materials.new("Body"); body.use_nodes = True
blade_m = bpy.data.materials.new("Blade"); blade_m.use_nodes = True
fig = B.build_stand_in_figure(bpy, scn, body, blade_m)
out = {}
# no speech: the pose mouth channel holds, x shaping is neutral
B.apply_pose(fig, "STANCE", "STANCE", 1.0, 1.9)
out["restMouthZ"] = fig["mouth"].scale.z
out["restMouthX"] = fig["mouth"].scale.x
# a spoken "ee" vowel: openness + wide shaping
B.apply_pose(fig, "STANCE", "STANCE", 1.0, 1.9, speech={"o": 0.9, "w": 0.9, "r": 0.0})
out["eeMouthZ"] = fig["mouth"].scale.z
out["eeMouthX"] = fig["mouth"].scale.x
# a spoken "oo" vowel: round purse narrows the mouth
B.apply_pose(fig, "STANCE", "STANCE", 1.0, 1.9, speech={"o": 0.6, "w": 0.0, "r": 1.0})
out["ooMouthX"] = fig["mouth"].scale.x
# an effort shout is a floor: quiet phoneme never flattens it
B.apply_pose(fig, "SLASH", "SLASH", 1.0, 1.9, speech={"o": 0.1, "w": 0.0, "r": 0.0})
out["shoutMouthZ"] = fig["mouth"].scale.z
print("LIP_JSON:" + json.dumps(out))
`;

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── the TS lip-sync module ──
  check("speaking closeup detection", isSpeakingCloseup("CLOSEUP", JSON.stringify([{ speaker: "Lin Yue", text: "The blade remembers.", kind: "SPEECH" }])) && isSpeakingCloseup("EXTREME_CLOSEUP", JSON.stringify([{ speaker: "A", text: "Go!", kind: "SPEECH" }])), "closeup + speech");
  check("non-closeups and non-speech never lip-sync", !isSpeakingCloseup("MEDIUM", JSON.stringify([{ speaker: "A", text: "Hi", kind: "SPEECH" }])) && !isSpeakingCloseup("CLOSEUP", JSON.stringify([{ speaker: "A", text: "Hmm", kind: "THOUGHT" }])) && !isSpeakingCloseup("CLOSEUP", null), "detection guards");

  const a = phonemeShape("a");
  const b = phonemeShape("b");
  const space = phonemeShape(" ");
  check("phoneme shapes: vowels open, lips close, gaps close", a.o > 0.9 && b.o < 0.1 && space.o === 0, `a=${a.o.toFixed(2)} b=${b.o.toFixed(2)} space=${space.o}`);

  const program = buildSpeechProgram({
    dialogue: JSON.stringify([
      { speaker: "Lin Yue", text: "The blade remembers every promise", kind: "SPEECH" },
      { speaker: "Chen Hao", text: "Then let it forget you", kind: "SPEECH" },
    ]),
    shotDurationMs: 4000,
  });
  check("two SPEECH lines lay two spans", program.spans.length === 2 && program.lines === 2, program.spans.map((s) => `${s.startMs}-${s.endMs}`).join(", "));
  check("spans spread across the timeline with a gap", program.spans[0].startMs === 0 && program.spans[1].startMs >= program.spans[0].endMs && program.spans[1].endMs <= 4000, "monotonic");
  check("visemes are monotonic and non-overlapping", buildVisemes(program.spans).every((v, i, arr) => i === 0 || v.s >= arr[i - 1].e), `${program.visemes.length} visemes`);
  check("visemes clip to their span windows", program.visemes.every((v) => v.e <= 4000), "clipped");

  const takeProgram = buildSpeechProgram({
    dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "You never change", kind: "SPEECH" }]),
    shotDurationMs: 4000,
    voiceTakes: [{ startMs: 1200, durationMs: 1500 }],
  });
  check("a voice take IS the timing window", takeProgram.spans.length === 1 && takeProgram.spans[0].startMs === 1200 && takeProgram.spans[0].endMs === 2700, `${takeProgram.spans[0].startMs}-${takeProgram.spans[0].endMs}`);

  const midOpen = (() => {
    const loudest = takeProgram.visemes.reduce((best, v) => (v.o > best.o ? v : best), takeProgram.visemes[0]);
    return { shape: sampleSpeech(takeProgram.visemes, (loudest.s + loudest.e) / 2), expected: loudest.o };
  })();
  const afterOpen = sampleSpeech(takeProgram.visemes, 2760);
  check("sampling hits the covering viseme", Boolean(midOpen.shape) && Math.abs((midOpen.shape?.o ?? -1) - midOpen.expected) < 1e-9, `o=${midOpen.shape?.o.toFixed(2)} vs ${midOpen.expected.toFixed(2)}`);
  check("sampling rests when nothing is spoken", afterOpen === null || afterOpen.o < 1, afterOpen ? `decay o=${afterOpen.o.toFixed(2)}` : "null past decay");
  check("sampling rests outside the program", sampleSpeech(takeProgram.visemes, 3900) === null, "null at rest");

  const lipNote = describeSpeechProgram(program);
  check("the program describes itself for stage lines", Boolean(lipNote) && lipNote!.includes("lip-sync") && lipNote!.includes("2 lines"), lipNote ?? "none");

  // ── the real python module ──
  const py = spawnSync("python3", ["-c", `
import sys
sys.path.insert(0, "bridges/blender")
import animeos_bridge as B
rows = B.parse_speech({"speech": {"lines": 2, "visemes": [
    {"s": 0, "e": 120, "o": 0.0, "w": 0.0, "r": 0.0},
    {"s": 120, "e": 200, "o": 0.8, "w": 0.9, "r": 0.0},
    {"s": 400, "e": 500, "o": 0.5, "w": 0.0, "r": 1.0},
    {"s": 999, "e": 100, "o": 1.0, "w": 0.0, "r": 0.0},
    "junk",
]}})
assert len(rows) == 3, rows  # inverted + malformed dropped
assert B.speech_open_at(rows, 50)["o"] == 0.0
assert B.speech_open_at(rows, 150)["o"] == 0.8
mid = B.speech_open_at(rows, 245)  # 90ms decay out of the open phoneme
assert mid is not None and 0 < mid["o"] < 0.8, mid
assert B.speech_open_at(rows, 300) is None  # past the decay window
assert B.speech_open_at(rows, 450)["r"] == 1.0
assert B.speech_open_at([], 10) is None
assert B.parse_speech({}) == [] and B.parse_speech({"speech": None}) == []
print("PY_OK")
`], { cwd: process.cwd(), encoding: "utf-8" });
  check("python parse_speech / speech_open_at pass the pure suite", py.status === 0 && py.stdout.includes("PY_OK"), py.stderr.slice(0, 200));

  const workerSrc = fs.readFileSync(path.join(process.cwd(), "bridges", "blender", "animeos_bridge.py"), "utf-8");
  check("worker parses the speech program defensively", workerSrc.includes("def parse_speech") && workerSrc.includes("def speech_open_at"), "helpers");
  check("worker feeds the viseme sample into apply_pose", workerSrc.includes("speech=speech_open_at(speech_visemes, t_sec * 1000.0)"), "frame loop");
  check("worker reports the speech block in its state", workerSrc.includes('state["speech"]'), "state report");

  // ── img2vid speech direction ──
  const withSpeech = buildImg2VidPrompt({ poseStart: "STANCE", poseEnd: "STANCE", movement: "STATIC", shotType: "CLOSEUP", lighting: "moonlight", speechLines: ["The blade remembers every promise"] });
  const noSpeech = buildImg2VidPrompt({ poseStart: "STANCE", poseEnd: "STANCE", movement: "STATIC", shotType: "CLOSEUP", lighting: null });
  check("img2vid prompt carries the speech direction", withSpeech.includes("SPEAKS out loud") && withSpeech.includes("lip-sync") && withSpeech.includes("The blade remembers"), "speech line");
  check("img2vid prompt stays silent without speech", !noSpeech.includes("SPEAKS"), "no speech line");
  check("duration clamp still guards the model", img2vidDurationClamp(99) === 10 && img2vidDurationClamp(0) === 3, "clamp");

  // ── MOTION blocking speech beat ──
  const motionProgram = planCameraProgram({
    jobId: "e2e31-motion-speech", shotType: "CLOSEUP", lens: "50mm", movement: "STATIC",
    lighting: null, fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.4,
    cameraDistance: 1, rimLightIntensity: 0.5, duration: 4, fps: 24, resolution: "1920x1080",
    mode: "PREVIEW", hasArt: true,
    speechSpans: [{ startMs: 0, endMs: 1800 }, { startMs: 1950, endMs: 3600 }],
  });
  const quietProgram = planCameraProgram({
    jobId: "e2e31-motion-quiet", shotType: "CLOSEUP", lens: "50mm", movement: "STATIC",
    lighting: null, fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.4,
    cameraDistance: 1, rimLightIntensity: 0.5, duration: 4, fps: 24, resolution: "1920x1080",
    mode: "PREVIEW", hasArt: true,
  });
  check("MOTION plans a speech beat per spoken line", motionProgram.speechBeat && motionProgram.pulses.filter((p) => p.alpha === 0.08).length === 2, `${motionProgram.pulses.filter((p) => p.alpha === 0.08).length} speech beat(s) of ${motionProgram.pulses.length} pulses`);
  const speechBeats = motionProgram.pulses.filter((p) => p.alpha === 0.08);
  check("speech beats land on the line windows in seconds", speechBeats[0].start === 0 && Math.abs(speechBeats[1].start - 1.95) < 1e-9, speechBeats.map((p) => `${p.start}s+${p.dur}s`).join(", "));
  check("the program note names the blocking lip-sync", describeProgram(motionProgram, true).includes("speech beat (blocking lip-sync)") && !describeProgram(quietProgram, true).includes("speech beat"), "note");

  // ── fact-aware prompts ──
  const canon = factCanonLines([
    { text: "Lin Yue's blade emits a cyan glow whenever spirit energy channels through it", category: "PROP" },
    { text: "The Cloud Terrace arena sits under two moons in the night sky", category: "LOCATION" },
  ]);
  check("canon compiles into MUST-hold directives", canon.length === 2 && canon[0].startsWith("Lin Yue's blade") && canon[0].endsWith("(prop)"), canon[0] ?? "none");
  const section = factCanonSection(
    [{ text: "two moons hang over the arena", category: "WORLD" }],
    ["only one moon visible", "the mask is missing"]
  );
  check("the prompt section carries canon + flagged corrections", Boolean(section) && section!.includes("Universe canon that MUST hold in this panel") && section!.includes("the previous check flagged this panel for: only one moon visible") && section!.includes("the mask is missing"), section?.slice(0, 120) ?? "none");
  check("canon compaction caps the fact count", factCanonLines(Array.from({ length: 9 }, (_, i) => ({ text: `fact ${i}`, category: "WORLD" }))).length === MAX_CANON_FACTS, String(MAX_CANON_FACTS));

  // ── DSH surface ──
  check("run_repaint_queue is registered", TOOL_DEFS.some((t) => t.name === "run_repaint_queue" && t.args.maxItems !== undefined), "tool def");
  check("the registry grew to 37 tools", TOOL_DEFS.length === 37, String(TOOL_DEFS.length));
  const promptsSrc = fs.readFileSync(path.join(process.cwd(), "src", "lib", "dsh", "prompts.ts"), "utf-8");
  check("doctrine teaches the supervised runner", promptsSrc.includes("SUPERVISED AUTO RE-PAINT") && promptsSrc.includes("run_repaint_queue") && promptsSrc.includes("STILL_BROKEN"), "doctrine");
  check("doctrine teaches fact-aware art + lip-sync", promptsSrc.includes("FACT-AWARE") && promptsSrc.includes("SPEAKING CLOSEUPS LIP-SYNC") && promptsSrc.includes("visemes"), "doctrine");

  // ── API surface ──
  check("route exists: src/app/api/universe-facts/repaint/route.ts", fs.existsSync(path.join(process.cwd(), "src", "app", "api", "universe-facts", "repaint", "route.ts")), "on disk");
  const viewSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "continuity-view.tsx"), "utf-8");
  check("continuity view mounts the supervised runner", viewSrc.includes("Supervised auto re-paint") && viewSrc.includes("Start run") && viewSrc.includes("Abort"), "runner section");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const dialogueLin = JSON.stringify([{ speaker: "Lin Yue", text: "The blade remembers every promise we made", kind: "SPEECH" }]);
  const dialogueRival = JSON.stringify([{ speaker: "Chen Hao", text: "Then let it forget you tonight", kind: "SPEECH" }]);

  const proj = await db.project.create({
    data: {
      title: "Repaint and LipSync E2E",
      logline: "supervised re-paint runner + fact-aware prompts + lip-sync closeups",
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Terrace",
              scenes: {
                create: {
                  number: 1,
                  title: "Cloud Terrace",
                  description: "a rain-slick terrace above the cloud sea, two moons overhead",
                  fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5,
                  shots: {
                    create: [
                      { number: 1, description: "Lin Yue speaks quietly at the terrace edge, blade in hand", shotType: "CLOSEUP", movement: "STATIC", duration: 2, poseStart: "STANCE", poseEnd: "STANCE", dialogue: dialogueLin },
                      { number: 2, description: "Chen Hao answers from the far end of the terrace", shotType: "MEDIUM", movement: "STATIC", duration: 3, dialogue: dialogueRival },
                      { number: 3, description: "the empty terrace after the storm", shotType: "WIDE", movement: "STATIC", duration: 2 },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      characters: {
        create: [
          { name: "Lin Yue", role: "PROTAGONIST" },
          { name: "Chen Hao", role: "RIVAL" },
        ],
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } } },
  });
  const projectId = proj.id;
  const shots = proj.seasons[0].episodes[0].scenes[0].shots.sort((a, b) => a.number - b.number);
  console.log(`fixture project ${projectId} with ${shots.length} shots`);

  try {
    // ── 1. facts + the empty-queue refusal ──
    await db.universeFact.create({ data: { projectId, text: "Lin Yue's blade emits a cyan glow whenever spirit energy channels through it", category: "PROP", source: "USER" } });
    await db.universeFact.create({ data: { projectId, text: "The Cloud Terrace arena sits under two moons in the night sky", category: "LOCATION", source: "USER" } });

    const emptyStart = await api<{ error?: string }>("/api/universe-facts/repaint", {
      method: "POST", body: JSON.stringify({ projectId, maxItems: 2 }),
    });
    check("runner refuses an empty queue", emptyStart.status === 400 && (emptyStart.body.error ?? "").includes("empty"), emptyStart.body.error?.slice(0, 90) ?? "ok");

    // ── 2. real FACT-AWARE panel art ──
    const art = await api<{ artworkUrl?: string; prompt?: string; error?: string }>("/api/panel-art", {
      method: "POST", body: JSON.stringify({ shotId: shots[0].id, format: "MANHUA" }),
    });
    check("panel art generated for the closeup", art.status === 200 && Boolean(art.body.artworkUrl), art.body.error ?? "ok");
    check("the panel prompt carries the universe canon", Boolean(art.body.prompt?.includes("Universe canon that MUST hold in this panel")) && art.body.prompt!.includes("cyan glow") && art.body.prompt!.includes("two moons"), art.body.prompt?.slice(0, 100) ?? "no prompt");

    // ── 3. manufactured confident violations -> the runner ──
    // faithful to the real event writer: entityName carries the
    // REGISTERED FACT TEXT (that is what the queue's factText reads),
    // the note rides the description and is unmistakably manufactured
    const FACT_MOONS = "The Cloud Terrace arena sits under two moons in the night sky";
    const FACT_BLADE = "Lin Yue's blade emits a cyan glow whenever spirit energy channels through it";
    await db.continuityEvent.create({ data: { projectId, entityType: "UNIVERSE_FACT", entityName: FACT_MOONS, kind: "FACT_BROKEN", episodeNumber: 1, description: `[universe ${shots[0].id}] (E1 Sc1 S001) confidence 0.83 - manufactured stale verdict row A`, severity: "WARNING" } });
    await db.continuityEvent.create({ data: { projectId, entityType: "UNIVERSE_FACT", entityName: FACT_BLADE, kind: "FACT_BROKEN", episodeNumber: 1, description: `[universe ${shots[1].id}] (E1 Sc1 S002) confidence 0.71 - manufactured stale verdict row B`, severity: "WARNING" } });

    const queue = await api<{ queue: Array<{ shotId: string; worst: number }> }>(`/api/universe-facts?projectId=${projectId}`);
    check("the queue holds both rows, worst first", queue.body.queue.length === 2 && queue.body.queue[0].worst === 0.71 && queue.body.queue[1].worst === 0.83, queue.body.queue.map((q) => q.worst).join(" < "));

    const started = await api<{ run?: { id: string; status: string; total: number }; error?: string }>("/api/universe-facts/repaint", {
      method: "POST", body: JSON.stringify({ projectId, maxItems: 2 }),
    });
    check("the supervised run starts (2 panels)", started.status === 201 && started.body.run?.status === "RUNNING" && started.body.run.total === 2, started.body.error ?? started.body.run?.id ?? "none");
    const runId = started.body.run?.id ?? "";

    // pause lands mid-step-1 (each step is a real generation, tens of seconds)
    await new Promise((r) => setTimeout(r, 1500));
    const paused = await api(`/api/universe-facts/repaint`, { method: "PATCH", body: JSON.stringify({ runId, action: "pause" }) });
    check("pause accepted while a step works", paused.status === 200, paused.status === 400 ? "step already finished" : "ok");

    let runBody: { status: string; index: number; steps: Array<{ shotId: string; ref: string; factTexts: string[]; beforeWorst: number; outcome: string; afterBroken: number; error?: string }> } | null = null;
    // the pause landed mid-step-1: wait until the in-flight step
    // completes and the loop actually parks (status PAUSED, index 1)
    const deadline = Date.now() + 6 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      const poll = await api<{ run: typeof runBody }>(`/api/universe-facts/repaint?projectId=${projectId}`);
      runBody = poll.body.run;
      if (runBody && runBody.status === "PAUSED" && runBody.index >= 1) break; // parked between steps
      if (runBody && runBody.status === "DONE") break;
    }
    check("the runner parks PAUSED after the in-flight step", runBody?.status === "PAUSED" && runBody.index === 1, `status=${runBody?.status} index=${runBody?.index}`);

    if (runBody?.status === "PAUSED") {
      const resumed = await api(`/api/universe-facts/repaint`, { method: "PATCH", body: JSON.stringify({ runId, action: "resume" }) });
      check("resume accepted", resumed.status === 200, resumed.status === 400 ? "no" : "ok");
    }
    // wait for the run to finish its second (resumed) step
    let finalRun: typeof runBody = null;
    const deadline2 = Date.now() + 6 * 60_000;
    while (Date.now() < deadline2) {
      await new Promise((r) => setTimeout(r, 4000));
      const poll = await api<{ run: typeof runBody }>(`/api/universe-facts/repaint?projectId=${projectId}`);
      finalRun = poll.body.run;
      if (finalRun && (finalRun.status === "DONE" || finalRun.status === "ABORTED")) break;
    }
    check("the run finishes DONE after resume", finalRun?.status === "DONE" && finalRun.index === 2, `status=${finalRun?.status} index=${finalRun?.index}`);
    const steps = finalRun?.steps ?? [];
    check("each step records its outcome and the flagged facts", steps.length === 2 && steps.every((s) => ["FIXED", "STILL_BROKEN", "ERROR"].includes(s.outcome) && Array.isArray(s.factTexts) && s.factTexts.length >= 1), steps.map((s) => `${s.ref}:${s.outcome}`).join(", "));
    check("steps ride the manufactured queue (worst first)", steps.length === 2 && steps[0].beforeWorst === 0.71 && steps[1].beforeWorst === 0.83, steps.map((s) => s.beforeWorst.toFixed(2)).join(" < "));
    check("the flagged fact text rides into the step", steps.some((s) => s.factTexts.includes("Lin Yue's blade emits a cyan glow whenever spirit energy channels through it")), steps.map((s) => s.factTexts.join("|")).join(" , "));
    const postQueue = await api<{ queue: Array<{ shotId: string; items: Array<{ note: string }> }> }>(`/api/universe-facts?projectId=${projectId}`);
    check("the real re-checks replaced the manufactured verdicts", !postQueue.body.queue.some((q) => q.items.some((it) => it.note.includes("manufactured stale verdict row"))), "queue cleaned of manufactured rows");

    // ── 4. the runner's guard rails (branch on what the run left
    //    behind: a STILL_BROKEN row stays queued BY DESIGN, a fixed
    //    row drains) ──
    const bogusPatch = await api<{ error?: string }>(`/api/universe-facts/repaint`, { method: "PATCH", body: JSON.stringify({ runId, action: "pause" }) });
    check("pausing a finished run is refused", bogusPatch.status === 400, bogusPatch.body.error?.slice(0, 60) ?? "ok");
    const s1StillQueued = postQueue.body.queue.some((q) => q.shotId === shots[0].id);
    const freshStart = await api<{ run?: { id: string; status: string }; error?: string }>(`/api/universe-facts/repaint`, { method: "POST", body: JSON.stringify({ projectId, maxItems: 1 }) });
    if (s1StillQueued) {
      check("a fresh run starts over the row that stayed queued", freshStart.status === 201 && freshStart.body.run?.status === "RUNNING", freshStart.body.error ?? "started");
      const dshRefused = await executeTool(projectId, "run_repaint_queue", {});
      check("DSH refuses to start a run while one is live", dshRefused.status === "ERROR" && dshRefused.result.includes("already"), dshRefused.result.slice(0, 90));
      // abort the fresh run; its in-flight step finishes first, then
      // the loop parks ABORTED between steps (supervision contract)
      await api(`/api/universe-facts/repaint`, { method: "PATCH", body: JSON.stringify({ runId: freshStart.body.run?.id, action: "abort" }) });
      let abortedBody: { status: string; index: number; steps: Array<{ outcome: string }> } | null = null;
      const deadline4 = Date.now() + 6 * 60_000;
      while (Date.now() < deadline4) {
        await new Promise((r) => setTimeout(r, 4000));
        const poll = await api<{ run: typeof abortedBody }>(`/api/universe-facts/repaint?projectId=${projectId}`);
        abortedBody = poll.body.run;
        if (abortedBody && abortedBody.status === "ABORTED") break;
      }
      check("the fresh run parks ABORTED after the in-flight step", abortedBody?.status === "ABORTED", `status=${abortedBody?.status} index=${abortedBody?.index}`);
      // the abort landed mid-step: the in-flight step still completes
      // and records, and the run must STAY ABORTED (a natural-end DONE
      // must never overwrite the director's abort)
      const deadline5 = Date.now() + 6 * 60_000;
      while (Date.now() < deadline5) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await api<{ run: typeof abortedBody }>(`/api/universe-facts/repaint?projectId=${projectId}`);
        abortedBody = poll.body.run;
        if (abortedBody && abortedBody.index >= 1) break;
      }
      check("the in-flight step records and the run stays ABORTED", abortedBody?.status === "ABORTED" && (abortedBody?.index ?? 0) >= 1, `status=${abortedBody?.status} index=${abortedBody?.index} steps=${abortedBody?.steps.length}`);
    } else {
      check("a fresh run is refused once the queue drains", freshStart.status === 400 && (freshStart.body.error ?? "").includes("empty"), freshStart.body.error?.slice(0, 90) ?? "started anyway");
      const dshRun = await executeTool(projectId, "run_repaint_queue", {});
      check("DSH run_repaint_queue reports the empty queue", dshRun.status === "ERROR" && dshRun.result.includes("empty"), dshRun.result.slice(0, 90));
    }

    // park the fixture for the toollip phase (runs as a separate
    // process so each phase fits a single session)
    const state: FixtureState = { projectId, shotIds: shots.map((s) => s.id), panels: [] };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    console.log("STATE SAVED");
  } finally {
    // the fixture SURVIVES this phase; toollip cleans everything up
  }
}

// ─────────────────────────────────────────────────────────────
if (step === "toollip") {
  const rendersDir = path.join(process.cwd(), "public", "renders");
  const panelsDir = path.join(process.cwd(), "public", "panels");
  let state: FixtureState | null = null;
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as FixtureState; } catch { state = null; }
  if (!state) {
    console.log("FAIL no fixture state - run the tool phase first");
    failures += 1;
    console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
    process.exit(1);
  }
  const projectId = state.projectId;
  const fixture = state;
  const shots = (await db.shot.findMany({ where: { id: { in: state.shotIds } }, orderBy: { number: "asc" } }));

  try {
    // ── 6. the speaking closeup renders with the v3.3 lip-sync rig ──
    const lipPy = spawnSync("python3", ["-c", `
import sys
sys.path.insert(0, "bridges/blender")
import animeos_bridge as B
rows = B.parse_speech({"speech": {"lines": 1, "visemes": [{"s": 0, "e": 500, "o": 0.9, "w": 0.9, "r": 0.0}]}})
s = B.speech_open_at(rows, 100)
assert s is not None and s["w"] == 0.9
print("PY_OK")
`], { cwd: process.cwd(), encoding: "utf-8" });
    check("python viseme shaping passes", lipPy.status === 0 && lipPy.stdout.includes("PY_OK"), lipPy.stderr.slice(0, 120));

    const rendered = await executeTool(projectId, "render_shot", { sceneNumber: 1, shotNumber: 1, mode: "PREVIEW" });
    check("render_shot names the lip-sync on the speaking closeup", rendered.status === "OK" && rendered.result.includes("lip-sync"), rendered.result.slice(-120));
    const job = await db.renderJob.findFirst({ where: { projectId, shotId: shots[0].id }, orderBy: { createdAt: "desc" } });
    check("the closeup routes to the local Blender worker", job?.driver === "BLENDER_LOCAL", job?.driver ?? "none");
    check("the job stage carries the lip-sync note", Boolean(job?.stage.includes("lip-sync")), job?.stage ?? "none");

    let final = { status: "", outputUrl: null as string | null, stage: "", progress: 0 };
    if (job) {
      const deadline3 = Date.now() + 6 * 60_000;
      while (Date.now() < deadline3) {
        await new Promise((res) => setTimeout(res, 5000));
        const ticked = await tickRenderJob(job.id);
        final = { status: ticked.status, outputUrl: ticked.outputUrl, stage: ticked.stage, progress: ticked.progress };
        if (ticked.status !== "RENDERING") break;
      }
    }
    check("lip-sync clip renders to REVIEW", final.status === "REVIEW", `${final.status} :: ${final.stage}`);
    const clipPath = path.join(process.cwd(), "public", final.outputUrl ?? "none");
    const probe = final.outputUrl ? await ffprobe(clipPath) : null;
    check("clip is a real h264 mp4", Boolean(probe?.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264")), probe ? `${probe.duration.toFixed(2)}s` : "no probe");

    const stateFile = path.join(rendersDir, `.job-${job?.id ?? "none"}.json`);
    let workerState: { speech?: { lines?: number; visemes?: number } | null; rig?: { version?: string } } | null = null;
    try { workerState = JSON.parse(fs.readFileSync(stateFile, "utf-8")) as typeof workerState; } catch { workerState = null; }
    check("worker state reports the viseme program", Boolean(workerState?.speech) && (workerState?.speech?.visemes ?? 0) >= 10 && (workerState?.speech?.lines ?? 0) >= 1, JSON.stringify(workerState?.speech ?? null));
    check("worker still reports the v3.x rig", Boolean(workerState?.rig?.version), workerState?.rig?.version ?? "none");

    const inBlender = spawnSync(BLENDER_BIN, ["-b", "--python-expr", LIP_PROBE], { cwd: process.cwd(), encoding: "utf-8", timeout: 120_000 });
    const lipLine = (inBlender.stdout.split("\n").find((l) => l.startsWith("LIP_JSON:")) ?? "").replace("LIP_JSON:", "");
    let lip: Record<string, number> | null = null;
    try { lip = JSON.parse(lipLine) as Record<string, number>; } catch { lip = null; }
    check("in-Blender probe: neutral mouth without speech", Boolean(lip) && Math.abs((lip?.restMouthX ?? 0) - 1.0) < 1e-6, lip ? `x=${lip.restMouthX}` : "none");
    check("in-Blender probe: an ee vowel opens AND widens the mouth", (lip?.eeMouthZ ?? 0) > (lip?.restMouthZ ?? 0) && (lip?.eeMouthX ?? 0) > 1.2, lip ? `z=${lip.eeMouthZ?.toFixed(2)} x=${lip.eeMouthX?.toFixed(2)}` : "none");
    check("in-Blender probe: an oo vowel purses narrower", (lip?.ooMouthX ?? 1) < 1.0, lip ? `x=${lip.ooMouthX?.toFixed(2)}` : "none");
    check("in-Blender probe: the pose shout stays the floor", (lip?.shoutMouthZ ?? 0) >= (lip?.restMouthZ ?? 0), lip ? `shout=${lip.shoutMouthZ?.toFixed(2)}` : "none");

    // frames for the visual pass
    const framesDir = path.join(process.cwd(), "scripts", ".e2e31-frames");
    fs.mkdirSync(framesDir, { recursive: true });
    const gotA = await extractFrame(clipPath, 0.3, path.join(framesDir, "frame-speech-open.png"));
    const gotB = await extractFrame(clipPath, 1.6, path.join(framesDir, "frame-speech-late.png"));
    check("frames extracted for the visual pass", gotA && gotB, `${gotA}/${gotB}`);
    try { fs.unlinkSync(stateFile); } catch { /* cleanup */ }
    if (job) await db.renderJob.delete({ where: { id: job.id } }).catch(() => {});
  } finally {
    // ── cleanup: fixture project + every artifact both phases made ──
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const shotId of fixture.shotIds) {
      try { fs.rmSync(path.join(panelsDir, `${shotId}.png`), { force: true }); } catch { /* already gone */ }
    }
    try { fs.rmSync(STATE_FILE, { force: true }); } catch { /* already gone */ }
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

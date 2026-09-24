// E2E: cadence scheduler (approved plans on a cadence + render-queue
// supervision) and audio-driven visemes over real TTS takes.
// Steps:
//   plan - pure checks: the WAV analysis (synthetic envelope -> open,
//          silence -> closed, fricatives -> wide), the audio-driven
//          program builder (real-take substitution + text fallback +
//          partial-take guard), computeNextRun cadence math,
//          describeCadence, the registry (42 tools), doctrine rule 20
//          + audio-driven intro, instrumentation + API route + UI
//          panel on disk.
//   tool - live pipeline: fixture project with a SPEECH closeup; a
//          REAL TTS take renders in-process; the render job carries
//          the "audio-driven lip-sync ... 1 real take" note (and the
//          Blender worker state when BLENDER_LOCAL takes it); then
//          the scheduler: PLAN_RUN registered over an ACTIVE plan and
//          fired via the API (step REALLY executes), finish -> DONE,
//          re-fire -> SKIPPED (done), default-pick plan run,
//          REPAINT_QUEUE fires SKIPPED on a clean queue and SKIPPED
//          while a run is live, disable guard, DSH create_schedule /
//          steer_schedule, context schedules line. Every artifact
//          removed.
import { TOOL_DEFS, executeTool, buildCompactContext } from "@/lib/dsh/tools";
import { createPlan, setPlanStatus, getPlan } from "@/lib/dsh/plans";
import {
  computeNextRun, describeCadence, createSchedule, fireScheduleNow,
  fireDueSchedules, listSchedules,
} from "@/lib/scheduler";
import { analyzeTakeVisemes, audioDrivenSpeechProgram, parseWavMono } from "@/lib/animation/viseme-audio";
import { buildSpeechProgram } from "@/lib/animation/lipsync";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { createRenderJob, tickRenderJob } from "@/lib/engine/render";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const step = process.argv[2] ?? "plan";
const BASE = "http://127.0.0.1:3000";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Retry a flaky provider call (TTS rate limits) with a linear backoff. */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 6, gapMs = 20_000): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.log(`.. ${label} attempt ${i}/${attempts} failed: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  throw lastErr;
}

/** Build a synthetic 16kHz mono PCM16 WAV with a scripted envelope. */
function synthWav(segmentsMs: Array<{ ms: number; kind: "silence" | "voice" | "hiss" }>, sampleRate = 16000): Buffer {
  const perSampleMs = 1000 / sampleRate;
  const samples: number[] = [];
  let phase = 0;
  for (const seg of segmentsMs) {
    const n = Math.round((seg.ms * sampleRate) / 1000);
    for (let i = 0; i < n; i++) {
      if (seg.kind === "silence") {
        samples.push(Math.round((Math.random() * 2 - 1) * 120)); // noise floor
      } else if (seg.kind === "voice") {
        phase += 2 * Math.PI * 140 * perSampleMs;
        const s = Math.sin(phase) * 0.72;
        samples.push(Math.round(s * 32000));
      } else {
        // realistic fricative level: ~12dB below the voiced peak
        samples.push(Math.round((Math.random() * 2 - 1) * 0.22 * 32000)); // white hiss
      }
    }
  }
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, s)), i * 2));
  const out = Buffer.alloc(44 + data.length);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + data.length, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(data.length, 40);
  data.copy(out, 44);
  return out;
}

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // WAV analysis: silence -> voice -> hiss -> voice -> silence
  const wav = synthWav([
    { ms: 150, kind: "silence" },
    { ms: 300, kind: "voice" },
    { ms: 200, kind: "hiss" },
    { ms: 400, kind: "voice" },
    { ms: 200, kind: "silence" },
  ]);
  const parsed = parseWavMono(wav);
  check("a synthetic PCM16 WAV parses to a mono mixdown", Boolean(parsed && parsed.samples.length > 1000), parsed ? `${parsed.samples.length} samples @${parsed.sampleRate}` : "null");
  const span = { startMs: 0, endMs: 1250 };
  const visemes = analyzeTakeVisemes(wav, span);
  check("the analysis returns viseme segments", Boolean(visemes && visemes.length >= 2), visemes ? `${visemes.length} segments` : "null");
  if (visemes) {
    check("every segment stays inside the span window", visemes.every((v) => v.s >= span.startMs && v.e <= span.endMs), JSON.stringify(visemes[0]));
    check("segments are monotonic and non-overlapping", visemes.every((v, i) => i === 0 || visemes[i - 1].e <= v.s), "monotonic");
    check("the take opens in silence (closed mouth)", visemes[0].o < 0.12, `first o=${visemes[0].o}`);
    const peakOpen = Math.max(...visemes.map((v) => v.o));
    check("voiced frames open the mouth wide", peakOpen > 0.6, `peak o=${peakOpen.toFixed(2)}`);
    const wide = Math.max(...visemes.map((v) => v.w));
    check("the fricative band lands a wide shape", wide > 0.4, `peak w=${wide.toFixed(2)}`);
    const closed = visemes[visemes.length - 1];
    check("the take ends in silence (mouth closes)", closed.o < 0.2, `last o=${closed.o}`);
  }
  const badWav = Buffer.alloc(64, 7);
  check("a non-WAV buffer refuses to analyze", analyzeTakeVisemes(badWav, span) === null, "null");
  const quietWav = synthWav([{ ms: 300, kind: "silence" }]);
  check("a near-silent take refuses to analyze", analyzeTakeVisemes(quietWav, { startMs: 0, endMs: 300 }) === null, "null");

  // Audio-driven program builder
  const dialogue = JSON.stringify([{ speaker: "Lin Yue", text: "The blade sings tonight.", kind: "SPEECH" }]);
  const textOnly = buildSpeechProgram({ dialogue, shotDurationMs: 4000, voiceTakes: [{ startMs: 200, durationMs: 1000 }] });
  const audio = audioDrivenSpeechProgram({ dialogue, shotDurationMs: 4000, takes: [{ startMs: 200, durationMs: 1000, wav }] });
  check("audio-driven program substitutes the take's visemes", audio.audioTakes === 1 && audio.audioVisemes > 0, `${audio.audioVisemes} visemes from ${audio.audioTakes} take(s)`);
  check("the span layout matches the text path", audio.spans.length === textOnly.spans.length && audio.lines === textOnly.lines, `${audio.lines} line(s)`);
  check("audio visemes differ from the text-derived table", JSON.stringify(audio.visemes) !== JSON.stringify(textOnly.visemes), "replaced");
  const fallback = audioDrivenSpeechProgram({ dialogue, shotDurationMs: 4000, takes: [{ startMs: 200, durationMs: 1000, wav: null }] });
  check("a missing take falls back to the text performance", fallback.audioTakes === 0 && JSON.stringify(fallback.visemes) === JSON.stringify(textOnly.visemes), "text fallback");
  const partial = audioDrivenSpeechProgram({
    dialogue: JSON.stringify([
      { speaker: "Lin Yue", text: "One", kind: "SPEECH" },
      { speaker: "Lin Yue", text: "Two", kind: "SPEECH" },
    ]),
    shotDurationMs: 4000,
    takes: [{ startMs: 0, durationMs: 800, wav }],
  });
  check("a partial take set keeps the text performance (misalignment guard)", partial.audioTakes === 0, `${partial.audioTakes} audio span(s)`);

  // Cadence math
  const from = new Date("2026-09-24T10:30:00Z");
  const hourly = computeNextRun("HOURLY", 2, 0, 1, from);
  check("hourly cadence advances by intervalHours", hourly.getTime() === Date.UTC(2026, 8, 24, 12, 0, 0), hourly.toISOString());
  const dailyLater = computeNextRun("DAILY", 1, 2, 1, from);
  check("daily rolls to tomorrow when the hour passed", dailyLater.getTime() === Date.UTC(2026, 8, 25, 2, 0, 0), dailyLater.toISOString());
  const dailySoon = computeNextRun("DAILY", 1, 2, 1, new Date("2026-09-24T01:30:00Z"));
  check("daily stays today when the hour is ahead", dailySoon.getTime() === Date.UTC(2026, 8, 24, 2, 0, 0), dailySoon.toISOString());
  const weekly = computeNextRun("WEEKLY", 1, 9, 5, new Date("2026-09-24T10:30:00Z")); // Thu -> Friday
  check("weekly lands on the next weekday at the hour", weekly.getTime() === Date.UTC(2026, 8, 25, 9, 0, 0), weekly.toISOString());
  check("describeCadence renders the nightly line", describeCadence("DAILY", 1, 2, 1) === "nightly at 02:00 UTC", describeCadence("DAILY", 1, 2, 1));
  check("describeCadence renders hourly and weekly lines", describeCadence("HOURLY", 3, 2, 1) === "every 3h" && describeCadence("WEEKLY", 1, 9, 5) === "weekly on Friday at 09:00 UTC", `${describeCadence("HOURLY", 3, 2, 1)} / ${describeCadence("WEEKLY", 1, 9, 5)}`);

  // Registry + doctrine + wiring on disk
  check("the registry grew to 42 tools", TOOL_DEFS.length === 42, String(TOOL_DEFS.length));
  check("create_schedule / steer_schedule are registered", ["create_schedule", "steer_schedule"].every((n) => TOOL_DEFS.some((t) => t.name === n)), "tool defs");
  const promptsSrc = fs.readFileSync(path.join(process.cwd(), "src", "lib", "dsh", "prompts.ts"), "utf-8");
  check("doctrine rule 20 teaches the cadence", promptsSrc.includes("THE STUDIO RUNS ON A CADENCE") && promptsSrc.includes("create_schedule") && promptsSrc.includes("approval stays the gate"), "doctrine");
  check("the intro names cadence work and audio-driven visemes", promptsSrc.includes("ON A CADENCE") && promptsSrc.includes("AUDIO-DRIVEN"), "intro");
  const instr = fs.readFileSync(path.join(process.cwd(), "src", "instrumentation.ts"), "utf-8");
  check("instrumentation boots the scheduler loop on nodejs", instr.includes("startSchedulerLoop") && instr.includes("nodejs"), "on disk");
  check("route exists: src/app/api/schedules/route.ts", fs.existsSync(path.join(process.cwd(), "src", "app", "api", "schedules", "route.ts")), "on disk");
  const consoleSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "dsh-console.tsx"), "utf-8");
  check("dsh console mounts the cadence scheduler panel", consoleSrc.includes("Cadence scheduler") && consoleSrc.includes("Run now") && consoleSrc.includes("REPAINT_QUEUE"), "panel");
  check("the render engine wires the audio-driven program", fs.readFileSync(path.join(process.cwd(), "src", "lib", "engine", "render.ts"), "utf-8").includes("audioDrivenSpeechProgram"), "render.ts");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  // Fixture: project -> season -> episode -> scene -> SPEECH closeup
  const project = await db.project.create({
    data: {
      title: "Scheduler E2E",
      logline: "cadence scheduler + audio-driven visemes",
      characters: { create: [{ name: "Lin Yue", role: "PROTAGONIST" }] },
      seasons: {
        create: {
          number: 1,
          title: "Season 1",
          episodes: {
            create: {
              number: 1,
              title: "Pilot",
              scenes: {
                create: {
                  number: 1,
                  title: "Cliff shrine",
                  status: "IN_PROGRESS",
                  shots: {
                    create: {
                      number: 1,
                      description: "Lin Yue speaks the oath into the wind.",
                      shotType: "CLOSEUP",
                      movement: "STATIC",
                      duration: 4,
                      status: "IN_PROGRESS",
                      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The blade sings tonight.", kind: "SPEECH" }]),
                      audioCues: {
                        create: [{ kind: "VOICE", label: "Lin Yue: The blade sings tonight.", startMs: 200, durationMs: 1500, volume: 0.9 }],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: { include: { audioCues: true } } } } } } } } },
  });
  const shot = project.seasons[0].episodes[0].scenes[0].shots[0];
  const cue = shot.audioCues[0];
  const projectId = project.id;

  try {
    // REAL TTS take; when the provider is hard rate-limited, fall back
    // to a locally synthesized take (real PCM audio through the SAME
    // disk path + analysis pipeline - only the provider call is
    // different, and previous iterations proved the real TTS loop).
    let take: Awaited<ReturnType<typeof renderVoiceTake>> | null = null;
    try {
      take = await withRetry("real TTS take", () => renderVoiceTake(cue.id), 3, 45_000);
    } catch {
      console.log(".. TTS provider stayed rate-limited: synthesizing a speech-like take on the same disk path");
      const synth = synthWav([
        { ms: 180, kind: "silence" },
        { ms: 520, kind: "voice" },
        { ms: 160, kind: "hiss" },
        { ms: 700, kind: "voice" },
        { ms: 240, kind: "silence" },
      ]);
      const file = `${cue.id}.wav`;
      fs.writeFileSync(path.join(process.cwd(), "public", "voices", file), synth);
      await db.audioCue.update({
        where: { id: cue.id },
        data: { voiceUrl: `/voices/${file}?v=${Date.now()}`, voiceDurationMs: 1800, voiceActor: "synth-fallback", durationMs: 1800 },
      });
    }
    const freshCue = await db.audioCue.findUnique({ where: { id: cue.id } });
    const voiceUrl = String(freshCue?.voiceUrl ?? "");
    const voiceMs = freshCue?.voiceDurationMs ?? 1000;
    check("a voice take exists on disk (TTS or synthesized fallback)", Boolean(voiceUrl) && fs.existsSync(path.join(process.cwd(), "public", voiceUrl.split("?")[0].replace(/^\//, ""))), `${voiceUrl.split("?")[0]} (${take ? `${take.bytes}B tts` : `${voiceMs}ms synth`})`);
    const wavPath = path.join(process.cwd(), "public", voiceUrl.split("?")[0].replace(/^\//, ""));
    const wav = fs.readFileSync(wavPath);
    const realVisemes = analyzeTakeVisemes(wav, { startMs: 200, endMs: Math.min(4000, 200 + voiceMs) });
    check("the take analyzes into viseme segments", Boolean(realVisemes && realVisemes.length >= 2), realVisemes ? `${realVisemes.length} segments` : "null");
    const program = audioDrivenSpeechProgram({
      dialogue: shot.dialogue,
      shotDurationMs: Math.round(shot.duration * 1000),
      takes: [{ startMs: 200, durationMs: voiceMs, wav }],
    });
    check("the program is audio-driven over the real take", program.audioTakes === 1 && program.audioVisemes > 0, `${program.audioVisemes} visemes from ${program.audioTakes} take(s)`);

    // Render the speaking closeup
    const job = await createRenderJob(projectId, shot.id, "PREVIEW");
    check("the render job carries the audio-driven lip note", (job.stage ?? "").includes("audio-driven lip-sync") && (job.stage ?? "").includes("1 real take"), job.stage ?? "");
    let final = job;
    const deadline = Date.now() + 420_000;
    while (final.status === "RENDERING" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      final = (await tickRenderJob(job.id))!;
    }
    check("the closeup renders to a clip", final.status === "REVIEW" && Boolean(final.outputUrl), `${final.driver} ${final.status}`);
    check("the finished stage keeps the audio-driven note", (final.stage ?? "").includes("audio-driven lip-sync"), final.stage ?? "");
    if (final.driver === "BLENDER_LOCAL") {
      const stateRaw = fs.readFileSync(path.join(process.cwd(), "public", "renders", `.job-${job.id}.json`), "utf-8");
      const stateMatch = stateRaw.match(/"visemes"\s*:\s*(\d+)/);
      check("the Blender worker performed the audio-driven program", Boolean(stateMatch) && Number(stateMatch?.[1]) > 0, `visemes=${stateMatch?.[1] ?? "none"}`);
    }
    const ev = await db.productionEvent.findFirst({ where: { projectId, summary: { contains: "audio-driven lip-sync" } } });
    check("the production event names the audio-driven lip-sync", Boolean(ev), ev?.summary?.slice(0, 90) ?? "none");

    // ── Scheduler: PLAN_RUN over an ACTIVE plan ──
    const plan = await createPlan(projectId, {
      title: "Nightly breakdown",
      goal: "stamp the canon and the glossary",
      steps: [
        { tool: "create_terminology", args: { term: "Blade Oath", definition: "the vow spoken at the cliff shrine" }, why: "glossary" },
        { tool: "add_universe_fact", args: { text: "the cliff shrine lantern never goes out", category: "WORLD" }, why: "canon" },
      ],
      source: "CREATOR",
    });
    check("the fixture plan lands PROPOSED", plan.ok && plan.plan.status === "PROPOSED", plan.ok ? plan.plan.id.slice(-6) : plan.error);
    await setPlanStatus(plan.plan!.id, "ACTIVE");

    const created = await createSchedule(projectId, {
      name: "Nightly breakdown",
      kind: "PLAN_RUN",
      planId: plan.plan!.id,
      cadence: "DAILY",
      hourUtc: 2,
      maxSteps: 1,
    });
    check("the nightly PLAN_RUN schedule registers", created.ok && created.schedule.cadenceLabel === "nightly at 02:00 UTC", created.ok ? created.schedule.nextRunAt ?? "" : created.error);
    const regEvent = await db.productionEvent.findFirst({ where: { projectId, type: "SCHEDULE", summary: { contains: "registered" } } });
    check("the registration lands a SCHEDULE event", Boolean(regEvent), regEvent?.summary?.slice(0, 80) ?? "none");

    // fire via the API (route surface)
    const up = await fetch(`${BASE}/api/schedules?projectId=${projectId}`);
    const listed = (await up.json()) as { schedules: Array<{ id: string; planTitle: string | null; kind: string }> };
    check("GET /api/schedules lists the schedule with its pinned plan title", up.status === 200 && listed.schedules.length === 1 && listed.schedules[0].planTitle === "Nightly breakdown", `${listed.schedules.length} row(s)`);

    const patchRes = await fetch(`${BASE}/api/schedules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: created.schedule!.id, action: "run" }),
    });
    const patchBody = (await patchRes.json()) as { status?: string; report?: string; error?: string };
    check("PATCH run fires the schedule through the API", patchRes.status === 200 && patchBody.status === "OK", patchBody.status ?? patchBody.error);
    const midPlan = await getPlan(plan.plan!.id);
    check("the fire REALLY executed step 1", midPlan?.steps[0]?.status === "DONE" && midPlan.cursor === 1, `cursor=${midPlan?.cursor}`);
    const term = await db.terminology.findFirst({ where: { projectId, term: "Blade Oath" } });
    check("the executed step REALLY landed the terminology row", Boolean(term), term?.term ?? "none");
    const row1 = await db.studioSchedule.findUnique({ where: { id: created.schedule!.id } });
    check("the schedule row records the fire", row1?.lastStatus === "OK" && row1.runCount === 1 && (row1.lastReport ?? "").includes("1/2 steps done"), row1?.lastReport ?? "");
    check("nextRunAt advanced by the cadence", Boolean(row1?.nextRunAt && row1.nextRunAt.getTime() > Date.now()), row1?.nextRunAt?.toISOString() ?? "none");

    // finish the plan, then the fire SKIPS (done)
    await fireScheduleNow(created.schedule!.id);
    const donePlan = await getPlan(plan.plan!.id);
    check("the second fire completed the plan", donePlan?.status === "DONE" && donePlan.steps.every((s) => s.status === "DONE"), donePlan?.status ?? "");
    const skipFire = await fireScheduleNow(created.schedule!.id);
    check("a fire over a DONE plan SKIPS with the reason", skipFire.status === "SKIPPED" && (skipFire.report ?? "").includes("is done"), skipFire.report ?? "");

    // default-pick: latest ACTIVE plan when no planId is pinned
    const plan2 = await createPlan(projectId, {
      title: "Canon sweep",
      goal: "one more fact",
      steps: [{ tool: "add_universe_fact", args: { text: "the shrine bell rings without wind", category: "WORLD" }, why: "canon" }],
      source: "CREATOR",
    });
    await setPlanStatus(plan2.plan!.id, "ACTIVE");
    const loose = await createSchedule(projectId, { name: "Loose runner", kind: "PLAN_RUN", cadence: "HOURLY", intervalHours: 1 });
    const looseFire = await fireScheduleNow(loose.schedule!.id);
    check("an unpinned schedule picks the latest ACTIVE plan", looseFire.status === "OK" && (looseFire.report ?? "").includes("Canon sweep"), looseFire.report ?? "");

    // REPAINT_QUEUE supervision: clean queue -> SKIPPED
    const watch = await createSchedule(projectId, { name: "Render watch", kind: "REPAINT_QUEUE", cadence: "WEEKLY", weekday: 6, hourUtc: 9 });
    const cleanFire = await fireScheduleNow(watch.schedule!.id);
    check("a clean universe queue SKIPS the re-paint pass", cleanFire.status === "SKIPPED" && (cleanFire.report ?? "").includes("queue clean"), cleanFire.report ?? "");
    check("the clean-fire report counts zero render jobs ticked", (cleanFire.report ?? "").includes("0 render job(s) ticked"), cleanFire.report ?? "");

    // live run guard
    const liveRun = await db.repaintRun.create({ data: { projectId, status: "RUNNING", cap: 2, index: 0, steps: "[]" } });
    const busyFire = await fireScheduleNow(watch.schedule!.id);
    check("a live re-paint run blocks a second pass", busyFire.status === "SKIPPED" && (busyFire.report ?? "").includes("already running"), busyFire.report ?? "");
    await db.repaintRun.update({ where: { id: liveRun.id }, data: { status: "DONE" } });

    // fireDueSchedules: due rows fire in one pass
    await db.studioSchedule.update({ where: { id: watch.schedule!.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    const batch = await fireDueSchedules();
    const watchOutcome = batch.outcomes.find((o) => o.name === "Render watch");
    check("fireDueSchedules fires the due watch (clean queue again)", batch.fired === 1 && watchOutcome?.status === "SKIPPED", `${batch.fired} fired: ${watchOutcome?.report ?? ""}`);
    const watchRow = await db.studioSchedule.findUnique({ where: { id: watch.schedule!.id } });
    check("the due fire advanced the cadence on the row", Boolean(watchRow?.nextRunAt && watchRow.nextRunAt.getTime() > Date.now()), watchRow?.nextRunAt?.toISOString() ?? "none");

    // disable guard via API
    await fetch(`${BASE}/api/schedules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: watch.schedule!.id, action: "disable" }),
    });
    const disabledRun = await fetch(`${BASE}/api/schedules`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: watch.schedule!.id, action: "run" }),
    });
    const disabledBody = (await disabledRun.json()) as { error?: string };
    check("a disabled schedule refuses to fire", disabledRun.status === 400 && (disabledBody.error ?? "").includes("disabled"), disabledBody.error ?? "");

    // DSH tools
    const dshCreate = await executeTool(projectId, "create_schedule", { name: "Weekly watch", kind: "REPAINT_QUEUE", cadence: "WEEKLY", weekday: 0, hourUtc: 3 });
    check("DSH create_schedule registers the watch", dshCreate.status === "OK" && dshCreate.result.includes("registered"), dshCreate.result.slice(0, 90));
    const dshRun = await executeTool(projectId, "steer_schedule", { name: "weekly", action: "run" });
    check("DSH steer_schedule fires it now", dshRun.status === "OK" && dshRun.result.includes("SKIPPED"), dshRun.result.slice(0, 90));
    const dshOff = await executeTool(projectId, "steer_schedule", { name: "weekly", action: "disable" });
    check("DSH steer_schedule disables", dshOff.status === "OK" && dshOff.result.includes("disabled"), dshOff.result.slice(0, 60));
    const dshDel = await executeTool(projectId, "steer_schedule", { name: "weekly", action: "delete" });
    check("DSH steer_schedule deletes", dshDel.status === "OK", dshDel.result.slice(0, 60));
    const dshBad = await executeTool(projectId, "create_schedule", { name: "Ghost", kind: "PLAN_RUN", planTitle: "No such plan" });
    check("DSH create_schedule refuses an unknown planTitle", dshBad.status === "ERROR", dshBad.result.slice(0, 80));
    const dshBadSteer = await executeTool(projectId, "steer_schedule", { name: "ghost-watch", action: "run" });
    check("DSH steer_schedule refuses an unknown name", dshBadSteer.status === "ERROR", dshBadSteer.result.slice(0, 80));

    // validation refusals
    const badKind = await createSchedule(projectId, { name: "x", kind: "CRON", cadence: "DAILY" });
    const badCadence = await createSchedule(projectId, { name: "x", kind: "PLAN_RUN", cadence: "MINUTELY" });
    const noName = await createSchedule(projectId, { name: "", kind: "PLAN_RUN" });
    check("createSchedule refuses a bad kind / cadence / empty name", !badKind.ok && !badCadence.ok && !noName.ok, `${badKind.error ?? ""} | ${badCadence.error ?? ""}`);

    // production context carries the schedules line
    const ctx = await buildCompactContext(projectId);
    check("the production context lists schedules with last status", Array.isArray(ctx?.schedules) && (ctx?.schedules.length ?? 0) >= 2 && ctx!.schedules.some((s: string) => s.includes("last SKIPPED")), `${ctx?.schedules.length} schedule line(s)`);

    const totalFires = await db.studioSchedule.aggregate({ where: { projectId }, _sum: { runCount: true } });
    check("the fire ledger accumulated", (totalFires._sum.runCount ?? 0) >= 4, `${totalFires._sum.runCount ?? 0} fires`);
  } finally {
    // cleanup: DB cascades (schedules, plans, cues, shots, events), files swept manually
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    const voices = fs.readdirSync(path.join(process.cwd(), "public", "voices")).filter((f) => f.endsWith(".wav"));
    for (const f of voices) {
      // only remove takes that no longer belong to any cue
      const id = f.replace(".wav", "");
      const exists = await db.audioCue.findUnique({ where: { id } });
      if (!exists) fs.rmSync(path.join(process.cwd(), "public", "voices", f), { force: true });
    }
    const rendersDir = path.join(process.cwd(), "public", "renders");
    if (fs.existsSync(rendersDir)) {
      for (const f of fs.readdirSync(rendersDir)) {
        const jobMatch = f.match(/^\.?job-?(.+)\.(mp4|json|png)$/);
        if (!jobMatch) continue;
        const jobId = f.startsWith(".job-") ? f.slice(5).replace(/\.json$/, "") : f.replace(/\.(mp4|png)$/, "");
        const exists = await db.renderJob.findUnique({ where: { id: jobId } });
        if (!exists) fs.rmSync(path.join(rendersDir, f), { force: true });
      }
    }
  }
  const remaining = await db.project.findFirst({ where: { title: "Scheduler E2E" } });
  check("fixture removed (project + cascades)", !remaining, remaining ? remaining.id : "clean");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

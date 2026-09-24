// E2E: fact-level drift curves, digest delivery beyond the studio
// (webhook + email slot), and the neural viseme pass.
// Steps:
//   plan - pure checks: the neural plan parser (clamps, unknown
//          visemes, garbage refusal), plan->visemes spreading with
//          the shape table (round UW, closed M_B_P), the audio
//          conform (openness from audio, identity from plan), the
//          fact-drift rollup (grouping, episode ordering, skip
//          rules, trend bands, hold rate, steepest-first), the
//          registry args for delivery targets, doctrine rule 20/22/
//          23 + the intro's NEURAL VISEME PASS, routes + UI + schema
//          on disk.
//   tool - live pipeline: fixture project across TWO episodes with a
//          speaking closeup (REAL synthesized WAV take on disk) and
//          the vision+chat SDK mocked in-process, the neural pass
//          REALLY building the program (plan-conformed audio visemes
//          + the honest lipNote on a real render job + the no-take
//          neural text performance), fact verdicts through the REAL
//          pipeline building a DECLINING fact curve over episodes +
//          canonHealthData.drift + the canon-health API + pulse +
//          context, a REAL local webhook receiver (Bun.serve) that
//          the DAILY_DIGEST fire REALLY POSTs the digest JSON to,
//          the honest no-SMTP email outcome, the set_delivery API
//          round trip, and the delivery validation refusals.
import { mock } from "bun:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { buildCompactContext } from "@/lib/dsh/tools";
import {
  parseNeuralPlan, planVisemesFromPlan, conformVisemesToPlan, planPromptForLines,
  neuralSpeechProgram, describeNeuralSpeechProgram, NEURAL_VISEME_SHAPES,
} from "@/lib/animation/viseme-neural";
import {
  factDriftFromEvents, factDriftData, canonHealthData, FACT_DRIFT_TREND_THRESHOLD,
} from "@/lib/canon-health";
import { buildDigestFromEvents, deliverDigest, postDailyDigest, listDigests } from "@/lib/digest";
import { createSchedule, fireScheduleNow } from "@/lib/scheduler";
import { createRenderJob } from "@/lib/engine/render";
import { studioPulse } from "@/lib/studio-pulse";
import { buildSystemPrompt } from "@/lib/dsh/prompts";
import { PrismaClient } from "@prisma/client";

// ── in-process SDK mock: chat.completions.create answers the neural
//    plan; chat.completions.createVision answers fact verdicts (the
//    same seam as iters 34/35/36; the live loops were proven there). ──
const NEURAL_PLAN_RAW = JSON.stringify({
  lines: [
    { units: [
      { ph: "DH", v: "TH", w: 0.6 }, { ph: "AH", v: "AH", w: 1.3 }, { ph: "B", v: "M_B_P", w: 0.6 },
      { ph: "R", v: "AH", w: 0.9 }, { ph: "IY", v: "IY", w: 1.3 }, { ph: "Z", v: "S_SH", w: 0.8 },
      { ph: "T", v: "M_B_P", w: 0.5 }, { ph: "UW", v: "UW", w: 1.3 },
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

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── 1. the neural plan parser ──
  const parsed = parseNeuralPlan(NEURAL_PLAN_RAW, 1);
  check("a valid plan parses with one unit list per line", Boolean(parsed && parsed.lines.length === 1 && parsed.lines[0].length === 8), parsed ? `units=${parsed.lines[0].length}` : "null");
  check("the plan carries the vocabulary's viseme names", parsed?.lines[0].some((u) => u.v === "M_B_P") && parsed?.lines[0].some((u) => u.v === "UW"), parsed?.lines[0].map((u) => u.v).join(","));
  const clamped = parseNeuralPlan(JSON.stringify({ lines: [{ units: [{ ph: "X", v: "AH", w: 9 }, { ph: "Y", v: "AH", w: 0.01 }] }] }), 1);
  check("weights clamp into 0.2..3", clamped?.lines[0][0].w === 3 && clamped?.lines[0][1].w === 0.2, clamped?.lines[0].map((u) => u.w).join("/"));
  const unknown = parseNeuralPlan(JSON.stringify({ lines: [{ units: [{ ph: "X", v: "NOT_A_VISEME", w: 1 }] }] }), 1);
  check("unknown viseme names fall back to AH", unknown?.lines[0][0].v === "AH", unknown?.lines[0][0].v);
  check("garbage JSON refuses to null", parseNeuralPlan("the model rambled instead", 1) === null && parseNeuralPlan('{"lines":[]}', 1) === null && parseNeuralPlan('{"lines":[{"units":[]}]}', 1) === null, "nulls");

  // ── 2. plan -> visemes + audio conform ──
  const span = { startMs: 500, endMs: 2500 };
  const planned = planVisemesFromPlan(parsed!.lines[0], span);
  check("plan units spread monotonic across the span", planned.length === 8 && planned[0].s === 500 && planned[planned.length - 1].e === 2500 && planned.every((v, i) => i === 0 || v.s >= planned[i - 1].e), `${planned.length} segments`);
  check("the shape table drives w/r (UW round, M_B_P shut)", (planned.find((v) => v.r === 1)?.e ?? 0) > 500 && planned.find((v) => v.o === 0.04) !== undefined, "UW round + stop closed");
  check("NEURAL_VISEME_SHAPES keeps the axes 0..1", Object.values(NEURAL_VISEME_SHAPES).every((s) => s.o >= 0 && s.o <= 1 && s.w >= 0 && s.w <= 1 && s.r >= 0 && s.r <= 1), "table");
  const audio: import("@/lib/animation/lipsync").Viseme[] = [
    { s: 600, e: 1000, o: 0.9, w: 0.18, r: 0.12 },
    { s: 1000, e: 1500, o: 0.2, w: 0.18, r: 0.12 },
  ];
  const conformed = conformVisemesToPlan(audio, planned);
  check("the conform keeps the AUDIO openness", conformed[0].o === 0.9 && conformed[1].o === 0.2, `${conformed[0].o}/${conformed[1].o}`);
  check("the conform adopts the PLAN identity (w/r)", conformed[0].w === 0.3 && conformed[1].r !== 0.12 || conformed[0].w !== 0.18, `${conformed[0].w}/${conformed[0].r}`);
  check("an empty plan leaves the audio untouched", conformVisemesToPlan(audio, []).length === 2, "unchanged");
  check("the prompt carries the lines verbatim", planPromptForLines(["Stand back."]).includes("Line 1: Stand back."), "prompt");

  // ── 3. the fact-drift rollup ──
  check("the fact trend band matches the character band", FACT_DRIFT_TREND_THRESHOLD === 0.05, String(FACT_DRIFT_TREND_THRESHOLD));
  const facts = [
    { id: "f1", text: "the antagonist never removes his mask", category: "RULE", active: true },
    { id: "f2", text: "two moons hang over the arena", category: "WORLD", active: true },
  ];
  const ev = (fact: string, kind: string, conf: number, episode: number | null, daysAgo: number) => ({
    entityName: fact.slice(0, 90),
    kind,
    description: `[universe shotX] (E1 Sc1 S001) confidence ${conf.toFixed(2)} - note`,
    episodeNumber: episode,
    createdAt: new Date(Date.now() - daysAgo * 3600 * 1000),
  });
  const curves = factDriftFromEvents(facts, [
    ev(facts[0].text, "FACT_HELD", 0.9, 1, 40),
    ev(facts[0].text, "FACT_HELD", 0.7, 2, 20),
    ev(facts[0].text, "FACT_BROKEN", 0.55, 3, 5),
    ev(facts[1].text, "FACT_HELD", 0.82, 1, 30),
    ev(facts[1].text, "FACT_HELD", 0.8, 2, 10),
    ev(facts[0].text, "FACT_HELD", 0.5, null, 3), // no episode position: skipped
    ev(facts[0].text, "FACT_HELD", 0.77, 4, 2), // unparsable? confidence present, kept
  ]);
  const mask = curves.find((c) => c.factId === "f1");
  const moons = curves.find((c) => c.factId === "f2");
  check("curves group per fact with episode-ordered points", Boolean(mask && moons && mask.points.length === 4 && moons.points.length === 2), `${mask?.points.length}/${moons?.points.length}`);
  check("points without an episode position are skipped", mask!.points.every((p) => p.episode >= 1), "positions");
  check("the mask fact DECLINES 13 points across episodes", mask!.trend === "DECLINING" && Math.abs(mask!.delta! + 0.13) < 0.001, `${mask!.trend} ${mask!.delta?.toFixed(2)}`);
  check("the moons fact is STABLE inside the band", moons!.trend === "STABLE" && Math.abs(moons!.delta! + 0.02) < 0.001, `${moons!.trend}`);
  check("the curve carries the hold rate over its points", Math.abs(mask!.holdRate - 0.75) < 0.001, String(mask!.holdRate));
  check("curves sort steepest decline first", curves[0].factId === "f1", curves.map((c) => c.factId).join(","));
  const single = factDriftFromEvents(facts, [ev(facts[0].text, "FACT_HELD", 0.9, 1, 3)]);
  check("a single point reads FLAT", single[0].trend === "FLAT" && single[0].delta === null, "flat");

  // ── 4. delivery plumbing (pure sides) ──
  const noTargets = await deliverDigest(buildDigestFromEvents({
    projectTitle: "T", windowHours: 24, now: new Date(), events: [],
    canonHeadline: null, driftHeadline: null, queueCounts: { active: 0, rerender: 0 },
  }), "T", {});
  check("no targets means no delivery attempts", noTargets.length === 0, "empty");
  const badEmail = await deliverDigest({
    headline: "h", lines: ["l"], windowHours: 24, events: 0,
  }, "T", { email: "not-an-email" });
  check("an invalid email is refused honestly", badEmail.length === 1 && !badEmail[0].ok && badEmail[0].detail.includes("not a valid email"), badEmail[0]?.detail);

  // ── 5. registry + doctrine + files on disk ──
  check("create_schedule advertises the delivery targets", TOOL_DEFS.find((t) => t.name === "create_schedule")!.args.webhookUrl?.includes("DAILY_DIGEST"), "args");
  const doctrine = buildSystemPrompt("CTX", "DOCS");
  check("doctrine rule 20 teaches delivery beyond the studio", doctrine.includes("deliver it BEYOND the studio") && doctrine.includes("ANIMEOS_SMTP_URL"), "rule 20");
  check("doctrine rule 22 teaches the fact-drift trend", doctrine.includes("factDrift line adds the trend dimension for FACTS"), "rule 22");
  check("the intro teaches the NEURAL VISEME PASS", doctrine.includes("NEURAL VISEME PASS") && doctrine.includes("conforms them onto the audio envelope"), "intro");

  const neuralFile = fs.readFileSync("src/lib/animation/viseme-neural.ts", "utf8");
  check("the neural module owns plan + conform", neuralFile.includes("neuralPhonemePlan") && neuralFile.includes("conformVisemesToPlan") && neuralFile.includes("AUDIO CONFORM"), "lib");
  const renderFile = fs.readFileSync("src/lib/engine/render.ts", "utf8");
  check("the render pipeline calls the neural program", renderFile.includes("neuralSpeechProgram") && renderFile.includes("degrades internally"), "engine");
  const digestFile = fs.readFileSync("src/lib/digest.ts", "utf8");
  check("the digest module owns webhook + email delivery", digestFile.includes("deliverDigest") && digestFile.includes("nodemailer") && digestFile.includes("ANIMEOS_SMTP_URL"), "lib");
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  check("the schedule row carries the delivery columns", schema.includes("webhookUrl") && schema.includes("digestEmail"), "schema");
  const dshView = fs.readFileSync("src/components/views/dsh-console.tsx", "utf8");
  check("the digest panel carries the delivery editor", dshView.includes("Delivery beyond the studio") && dshView.includes("Save delivery"), "ui");
  const contView = fs.readFileSync("src/components/views/continuity-view.tsx", "utf8");
  check("the canon panel carries the fact drift curves", contView.includes("Fact drift curves") && contView.includes("confidence over episode order"), "ui");
  const schedRoute = fs.readFileSync("src/app/api/schedules/route.ts", "utf8");
  check("PATCH /api/schedules steers delivery targets", schedRoute.includes("set_delivery"), "route");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  // a REAL local webhook receiver the digest fire can POST to
  const received: Array<{ path: string; body: Record<string, unknown> }> = [];
  const server = Bun.serve({
    port: 8765,
    fetch: async (req) => {
      const body = (await req.json()) as Record<string, unknown>;
      received.push({ path: new URL(req.url).pathname, body });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  const proj = await db.project.create({
    data: {
      title: "Iter37 E2E",
      logline: "fact drift + digest delivery + neural visemes",
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
                      { number: 1, description: "Lin Yue tends the fire, maskless intruder gone", shotType: "WIDE", movement: "STATIC", duration: 3 },
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

  // the audited shots need real panel art on disk (the vision check
  // refuses art-less shots, per the honest pipeline)
  async function ensurePanelArt(shot: { id: string }, filter: string) {
    const disk = path.join(process.cwd(), "public", "panels", `${shot.id}.png`);
    synthPng(disk, filter);
    const nowT = new Date();
    await db.shot.update({ where: { id: shot.id }, data: { artworkUrl: `/panels/${shot.id}.png?v=${nowT.getTime()}`, artGeneratedAt: nowT } });
    createdFiles.push(disk);
  }

  try {
    // ── 1. the neural viseme pass REALLY builds the program ──
    await db.shot.update({
      where: { id: shotSpeak.id },
      data: { dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The breathes till two", kind: "SPEECH" }]) },
    });
    // a REAL synthesized take on disk (2s sine at 24kHz mono PCM16)
    const voiceDir = path.join(process.cwd(), "public", "voices");
    fs.mkdirSync(voiceDir, { recursive: true });
    const wavPath = path.join(voiceDir, "e37-take.wav");
    execSync(`ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=210:duration=2" -ar 24000 -ac 1 -c:a pcm_s16le "${wavPath}"`);
    createdFiles.push(wavPath);
    const cue = await db.audioCue.create({
      data: { shotId: shotSpeak.id, kind: "VOICE", label: "Lin Yue line 1", startMs: 300, durationMs: 2200, voiceUrl: `/voices/e37-take.wav?v=${Date.now()}`, voiceDurationMs: 2000 },
    });

    const program = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [{ startMs: 300, durationMs: 2000, wav: fs.readFileSync(wavPath) }],
    });
    check("the neural plan arrives through the real LLM seam", program.planOk, `planOk=${program.planOk}`);
    check("the audio span performs with plan-conformed shapes", program.audioTakes === 1 && program.neuralSpans === 1 && program.audioVisemes > 0, `audio=${program.audioVisemes} spans=${program.neuralSpans}`);
    // identity from the plan: every (w,r) pair is an exact shape-table entry;
    // openness stays audio-owned (differs from that entry's o on the voiced take)
    const tablePairs = Object.values(NEURAL_VISEME_SHAPES).map((s) => `${s.w.toFixed(2)}:${s.r.toFixed(2)}`);
    const identityFromPlan = program.visemes.every((v) => tablePairs.includes(`${v.w.toFixed(2)}:${v.r.toFixed(2)}`));
    const audioOwnedOpenness = program.visemes.some((v) => {
      const entry = Object.values(NEURAL_VISEME_SHAPES).find((s) => s.w === v.w && s.r === v.r);
      return entry ? Math.abs(entry.o - v.o) > 0.01 : false;
    });
    check("the conform keeps the AUDIO openness", audioOwnedOpenness, `audio-owned=${audioOwnedOpenness}`);
    check("the conform adopts the PLAN identity (w/r from the shape table)", identityFromPlan, identityFromPlan ? "all pairs from table" : program.visemes.map((v) => `${v.w}:${v.r}`).join(","));
    check("the note names the neural pass", (describeNeuralSpeechProgram(program) ?? "").includes("neural phoneme shaping"), describeNeuralSpeechProgram(program) ?? "");

    const noTake = await neuralSpeechProgram({
      dialogue: JSON.stringify([{ speaker: "Lin Yue", text: "The breathes till two", kind: "SPEECH" }]),
      shotDurationMs: 4000,
      takes: [],
    });
    check("without a take the plan performs the line itself", noTake.planOk && noTake.neuralTextSpans === 1 && noTake.audioTakes === 0, `text=${noTake.neuralTextSpans}`);

    // the REAL render job carries the neural lipNote
    const job = await createRenderJob(projectId, shotSpeak.id, "PREVIEW");
    const jobRow = await db.renderJob.findUnique({ where: { id: job.id } });
    check("a real speaking-closeup render carries the neural lipNote", Boolean(jobRow?.lipNote?.includes("neural phoneme")), jobRow?.lipNote ?? "none");
    await db.renderJob.delete({ where: { id: job.id } }).catch(() => {});
    await db.audioCue.delete({ where: { id: cue.id } }).catch(() => {});

    // ── 2. fact drift curves through the REAL verdict pipeline ──
    await ensurePanelArt(shotSpeak, "gradients=s=1152x864:c0=0x22304e:c1=0x111a30");
    await ensurePanelArt(shotMoons, "gradients=s=1152x864:c0=0x1d2942:c1=0x0e1626");
    await ensurePanelArt(shotEp2, "gradients=s=1152x864:c0=0x501c2e:c1=0x2a0e18");
    await executeTool(projectId, "add_universe_fact", { text: "the antagonist never removes his mask", category: "RULE" });
    await executeTool(projectId, "add_universe_fact", { text: "two moons hang over the arena", category: "WORLD" });
    const facts = await db.universeFact.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    const [maskFact, moonsFact] = facts;
    // E1: the mask holds at 0.9 and the moons hold at 0.82; E2: the mask
    // verdict loses faith (0.55 BROKEN) while the moons stay steady. Each
    // vision call judges ALL active facts (the pipeline maps by fact id).
    const bothFacts = (maskHolds: boolean, maskConf: number, moonsHolds: boolean, moonsConf: number) => JSON.stringify({
      summary: "per-shot verdict set",
      verdicts: [
        { id: maskFact.id, holds: maskHolds, confidence: maskConf, note: maskHolds ? "mask on" : "the mask is off" },
        { id: moonsFact.id, holds: moonsHolds, confidence: moonsConf, note: "two moons" },
      ],
    });
    visionQueue = [bothFacts(true, 0.9, true, 0.82), bothFacts(false, 0.55, true, 0.8)];
    const c1 = await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 1 });
    check("the episode-1 audit lands through the real pipeline", c1.status === "OK" && c1.result.includes("HELD"), c1.result.split("\n")[0]?.slice(0, 80) ?? "");
    const c2 = await executeTool(projectId, "check_universe_facts", { sceneNumber: 2, shotNumber: 1 });
    check("the episode-2 audit lands (different scene, different panel)", c2.status === "OK" && c2.result.includes("BROKEN"), c2.result.split("\n")[0]?.slice(0, 80) ?? "");

    const drift = await factDriftData(projectId);
    const maskCurve = drift.curves.find((c) => c.text.startsWith("the antagonist"));
    check("the live fact curve builds over the two episodes", Boolean(maskCurve && maskCurve.points.length === 2), maskCurve ? `${maskCurve.points.map((p) => `E${p.episode}:${p.confidence.toFixed(2)}`).join(" ")}` : "missing");
    check("the mask curve DECLINES across episode order", maskCurve?.trend === "DECLINING" && Math.abs(maskCurve.delta! + 0.35) < 0.001, `${maskCurve?.trend} ${maskCurve?.delta?.toFixed(2)}`);
    check("the watch names the declining fact", drift.watch.length === 1 && drift.watch[0].text.startsWith("the antagonist"), drift.headline);

    const canon = await canonHealthData(projectId);
    check("canonHealthData carries the drift section", canon.drift.watch.length === 1, canon.drift.headline.slice(0, 110));
    const canonApi = await fetch(`http://127.0.0.1:3000/api/canon-health?projectId=${projectId}`);
    const canonApiBody = (await canonApi.json()) as { drift?: { watch?: unknown[] } };
    check("GET /api/canon-health serves the fact curves over HTTP", canonApi.status === 200 && (canonApiBody.drift?.watch?.length ?? 0) === 1, `${canonApi.status}`);

    const pulse = await studioPulse(projectId);
    check("the pulse names the declining fact curve", pulse.status === undefined && pulse.lines.some((l) => l.includes("FACT DRIFT") && l.includes("the antagonist")), pulse.lines.find((l) => l.startsWith("Fact drift"))?.slice(0, 110));
    const ctx = await buildCompactContext(projectId) as unknown as { factDrift?: string };
    check("the context carries the fact-drift headline", Boolean(ctx.factDrift) && ctx.factDrift!.includes("DECLINING"), ctx.factDrift?.slice(0, 100));

    // ── 3. digest delivery beyond the studio ──
    const badSched = await createSchedule(projectId, { name: "Bad digest", kind: "DAILY_DIGEST", webhookUrl: "not-a-url" });
    check("a bogus webhook URL is refused at registration", !badSched.ok && badSched.error!.includes("http(s)"), badSched.error ?? "");
    const badMail = await createSchedule(projectId, { name: "Bad digest 2", kind: "DAILY_DIGEST", digestEmail: "nope" });
    check("a bogus email is refused at registration", !badMail.ok && badMail.error!.includes("email"), badMail.error ?? "");

    const sched = await createSchedule(projectId, {
      name: "Nightly digest",
      kind: "DAILY_DIGEST",
      cadence: "DAILY",
      hourUtc: 2,
      webhookUrl: "http://127.0.0.1:8765/animeos-digest",
      digestEmail: "creator@example.com",
    });
    check("the digest schedule registers with both targets", sched.ok && sched.schedule.webhookUrl?.includes("8765") && sched.schedule.digestEmail === "creator@example.com", sched.ok ? "webhook+email" : sched.error ?? "");
    const fire = await fireScheduleNow(sched.schedule!.id);
    check("the fire posts the digest to the LOCAL webhook", fire.ok && received.length === 1 && received[0].path === "/animeos-digest", fire.report ?? fire.error ?? "");
    check("the webhook body carries the digest JSON", Boolean(received[0]?.body.headline && Array.isArray(received[0]?.body.lines) && received[0]?.body.project === "Iter37 E2E"), JSON.stringify(Object.keys(received[0]?.body ?? {})));
    check("the report names the delivery outcomes", Boolean(fire.report?.includes("delivered: webhook OK")) && Boolean(fire.report?.includes("email FAILED")), fire.report?.split("delivered:")[1]?.slice(0, 90));
    const digests = await listDigests(projectId);
    check("the digest event records the delivery outcomes", digests[0].deliveries.length === 2 && digests[0].deliveries.find((d) => d.kind === "webhook")?.ok === true && digests[0].deliveries.find((d) => d.kind === "email")?.ok === false, digests[0].deliveries.map((d) => `${d.kind}:${d.ok}`).join(","));

    // steerable targets: clear the webhook over HTTP, fire again -> no webhook POST
    const patch = await fetch("http://127.0.0.1:3000/api/schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: sched.schedule!.id, action: "set_delivery", webhookUrl: "" }),
    });
    check("PATCH set_delivery clears the webhook over HTTP", patch.status === 200, String(patch.status));
    const before = received.length;
    await fireScheduleNow(sched.schedule!.id);
    check("the next fire skips the cleared webhook", received.length === before, `posts=${received.length}`);
    const patchNonDigest = await fetch("http://127.0.0.1:3000/api/schedules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: sched.schedule!.id, action: "set_delivery", webhookUrl: "http://127.0.0.1:9/x", digestEmail: "x@y.zz" }),
    });
    check("set_delivery saves targets again", patchNonDigest.status === 200, String(patchNonDigest.status));
  } finally {
    server.stop(true);
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of [...new Set(createdFiles)]) {
      try { fs.rmSync(f, { force: true }); } catch { /* already gone */ }
    }
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

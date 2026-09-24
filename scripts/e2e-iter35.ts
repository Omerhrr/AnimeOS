// E2E: canon-health readout over fact verdict history, schedule-health
// digest, embedding-based identity distance (the provider-free
// affinity tripwire) + the studio_pulse readout.
// Steps:
//   plan - pure checks: the canon-health rollup (event matching,
//          status split, score math incl. the unchecked-canon
//          penalty, bands, worst-fact ranking), the schedule-health
//          digest (window counts, error streaks, overdue, headline,
//          old-event exclusion), the embedding math (palette
//          histogram, dHash bits, cosine + hamming, affinity, hex
//          roundtrip, REAL sharp decode of a synthesized PNG), the
//          45-tool registry, doctrine rule 22 + intro, routes + UI
//          on disk.
//   tool - live pipeline: fixture project with a sheeted cast, REAL
//          fact verdict events through checkShotUniverseFacts (the
//          vision SDK module mocked in-process, as in iter 34; the
//          live vision loop was proven in iters 29/30), canon health
//          over the REAL history, REAL schedule fires (SKIPPED +
//          ERROR through the pinned-plan-deleted path) with the
//          digest over the real events, the provider-free affinity
//          pass through sharp on REAL panel/sheet PNGs (no mock, no
//          provider - local math only), the identity + API surfaces,
//          DSH studio_pulse + the affinity rider on
//          score_panel_identity, and the context lines.
import { mock } from "bun:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { buildCompactContext } from "@/lib/dsh/tools";
import {
  factHealthFromEvents, canonScoreFromRows, canonBand, canonHealthData,
} from "@/lib/canon-health";
import {
  scheduleHealthFromEvents, scheduleHealthData, SCHEDULE_HEALTH_WINDOW_DAYS,
} from "@/lib/schedule-health";
import {
  l2Normalize, paletteHistogramFromPixels, structureHashFromGray,
  cosineSimilarity, structureSimilarity, affinityBetween, hashToHex, hexToHash,
  embedImageFile,
} from "@/lib/embedding";
import {
  scoreShotIdentity, scoreShotEmbedding, scoreProjectEmbeddings,
  identityPanelData, IDENTITY_REPAINT_THRESHOLD, AFFINITY_WATCH_THRESHOLD,
} from "@/lib/identity";
import { createSchedule, fireScheduleNow } from "@/lib/scheduler";
import { buildSystemPrompt } from "@/lib/dsh/prompts";
import { PrismaClient } from "@prisma/client";

// ── in-process vision SDK mock ──
// Same seam as iter 34: the pipeline around the vision call runs FOR
// REAL, only the SDK's HTTP layer is replaced. The queue feeds one
// raw body per expected call (fact verdicts and identity verdicts
// take turns).
const visionState = { queue: [] as string[], lastPrompt: "" };
mock.module("z-ai-web-dev-sdk", () => ({
  default: {
    create: async () => ({
      chat: {
        completions: {
          createVision: async (call: { messages: Array<{ content: Array<{ type: string; text?: string }> }> }) => {
            visionState.lastPrompt = call.messages?.[0]?.content?.find((c) => c.type === "text")?.text ?? "";
            return { choices: [{ message: { content: visionState.queue.shift() ?? "" } }] };
          },
        },
      },
    }),
  },
}));

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

const FACT_VERDICTS_CALL1 = (f1: string, f2: string, f3: string) => JSON.stringify({
  summary: "two moons hold, the mask fact is violated on this panel",
  verdicts: [
    { id: f1, holds: true, confidence: 0.9, note: "both moons visible" },
    { id: f2, holds: false, confidence: 0.85, note: "the mask is off" },
    { id: f3, holds: true, confidence: 0.4, note: "glow faint but present" },
  ],
});
const FACT_VERDICTS_CALL2 = (f1: string, f2: string, f3: string) => JSON.stringify({
  summary: "clean panel",
  verdicts: [
    { id: f1, holds: true, confidence: 0.8, note: "moons clear" },
    { id: f2, holds: true, confidence: 0.7, note: "mask on" },
    { id: f3, holds: true, confidence: 0.3, note: "barely visible" },
  ],
});
const RAW_LIN_VERIFIED = JSON.stringify({
  note: "the panel reads close to the canonical sheet",
  characters: [{ name: "Lin Yue", similarity: 0.83, aspects: { face: 0.9, hair: 0.85 }, note: "hair matches" }],
});

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── canon health rollup ──
  const facts = [
    { id: "f1", text: "two moons hang over the arena", category: "WORLD", active: true },
    { id: "f2", text: "the antagonist never removes his mask", category: "RULE", active: true },
    { id: "f3", text: "her blade glows cyan when energy channels", category: "PROP", active: true },
    { id: "f4", text: "the terrace lanterns burn blue at night", category: "LOCATION", active: true },
    { id: "f5", text: "retired: the sword sings at dawn", category: "WORLD", active: false },
  ];
  const mk = (name: string, kind: string, conf: string, note: string, daysAgo: number) => ({
    entityName: name,
    kind,
    description: `[universe shotX] (E1 Sc1 S001) confidence ${conf} - ${note}`,
    createdAt: new Date(Date.now() - daysAgo * 24 * 3600 * 1000),
  });
  const events = [
    mk("two moons hang over the arena", "FACT_HELD", "0.90", "both moons visible", 1),
    mk("the antagonist never removes his mask", "FACT_BROKEN", "0.85", "the mask is off", 1),
    mk("her blade glows cyan when energy channels", "FACT_HELD", "0.40", "faint glow", 2),
    mk("two moons hang over the arena", "FACT_HELD", "0.80", "moons clear", 3),
    mk("the antagonist never removes his mask", "FACT_HELD", "0.70", "mask on", 3),
    mk("retired: the sword sings at dawn", "FACT_BROKEN", "0.99", "inactive fact still judged", 1),
  ];
  const rows = factHealthFromEvents(facts, events);
  check("factHealthFromEvents splits held/broken per fact", rows[0].status === "HELD" && rows[0].held === 2 && rows[0].broken === 0 && rows[1].status === "VIOLATED" && rows[1].held === 1 && rows[1].broken === 1, rows.map((r) => `${r.factId}:${r.status}`).join(","));
  check("the worst confident violation is recorded", rows[1].worstBrokenConfidence === 0.85, String(rows[1].worstBrokenConfidence));
  check("an unchecked active fact is UNVERIFIED", rows[3].status === "UNVERIFIED" && rows[3].checkedPanels === 0, rows[3].status);
  check("verdict events for inactive facts are still counted on the fact row (active flag filters the score, not the history)", rows[4].checkedPanels === 1, rows[4].status);
  check("the newest verdict wins for lastNote/lastConfidence", rows[0].lastNote === "both moons visible" && rows[0].lastConfidence === 0.9, rows[0].lastNote);

  const { score, coverage, holdRate } = canonScoreFromRows(rows);
  check("canon score = 0.4 coverage + 0.6 hold rate over ACTIVE facts only", Math.abs(score! - (0.4 * 0.75 + 0.6 * (4 / 5))) < 0.001 && Math.abs(holdRate! - 0.8) < 0.001, `score=${score?.toFixed(3)} coverage=${coverage} holdRate=${holdRate?.toFixed(3)}`);
  check("canonBand splits at 0.85 and 0.55", canonBand(0.9) === "HEALTHY" && canonBand(0.8) === "WATCH" && canonBand(0.3) === "DRIFTING", "bands");
  const empty = canonScoreFromRows(factHealthFromEvents([], []));
  check("an empty canon scores null (nothing registered)", empty.score === null && empty.coverage === null, "empty");
  const allHeld = canonScoreFromRows([
    { factId: "a", text: "a", category: "WORLD", active: true, status: "HELD", checkedPanels: 2, held: 2, broken: 0, worstBrokenConfidence: null, lastCheckedAt: null, lastConfidence: null, lastNote: "" },
    { factId: "b", text: "b", category: "WORLD", active: true, status: "HELD", checkedPanels: 2, held: 2, broken: 0, worstBrokenConfidence: null, lastCheckedAt: null, lastConfidence: null, lastNote: "" },
  ]);
  check("a fully audited holding canon scores 1.0 HEALTHY", allHeld.score === 1 && canonBand(allHeld.score) === "HEALTHY", `score=${allHeld.score}`);

  // ── schedule health digest ──
  const now = new Date();
  const schedRows = [
    { id: "s1", name: "nightly breakdown", kind: "PLAN_RUN", enabled: true, cadence: "DAILY", intervalHours: 1, hourUtc: 2, weekday: 1, lastStatus: "OK", lastReport: "plan 'Break' 2/2 steps done", runCount: 3, nextRunAt: new Date(now.getTime() + 3600 * 1000) },
    { id: "s2", name: "render watch", kind: "REPAINT_QUEUE", enabled: true, cadence: "HOURLY", intervalHours: 6, hourUtc: 2, weekday: 1, lastStatus: "ERROR", lastReport: "the pinned plan no longer exists", runCount: 5, nextRunAt: new Date(now.getTime() + 60 * 1000) },
    { id: "s3", name: "overdue ghost", kind: "PLAN_RUN", enabled: true, cadence: "WEEKLY", intervalHours: 1, hourUtc: 2, weekday: 1, lastStatus: null, lastReport: null, runCount: 0, nextRunAt: new Date(now.getTime() - 2 * 3600 * 1000) },
  ] as Parameters<typeof scheduleHealthFromEvents>[0];
  const mkEv = (sid: string, status: string, daysAgo: number) => ({
    payload: JSON.stringify({ scheduleId: sid, kind: "PLAN_RUN", status, report: `${status} report` }),
    createdAt: new Date(now.getTime() - daysAgo * 24 * 3600 * 1000),
  });
  const schedEvents = [
    mkEv("s1", "OK", 0.2), mkEv("s1", "OK", 1.2),
    mkEv("s2", "ERROR", 0.1), mkEv("s2", "ERROR", 0.3),
    mkEv("s2", "OK", 20), // outside the 14d window: must be excluded
  ];
  const digest = scheduleHealthFromEvents(schedRows, schedEvents, now);
  check("the digest counts window outcomes per schedule", digest.rows[0].window.ok === 2 && digest.rows[1].window.error === 2 && digest.rows[1].window.ok === 0, digest.rows.map((r) => `${r.name}:${r.window.ok}/${r.window.skipped}/${r.window.error}`).join(" | "));
  check("events outside the window are excluded", digest.rows[1].window.fires === 2, `fires=${digest.rows[1].window.fires}`);
  check("consecutive error streaks walk from the newest fire", digest.rows[1].errorStreak === 2, String(digest.rows[1].errorStreak));
  check("an armed schedule with a past nextRunAt is OVERDUE", digest.rows[2].overdue && digest.overdue === 1, `overdue=${digest.overdue}`);
  check("erroring schedules surface in the digest", digest.erroring === 1 && digest.rows[1].headline.includes("errors in a row"), digest.rows[1].headline);
  check("the aggregate window sums every schedule", digest.window.fires === 4 && digest.window.error === 2 && digest.window.ok === 2, JSON.stringify(digest.window));
  check("the headline names armed counts", digest.headline.includes("3 of 3 armed"), digest.headline);
  const emptyDigest = scheduleHealthFromEvents([], [], now);
  check("an empty schedule table reads honestly", emptyDigest.rows.length === 0 && emptyDigest.headline.includes("no schedules"), emptyDigest.headline);
  check("the window is 14 days", SCHEDULE_HEALTH_WINDOW_DAYS === 14, String(SCHEDULE_HEALTH_WINDOW_DAYS));

  // ── embedding math ──
  check("l2Normalize makes unit vectors", Math.abs(l2Normalize([3, 4])[0] - 0.6) < 1e-9 && Math.abs(l2Normalize([3, 4])[1] - 0.8) < 1e-9, "unit");
  const hist = paletteHistogramFromPixels([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  check("the palette histogram bins pure colors exactly once", hist.filter((v) => v > 0).length === 4 && Math.abs(Math.sqrt(hist.reduce((a, v) => a + v * v, 0)) - 1) < 1e-9, `bins=${hist.filter((v) => v > 0).length}`);
  check("empty pixels give an all-zero histogram", paletteHistogramFromPixels([]).every((v) => v === 0), "empty");
  const grad = new Array<number>(72).fill(0).map((_, i) => (8 - (i % 9)) * 28); // bright left, dark right: every pixel beats its neighbour
  const gradHash = structureHashFromGray(grad);
  check("the dHash sets bits where a pixel beats its right neighbour", gradHash === (1n << BigInt(64)) - BigInt(1), `bits=${gradHash.toString(2).length}`);
  const flat = new Array<number>(72).fill(128);
  check("a flat image hashes to zero (no gradient)", structureHashFromGray(flat) === BigInt(0), "flat");
  check("structure similarity is 1 for identical and 0 for fully flipped hashes", structureSimilarity(gradHash, gradHash) === 1 && structureSimilarity(gradHash, ~gradHash & ((1n << BigInt(64)) - BigInt(1))) === 0, "hamming");
  check("cosine similarity of orthogonal vectors is 0", cosineSimilarity([1, 0], [0, 1]) === 0 && cosineSimilarity([1, 0], [2, 0]) === 1, "cosine");
  const aff = affinityBetween([1, 0], gradHash, [1, 0], gradHash);
  check("affinity averages palette cosine and structure agreement", aff.palette === 1 && aff.structure === 1 && aff.combined === 1, JSON.stringify(aff));
  check("the hex roundtrip preserves the hash", hexToHash(hashToHex(gradHash)) === gradHash && hexToHash("garbage!") === BigInt(0), "roundtrip");

  // REAL sharp decode of a synthesized PNG (local IO, no provider)
  const tmpA = "/tmp/e2e35-a.png";
  const tmpB = "/tmp/e2e35-b.png";
  synthPng(tmpA, "gradients=s=256x256:c0=0x1b2a4a:c1=0x0e1428");
  synthPng(tmpB, "gradients=s=256x256:c0=0x4a1b2a:c1=0x280d16");
  const embA1 = await embedImageFile(tmpA);
  const embA2 = await embedImageFile(tmpA);
  const embB = await embedImageFile(tmpB);
  check("sharp decodes a real PNG into a 64-float palette + 16-hex dHash", Boolean(embA1 && embA2 && embB && embA1.palette.length === 64 && /^[0-9a-f]{16}$/.test(embA1.hashHex)), embA1?.hashHex ?? "null");
  check("the same file embeds deterministically", embA1!.hashHex === embA2!.hashHex && embA1!.palette.every((v, i) => Math.abs(v - embA2!.palette[i]) < 1e-9), "deterministic");
  const sameAff = affinityBetween(embA1!.palette, embA1!.hash, embA2!.palette, embA2!.hash);
  const diffAff = affinityBetween(embA1!.palette, embA1!.hash, embB!.palette, embB!.hash);
  check("identical images score 1.0 affinity, a different palette scores lower", sameAff.combined === 1 && diffAff.combined < sameAff.combined, `same=${sameAff.combined.toFixed(3)} diff=${diffAff.combined.toFixed(3)}`);
  check("the different-palette affinity still lands above zero (gradients share structure)", diffAff.combined > 0, String(diffAff.combined.toFixed(3)));
  fs.rmSync(tmpA, { force: true });
  fs.rmSync(tmpB, { force: true });

  // ── registry + doctrine + files on disk ──
  check("the registry grows to 45 tools with studio_pulse", TOOL_DEFS.length === 45 && TOOL_DEFS.some((t) => t.name === "studio_pulse"), `tools=${TOOL_DEFS.length}`);
  const doctrine = buildSystemPrompt("CTX", "DOCS");
  check("doctrine rule 22 teaches the health readout", doctrine.includes("22. THE STUDIO REPORTS ITS OWN HEALTH") && doctrine.includes("studio_pulse"), "rule 22");
  check("the intro names the provider-free affinity tripwire", doctrine.includes("PROVIDER-FREE AFFINITY") && doctrine.includes("dHash"), "intro");

  const routeCanon = fs.readFileSync("src/app/api/canon-health/route.ts", "utf8");
  check("GET /api/canon-health route exists", routeCanon.includes("canonHealthData"), "route");
  const routeSched = fs.readFileSync("src/app/api/schedules/route.ts", "utf8");
  check("GET /api/schedules carries the health digest", routeSched.includes("scheduleHealthData") && routeSched.includes("digest"), "digest");
  const routeIdentity = fs.readFileSync("src/app/api/identity/route.ts", "utf8");
  check("POST/PATCH /api/identity gained the affinity mode", routeIdentity.includes('mode ?? "") === "affinity"') && routeIdentity.includes("scoreProjectEmbeddings"), "mode");
  const contView = fs.readFileSync("src/components/views/continuity-view.tsx", "utf8");
  check("the Continuity view renders the canon-health panel + affinity chips", contView.includes("Canon health") && contView.includes("Affinity pass") && contView.includes("CanonHealthPanel"), "ui");
  const dshView = fs.readFileSync("src/components/views/dsh-console.tsx", "utf8");
  check("the cadence panel renders the schedule digest chips", dshView.includes("ScheduleDigest") && dshView.includes("overdue") && dshView.includes("needs attention"), "ui");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const proj = await db.project.create({
    data: {
      title: "Pulse E2E",
      logline: "canon health + schedule health + affinity",
      characters: { create: [
        { name: "Lin Yue", role: "PROTAGONIST" },
        { name: "Xiao Chen", role: "RIVAL" },
      ] },
      seasons: {
        create: {
          number: 1,
          title: "S1",
          episodes: {
            create: {
              number: 1,
              title: "Embers",
              scenes: {
                create: {
                  number: 1,
                  title: "Ash Steps",
                  description: "a scorched mountain stair under two moons",
                  fogDensity: 0.4, lightningIntensity: 0.3, energyIntensity: 0.5, cameraDistance: 1.0, rimLightIntensity: 0.5,
                  shots: { create: [
                    { number: 1, description: "Lin Yue climbs the ash stair, blade drawn", shotType: "MEDIUM", movement: "DOLLY_IN", duration: 3 },
                    { number: 2, description: "Xiao Chen waits at the summit", shotType: "WIDE", movement: "STATIC", duration: 3 },
                    { number: 3, description: "the two moons over the ash stair", shotType: "ESTABLISHING", movement: "CRANE", duration: 3 },
                  ] },
                },
              },
            },
          },
        },
      },
    },
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } } } } } }, characters: true },
  });
  const projectId = proj.id;
  const shot1 = proj.seasons[0].episodes[0].scenes[0].shots[0];
  const shot2 = proj.seasons[0].episodes[0].scenes[0].shots[1];
  const shot3 = proj.seasons[0].episodes[0].scenes[0].shots[2];
  const createdFiles: string[] = [];

  async function ensureSheet(characterName: string, filter: string) {
    await executeTool(projectId, "generate_model_sheet", { characterName });
    const c = await db.character.findFirst({ where: { projectId, name: characterName } });
    if (!c) throw new Error(`character ${characterName} missing`);
    const disk = path.join(process.cwd(), "public", "sheets", `${c.id}.png`);
    if (!(c.modelSheetUrl && fs.existsSync(disk))) {
      synthPng(disk, filter);
      const nowT = new Date();
      await db.character.update({
        where: { id: c.id },
        data: { modelSheetUrl: `/sheets/${c.id}.png?v=${nowT.getTime()}`, modelSheetPrompt: `${characterName} canonical anchor (E2E)`, modelSheetAt: nowT },
      });
    }
    const after = await db.character.findUnique({ where: { id: c.id } });
    createdFiles.push(disk);
    return after!;
  }

  async function ensurePanel(shot: { id: string; number: number }, filter: string) {
    const disk = path.join(process.cwd(), "public", "panels", `${shot.id}.png`);
    const before = await db.shot.findUnique({ where: { id: shot.id } });
    if (!(before?.artworkUrl && fs.existsSync(disk))) {
      synthPng(disk, filter);
      const nowT = new Date();
      await db.shot.update({ where: { id: shot.id }, data: { artworkUrl: `/panels/${shot.id}.png?v=${nowT.getTime()}`, artGeneratedAt: nowT } });
    }
    createdFiles.push(disk);
    return db.shot.findUnique({ where: { id: shot.id } })!;
  }

  try {
    // ── 1. anchors + panels (real gradient PNGs through sharp later) ──
    const lin = await ensureSheet("Lin Yue", "gradients=s=1024x1024:c0=0x1b2a4a:c1=0x0e1428");
    const xiao = await ensureSheet("Xiao Chen", "gradients=s=1024x1024:c0=0x4a1b2a:c1=0x280d16");
    check("both sheets anchor on disk", Boolean(lin.modelSheetUrl && xiao.modelSheetUrl), "sheets");
    const panel1 = await ensurePanel(shot1, "mandelbrot=s=1152x864"); // chaotic structure + bright palette: far from Lin's smooth navy sheet
    const panel2 = await ensurePanel(shot2, "gradients=s=1152x864:c0=0x4a1b2a:c1=0x280d16"); // Xiao Chen's cast: the same crimson family as their sheet
    check("both panels carry art on disk", Boolean(panel1.artworkUrl && panel2.artworkUrl), "panels");

    // ── 2. REAL schedule fires: SKIPPED x2, ERROR via the deleted pinned plan ──
    const planRun = await createSchedule(projectId, { name: "Pulse plan run", kind: "PLAN_RUN", cadence: "DAILY", hourUtc: 2, maxSteps: 2 });
    check("the plan-run schedule registers armed", planRun.ok && planRun.schedule.enabled && planRun.schedule.cadenceLabel.includes("nightly"), planRun.ok ? planRun.schedule.nextRunAt ?? "" : planRun.error ?? "");
    const fire1 = await fireScheduleNow(planRun.schedule.id);
    check("firing with no ACTIVE plan SKIPS honestly", fire1.ok && fire1.status === "SKIPPED" && (fire1.report ?? "").includes("no ACTIVE plan"), fire1.report ?? fire1.error ?? "");

    const watch = await createSchedule(projectId, { name: "Pulse queue watch", kind: "REPAINT_QUEUE", cadence: "HOURLY", intervalHours: 6 });
    const fire2 = await fireScheduleNow(watch.schedule.id);
    check("the render watch SKIPS while the re-render queue is clean", fire2.ok && fire2.status === "SKIPPED" && (fire2.report ?? "").includes("queue clean"), fire2.report ?? "");

    const doomed = await db.dshPlan.create({
      data: { projectId, title: "Doomed plan", goal: "prove the ERROR path", status: "ACTIVE", source: "DSH", steps: "[]" },
    });
    const doomedSched = await createSchedule(projectId, { name: "Pulse doomed", kind: "PLAN_RUN", cadence: "DAILY", hourUtc: 3, planId: doomed.id });
    await db.dshPlan.delete({ where: { id: doomed.id } });
    const fire3 = await fireScheduleNow(doomedSched.schedule.id);
    check("firing a schedule pinned to a deleted plan lands ERROR", fire3.ok && fire3.status === "ERROR" && (fire3.report ?? "").includes("no longer exists"), fire3.report ?? "");
    const schedEvents = await db.productionEvent.findMany({ where: { projectId, type: "SCHEDULE" }, orderBy: { createdAt: "asc" } });
    check("every fire landed a SCHEDULE event", schedEvents.length >= 3, `events=${schedEvents.length}`);

    const liveDigest = await scheduleHealthData(projectId);
    check("the live digest aggregates the real fires", liveDigest.rows.length === 3 && liveDigest.window.error >= 1 && liveDigest.rows.find((r) => r.name === "Pulse doomed")?.errorStreak === 1, liveDigest.headline);
    check("the digest flags the errored schedule as needing attention", liveDigest.erroring >= 1, String(liveDigest.erroring));

    const schedApi = await fetch(`http://127.0.0.1:3000/api/schedules?projectId=${projectId}`);
    const schedApiBody = (await schedApi.json()) as { schedules?: unknown[]; digest?: { window: { fires: number } } };
    check("GET /api/schedules serves rows + digest over HTTP", schedApi.status === 200 && (schedApiBody.schedules?.length ?? 0) === 3 && (schedApiBody.digest?.window.fires ?? 0) >= 3, `${schedApi.status}`);

    // ── 3. canon: REAL fact verdict events through the real pipeline ──
    const factTool = async (text: string, category: string) => executeTool(projectId, "add_universe_fact", { text, category });
    await factTool("two moons hang over the arena", "WORLD");
    await factTool("the antagonist never removes his mask", "RULE");
    await factTool("her blade glows cyan when energy channels", "PROP");
    await factTool("the terrace lanterns burn blue at night", "LOCATION");
    await db.universeFact.create({ data: { projectId, text: "retired: the sword sings at dawn", category: "WORLD", active: false } });
    const facts = await db.universeFact.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
    const [f1, f2, f3] = facts;
    check("five facts registered (one inactive)", facts.length === 5 && facts.filter((f) => f.active).length === 4, `active=${facts.filter((f) => f.active).length}`);

    visionState.queue.push(FACT_VERDICTS_CALL1(f1.id, f2.id, f3.id));
    const checkA = await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 1 });
    check("the fact check on panel 1 really judged the active canon", checkA.status === "OK" && checkA.result.includes("Universe-facts check on Shot 001") && checkA.result.includes("BROKEN (conf 0.85)") && checkA.result.includes("entered the re-render queue"), checkA.result.split("\n")[0]?.slice(0, 130) ?? "");
    visionState.queue.push(FACT_VERDICTS_CALL2(f1.id, f2.id, f3.id));
    await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 2 });
    const factEvents = await db.continuityEvent.findMany({ where: { projectId, kind: { in: ["FACT_HELD", "FACT_BROKEN"] } } });
    check("six REAL verdict events landed (prior-shot verdicts replaced)", factEvents.length === 6, `events=${factEvents.length}`);

    const canon = await canonHealthData(projectId);
    check("the canon rollup: 3 of 4 active facts audited", canon.digest.verifiedFacts === 3 && canon.digest.activeFacts === 4, `verified=${canon.digest.verifiedFacts}`);
    check("the violated fact ranks first with its worst confidence", canon.digest.worstFacts[0]?.status === "VIOLATED" && canon.digest.worstFacts[0]?.worstBrokenConfidence === 0.85, `${canon.digest.worstFacts[0]?.status} ${canon.digest.worstFacts[0]?.worstBrokenConfidence}`);
    check("the unverified fact is second", canon.digest.worstFacts[1]?.status === "UNVERIFIED", canon.digest.worstFacts[1]?.status ?? "");
    check("the live canon score matches the pure math (0.8 WATCH)", Math.abs((canon.digest.score ?? 0) - 0.8) < 0.001 && canon.digest.band === "WATCH", `${canon.digest.score?.toFixed(3)} ${canon.digest.band}`);
    check("the 14-day trend counts the real events", canon.digest.recent.held === 5 && canon.digest.recent.broken === 1, `${canon.digest.recent.held}/${canon.digest.recent.broken}`);

    const canonApi = await fetch(`http://127.0.0.1:3000/api/canon-health?projectId=${projectId}`);
    const canonApiBody = (await canonApi.json()) as { digest?: { headline?: string }; rows?: unknown[] };
    check("GET /api/canon-health serves the digest + rows over HTTP", canonApi.status === 200 && (canonApiBody.rows?.length ?? 0) === 5 && (canonApiBody.digest?.headline ?? "").includes("score 80% WATCH"), `${canonApi.status} ${canonApiBody.digest?.headline?.slice(0, 60)}`);

    // ── 4. the provider-free affinity pass (REAL local math, no mock) ──
    const affFar = await scoreShotEmbedding(shot1.id);
    check("the affinity pass embeds panel + sheet locally", affFar.ok && affFar.scored.verdict.entries.length === 1, affFar.ok ? `worst ${affFar.scored.verdict.worst.toFixed(3)}` : (affFar as { error: string }).error);
    check("the chaotic mandelbrot panel sits far from Lin's smooth navy sheet (watch band)", affFar.ok && affFar.scored.verdict.worst < AFFINITY_WATCH_THRESHOLD, affFar.ok ? affFar.scored.verdict.worst.toFixed(3) : "");
    const affClose = await scoreShotEmbedding(shot2.id);
    check("Xiao Chen's panel sits close to Xiao Chen's crimson sheet", affClose.ok && affClose.scored.verdict.worst > (affFar.ok ? affFar.scored.verdict.worst : 1), affClose.ok ? `worst ${affClose.scored.verdict.worst.toFixed(3)} > far ${affFar.ok ? affFar.scored.verdict.worst.toFixed(3) : ""}` : "");
    check("the close panel stays above the watch line", affClose.ok && affClose.scored.verdict.worst >= AFFINITY_WATCH_THRESHOLD, affClose.ok ? String(affClose.scored.verdict.worst >= AFFINITY_WATCH_THRESHOLD) : "");
    const embRow = await db.panelEmbedding.findUnique({ where: { shotId: shot1.id } });
    check("the PanelEmbedding row persists with the method note", Boolean(embRow && embRow.hashHex.length === 16 && embRow.method.includes("provider-free")), embRow?.hashHex ?? "missing");
    const rescore = await scoreShotEmbedding(shot1.id);
    const embCount = await db.panelEmbedding.count({ where: { shotId: shot1.id } });
    check("re-running the pass upserts (one row per shot)", rescore.ok && embCount === 1, `rows=${embCount}`);
    const noCast = await scoreShotEmbedding(shot3.id);
    check("a panel without art is refused", !noCast.ok && (noCast as { error: string }).error.includes("no panel art"), (noCast as { error: string }).error.slice(0, 60));

    const batchAff = await scoreProjectEmbeddings(projectId, 8);
    check("the batch affinity pass embeds both scored-able panels", batchAff.scored.length === 2 && batchAff.errors.length === 0, `scored=${batchAff.scored.length}`);

    const affApi = await fetch("http://127.0.0.1:3000/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shotId: shot1.id, mode: "affinity" }),
    });
    const affApiBody = (await affApi.json()) as { scored?: { verdict?: { worst?: number } }; error?: string };
    check("POST /api/identity mode=affinity really embeds over HTTP (no provider)", affApi.status === 200 && typeof affApiBody.scored?.verdict?.worst === "number", `${affApi.status} worst=${affApiBody.scored?.verdict?.worst?.toFixed(3)} ${affApiBody.error ?? ""}`);

    // ── 5. identity + the affinity rider on the DSH tool ──
    visionState.queue.push(RAW_LIN_VERIFIED);
    const ident = await executeTool(projectId, "score_panel_identity", { sceneNumber: 1, shotNumber: 1 });
    check("the vision score lands with the affinity rider in ONE result", ident.status === "OK" && ident.result.includes("Lin Yue 83%") && ident.result.includes("Provider-free affinity"), ident.result.slice(0, 160));
    check("the rider honestly names the tripwire", ident.result.includes("tripwire only") || ident.result.includes("WATCH"), "tripwire");

    const panelData = await identityPanelData(projectId);
    check("the identity panel feed carries the affinity map", panelData.rows.length === 1 && Boolean(panelData.embeddings[shot1.id]) && panelData.embeddings[shot1.id].entries[0].characterName === "Lin Yue", `embeddings=${Object.keys(panelData.embeddings).length}`);
    const identApi = await fetch(`http://127.0.0.1:3000/api/identity?projectId=${projectId}`);
    const identApiBody = (await identApi.json()) as { embeddings?: Record<string, unknown> };
    check("GET /api/identity serves the embeddings round trip", identApi.status === 200 && Object.keys(identApiBody.embeddings ?? {}).length >= 2, `${identApi.status}`);

    // ── 6. DSH studio_pulse reads the whole studio at once ──
    const pulse = await executeTool(projectId, "studio_pulse", {});
    check("the pulse reads canon + identity + schedules + queue", pulse.status === "OK" && pulse.result.includes("Canon:") && pulse.result.includes("Identity:") && pulse.result.includes("Schedules:") && pulse.result.includes("Queue:"), pulse.result.split("\n")[0]?.slice(0, 100));
    check("the pulse canon line carries the WATCH band", pulse.result.includes("WATCH") && pulse.result.includes("violated"), pulse.result.split("\n")[1]?.slice(0, 120));
    check("the pulse names the violated fact and the errored schedule", pulse.result.includes("the antagonist never removes his mask") && pulse.result.includes("Pulse doomed"), pulse.result.split("\n").slice(2, 4).join(" | ").slice(0, 150));

    // ── 7. the context carries the health lines for the NEXT conversation ──
    const ctx = await buildCompactContext(projectId) as unknown as {
      canonHealth?: string; scheduleHealth?: string; affinity: string[];
    };
    check("the context canonHealth line carries the score + band", Boolean(ctx.canonHealth) && ctx.canonHealth!.includes("80% WATCH"), ctx.canonHealth?.slice(0, 90));
    check("the context scheduleHealth line aggregates the window", Boolean(ctx.scheduleHealth) && ctx.scheduleHealth!.includes("armed"), ctx.scheduleHealth?.slice(0, 90));
    check("the context affinity lines flag the watch tripwire", ctx.affinity.length >= 2 && ctx.affinity.some((a) => a.includes("WATCH")), ctx.affinity.join(" | ").slice(0, 120));
  } finally {
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of [...new Set(createdFiles)]) {
      try { fs.rmSync(f, { force: true }); } catch { /* already gone */ }
    }
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

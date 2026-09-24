// E2E: img2vid demotion (default-off + previz-only labeling), per-fact
// auto-retire suggestions, per-character identity drift curves,
// creator-authored plan template variations + the daily digest.
// Steps:
//   plan - pure checks: the img2vid opt-in gate matrix (unset/off/on/
//          zai/true/previz/host-wins) + previz labeling on disk, the
//          retire-suggestion rollup (min panels, hold-rate line,
//          inactive exclusion, sort, digest count), the drift-curve
//          rollup (per-character grouping, story ordering,
//          delta/trend bands, worst aspect, steepest-first sort),
//          template-variation validation + token resolution + built-in
//          step loading, the digest builder (window filtering, buckets,
//          error naming, honest empties), the 46-tool registry,
//          doctrine rules 20-23 + intro, routes + UI + schema on disk.
//   tool - live pipeline: fixture project with a sheeted cast and REAL
//          panel/sheet PNGs, the img2vid slot provably CLOSED in the
//          real driver chain (a pose-carrying shot lands on MOTION),
//          REAL fact verdicts (vision SDK mocked in-process, proven in
//          iters 29/30/34/35) driving a retire suggestion + the live
//          reword/retire API loop, identity scores through the real
//          persistence path building DECLINING/IMPROVING curves, a
//          variation saved + landed by id and by name with tokens
//          resolved to real episode numbers + a REAL plan step executed
//          to prove the landed plan runs, the digest posted via the
//          scheduler (DAILY_DIGEST fire), the API and the DSH
//          post_digest tool, studio_pulse + context lines.
import { mock } from "bun:test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { executeTool, TOOL_DEFS } from "@/lib/dsh/tools";
import { buildCompactContext } from "@/lib/dsh/tools";
import { img2vidProvider, img2vidStatus } from "@/lib/bridge/img2vid";
import {
  retireSuggestionsFromRows, canonHealthData, RETIRE_MIN_PANELS, RETIRE_HOLD_RATE,
  type FactHealthRow,
} from "@/lib/canon-health";
import {
  identityDriftFromRows, identityDriftData, identityPanelData,
  scoreShotIdentityFromRaw, DRIFT_TREND_THRESHOLD,
} from "@/lib/identity";
import {
  validateTemplateSteps, resolveTemplateValue, savePlanTemplate,
  listPlanTemplates, deletePlanTemplate, instantiateEpisodePlan,
  builtInStepsFor, listTemplateEpisodes,
} from "@/lib/dsh/plan-templates";
import { buildDigestFromEvents, postDailyDigest, listDigests } from "@/lib/digest";
import { createSchedule, fireScheduleNow } from "@/lib/scheduler";
import { createRenderJob, tickProjectJobs } from "@/lib/engine/render";
import { buildSystemPrompt } from "@/lib/dsh/prompts";
import { PrismaClient } from "@prisma/client";

// ── in-process vision SDK mock (same seam as iters 34/35) ──
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

const IDENT_RAW = (name: string, sim: number, face: number, hair: number) => JSON.stringify({
  note: "curve data point",
  characters: [{ name, similarity: sim, aspects: { face, hair, wardrobe: 0.7 }, note: "aspects ride the curve" }],
});
const FACT_VERDICTS_ALL_BROKEN = (f1: string) => JSON.stringify({
  summary: "the wording keeps failing",
  verdicts: [{ id: f1, holds: false, confidence: 0.9, note: "the mask is off again" }],
});

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── 1. img2vid demotion: the opt-in gate ──
  const saved = { on: process.env.ANIMEOS_IMG2VID, host: process.env.ANIMEOS_IMG2VID_HOST };
  for (const k of ["ANIMEOS_IMG2VID", "ANIMEOS_IMG2VID_HOST"]) delete process.env[k];
  check("unset ANIMEOS_IMG2VID closes the slot (default-off)", img2vidProvider() === null, String(img2vidProvider()));
  process.env.ANIMEOS_IMG2VID = "off";
  check("ANIMEOS_IMG2VID=off still closes the slot", img2vidProvider() === null, "off");
  for (const flag of ["on", "zai", "true", "1", "previz"]) {
    process.env.ANIMEOS_IMG2VID = flag;
    check(`ANIMEOS_IMG2VID=${flag} opts the built-in model in`, img2vidProvider() === "zai", flag);
  }
  process.env.ANIMEOS_IMG2VID = "off";
  process.env.ANIMEOS_IMG2VID_HOST = "127.0.0.1:9999";
  check("an attached host wins the slot regardless of the flag", img2vidProvider() === "host", "host wins");
  delete process.env.ANIMEOS_IMG2VID_HOST;
  delete process.env.ANIMEOS_IMG2VID;
  if (saved.on !== undefined) process.env.ANIMEOS_IMG2VID = saved.on;
  if (saved.host !== undefined) process.env.ANIMEOS_IMG2VID_HOST = saved.host;
  check("img2vidStatus reports the closed slot honestly", img2vidStatus().available === false, JSON.stringify(img2vidStatus()));

  // ── 2. retire suggestions: the pure rollup ──
  const mkRow = (id: string, text: string, active: boolean, held: number, broken: number): FactHealthRow => ({
    factId: id, text, category: "RULE", active, status: broken > 0 ? "VIOLATED" : held > 0 ? "HELD" : "UNVERIFIED",
    checkedPanels: held + broken, held, broken,
    worstBrokenConfidence: broken > 0 ? 0.9 : null, lastCheckedAt: null, lastConfidence: null, lastNote: "",
  });
  check("the retire line needs enough audits", RETIRE_MIN_PANELS === 3 && RETIRE_HOLD_RATE < 0.35, `${RETIRE_MIN_PANELS}/${RETIRE_HOLD_RATE}`);
  const s1 = retireSuggestionsFromRows([
    mkRow("a", "always broken fact", true, 0, 4),      // 0% hold: suggested, first
    mkRow("b", "mostly broken fact", true, 1, 3),      // 25% hold: suggested, second
    mkRow("c", "borderline fact", true, 1, 2),         // 33.3% hold: only 3 panels, above the line? 0.333 < 0.34 -> suggested
    mkRow("d", "healthy fact", true, 3, 0),            // 100%: never
    mkRow("e", "too few audits", true, 0, 2),          // 2 panels: never
    mkRow("f", "inactive broken fact", false, 0, 5),   // inactive: never
  ]);
  check("facts below the hold-rate line with enough audits get suggested", s1.some((s) => s.factId === "a") && s1.some((s) => s.factId === "b"), s1.map((s) => s.factId).join(","));
  check("the inactive and under-audited facts never earn the suggestion", !s1.some((s) => s.factId === "f") && !s1.some((s) => s.factId === "e"), "exclusions");
  check("the healthy fact is never suggested", !s1.some((s) => s.factId === "d"), "healthy");
  check("suggestions sort worst hold-rate first", s1.length >= 2 && s1[0].holdRate <= s1[1].holdRate, s1.map((s) => `${s.factId}:${s.holdRate.toFixed(2)}`).join(","));
  check("the reason names the counts and the reword/retire fork", s1[0].reason.includes("failed on 4 of 4") && s1[0].reason.includes("reword or retire"), s1[0].reason.slice(0, 80));

  // ── 3. drift curves: the pure rollup ──
  check("the trend band is 5 points", DRIFT_TREND_THRESHOLD === 0.05, String(DRIFT_TREND_THRESHOLD));
  const mkScore = (name: string, sim: number) => ({ characterName: name, similarity: sim, aspects: { face: sim - 0.1, hair: sim + 0.05 }, note: "" });
  const drift = identityDriftFromRows([
    { scores: JSON.stringify([mkScore("Lin", 0.9), mkScore("Xiao", 0.7)]), episode: 1, scene: 1, shot: 1, scoredAt: new Date("2026-01-01") },
    { scores: JSON.stringify([mkScore("Lin", 0.85), mkScore("Xiao", 0.72)]), episode: 1, scene: 2, shot: 1, scoredAt: new Date("2026-01-02") },
    { scores: JSON.stringify([mkScore("Lin", 0.7), mkScore("Xiao", 0.78)]), episode: 2, scene: 1, shot: 3, scoredAt: new Date("2026-01-03") },
    { scores: JSON.stringify([mkScore("Lin", 0.71), mkScore("Xiao", 0.73)]), episode: 3, scene: 1, shot: 1, scoredAt: new Date("2026-01-04") },
  ]);
  const lin = drift.find((c) => c.characterName === "Lin");
  const xiao = drift.find((c) => c.characterName === "Xiao");
  check("curves group per character with story-ordered points", Boolean(lin && xiao && lin.points.length === 4 && xiao.points.length === 4), `${lin?.points.length}/${xiao?.points.length}`);
  check("points order by episode, scene, shot", lin!.points.map((p) => `${p.episode}.${p.scene}.${p.shot}`).join(" ") === "1.1.1 1.2.1 2.1.3 3.1.1", lin!.points.map((p) => `${p.episode}.${p.scene}.${p.shot}`).join(" "));
  check("Lin declines 19 points over the curve", lin!.delta !== null && Math.abs(lin!.delta! - (-0.19)) < 0.001 && lin!.trend === "DECLINING", `${lin!.delta?.toFixed(3)} ${lin!.trend}`);
  check("Xiao is stable inside the band", xiao!.trend === "STABLE" && Math.abs(xiao!.delta! - 0.03) < 0.001, `${xiao!.delta?.toFixed(3)} ${xiao!.trend}`);
  check("a single point reads FLAT with no delta", identityDriftFromRows([
    { scores: JSON.stringify([mkScore("Solo", 0.5)]), episode: 1, scene: 1, shot: 1, scoredAt: new Date("2026-01-01") },
  ])[0].trend === "FLAT", "flat");
  check("an improving curve is named IMPROVING", identityDriftFromRows([
    { scores: JSON.stringify([mkScore("Up", 0.5)]), episode: 1, scene: 1, shot: 1, scoredAt: new Date("2026-01-01") },
    { scores: JSON.stringify([mkScore("Up", 0.8)]), episode: 2, scene: 1, shot: 1, scoredAt: new Date("2026-01-02") },
  ])[0].trend === "IMPROVING", "improving");
  check("the worst aspect carries the lowest mean across the curve", lin!.worstAspect === "face", lin!.worstAspect ?? "");
  check("curves sort steepest decline first", drift[0].characterName === "Lin", drift.map((c) => c.characterName).join(","));

  // ── 4. template variations: validation + tokens ──
  const known = validateTemplateSteps([{ tool: "check_capabilities", args: {}, why: "report" }]);
  check("a valid variation passes validation", known.ok, known.ok ? "" : known.error);
  const unknownTool = validateTemplateSteps([{ tool: "make_me_a_sandwich", args: {}, why: "" }]);
  check("an unknown tool is refused at save time", !unknownTool.ok && unknownTool.error.includes("not a DSH tool"), unknownTool.ok ? "" : unknownTool.error);
  const tooMany = validateTemplateSteps(Array.from({ length: 13 }, (_, i) => ({ tool: "check_capabilities", args: {}, why: String(i) })));
  check("13 steps are refused (the plan cap)", !tooMany.ok && tooMany.error.includes("12"), tooMany.ok ? "" : tooMany.error);
  const nonArray = validateTemplateSteps("nope");
  check("a non-array steps payload is refused", !nonArray.ok, "");
  const resolved = resolveTemplateValue(
    { episodeNumber: "{episode}", title: "S{episode} - {title}", nested: { scene: "{latestScene}" }, list: ["{episode}", 5], n: 7 },
    { episode: 4, latestScene: 3, title: "Embers" },
  ) as { episodeNumber: string; title: string; nested: { scene: string }; list: string[]; n: number };
  check("tokens resolve deep through objects and arrays", resolved.episodeNumber === "4" && resolved.title === "S4 - Embers" && resolved.nested.scene === "3" && resolved.list[0] === "4" && resolved.list[1] === 5, JSON.stringify(resolved));
  check("builtInStepsFor resolves a built-in and refuses the unknown", (builtInStepsFor({ episodeId: "x", seasonNumber: 1, number: 2, title: "T", sceneCount: 2, shotCount: 5 }, "panel-pass") ?? []).length === 4 && builtInStepsFor({ episodeId: "x", seasonNumber: 1, number: 2, title: "T", sceneCount: 2, shotCount: 5 }, "nope") === null, "loader");

  // ── 5. the digest builder ──
  const now = new Date();
  const mkEv = (type: string, summary: string, hoursAgo: number) => ({ type, summary, createdAt: new Date(now.getTime() - hoursAgo * 3600 * 1000) });
  const d1 = buildDigestFromEvents({
    projectTitle: "Ash Ledger", windowHours: 24, now,
    events: [
      mkEv("RENDER", "Render job abc123 queued - PREVIEW", 2),
      mkEv("RENDER", "Render job def456 queued - FINAL", 3),
      mkEv("TOOL_CALL", "Plan 'Nightly' step 2/6 create_scene -> Scene 2 created", 4),
      mkEv("PLAN", "Plan 'Nightly' completed - all 6 step(s) ran", 5),
      mkEv("SCHEDULE", "Schedule 'nightly' OK - plan 2/3 steps done", 6),
      mkEv("SCHEDULE", "Schedule 'watch' ERROR - the pinned plan no longer exists", 7),
      mkEv("CONTINUITY", "Universe fact registered: two moons", 8),
      mkEv("RENDER", "Render job old789 - outside the window", 40),
    ],
    canonHeadline: "score 80% WATCH - 3/4 active fact(s) audited",
    driftHeadline: "1 of 2 curved character(s) DECLINING over episode order: Lin -19%",
    queueCounts: { active: 2, rerender: 1 },
  });
  check("the digest window excludes old events", d1.events === 7 && d1.lines[0].includes("last 24h") && d1.lines[0].includes("7 production event(s)"), d1.lines[0]);
  check("the digest buckets renders and names plans", d1.lines[1].includes("2 job(s)") && d1.lines[2].includes("1 step(s) executed") && d1.lines[2].includes("latest: Plan 'Nightly' step"), d1.lines.slice(1, 3).join(" | "));
  check("the digest names schedule fires with the ERROR count", d1.lines[3].includes("2 fire(s)") && d1.lines[3].includes("1 ERROR(s)"), d1.lines[3]);
  check("the digest carries the health headlines + queue", d1.lines[4].includes("80% WATCH") && d1.lines[5].includes("DECLINING") && d1.lines[6].includes("2 active render job(s)"), d1.lines.slice(4).join(" | "));
  const quiet = buildDigestFromEvents({
    projectTitle: "Quiet", windowHours: 24, now, events: [mkEv("RENDER", "ancient", 100)],
    canonHeadline: null, driftHeadline: null, queueCounts: { active: 0, rerender: 0 },
  });
  check("a quiet day still reads honestly", quiet.events === 0 && quiet.lines[1].includes("none queued") && quiet.lines[2].includes("Plans: quiet") && quiet.lines[3].includes("no fires") && quiet.lines[4].includes("no active facts"), quiet.lines.join(" | ").slice(0, 160));

  // ── 6. registry + doctrine + files on disk ──
  check("the registry grows to 46 tools with post_digest", TOOL_DEFS.length === 46 && TOOL_DEFS.some((t) => t.name === "post_digest"), `tools=${TOOL_DEFS.length}`);
  check("land_episode_plan advertises saved variations", TOOL_DEFS.find((t) => t.name === "land_episode_plan")!.description.includes("creator-authored variation"), "tool doc");
  check("create_schedule advertises DAILY_DIGEST", TOOL_DEFS.find((t) => t.name === "create_schedule")!.description.includes("DAILY_DIGEST"), "tool doc");
  const doctrine = buildSystemPrompt("CTX", "DOCS");
  check("doctrine rule 23 teaches the digest", doctrine.includes("23. THE STUDIO WRITES TO THE CREATOR") && doctrine.includes("post_digest"), "rule 23");
  check("doctrine rules 20-22 carry the new surfaces", doctrine.includes("DAILY_DIGEST") && doctrine.includes("VARIATION") && doctrine.includes("canonRetire"), "rules 20-22");
  check("the intro names the opt-in previz slot", doctrine.includes("OPT-IN img2vid previz slot") && doctrine.includes("never the final render"), "intro");

  const img2vidFile = fs.readFileSync("src/lib/bridge/img2vid.ts", "utf8");
  check("the img2vid module documents the demotion", img2vidFile.includes("PREVIZ SLOT") && img2vidFile.includes("Demoted to default-off"), "lib");
  const renderView = fs.readFileSync("src/components/views/render-view.tsx", "utf8");
  check("the queue card chips read PREVIZ with the off-state note", renderView.includes('"PREVIZ"') && renderView.includes("off (default)"), "ui");
  const contView = fs.readFileSync("src/components/views/continuity-view.tsx", "utf8");
  check("the Continuity view carries retire suggestions + drift curves", contView.includes("Auto-retire suggestions") && contView.includes("Identity drift curves") && contView.includes("DriftSparkline"), "ui");
  const dshView = fs.readFileSync("src/components/views/dsh-console.tsx", "utf8");
  check("the DSH view carries the digest panel + variation author", dshView.includes("Studio digest") && dshView.includes("Author a variation") && dshView.includes("Your variations"), "ui");
  check("the scheduler panel offers the daily digest kind", dshView.includes('value="DAILY_DIGEST"'), "ui");
  const routeDigest = fs.readFileSync("src/app/api/digest/route.ts", "utf8");
  check("GET/POST /api/digest route exists", routeDigest.includes("listDigests") && routeDigest.includes("postDailyDigest"), "route");
  const routeTemplates = fs.readFileSync("src/app/api/plan-templates/route.ts", "utf8");
  check("the plan-templates API serves saves + variations", routeTemplates.includes("savePlanTemplate") && routeTemplates.includes("listPlanTemplates") && routeTemplates.includes("builtInStepsFor"), "route");
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  check("the PlanTemplate model exists with studio scope", schema.includes("model PlanTemplate") && schema.includes("studio-library variations shared across productions"), "schema");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const proj = await db.project.create({
    data: {
      title: "Iter36 E2E",
      logline: "previz demotion + retire + drift + variations + digest",
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
                  shots: { create: [
                    { number: 1, description: "Lin Yue climbs the ash stair, blade drawn", shotType: "MEDIUM", movement: "DOLLY_IN", duration: 3 },
                    { number: 2, description: "Lin Yue at the summit, blade raised", shotType: "CLOSEUP", movement: "STATIC", duration: 3 },
                    { number: 3, description: "Xiao Chen waits alone", shotType: "WIDE", movement: "STATIC", duration: 3 },
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
    createdFiles.push(disk);
    return db.character.findUnique({ where: { id: c.id } })!;
  }

  async function ensurePanel(shot: { id: string }, filter: string) {
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
    const lin = await ensureSheet("Lin Yue", "gradients=s=1024x1024:c0=0x1b2a4a:c1=0x0e1428");
    const xiao = await ensureSheet("Xiao Chen", "gradients=s=1024x1024:c0=0x4a1b2a:c1=0x280d16");
    check("both sheets anchor on disk", Boolean(lin.modelSheetUrl && xiao.modelSheetUrl), "sheets");
    await ensurePanel(shot1, "gradients=s=1152x864:c0=0x22304e:c1=0x111a30");
    await ensurePanel(shot2, "gradients=s=1152x864:c0=0x1d2942:c1=0x0e1626");
    await ensurePanel(shot3, "gradients=s=1152x864:c0=0x501c2e:c1=0x2a0e18");

    // ── 1. the previz slot is provably CLOSED in the real driver chain ──
    await db.shot.update({ where: { id: shot1.id }, data: { poseStart: "STANCE", poseEnd: "WALK" } });
    const job = await createRenderJob(projectId, shot1.id, "PREVIEW");
    await tickProjectJobs(projectId).catch(() => {});
    const jobRow = await db.renderJob.findUnique({ where: { id: job.id } });
    check("a pose-carrying shot routes to MOTION, not the closed previz slot", jobRow?.driver === "MOTION", `driver=${jobRow?.driver}`);
    await db.renderJob.delete({ where: { id: job.id } }).catch(() => {});
    await db.shot.update({ where: { id: shot1.id }, data: { poseStart: null, poseEnd: null } });

    // ── 2. identity drift curves through the REAL persistence path ──
    const r1 = await scoreShotIdentityFromRaw(shot1.id, IDENT_RAW("Lin Yue", 0.9, 0.8, 0.95));
    check("panel 1 scores through the real persistence path", r1.ok && r1.scored.verdict.worst === 0.9, r1.ok ? `worst ${r1.scored.verdict.worst}` : r1.error);
    const r2 = await scoreShotIdentityFromRaw(shot2.id, IDENT_RAW("Lin Yue", 0.7, 0.6, 0.75));
    check("panel 2 scores lower (the curve bends down)", r2.ok && r2.scored.verdict.worst === 0.7, r2.ok ? `worst ${r2.scored.verdict.worst}` : r2.error);
    const r3 = await scoreShotIdentityFromRaw(shot3.id, IDENT_RAW("Xiao Chen", 0.55, 0.52, 0.67));
    check("Xiao Chen's panel scores through the same path", r3.ok && r3.scored.verdict.worst === 0.55, r3.ok ? `worst ${r3.scored.verdict.worst}` : r3.error);

    const driftLive = await identityDriftData(projectId);
    const linCurve = driftLive.characters.find((c) => c.characterName === "Lin Yue");
    check("the live drift rollup builds Lin Yue's DECLINING curve over 2 panels", Boolean(linCurve && linCurve.points.length === 2 && linCurve.trend === "DECLINING" && Math.abs(linCurve.delta! + 0.2) < 0.001), linCurve ? `${linCurve.trend} ${linCurve.delta?.toFixed(2)}` : "missing");
    check("the watch names the declining character", driftLive.watch.length === 1 && driftLive.watch[0].characterName === "Lin Yue", driftLive.headline);

    const panelFeed = await identityPanelData(projectId);
    check("the identity panel feed carries the drift section", panelFeed.drift.characters.length === 2 && panelFeed.drift.watch.length === 1, panelFeed.drift.headline.slice(0, 90));
    check("the scored rows still feed the re-paint queue", panelFeed.rows.length === 3 && panelFeed.queue.length === 1 && panelFeed.queue[0].description.includes("Xiao Chen"), `rows=${panelFeed.rows.length} queue=${panelFeed.queue.length}`);

    // ── 3. retire suggestions through REAL fact verdicts ──
    await executeTool(projectId, "add_universe_fact", { text: "the antagonist never removes his mask", category: "RULE" });
    const maskFact = await db.universeFact.findFirst({ where: { projectId, text: { startsWith: "the antagonist" } } });
    visionState.queue.push(FACT_VERDICTS_ALL_BROKEN(maskFact!.id));
    const chk1 = await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 1 });
    check("the first BROKEN verdict lands through the real pipeline", chk1.status === "OK" && chk1.result.includes("BROKEN"), chk1.result.split("\n")[0]?.slice(0, 90) ?? "");
    visionState.queue.push(FACT_VERDICTS_ALL_BROKEN(maskFact!.id));
    await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 2 });
    visionState.queue.push(FACT_VERDICTS_ALL_BROKEN(maskFact!.id));
    await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: 3 });

    const canon = await canonHealthData(projectId);
    check("the canon digest counts the retire suggestion", canon.digest.retireSuggestions === 1 && canon.suggestions.length === 1, canon.digest.headline.slice(0, 110));
    check("the suggestion names the failure counts and the fork", canon.suggestions[0]?.reason.includes("failed on 3 of 3") && canon.suggestions[0]?.reason.includes("reword or retire"), canon.suggestions[0]?.reason.slice(0, 90));
    check("the suggestion sorts into the digest headline", canon.digest.headline.includes("1 suggested for rewording/retirement"), canon.digest.headline);

    // the API loop: reword keeps the fact, retire deactivates it
    const reword = await fetch(`http://127.0.0.1:3000/api/universe-facts/${maskFact!.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "the antagonist never removes his mask indoors" }),
    });
    check("PATCH /api/universe-facts rewords the fact over HTTP", reword.ok, String(reword.status));
    const canonAfterReword = await canonHealthData(projectId);
    check("the suggestion survives a reword (history is per wording, audits pending)", canonAfterReword.suggestions.length === 0, `suggestions=${canonAfterReword.suggestions.length}`);

    // rebuild the broken history on the new wording, then retire over HTTP
    for (const n of [1, 2, 3]) {
      visionState.queue.push(FACT_VERDICTS_ALL_BROKEN(maskFact!.id));
      await executeTool(projectId, "check_universe_facts", { sceneNumber: 1, shotNumber: n });
    }
    const canon2 = await canonHealthData(projectId);
    check("the reworded fact earns the suggestion again after 3 fresh BROKEN audits", canon2.suggestions.length === 1 && canon2.suggestions[0].text.includes("indoors"), canon2.suggestions[0]?.reason.slice(0, 80));
    const retire = await fetch(`http://127.0.0.1:3000/api/universe-facts/${maskFact!.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    check("PATCH /api/universe-facts retires (deactivates) the fact over HTTP", retire.ok, String(retire.status));
    const canon3 = await canonHealthData(projectId);
    check("the retired fact leaves the suggestion list", canon3.suggestions.length === 0, `suggestions=${canon3.suggestions.length}`);

    // ── 4. creator-authored variations: save, land by id and name, run ──
    const ep = (await listTemplateEpisodes(projectId))[0];
    const badSave = await savePlanTemplate(projectId, { name: "Broken", summary: "x", steps: [{ tool: "not_a_tool", args: {}, why: "" }] });
    check("saving a variation with an unknown tool is refused", !badSave.ok, badSave.error ?? "");
    const savedVar = await savePlanTemplate(projectId, {
      baseId: "beat-breakdown",
      name: "Two-shot beat breakdown",
      summary: "A leaner beat: one establishing frame and one reaction closeup, then a capability check.",
      cadenceHint: "nightly - two shots per fire",
      steps: [
        { tool: "get_production_context", args: {}, why: "load the production state" },
        { tool: "create_scene", args: { episodeNumber: "{episode}", title: "{title} - the lean beat" }, why: "open the beat's scene" },
        { tool: "create_shot", args: { shotType: "ESTABLISHING", movement: "CRANE", duration: 5 }, why: "geography shot" },
        { tool: "create_shot", args: { shotType: "CLOSEUP", movement: "STATIC", duration: 3 }, why: "reaction shot" },
        { tool: "check_capabilities", args: {}, why: "what the beat still lacks" },
      ],
    });
    check("the variation saves with PROJECT scope + usage 0", savedVar.ok && savedVar.template!.scope === "PROJECT" && savedVar.template!.usageCount === 0 && savedVar.template!.stepCount === 5, savedVar.ok ? savedVar.template!.name : savedVar.error!);
    const listed = await listPlanTemplates(projectId);
    check("the variation lists for the production", listed.length === 1 && listed[0].baseId === "beat-breakdown", `saved=${listed.length}`);

    const badLand = await instantiateEpisodePlan(projectId, ep.episodeId, "no-such-template");
    check("landing an unknown template names built-ins and variations", !badLand.ok && badLand.error!.includes("saved variation"), badLand.error ?? "");
    const landedById = await instantiateEpisodePlan(projectId, ep.episodeId, savedVar.template!.id);
    check("landing by id creates the PROPOSED plan", landedById.ok && landedById.planTitle === "E01 - Two-shot beat breakdown", landedById.planTitle ?? landedById.error ?? "");
    const landedPlan = await db.dshPlan.findFirst({ where: { projectId, title: "E01 - Two-shot beat breakdown" } });
    const planSteps = JSON.parse(landedPlan!.steps) as Array<{ tool: string; args: Record<string, unknown> }>;
    check("the tokens resolved to the REAL episode numbers at landing", String(planSteps[1].args.episodeNumber) === "1" && String(planSteps[1].args.title).includes("Embers"), JSON.stringify(planSteps[1].args));
    const dupLand = await instantiateEpisodePlan(projectId, ep.episodeId, savedVar.template!.id);
    check("a second landing while the plan is live is refused", !dupLand.ok && dupLand.error!.includes("already proposed"), dupLand.error ?? "");

    // approve + run one step for real: the landed plan is a living plan
    await db.dshPlan.update({ where: { id: landedPlan!.id }, data: { status: "ACTIVE" } });
    const runResult = await executeTool(projectId, "run_plan", { maxSteps: 2 });
    check("the landed variation plan REALLY runs its first steps", runResult.status === "OK" && runResult.result.includes("2/5"), runResult.result.split("\n")[0]?.slice(0, 120) ?? "");
    const sceneCount = await db.scene.count({ where: { episode: { season: { projectId } } } });
    check("the run really created the beat scene in the DB", sceneCount === 2, `scenes=${sceneCount}`);

    const byName = await savePlanTemplate(projectId, {
      baseId: "canon-audit", name: "Weekend audit", summary: "audit variant", scope: "STUDIO",
      steps: [{ tool: "check_universe_facts", args: {}, why: "audit the hero panel" }],
    });
    check("a STUDIO-scope variation saves with projectId null", byName.ok && byName.template!.scope === "STUDIO" && byName.template!.projectId === null, byName.ok ? byName.template!.scope : byName.error!);
    const listedAfterStudio = await listPlanTemplates(projectId);
    check("the studio-library variation lists on this production too", listedAfterStudio.length === 2, `saved=${listedAfterStudio.length}`);
    const usage = await db.planTemplate.findUnique({ where: { id: savedVar.template!.id } });
    check("landing the variation bumped its usage count", usage!.usageCount === 1 && usage!.lastUsedAt !== null, `usage=${usage!.usageCount}`);

    const del = await deletePlanTemplate(byName.template!.id);
    check("the studio variation deletes cleanly", del.ok && (await listPlanTemplates(projectId)).length === 1, "deleted");

    // ── 5. the daily digest: scheduler kind, API, DSH tool ──
    const digestSched = await createSchedule(projectId, { name: "Nightly digest", kind: "DAILY_DIGEST", cadence: "DAILY", hourUtc: 2 });
    check("the DAILY_DIGEST schedule registers", digestSched.ok, digestSched.ok ? digestSched.schedule.cadenceLabel : digestSched.error ?? "");
    const fire = await fireScheduleNow(digestSched.schedule!.id);
    check("the digest fire posts the message and reports OK", fire.ok && fire.status === "OK" && (fire.report ?? "").includes("posted the digest to the creator"), fire.report ?? fire.error ?? "");
    const digests = await listDigests(projectId);
    check("the digest landed as a DIGEST production event", digests.length === 1 && digests[0].text.includes("Renders:") && digests[0].text.includes("Canon:") && digests[0].text.includes("Identity drift:"), digests[0].headline.slice(0, 90));
    const post2 = await postDailyDigest(projectId);
    check("a manual post lands a second digest (history grows)", post2.ok && (await listDigests(projectId)).length === 2, `digests=${(await listDigests(projectId)).length}`);

    const digestApi = await fetch(`http://127.0.0.1:3000/api/digest?projectId=${projectId}`);
    const digestApiBody = (await digestApi.json()) as { digests?: unknown[] };
    check("GET /api/digest serves the history over HTTP", digestApi.status === 200 && (digestApiBody.digests?.length ?? 0) === 2, `${digestApi.status}`);
    const postApi = await fetch("http://127.0.0.1:3000/api/digest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    check("POST /api/digest posts over HTTP", postApi.status === 201, String(postApi.status));

    const dshDigest = await executeTool(projectId, "post_digest", {});
    check("the DSH post_digest tool posts and reads back", dshDigest.status === "OK" && dshDigest.result.includes("Digest posted") && dshDigest.result.includes("Queue now:"), dshDigest.result.split("\n")[0]?.slice(0, 100) ?? "");

    // ── 6. the pulse + context carry every new line ──
    const pulse = await executeTool(projectId, "studio_pulse", {});
    check("the pulse names the drift curve watch", pulse.status === "OK" && pulse.result.includes("DRIFT CURVES: Lin Yue -20% over 2 panel(s) declining"), pulse.result.split("\n")[4]?.slice(0, 120) ?? "");
    const ctx = await buildCompactContext(projectId) as unknown as {
      identityDrift?: string; latestDigest?: string; planTemplates?: string; canonRetire?: string[] | null;
    };
    check("the context carries the drift headline", Boolean(ctx.identityDrift) && ctx.identityDrift!.includes("DECLINING"), ctx.identityDrift?.slice(0, 100));
    check("the context carries the latest digest", Boolean(ctx.latestDigest) && ctx.latestDigest!.includes("last 24h"), ctx.latestDigest?.slice(0, 90));
    check("the context planTemplates line lists the variation", Boolean(ctx.planTemplates) && ctx.planTemplates!.includes("Two-shot beat breakdown") && ctx.planTemplates!.includes("1 creator-authored variation(s)"), ctx.planTemplates?.slice(0, 140));
    check("the context canonRetire line cleared after the retire", ctx.canonRetire === null || ctx.canonRetire === undefined, String(ctx.canonRetire));
  } finally {
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of [...new Set(createdFiles)]) {
      try { fs.rmSync(f, { force: true }); } catch { /* already gone */ }
    }
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

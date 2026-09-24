// E2E: per-provider latency/cost readout on queue cards, per-episode
// plan templates, identity-similarity scoring for panels.
// Steps:
//   plan - pure checks: the telemetry lib (span close/merge, takeover
//          trail, hosted-only credit math, describe, ledger
//          aggregation), the episode template library (all steps
//          validate against the registry, numbers resolve), identity
//          verdict parsing (clamp, unknown names, missing-cast zero,
//          aspects filter, worst), the 44-tool registry, doctrine
//          rule 21 + intro, routes + UI on disk.
//   tool - live pipeline: fixture project with two characters; model
//          sheets + panel art (the image provider is attempted for
//          real first and, while it is rate-limited, the harness
//          synthesizes REAL PNGs on the same disk paths and stamps
//          the same DB fields - the provider loop itself was proven
//          live in iters 29-31); identity scoring runs the REAL
//          scoreShotIdentity path end to end with the vision SDK
//          module mocked in-process (the live vision loop was proven
//          in iters 29/30 and the provider is 429 today): verdicts
//          persist per shot, IDENTITY_VERIFIED vs IDENTITY_DRIFT
//          events split on the threshold, the panel data ranks
//          worst-first, the API surface, the batch path and DSH
//          score_panel_identity (targeted + default-worst + batch +
//          refusals); per-episode templates (catalog, instantiate,
//          duplicate refusal, DSH land_episode_plan, approve + run
//          REALLY creating the beat scene/shots, bad template
//          refusal); a REAL MOTION render completed with telemetry
//          (spans, credits, describe, ledger, API round trip);
//          context lines.
import { mock } from "bun:test";
import { executeTool, TOOL_DEFS, buildCompactContext } from "@/lib/dsh/tools";
import {
  parseTelemetry, closeSpan, takeoverSpan, estimateCredits,
  describeTelemetry, formatSeconds, providerLedger, PROVIDER_RATES,
} from "@/lib/engine/telemetry";
import { buildEpisodeTemplates, listTemplateEpisodes, instantiateEpisodePlan, EPISODE_TEMPLATE_IDS } from "@/lib/dsh/plan-templates";
import { validatePlanSteps } from "@/lib/dsh/plans";
import { parseIdentityVerdict, scoreShotIdentity, scoreProjectIdentity, identityPanelData, IDENTITY_REPAINT_THRESHOLD } from "@/lib/identity";
import { createRenderJob, tickRenderJob } from "@/lib/engine/render";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// ── in-process vision SDK mock ──
// The identity scoring pipeline (loading, guards, prompt build,
// parsing, persistence, events, queueing) runs FOR REAL; only the
// HTTP layer of z-ai-web-dev-sdk is replaced. The queue feeds one
// raw verdict per expected vision call so the drift/verified sides
// of the threshold are both deterministic.
const RAW_LIN_VERIFIED = JSON.stringify({
  note: "the panel reads close to the canonical sheet",
  characters: [{ name: "Lin Yue", similarity: 0.83, aspects: { face: 0.9, hair: 0.85, weapon: 0.8 }, note: "hair and blade match" }],
});
const RAW_XIAO_DRIFT = JSON.stringify({
  note: "the rival's robe lost its rank sash",
  characters: [{ name: "Xiao Chen", similarity: 0.41, aspects: { face: 0.7, wardrobe: 0.2 }, note: "wardrobe drifted" }],
});
const visionState = { queue: [] as string[], lastPrompt: "" };
mock.module("z-ai-web-dev-sdk", () => ({
  default: {
    create: async () => ({
      chat: {
        completions: {
          createVision: async (call: { messages: Array<{ content: Array<{ type: string; text?: string }> }> }) => {
            visionState.lastPrompt = call.messages?.[0]?.content?.find((c) => c.type === "text")?.text ?? "";
            return { choices: [{ message: { content: visionState.queue.shift() ?? RAW_LIN_VERIFIED } }] };
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Synthesize a REAL PNG on disk with ffmpeg (the image provider's artifact slot). */
function synthesizePng(file: string, size: string, color: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  execSync(`ffmpeg -y -loglevel error -f lavfi -i color=c=${color}:s=${size} -frames:v 1 "${file}"`);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`ffmpeg did not write ${file}`);
}

// ─────────────────────────────────────────────────────────────
if (step === "plan") {
  // ── telemetry lib ──
  check("parseTelemetry rejects garbage and null", parseTelemetry(null) === null && parseTelemetry("not json") === null && parseTelemetry("{\"spans\":42}") === null, "defensive");
  const first = closeSpan(null, "MOTION", new Date(Date.now() - 5000), new Date(), "built-in ffmpeg");
  check("closeSpan records one span with latency", first.spans.length === 1 && first.spans[0].provider === "MOTION" && first.spans[0].ms >= 4900 && first.spans[0].note === "built-in ffmpeg", describeTelemetry(first));
  const extended = closeSpan(JSON.stringify(first), "MOTION", new Date(Date.now() - 2000), new Date());
  check("closeSpan extends a same-provider span instead of stacking", extended.spans.length === 1 && extended.spans[0].ms >= first.spans[0].ms + 1900, `${extended.spans[0].ms}ms`);
  const chain = takeoverSpan(JSON.stringify(extended), "IMG2VID", new Date(Date.now() - 9000), "Img2Vid provider lost -> MOTION engine took over");
  const chainParsed = parseTelemetry(chain)!;
  check("takeoverSpan closes the old provider and keeps the trail", chainParsed.spans.length === 2 && chainParsed.spans[0].provider === "MOTION" && chainParsed.spans[1].provider === "IMG2VID" && chainParsed.takeovers.length === 1, chainParsed.takeovers.join("|"));
  const billed = estimateCredits(chainParsed, 17);
  check("only hosted spans bill: IMG2VID 2 credits/sec over a 17s clip", billed === 34 && chainParsed.credits === 0, `credits=${billed}`);
  check("local engines bill zero credits", PROVIDER_RATES["MOTION"].creditsPerClipSecond === 0 && PROVIDER_RATES["BLENDER_LOCAL"].creditsPerClipSecond === 0 && estimateCredits({ spans: [{ provider: "MOTION", ms: 100 }], takeovers: [], totalMs: 100, credits: 0 }, 30) === 0, "rate table");
  const finished = { ...chainParsed, credits: estimateCredits(chainParsed, 17) };
  check("describeTelemetry reads the chain left to right with credits", describeTelemetry(finished).includes("MOTION") && describeTelemetry(finished).includes("IMG2VID") && describeTelemetry(finished).includes("34 credits"), describeTelemetry(finished));
  check("formatSeconds renders sub-second and second ranges", formatSeconds(400) === "400ms" && formatSeconds(48200) === "48.2s", `${formatSeconds(400)}/${formatSeconds(48200)}`);
  const ledger = providerLedger([finished, parseTelemetry(JSON.stringify(first)), null]);
  const motionRow = ledger.find((r) => r.provider === "MOTION");
  const img2vidRow = ledger.find((r) => r.provider === "IMG2VID");
  check("providerLedger aggregates jobs/latency per provider", Boolean(motionRow && motionRow.jobs === 2 && img2vidRow && img2vidRow.jobs === 1), ledger.map((r) => `${r.provider}:${r.jobs}`).join(","));
  check("credits attribute to the job's final provider", motionRow?.credits === 0 && img2vidRow?.credits === 34, `motion=${motionRow?.credits} img2vid=${img2vidRow?.credits}`);

  // ── episode templates ──
  const ep = { episodeId: "fake", seasonNumber: 1, number: 2, title: "Embers", sceneCount: 3, shotCount: 9 };
  const templates = buildEpisodeTemplates(ep);
  check("four per-episode templates build", templates.length === 4 && templates.map((t) => t.id).join() === EPISODE_TEMPLATE_IDS.join(), templates.map((t) => t.id).join(","));
  check("every template validates against the live registry", templates.every((t) => t.steps.length > 0 && t.steps.length <= 12 && validatePlanSteps(t.steps).ok), templates.map((t) => `${t.id}:${t.steps.length}`).join(","));
  const breakdown = templates.find((t) => t.id === "beat-breakdown")!;
  check("the breakdown targets the episode's number", breakdown.steps.some((s) => s.tool === "create_scene" && s.args.episodeNumber === 2), JSON.stringify(breakdown.steps.find((s) => s.tool === "create_scene")?.args).slice(0, 80));
  check("shots after create_scene omit sceneNumber (latest-scene default)", breakdown.steps.filter((s) => s.tool === "create_shot").every((s) => s.args.sceneNumber === undefined), "3 shots");
  const panelPass = templates.find((t) => t.id === "panel-pass")!;
  check("the panel pass resolves the latest scene number (3)", panelPass.steps.filter((s) => s.tool === "generate_panel_art").every((s) => s.args.sceneNumber === 3), "scene 3");
  check("every template step carries a why", templates.every((t) => t.steps.every((s) => typeof s.why === "string" && s.why.length > 3)), "whys");

  // ── identity verdict parsing ──
  const good = parseIdentityVerdict(
    'noise {"note":"close match","characters":[{"name":"Lin Yue","similarity":0.91,"aspects":{"face":0.95,"weapon":0.88,"palette":3},"note":"hair matches"}]} noise',
    ["Lin Yue", "Xiao Chen"],
  )!;
  check("parseIdentityVerdict clamps scores and filters aspects", good.entries[0].similarity === 0.91 && good.entries[0].aspects.face === 0.95 && good.entries[0].aspects.palette === 1 && good.entries[0].aspects.hair === undefined, JSON.stringify(good.entries[0].aspects));
  check("a cast member the model skipped scores 0 with a note", good.entries[1].characterName === "Xiao Chen" && good.entries[1].similarity === 0 && good.entries[1].note.includes("not detected"), good.entries[1].note.slice(0, 50));
  check("worst is the minimum across the panel's cast", good.worst === 0, String(good.worst));
  const clamped = parseIdentityVerdict('{"characters":[{"name":"Lin Yue","similarity":1.7}]}', ["Lin Yue"])!;
  check("out-of-range similarities clamp to 1", clamped.entries[0].similarity === 1 && clamped.worst === 1, String(clamped.worst));
  check("unparsable verdicts return null", parseIdentityVerdict("no json here", ["Lin Yue"]) === null, "null");
  check("an empty cast returns null", parseIdentityVerdict('{"characters":[]}', []) === null, "null");

  // ── registry + doctrine ──
  check("the registry grew to 44 tools", TOOL_DEFS.length === 44, String(TOOL_DEFS.length));
  check("land_episode_plan + score_panel_identity are registered", ["land_episode_plan", "score_panel_identity"].every((n) => TOOL_DEFS.some((t) => t.name === n)), "tool defs");
  const promptsSrc = fs.readFileSync(path.join(process.cwd(), "src", "lib", "dsh", "prompts.ts"), "utf-8");
  check("doctrine rule 21 teaches templates + identity drift", promptsSrc.includes("PER-EPISODE TEMPLATES AND IDENTITY DRIFT") && promptsSrc.includes("land_episode_plan") && promptsSrc.includes("score_panel_identity"), "rule 21");
  check("the intro names templates and the identity score", promptsSrc.includes("Per-episode work starts from a TEMPLATE") && promptsSrc.includes("Panels also carry an IDENTITY SCORE"), "intro");

  // ── routes + UI on disk ──
  check("route exists: src/app/api/plan-templates/route.ts", fs.existsSync(path.join(process.cwd(), "src", "app", "api", "plan-templates", "route.ts")), "on disk");
  check("route exists: src/app/api/identity/route.ts", fs.existsSync(path.join(process.cwd(), "src", "app", "api", "identity", "route.ts")), "on disk");
  const renderSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "render-view.tsx"), "utf-8");
  check("queue cards carry the per-provider readout + ledger strip", renderSrc.includes("Provider ledger") && renderSrc.includes("parseTelemetry") && renderSrc.includes("credits"), "render view");
  const consoleSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "dsh-console.tsx"), "utf-8");
  check("the plans panel carries the templates section", consoleSrc.includes("Per-episode templates") && consoleSrc.includes("Land as plan"), "plans panel");
  const contSrc = fs.readFileSync(path.join(process.cwd(), "src", "components", "views", "continuity-view.tsx"), "utf-8");
  check("the continuity view mounts the identity panel", contSrc.includes("Identity similarity") && contSrc.includes("Re-paint + re-score") && contSrc.includes("IDENTITY_DRIFT"), "continuity view");
}

// ─────────────────────────────────────────────────────────────
if (step === "tool") {
  const proj = await db.project.create({
    data: {
      title: "Identity E2E",
      logline: "identity scoring + templates + telemetry",
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
    include: { seasons: { include: { episodes: { include: { scenes: { include: { shots: true } }, } } } }, characters: true },
  });
  const projectId = proj.id;
  const shot1 = proj.seasons[0].episodes[0].scenes[0].shots[0];
  const shot2 = proj.seasons[0].episodes[0].scenes[0].shots[1];
  const shot3 = proj.seasons[0].episodes[0].scenes[0].shots[2];
  const createdFiles: string[] = [];

  // provider-fallback helpers: try the REAL tool first; while the
  // image provider is rate-limited, synthesize a REAL PNG on the SAME
  // disk path and stamp the SAME DB fields the tool stamps
  async function ensureSheet(characterName: string, color: string) {
    const result = await executeTool(projectId, "generate_model_sheet", { characterName });
    const c = await db.character.findFirst({ where: { projectId, name: characterName } });
    if (!c) throw new Error(`character ${characterName} missing`);
    const disk = path.join(process.cwd(), "public", "sheets", `${c.id}.png`);
    if (!(c.modelSheetUrl && fs.existsSync(disk))) {
      synthesizePng(disk, "1024x1024", color);
      const now = new Date();
      await db.character.update({
        where: { id: c.id },
        data: { modelSheetUrl: `/sheets/${c.id}.png?v=${now.getTime()}`, modelSheetPrompt: `${characterName} canonical anchor (E2E)`, modelSheetAt: now },
      });
      return { real: false, character: await db.character.findUnique({ where: { id: c.id } })!, result };
    }
    return { real: result.status === "OK", character: c, result };
  }

  async function ensurePanel(shot: { id: string; number: number }, size: string, color: string) {
    const disk = path.join(process.cwd(), "public", "panels", `${shot.id}.png`);
    const before = await db.shot.findUnique({ where: { id: shot.id } });
    if (!(before?.artworkUrl && fs.existsSync(disk))) {
      const result = await executeTool(projectId, "generate_panel_art", { sceneNumber: 1, shotNumber: shot.number });
      const after = await db.shot.findUnique({ where: { id: shot.id } });
      if (!(after?.artworkUrl && fs.existsSync(disk))) {
        synthesizePng(disk, size, color);
        const now = new Date();
        await db.shot.update({ where: { id: shot.id }, data: { artworkUrl: `/panels/${shot.id}.png?v=${now.getTime()}`, artGeneratedAt: now } });
        return { real: false, shot: await db.shot.findUnique({ where: { id: shot.id } })!, result };
      }
      return { real: result.status === "OK", shot: after, result };
    }
    return { real: true, shot: before!, result: { status: "cached" } };
  }

  try {
    // ── 1. anchors + panels (real provider attempt, synth fallback) ──
    const sheetL = await ensureSheet("Lin Yue", "0x1b2a4a");
    check("Lin Yue's sheet + anchor persisted with the file on disk", Boolean(sheetL.character?.modelSheetUrl && sheetL.character.modelSheetPrompt && sheetL.character.modelSheetAt), `${sheetL.real ? "real" : "synth fallback"} ${sheetL.character?.modelSheetUrl}`);
    if (sheetL.character?.modelSheetUrl) createdFiles.push(path.join(process.cwd(), "public", sheetL.character.modelSheetUrl.split("?")[0].replace(/^\//, "")));
    const sheetX = await ensureSheet("Xiao Chen", "0x4a1b2a");
    check("Xiao Chen's sheet anchors the rival too", Boolean(sheetX.character?.modelSheetUrl && sheetX.character.modelSheetAt), `${sheetX.real ? "real" : "synth fallback"} ${sheetX.character?.modelSheetUrl}`);
    if (sheetX.character?.modelSheetUrl) createdFiles.push(path.join(process.cwd(), "public", sheetX.character.modelSheetUrl.split("?")[0].replace(/^\//, "")));

    const panel1 = await ensurePanel(shot1, "1152x864", "0x2a4a1b");
    check("shot 1 carries panel art on disk", Boolean(panel1.shot.artworkUrl && panel1.shot.artGeneratedAt), `${panel1.real ? "real" : "synth fallback"} ${panel1.shot.artworkUrl}`);
    if (panel1.shot.artworkUrl) createdFiles.push(path.join(process.cwd(), "public", panel1.shot.artworkUrl.split("?")[0].replace(/^\//, "")));
    const panel2 = await ensurePanel(shot2, "1152x864", "0x4a3a1b");
    check("shot 2 carries panel art on disk", Boolean(panel2.shot.artworkUrl && panel2.shot.artGeneratedAt), `${panel2.real ? "real" : "synth fallback"} ${panel2.shot.artworkUrl}`);
    if (panel2.shot.artworkUrl) createdFiles.push(path.join(process.cwd(), "public", panel2.shot.artworkUrl.split("?")[0].replace(/^\//, "")));

    // ── 2. identity scoring (REAL pipeline, vision SDK mocked in-process) ──
    visionState.queue.push(RAW_LIN_VERIFIED);
    const scored = await scoreShotIdentity(shot1.id);
    check("scoreShotIdentity returns a verdict through the real pipeline", scored.ok && scored.scored.verdict.entries.length === 1 && scored.scored.verdict.entries[0].characterName === "Lin Yue", scored.ok ? `worst ${scored.scored.verdict.worst.toFixed(2)}` : (scored as { error: string }).error);
    check("the real prompt builder ran (manifest + strict JSON contract)", visionState.lastPrompt.includes("canonical model sheet for Lin Yue") && visionState.lastPrompt.includes("STRICT JSON"), visionState.lastPrompt.slice(0, 70));
    if (scored.ok) {
      const sim = scored.scored.verdict.entries[0].similarity;
      check("the similarity rides the verified side of the threshold", sim === 0.83 && sim >= IDENTITY_REPAINT_THRESHOLD, String(sim));
      const row = await db.identityScore.findUnique({ where: { shotId: shot1.id } });
      check("the IdentityScore row persists per shot", Boolean(row) && row!.castSize === 1 && row!.scores.includes("Lin Yue"), row ? `worst ${row.worst.toFixed(2)}` : "missing");
      const ev = await db.continuityEvent.findFirst({ where: { projectId, kind: "IDENTITY_VERIFIED", description: { startsWith: "[identity E1 Sc1 S001]" } } });
      check("the verdict lands as IDENTITY_VERIFIED with the shot tag", Boolean(ev) && (ev?.severity === "INFO"), ev?.description.slice(0, 90) ?? "missing");
    }

    // re-scoring replaces the row, not stacks it
    visionState.queue.push(RAW_LIN_VERIFIED);
    const rescored = await scoreShotIdentity(shot1.id);
    const rowCount = await db.identityScore.count({ where: { shotId: shot1.id } });
    check("re-scoring replaces the panel's row (upsert)", rescored.ok && rowCount === 1, `rows=${rowCount}`);

    // the drift side: a low verdict on shot 2
    visionState.queue.push(RAW_XIAO_DRIFT);
    const drifted = await scoreShotIdentity(shot2.id);
    check("shot 2 scores below the bar", drifted.ok && drifted.scored.verdict.worst === 0.41, drifted.ok ? `worst ${drifted.scored.verdict.worst.toFixed(2)}` : (drifted as { error: string }).error);
    const driftEv = await db.continuityEvent.findFirst({ where: { projectId, kind: "IDENTITY_DRIFT", description: { startsWith: "[identity E1 Sc1 S002]" } } });
    check("the drift verdict lands as IDENTITY_DRIFT WARNING", Boolean(driftEv) && driftEv?.severity === "WARNING", driftEv?.description.slice(0, 90) ?? "missing");

    // a shot without art refuses cleanly
    const noArt = await scoreShotIdentity(shot3.id);
    check("scoring a panel without art is refused", !noArt.ok && (noArt as { error: string }).error.includes("no panel art"), (noArt as { error: string }).error.slice(0, 70));

    // ── 3. the identity panel data + API surface ──
    const panelData = await identityPanelData(projectId);
    check("identityPanelData ranks scored panels worst-first", panelData.rows.length === 2 && panelData.rows[0].ref.includes("S002") && panelData.rows[1].ref.includes("S001"), panelData.rows.map((r) => `${r.ref}:${r.worst?.toFixed(2)}`).join(","));
    check("the drift queue carries exactly the below-bar panel", panelData.queue.length === 1 && panelData.queue[0].ref.includes("S002") && panelData.queue[0].worst === 0.41, panelData.queue.map((q) => q.ref).join(","));
    check("the average readout aggregates the worst scores", panelData.average !== null && Math.abs(panelData.average - 0.62) < 0.001, `avg=${panelData.average?.toFixed(3)}`);

    const apiGet = await fetch(`http://127.0.0.1:3000/api/identity?projectId=${projectId}`);
    const apiBody = (await apiGet.json()) as { rows?: unknown[]; threshold?: number };
    check("GET /api/identity serves the panel feed", apiGet.status === 200 && (apiBody.rows?.length ?? 0) === 2 && apiBody.threshold === IDENTITY_REPAINT_THRESHOLD, `${apiGet.status} rows=${apiBody.rows?.length}`);

    // POST success is the thin route wrapper over the (in-process
    // proven) scoreShotIdentity; the dev server process cannot see the
    // in-process vision mock, so assert the deterministic refusal path
    // over HTTP and keep the scoring proof in-process
    const apiNoArt = await fetch("http://127.0.0.1:3000/api/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shotId: shot3.id }),
    });
    const noArtBody = (await apiNoArt.json()) as { error?: string };
    check("POST /api/identity refuses art-less panels over HTTP", apiNoArt.status === 400 && (noArtBody.error ?? "").includes("no panel art"), noArtBody.error?.slice(0, 60));

    // batch path: worst existing first (S002), then S001
    visionState.queue.push(RAW_XIAO_DRIFT, RAW_LIN_VERIFIED);
    const batch = await scoreProjectIdentity(projectId, 4);
    check("the batch scores candidates worst-first", batch.scored.length === 2 && batch.errors.length === 0 && batch.scored[0].ref.includes("S002"), `scored=${batch.scored.length} skipped=${batch.errors.length} ${batch.errors[0]?.ref ?? ""}`);

    // ── 4. DSH score_panel_identity: targeted, default-worst, batch, refusals ──
    visionState.queue.push(RAW_LIN_VERIFIED);
    const targeted = await executeTool(projectId, "score_panel_identity", { sceneNumber: 1, shotNumber: 1 });
    check("DSH scores a targeted panel with numbers", targeted.status === "OK" && targeted.result.includes("Identity score for E1 Sc1 S001") && targeted.result.includes("Lin Yue 83%"), targeted.result.slice(0, 110));
    visionState.queue.push(RAW_XIAO_DRIFT);
    const defaultWorst = await executeTool(projectId, "score_panel_identity", {});
    check("DSH with no args scores the worst already-scored panel", defaultWorst.status === "OK" && defaultWorst.result.includes("E1 Sc1 S002") && defaultWorst.result.includes("re-paint offer"), defaultWorst.result.slice(0, 120));
    visionState.queue.push(RAW_XIAO_DRIFT, RAW_LIN_VERIFIED);
    const batchDsh = await executeTool(projectId, "score_panel_identity", { limit: 2 });
    check("DSH batch mode reports the pass", batchDsh.status === "OK" && batchDsh.result.includes("Identity pass scored 2 panel(s)"), batchDsh.result.slice(0, 90));
    const dshNoArt = await executeTool(projectId, "score_panel_identity", { sceneNumber: 1, shotNumber: 3 });
    check("DSH refuses art-less panels", dshNoArt.status === "ERROR" && dshNoArt.result.includes("no panel art"), dshNoArt.result.slice(0, 80));

    // ── 5. per-episode templates: catalog, instantiate, duplicate, run ──
    const episodes = await listTemplateEpisodes(projectId);
    check("the catalog resolves the fixture episode with counts", episodes.length === 1 && episodes[0].number === 1 && episodes[0].sceneCount === 1 && episodes[0].shotCount === 3, JSON.stringify(episodes[0] ?? {}).slice(0, 80));

    const apiCatalog = await fetch(`http://127.0.0.1:3000/api/plan-templates?projectId=${projectId}`);
    const catalogBody = (await apiCatalog.json()) as { episodes?: Array<{ templates?: unknown[] }> };
    check("GET /api/plan-templates serves 4 template cards per episode", apiCatalog.status === 200 && catalogBody.episodes?.[0]?.templates?.length === 4, `${apiCatalog.status}`);

    const instantiate = await instantiateEpisodePlan(projectId, episodes[0].episodeId, "beat-breakdown");
    check("instantiating lands a PROPOSED plan titled for the episode", instantiate.ok && instantiate.planTitle === "E01 - Episode beat breakdown", instantiate.error ?? instantiate.planTitle ?? "");
    const landedPlan = await db.dshPlan.findFirst({ where: { projectId, title: "E01 - Episode beat breakdown" } });
    const landedSteps = landedPlan ? (JSON.parse(landedPlan.steps) as Array<{ tool: string; args: Record<string, unknown> }>) : [];
    check("the landed plan carries 6 concrete steps", landedPlan?.status === "PROPOSED" && landedPlan.source === "CREATOR" && landedSteps.length === 6, landedPlan ? `${landedPlan.status} ${landedSteps.length}` : "missing");
    check("the create_scene step pinned episode 1", landedSteps[1]?.tool === "create_scene" && landedSteps[1].args.episodeNumber === 1, JSON.stringify(landedSteps[1]?.args ?? {}).slice(0, 60));

    const duplicate = await instantiateEpisodePlan(projectId, episodes[0].episodeId, "beat-breakdown");
    check("a duplicate live template landing is refused", !duplicate.ok && (duplicate.error ?? "").includes("already proposed"), duplicate.error?.slice(0, 80));

    // approve + run: the steps REALLY build the beat
    const approved = await db.dshPlan.update({ where: { id: landedPlan!.id }, data: { status: "ACTIVE" } });
    check("the creator approves the template plan", approved.status === "ACTIVE", approved.status);
    const runA = await executeTool(projectId, "run_plan", { planId: landedPlan!.id, maxSteps: 3 });
    check("run 3 executes context + scene + first shot", runA.status === "OK" && runA.result.includes("[OK] step 1/6") && runA.result.includes("[OK] step 2/6") && runA.result.includes("[OK] step 3/6"), runA.result.split("\n")[1]?.slice(0, 110) ?? runA.result.slice(0, 110));
    const sceneCount = await db.scene.count({ where: { episode: { season: { projectId } } } });
    check("the beat scene REALLY exists (scene 2 in E1)", sceneCount === 2, `scenes=${sceneCount}`);
    const runB = await executeTool(projectId, "run_plan", { planId: landedPlan!.id, maxSteps: 3 });
    check("the remaining 3 steps run to DONE", runB.status === "OK" && runB.result.includes("[OK] step 6/6") && runB.result.includes("DONE"), runB.result.split("\n").pop()?.slice(0, 110) ?? "");
    const newShots = await db.shot.findMany({ where: { scene: { number: 2, episode: { season: { projectId } } } }, orderBy: { number: "asc" } });
    check("the three-shot breakdown REALLY landed in scene 2 with poses", newShots.length === 3 && newShots[0].shotType === "ESTABLISHING" && newShots[2].shotType === "CLOSEUP" && Boolean(newShots[0].poseStart), newShots.map((s) => `${s.number}:${s.shotType}`).join(","));
    const capStep = (await db.dshPlan.findUnique({ where: { id: landedPlan!.id } }));
    const capResult = capStep ? (JSON.parse(capStep.steps) as Array<{ tool: string; result?: string }>)[5] : null;
    check("the capability check ran on the fresh beat", capResult?.tool === "check_capabilities" && typeof capResult.result === "string", capResult?.result?.slice(0, 60) ?? "missing");

    // DSH lands another template + refuses an unknown one
    const dshTemplate = await executeTool(projectId, "land_episode_plan", { episodeNumber: 1, template: "canon-audit" });
    check("DSH lands the canon-audit template", dshTemplate.status === "OK" && dshTemplate.result.includes("E01 - Canon + continuity audit") && dshTemplate.result.includes("PROPOSED"), dshTemplate.result.slice(0, 100));
    const badTemplate = await executeTool(projectId, "land_episode_plan", { episodeNumber: 1, template: "jazz-hands" });
    check("an unknown template is refused with the catalog", badTemplate.status === "ERROR" && badTemplate.result.includes("beat-breakdown"), badTemplate.result.slice(0, 90));
    const apiTemplatePost = await fetch("http://127.0.0.1:3000/api/plan-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, episodeId: episodes[0].episodeId, templateId: "render-pass" }),
    });
    const templateBody = (await apiTemplatePost.json()) as { planTitle?: string; error?: string };
    check("POST /api/plan-templates lands the render pass", apiTemplatePost.status === 201 && templateBody.planTitle === "E01 - Preview render pass", templateBody.error ?? templateBody.planTitle ?? "");

    // ── 6. telemetry: a REAL MOTION render completes with a readout ──
    // shot 1 carries a panel but NO pose program, so it routes MOTION
    // (no Blender bridge, no img2vid without poses)
    const job = await createRenderJob(projectId, shot1.id, "PREVIEW");
    check("the render job queues", Boolean(job.id), job.id.slice(-6));
    let done = job;
    const deadline = Date.now() + 150_000;
    while (done.status === "RENDERING" && Date.now() < deadline) {
      await sleep(2000);
      done = (await tickRenderJob(done.id))!;
    }
    check("the MOTION render completed to REVIEW", done.status === "REVIEW" && Boolean(done.outputUrl), `${done.status} ${done.stage.slice(0, 60)}`);
    const tel = parseTelemetry(done.telemetry);
    check("telemetry recorded on completion: one MOTION span", Boolean(tel) && tel!.spans.length === 1 && tel!.spans[0].provider === "MOTION", describeTelemetry(tel!));
    check("local compute bills zero credits", tel!.credits === 0, `credits=${tel!.credits}`);
    check("the describe line reads as a latency readout", describeTelemetry(tel!).startsWith("MOTION ") && describeTelemetry(tel!).includes("built-in ffmpeg"), describeTelemetry(tel!));
    const ledgerRow = providerLedger([tel])[0];
    check("the ledger aggregates the finished job", ledgerRow.jobs === 1 && ledgerRow.avgMs >= 0 && ledgerRow.credits === 0, `${ledgerRow.provider} avg ${formatSeconds(ledgerRow.avgMs)}`);
    if (done.outputUrl) createdFiles.push(path.join(process.cwd(), "public", done.outputUrl.replace(/^\//, "").split("?")[0]));
    createdFiles.push(path.join(process.cwd(), "public", "renders", `${job.id}.png`));

    const jobsApi = await fetch(`http://127.0.0.1:3000/api/render-jobs?projectId=${projectId}`);
    const jobsBody = (await jobsApi.json()) as Array<{ id: string; telemetry: string | null }>;
    const apiJob = jobsBody.find((j) => j.id === job.id);
    check("GET /api/render-jobs carries the telemetry round trip", Boolean(apiJob?.telemetry) && parseTelemetry(apiJob!.telemetry)?.spans[0].provider === "MOTION", apiJob ? describeTelemetry(parseTelemetry(apiJob.telemetry)!) : "missing");

    // ── 7. the context carries identity + templates for the NEXT conversation ──
    const ctx = await buildCompactContext(projectId);
    const identityLines = (ctx?.identity ?? []) as string[];
    const ctxObj = ctx as unknown as { planTemplates?: string };
    check("the context lists the identity readout worst-first with DRIFT flagged", identityLines.length === 2 && identityLines[0].includes("S002") && identityLines[0].includes("DRIFT") && identityLines[1].includes("S001"), identityLines.join(" | ").slice(0, 130));
    check("the context names the per-episode templates", (ctxObj.planTemplates ?? "").includes("beat-breakdown") && (ctxObj.planTemplates ?? "").includes("canon-audit"), ctxObj.planTemplates?.slice(0, 90));
  } finally {
    await db.project.delete({ where: { id: projectId } }).catch(() => {});
    for (const f of createdFiles) {
      try { fs.rmSync(f, { force: true }); } catch { /* already gone */ }
    }
  }
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

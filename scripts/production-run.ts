// ─────────────────────────────────────────────────────────────
// FULL END-TO-END 1-MINUTE PRODUCTION RUN - "Cloudveil Ascent"
//
// Builds a complete donghua pilot episode through the REAL pipeline,
// no SDK mocks anywhere: authored cast + environments + universe
// facts, real model sheets, real panel art, real TTS voice takes,
// real headless Blender renders (serialized Cycles workers), real
// DSH inspections, a real exported episode cut, and delivery-spine
// publish staging.
//
// Phases (idempotent, resumable - safe to re-run):
//   setup   - project, cast, states, environments, fact, episode,
//             scenes, 12 shots (60s total), dialogue, cues, casting
//   sheets  - 3 character model sheets (real image gen)
//   panels  - 12 shot panel arts (real image gen)
//   voices  - render every VOICE cue (real TTS)
//   renders - serialized PREVIEW Blender renders + DSH inspection
//             (budget-aware: `renders <minutes>` caps wall time)
//   acoustics - persist the acoustic slot's alignment audit per take
//   identity  - vision-score every finished render against the sheets
//             (the shipping pixels, budget-aware)
//   assets  - DESIGN the library assets: every character + environment
//             becomes a versioned .blend (the v4.1 builder in the
//             studio's Blender runtime) + preview, vision-inspected
//             against the sheets - renders then load assets, not
//             procedural stand-ins
//   final   - one FINAL-mode Blender render (the money shot)
//   finalall - FINAL-mode renders for EVERY shot (budget-aware,
//             resumable: re-run until the count lands)
//   cut     - export the episode cut + verify duration
//   publish - stage platform packages on the delivery spine
//             (each staging now writes its hand-off folder)
//   verify  - full DB + file + duration + quality report
// ─────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { executeTool } from "@/lib/dsh/tools";
import { generateCharacterModelSheet, generateShotPanelArt } from "@/lib/ai/art";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { createRenderJob, tickRenderJob } from "@/lib/engine/render";
import { runRenderEvaluation } from "@/lib/dsh/evaluator";
import { buildEpisodeCut } from "@/lib/comic/cut";
import { auditVoiceTakeAcoustics } from "@/lib/animation/acoustic";
import { scoreRenderIdentity } from "@/lib/identity";
import { buildBlenderAsset, inspectBlenderAsset } from "@/lib/blender/assets";

const db = new PrismaClient();
const TITLE = "Cloudveil Ascent";

const log = (m: string) => console.log(`[production] ${m}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(projectId: string, name: string, args: Record<string, unknown>) {
  const out = await executeTool(projectId, name, args);
  return out;
}

// ── shared lookups ──
async function project() {
  const p = await db.project.findFirst({ where: { title: TITLE } });
  if (!p) throw new Error(`Project '${TITLE}' not found - run setup first`);
  return p;
}
async function episode() {
  const p = await project();
  const ep = await db.episode.findFirst({
    where: { season: { projectId: p.id }, number: 1 },
    include: { season: true },
  });
  if (!ep) throw new Error("Episode 1 not found - run setup first");
  return ep;
}
async function allShots() {
  const ep = await episode();
  return db.shot.findMany({
    where: { scene: { episodeId: ep.id } },
    orderBy: [{ scene: { number: "asc" } }, { number: "asc" }],
    include: { scene: true, audioCues: true },
  });
}
const totalDuration = (shots: Array<{ duration: number }>) =>
  shots.reduce((a, s) => a + s.duration, 0);

// ─────────────────────────────────────────────────────────────
// PHASE: setup
// ─────────────────────────────────────────────────────────────
async function phaseSetup() {
  let p = await db.project.findFirst({ where: { title: TITLE } });
  if (p) {
    log(`project exists: ${p.id}`);
  } else {
    const out = await run("", "create_project", {
      title: TITLE,
      logline: "A gutter-born sword novices ascent up Cloudveil Peak awakens a blade that drinks the storm itself.",
      format: "SERIES",
      animationType: "3D",
      visualStyle: "DONGHUA",
      subtitleLanguages: "en-US,zh-CN",
    });
    log(out.result);
    p = await db.project.findFirst({ where: { title: TITLE } });
    if (!p) throw new Error("project creation failed");
  }
  const pid = p.id;

  // ── cast ──
  const castSpec = [
    { name: "Yun Shu", role: "PROTAGONIST", age: "17", personality: "Stubborn, earnest, carries guilt like a whetstone", appearance: "Lean youth, wind-tossed black hair tied with a jade cord, jade-teal disciple robes, storm-grey eyes, a faint scar across the left knuckle" },
    { name: "Master Heiyan", role: "MENTOR", age: "63", personality: "Dry humor, speaks in weather metaphors, mourns the old sects", appearance: "Elder with iron-grey topknot, deep storm-grey traveling robes, bamboo pipe, clouded left eye, rope-soled sandals" },
    { name: "Xue Lian", role: "RIVAL", age: "18", personality: "Precise, proud, secretly protective of her junior rival", appearance: "Tall young swordswoman, ink-black braid with a crimson sash, frost-white dueling robes, pale almond eyes, mirrored hairpins" },
  ];
  for (const c of castSpec) {
    const existing = await db.character.findFirst({ where: { projectId: pid, name: c.name } });
    if (existing) { log(`character exists: ${c.name}`); continue; }
    const out = await run(pid, "create_character", c);
    log(`create_character ${c.name}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── development states (drive the model-sheet visual anchor) ──
  const stateSpec = [
    { characterName: "Yun Shu", label: "E01 - Outer Gate Disciple", episodeNumber: 1, stateType: "PERMANENT", cultivation: "Body Tempering, third gate", weapon: "Cloudveil spirit blade, plain iron scabbard, glows cyan when spirit energy channels", clothing: "Jade-teal disciple robes with storm-grey sash, straw sandals, jade hair cord" },
    { characterName: "Master Heiyan", label: "E01 - Watcher of the Terrace", episodeNumber: 1, stateType: "PERMANENT", cultivation: "Spirit Severing, sealed meridians", weapon: "Bamboo pipe and an unsharpened practice sword", clothing: "Deep storm-grey traveling robes, rope-soled sandals, faded sect ring" },
    { characterName: "Xue Lian", label: "E01 - Frost Hall Champion", episodeNumber: 1, stateType: "PERMANENT", cultivation: "Inner Court, frost meridians", weapon: "Mirrored frost saber with crimson tassel", clothing: "Frost-white dueling robes, crimson sash, mirrored hairpins" },
  ];
  for (const s of stateSpec) {
    const ch = await db.character.findFirst({ where: { projectId: pid, name: s.characterName } });
    if (!ch) throw new Error(`character missing: ${s.characterName}`);
    const existing = await db.characterState.findFirst({ where: { characterId: ch.id, label: s.label } });
    if (existing) { log(`state exists: ${s.characterName} / ${s.label}`); continue; }
    const out = await run(pid, "create_character_state", s);
    log(`create_character_state ${s.characterName}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── environments ──
  const envSpec = [
    { name: "Cloudveil Terrace", description: "A moonlit stone terrace carved into the shoulder of Cloudveil Peak, sea of clouds below, two moons overhead, weathered pillar stubs and a bronze bell, wind banners snapping" },
    { name: "Mistfall Gorge", description: "A dawn-lit bamboo gorge where waterfall mist hangs in shafts of light, mossy stepping stones across a shallow stream, sparrows startling in bursts" },
  ];
  for (const e of envSpec) {
    const existing = await db.environment.findFirst({ where: { projectId: pid, name: e.name } });
    if (existing) { log(`environment exists: ${e.name}`); continue; }
    const out = await run(pid, "create_environment", e);
    log(`create_environment ${e.name}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── universe facts (canon the art must obey) ──
  const factSpec = [
    { text: "The Cloudveil spirit blade glows cyan when spirit energy channels through it, and only then", category: "PROP" },
    { text: "Two moons hang over Cloudveil Peak on clear nights, one large jade-white and one small copper-red", category: "WORLD" },
  ];
  for (const f of factSpec) {
    const existing = await db.universeFact.findFirst({ where: { projectId: pid, text: f.text } });
    if (existing) { log(`fact exists: ${f.text.slice(0, 40)}...`); continue; }
    const out = await run(pid, "add_universe_fact", f);
    log(`add_universe_fact: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── episode + scenes ──
  let ep = await db.episode.findFirst({ where: { season: { projectId: pid }, number: 1 } });
  if (ep) {
    log(`episode exists: ${ep.id}`);
  } else {
    const out = await run(pid, "create_episode", {
      seasonNumber: 1, number: 1, title: "The Blade Wakes",
      synopsis: "On the Cloudveil Terrace Master Heiyan tests Yun Shus breath-control; a dawn duel with Xue Lian in Mistfall Gorge breaks his stance apart; the blade finally wakes and drinks the storm.",
    });
    log(out.result);
    ep = await db.episode.findFirst({ where: { season: { projectId: pid }, number: 1 } });
    if (!ep) throw new Error("episode creation failed");
  }
  const eid = ep.id;

  const sceneSpec = [
    { number: 1, title: "Trial on the Terrace", environmentName: "Cloudveil Terrace", timeOfDay: "night", weather: "high wind", description: "Master Heiyan sets Yun Shu a breath-control trial under two moons: draw the blade without spilling the cup of spirit water balanced on its flat. Wind banners snap; the sea of clouds glows faintly below the terrace." },
    { number: 2, title: "Steel in the Mist", environmentName: "Mistfall Gorge", timeOfDay: "dawn", weather: "mist shafts", description: "At dawn in the bamboo gorge Xue Lian ambushes Yun Shu into a live duel across the stepping stones, reading his leaked spirit with every exchange and forcing him onto the back foot in the rising mist." },
    { number: 3, title: "The Blade Wakes", environmentName: "Cloudveil Terrace", timeOfDay: "night", weather: "storm edges", description: "Back on the terrace in the small hours Yun Shu stops fighting the breath and lets it carry the swing; the Cloudveil blade wakes, pouring cyan light up the pillar stubs as the storm edges lean in." },
  ];
  for (const s of sceneSpec) {
    const existing = await db.scene.findFirst({ where: { episodeId: eid, number: s.number } });
    if (existing) { log(`scene exists: ${s.number} ${s.title}`); continue; }
    const out = await run(pid, "create_scene", { episodeNumber: 1, ...s });
    log(`create_scene ${s.number}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── 12 shots, 60 seconds total ──
  const shotSpec: Array<{ scene: number; number: number; description: string; shotType: string; lens: string; movement: string; poseStart?: string; poseEnd?: string; duration: number; lighting: string; dialogue?: Array<{ speaker: string; text: string; kind?: string; delivery?: string }> }> = [
    { scene: 1, number: 1, description: "Two moons over the Cloudveil Terrace above a sea of clouds, weathered pillar stubs, wind banners snapping, a bronze bell catching moonlight", shotType: "ESTABLISHING", lens: "24mm", movement: "CRANE", duration: 5, lighting: "cold jade moonlight with copper rim from the small moon" },
    { scene: 1, number: 2, description: "Master Heiyan faces Yun Shu across the terrace stones, a spirit-water cup balanced on a flat blade between them", shotType: "MEDIUM", lens: "50mm", movement: "DOLLY_IN", poseStart: "STANCE", poseEnd: "BOW", duration: 5, lighting: "moonlight key, warm pipe-ember fill" },
    { scene: 1, number: 3, description: "Close on Master Heiyan, pipe smoke curling, clouded left eye narrowed with dry amusement as he gives the trial rule", shotType: "CLOSEUP", lens: "85mm", movement: "STATIC", duration: 4, lighting: "ember-warm key against cold moon rim", dialogue: [{ speaker: "Master Heiyan", text: "The blade obeys the breath, not the arm. Spill the water, start again." }] },
    { scene: 1, number: 4, description: "Yun Shu draws the Cloudveil blade in one breath, cup steady, robes flaring in the wind", shotType: "WIDE", lens: "35mm", movement: "ORBIT", poseStart: "STANCE", poseEnd: "DRAW", duration: 6, lighting: "moonlit steel glint, banner shadows sweeping" },
    { scene: 2, number: 1, description: "Dawn breaks over Mistfall Gorge, bamboo bending in layers, waterfall mist hanging in shafts of light over stepping stones", shotType: "ESTABLISHING", lens: "24mm", movement: "PAN", duration: 5, lighting: "gold shafts through mist, cool green shade" },
    { scene: 2, number: 2, description: "Xue Lian walks the stepping stones out of the mist and lunges without warning, frost saber mirrored in the stream", shotType: "MEDIUM", lens: "50mm", movement: "TRACKING", poseStart: "WALK", poseEnd: "LUNGE", duration: 5, lighting: "dawn rim on frost saber, mist bounce fill" },
    { scene: 2, number: 3, description: "Close on Xue Lian mid-exchange, braid whipping, pale eyes reading every leaked breath of spirit", shotType: "CLOSEUP", lens: "85mm", movement: "STATIC", duration: 4, lighting: "cool dawn key, mirrored hairpin glint", dialogue: [{ speaker: "Xue Lian", text: "Your stance leaks spirit at the shoulder. Again." }] },
    { scene: 2, number: 4, description: "Yun Shu blocks the frost saber and the counter slash skids him across the wet stones, water sheeting", shotType: "WIDE", lens: "35mm", movement: "STATIC", poseStart: "BLOCK", poseEnd: "SLASH", duration: 6, lighting: "backlit spray, hard dawn contrast" },
    { scene: 3, number: 1, description: "Small hours on the terrace, Yun Shu rising through the breath stance as storm edges gather at the peaks", shotType: "MEDIUM", lens: "50mm", movement: "CRANE", poseStart: "RISE", poseEnd: "CAST", duration: 5, lighting: "storm-lit violet with faint cyan under-glow" },
    { scene: 3, number: 2, description: "Extreme close on Yun Shus eyes closing, one breath, everything going still before the swing", shotType: "EXTREME_CLOSEUP", lens: "85mm", movement: "STATIC", duration: 4, lighting: "single cyan up-light from the blade", dialogue: [{ speaker: "Yun Shu", text: "The breath. The blade. One." }] },
    { scene: 3, number: 3, description: "The Cloudveil blade flares cyan and the swing pours light up the pillar stubs, storm edges leaning in over the sea of clouds", shotType: "WIDE", lens: "35mm", movement: "ORBIT", duration: 6, lighting: "cyan energy surge against violet storm" },
    { scene: 3, number: 4, description: "Low angle on Master Heiyan watching from the bell pillar, pipe ember brightening, a small approving nod", shotType: "LOW_ANGLE", lens: "35mm", movement: "DOLLY_IN", poseStart: "STANCE", poseEnd: "POINT", duration: 5, lighting: "ember key under storm clouds" },
  ];
  for (const s of shotSpec) {
    const sceneRow = await db.scene.findFirst({ where: { episodeId: eid, number: s.scene } });
    if (!sceneRow) throw new Error(`scene ${s.scene} missing`);
    const existing = await db.shot.findFirst({ where: { sceneId: sceneRow.id, number: s.number } });
    if (existing) { log(`shot exists: scene ${s.scene} shot ${s.number}`); continue; }
    const out = await run(pid, "create_shot", {
      sceneNumber: s.scene, number: s.number, description: s.description,
      shotType: s.shotType, lens: s.lens, movement: s.movement,
      poseStart: s.poseStart, poseEnd: s.poseEnd, duration: s.duration, lighting: s.lighting,
    });
    log(`create_shot s${s.scene}.${s.number}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── dialogue lines (SPEECH bubbles feed lip-sync + subs) ──
  for (const s of shotSpec) {
    if (!s.dialogue) continue;
    const sceneRow = await db.scene.findFirst({ where: { episodeId: eid, number: s.scene } });
    const shotRow = await db.shot.findFirst({ where: { sceneId: sceneRow!.id, number: s.number } });
    const already = shotRow?.dialogue && (shotRow.dialogue as unknown as unknown[]).length > 0;
    if (already) { log(`dialogue exists: s${s.scene}.${s.number}`); continue; }
    const out = await run(pid, "set_shot_dialogue", { sceneNumber: s.scene, shotNumber: s.number, lines: s.dialogue });
    log(`set_shot_dialogue s${s.scene}.${s.number}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── audio cues: VOICE lines, SFX, AMBIENCE, BGM ──
  const cueSpec: Array<{ scene: number; shot: number; kind: string; label: string; startMs: number; durationMs: number; volume: number }> = [
    { scene: 1, shot: 1, kind: "AMBIENCE", label: "High wind over a sea of clouds", startMs: 0, durationMs: 5000, volume: 0.5 },
    { scene: 1, shot: 1, kind: "BGM", label: "Guqin drone - trial theme", startMs: 0, durationMs: 5000, volume: 0.55 },
    { scene: 1, shot: 3, kind: "VOICE", label: "Master Heiyan: The blade obeys the breath, not the arm. Spill the water, start again.", startMs: 300, durationMs: 3300, volume: 0.9 },
    { scene: 1, shot: 4, kind: "SFX", label: "Blade shing - unsheathe", startMs: 900, durationMs: 700, volume: 0.8 },
    { scene: 2, shot: 1, kind: "AMBIENCE", label: "Dawn birds and stream water", startMs: 0, durationMs: 5000, volume: 0.45 },
    { scene: 2, shot: 2, kind: "SFX", label: "Frost saber hiss", startMs: 2600, durationMs: 900, volume: 0.8 },
    { scene: 2, shot: 3, kind: "VOICE", label: "Xue Lian: Your stance leaks spirit at the shoulder. Again.", startMs: 400, durationMs: 3000, volume: 0.9 },
    { scene: 2, shot: 4, kind: "SFX", label: "Clash impact - steel on steel", startMs: 400, durationMs: 800, volume: 0.85 },
    { scene: 2, shot: 4, kind: "SFX", label: "Wet stone skid", startMs: 2200, durationMs: 1000, volume: 0.6 },
    { scene: 3, shot: 1, kind: "AMBIENCE", label: "Storm edges rumble", startMs: 0, durationMs: 5000, volume: 0.5 },
    { scene: 3, shot: 2, kind: "VOICE", label: "Yun Shu: The breath. The blade. One.", startMs: 500, durationMs: 2600, volume: 0.9 },
    { scene: 3, shot: 3, kind: "SFX", label: "Energy surge detonation", startMs: 600, durationMs: 1400, volume: 0.9 },
    { scene: 3, shot: 3, kind: "BGM", label: "Blade wakes theme swell", startMs: 0, durationMs: 6000, volume: 0.6 },
    { scene: 3, shot: 4, kind: "SFX", label: "Pipe ember puff", startMs: 1500, durationMs: 500, volume: 0.45 },
  ];
  for (const c of cueSpec) {
    const sceneRow = await db.scene.findFirst({ where: { episodeId: eid, number: c.scene } });
    const shotRow = await db.shot.findFirst({ where: { sceneId: sceneRow!.id, number: c.shot }, include: { audioCues: true } });
    const dup = shotRow?.audioCues.some((q) => q.kind === c.kind && q.label === c.label);
    if (dup) continue;
    const out = await run(pid, "add_audio_cue", { sceneNumber: c.scene, shotNumber: c.shot, kind: c.kind, label: c.label, startMs: c.startMs, durationMs: c.durationMs, volume: c.volume });
    log(`add_audio_cue s${c.scene}.${c.shot} ${c.kind}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  // ── voice casting (roster artist per character) ──
  const casting = [
    { characterName: "Yun Shu", artist: "Lin Yao", voice: "xiaochen" },
    { characterName: "Master Heiyan", artist: "Old Man Shi", voice: "luodo" },
    { characterName: "Xue Lian", artist: "Pei Qing", voice: "kazi" },
  ];
  for (const c of casting) {
    const ch = await db.character.findFirst({ where: { projectId: pid, name: c.characterName } });
    if (!ch) throw new Error(`character missing: ${c.characterName}`);
    if (ch.voiceArtistId) { log(`cast exists: ${c.characterName}`); continue; }
    let artist = await db.artist.findFirst({ where: { projectId: pid, name: c.artist } });
    if (!artist) {
      artist = await db.artist.create({ data: { projectId: pid, name: c.artist, voiceId: c.voice, role: "VOICE" } });
      log(`artist rostered: ${c.artist} (${c.voice})`);
    }
    const out = await run(pid, "cast_voice_actor", { characterName: c.characterName, artistName: c.artist, voice: c.voice });
    log(`cast_voice_actor ${c.characterName}: ${out.status}`);
    if (out.status !== "OK") throw new Error(out.result);
  }

  const shots = await allShots();
  log(`SETUP COMPLETE: ${shots.length} shots, total ${totalDuration(shots).toFixed(0)}s`);
}

// ─────────────────────────────────────────────────────────────
// PHASE: sheets - real model sheets for the whole cast
// ─────────────────────────────────────────────────────────────
async function phaseSheets() {
  const p = await project();
  const chars = await db.character.findMany({ where: { projectId: p.id }, orderBy: { name: "asc" } });
  for (const c of chars) {
    if (c.modelSheetUrl) { log(`sheet exists: ${c.name} -> ${c.modelSheetUrl}`); continue; }
    log(`generating model sheet: ${c.name} ...`);
    await generateCharacterModelSheet(c.id);
    const after = await db.character.findUnique({ where: { id: c.id } });
    log(`sheet done: ${c.name} -> ${after?.modelSheetUrl ?? "(check sheets dir)"}`);
  }
  log("SHEETS COMPLETE");
}

// ─────────────────────────────────────────────────────────────
// PHASE: panels - real panel art for every shot
// ─────────────────────────────────────────────────────────────
async function phasePanels() {
  const shots = await allShots();
  for (const s of shots) {
    if (s.artworkUrl) { log(`panel exists: s${s.scene.number}.${s.number}`); continue; }
    log(`generating panel art: s${s.scene.number}.${s.number} ...`);
    const url = await generateShotPanelArt(s.id, "MANHUA");
    log(`panel done: s${s.scene.number}.${s.number} -> ${url}`);
  }
  log("PANELS COMPLETE");
}

// ─────────────────────────────────────────────────────────────
// PHASE: voices - real TTS takes for every VOICE cue
// ─────────────────────────────────────────────────────────────
async function phaseVoices() {
  const shots = await allShots();
  const cues = shots.flatMap((s) => s.audioCues).filter((c) => c.kind === "VOICE");
  if (cues.length === 0) throw new Error("no VOICE cues found");
  for (const c of cues) {
    if (c.voiceUrl) { log(`take exists: ${c.label.slice(0, 40)}...`); continue; }
    log(`rendering voice take: ${c.label.slice(0, 40)}...`);
    const out = await renderVoiceTake(c.id);
    const fresh = await db.audioCue.findUnique({ where: { id: c.id } });
    log(`take done: ${fresh?.voiceUrl ?? "?"} ${out.bytes}B voice=${out.cast.voiceId} delivery=${out.delivery.id}`);
  }
  log("VOICES COMPLETE");
}

// ─────────────────────────────────────────────────────────────
// PHASE: renders - serialized PREVIEW Blender renders with DSH
// inspection. Budget-aware so a single invocation never runs past
// its welcome; re-run to continue (DB state is the progress).
// ─────────────────────────────────────────────────────────────
async function phaseRenders(budgetMin: number) {
  const p = await project();
  const deadline = Date.now() + budgetMin * 60_000;
  const shots = await allShots();
  log(`render plan: ${shots.length} shots, budget ${budgetMin} min`);

  // 1. finish anything still RENDERING from a previous invocation
  //    (the detached Blender worker keeps writing its state file)
  const active = await db.renderJob.findMany({
    where: { projectId: p.id, status: "RENDERING" },
    orderBy: { createdAt: "asc" },
  });
  for (const j of active) {
    log(`resuming in-flight job ${j.id} (${j.mode}) ...`);
    await waitJob(j.id, deadline);
  }

  // 2. DSH-inspect completed renders that never got their verdict
  const awaiting = await db.renderJob.findMany({
    where: { projectId: p.id, status: "REVIEW", evaluation: null },
    orderBy: { createdAt: "asc" }, select: { id: true },
  });
  for (const j of awaiting) {
    if (Date.now() > deadline) return log(`budget reached - ${awaiting.length} inspections pending`);
    log(`inspecting render ${j.id} ...`);
    await runRenderEvaluation(j.id).catch((e) => log(`inspection failed (non-fatal): ${e}`));
  }

  // 3. render shots that have no finished clip yet, one Blender
  //    worker at a time
  for (const s of shots) {
    if (Date.now() > deadline) return log(`budget reached - remaining shots queued for the next run`);
    const finished = await db.renderJob.findFirst({
      where: { shotId: s.id, outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
    });
    if (finished) { log(`clip exists: s${s.scene.number}.${s.number}`); continue; }
    log(`rendering s${s.scene.number}.${s.number} (${s.duration}s, ${s.shotType}) ...`);
    const job = await createRenderJob(p.id, s.id, "PREVIEW");
    log(`job ${job.id} driver=${job.driver}`);
    const done = await waitJob(job.id, deadline);
    if (done === "timeout") return log(`budget reached mid-render - job ${job.id} continues in the next run`);
    if (done === "FAILED") { log(`render FAILED for s${s.scene.number}.${s.number}, continuing`); continue; }
    log(`render done, inspecting ...`);
    await runRenderEvaluation(job.id).catch((e) => log(`inspection failed (non-fatal): ${e}`));
  }
  log("RENDERS COMPLETE");
}

/** Tick a job to a terminal state. Returns the final status or "timeout". */
async function waitJob(jobId: string, deadline: number): Promise<string> {
  for (;;) {
    const job = await tickRenderJob(jobId);
    if (!job) throw new Error(`job ${jobId} vanished`);
    if (job.status === "RENDERING") {
      if (Date.now() > deadline) return "timeout";
      process.stdout.write(`\r[production]   ${job.id.slice(-6)} ${String(job.progress).padStart(3)}% ${job.stage.slice(0, 60)}          `);
      await sleep(4000);
      continue;
    }
    process.stdout.write("\n");
    log(`job ${job.id.slice(-6)} -> ${job.status} (${job.stage.slice(0, 80)})`);
    return job.status;
  }
}

// ─────────────────────────────────────────────────────────────
// PHASE: acoustics - persist the acoustic slot's audit per VOICE cue
// ─────────────────────────────────────────────────────────────
async function phaseAcoustics() {
  const shots = await allShots();
  const cues = shots.flatMap((s) => s.audioCues).filter((c) => c.kind === "VOICE");
  for (const c of cues) {
    if (c.acousticReport) { log(`acoustic audit exists: ${c.label.slice(0, 40)}...`); continue; }
    const result = await auditVoiceTakeAcoustics(
      { id: c.id, label: c.label, startMs: c.startMs, durationMs: c.durationMs, voiceDurationMs: c.voiceDurationMs, voiceUrl: c.voiceUrl },
      null,
      (url: string) => {
        try {
          const file = path.join(process.cwd(), "public", url.split("?")[0].replace(/^\//, ""));
          return fs.existsSync(file) ? fs.readFileSync(file) : null;
        } catch { return null; }
      },
    );
    if (!result.ok) { log(`audit failed: ${result.error}`); continue; }
    await db.audioCue.update({ where: { id: c.id }, data: { acousticReport: JSON.stringify(result.report) } });
    log(`audited: ${c.label.slice(0, 40)}... -> ${result.report.nuclei} anchors, ${result.report.retimed ? "warp armed" : "plan stands"}${result.report.confirmed != null ? `, ASR ${result.report.confirmed}/${result.report.tokens} words` : ""}`);
  }
  log("ACOUSTICS COMPLETE");
}

// ─────────────────────────────────────────────────────────────
// PHASE: assets - DESIGN the library assets (design once, render
// many): every character + environment becomes a versioned .blend
// + preview through the v4.1 builder; character assets get a
// vision inspection against their canonical sheet. Resumable: an
// existing READY asset is left alone unless REBUILD=1.
// ─────────────────────────────────────────────────────────────
async function phaseAssets() {
  const p = await project();
  const rebuild = process.env.REBUILD === "1";
  const cast = await db.character.findMany({ where: { projectId: p.id }, orderBy: { name: "asc" } });
  const envs = await db.environment.findMany({ where: { projectId: p.id }, orderBy: { name: "asc" } });
  if (cast.length === 0 && envs.length === 0) {
    log("no cast or environments found - run setup first");
    return;
  }
  for (const c of cast) {
    const existing = await db.blenderAsset.findUnique({
      where: { projectId_kind_refName: { projectId: p.id, kind: "CHARACTER", refName: c.name } },
    });
    if (existing?.status === "READY" && !rebuild) {
      log(`asset exists: char ${c.name} v${existing.version} - skipping (REBUILD=1 to force)`);
      continue;
    }
    log(`building character asset: ${c.name}...`);
    const res = await buildBlenderAsset(p.id, "CHARACTER", c.name);
    if (!res.ok) { log(`BUILD FAILED for ${c.name}: ${res.log.slice(-400)}`); continue; }
    log(`built: char ${c.name} v${res.version} (${res.objects} objects, ${res.tris.toLocaleString()} tris, ${(res.buildMs / 1000).toFixed(1)}s)`);
    const insp = await inspectBlenderAsset(res.assetId);
    if (insp.ok && !insp.skipped) log(`inspected: char ${c.name} identity ${insp.score !== null ? `${Math.round(insp.score * 100)}%` : "n/a"}${insp.note ? ` - ${insp.note}` : ""}`);
    else if (insp.error) log(`inspect skipped/failed: ${insp.error}`);
  }
  for (const e of envs) {
    const existing = await db.blenderAsset.findUnique({
      where: { projectId_kind_refName: { projectId: p.id, kind: "ENVIRONMENT", refName: e.name } },
    });
    if (existing?.status === "READY" && !rebuild) {
      log(`asset exists: env ${e.name} v${existing.version} - skipping (REBUILD=1 to force)`);
      continue;
    }
    log(`building environment asset: ${e.name}...`);
    const res = await buildBlenderAsset(p.id, "ENVIRONMENT", e.name);
    if (!res.ok) { log(`BUILD FAILED for ${e.name}: ${res.log.slice(-400)}`); continue; }
    log(`built: env ${e.name} v${res.version} (${res.objects} objects, ${res.tris.toLocaleString()} tris, ${(res.buildMs / 1000).toFixed(1)}s)`);
  }
  log("ASSETS COMPLETE");
}

// ─────────────────────────────────────────────────────────────
// PHASE: identity - vision-score every finished render against the
// cast's model sheets (one vision call per shot, budget-aware)
// ─────────────────────────────────────────────────────────────
async function phaseIdentity(budgetMin: number) {
  const p = await project();
  const deadline = Date.now() + budgetMin * 60_000;
  const shots = await allShots();
  let scored = 0;
  for (const s of shots) {
    if (Date.now() > deadline) return log(`budget reached - identity scoring continues next run (${scored} scored this run)`);
    const existing = await db.identityScore.findFirst({ where: { shotId: s.id, source: "RENDER" } });
    if (existing) { log(`identity exists: s${s.scene.number}.${s.number} (${(existing.worst * 100).toFixed(0)}%)`); continue; }
    const ref = `s${s.scene.number}.${s.number}`;
    log(`identity scoring ${ref} ...`);
    const res = await scoreRenderIdentity(s.id);
    if (res.ok) {
      scored += 1;
      log(`identity ${ref}: ${res.scored.verdict.entries.map((e) => `${e.characterName} ${(e.similarity * 100).toFixed(0)}%`).join(", ")} - worst ${(res.scored.verdict.worst * 100).toFixed(0)}%`);
    } else {
      log(`identity ${ref} skipped: ${res.error.slice(0, 100)}`);
    }
  }
  log(`IDENTITY COMPLETE (${scored} newly scored)`);
}

// ─────────────────────────────────────────────────────────────
// PHASE: finalall - FINAL-mode renders for EVERY shot, budget-aware
// and resumable: each invocation finishes what it can, the DB state
// is the progress, re-run until all shots carry a FINAL clip.
// ─────────────────────────────────────────────────────────────
async function phaseFinalAll(budgetMin: number) {
  const p = await project();
  const deadline = Date.now() + budgetMin * 60_000;
  const shots = await allShots();

  // resume any in-flight FINAL job first (its worker kept writing)
  const active = await db.renderJob.findMany({
    where: { projectId: p.id, mode: "FINAL", status: "RENDERING" },
    orderBy: { createdAt: "asc" },
  });
  for (const j of active) {
    log(`resuming in-flight FINAL job ${j.id} ...`);
    await waitJob(j.id, deadline);
  }

  let done = 0;
  for (const s of shots) {
    const finished = await db.renderJob.findFirst({
      where: { shotId: s.id, mode: "FINAL", outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
    });
    if (finished) { done += 1; continue; }
    if (Date.now() > deadline) {
      log(`budget reached - FINAL renders ${done}/${shots.length} complete, re-run to continue`);
      return;
    }
    log(`FINAL render s${s.scene.number}.${s.number} (${s.duration}s, 48 samples) ...`);
    const job = await createRenderJob(p.id, s.id, "FINAL");
    const status = await waitJob(job.id, deadline);
    if (status === "timeout") {
      log(`budget reached mid-render - job ${job.id} continues in the next run (FINAL ${done}/${shots.length})`);
      return;
    }
    if (status === "FAILED") { log(`FINAL render FAILED for s${s.scene.number}.${s.number}, continuing`); continue; }
    done += 1;
  }
  log(`FINALALL COMPLETE: ${done}/${shots.length} shots rendered in FINAL mode`);
}

// ─────────────────────────────────────────────────────────────
// PHASE: final - one FINAL-mode Blender render (the money shot)
// ─────────────────────────────────────────────────────────────
async function phaseFinal() {
  const p = await project();
  const shots = await allShots();
  const s = shots.find((x) => x.scene.number === 3 && x.number === 2);
  if (!s) throw new Error("final-proof shot s3.2 not found");
  const done = await db.renderJob.findFirst({
    where: { shotId: s.id, mode: "FINAL", outputUrl: { not: null } },
  });
  if (done) return log(`FINAL render exists: ${done.outputUrl}`);
  // resume an in-flight FINAL job from a previous invocation first
  // (its detached Blender worker is still writing frames)
  const inflight = await db.renderJob.findFirst({
    where: { shotId: s.id, mode: "FINAL", status: "RENDERING" },
    orderBy: { createdAt: "desc" },
  });
  if (inflight) {
    log(`resuming in-flight FINAL job ${inflight.id} ...`);
    const status = await waitJob(inflight.id, Date.now() + 9 * 60_000);
    log(status === "timeout" ? "FINAL render still running - re-run `final`" : `FINAL render ${status}`);
    return;
  }
  log(`FINAL render s3.2 (${s.duration}s, 48 samples, 1280px cap) ...`);
  const job = await createRenderJob(p.id, s.id, "FINAL");
  log(`job ${job.id} driver=${job.driver}`);
  const status = await waitJob(job.id, Date.now() + 9 * 60_000);
  log(status === "timeout" ? "FINAL render still running - re-run `final`" : `FINAL render ${status}`);
}

// ─────────────────────────────────────────────────────────────
// PHASE: cut - export the episode cut and verify it
// ─────────────────────────────────────────────────────────────
async function phaseCut() {
  const ep = await episode();
  log(`building cut for episode ${ep.id} (FINAL mux, 1280 canvas) ...`);
  const out = await buildEpisodeCut(ep.id, "FINAL");
  log(`CUT COMPLETE: ${out.url}`);
  log(`  durationMs=${out.durationMs} ${out.width}x${out.height}@${out.fps} shots=${out.shotCount} cues=${out.cueCount} renderedNow=${out.renderedNow}`);
  log(`  audio kinds: ${JSON.stringify(out.audioKinds)}`);
  if (out.warnings.length) log(`  warnings: ${out.warnings.join(" | ")}`);
}

// ─────────────────────────────────────────────────────────────
// PHASE: publish - stage platform packages on the delivery spine
// ─────────────────────────────────────────────────────────────
async function phasePublish() {
  const p = await project();
  for (const platform of ["YOUTUBE", "DOUYIN", "STUDIO_INGEST"]) {
    const out = await run(p.id, "publish_cut", { episodeNumber: 1, platform });
    log(`publish_cut ${platform}: ${out.status} - ${String(out.result).slice(0, 140)}`);
  }
  log("PUBLISH STAGING COMPLETE");
}

// ─────────────────────────────────────────────────────────────
// PHASE: verify - full production report
// ─────────────────────────────────────────────────────────────
async function phaseVerify() {
  const p = await project();
  const shots = await allShots();
  const totalMs = Math.round(totalDuration(shots) * 1000);
  const [chars, envs, facts, scenes, cues, events] = await Promise.all([
    db.character.count({ where: { projectId: p.id } }),
    db.environment.count({ where: { projectId: p.id } }),
    db.universeFact.count({ where: { projectId: p.id } }),
    db.scene.count({ where: { episodeId: shots[0]?.scene.episodeId } }),
    db.audioCue.count({ where: { shot: { scene: { episode: { season: { projectId: p.id } } } } } }),
    db.productionEvent.count({ where: { projectId: p.id } }),
  ]);
  log(`project: ${p.title} (${p.visualStyle} ${p.resolution}@${p.fps}fps)`);
  log(`cast=${chars} environments=${envs} facts=${facts} scenes=${scenes} shots=${shots.length} totalMs=${totalMs}`);
  log(`cues=${cues} productionEvents=${events}`);
  for (const s of shots) {
    const job = await db.renderJob.findFirst({
      where: { shotId: s.id, outputUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { evaluation: true },
    });
    const finalJob = await db.renderJob.findFirst({
      where: { shotId: s.id, mode: "FINAL", outputUrl: { not: null }, status: { in: ["REVIEW", "APPROVED", "NEEDS_REVISION"] } },
      orderBy: { createdAt: "desc" },
    });
    const identity = await db.identityScore.findFirst({ where: { shotId: s.id, source: "RENDER" } });
    const panel = s.artworkUrl ? "panel=yes" : "panel=NO";
    const clip = job ? `clip=${job.outputUrl} [${job.driver}/${job.mode}${job.evaluation ? " inspected" : ""}]` : "clip=MISSING";
    const finalTag = finalJob ? " FINAL=yes" : "";
    const idTag = identity ? ` identity=${(identity.worst * 100).toFixed(0)}%` : "";
    const voices = s.audioCues.filter((c) => c.kind === "VOICE").map((c) => {
      const ac = c.acousticReport ? JSON.parse(c.acousticReport) as { retimed?: boolean; nuclei?: number } : null;
      return `voice=${c.voiceUrl ? "yes" : "NO"}${ac ? `(acoustic:${ac.retimed ? "retimed" : "plan"},${ac.nuclei ?? 0} anchors)` : ""}`;
    });
    log(`s${s.scene.number}.${s.number} ${s.duration}s ${s.shotType.padEnd(17)} ${panel} ${clip}${finalTag}${idTag} ${voices.join(",")}`);
  }
  const cutsDir = path.join(process.cwd(), "public", "renders", "cuts");
  if (fs.existsSync(cutsDir)) {
    const cuts = fs.readdirSync(cutsDir).filter((f) => f.endsWith(".json")).sort();
    const latest = cuts[cuts.length - 1];
    if (latest) {
      const m = JSON.parse(fs.readFileSync(path.join(cutsDir, latest), "utf-8")) as { totalMs?: number; url?: string };
      log(`latest cut: ${m.url} totalMs=${m.totalMs}`);
    }
  }
}

// ── dispatcher ──
const phase = process.argv[2] ?? "verify";
const budget = Number(process.argv[3] ?? 8);
const phases: Record<string, () => Promise<void>> = {
  setup: phaseSetup, sheets: phaseSheets, panels: phasePanels,
  voices: phaseVoices, renders: () => phaseRenders(budget),
  acoustics: phaseAcoustics, assets: phaseAssets, identity: () => phaseIdentity(Math.min(budget, 9)),
  final: phaseFinal, finalall: () => phaseFinalAll(budget),
  cut: phaseCut, publish: phasePublish, verify: phaseVerify,
};
if (!phases[phase]) {
  console.error(`unknown phase '${phase}'. phases: ${Object.keys(phases).join(", ")}`);
  process.exit(1);
}
phases[phase]()
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(`[production] PHASE FAILED: ${e instanceof Error ? e.stack : e}`);
    await db.$disconnect();
    process.exit(1);
  });

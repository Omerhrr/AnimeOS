// E2E Iteration 19: season-wide arc ruler + same-turn re-render offer
// after set_state_arc + reusable arc templates ("possession spread").
// Steps:
//   plan    - pure checks (no DB writes): template allocation math, the
//             across-shots shape painter, season span merging across
//             episode boundaries, lane packing, name resolution
//   tool    - built-in template application (scene + episode scope, shape
//             report, direction impact, error paths), the same-turn offer
//             riding set_state_arc, and cross-episode spans computed from
//             real data with a fixture Ep8; the fixture runs on its own
//             episode + a temporary fixture state, so the real season is
//             never modified
//   cleanup - removes the fixture and restores Sc12 dialogues (safety net)
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { parseDialogue, serializeDialogue } from "@/lib/comic/dialogue";
import {
  arcTemplateByName, applyArcTemplate, planTemplateAssignment, planTemplateCounts,
  ARC_TEMPLATES, formatTemplateReport, type TemplateShotInput,
} from "@/lib/comic/arc-templates";
import {
  computeSeasonArcSpans, formatSeasonArcRange, packSpanLanes,
  type SeasonArcShotInput,
} from "@/lib/comic/arcs";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function ep7() {
  const ep = await db.episode.findFirst({
    where: { number: 7, season: { projectId } },
    include: { scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" } } } } },
  });
  if (!ep) throw new Error("Ep7 not found");
  return ep;
}

async function sc12Shots() {
  const scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7, season: { projectId } } },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  if (!scene) throw new Error("Ep7 Sc12 not found");
  return scene;
}

// the ONLY real dialogue in Ep7 (verified by the tool step's restore check)
const SC12_ORIGINALS: Record<number, string> = {
  3: '[{"speaker":"Lin Yue","text":"The rain... it stopped.","kind":"THOUGHT"}]',
};

const FIXTURE_EPISODE = 8;
const FIXTURE_SCENE = 20;
const STATE_LABEL = "E2E Possessed"; // fuzzy-matches the fixture state
const FIXTURE_DIALOGUES: Record<number, string> = {
  1: serializeDialogue([{ speaker: "Lin Yue", text: "The Jade Sword still answers my call.", kind: "SPEECH" }]),
  2: serializeDialogue([{ speaker: "Su Yan", text: "You cannot hold two swords with one soul.", kind: "SPEECH" }]),
  3: serializeDialogue([{ speaker: "Lin Yue", text: "The rain... it stopped.", kind: "THOUGHT" }]),
  4: serializeDialogue([{ speaker: "Lin Yue", text: "Then the soul stretches.", kind: "SPEECH" }]),
};

async function linYueId() {
  const ch = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true } });
  if (!ch) throw new Error("Lin Yue not found");
  return ch.id;
}

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Ruler fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Bridge of Blades - fixture", status: "DRAFT" },
  });
  const mkShot = (number: number, description: string) =>
    db.shot.create({ data: { sceneId: scene.id, number, description, shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[number] } });
  const s1 = await mkShot(1, "Fixture shot - Lin Yue calls the sword.");
  const s2 = await mkShot(2, "Fixture shot - the rival taunts.");
  const s3 = await mkShot(3, "Fixture shot - Lin Yue reflects.");
  const s4 = await mkShot(4, "Fixture shot - Lin Yue endures.");
  const cue1 = await db.audioCue.create({ data: { shotId: s1.id, kind: "VOICE", label: "Lin Yue: The Jade Sword still answers my call." } });
  await db.audioCue.create({ data: { shotId: s3.id, kind: "VOICE", label: "Lin Yue: The rain... it stopped." } });
  return { ep, scene, cue1 };
}

async function cleanupEpisodeFixture(cue1Id?: string) {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  if (cue1Id) await unlink(path.join(process.cwd(), "public", "voices", `${cue1Id}.wav`)).catch(() => {});
  const scene = await sc12Shots();
  for (const s of scene.shots) {
    if (SC12_ORIGINALS[s.number] !== undefined && s.dialogue !== SC12_ORIGINALS[s.number]) {
      await db.shot.update({ where: { id: s.id }, data: { dialogue: SC12_ORIGINALS[s.number] } });
    }
  }
}

function seasonShotsFromDb(
  eps: Array<{ number: number; scenes: Array<{ number: number; shots: Array<{ id: string; number: number; dialogue: string | null }> }> }>,
): SeasonArcShotInput[] {
  return eps
    .slice()
    .sort((a, b) => a.number - b.number)
    .flatMap((ep) =>
      ep.scenes
        .slice()
        .sort((a, b) => a.number - b.number)
        .flatMap((sc) =>
          sc.shots
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((sh) => ({ id: sh.id, sceneId: "db", sceneNumber: sc.number, number: sh.number, dialogue: sh.dialogue, episodeNumber: ep.number })),
        ),
    );
}

if (step === "plan") {
  const ps = ARC_TEMPLATES.find((t) => t.id === "possession-spread")!;
  const rec = ARC_TEMPLATES.find((t) => t.id === "recovery-arc")!;

  // 1. allocation math: exact sums, dominant segments win the remainder
  const c8 = planTemplateCounts(8, ps.segments);
  check("counts: 8 lines -> 2/4/2", JSON.stringify(c8) === JSON.stringify([2, 4, 2]), c8.join("/"));
  const c4 = planTemplateCounts(4, ps.segments);
  check("counts: 4 lines -> 1/2/1", JSON.stringify(c4) === JSON.stringify([1, 2, 1]), c4.join("/"));
  const c3 = planTemplateCounts(3, ps.segments);
  check("counts: 3 lines -> 1/1/1 (each segment survives)", JSON.stringify(c3) === JSON.stringify([1, 1, 1]), c3.join("/"));
  const c2 = planTemplateCounts(2, ps.segments);
  check("counts: 2 lines -> 1/1/0 (auto then state)", JSON.stringify(c2) === JSON.stringify([1, 1, 0]), c2.join("/"));
  const c1 = planTemplateCounts(1, ps.segments);
  check("counts: 1 line -> the dominant (state) segment", JSON.stringify(c1) === JSON.stringify([0, 1, 0]), c1.join("/"));
  let sumsOk = true;
  for (const t of ARC_TEMPLATES) {
    for (const n of [1, 2, 3, 5, 7, 9, 11, 20]) {
      const counts = planTemplateCounts(n, t.segments);
      if (counts.reduce((a, b) => a + b, 0) !== n || counts.some((c) => c < 0)) sumsOk = false;
    }
  }
  check("counts: sums exact across every template x sizes", sumsOk, "");
  const rec4 = planTemplateCounts(4, rec.segments);
  check("counts: recovery 4 lines -> 2/2 (remainder to the wider state segment)", JSON.stringify(rec4) === JSON.stringify([2, 2]), rec4.join("/"));

  // 2. assignment: shape order preserved
  const assignment = planTemplateAssignment(6, ps);
  check("assignment: 6 lines -> auto auto state state state auto", JSON.stringify(assignment) === JSON.stringify(["auto", "auto", "state", "state", "state", "auto"]), assignment.join(","));

  // 3. the shape painter: ONE arc across shots, rivals untouched, no-op re-run
  const mk = (lines: TemplateShotInput["lines"]): TemplateShotInput => ({ shotId: "", lines });
  const shots = [
    mk(parseDialogue('[{"speaker":"Lin Yue","text":"one","kind":"SPEECH"}]')),
    mk(parseDialogue('[{"speaker":"Su Yan","text":"rival","kind":"SPEECH"},{"speaker":"Lin Yue","text":"two","kind":"SPEECH"}]')),
    mk(parseDialogue('[{"speaker":"Lin Yue","text":"three","kind":"SPEECH"},{"speaker":"Lin Yue","text":"four","kind":"SPEECH"}]')),
  ];
  const [res1, n1, rep1] = applyArcTemplate(shots, "Lin Yue", ps, "Possessed");
  check("apply: 4 speaker lines -> 2 stamped (plan 1/2/1)", n1 === 2, `n=${n1} ${formatTemplateReport(rep1, "Possessed")}`);
  check("apply: shape report is auto x1 (0), state x2 (2), auto x1 (0)", formatTemplateReport(rep1, "Possessed") === 'auto x1 (0 stamped), "Possessed" x2 (2 stamped), auto x1 (0 stamped)', formatTemplateReport(rep1, "Possessed"));
  check("apply: line 1 stays auto", res1[0].lines[0].state === null, String(res1[0].lines[0].state));
  check("apply: line 2 forced, rival untouched", res1[1].lines[0].state === null && res1[1].lines[1].state === "Possessed", "");
  check("apply: lines 3+4 state then auto", res1[2].lines[0].state === "Possessed" && res1[2].lines[1].state === null, "");
  check("apply: changed flags name exactly the touched shots", res1[0].changed === false && res1[1].changed === true && res1[2].changed === true, "");
  const [res2, n2] = applyArcTemplate(res1.map((r) => ({ shotId: r.shotId, lines: r.lines })), "lin yue", ps, "Possessed");
  check("apply: re-run is a no-op (case-insensitive speaker)", n2 === 0 && res2.every((r) => !r.changed), `n=${n2}`);
  const [, n3, rep3] = applyArcTemplate(shots, "Lin Yue", rec, "Possessed");
  check("apply: recovery shape over 4 lines -> state x2 (2), auto x2 (0)", n3 === 2 && formatTemplateReport(rep3, "Possessed") === '"Possessed" x2 (2 stamped), auto x2 (0 stamped)', formatTemplateReport(rep3, "Possessed"));

  // 4. season spans: one arc across an episode boundary, broken at the speaker's auto line
  const seasonShots: SeasonArcShotInput[] = [
    { id: "e7a", sceneId: "s", sceneNumber: 12, number: 5, dialogue: '[{"speaker":"Lin","text":"a","kind":"SPEECH","state":"Possessed"}]', episodeNumber: 7 },
    { id: "e7b", sceneId: "s", sceneNumber: 12, number: 6, dialogue: '[{"speaker":"Lin","text":"b","kind":"SPEECH","state":"Possessed"}]', episodeNumber: 7 },
    { id: "e8a", sceneId: "s", sceneNumber: 20, number: 1, dialogue: '[{"speaker":"Rival","text":"x","kind":"SPEECH"},{"speaker":"Lin","text":"c","kind":"SPEECH","state":"Possessed"}]', episodeNumber: 8 },
    { id: "e8b", sceneId: "s", sceneNumber: 20, number: 2, dialogue: '[{"speaker":"Lin","text":"d","kind":"SPEECH","state":"Possessed"}]', episodeNumber: 8 },
    { id: "e8c", sceneId: "s", sceneNumber: 20, number: 3, dialogue: '[{"speaker":"Lin","text":"auto","kind":"SPEECH"}]', episodeNumber: 8 },
    { id: "e8d", sceneId: "s", sceneNumber: 20, number: 4, dialogue: '[{"speaker":"Lin","text":"e","kind":"SPEECH","state":"Possessed"}]', episodeNumber: 8 },
  ];
  const season = computeSeasonArcSpans(seasonShots);
  check("season: boundary merge + resume after auto -> 2 spans", season.length === 2, `n=${season.length}`);
  const [big, small] = season;
  check("season: first span crosses episodes 7 -> 8", big.crossesEpisode === true && big.startEpisode === 7 && big.endEpisode === 8, `${big.startEpisode}->${big.endEpisode}`);
  check("season: first span covers e7a..e8b (rival lines do not break, same state continues)", JSON.stringify(big.shotIds) === JSON.stringify(["e7a", "e7b", "e8a", "e8b"]) && big.lineCount === 4, big.shotIds.join(","));
  check("season: second span stays inside ep8", small.crossesEpisode === false && small.startEpisode === 8 && small.endEpisode === 8 && JSON.stringify(small.shotIds) === JSON.stringify(["e8d"]), small.shotIds.join(","));
  check("season: label crosses episodes", formatSeasonArcRange(big) === "Ep7 Sc12 S5 → Ep8 Sc20 S2", formatSeasonArcRange(big));
  check("season: label in-episode keeps the Ep prefix", formatSeasonArcRange(small) === "Ep8 Sc20 shot 4", formatSeasonArcRange(small));

  // 5. lane packing: overlaps stack, adjacent bars reuse a lane, input order preserved
  const lanes = packSpanLanes([
    { start: 0, end: 3 },
    { start: 2, end: 5 },
    { start: 6, end: 8 },
    { start: 7, end: 9 },
  ]);
  check("lanes: overlap stacks, adjacency reuses, input order preserved", JSON.stringify(lanes) === JSON.stringify([0, 1, 0, 1]), lanes.join(","));

  // 6. name resolution: exact, partial, id, miss
  check("names: exact", arcTemplateByName("possession spread")?.id === "possession-spread", "");
  check("names: partial", arcTemplateByName("possession")?.id === "possession-spread", "");
  check("names: id", arcTemplateByName("full-takeover")?.id === "full-takeover", "");
  check("names: miss", arcTemplateByName("meteor shower") === null, "");
}

if (step === "tool") {
  // fixture state: TEMPORARY @Ep9 never auto-applies at Ep8, but a forced
  // override ignores episode eligibility - its variant + pitch hint make
  // the rendered S1 take move when a template lands on the line
  const chId = await linYueId();
  await db.characterState.deleteMany({ where: { characterId: chId, label: "E2E Possessed (fixture)" } });
  await db.characterState.create({
    data: { characterId: chId, label: "E2E Possessed (fixture)", stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 },
  });
  const fixture = await ensureEpisodeFixture();
  const epNum = fixture.ep.number;

  // render a real take on S1 (auto direction at Ep8: no eligible variant)
  const rendered = await renderVoiceTake(fixture.cue1.id);
  check("fixture: real TTS take rendered on S1", Boolean(rendered.cue.voiceUrl), `voice=${rendered.cue.voiceActor ?? "?"} bytes=${rendered.bytes}`);

  // 1. apply_arc_template scene scope on Sc20: 3 Lin Yue lines -> plan 1/1/1 stamps S3 only;
  //    S3's cue is unrendered, so the direction impact is CLEAN (no rendered take moved)
  const r1 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "possession spread", stateLabel: STATE_LABEL,
    scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE,
  });
  check("tool: template stamps 1 line (plan 1/1/1 over 3 lines)", r1.status === "OK" && r1.result.includes("1 line(s) stamped in shot(s) 3"), r1.result.slice(0, 200));
  check("tool: shape report present", r1.result.includes('Shape: auto x1 (0 stamped), "E2E Possessed (fixture)" x1 (1 stamped), auto x1 (0 stamped)'), r1.result.slice(0, 260));
  check("tool: clean direction impact (S3 cue unrendered)", r1.result.includes(`Direction impact: episode ${epNum} is clean (1 fresh, 1 unrendered) - no rendered take moved`), r1.result.slice(-260));
  const scA = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const s1a = parseDialogue(scA!.shots.find((s) => s.number === 1)!.dialogue)[0];
  const s3a = parseDialogue(scA!.shots.find((s) => s.number === 3)!.dialogue)[0];
  check("tool: DB - S1 auto, S3 carries the FULL state label", s1a.state === null && s3a.state === "E2E Possessed (fixture)", `s1=${s1a.state} s3=${s3a.state}`);

  // 1b. re-running the SAME template over the SAME shape is a no-op
  const r2 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "possession spread", stateLabel: STATE_LABEL,
    scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE,
  });
  check("tool: re-run no-op", r2.status === "OK" && r2.result.includes("0 line(s) stamped") && r2.result.includes("No take moved"), r2.result.slice(0, 240));

  // 2. full takeover reshapes: over 3 lines the plan is 1/2/0, so the TAIL
  //    auto bookend is squeezed out: S4 flips to the state, the S1 auto bookend survives
  const r3 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "full takeover", stateLabel: STATE_LABEL,
    scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE,
  });
  const scB = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const s1b = parseDialogue(scB!.shots.find((s) => s.number === 1)!.dialogue)[0];
  const s3b = parseDialogue(scB!.shots.find((s) => s.number === 3)!.dialogue)[0];
  const s4b = parseDialogue(scB!.shots.find((s) => s.number === 4)!.dialogue)[0];
  check("tool: full takeover over 3 lines stamps S4 only (S1 auto bookend survives)", s1b.state === null && s3b.state === "E2E Possessed (fixture)" && s4b.state === "E2E Possessed (fixture)" && r3.result.includes("1 line(s) stamped in shot(s) 4"), r3.result.slice(0, 220));
  check("tool: clean direction impact (the rendered S1 take never moved)", r3.result.includes(`Direction impact: episode ${epNum} is clean (1 fresh, 1 unrendered)`), r3.result.slice(-260));

  // 2b. recovery arc forces the HEAD: over 3 lines the plan is 2/1, so S1 flips to
  //     the state -> the RENDERED S1 take goes stale and the offer rides the result
  const r3b = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "recovery arc", stateLabel: STATE_LABEL,
    scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE,
  });
  const scB2 = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const s1b2 = parseDialogue(scB2!.shots.find((s) => s.number === 1)!.dialogue)[0];
  const s4b2 = parseDialogue(scB2!.shots.find((s) => s.number === 4)!.dialogue)[0];
  check("tool: recovery arc over 3 lines stamps S1+S4 (state x2, auto x1)", s1b2.state === "E2E Possessed (fixture)" && s4b2.state === null && r3b.result.includes("2 line(s) stamped in shot(s) 1, 4"), r3b.result.slice(0, 220));
  check("tool: rendered S1 take went stale", r3b.result.includes(`Direction impact: episode ${epNum} now has 1 stale take(s)`), r3b.result.slice(-260));
  check("tool: same-turn offer rides the result", r3b.result.includes("Offer the re-render in the same turn"), r3b.result.slice(-260));
  const d1 = await diffEpisodeById(fixture.ep.id);
  check("tool: diff agrees - exactly 1 stale", d1?.stale === 1 && d1?.fresh === 0, `stale=${d1?.stale} fresh=${d1?.fresh}`);

  // 3b. fuzzy state match keeps stamping the FULL label
  check("tool: fuzzy state match stamps the FULL label", s1b2.state === "E2E Possessed (fixture)", String(s1b2.state));

  // 4. set_state_arc reports the same-turn re-render offer too, then clear restores clean
  const r4 = await executeTool(projectId, "set_state_arc", {
    characterName: "Lin Yue", stateLabel: "", scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE,
  });
  check("clear: S1+S3 overrides cleared (S4 already auto)", r4.status === "OK" && r4.result.includes("2 line(s) stamped in shot(s) 1, 3"), r4.result.slice(0, 200));
  check("clear: direction impact clean - no offer needed", r4.result.includes(`Direction impact: episode ${epNum} is clean`) && !r4.result.includes("Offer the re-render"), r4.result.slice(-220));
  const dClear = await diffEpisodeById(fixture.ep.id);
  check("clear: season fresh again", dClear?.stale === 0, `stale=${dClear?.stale}`);

  const r5 = await executeTool(projectId, "set_state_arc", {
    characterName: "Lin Yue", stateLabel: STATE_LABEL, scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE,
  });
  check("set_state_arc: same-turn offer present", r5.status === "OK" && r5.result.includes(`Direction impact: episode ${epNum} now has 1 stale take(s)`) && r5.result.includes("Offer the re-render in the same turn"), r5.result.slice(-260));
  const r5b = await executeTool(projectId, "set_state_arc", {
    characterName: "Lin Yue", stateLabel: "", scope: "episode", episodeNumber: epNum,
  });
  check("set_state_arc: episode-scope clear resets all 3 lines", r5b.status === "OK" && r5b.result.includes("3 line(s) stamped in shot(s) Sc20 S1, Sc20 S3, Sc20 S4"), r5b.result.slice(0, 240));

  // 5. episode scope names the episode range; recovery arc with the EPISODE-RESOLVED
  //    state (S01 @Ep1 <= Ep8) forces exactly what auto would resolve -> the take stays fresh
  const r6 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "recovery arc", stateLabel: "S01 - Village Disciple",
    scope: "episode", episodeNumber: epNum,
  });
  check("tool: episode scope names the range", r6.status === "OK" && r6.result.includes(`across episode ${epNum} (Sc20 S1 → Sc20 S4)`), r6.result.slice(0, 220));
  const scC = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const s1c = parseDialogue(scC!.shots.find((s) => s.number === 1)!.dialogue)[0];
  const s3c = parseDialogue(scC!.shots.find((s) => s.number === 3)!.dialogue)[0];
  const s4c = parseDialogue(scC!.shots.find((s) => s.number === 4)!.dialogue)[0];
  check("tool: recovery shape over 3 lines -> S1+S3 carry S01, S4 stays auto", s1c.state === "S01 - Village Disciple" && s3c.state === "S01 - Village Disciple" && s4c.state === null, `s1=${s1c.state} s3=${s3c.state} s4=${s4c.state}`);
  const d3 = await diffEpisodeById(fixture.ep.id);
  check("tool: in-episode state stamp keeps the take fresh", d3?.stale === 0, `stale=${d3?.stale}`);

  // 6. cross-episode ruler on REAL data: fixture Ep8 + the same state stamped on BOTH
  //    sides of the boundary (Sc12 S3 in Ep7, Sc20 S1 in Ep8) merge into ONE season span
  await cleanupEpisodeFixture();
  await ensureEpisodeFixture();
  const stampS3 = await sc12Shots();
  await db.shot.update({
    where: { id: stampS3.shots.find((s) => s.number === 3)!.id },
    data: { dialogue: serializeDialogue(parseDialogue(SC12_ORIGINALS[3]).map((l) => ({ ...l, state: "S02 - Foundation Established" }))) },
  });
  const fixtureEp = await db.episode.findFirst({ where: { number: FIXTURE_EPISODE, season: { projectId } }, include: { scenes: { include: { shots: { orderBy: { number: "asc" } } } } } });
  const fixtureS1 = fixtureEp!.scenes[0].shots.find((s) => s.number === 1)!;
  await db.shot.update({
    where: { id: fixtureS1.id },
    data: { dialogue: serializeDialogue(parseDialogue(FIXTURE_DIALOGUES[1]).map((l) => (l.speaker === "Lin Yue" ? { ...l, state: "S02 - Foundation Established" } : l))) },
  });
  const epsWithFixture = await db.episode.findMany({
    where: { season: { projectId } },
    include: { scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" } } } } },
  });
  const flat = seasonShotsFromDb(epsWithFixture);
  const realSpans = computeSeasonArcSpans(flat);
  const cross = realSpans.find((s) => s.crossesEpisode);
  check("ruler: real season data merges Ep7 -> Ep8 into ONE span", Boolean(cross) && cross!.startEpisode === 7 && cross!.endEpisode === 8, realSpans.map((s) => formatSeasonArcRange(s)).join(" | "));
  check("ruler: cross-episode span is Sc12 S3 -> Sc20 S1 with 2 lines", cross !== undefined && formatSeasonArcRange(cross) === "Ep7 Sc12 S3 → Ep8 Sc20 S1" && cross!.lineCount === 2, cross ? `${formatSeasonArcRange(cross)} lines=${cross.lineCount}` : "none");
  const lanesReal = packSpanLanes(realSpans.map((s) => ({ start: flat.findIndex((f) => f.id === s.startShotId), end: flat.findIndex((f) => f.id === s.endShotId) })));
  check("ruler: lane packing runs on real spans", lanesReal.length === realSpans.length && lanesReal.every((l) => l >= 0), lanesReal.join(","));

  // 7. error paths
  const e1 = await executeTool(projectId, "apply_arc_template", { characterName: "Lin Yue", template: "meteor shower", stateLabel: "E2E Possessed" });
  check("error: unknown template lists the registry", e1.status === "ERROR" && e1.result.includes("No arc template named") && e1.result.includes("possession spread"), e1.result.slice(0, 160));
  const e2 = await executeTool(projectId, "apply_arc_template", { characterName: "Lin Yue", template: "possession spread", stateLabel: "" });
  check("error: missing stateLabel", e2.status === "ERROR" && e2.result.includes("need a stateLabel"), e2.result.slice(0, 160));
  const e3 = await executeTool(projectId, "apply_arc_template", { characterName: "Lin Yue", template: "possession spread", stateLabel: "Enlightened" });
  check("error: unknown state lists states", e3.status === "ERROR" && e3.result.includes("No state of Lin Yue matches") && e3.result.includes("Battle-damaged"), e3.result.slice(0, 200));
  const e4 = await executeTool(projectId, "apply_arc_template", { characterName: "Nobody", template: "possession spread", stateLabel: "Foundation" });
  check("error: unknown character", e4.status === "ERROR" && e4.result.includes("not found"), e4.result.slice(0, 120));
  const e5 = await executeTool(projectId, "apply_arc_template", { characterName: "Lin Yue", template: "possession spread", stateLabel: "E2E Possessed", scope: "scene", episodeNumber: FIXTURE_EPISODE, sceneNumber: FIXTURE_SCENE, shotFrom: 4, shotTo: 2 });
  check("error: inverted scene range", e5.status === "ERROR" && e5.result.includes("shotFrom must be <= shotTo"), e5.result.slice(0, 160));
  const e6 = await executeTool(projectId, "apply_arc_template", { characterName: "Lin Yue", template: "possession spread", stateLabel: "E2E Possessed", scope: "episode", episodeNumber: FIXTURE_EPISODE, sceneNumber: FIXTURE_SCENE, shotFrom: 4, toSceneNumber: FIXTURE_SCENE, shotTo: 2 });
  check("error: inverted episode range", e6.status === "ERROR" && e6.result.includes("the arc must run forward"), e6.result.slice(0, 180));

  // 8. restore: remove the fixture entirely; the real season is untouched
  await cleanupEpisodeFixture(fixture.cue1.id);
  await db.characterState.deleteMany({ where: { characterId: chId, label: "E2E Possessed (fixture)" } });
  const sc12d = await sc12Shots();
  const restored = sc12d.shots.every((s) => SC12_ORIGINALS[s.number] === undefined || s.dialogue === SC12_ORIGINALS[s.number]);
  check("restore: Sc12 dialogues byte-identical", restored, sc12d.shots.map((s) => `S${s.number}:${(s.dialogue ?? "null").slice(0, 30)}`).join(" | "));
  const dEnd = await diffEpisodeById((await ep7()).id);
  check("restore: Ep7 untouched (0 fresh / 0 stale / 1 unrendered)", dEnd?.stale === 0 && dEnd?.fresh === 0 && dEnd?.unrendered === 1, `stale=${dEnd?.stale} fresh=${dEnd?.fresh}`);
  const epsAfter = await db.episode.findMany({ where: { season: { projectId } }, select: { number: true, scenes: { select: { _count: { select: { shots: true } } } } } });
  check("restore: fixture episode removed", epsAfter.every((e) => e.number !== FIXTURE_EPISODE), epsAfter.map((e) => `Ep${e.number}`).join(","));
  const statesLeft = await db.characterState.count({ where: { characterId: chId, label: "E2E Possessed (fixture)" } });
  check("restore: fixture state removed", statesLeft === 0);
}

if (step === "cleanup") {
  await cleanupEpisodeFixture();
  console.log("cleanup done");
}

await db.$disconnect();
if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");

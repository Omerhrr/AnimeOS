// E2E Iteration 22: ENSEMBLE arcs - one DSH batch paints a template on
// SEVERAL speakers (apply_arc_template characters arg + the suggest
// chain), with a per-speaker breakdown, ONE combined Direction impact
// and a single re-render offer; the batch also tags the stamped lines
// (arcBatch) so the ruler lanes + panel inspector read them as ONE
// parallel beat. Steps:
//   plan - pure checks (no DB writes): batch/shot ensemble grouping,
//          bridging, same-speaker isolation, arcBatch collection,
//          batch stamping/clearing in the painter
//   tool - ensemble apply (shared + per-speaker states), no-op re-run,
//          stale offer covering both speakers, partial + total skips,
//          arg errors, the suggest ensemble chain, the prose ensemble
//          hint, the legacy single-speaker format, batch clearing via
//          set_state_arc; all on a fixture Ep10/Sc30 with its own
//          characters + states, so the real season is never modified
//   cleanup - removes the fixture entirely
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { parseDialogue, serializeDialogue } from "@/lib/comic/dialogue";
import { applyArcTemplate, type TemplateShotInput } from "@/lib/comic/arc-templates";
import { computeArcSpans, ensembleGroupSizes, groupEnsembleSpans, type ArcShotInput } from "@/lib/comic/arcs";
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

const FIXTURE_EPISODE = 10;
const FIXTURE_SCENE = 30;
const RIVAL = "E2E Rival Wei";
const LIN_STATE = "E2E Possessed (fixture)";
const RIVAL_STATE = "E2E Possessor (fixture)";

const FIXTURE_DIALOGUES: Record<number, string> = {
  1: serializeDialogue([{ speaker: "Lin Yue", text: "The seal cracks.", kind: "SPEECH" }]),
  2: serializeDialogue([{ speaker: RIVAL, text: "Your soul leaks through.", kind: "SPEECH" }]),
  3: serializeDialogue([{ speaker: "Lin Yue", text: "I cannot hold it.", kind: "SPEECH" }]),
  4: serializeDialogue([{ speaker: RIVAL, text: "Then do not.", kind: "SPEECH" }]),
  5: serializeDialogue([{ speaker: "Lin Yue", text: "The sword answers anyway.", kind: "SPEECH" }]),
  6: serializeDialogue([{ speaker: RIVAL, text: "Interesting.", kind: "SPEECH" }]),
};

async function ep7() {
  const ep = await db.episode.findFirst({
    where: { number: 7, season: { projectId } },
    include: { scenes: { orderBy: { number: "asc" }, include: { shots: { orderBy: { number: "asc" } } } } },
  });
  if (!ep) throw new Error("Ep7 not found");
  return ep;
}

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Ensemble fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Twin Fall - fixture", status: "DRAFT" },
  });
  const mkShot = (number: number) =>
    db.shot.create({ data: { sceneId: scene.id, number, description: `Fixture shot ${number}`, shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[number] } });
  const s1 = await mkShot(1);
  const s2 = await mkShot(2);
  await mkShot(3);
  await mkShot(4);
  await mkShot(5);
  await mkShot(6);
  const cue1 = await db.audioCue.create({ data: { shotId: s1.id, kind: "VOICE", label: "Lin Yue: The seal cracks." } });
  const cue2 = await db.audioCue.create({ data: { shotId: s2.id, kind: "VOICE", label: `${RIVAL}: Your soul leaks through.` } });
  return { ep, scene, cue1, cue2 };
}

async function cleanupEpisodeFixture(cueIds: string[]) {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  for (const id of cueIds) {
    await unlink(path.join(process.cwd(), "public", "voices", `${id}.wav`)).catch(() => {});
  }
}

if (step === "plan") {
  // 1. batch union: alternating-dialogue spans share NO shot but share the batch
  const span = (speakerKey: string, shotIds: string[], arcBatches: string[]) => ({ speakerKey, shotIds, arcBatches });
  const lin = span("lin yue", ["s1", "s3"], ["ens-a"]);
  const rival = span("rival", ["s2", "s4"], ["ens-a"]);
  const g1 = groupEnsembleSpans([lin, rival]);
  check("group: shared batch unions alternating spans", g1[0] === g1[1], g1.join(","));
  check("sizes: pair -> [2]", JSON.stringify(ensembleGroupSizes(g1)) === JSON.stringify([2]), ensembleGroupSizes(g1).join(","));

  // 2. shot union still works for lines inside ONE shot
  const g2 = groupEnsembleSpans([
    span("a", ["x"], []),
    span("b", ["x"], []),
  ]);
  check("group: shared shot unions different speakers", g2[0] === g2[1], g2.join(","));

  // 3. same speaker never merges (even on a shared batch)
  const g3 = groupEnsembleSpans([
    span("a", ["x"], ["ens-b"]),
    span("a", ["y"], ["ens-b"]),
  ]);
  check("group: same speaker stays separate", g3[0] !== g3[1], g3.join(","));

  // 4. bridging: A~batch~B~shot~C is ONE group of three
  const g4 = groupEnsembleSpans([
    span("a", ["s1"], ["ens-c"]),
    span("b", ["s2"], ["ens-c"]),
    span("c", ["s2"], []),
  ]);
  check("group: bridge merges three speakers", new Set(g4).size === 1, g4.join(","));
  check("sizes: trio -> [3]", JSON.stringify(ensembleGroupSizes(g4)) === JSON.stringify([3]), ensembleGroupSizes(g4).join(","));

  // 5. different batches, no shot overlap -> separate groups
  const g5 = groupEnsembleSpans([
    span("a", ["s1"], ["ens-d"]),
    span("b", ["s2"], ["ens-e"]),
  ]);
  check("group: different batches stay separate", g5[0] !== g5[1], g5.join(","));

  // 6. computeArcSpans collects the batch ids from the lines
  const withBatch = (speaker: string, text: string, state: string | null, arcBatch?: string) =>
    `{"speaker":"${speaker}","text":"${text}","kind":"SPEECH"${state ? `,"state":"${state}"` : ""}${arcBatch ? `,"arcBatch":"${arcBatch}"` : ""}}`;
  const shots: ArcShotInput[] = [
    { id: "f1", sceneId: "sc", sceneNumber: 1, number: 1, dialogue: `[${withBatch("Lin", "a", "Possessed", "ens-x")}]` },
    { id: "f2", sceneId: "sc", sceneNumber: 1, number: 2, dialogue: `[${withBatch("Rival", "b", "Possessor", "ens-x")}]` },
    { id: "f3", sceneId: "sc", sceneNumber: 1, number: 3, dialogue: `[${withBatch("Lin", "c", "Possessed", "ens-x")}]` },
    { id: "f4", sceneId: "sc", sceneNumber: 1, number: 4, dialogue: `[${withBatch("Rival", "d", null)}]` },
  ];
  const spans = computeArcSpans(shots);
  // alternating STATE lines from different speakers open per-line runs:
  // 3 spans (Lin f1, Rival f2, Lin f3), each carrying the batch
  check("spans: alternating state runs -> 3 per-line spans", spans.length === 3, String(spans.length));
  check("spans: Lin run f1 carries the batch", JSON.stringify(spans[0].shotIds) === JSON.stringify(["f1"]) && JSON.stringify(spans[0].arcBatches) === JSON.stringify(["ens-x"]), `${spans[0].shotIds.join(",")}|${spans[0].arcBatches.join(",")}`);
  check("spans: rival run carries the batch too", spans[1].arcBatches.length === 1 && spans[1].arcBatches[0] === "ens-x", spans[1].arcBatches.join(","));
  const g6 = groupEnsembleSpans(spans);
  check("group: real spans from one batch read as ONE beat of 3", new Set(g6).size === 1 && ensembleGroupSizes(g6)[g6[0]] === 3, g6.join(","));

  // 7. the painter stamps arcBatch on changed lines; solo applies clear it
  const mk = (lines: TemplateShotInput["lines"]): TemplateShotInput => ({ shotId: "", lines });
  const base = [mk(parseDialogue(`[${withBatch("Lin", "one", null)}]`))];
  const [withEns, nEns] = applyArcTemplate(base, "Lin", { id: "t", name: "t", description: "", segments: [{ frac: 1, kind: "state" }] }, "Possessed", { batchId: "ens-z" });
  check("painter: ensemble batch lands on the changed line", nEns === 1 && withEns[0].lines[0].arcBatch === "ens-z", String(withEns[0].lines[0].arcBatch));
  const [solo, nSolo] = applyArcTemplate(base.map((b) => ({ shotId: b.shotId, lines: b.lines })), "Lin", { id: "t", name: "t", description: "", segments: [{ frac: 1, kind: "state" }] }, "Possessed");
  check("painter: solo apply clears any batch", nSolo === 1 && solo[0].lines[0].arcBatch === null, String(solo[0].lines[0].arcBatch));

  // 8. serialize keeps the tag; a line without one serializes unchanged
  check("serialize: arcBatch survives the round trip", JSON.parse(serializeDialogue(withEns[0].lines))[0].arcBatch === "ens-z", "");
  check("serialize: no batch -> no key (byte-compatible)", !JSON.parse(serializeDialogue(parseDialogue(FIXTURE_DIALOGUES[1])))[0].arcBatch, serializeDialogue(parseDialogue(FIXTURE_DIALOGUES[1])));
}

if (step === "tool") {
  // fixture character + states: the rival needs a Character row for state
  // resolution; both fixture states are TEMPORARY @Ep9 (never auto-apply at
  // Ep10) with variant + pitch hints so stamped lines move the rendered sigs
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  const rival = await db.character.create({ data: { projectId, name: RIVAL, role: "rival (e2e fixture)" } });
  const lin = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true, name: true } });
  if (!lin) throw new Error("Lin Yue not found");
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  await db.characterState.create({ data: { characterId: lin.id, label: LIN_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  await db.characterState.create({ data: { characterId: rival.id, label: RIVAL_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.85 } });

  const fixture = await ensureEpisodeFixture();
  const epNum = fixture.ep.number;
  const rangeArgs = { scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE };

  // render real takes on S1 (Lin) and S2 (Rival)
  const r1 = await renderVoiceTake(fixture.cue1.id);
  check("fixture: Lin take rendered", Boolean(r1.cue.voiceUrl), `bytes=${r1.bytes}`);
  const r2 = await renderVoiceTake(fixture.cue2.id);
  check("fixture: rival take rendered", Boolean(r2.cue.voiceUrl), `bytes=${r2.bytes}`);

  // 1. ENSEMBLE apply: shared state for Lin, per-speaker override for the rival;
  //    3 lines each -> possession plan 1/1/1 stamps the MIDDLE line of each speaker
  const e1 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  check("ensemble: header counts 2 speakers and the batch total", e1.status === "OK" && e1.result.includes(`Ensemble arc template "possession spread" with 2 speakers across scene 30 shots 1-6: 2 line(s) stamped in shot(s) 3, 4.`), e1.result.slice(0, 240));
  check("ensemble: Lin breakdown with full state label", e1.result.includes(`- Lin Yue with "${LIN_STATE}": 1 line(s) stamped of 3. Shape: auto x1 (0 stamped), "${LIN_STATE}" x1 (1 stamped), auto x1 (0 stamped).`), e1.result.slice(0, 420));
  check("ensemble: rival breakdown with the per-speaker state", e1.result.includes(`- ${RIVAL} with "${RIVAL_STATE}": 1 line(s) stamped of 3.`), e1.result.slice(0, 620));
  check("ensemble: ONE clean direction impact (renders sit in auto segments)", e1.result.includes(`Direction impact: episode ${epNum} is clean (2 fresh, 0 unrendered) - no rendered take moved.`), e1.result.slice(-260));
  const sc1 = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const linesOf = (n: number) => parseDialogue(sc1!.shots.find((s) => s.number === n)!.dialogue);
  check("ensemble: DB - S3 carries the Lin state + batch, S4 the rival state + batch", linesOf(3)[0].state === LIN_STATE && linesOf(4)[0].state === RIVAL_STATE && linesOf(3)[0].arcBatch?.startsWith("ens-") === true && linesOf(3)[0].arcBatch === linesOf(4)[0].arcBatch, `${linesOf(3)[0].arcBatch} / ${linesOf(4)[0].arcBatch}`);
  check("ensemble: DB - rendered lines S1+S2 stay auto (and fresh)", linesOf(1)[0].state === null && linesOf(2)[0].state === null, "");

  // 2. re-running the SAME ensemble is a no-op
  const e2 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  check("ensemble: re-run is a no-op with per-speaker noop lines", e2.status === "OK" && e2.result.includes("0 line(s) stamped") && e2.result.includes(`- Lin Yue: all 3 line(s) already carry the template's shape - nothing to change.`) && e2.result.includes("No take moved, so no re-render is needed."), e2.result.slice(0, 320));

  // 3. recovery ensemble forces the HEADS: the two RENDERED takes go stale and
  //    ONE re-render offer covers both speakers (per-speaker states: the rival's
  //    only fixture state is the Possessor one)
  const e3 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue", stateLabel: "Possessed" }, { name: RIVAL, stateLabel: "Possessor" }],
    template: "recovery arc",
  });
  check("ensemble: recovery stamps the head lines of both speakers", e3.status === "OK" && e3.result.includes("2 line(s) stamped in shot(s) 1, 2."), e3.result.slice(0, 240));
  check("ensemble: per-speaker states ride one batch", e3.result.includes(`- Lin Yue with "${LIN_STATE}"`) && e3.result.includes(`- ${RIVAL} with "${RIVAL_STATE}"`) && e3.result.includes("with 2 speakers"), e3.result.slice(0, 520));
  check("ensemble: ONE impact counts both speakers' takes", (e3.result.match(/Offer the re-render in the same turn/g) ?? []).length === 1 && e3.result.includes(`Direction impact: episode ${epNum} now has 2 stale take(s)`), e3.result.slice(-300));
  const d3 = await diffEpisodeById(fixture.ep.id);
  check("ensemble: diff agrees - exactly 2 stale", d3?.stale === 2 && d3?.fresh === 0, `stale=${d3?.stale} fresh=${d3?.fresh}`);

  // 4. real-data spans: the two batch-tagged runs read as ONE ensemble beat
  const eps = await db.episode.findFirst({
    where: { number: FIXTURE_EPISODE, season: { projectId } },
    include: { scenes: { include: { shots: { orderBy: { number: "asc" } } } } },
  });
  const arcShots: ArcShotInput[] = eps!.scenes[0].shots.map((sh) => ({ id: sh.id, sceneId: eps!.scenes[0].id, sceneNumber: eps!.scenes[0].number, number: sh.number, dialogue: sh.dialogue }));
  const realSpans = computeArcSpans(arcShots);
  const realGroups = groupEnsembleSpans(realSpans);
  const realSizes = ensembleGroupSizes(realGroups);
  // alternating stamped lines -> 4 per-line runs, all tagged with ONE batch
  check("ruler: all four runs carry the SAME batch", realSpans.length === 4 && realSpans.every((s) => s.arcBatches.length === 1 && s.arcBatches[0] === realSpans[0].arcBatches[0]), realSpans.map((s) => `${s.speaker}:${s.arcBatches.join("|")}`).join(" / "));
  check("ruler: groupEnsembleSpans reads ONE beat of 4", new Set(realGroups).size === 1 && realSizes[realGroups[0]] === 4, realGroups.join(","));

  // 5. partial skip: unknown name is reported without sinking the batch
  const e5 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue", stateLabel: "Battle-damaged" }, { name: "Nobody Here" }],
    template: "full takeover",
  });
  check("skip: unknown speaker reported, batch continues", e5.status === "OK" && e5.result.includes("- Nobody Here: SKIPPED (Character 'Nobody Here' not found.)") && e5.result.includes("with 1 speaker"), e5.result.slice(0, 420));
  check("skip: Lin applies with her own state", e5.result.includes("- Lin Yue with \"Battle-damaged (temple fight)\": 3 line(s) stamped of 3."), e5.result.slice(0, 620));

  // 6. total skip -> ERROR with every reason
  const e6 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: ["Nobody Here", "Ghost"],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  check("skip: all-unresolvable speakers ERROR", e6.status === "ERROR" && e6.result.includes("Ensemble apply resolved no speaker.") && e6.result.includes("- Nobody Here: Character 'Nobody Here' not found.") && e6.result.includes("- Ghost: Character 'Ghost' not found."), e6.result.slice(0, 300));

  // 7. unmatched state skips; solo -> ERROR carrying the state error
  const e7 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue", stateLabel: "Enlightened" }],
    template: "possession spread",
  });
  check("skip: unmatched state surfaces the resolve error", e7.status === "ERROR" && e7.result.includes("Ensemble apply resolved no speaker.") && e7.result.includes("No state of Lin Yue matches 'Enlightened'"), e7.result.slice(0, 300));

  // 8. no state anywhere -> explicit ensemble state error
  const e8 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: ["Lin Yue", RIVAL],
    template: "possession spread",
  });
  check("args: missing state -> ensemble state error", e8.status === "ERROR" && e8.result.includes("Ensemble applies need a state"), e8.result.slice(0, 220));

  // 9. malformed characters args
  const e9a = await executeTool(projectId, "apply_arc_template", { ...rangeArgs, characters: "Lin Yue", stateLabel: "Possessed", template: "possession spread" });
  check("args: non-JSON string -> usage", e9a.status === "ERROR" && e9a.result.includes("characters must be a JSON array"), e9a.result.slice(0, 160));
  const e9b = await executeTool(projectId, "apply_arc_template", { ...rangeArgs, characters: [], stateLabel: "Possessed", template: "possession spread" });
  check("args: empty array -> usage", e9b.status === "ERROR" && e9b.result.includes("characters must be a JSON array"), e9b.result.slice(0, 160));
  const e9c = await executeTool(projectId, "apply_arc_template", { ...rangeArgs, characters: [{ name: "" }], stateLabel: "Possessed", template: "possession spread" });
  check("args: nameless entry", e9c.status === "ERROR" && e9c.result.includes("characters entries must carry a speaker name."), e9c.result.slice(0, 160));
  const e9d = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: ["a", "b", "c", "d", "e", "f", "g"],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  check("args: over the 6-speaker cap", e9d.status === "ERROR" && e9d.result.includes("at most 6 speakers"), e9d.result.slice(0, 160));

  // 10. clear everything, then the SUGGEST ensemble chain lands both speakers
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: RIVAL, stateLabel: "" });
  const e10 = await executeTool(projectId, "suggest_arc_template", {
    ...rangeArgs,
    description: "she starts normal, the possession takes hold mid-scene, then it releases",
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
  });
  check("chain: match header + applied-in-this-batch", e10.status === "OK" && e10.result.includes("Template match:") && e10.result.includes("Applied in this batch:"), e10.result.slice(0, 300));
  check("chain: the ensemble apply rode the same call", e10.result.includes(`Applied in this batch: Ensemble arc template "possession spread" with 2 speakers across scene 30 shots 1-6: 2 line(s) stamped in shot(s) 3, 4.`), e10.result.slice(200, 700));
  check("chain: closing guidance names the single re-render offer", e10.result.includes("The beat landed in one batch: put the re-render offer from the Direction impact above in your reply"), e10.result.slice(-260));
  const sc10 = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const lines10 = (n: number) => parseDialogue(sc10!.shots.find((s) => s.number === n)!.dialogue);
  check("chain: DB stamped both speakers again", lines10(3)[0].state === LIN_STATE && lines10(4)[0].state === RIVAL_STATE, `${lines10(3)[0].state} / ${lines10(4)[0].state}`);

  // 11. prose names BOTH cast members -> the ensemble hint points at characters
  const e11 = await executeTool(projectId, "suggest_arc_template", {
    description: `Lin Yue and ${RIVAL} both start normal, then the possession takes hold mid-scene, and it releases`,
  });
  check("hint: ensemble reading names both speakers", e11.status === "OK" && e11.result.includes(`Ensemble beat: the description names Lin Yue and ${RIVAL}.`), e11.result.slice(0, 700));
  check("hint: the characters example carries the per-speaker stateLabel slot", e11.result.includes(`characters:[{name:"Lin Yue"},{name:"${RIVAL}",stateLabel:"..."}]`), e11.result.slice(300, 900));

  // 12. the SINGLE-speaker format is untouched (byte-format pinned); the clear
  //     above also proves a solo direction replaces the ensemble states
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  const e12 = await executeTool(projectId, "apply_arc_template", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "Possessed", template: "recovery arc" });
  check("legacy: solo header format unchanged", e12.status === "OK" && e12.result.startsWith(`Arc template "recovery arc" on Lin Yue with "${LIN_STATE}" across scene 30 shots 1-6: 2 line(s) stamped in shot(s) 1, 3. Shape: "${LIN_STATE}" x2 (2 stamped), auto x1 (0 stamped).`), e12.result.slice(0, 300));

  // 13. set_state_arc clears states AND the batch tag
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  const sc13 = await db.scene.findFirst({ where: { id: fixture.scene.id }, include: { shots: { orderBy: { number: "asc" } } } });
  const lines13 = (n: number) => parseDialogue(sc13!.shots.find((s) => s.number === n)!.dialogue);
  check("clear: state gone and batch dropped on the changed line", lines13(1)[0].state === null && lines13(1)[0].arcBatch === null && lines13(3)[0].state === null, `s1=${lines13(1)[0].state}/${lines13(1)[0].arcBatch}`);

  // 14. events: ensemble batches logged as ONE event each
  const ensEvents = await db.productionEvent.count({ where: { projectId, summary: { contains: "(ensemble: Lin Yue, E2E Rival Wei)" } } });
  check("events: ensemble applies logged with the ensemble tag", ensEvents >= 3, String(ensEvents));
  const soloEvents = await db.productionEvent.count({ where: { projectId, summary: { contains: `applied arc template "recovery arc" (${LIN_STATE}) on Lin Yue` } } });
  const soloEnsembleTagged = await db.productionEvent.count({ where: { projectId, AND: [{ summary: { contains: `applied arc template "recovery arc" (${LIN_STATE}) on Lin Yue` } }, { summary: { contains: "(ensemble:" } }] } });
  check("events: solo apply logged without the ensemble tag", soloEvents >= 1 && soloEnsembleTagged === 0, `${soloEvents}/${soloEnsembleTagged}`);

  // 15. cleanup: the real season is untouched
  await cleanupEpisodeFixture([fixture.cue1.id, fixture.cue2.id]);
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  const dEnd = await diffEpisodeById((await ep7()).id);
  check("restore: Ep7 untouched (0 fresh / 0 stale / 1 unrendered)", dEnd?.stale === 0 && dEnd?.fresh === 0 && dEnd?.unrendered === 1, `stale=${dEnd?.stale} fresh=${dEnd?.fresh} unrendered=${dEnd?.unrendered}`);
  const epsAfter = await db.episode.findMany({ where: { season: { projectId } }, select: { number: true } });
  check("restore: fixture episode removed", epsAfter.every((e) => e.number !== FIXTURE_EPISODE), epsAfter.map((e) => `Ep${e.number}`).join(","));
  const rivalsLeft = await db.character.count({ where: { projectId, name: RIVAL } });
  check("restore: fixture character removed", rivalsLeft === 0, String(rivalsLeft));
}

if (step === "cleanup") {
  await cleanupEpisodeFixture([]);
  console.log("cleanup done");
}

await db.$disconnect();
if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");

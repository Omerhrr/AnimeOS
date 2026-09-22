// E2E Iteration 18: cross-scene state arcs + arc spans on shot cards.
// Steps:
//   plan    - pure computeArcSpans/arcSpansForShot/label checks (no DB writes)
//   fixture - (re)creates the temporary cross-scene fixture: Sc13 in Ep7 with Lin Yue lines
//   tool    - set_state_arc scope:'episode' stamps across Sc12+Sc13, spans computed from
//             the real episode data, diff staleness follows, partial ranges, error paths;
//             restores dialogues and removes the fixture at the end
//   cleanup - removes the fixture and restores Sc12 dialogues (safety net)
// The season ends fresh: every dialogue touched is restored exactly.
import { executeTool } from "@/lib/dsh/tools";
import { parseDialogue, serializeDialogue } from "@/lib/comic/dialogue";
import {
  arcSpansForShot, computeArcSpans, describeArcPosition, formatArcRange,
} from "@/lib/comic/arcs";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
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

const FIXTURE_SCENE = 13;
const FIXTURE_DIALOGUES: Record<number, string> = {
  1: serializeDialogue([{ speaker: "Lin Yue", text: "The storm answers to the sword, not to you.", kind: "SPEECH" }]),
  2: serializeDialogue([
    { speaker: "", text: "Wind dies.", kind: "SPEECH" },
    { speaker: "Lin Yue", text: "Then watch closely.", kind: "THOUGHT" },
  ]),
};

async function ensureFixture() {
  const ep = await ep7();
  await db.scene.deleteMany({ where: { episodeId: ep.id, number: FIXTURE_SCENE } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Inner Hall - aftermath (E2E fixture)", weather: "Rain", timeOfDay: "Night", status: "DRAFT" },
  });
  await db.shot.create({
    data: { sceneId: scene.id, number: 1, description: "Fixture shot - Lin Yue stands over the broken altar, blade lowered.", shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[1] },
  });
  await db.shot.create({
    data: { sceneId: scene.id, number: 2, description: "Fixture shot - the rival's shadow retreats through the doors.", shotType: "WIDE", dialogue: FIXTURE_DIALOGUES[2] },
  });
  return scene;
}

async function cleanupFixture() {
  const ep = await ep7();
  await db.scene.deleteMany({ where: { episodeId: ep.id, number: FIXTURE_SCENE } });
  const scene = await sc12Shots();
  for (const s of scene.shots) {
    const original: Record<number, string> = {
      1: '[{"speaker":"Lin Yue","text":"The Jade Sword still answers my call.","kind":"SPEECH"}]',
      3: '[{"speaker":"Lin Yue","text":"The rain... it stopped.","kind":"THOUGHT"}]',
    };
    if (original[s.number] !== undefined) {
      await db.shot.update({ where: { id: s.id }, data: { dialogue: original[s.number] } });
    }
  }
}

if (step === "plan") {
  // 1. spans: runs of same speaker + state; other speakers do not break, auto lines do
  const shots = [
    { id: "a1", sceneId: "s1", sceneNumber: 12, number: 4, dialogue: '[{"speaker":"Lin","text":"one","kind":"SPEECH","state":"Possessed"}]' },
    { id: "a2", sceneId: "s1", sceneNumber: 12, number: 5, dialogue: '[{"speaker":"Rival","text":"ha","kind":"SPEECH"},{"speaker":"Lin","text":"one-and-half","kind":"SPEECH","state":"Possessed"}]' },
    { id: "a3", sceneId: "s2", sceneNumber: 13, number: 1, dialogue: '[{"speaker":"lin","text":"two","kind":"SPEECH","state":"Possessed"},{"speaker":"Lin","text":"three","kind":"SPEECH"}]' },
    { id: "a4", sceneId: "s2", sceneNumber: 13, number: 2, dialogue: '[{"speaker":"Lin","text":"four","kind":"SPEECH","state":"Possessed"}]' },
    { id: "a5", sceneId: "s2", sceneNumber: 13, number: 3, dialogue: '[{"speaker":"Lin","text":"five","kind":"SPEECH","state":"Possessed"}]' },
  ];
  const spans = computeArcSpans(shots);
  check("spans: auto line of the same speaker breaks, state resume opens a new span", spans.length === 2, `n=${spans.length}`);
  const [s1, s2] = spans;
  check("spans: first run crosses scenes", s1.crossesScene === true && s1.startScene === 12 && s1.endScene === 13, `${s1.startScene}->${s1.endScene}`);
  check("spans: first run covers a1+a2+a3 (case-insensitive speaker, rivals do not break)", JSON.stringify(s1.shotIds) === JSON.stringify(["a1", "a2", "a3"]) && s1.lineCount === 3 && s1.shotCount === 3, s1.shotIds.join(","));
  check("spans: second run is same-scene, resumed at a4 and continued into a5", s2.crossesScene === false && JSON.stringify(s2.shotIds) === JSON.stringify(["a4", "a5"]) && s2.lineCount === 2 && s2.shotCount === 2, s2.shotIds.join(","));
  check("spans: different state does not merge into the first run", s2.state === "Possessed" && s1.endShotId === "a3", s2.state);

  // 2. positions per shot
  const atStart = arcSpansForShot(spans, "a1");
  check("positions: start shot starts its span", atStart.length === 1 && atStart[0].startsHere && !atStart[0].endsHere, "");
  const atMiddle = arcSpansForShot(spans, "a2");
  check("positions: mid shot runs through", atMiddle.length === 1 && !atMiddle[0].startsHere && !atMiddle[0].endsHere, "");
  const atBreak = arcSpansForShot(spans, "a3");
  check("positions: the breaking auto line makes a3 the span end", atBreak.length === 1 && !atBreak[0].startsHere && atBreak[0].endsHere, "");
  const atResume = arcSpansForShot(spans, "a4");
  check("positions: resumed span starts at its first shot", atResume.length === 1 && atResume[0].startsHere && !atResume[0].endsHere, "");
  const atEnd = arcSpansForShot(spans, "a5");
  check("positions: span ends at its last shot", atEnd.length === 1 && !atEnd[0].startsHere && atEnd[0].endsHere, "");
  check("positions: untouched shot has no spans", arcSpansForShot(spans, "a-nope").length === 0, "");

  // 3. labels
  check("labels: same scene range", formatArcRange({ startScene: 12, startShot: 4, endScene: 12, endShot: 6 }) === "Sc12 shots 4-6", formatArcRange({ startScene: 12, startShot: 4, endScene: 12, endShot: 6 }));
  check("labels: single shot", formatArcRange({ startScene: 12, startShot: 3, endScene: 12, endShot: 3 }) === "Sc12 shot 3", formatArcRange({ startScene: 12, startShot: 3, endScene: 12, endShot: 3 }));
  check("labels: cross-scene range", formatArcRange({ startScene: 12, startShot: 4, endScene: 13, endShot: 1 }) === "Sc12 S4 → Sc13 S1", formatArcRange({ startScene: 12, startShot: 4, endScene: 13, endShot: 1 }));
  check("labels: positions", describeArcPosition(true, true) === "starts and ends here" && describeArcPosition(true, false) === "starts here" && describeArcPosition(false, true) === "ends here" && describeArcPosition(false, false) === "runs through", "");
} else if (step === "fixture") {
  const scene = await ensureFixture();
  console.log(`Fixture ready: Sc${scene.number} with 2 shots in Ep7`);
} else if (step === "cleanup") {
  await cleanupFixture();
  const diff = await diffEpisodeById((await ep7()).id);
  check("cleanup: season fresh", diff?.stale === 0, `${diff?.fresh} fresh / ${diff?.stale} stale`);
} else if (step === "tool") {
  await ensureFixture();
  const scene = await sc12Shots();
  const originalDialogues = new Map(scene.shots.map((s) => [s.id, s.dialogue]));

  // 1. episode-scope stamp from Sc12 S1 through the end of the episode (Sc13 S2)
  const r1 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "S02", scope: "episode", sceneNumber: 12, shotFrom: 1 });
  console.log(`set_state_arc [${r1.status}] ${r1.result}`);
  check("arc: OK", r1.status === "OK");
  check("arc: four lines stamped across both scenes", r1.result.includes("4 line(s) stamped"), r1.result.slice(0, 140));
  check("arc: range names the episode and both scenes", r1.result.includes("across episode 7 (Sc12 S1 → Sc13 S2)"), r1.result.slice(0, 90));
  check("arc: touched labels carry scene prefixes", r1.result.includes("Sc12 S1, Sc12 S3, Sc13 S1, Sc13 S2"), r1.result.slice(0, 160));
  check("arc: stamps the FULL state label", r1.result.includes('"S02 - Foundation Established"'), r1.result.slice(0, 60));

  // 2. DB: every Lin Yue line in the range carries the override, earlier/other shots untouched
  const freshSc12 = await sc12Shots();
  const shot1 = freshSc12.shots.find((s) => s.number === 1)!;
  const shot3 = freshSc12.shots.find((s) => s.number === 3)!;
  const sc13 = await db.scene.findFirst({ where: { number: FIXTURE_SCENE, episodeId: (await ep7()).id }, include: { shots: { orderBy: { number: "asc" } } } });
  const f1 = parseDialogue((await db.shot.findUnique({ where: { id: shot1.id }, select: { dialogue: true } }))?.dialogue ?? null);
  const f3 = parseDialogue((await db.shot.findUnique({ where: { id: shot3.id }, select: { dialogue: true } }))?.dialogue ?? null);
  const g1 = parseDialogue(sc13!.shots[0].dialogue);
  const g2 = parseDialogue(sc13!.shots[1].dialogue);
  check("db: Sc12 S1 stamped", f1[0]?.state === "S02 - Foundation Established", String(f1[0]?.state));
  check("db: Sc12 S3 stamped", f3[0]?.state === "S02 - Foundation Established", String(f3[0]?.state));
  check("db: Sc13 S1 stamped", g1[0]?.state === "S02 - Foundation Established", String(g1[0]?.state));
  check("db: Sc13 S2 second line stamped (narration untouched)", g2[0]?.state === null && g2[1]?.state === "S02 - Foundation Established", `${String(g2[0]?.state)} / ${String(g2[1]?.state)}`);

  // 3. arc spans computed from the real episode data
  const ordered = (await ep7()).scenes
    .sort((a, b) => a.number - b.number)
    .flatMap((sc) => sc.shots.sort((a, b) => a.number - b.number).map((sh) => ({ id: sh.id, sceneId: sc.id, sceneNumber: sc.number, number: sh.number, dialogue: sh.dialogue ?? null })));
  const spans = computeArcSpans(ordered);
  const linSpan = spans.find((sp) => sp.speakerKey === "lin yue" && sp.state === "S02 - Foundation Established");
  check("spans: one cross-scene span from the stamped dialogue", Boolean(linSpan) && linSpan!.crossesScene === true, linSpan ? `${linSpan.startScene}->${linSpan.endScene}` : "none");
  check("spans: span covers all four shots in episode order", linSpan?.lineCount === 4 && linSpan?.shotCount === 4 && JSON.stringify(linSpan?.shotIds) === JSON.stringify([shot1.id, shot3.id, sc13!.shots[0].id, sc13!.shots[1].id]), linSpan?.shotIds.length.toFixed(0) ?? "0");
  const midPos = arcSpansForShot(spans, shot3.id)[0];
  const endPos = arcSpansForShot(spans, sc13!.shots[1].id)[0];
  check("spans: Sc12 S3 runs through, Sc13 S2 ends the span", midPos && !midPos.startsHere && !midPos.endsHere && endPos && !endPos.startsHere && endPos.endsHere, "");

  // 4. diff: only the Sc12 S1 take exists, and the arc makes it stale
  const diff = await diffEpisodeById((await ep7()).id);
  const staleRows = diff?.cues.filter((c) => c.status === "stale") ?? [];
  check("diff: exactly the arc take is stale", staleRows.length === 1 && staleRows[0].shotNumber === 1, staleRows.map((r) => `S${r.shotNumber}`).join(","));
  check("diff: the change names the voice", staleRows[0]?.changed.includes("voice / casting"), staleRows[0]?.changed.join(", "));

  // 5. clear the whole episode arc in one call
  const r2 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "", scope: "episode" });
  check("clear: four lines cleared", r2.status === "OK" && r2.result.includes("4 line(s) stamped"), r2.result.slice(0, 140));
  const diffFresh = await diffEpisodeById((await ep7()).id);
  check("clear: diff fresh again", diffFresh?.stale === 0, `${diffFresh?.fresh} fresh / ${diffFresh?.stale} stale`);

  // 6. partial cross-scene range: Sc12 S3 through Sc13 S1
  const r3 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "S02", scope: "episode", sceneNumber: 12, shotFrom: 3, toSceneNumber: 13, shotTo: 1 });
  check("partial: two lines stamped", r3.status === "OK" && r3.result.includes("2 line(s) stamped") && r3.result.includes("Sc12 S3, Sc13 S1"), r3.result.slice(0, 160));
  const sc12AfterPartial = await sc12Shots();
  const s1Lines = parseDialogue((await db.shot.findUnique({ where: { id: sc12AfterPartial.shots.find((s) => s.number === 1)!.id }, select: { dialogue: true } }))?.dialogue ?? null);
  const sc13AfterPartial = await db.scene.findFirst({ where: { number: FIXTURE_SCENE, episodeId: (await ep7()).id }, include: { shots: { orderBy: { number: "asc" } } } });
  const f1b = parseDialogue((await db.shot.findUnique({ where: { id: sc12AfterPartial.shots.find((s) => s.number === 3)!.id }, select: { dialogue: true } }))?.dialogue ?? null);
  const g1b = parseDialogue(sc13AfterPartial!.shots[0].dialogue);
  const g2b = parseDialogue(sc13AfterPartial!.shots[1].dialogue);
  check("partial: before-range shot untouched", s1Lines[0]?.state === null, String(s1Lines[0]?.state));
  check("partial: range edges stamped, past-end shot untouched", f1b[0]?.state === "S02 - Foundation Established" && g1b[0]?.state === "S02 - Foundation Established" && g2b[1]?.state === null, "");
  const r4 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "", scope: "episode" });
  check("partial: cleared again", r4.status === "OK" && r4.result.includes("2 line(s) stamped"), r4.result.slice(0, 120));

  // 7. scene scope regression: same scene-scope wording and behavior as before
  const r5 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "S02", sceneNumber: 12, shotFrom: 1, shotTo: 1 });
  check("scene scope: single-shot stamp works", r5.status === "OK" && r5.result.includes("across scene 12 shots 1-1") && r5.result.includes("1 line(s) stamped in shot(s) 1"), r5.result.slice(0, 120));
  const r6 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "", sceneNumber: 12, shotFrom: 1, shotTo: 1 });
  check("scene scope: cleared back", r6.status === "OK" && r6.result.includes("1 line(s) stamped"), r6.result.slice(0, 120));

  // 8. error paths
  const e1 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", scope: "episode", episodeNumber: 99 });
  check("error: unknown episode", e1.status === "ERROR" && e1.result.includes("No episode 99 with shots"), e1.result.slice(0, 90));
  const e2 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", scope: "episode", sceneNumber: 99 });
  check("error: unknown start scene lists scenes", e2.status === "ERROR" && e2.result.includes("Episode 7 has no scene 99") && e2.result.includes("Sc12") && e2.result.includes("Sc13"), e2.result.slice(0, 140));
  const e3 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", scope: "episode", toSceneNumber: 99 });
  check("error: unknown end scene lists scenes", e3.status === "ERROR" && e3.result.includes("no scene 99"), e3.result.slice(0, 90));
  const e4 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", scope: "episode", sceneNumber: 12, shotFrom: 90 });
  check("error: shotFrom out of range", e4.status === "ERROR" && e4.result.includes("Scene 12 has no shot 90"), e4.result.slice(0, 90));
  const e5 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", scope: "episode", sceneNumber: 13, toSceneNumber: 12 });
  check("error: inverted cross-scene range", e5.status === "ERROR" && e5.result.includes("the arc must run forward"), e5.result.slice(0, 110));
  const e6 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", scope: "episode", sceneNumber: 12, toSceneNumber: 12, shotFrom: 5, shotTo: 2 });
  check("error: inverted in-scene range under episode scope", e6.status === "ERROR" && e6.result.includes("the arc must run forward"), e6.result.slice(0, 110));

  // 9. restore Sc12 dialogues exactly and remove the fixture
  for (const [shotId, dialogue] of originalDialogues) {
    await db.shot.update({ where: { id: shotId }, data: { dialogue } });
  }
  await cleanupFixture();
  const diffRestored = await diffEpisodeById((await ep7()).id);
  check("restore: season ends fresh", diffRestored?.stale === 0, `${diffRestored?.fresh} fresh / ${diffRestored?.stale} stale`);
  const scenesLeft = (await ep7()).scenes.length;
  check("restore: fixture removed", scenesLeft === 1, `scenes=${scenesLeft}`);
} else {
  throw new Error(`Unknown step '${step}' (use plan | fixture | tool | cleanup)`);
}

await db.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

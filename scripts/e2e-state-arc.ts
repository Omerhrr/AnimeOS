// E2E: state arcs across a shot range + DSH proposing the export pre-flight.
// Steps:
//   plan - pure stampStateArc checks + plan resolution for arcs forced
//          OUT of their episode window and pulling a temporary state IN
//          (no TTS; runs against a temporary fixture state, no DB writes
//          beyond the state itself)
//   tool - set_state_arc stamps/clears across the fixture scene (Ep8 Sc20,
//          4 shots), diff staleness follows the arc, pre-flight proposal
//          rides the diff result, error paths listed
// Every step removes what it created, so the season ends exactly as it started.
import { executeTool } from "@/lib/dsh/tools";
import { resolveTakePlan } from "@/lib/ai/voice-plan";
import { parseDialogue, serializeDialogue, stampStateArc } from "@/lib/comic/dialogue";
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

const FIXTURE_EPISODE = 8;
const FIXTURE_SCENE = 20;
const STATE_LABEL = "E2E Possessed";
const STATE_FULL = "E2E Possessed (fixture)";
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

async function ensureFixtureState() {
  const chId = await linYueId();
  await db.characterState.deleteMany({ where: { characterId: chId, label: STATE_FULL } });
  await db.characterState.create({
    data: { characterId: chId, label: STATE_FULL, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 },
  });
}

async function removeFixtureState() {
  const chId = await linYueId();
  await db.characterState.deleteMany({ where: { characterId: chId, label: STATE_FULL } });
}

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "State arc fixture (E2E)", status: "DRAFT" } });
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
}

if (step === "plan") {
  await ensureFixtureState();

  // 1. stampStateArc: stamps only the speaker's lines, from the index onward
  const lines = parseDialogue('[{"speaker":"Lin Yue","text":"one","kind":"SPEECH"}]');
  const [stamped1, n1] = stampStateArc(lines, "lin yue", 0, "Foundation Established");
  check("arc: case-insensitive speaker stamp", n1 === 1 && stamped1[0].state === "Foundation Established", `n=${n1}`);
  const [re, n2] = stampStateArc(stamped1, "Lin Yue", 0, "Foundation Established");
  check("arc: re-stamp is a no-op", n2 === 0 && JSON.stringify(re) === JSON.stringify(stamped1), `n=${n2}`);
  const [other, n3] = stampStateArc(lines, "Someone Else", 0, "Foundation Established");
  check("arc: other speakers untouched", n3 === 0 && JSON.stringify(other) === JSON.stringify(lines), `n=${n3}`);
  const [cleared, n4] = stampStateArc(stamped1, "Lin Yue", 0, null);
  check("arc: null clears", n4 === 1 && cleared[0].state === null, `n=${n4}`);
  const [fromIdx, n5] = stampStateArc(
    parseDialogue('[{"speaker":"A","text":"one","kind":"SPEECH"},{"speaker":"A","text":"two","kind":"SPEECH"},{"speaker":"B","text":"three","kind":"SPEECH"}]'),
    "a", 1, "Possessed",
  );
  check("arc: fromIndex respected, mixed speakers", n5 === 1 && fromIdx[0].state === null && fromIdx[1].state === "Possessed" && fromIdx[2].state === null, `n=${n5}`);

  // 2. arc dialogue forces an OUT-of-episode state: at Ep9 the auto plan rides
  //    the temporary fixture state (kazi/0.8); forcing Foundation Established
  //    (@Ep15, no variant) drops the variant and hints; forcing the fixture
  //    state while resolving at Ep15 pulls the variant IN
  const LINE_TEXT = "The Jade Sword still answers my call.";
  const planOf = (dialogue: string | null, ep: number) =>
    resolveTakePlan(
      { label: `Lin Yue: ${LINE_TEXT}`, voiceDelivery: null, voiceSpeed: null, shot: { dialogue } },
      projectId, ep,
    );
  const auto = await planOf(null, 9);
  check("plan: auto at Ep9 rides the temporary state", auto.variant?.voiceId === "kazi" && auto.pitch === 0.8, `voice=${auto.voiceId} variant=${auto.variant?.voiceId ?? "none"}`);
  const [forcedLines] = stampStateArc(parseDialogue(serializeDialogue([{ speaker: "Lin Yue", text: LINE_TEXT, kind: "SPEECH" }])), "Lin Yue", 0, "Foundation Established");
  const forced = await planOf(serializeDialogue(forcedLines), 9);
  check("plan: arc forces the out-of-episode state", forced.stateOverride === "Foundation Established", String(forced.stateOverride));
  check("plan: forced falls back to the cast voice", forced.variant === null, `variant=${forced.variant?.voiceId ?? "none"}`);
  check("plan: hints gone under the forced state", forced.pitch === 1, `pitch=${forced.pitch}`);
  check("plan: sig moved vs auto", JSON.stringify(forced.sig) !== JSON.stringify(auto.sig));
  const [pulledLines] = stampStateArc(parseDialogue(serializeDialogue([{ speaker: "Lin Yue", text: LINE_TEXT, kind: "SPEECH" }])), "Lin Yue", 0, STATE_FULL);
  const pulled = await planOf(serializeDialogue(pulledLines), 15);
  check("plan: arc pulls the variant into Ep15", pulled.variant?.voiceId === "kazi" && pulled.pitch === 0.8, `voice=${pulled.voiceId} pitch=${pulled.pitch}`);

  await removeFixtureState();
} else if (step === "tool") {
  await ensureFixtureState();
  const fixture = await ensureEpisodeFixture();
  const epNum = fixture.ep.number;

  // render a real take on S1 (auto direction at Ep8: no eligible variant)
  const rendered = await renderVoiceTake(fixture.cue1.id);
  check("fixture: real TTS take rendered on S1", Boolean(rendered.cue.voiceUrl), `voice=${rendered.cue.voiceActor ?? "?"} bytes=${rendered.bytes}`);

  // 1. stamp the fixture state across the whole scene (3 Lin Yue lines: shots 1, 3, 4)
  const r1 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: STATE_LABEL, sceneNumber: FIXTURE_SCENE });
  console.log(`set_state_arc [${r1.status}] ${r1.result.slice(0, 140)}`);
  check("arc: OK", r1.status === "OK");
  check("arc: three lines stamped", r1.result.includes("3 line(s) stamped in shot(s) 1, 3, 4"), r1.result.slice(0, 140));
  check("arc: stamps the FULL state label", r1.result.includes(`"${STATE_FULL}"`), r1.result.slice(0, 80));
  for (const num of [1, 3, 4]) {
    const shot = fixture.scene ? await db.shot.findFirst({ where: { sceneId: fixture.scene.id, number: num } }) : null;
    const fresh = shot ? await db.shot.findUnique({ where: { id: shot.id }, select: { dialogue: true } }) : null;
    const parsed = parseDialogue(fresh?.dialogue ?? null);
    check(`arc: shot ${num} line carries the forced state`, parsed[0]?.state === STATE_FULL, String(parsed[0]?.state));
  }

  // 2. idempotent re-run stamps nothing
  const r2 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: STATE_LABEL, sceneNumber: FIXTURE_SCENE });
  check("arc: re-run is a no-op", r2.status === "OK" && r2.result.includes("0 line(s) stamped") && r2.result.includes("already carry"), r2.result.slice(0, 160));

  // 3. the diff moves: the shot 1 take was rendered auto (no variant, no hints)
  const diff = await diffEpisodeById(fixture.ep.id);
  const staleRows = diff?.cues.filter((c) => c.status === "stale") ?? [];
  check("diff: arc makes exactly the arc take stale", staleRows.length === 1 && staleRows[0].shotNumber === 1, staleRows.map((r) => `S${r.shotNumber}`).join(","));
  check("diff: changed labels name the voice", staleRows[0]?.changed.includes("voice / casting"), staleRows[0]?.changed.join(", "));
  check("diff: current block names the line override", staleRows[0]?.current?.stateOverride === STATE_FULL, String(staleRows[0]?.current?.stateOverride));

  // 4. the diff tool proposes the export pre-flight in the same turn
  const diffTool = await executeTool(projectId, "diff_episode_direction", { episodeNumber: epNum });
  check("preflight: proposal rides the diff result", diffTool.result.includes("Export pre-flight"), diffTool.result.slice(-160));

  // 5. clear the arc: dialogue restored, diff fresh again
  const r3 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "", sceneNumber: FIXTURE_SCENE });
  check("clear: OK", r3.status === "OK" && r3.result.includes("3 line(s) stamped"), r3.result.slice(0, 140));
  const diffFresh = await diffEpisodeById(fixture.ep.id);
  check("clear: diff fresh again", diffFresh?.stale === 0, `${diffFresh?.fresh} fresh / ${diffFresh?.stale} stale`);

  // 6. error paths
  const e1 = await executeTool(projectId, "set_state_arc", { characterName: "Nobody", stateLabel: "possessed" });
  check("error: unknown character", e1.status === "ERROR" && e1.result.includes("not found"), e1.result.slice(0, 80));
  const e2 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "no-such-state" });
  check("error: unknown state lists states", e2.status === "ERROR" && e2.result.includes("States:"), e2.result.slice(0, 80));
  const e3 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "possessed", sceneNumber: FIXTURE_SCENE, shotFrom: 5, shotTo: 2 });
  check("error: inverted range rejected", e3.status === "ERROR" && e3.result.includes("shotFrom must be <= shotTo"), e3.result.slice(0, 80));
  const e4 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "possessed", sceneNumber: FIXTURE_SCENE, shotFrom: 90, shotTo: 95 });
  check("error: out-of-range lists shots", e4.status === "ERROR" && e4.result.includes("Shots: 1, 2, 3, 4"), e4.result.slice(0, 100));
  const e5 = await executeTool(projectId, "set_state_arc", { characterName: "Chen Hao", stateLabel: "possessed", sceneNumber: FIXTURE_SCENE });
  const stateless = e5.status === "ERROR" && e5.result.includes("has no development states");
  const absent = e5.status === "OK" && e5.result.includes("0 line(s) stamped") && e5.result.includes("speakers present: Lin Yue, Su Yan");
  check("error: stateless or absent character handled", stateless || absent, e5.result.slice(0, 120));

  // restore: the fixture and the fixture state are removed entirely
  await cleanupEpisodeFixture(fixture.cue1.id);
  await removeFixtureState();
  const epLeft = await db.episode.count({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const stateLeft = await db.characterState.count({ where: { characterId: await linYueId(), label: STATE_FULL } });
  check("restore: fixture episode and state removed", epLeft === 0 && stateLeft === 0);
  const ep7 = await db.episode.findFirst({ where: { number: 7, season: { projectId } } });
  const diffRestored = ep7 ? await diffEpisodeById(ep7.id) : null;
  check("restore: Ep7 untouched (0 fresh / 0 stale / 1 unrendered)", diffRestored?.fresh === 0 && diffRestored?.stale === 0 && diffRestored?.unrendered === 1, `${diffRestored?.fresh} fresh / ${diffRestored?.stale} stale`);
} else {
  throw new Error(`Unknown step '${step}' (use plan | tool)`);
}

await db.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

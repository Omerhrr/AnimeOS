// E2E: state arcs across a shot range + DSH proposing the export pre-flight.
// Steps:
//   plan - pure stampStateArc checks + plan resolution for arcs forced
//          OUT of their episode window (no TTS)
//   tool - set_state_arc stamps/clears across Ep7 Sc12 (6 shots), diff
//          staleness follows the arc, pre-flight proposal rides the
//          diff result, error paths listed
// Every step restores the dialogue it touched, so the season ends fresh.
import { executeTool } from "@/lib/dsh/tools";
import { resolveTakePlan } from "@/lib/ai/voice-plan";
import { parseDialogue, serializeDialogue, stampStateArc } from "@/lib/comic/dialogue";
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

async function sc12() {
  const scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7, season: { projectId } } },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  if (!scene) throw new Error("Ep7 Sc12 not found");
  return scene;
}

async function ep7Id() {
  return (await db.episode.findFirst({ where: { number: 7, season: { projectId } } }))!.id;
}

if (step === "plan") {
  const scene = await sc12();
  const shot1 = scene.shots.find((s) => s.number === 1)!;
  const cue = await db.audioCue.findFirst({ where: { shotId: shot1.id, kind: "VOICE" } });
  if (!cue) throw new Error("No VOICE cue on Sc12 shot 1");
  const epNumber = 7;

  const planOf = (dialogue: string | null, ep = epNumber) =>
    resolveTakePlan({ label: cue.label, voiceDelivery: cue.voiceDelivery, voiceSpeed: cue.voiceSpeed, shot: { dialogue } }, projectId, ep);

  // 1. stampStateArc: stamps only the speaker's lines, from the index onward
  const lines = parseDialogue(shot1.dialogue);
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

  // 2. arc dialogue forces an OUT-of-episode state: the Ep7 take plan flips
  //    from the auto battle-damaged performance (jam/INJURED/hints) to the
  //    forced Foundation Established (cast voice, no hints)
  const auto = await planOf(shot1.dialogue);
  check("plan: auto at Ep7 rides the episode state", auto.variant?.voiceId === "jam", `voice=${auto.voiceId} variant=${auto.variant?.voiceId ?? "none"}`);
  const forced = await planOf(serializeDialogue(stamped1));
  check("plan: arc forces the out-of-episode state", forced.stateOverride === "Foundation Established", String(forced.stateOverride));
  check("plan: forced falls back to the cast voice", forced.variant === null, `variant=${forced.variant?.voiceId ?? "none"}`);
  check("plan: hints gone under the forced state", forced.pitch === 1 && forced.sig.s === 1, `pitch=${forced.pitch}`);
  check("plan: sig moved vs auto", JSON.stringify(forced.sig) !== JSON.stringify(auto.sig));
  // and the reverse: forcing battle-damaged while resolving at Ep15 pulls the variant IN
  const lines15 = parseDialogue(shot1.dialogue);
  const [stamped15] = stampStateArc(lines15, "Lin Yue", 0, "Battle-damaged (temple fight)");
  const pulled = await planOf(serializeDialogue(stamped15), 15);
  check("plan: arc pulls the variant into Ep15", pulled.variant?.voiceId === "jam" && pulled.pitch === 0.8, `voice=${pulled.voiceId} pitch=${pulled.pitch}`);
} else if (step === "tool") {
  const scene = await sc12();
  const originalDialogues = new Map(scene.shots.map((s) => [s.id, s.dialogue]));
  const otherCharacter = await db.character.findFirst({ where: { projectId, name: { not: "Lin Yue" } }, select: { name: true } });

  // 1. stamp Foundation Established across the whole scene (2 Lin Yue lines: shots 1 and 3)
  const r1 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "Foundation Established" });
  console.log(`set_state_arc [${r1.status}] ${r1.result}`);
  check("arc: OK", r1.status === "OK");
  check("arc: two lines stamped", r1.result.includes("2 line(s) stamped"), r1.result.slice(0, 120));
  check("arc: stamps the FULL state label", r1.result.includes('"S02 - Foundation Established"'), r1.result.slice(0, 60));
  for (const num of [1, 3]) {
    const shot = scene.shots.find((s) => s.number === num)!;
    const fresh = await db.shot.findUnique({ where: { id: shot.id }, select: { dialogue: true } });
    const lines = parseDialogue(fresh?.dialogue ?? null);
    check(`arc: shot ${num} line carries the forced state`, lines[0]?.state === "S02 - Foundation Established", String(lines[0]?.state));
  }

  // 2. idempotent re-run stamps nothing
  const r2 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "Foundation Established", sceneNumber: 12 });
  check("arc: re-run is a no-op", r2.status === "OK" && r2.result.includes("0 line(s) stamped") && r2.result.includes("already carry"), r2.result.slice(0, 160));

  // 3. the diff moves: the shot 1 take was rendered as battle-damaged (jam/INJURED/hints)
  const diff = await diffEpisodeById(await ep7Id());
  const staleRows = diff?.cues.filter((c) => c.status === "stale") ?? [];
  check("diff: arc makes exactly the arc take stale", staleRows.length === 1 && staleRows[0].shotNumber === 1, staleRows.map((r) => `S${r.shotNumber}`).join(","));
  check("diff: changed labels name the voice", staleRows[0]?.changed.includes("voice / casting"), staleRows[0]?.changed.join(", "));
  check("diff: current block names the line override", staleRows[0]?.current?.stateOverride === "S02 - Foundation Established", String(staleRows[0]?.current?.stateOverride));

  // 4. the diff tool proposes the export pre-flight in the same turn
  const diffTool = await executeTool(projectId, "diff_episode_direction", {});
  check("preflight: proposal rides the diff result", diffTool.result.includes("Export pre-flight"), diffTool.result.slice(-160));

  // 5. clear the arc: dialogue restored, diff fresh again
  const r3 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "", sceneNumber: 12 });
  check("clear: OK", r3.status === "OK" && r3.result.includes("2 line(s) stamped"), r3.result.slice(0, 120));
  const diffFresh = await diffEpisodeById(await ep7Id());
  check("clear: diff fresh again", diffFresh?.stale === 0, `${diffFresh?.fresh} fresh / ${diffFresh?.stale} stale`);

  // 6. error paths
  const e1 = await executeTool(projectId, "set_state_arc", { characterName: "Nobody", stateLabel: "battle" });
  check("error: unknown character", e1.status === "ERROR" && e1.result.includes("not found"), e1.result.slice(0, 80));
  const e2 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "no-such-state" });
  check("error: unknown state lists states", e2.status === "ERROR" && e2.result.includes("States:"), e2.result.slice(0, 80));
  const e3 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", sceneNumber: 12, shotFrom: 5, shotTo: 2 });
  check("error: inverted range rejected", e3.status === "ERROR" && e3.result.includes("shotFrom must be <= shotTo"), e3.result.slice(0, 80));
  const e4 = await executeTool(projectId, "set_state_arc", { characterName: "Lin Yue", stateLabel: "battle", sceneNumber: 12, shotFrom: 90, shotTo: 95 });
  check("error: out-of-range lists shots", e4.status === "ERROR" && e4.result.includes("Shots: 1, 2, 3, 4, 5, 6"), e4.result.slice(0, 100));
  if (otherCharacter) {
    const e5 = await executeTool(projectId, "set_state_arc", { characterName: otherCharacter.name, stateLabel: "battle", sceneNumber: 12 });
    const stateless = e5.status === "ERROR" && e5.result.includes("has no development states");
    const absent = e5.status === "OK" && e5.result.includes("0 line(s) stamped") && e5.result.includes("speakers present: Lin Yue");
    check("error: stateless or absent character handled", stateless || absent, e5.result.slice(0, 120));
  }

  // restore original dialogues exactly
  for (const [shotId, dialogue] of originalDialogues) {
    await db.shot.update({ where: { id: shotId }, data: { dialogue } });
  }
  const diffRestored = await diffEpisodeById(await ep7Id());
  check("restore: season ends fresh", diffRestored?.stale === 0, `${diffRestored?.fresh} fresh / ${diffRestored?.stale} stale`);
} else {
  throw new Error(`Unknown step '${step}' (use plan | tool)`);
}

await db.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

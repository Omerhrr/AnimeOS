// E2E Iteration 24: the DSH ensemble apply proposes an ENSEMBLE AUDITION
// in the same call - one rendered read per engaged speaker of the exact
// line the apply stamped into the state (that state's voice + register +
// hints), A/B against the stored take when one exists; plus the pure
// shape-diff helper behind the template dialog's v1-vs-v2 side-by-side.
// Steps:
//   plan - diffTemplateShapes: identical shapes, frac moves with signed
//          deltas, kind flips, added/dropped segments, rounding
//   tool - ensemble possession apply (audition rows, B-only), no-op
//          re-run (no audition), recovery ensemble (A/B with the real
//          stored takes), solo apply (still no audition), partial skip
//          (one rendered row + the skip), the suggest ensemble chain
//          (audition rides the chain); fixture Ep12/Sc32 with its own
//          characters + states, so the real season is never modified
//   cleanup - removes the fixture episode, the fixture character and
//          states, the rendered take WAVs and the audition WAVs
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { diffTemplateShapes } from "@/lib/comic/arc-templates";
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

const FIXTURE_EPISODE = 12;
const FIXTURE_SCENE = 32;
const RIVAL = "E2E Rival Wei";
const LIN_STATE = "E2E Possessed (fixture)";
const RIVAL_STATE = "E2E Possessor (fixture)";

const LIN_MID = "I cannot hold it.";
const RIVAL_MID = "Then do not.";
const LIN_HEAD = "The seal cracks.";
const RIVAL_HEAD = "Your soul leaks through.";

const FIXTURE_DIALOGUES: Record<number, string> = {
  1: `[{"speaker":"Lin Yue","text":"${LIN_HEAD}","kind":"SPEECH"}]`,
  2: `[{"speaker":"${RIVAL}","text":"${RIVAL_HEAD}","kind":"SPEECH"}]`,
  3: `[{"speaker":"Lin Yue","text":"${LIN_MID}","kind":"SPEECH"}]`,
  4: `[{"speaker":"${RIVAL}","text":"${RIVAL_MID}","kind":"SPEECH"}]`,
  5: `[{"speaker":"Lin Yue","text":"The sword answers anyway.","kind":"SPEECH"}]`,
  6: `[{"speaker":"${RIVAL}","text":"Interesting.","kind":"SPEECH"}]`,
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
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Ensemble audition fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Twin Fall - audition fixture", status: "DRAFT" },
  });
  const mkShot = (number: number) =>
    db.shot.create({ data: { sceneId: scene.id, number, description: `Fixture shot ${number}`, shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[number] } });
  const s1 = await mkShot(1);
  const s2 = await mkShot(2);
  await mkShot(3);
  await mkShot(4);
  await mkShot(5);
  await mkShot(6);
  const cue1 = await db.audioCue.create({ data: { shotId: s1.id, kind: "VOICE", label: `Lin Yue: ${LIN_HEAD}` } });
  const cue2 = await db.audioCue.create({ data: { shotId: s2.id, kind: "VOICE", label: `${RIVAL}: ${RIVAL_HEAD}` } });
  return { ep, scene, cue1, cue2 };
}

async function cleanupEpisodeFixture(cueIds: string[], auditionStateIds: string[]) {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  for (const id of cueIds) {
    await unlink(path.join(process.cwd(), "public", "voices", `${id}.wav`)).catch(() => {});
  }
  for (const id of auditionStateIds) {
    await unlink(path.join(process.cwd(), "public", "auditions", `arc-${id}.wav`)).catch(() => {});
  }
}

if (step === "plan") {
  const seg = (kind: "auto" | "state", frac: number) => ({ kind, frac });

  // 1. identical shapes -> no lines
  check("diff: identical shapes -> empty", diffTemplateShapes([seg("auto", 0.25), seg("state", 0.5), seg("auto", 0.25)], [seg("auto", 0.25), seg("state", 0.5), seg("auto", 0.25)]).length === 0, "");

  // 2. frac move with a signed delta
  const move = diffTemplateShapes([seg("auto", 0.25), seg("state", 0.5), seg("auto", 0.25)], [seg("auto", 0.2), seg("state", 0.6), seg("auto", 0.2)]);
  check("diff: state run widened 50 -> 60 (+10)", move.includes("state run 50% -> 60% (+10)"), move.join(" | "));
  check("diff: auto runs trimmed", move.includes("auto run 25% -> 20% (-5)"), move.join(" | "));

  // 3. kind flip
  const flip = diffTemplateShapes([seg("auto", 1)], [seg("state", 1)]);
  check("diff: kind flip reported", flip.length === 1 && flip[0].startsWith("segment 1 flips auto -> state"), flip.join(" | "));

  // 4. added + dropped segments
  const added = diffTemplateShapes([seg("state", 1)], [seg("state", 0.6), seg("auto", 0.4)]);
  check("diff: added segment reported", added.includes("auto segment added (40%)"), added.join(" | "));
  const dropped = diffTemplateShapes([seg("state", 0.6), seg("auto", 0.4)], [seg("state", 1)]);
  check("diff: dropped segment reported", dropped.includes("auto segment dropped (40%)"), dropped.join(" | "));

  // 5. rounding: 1/3 stays readable at one decimal
  const round = diffTemplateShapes([seg("auto", 1)], [seg("auto", 0.25), seg("state", 1 / 3), seg("auto", 1 - 0.25 - 1 / 3)]);
  check("diff: thirds read at one decimal", round.some((l) => l.includes("state segment added (33.3%)")), round.join(" | "));
}

if (step === "tool") {
  // fixture character + states (same convention as the iteration 22 suite:
  // TEMPORARY @Ep9 so they never auto-apply at Ep12), variant + pitch hints
  // so the audition renders the state's own performance
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  const rival = await db.character.create({ data: { projectId, name: RIVAL, role: "rival (e2e fixture)" } });
  const lin = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true, name: true } });
  if (!lin) throw new Error("Lin Yue not found");
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  const linState = await db.characterState.create({ data: { characterId: lin.id, label: LIN_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  const rivalState = await db.characterState.create({ data: { characterId: rival.id, label: RIVAL_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.85 } });

  const fixture = await ensureEpisodeFixture();
  const epNum = fixture.ep.number;
  const rangeArgs = { scope: "scene", episodeNumber: epNum, sceneNumber: FIXTURE_SCENE };

  // real takes on S1 (Lin) and S2 (Rival): the HEAD lines - exactly the
  // lines the recovery arc stamps, so its audition carries real A sides
  const r1 = await renderVoiceTake(fixture.cue1.id);
  check("fixture: Lin take rendered", Boolean(r1.cue.voiceUrl), `bytes=${r1.bytes}`);
  const r2 = await renderVoiceTake(fixture.cue2.id);
  check("fixture: rival take rendered", Boolean(r2.cue.voiceUrl), `bytes=${r2.bytes}`);

  // 1. ENSEMBLE possession apply: stamps the MIDDLE line of each speaker
  //    (no stored takes there) -> two B-only audition rows in the same call
  const e1 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  check("apply: header counts 2 speakers", e1.status === "OK" && e1.result.includes(`Ensemble arc template "possession spread" with 2 speakers across scene ${FIXTURE_SCENE} shots 1-6: 2 line(s) stamped in shot(s) 3, 4.`), e1.result.slice(0, 260));
  check("apply: audition line present", e1.result.includes("Ensemble audition attached to this call: 2 proposed reads (Lin Yue"), e1.result.slice(200, 700));
  const a1 = e1.ensembleAudition;
  check("apply: preview carries 2 rows", Boolean(a1) && a1!.speakers.length === 2, a1 ? a1.speakers.map((s) => s.characterName).join(",") : "none");
  check("apply: Lin row reads the stamped line", a1?.speakers[0]?.text === LIN_MID && a1?.speakers[0]?.characterName === "Lin Yue" && a1?.speakers[0]?.stateLabel === LIN_STATE, a1?.speakers[0]?.text ?? "none");
  check("apply: rival row reads the per-speaker state line", a1?.speakers[1]?.text === RIVAL_MID && a1?.speakers[1]?.stateLabel === RIVAL_STATE, a1?.speakers[1]?.text ?? "none");
  check("apply: rows are real renders under /auditions/arc-", Boolean(a1?.speakers[0]?.url.match(/^\/auditions\/arc-.+\.wav/)) && (a1?.speakers[0]?.durationMs ?? 0) > 0, a1?.speakers[0]?.url ?? "none");
  check("apply: rows carry the state's variant voice", a1?.speakers[0]?.voiceId === "kazi" && a1?.speakers[1]?.voiceId === "kazi", `${a1?.speakers[0]?.voiceId}/${a1?.speakers[1]?.voiceId}`);
  check("apply: B-only rows have no A side (stamped lines never rendered)", a1?.speakers.every((s) => s.current === null) === true, "");
  check("apply: no skipped rows", a1?.skipped.length === 0, (a1?.skipped ?? []).join(" "));
  check("apply: pitch hint rides the read", a1?.speakers[0]?.pitch === 0.8 && a1?.speakers[1]?.pitch === 0.85, `${a1?.speakers[0]?.pitch}/${a1?.speakers[1]?.pitch}`);

  // 2. re-run: a no-op moves nothing and proposes nothing
  const e2 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  check("re-run: no-op stays a no-op", e2.status === "OK" && e2.result.includes("0 line(s) stamped") && e2.result.includes("No take moved, so no re-render is needed."), e2.result.slice(0, 200));
  check("re-run: no audition attached", !e2.result.includes("Ensemble audition") && !e2.ensembleAudition, "");

  // 3. recovery ensemble: stamps the HEAD lines, which DO have stored takes
  //    -> both rows come back as A/B pairs with the real takes as A sides
  const e3 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
    template: "recovery arc",
  });
  const a3 = e3.ensembleAudition;
  check("recovery: head lines stamped", e3.status === "OK" && e3.result.includes("2 line(s) stamped in shot(s) 1, 2."), e3.result.slice(0, 240));
  check("recovery: audition attached", e3.result.includes("Ensemble audition attached to this call: 2 proposed reads"), e3.result.slice(200, 760));
  check("recovery: Lin row reads the head line with an A side", a3?.speakers[0]?.text === LIN_HEAD && a3?.speakers[0]?.current !== null, a3?.speakers[0]?.text ?? "none");
  check("recovery: rival row reads its head line with an A side", a3?.speakers[1]?.text === RIVAL_HEAD && a3?.speakers[1]?.current !== null, a3?.speakers[1]?.text ?? "none");
  check("recovery: A side is the REAL stored take", a3?.speakers[0]?.current?.url.includes(`${fixture.cue1.id}.wav`) === true && a3?.speakers[0]?.current?.origin === "stored take", a3?.speakers[0]?.current?.url ?? "none");
  check("recovery: A side names the OLD plain state (the take predates the arc)", a3?.speakers[0]?.current?.stateLabel === null, String(a3?.speakers[0]?.current?.stateLabel));

  // 4. SOLO apply stays audition-free (the single-speaker path is untouched)
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: RIVAL, stateLabel: "" });
  const e4 = await executeTool(projectId, "apply_arc_template", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "Possessed", template: "possession spread" });
  check("solo: applies as before", e4.status === "OK" && e4.result.includes(`Arc template "possession spread"`), e4.result.slice(0, 200));
  check("solo: no ensemble audition attached", !e4.result.includes("Ensemble audition") && !e4.ensembleAudition, "");

  // 5. partial skip: the resolvable speaker gets its row, the unknown one
  //    is reported and does not sink the batch or the audition
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  const e5 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: "Nobody Here" }],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  const a5 = e5.ensembleAudition;
  check("skip: unknown speaker reported", e5.status === "OK" && e5.result.includes("- Nobody Here: SKIPPED (Character 'Nobody Here' not found.)"), e5.result.slice(0, 420));
  check("skip: ONE audition row for the engaged speaker", e5.result.includes("Ensemble audition attached to this call: 1 proposed read (Lin Yue") && a5?.speakers.length === 1, e5.result.slice(200, 700));
  check("skip: the row reads Lin's stamped line", a5?.speakers[0]?.text === LIN_MID, a5?.speakers[0]?.text ?? "none");

  // 6. the SUGGEST ensemble chain: the audition rides the chained apply too
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  const e6 = await executeTool(projectId, "suggest_arc_template", {
    ...rangeArgs,
    description: "she starts normal, the possession takes hold mid-scene, then it releases",
    characters: [{ name: "Lin Yue" }],
    stateLabel: "Possessed",
  });
  const a6 = e6.ensembleAudition;
  check("chain: match header + applied-in-this-batch", e6.status === "OK" && e6.result.includes("Template match:") && e6.result.includes("Applied in this batch:"), e6.result.slice(0, 300));
  check("chain: audition rides the chained apply", e6.result.includes("Ensemble audition attached to this call: 1 proposed read (Lin Yue") && a6?.speakers.length === 1 && a6.speakers[0].text === LIN_MID, e6.result.slice(200, 760));

  // 7. baseline: the real season is untouched
  const ep7row = await ep7();
  if (!ep7row) throw new Error("Ep7 not found");
  const baseline = await diffEpisodeById(ep7row.id);
  check("baseline: Ep7 exactly as it started", baseline !== null && baseline.fresh === 0 && baseline.stale === 0 && baseline.unrendered === 1, baseline ? `fresh=${baseline.fresh} stale=${baseline.stale} unrendered=${baseline.unrendered}` : "null");

  // cleanup
  await cleanupEpisodeFixture([fixture.cue1.id, fixture.cue2.id], [linState.id, rivalState.id]);
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  console.log("cleanup done");
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
} else {
  console.log("\nALL PASS");
}

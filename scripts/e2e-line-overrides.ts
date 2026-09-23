// E2E: per-line state overrides + DSH same-turn variant audition.
// Steps:
//   plan     - pure plan-level override checks (no TTS; runs against a
//              temporary fixture state)
//   bind     - set_state_voice_variant renders an audition preview (TTS, once)
//   dialogue - set_shot_dialogue passes per-line delivery/state through
// Every step runs on a self-contained fixture (Ep8) plus a temporary
// fixture state and removes both afterwards, so the real season is untouched.
import { executeTool } from "@/lib/dsh/tools";
import { resolveTakePlan } from "@/lib/ai/voice-plan";
import { dialogueStateForCue, serializeDialogue, parseDialogue } from "@/lib/comic/dialogue";
import { resolveVoiceCast } from "@/lib/ai/voice-casting";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { stat, unlink } from "fs/promises";
import path from "path";
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
const LINE_TEXT = "The Jade Sword still answers my call.";
const CUE_LABEL = `Lin Yue: ${LINE_TEXT}`;

async function linYueId() {
  const ch = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true } });
  if (!ch) throw new Error("Lin Yue not found");
  return ch.id;
}

// TEMPORARY at the given episode: effective only inside that episode.
// The tool/dialogue steps use FIXTURE_EPISODE (auto-effective at Ep8);
// the plan step uses FIXTURE_EPISODE + 1 so auto stays variant-less and
// only the FORCED override pulls the variant in.
async function ensureFixtureState(withVariant = false, episodeNumber: number = FIXTURE_EPISODE) {
  const chId = await linYueId();
  await db.characterState.deleteMany({ where: { characterId: chId, label: STATE_FULL } });
  await db.characterState.create({
    data: {
      characterId: chId, label: STATE_FULL, stateType: "TEMPORARY", episodeNumber,
      ...(withVariant ? { voiceVariant: "kazi", speedHint: 0.9, pitchHint: 0.75 } : {}),
    },
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
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Line override fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Bridge of Blades - fixture", status: "DRAFT" },
  });
  const s1 = await db.shot.create({
    data: { sceneId: scene.id, number: 1, description: "Fixture shot - Lin Yue calls the sword.", shotType: "MEDIUM", dialogue: serializeDialogue([{ speaker: "Lin Yue", text: LINE_TEXT, kind: "SPEECH" }]) },
  });
  const cue1 = await db.audioCue.create({ data: { shotId: s1.id, kind: "VOICE", label: CUE_LABEL } });
  return { ep, scene, shot1: s1, cue1 };
}

async function cleanupEpisodeFixture(cue1Id?: string, auditionUrl?: string) {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  if (cue1Id) await unlink(path.join(process.cwd(), "public", "voices", `${cue1Id}.wav`)).catch(() => {});
  if (auditionUrl) {
    const file = path.join(process.cwd(), "public", decodeURIComponent(auditionUrl.split("?")[0]));
    await unlink(file).catch(() => {});
  }
}

if (step === "plan") {
  await ensureFixtureState(true, FIXTURE_EPISODE + 1); // out-of-episode: only a FORCED override reaches it
  const cast = await resolveVoiceCast("Lin Yue", projectId);

  const planOf = (dialogue: string | null, ep: number) =>
    resolveTakePlan({ label: CUE_LABEL, voiceDelivery: null, voiceSpeed: null, shot: { dialogue } }, projectId, ep);
  const baseLines = () => parseDialogue(serializeDialogue([{ speaker: "Lin Yue", text: LINE_TEXT, kind: "SPEECH" }]));

  // 1. auto resolution (no override): the Ep8 auto state carries no variant
  const auto = await planOf(null, FIXTURE_EPISODE);
  check("auto: no state override", auto.stateOverride === null);
  check("auto: cast voice, no variant", auto.variant === null && auto.voiceId === cast.voiceId, `voice=${auto.voiceId} variant=${auto.variant?.voiceId ?? "none"}`);

  // 2. force a state that carries the variant even though @Ep8 is outside its window
  const lines = baseLines();
  lines[0] = { ...lines[0], state: STATE_LABEL };
  const overriddenDialogue = serializeDialogue(lines);
  const forced = await planOf(overriddenDialogue);
  check("override: stateOverride set", forced.stateOverride === STATE_LABEL, String(forced.stateOverride));
  check("override: dialogueStateForCue matches", dialogueStateForCue(overriddenDialogue, CUE_LABEL) === STATE_LABEL);
  check("override: variant voice rides the forced state", forced.variant?.voiceId === "kazi", `variant=${forced.variant?.voiceId ?? "none"}`);
  check("override: pitch hint applied", forced.pitch === 0.75, String(forced.pitch));
  check("override: sig moved vs auto", JSON.stringify(forced.sig) !== JSON.stringify(auto.sig));

  // 3. a stateless forced state clears the variant and falls back to the cast voice
  const plainLines = baseLines();
  plainLines[0] = { ...plainLines[0], state: "Foundation Established" };
  const plain = await planOf(serializeDialogue(plainLines));
  check("plain: stateOverride set", plain.stateOverride === "Foundation Established", String(plain.stateOverride));
  check("plain: variant cleared (state has none)", plain.variant === null, `variant=${plain.variant?.voiceId ?? "none"}`);
  check("plain: falls back to cast voice", plain.voiceId === cast.voiceId, `forced=${plain.voiceId} cast=${cast.voiceId}`);
  check("plain: pitch hint gone", plain.pitch === 1, String(plain.pitch));

  // 4. restore dialogue: auto plan matches the original snapshot again
  const restored = await planOf(null, FIXTURE_EPISODE);
  check("restore: sig matches the pre-test auto plan", JSON.stringify(restored.sig) === JSON.stringify(auto.sig));

  await removeFixtureState();
} else if (step === "bind") {
  await ensureFixtureState(false);
  const fixture = await ensureEpisodeFixture();
  const state = await db.characterState.findFirst({
    where: { character: { projectId, name: "Lin Yue" }, label: STATE_FULL },
  });
  if (!state) throw new Error("Fixture state not found");
  const prior = { voiceVariant: state.voiceVariant, speedHint: state.speedHint, pitchHint: state.pitchHint };

  // a real auto take first: the bind then moves its sig and the diff flags it
  const rendered = await renderVoiceTake(fixture.cue1.id);
  check("fixture: real TTS take rendered on S1", Boolean(rendered.cue.voiceUrl), `voice=${rendered.cue.voiceActor ?? "?"} bytes=${rendered.bytes}`);

  const t0 = Date.now();
  const res = await executeTool(projectId, "set_state_voice_variant", {
    characterName: "Lin Yue",
    stateLabel: STATE_LABEL,
    voice: "jam",
    speedHint: 0.9,
    pitchHint: 0.75,
  });
  console.log(`set_state_voice_variant [${res.status}, ${Date.now() - t0}ms]`);
  console.log(res.result.slice(0, 220));
  check("bind: OK", res.status === "OK");
  check("bind: audition attached", Boolean(res.audition), "no audition on result");
  let auditionUrl: string | undefined;
  if (res.audition) {
    const a = res.audition;
    auditionUrl = a.url;
    check("audition: url shape", a.url.startsWith("/auditions/variant-"), a.url);
    check("audition: variant voice performed", a.voiceId === "jam", a.voiceId);
    check("audition: pitch hint applied", a.pitch === 0.75, String(a.pitch));
    check("audition: duration parsed", (a.durationMs ?? 0) > 200, String(a.durationMs));
    check("audition: character line source", a.source === "character line", a.source);
    const file = path.join(process.cwd(), "public", decodeURIComponent(a.url.split("?")[0]));
    const st = await stat(file).catch(() => null);
    check("audition: WAV saved on disk", Boolean(st && st.size > 100), file);
  }
  check("bind: result proposes the audition", res.result.includes("Audition attached"));

  // diff sees the moved sig; restoring the prior performance re-freshes it
  const diffStale = await diffEpisodeById(fixture.ep.id);
  const staleRow = diffStale?.cues.find((c) => c.status === "stale");
  check("diff: bind makes the take stale", Boolean(staleRow), staleRow ? `moved: ${staleRow.changed.join(", ")}` : "no stale row");
  console.log(`diff after bind: ${diffStale?.fresh} fresh / ${diffStale?.stale} stale`);

  await db.characterState.update({ where: { id: state.id }, data: prior });
  const diffFresh = await diffEpisodeById(fixture.ep.id);
  check("restore: diff fresh again", diffFresh?.stale === 0, `${diffFresh?.fresh} fresh / ${diffFresh?.stale} stale`);
  await cleanupEpisodeFixture(fixture.cue1.id, auditionUrl);
  await removeFixtureState();
} else if (step === "dialogue") {
  await ensureFixtureState(true); // the state itself carries kazi/0.9/0.75
  const fixture = await ensureEpisodeFixture();
  const original = fixture.shot1.dialogue;
  const res = await executeTool(projectId, "set_shot_dialogue", {
    sceneNumber: FIXTURE_SCENE,
    shotNumber: 1,
    lines: [{ speaker: "Lin Yue", text: LINE_TEXT, kind: "SPEECH", delivery: "EXCITED", state: STATE_LABEL }],
  });
  console.log(`set_shot_dialogue [${res.status}] ${res.result.slice(0, 120)}`);
  check("tool: OK", res.status === "OK");
  const updated = await db.shot.findUnique({ where: { id: fixture.shot1.id }, select: { dialogue: true } });
  const parsed = parseDialogue(updated?.dialogue ?? null);
  check("tool: delivery passthrough", parsed[0]?.delivery === "EXCITED", String(parsed[0]?.delivery));
  check("tool: state passthrough", parsed[0]?.state === STATE_LABEL, String(parsed[0]?.state));

  // the forced state performs the line even though the tool wrote the dialogue
  const plan = await resolveTakePlan(
    { label: fixture.cue1.label, voiceDelivery: fixture.cue1.voiceDelivery, voiceSpeed: fixture.cue1.voiceSpeed, shot: { dialogue: updated?.dialogue ?? null } },
    projectId,
    FIXTURE_EPISODE,
  );
  check("tool: forced state drives the plan", plan.stateOverride === STATE_LABEL && plan.variant?.voiceId === "kazi", `override=${plan.stateOverride} voice=${plan.voiceId}`);
  check("tool: line delivery drives the register", plan.delivery.source === "line" && plan.delivery.id === "EXCITED", `${plan.delivery.source}/${plan.delivery.id}`);

  await db.shot.update({ where: { id: fixture.shot1.id }, data: { dialogue: original } });
  const back = parseDialogue((await db.shot.findUnique({ where: { id: fixture.shot1.id }, select: { dialogue: true } }))?.dialogue ?? null);
  check("restore: dialogue back to original", back[0]?.state === null && back[0]?.delivery === null);
  await cleanupEpisodeFixture(fixture.cue1.id);
  await removeFixtureState();
  const epLeft = await db.episode.count({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const stateLeft = await db.characterState.count({ where: { characterId: await linYueId(), label: STATE_FULL } });
  check("restore: fixture removed", epLeft === 0 && stateLeft === 0);
} else {
  throw new Error(`Unknown step '${step}' (use plan | bind | dialogue)`);
}

await db.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

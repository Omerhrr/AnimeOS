// E2E: per-line state overrides + DSH same-turn variant audition.
// Steps:
//   plan     - pure plan-level override checks (no TTS)
//   bind     - set_state_voice_variant renders an audition preview (TTS, once)
//   dialogue - set_shot_dialogue passes per-line delivery/state through
// Every step restores the state it touched, so the season ends fresh.
import { executeTool } from "@/lib/dsh/tools";
import { resolveTakePlan } from "@/lib/ai/voice-plan";
import { dialogueStateForCue, serializeDialogue, parseDialogue } from "@/lib/comic/dialogue";
import { resolveVoiceCast } from "@/lib/ai/voice-casting";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { stat } from "fs/promises";
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

async function targetShot() {
  const shot = await db.shot.findFirst({
    where: { scene: { number: 12, episode: { number: 7, season: { projectId } } } },
    include: { scene: { include: { episode: true } }, audioCues: { where: { kind: "VOICE" } } },
    orderBy: { number: "asc" },
  });
  if (!shot) throw new Error("Target shot (Ep7 Sc12 Sh1) not found");
  return shot;
}

if (step === "plan") {
  const shot = await targetShot();
  const cue = shot.audioCues[0];
  if (!cue) throw new Error("No VOICE cue on the target shot");
  const epNumber = shot.scene.episode.number;
  const projectIdStr = projectId;

  const planOf = (dialogue: string | null) =>
    resolveTakePlan({ label: cue.label, voiceDelivery: cue.voiceDelivery, voiceSpeed: cue.voiceSpeed, shot: { dialogue } }, projectIdStr, epNumber);

  // 1. auto resolution (current dialogue, no override)
  const auto = await planOf(shot.dialogue);
  check("auto: no state override", auto.stateOverride === null);
  console.log(`auto: voice=${auto.voiceId} delivery=${auto.delivery.id} speed=${auto.speed} pitch=${auto.pitch} variant=${auto.variant?.voiceId ?? "none"}`);

  // 2. force a state that is NOT episode-effective (S02 @Ep15 vs Ep7 cue)
  const lines = parseDialogue(shot.dialogue);
  lines[0] = { ...lines[0], state: "Foundation Established" };
  const overriddenDialogue = serializeDialogue(lines);
  const forced = await planOf(overriddenDialogue);
  check("override: stateOverride set", forced.stateOverride === "Foundation Established", String(forced.stateOverride));
  check("override: dialogueStateForCue matches", dialogueStateForCue(overriddenDialogue, cue.label) === "Foundation Established");
  check("override: variant cleared (state has none)", forced.variant === null, `variant=${forced.variant?.voiceId ?? "none"}`);
  const cast = await resolveVoiceCast("Lin Yue", projectIdStr);
  check("override: falls back to cast voice", forced.voiceId === cast.voiceId, `forced=${forced.voiceId} cast=${cast.voiceId}`);
  check("override: pitch hint gone", forced.pitch === 1, String(forced.pitch));
  check("override: sig moved vs auto", JSON.stringify(forced.sig) !== JSON.stringify(auto.sig));

  // 3. fuzzy match: 'battle' hits 'Battle-damaged (temple fight)' (TEMPORARY @Ep7) and restores the variant
  const fuzzyLines = parseDialogue(shot.dialogue);
  fuzzyLines[0] = { ...fuzzyLines[0], state: "battle" };
  const fuzzyDialogue = serializeDialogue(fuzzyLines);
  const fuzzy = await planOf(fuzzyDialogue);
  check("fuzzy: matches battle-damaged", fuzzy.stateOverride === "battle");
  check("fuzzy: variant voice back", fuzzy.variant?.voiceId === auto.variant?.voiceId, `variant=${fuzzy.variant?.voiceId ?? "none"}`);
  check("fuzzy: pitch hint back", fuzzy.pitch === auto.pitch, `pitch=${fuzzy.pitch}`);
  check("fuzzy: sig equals auto sig", JSON.stringify(fuzzy.sig) === JSON.stringify(auto.sig));

  // 4. restore dialogue: auto plan matches the original snapshot again
  const restored = await planOf(shot.dialogue);
  check("restore: sig matches the pre-test auto plan", JSON.stringify(restored.sig) === JSON.stringify(auto.sig));
} else if (step === "bind") {
  const state = await db.characterState.findFirst({
    where: { character: { projectId, name: "Lin Yue" }, label: { contains: "battle-damaged" } },
  });
  if (!state) throw new Error("Battle-damaged state not found");
  const prior = { voiceVariant: state.voiceVariant, speedHint: state.speedHint, pitchHint: state.pitchHint };

  const t0 = Date.now();
  const res = await executeTool(projectId, "set_state_voice_variant", {
    characterName: "Lin Yue",
    stateLabel: "battle-damaged",
    voice: "kazi",
    speedHint: 0.9,
    pitchHint: 0.75,
  });
  console.log(`set_state_voice_variant [${res.status}, ${Date.now() - t0}ms]`);
  console.log(res.result);
  check("bind: OK", res.status === "OK");
  check("bind: audition attached", Boolean(res.audition), "no audition on result");
  if (res.audition) {
    const a = res.audition;
    console.log("audition:", JSON.stringify(a, null, 1));
    check("audition: url shape", a.url.startsWith("/auditions/variant-"), a.url);
    check("audition: variant voice performed", a.voiceId === "kazi", a.voiceId);
    check("audition: pitch hint applied", a.pitch === 0.75, String(a.pitch));
    check("audition: duration parsed", (a.durationMs ?? 0) > 200, String(a.durationMs));
    check("audition: character line source", a.source === "character line", a.source);
    const file = path.join(process.cwd(), "public", decodeURIComponent(a.url.split("?")[0]));
    const st = await stat(file).catch(() => null);
    check("audition: WAV saved on disk", Boolean(st && st.size > 100), file);
  }
  check("bind: result proposes the audition", res.result.includes("Audition attached"));

  // diff sees the moved sig; restoring the prior performance re-freshes it
  const diffStale = await diffEpisodeById((await db.episode.findFirst({ where: { number: 7, season: { projectId } } }))!.id);
  const staleRow = diffStale?.cues.find((c) => c.status === "stale");
  check("diff: bind makes the take stale", Boolean(staleRow), staleRow ? `moved: ${staleRow.changed.join(", ")}` : "no stale row");
  console.log(`diff after bind: ${diffStale?.fresh} fresh / ${diffStale?.stale} stale`);

  await db.characterState.update({ where: { id: state.id }, data: prior });
  const diffFresh = await diffEpisodeById((await db.episode.findFirst({ where: { number: 7, season: { projectId } } }))!.id);
  check("restore: diff fresh again", diffFresh?.stale === 0, `${diffFresh?.fresh} fresh / ${diffFresh?.stale} stale`);
} else if (step === "dialogue") {
  const shot = await targetShot();
  const original = shot.dialogue;
  const res = await executeTool(projectId, "set_shot_dialogue", {
    sceneNumber: 12,
    shotNumber: 1,
    lines: [{ speaker: "Lin Yue", text: "The Jade Sword still answers my call.", kind: "SPEECH", delivery: "EXCITED", state: "battle" }],
  });
  console.log(`set_shot_dialogue [${res.status}] ${res.result}`);
  check("tool: OK", res.status === "OK");
  const updated = await db.shot.findUnique({ where: { id: shot.id }, select: { dialogue: true } });
  const parsed = parseDialogue(updated?.dialogue ?? null);
  check("tool: delivery passthrough", parsed[0]?.delivery === "EXCITED", String(parsed[0]?.delivery));
  check("tool: state passthrough", parsed[0]?.state === "battle", String(parsed[0]?.state));

  // the forced state performs the line even though the tool wrote the dialogue
  const epNumber = (await db.scene.findUnique({ where: { id: shot.sceneId }, include: { episode: true } }))!.episode.number;
  const cue = shot.audioCues[0];
  const plan = await resolveTakePlan(
    { label: cue.label, voiceDelivery: cue.voiceDelivery, voiceSpeed: cue.voiceSpeed, shot: { dialogue: updated?.dialogue ?? null } },
    projectId,
    epNumber,
  );
  check("tool: forced state drives the plan", plan.stateOverride === "battle" && plan.variant?.voiceId === "jam", `override=${plan.stateOverride} voice=${plan.voiceId}`);
  check("tool: line delivery drives the register", plan.delivery.source === "line" && plan.delivery.id === "EXCITED", `${plan.delivery.source}/${plan.delivery.id}`);

  await db.shot.update({ where: { id: shot.id }, data: { dialogue: original } });
  const back = parseDialogue((await db.shot.findUnique({ where: { id: shot.id }, select: { dialogue: true } }))?.dialogue ?? null);
  check("restore: dialogue back to original", back[0]?.state === null && back[0]?.delivery === null);
} else {
  throw new Error(`Unknown step '${step}' (use plan | bind | dialogue)`);
}

await db.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

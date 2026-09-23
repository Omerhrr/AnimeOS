// E2E: state speed/pitch hints end to end (fixture-based).
// 1. DSH tool: set hints on the fixture state -> stale diff labels
// 2. API: PATCH hints, diff staleness, batch re-render, sig + duration checks
// 3. Audition API: state audition with hints (real TTS)
// 4. Error paths, then clearing the hints re-stales and re-renders clean
// Re-render steps need the dev server on :3000.
// Sequence: bun scripts/e2e-state-hints.ts hints -> errors -> clear -> cleanup
// The fixture (Ep8 + a temporary fixture state) persists across the steps and
// is removed by the final cleanup step; the real season is never touched.
import { executeTool } from "@/lib/dsh/tools";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { serializeDialogue } from "@/lib/comic/dialogue";
import { unlink } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const BASE = "http://localhost:3000";
const step = process.argv[2] ?? "hints";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

async function api(p: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${p}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

const FIXTURE_EPISODE = 8;
const FIXTURE_SCENE = 20;
const STATE_FULL = "E2E Possessed (fixture)";
const STATE_LABEL = "E2E Possessed";
const LINE_TEXT = "The Jade Sword still answers my call.";

async function linYueId() {
  const ch = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true } });
  if (!ch) throw new Error("Lin Yue not found");
  return ch.id;
}

// locate-or-create: the fixture persists across step invocations
async function ensureFixture() {
  const chId = await linYueId();
  let state = await db.characterState.findFirst({ where: { characterId: chId, label: STATE_FULL } });
  if (!state) {
    state = await db.characterState.create({
      data: { characterId: chId, label: STATE_FULL, stateType: "TEMPORARY", episodeNumber: FIXTURE_EPISODE },
    });
  }
  let ep = await db.episode.findFirst({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  if (!ep) {
    const season = await db.season.findFirst({ where: { projectId, number: 1 } });
    if (!season) throw new Error("Season 1 not found");
    ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "State hints fixture (E2E)", status: "DRAFT" } });
  }
  let scene = await db.scene.findFirst({ where: { episodeId: ep.id, number: FIXTURE_SCENE } });
  if (!scene) {
    scene = await db.scene.create({ data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Bridge of Blades - fixture", status: "DRAFT" } });
  }
  let shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } });
  if (!shot) {
    shot = await db.shot.create({
      data: {
        sceneId: scene.id, number: 1, description: "Fixture shot - Lin Yue calls the sword.", shotType: "MEDIUM",
        dialogue: serializeDialogue([{ speaker: "Lin Yue", text: LINE_TEXT, kind: "SPEECH" }]),
      },
    });
  }
  let cue = await db.audioCue.findFirst({ where: { shotId: shot.id, kind: "VOICE" } });
  if (!cue) {
    cue = await db.audioCue.create({ data: { shotId: shot.id, kind: "VOICE", label: `Lin Yue: ${LINE_TEXT}` } });
  }
  // the take must exist and be rendered against the state BEFORE any hint lands
  if (!cue.voiceUrl) await renderVoiceTake(cue.id);
  return { ep, state, cue };
}

async function cleanupFixture() {
  const chId = await linYueId();
  const ep = await db.episode.findFirst({
    where: { number: FIXTURE_EPISODE, season: { projectId } },
    include: { scenes: { include: { shots: { include: { audioCues: true } } } } },
  });
  for (const sc of ep?.scenes ?? []) {
    for (const sh of sc.shots) {
      for (const c of sh.audioCues) {
        if (c.voiceUrl) await unlink(path.join(process.cwd(), "public", "voices", `${c.id}.wav`)).catch(() => {});
      }
    }
  }
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  await db.characterState.deleteMany({ where: { characterId: chId, label: STATE_FULL } });
}

// ── locate the state + the rendered take ─────────────────────────
const fixture = await ensureFixture();
const state = fixture.state;
const cue = fixture.cue;

if (step === "hints") {
  // ── 1. DSH tool: set hints only (voice stays unchanged) ────────
  const t0 = Date.now();
  const r = await executeTool(projectId, "set_state_voice_variant", {
    characterName: "Lin Yue", stateLabel: STATE_LABEL, speedHint: 0.85, pitchHint: 0.8,
  });
  check("dsh tool sets hints", r.status === "OK" && r.result.includes("speed hint x0.85") && r.result.includes("pitch hint x0.8"), `[${r.status}, ${Date.now() - t0}ms] ${r.result.slice(0, 140)}`);

  // ── 2. diff flags the old take stale with the new labels ───────
  const d1 = await api(`/api/voice-diffs?projectId=${projectId}`);
  const eps = d1.body.episodes as Array<{ cues: Array<{ cueId: string; status: string; changed: string[] }> }>;
  const row = eps.flatMap((e) => e.cues).find((c) => c.cueId === cue.id);
  check("diff flags stale", row?.status === "stale", JSON.stringify(row?.changed));
  check("labels: state speed hint", Boolean(row?.changed.includes("state speed hint")));
  check("labels: pitch hint", Boolean(row?.changed.includes("pitch hint")));

  // ── 3. batch re-render (real TTS), then verify the take ────────
  const rr = await api("/api/voice-diffs", { method: "POST", body: JSON.stringify({ projectId }) });
  check("batch re-render ok", rr.status === 200, String(rr.body.summary ?? ""));
  check("re-rendered 1", rr.body.reRenderedCount === 1, `reRendered=${rr.body.reRenderedCount}`);

  const fresh = await db.audioCue.findUnique({ where: { id: cue.id } });
  const sig = JSON.parse(fresh?.voiceSig ?? "{}") as Record<string, unknown>;
  check("sig stamped sh=0.85", sig.sh === 0.85, JSON.stringify(sig));
  check("sig stamped p=0.8", sig.p === 0.8, "");
  check("sig base speed stays 1", sig.s === 1, `s=${sig.s}`);

  const d2 = await api(`/api/voice-diffs?projectId=${projectId}`);
  const row2 = (d2.body.episodes as Array<{ cues: Array<{ cueId: string; status: string }> }>).flatMap((e) => e.cues).find((c) => c.cueId === cue.id);
  check("diff fresh after re-render", row2?.status === "fresh", String(row2?.status));

  // ── 4. state audition (real TTS, nothing persisted) ────────────
  const takes = await db.audioCue.count({ where: { shot: { scene: { episode: { season: { projectId } } } }, voiceUrl: { not: null } } });
  const a1 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: state.id, delivery: "EXCITED" }) });
  const v = a1.body.variant as Record<string, unknown> | null;
  check("state audition ok", a1.status === 200 && typeof a1.body.audio === "string" && (a1.body.audio as string).length > 1000, `${a1.status}, ${(a1.body.audio as string | undefined)?.length ?? 0} b64 chars`);
  check("audition hints reported", v?.speedHint === 0.85 && v?.pitchHint === 0.8, JSON.stringify(v));
  check("audition pitch effective", a1.body.pitch === 0.8, String(a1.body.pitch));
  check("audition speed = register x hint", Boolean(a1.body.delivery) && (a1.body.delivery as Record<string, unknown>).speed === 1.0, JSON.stringify(a1.body.delivery)); // EXCITED 1.18 x 0.85 = 1.003 -> 1.0
  const takesAfter = await db.audioCue.count({ where: { shot: { scene: { episode: { season: { projectId } } } }, voiceUrl: { not: null } } });
  check("audition stored nothing", takesAfter === takes, `${takes} -> ${takesAfter}`);

  // hint-free state audition: natural pitch
  const s01 = await db.characterState.findFirst({ where: { characterId: await linYueId(), label: { contains: "S01" } } });
  const a2 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: s01?.id }) });
  const v2 = a2.body.variant as Record<string, unknown> | null;
  check("hint-free audition ok", a2.status === 200 && v2?.variantVoiceId === null && a2.body.pitch === 1, `voice=${a2.body.voiceId} pitch=${a2.body.pitch}`);

  // audition a state from a character with no cast: hash default voice
  const a3 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: state.id, speaker: "Chen Hao", text: "This mountain belongs to the inner court." }) });
  check("custom speaker audition ok", a3.status === 200 && typeof a3.body.voiceId === "string" && (a3.body.voiceId as string).length > 0, `voice=${a3.body.voiceId}`);
}

if (step === "errors") {
  const bad1 = await api("/api/character-states", { method: "PATCH", body: JSON.stringify({ id: state.id, speedHint: "fast" }) });
  check("PATCH rejects non-numeric speedHint", bad1.status === 400, JSON.stringify(bad1.body));
  const bad2 = await api("/api/character-states", { method: "PATCH", body: JSON.stringify({ id: state.id, pitchHint: 9 }) });
  check("PATCH clamps wild pitchHint", bad2.status === 200 && bad2.body.pitchHint === 2, JSON.stringify(bad2.body));
  const bad3 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ stateId: "nonexistent" }) });
  check("audition unknown state 404", bad3.status === 404, String(bad3.status));
  const bad4 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: state.id, voiceId: "not-a-voice" }) });
  check("audition explicit bad voice 400", bad4.status === 400, String(bad4.status));
  const r1 = await executeTool(projectId, "set_state_voice_variant", { characterName: "Lin Yue", stateLabel: STATE_LABEL, speedHint: "quick" });
  check("DSH rejects non-numeric hint", r1.status === "ERROR" && r1.result.includes("speedHint must be a number"), r1.result.slice(0, 100));
  const r2 = await executeTool(projectId, "set_state_voice_variant", { characterName: "Lin Yue", stateLabel: STATE_LABEL });
  check("DSH no-op rejected", r2.status === "ERROR" && r2.result.includes("Nothing to change"), r2.result.slice(0, 80));
}

if (step === "clear") {
  // clear both hints; the take (stamped sh/p) must go stale again
  const cl = await api("/api/character-states", { method: "PATCH", body: JSON.stringify({ id: state.id, speedHint: null, pitchHint: null }) });
  check("clear hints ok", cl.status === 200 && cl.body.speedHint === null && cl.body.pitchHint === null, JSON.stringify(cl.body));
  const d = await api(`/api/voice-diffs?projectId=${projectId}`);
  const row = (d.body.episodes as Array<{ cues: Array<{ cueId: string; status: string; changed: string[] }> }>).flatMap((e) => e.cues).find((c) => c.cueId === cue.id);
  check("stale after clearing", row?.status === "stale", JSON.stringify(row?.changed));
  const rr = await api("/api/voice-diffs", { method: "POST", body: JSON.stringify({ projectId }) });
  check("re-render after clear", rr.status === 200 && rr.body.reRenderedCount === 1, String(rr.body.summary ?? ""));
  const sig = JSON.parse((await db.audioCue.findUnique({ where: { id: cue.id } }))?.voiceSig ?? "{}") as Record<string, unknown>;
  check("sig back to natural", sig.sh === 1 && sig.p === 1, JSON.stringify(sig));
}

if (step === "cleanup") {
  await cleanupFixture();
  const epLeft = await db.episode.count({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const stateLeft = await db.characterState.count({ where: { characterId: await linYueId(), label: STATE_FULL } });
  check("fixture removed", epLeft === 0 && stateLeft === 0);
}

console.log(failures === 0 ? `\nAll ${step} checks passed` : `\n${failures} ${step} check(s) FAILED`);
await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);

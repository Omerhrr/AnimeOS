// E2E: state speed/pitch hints end to end.
// 1. DSH tool: set hints on the Battle-damaged state -> stale diff labels
// 2. API: PATCH hints, diff staleness, batch re-render, sig + duration checks
// 3. Audition API: state audition with variant voice + hints (real TTS)
// 4. Error paths
// Re-render steps need the dev server on :3000.
import { executeTool } from "@/lib/dsh/tools";
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

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

// ── locate the state + the rendered take ─────────────────────────
const linYue = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, include: { states: true } });
const state = linYue?.states.find((s) => s.label.toLowerCase().includes("battle-damaged"));
if (!state) throw new Error("Battle-damaged state not found");
const cue = await db.audioCue.findFirst({
  where: { kind: "VOICE", voiceUrl: { not: null }, shot: { scene: { episode: { season: { projectId } } } } },
});
if (!cue) throw new Error("No rendered VOICE cue found");

if (step === "hints") {
  // ── 1. DSH tool: set hints only (voice stays unchanged) ────────
  const t0 = Date.now();
  const r = await executeTool(projectId, "set_state_voice_variant", {
    characterName: "Lin Yue", stateLabel: "battle-damaged", speedHint: 0.85, pitchHint: 0.8,
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
  const effSpeed = Math.round(1 * 1.18 * 0.85 * 100) / 100; // EXCITED mul x hint
  check("sig base speed stays 1", sig.s === 1, `s=${sig.s} (effective ${effSpeed})`);

  const d2 = await api(`/api/voice-diffs?projectId=${projectId}`);
  const row2 = (d2.body.episodes as Array<{ cues: Array<{ cueId: string; status: string }> }>).flatMap((e) => e.cues).find((c) => c.cueId === cue.id);
  check("diff fresh after re-render", row2?.status === "fresh", String(row2?.status));

  // ── 4. state audition (real TTS, nothing persisted) ────────────
  const takes = await db.audioCue.count({ where: { shot: { scene: { episode: { season: { projectId } } } }, voiceUrl: { not: null } } });
  const a1 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: state.id, delivery: "EXCITED" }) });
  const v = a1.body.variant as Record<string, unknown> | null;
  check("state audition ok", a1.status === 200 && typeof a1.body.audio === "string" && (a1.body.audio as string).length > 1000, `${a1.status}, ${(a1.body.audio as string | undefined)?.length ?? 0} b64 chars`);
  check("audition variant voice jam", v?.variantVoiceId === "jam" && a1.body.voiceId === "jam", JSON.stringify(v));
  check("audition hints reported", v?.speedHint === 0.85 && v?.pitchHint === 0.8, "");
  check("audition pitch effective", a1.body.pitch === 0.8, String(a1.body.pitch));
  check("audition speed = register x hint", Boolean(a1.body.delivery) && (a1.body.delivery as Record<string, unknown>).speed === 1.0, JSON.stringify(a1.body.delivery)); // EXCITED 1.18 x 0.85 = 1.003 -> 1.0
  const takesAfter = await db.audioCue.count({ where: { shot: { scene: { episode: { season: { projectId } } } }, voiceUrl: { not: null } } });
  check("audition stored nothing", takesAfter === takes, `${takes} -> ${takesAfter}`);

  // hint-free state audition: natural pitch
  const s01 = linYue?.states.find((s) => s.label.includes("S01"));
  const a2 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: s01?.id }) });
  const v2 = a2.body.variant as Record<string, unknown> | null;
  check("hint-free audition ok", a2.status === 200 && v2?.variantVoiceId === null && a2.body.pitch === 1, `voice=${a2.body.voiceId} pitch=${a2.body.pitch}`);

  // audition a state from a character with no cast: hash default voice
  const chen = await db.character.findFirst({ where: { projectId, name: "Chen Hao" } });
  const a3 = await api("/api/voice-auditions", { method: "POST", body: JSON.stringify({ projectId, stateId: state.id, speaker: "Chen Hao", text: "This mountain belongs to the inner court." }) });
  check("custom speaker audition ok", a3.status === 200 && typeof a3.body.voiceId === "string" && (a3.body.voiceId as string).length > 0, `voice=${a3.body.voiceId}`);
  void chen;
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
  const r1 = await executeTool(projectId, "set_state_voice_variant", { characterName: "Lin Yue", stateLabel: "battle-damaged", speedHint: "quick" });
  check("DSH rejects non-numeric hint", r1.status === "ERROR" && r1.result.includes("speedHint must be a number"), r1.result.slice(0, 100));
  const r2 = await executeTool(projectId, "set_state_voice_variant", { characterName: "Lin Yue", stateLabel: "battle-damaged" });
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

console.log(failures === 0 ? `\nAll ${step} checks passed` : `\n${failures} ${step} check(s) FAILED`);
await db.$disconnect();
process.exit(failures === 0 ? 0 : 1);

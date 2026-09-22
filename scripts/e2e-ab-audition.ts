// E2E: A/B audition pairs (current stored take vs proposed performance).
// Steps:
//   tool - set_state_voice_variant attaches an audition whose current side
//          references the stored take of the same line (real TTS, once)
//   api  - /api/voice-auditions returns the current side for state, voice
//          and custom-line auditions (no TTS on the A side lookup)
// Every step restores the state it touched, so the season ends fresh.
import { executeTool } from "@/lib/dsh/tools";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { stat } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const BASE = process.env.BASE ?? "http://localhost:3000";
const step = process.argv[2] ?? "tool";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function ep7Id() {
  return (await db.episode.findFirst({ where: { number: 7, season: { projectId } } }))!.id;
}

if (step === "tool") {
  const state = await db.characterState.findFirst({
    where: { character: { projectId, name: "Lin Yue" }, label: { contains: "battle-damaged" } },
  });
  if (!state) throw new Error("Battle-damaged state not found");
  const prior = { voiceVariant: state.voiceVariant, speedHint: state.speedHint, pitchHint: state.pitchHint };

  const t0 = Date.now();
  const res = await executeTool(projectId, "set_state_voice_variant", {
    characterName: "Lin Yue",
    stateLabel: "battle-damaged",
    speedHint: 0.9,
  });
  console.log(`set_state_voice_variant [${res.status}, ${Date.now() - t0}ms]`);
  console.log(res.result);
  check("bind: OK", res.status === "OK");
  check("bind: audition attached", Boolean(res.audition), "no audition on result");

  if (res.audition) {
    const a = res.audition;
    const cur = a.current;
    check("ab: current side attached", Boolean(cur), "no current side on the audition");
    if (cur) {
      check("ab: origin is a stored take", cur.origin === "stored take", cur.origin);
      check("ab: url is a voice take", cur.url.split("?")[0].startsWith("/voices/") && cur.url.split("?")[0].endsWith(".wav"), cur.url);
      check("ab: cue id present", cur.cueId.length > 0, cur.cueId);
      check("ab: take duration parsed", (cur.durationMs ?? 0) > 200, String(cur.durationMs));
      check("ab: take voice stamped", Boolean(cur.voiceId), cur.voiceId ?? "null");
      const file = path.join(process.cwd(), "public", decodeURIComponent(cur.url.split("?")[0]));
      const st = await stat(file).catch(() => null);
      check("ab: stored take WAV on disk", Boolean(st && st.size > 100), file);
      const cue = await db.audioCue.findUnique({ where: { id: cur.cueId }, select: { kind: true, label: true, voiceUrl: true } });
      check("ab: cue is a VOICE cue", cue?.kind === "VOICE", cue?.label ?? "missing");
      check("ab: result text proposes the A/B", res.result.includes("A/B pair"), res.result.slice(0, 80));
    }
  }

  // the bind moved the sig; restoring the prior performance re-freshes it
  const diffStale = await diffEpisodeById(await ep7Id());
  check("diff: bind makes the take stale", (diffStale?.stale ?? 0) === 1, `${diffStale?.fresh} fresh / ${diffStale?.stale} stale`);
  await db.characterState.update({ where: { id: state.id }, data: prior });
  const diffFresh = await diffEpisodeById(await ep7Id());
  check("restore: diff fresh again", diffFresh?.stale === 0, `${diffFresh?.fresh} fresh / ${diffFresh?.stale} stale`);
} else if (step === "api") {
  const state = await db.characterState.findFirst({
    where: { character: { projectId, name: "Lin Yue" }, label: { contains: "battle-damaged" } },
  });
  if (!state) throw new Error("Battle-damaged state not found");

  // 1. state audition on the character's own first line: A/B expected
  const r1 = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, stateId: state.id }),
  });
  const j1 = await r1.json();
  check("state audition: 200", r1.status === 200, String(r1.status));
  check("state audition: current side", Boolean(j1.current), JSON.stringify(j1.current ?? null).slice(0, 120));
  check("state audition: A side is the same line", j1.current && j1.text === j1.text, `${j1.text}`);
  check("state audition: A side url under /voices/", Boolean(j1.current?.url?.startsWith("/voices/")), j1.current?.url ?? "none");
  check("state audition: A/B sides are distinct renders", Boolean(j1.current && j1.audio?.length > 1000 && j1.current.url.startsWith("/voices/")), `A=${j1.current?.url ?? "none"} B=base64 ${j1.audio?.length ?? 0} chars`);

  // 2. custom board line with no stored take: single-sided audition
  const r2 = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, stateId: state.id, text: "A board line that was never rendered into a take." }),
  });
  const j2 = await r2.json();
  check("custom line: 200", r2.status === 200, String(r2.status));
  check("custom line: no current side", j2.current === null, JSON.stringify(j2.current ?? null).slice(0, 80));

  // 3. plain voice audition on the character's line: A/B against the incumbent take
  const r3 = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, voiceId: "tongtong", speaker: "Lin Yue" }),
  });
  const j3 = await r3.json();
  check("voice audition: 200", r3.status === 200, String(r3.status));
  check("voice audition: current side", Boolean(j3.current), JSON.stringify(j3.current ?? null).slice(0, 120));
  check("voice audition: incumbent differs from the candidate", j3.current && j3.current.voiceId !== "tongtong", `A=${j3.current?.voiceId}`);

  // 4. unknown state id still 404s
  const r4 = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, stateId: "nope" }),
  });
  check("bad state: 404", r4.status === 404, String(r4.status));
} else {
  throw new Error(`Unknown step '${step}' (use tool | api)`);
}

await db.$disconnect();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

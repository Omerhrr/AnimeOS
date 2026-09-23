// E2E Iteration 23: casting board ENSEMBLE auditions (multi-speaker A/B
// rows), TEMPLATE VERSIONING (shape updates bump the version and archive
// the replaced shape with a migration note), and ARC PLAYBACK (the pure
// take-queue builder that sequences an arc's stored takes in story order).
// Steps:
//   plan - pure checks (no DB writes): buildArcTakes label matching,
//          speaker/state filtering, story order, url-less cue skipping,
//          mergeArcTakes ensemble interleaving
//   api  - over /api/arc-templates + /api/voice-auditions (needs the dev
//          server): version round trip (create v1, same-shape PATCH
//          no-bump, shape PATCH bump + history + note, description-only
//          PATCH no-bump, delete), ensemble audition rows (real TTS,
//          skips reported, size guards)
//   tool - runs on a self-contained fixture episode (Ep11, removed
//          after): apply_arc_template tags a v2 saved template
//          ((production template v2)), a v1 template keeps the legacy
//          tag, suggest headers carry the version too; fixture +
//          templates removed, the real season is never touched
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { serializeDialogue } from "@/lib/comic/dialogue";
import { buildArcTakes, mergeArcTakes, type ArcPlaybackShot } from "@/lib/comic/arc-playback";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const project = await db.project.findFirst({ where: { title: "Immortal Path" }, select: { id: true } });
if (!project) throw new Error("Immortal Path project not found");
const projectId = project.id;

const BASE = process.env.BASE ?? "http://localhost:3000";
const step = process.argv[2] ?? "plan";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const TEMPLATE_NAME = "E2E version shape";
const TEMPLATE_PLAIN = "E2E version plain";
const STATE_LABEL = "E2E V-State (fixture)";
const SPEAKER_B = "E2E Version Wei";
const FIXTURE_EPISODE = 11;
const FIXTURE_SCENE = 31;

// ─────────────────────────────────────────────────────────────
// plan: the pure arc-playback layer
// ─────────────────────────────────────────────────────────────

if (step === "plan") {
  const cue = (label: string, url: string | null, extra: Partial<{ kind: string; voiceDurationMs: number; voiceActor: string; voiceStateLabel: string }> = {}) => ({
    kind: "VOICE",
    label,
    voiceUrl: url,
    voiceDurationMs: 1200,
    voiceActor: "kazi",
    voiceStateLabel: null,
    ...extra,
  });
  const line = (speaker: string, text: string, state: string | null) =>
    `{"speaker":"${speaker}","text":"${text}","kind":"SPEECH"${state ? `,"state":"${state}"` : ""}}`;
  const shots: ArcPlaybackShot[] = [
    { id: "s1", sceneNumber: 1, number: 1, dialogue: `[${line("Lin Yue", "The seal cracks.", "Possessed")}]`, audioCues: [cue("Lin Yue: The seal cracks.", "/voices/a1.wav", { voiceStateLabel: "Possessed" })] },
    { id: "s2", sceneNumber: 1, number: 2, dialogue: `[${line("Rival", "Your soul leaks through.", "Possessor")}]`, audioCues: [cue("Rival: Your soul leaks through.", "/voices/a2.wav")] },
    { id: "s3", sceneNumber: 1, number: 3, dialogue: `[${line("Lin Yue", "I cannot hold it.", "Possessed")}]`, audioCues: [cue("lin yue: i cannot hold it.", "/voices/a3.wav")] },
    { id: "s4", sceneNumber: 2, number: 1, dialogue: `[${line("Lin Yue", "Still mine.", "Possessed")}]`, audioCues: [cue("Lin Yue: Still mine.", null)] },
    { id: "s5", sceneNumber: 2, number: 2, dialogue: `[${line("Lin Yue", "It releases.", null)}]`, audioCues: [cue("Lin Yue: It releases.", "/voices/a5.wav")] },
    { id: "s6", sceneNumber: 2, number: 3, dialogue: `[${line("Lin Yue", "Wrong state.", "Possessed")}]`, audioCues: [cue("Rival: Wrong state.", "/voices/a6.wav")] },
  ];
  const span = { speakerKey: "lin yue", state: "Possessed", shotIds: ["s1", "s3", "s4", "s5", "s6"] };

  const takes = buildArcTakes(span, shots);
  check("takes: only the span speaker in the exact state", takes.length === 2, JSON.stringify(takes.map((t) => t.text)));
  check("takes: story order across shots", takes[0].text === "The seal cracks." && takes[1].text === "I cannot hold it.", takes.map((t) => t.text).join("|"));
  check("takes: cue matched case-insensitively by label", takes[1].url === "/voices/a3.wav", takes[1].url);
  check("takes: take carries voice + state metadata", takes[0].voiceId === "kazi" && takes[0].stateLabel === "Possessed", `${takes[0].voiceId}/${takes[0].stateLabel}`);

  const noUrl = buildArcTakes({ speakerKey: "lin yue", state: "Possessed", shotIds: ["s4"] }, shots);
  check("takes: url-less cue is skipped", noUrl.length === 0, String(noUrl.length));

  const auto = buildArcTakes({ speakerKey: "lin yue", state: "Possessed", shotIds: ["s5"] }, shots);
  check("takes: auto line never queues under a state span", auto.length === 0, String(auto.length));

  const wrongSpeakerCue = buildArcTakes({ speakerKey: "lin yue", state: "Possessed", shotIds: ["s6"] }, shots);
  check("takes: cue naming another speaker is skipped", wrongSpeakerCue.length === 0, String(wrongSpeakerCue.length));

  const missingShot = buildArcTakes(span, shots.filter((s) => s.id !== "s3"));
  check("takes: missing shot id tolerated", missingShot.length === 1, String(missingShot.length));

  // ensemble merge: possessor + possessed interleaved by story position
  const merged = mergeArcTakes(
    [
      { speakerKey: "lin yue", state: "Possessed", shotIds: ["s1", "s3"] },
      { speakerKey: "rival", state: "Possessor", shotIds: ["s2"] },
    ],
    shots,
  );
  check("merge: ensemble plays in story order", merged.map((t) => t.text).join("|") === "The seal cracks.|Your soul leaks through.|I cannot hold it.", merged.map((t) => t.text).join("|"));
  const soloFirst = buildArcTakes({ speakerKey: "lin yue", state: "Possessed", shotIds: ["s1", "s3"] }, shots);
  const soloSecond = buildArcTakes({ speakerKey: "rival", state: "Possessor", shotIds: ["s2"] }, shots);
  check("merge: merged length equals members' sum", merged.length === soloFirst.length + soloSecond.length, `${merged.length} vs ${soloFirst.length}+${soloSecond.length}`);
}

// ─────────────────────────────────────────────────────────────
// api: template versioning + ensemble audition
// ─────────────────────────────────────────────────────────────

if (step === "api") {
  // ── versioning round trip ──
  const list0 = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const before = (await list0.json() as Array<{ id: string; name: string }>).length;

  const post = await fetch(`${BASE}/api/arc-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      name: TEMPLATE_NAME,
      description: "the corruption spreads quietly and takes them from within, scene after scene",
      scope: "PROJECT",
      segments: [{ frac: 0.25, kind: "auto" }, { frac: 0.5, kind: "state" }, { frac: 0.25, kind: "auto" }],
    }),
  });
  const { id: tid } = (await post.json()) as { id: string };
  check("versions: created at v1", post.status === 200, String(post.status));

  const list1 = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const rows1 = (await list1.json()) as Array<{ id: string; name: string; version: number; versions: Array<{ version: number; note: string }> }>;
  const created = rows1.find((r) => r.id === tid);
  check("versions: GET carries version 1 + empty history", created?.version === 1 && created?.versions.length === 0, JSON.stringify(created && { v: created.version, h: created.versions.length }));
  check("versions: list grew by exactly one", rows1.length === before + 1, `${rows1.length} vs ${before}`);

  // same shape re-sent: no bump, no history
  const same = await fetch(`${BASE}/api/arc-templates/${tid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments: [{ frac: 25, kind: "auto" }, { frac: 50, kind: "state" }, { frac: 25, kind: "auto" }] }),
  });
  const sameRes = (await same.json()) as { version: number; bumped: boolean };
  check("versions: same-shape PATCH is a no-op", same.status === 200 && sameRes.bumped === false && sameRes.version === 1, JSON.stringify(sameRes));

  // shape moved: bump to v2 + history entry with the note
  const bump = await fetch(`${BASE}/api/arc-templates/${tid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      segments: [{ frac: 20, kind: "auto" }, { frac: 60, kind: "state" }, { frac: 20, kind: "auto" }],
      note: "tighter possession spread",
    }),
  });
  const bumpRes = (await bump.json()) as { version: number; bumped: boolean };
  check("versions: shape PATCH bumps to v2", bump.status === 200 && bumpRes.bumped === true && bumpRes.version === 2, JSON.stringify(bumpRes));

  const list2 = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const rows2 = (await list2.json()) as Array<{ id: string; version: number; segments: Array<{ frac: number; kind: string }>; versions: Array<{ version: number; segments: Array<{ frac: number; kind: string }>; note: string }> }>;
  const v2 = rows2.find((r) => r.id === tid);
  const hist = v2?.versions[0];
  check("versions: history holds the replaced shape newest-first", v2?.version === 2 && hist?.version === 1, JSON.stringify(v2 && { v: v2.version, h: v2.versions.map((e) => e.version) }));
  check("versions: history segments are the OLD shape", hist?.segments.length === 3 && Math.round((hist.segments[1].frac ?? 0) * 100) === 50, JSON.stringify(hist?.segments));
  check("versions: migration note stored", hist?.note === "tighter possession spread", hist?.note ?? "");
  check("versions: current segments are the NEW shape", Math.round((v2?.segments[1].frac ?? 0) * 100) === 60, JSON.stringify(v2?.segments));

  // description-only PATCH: no bump
  const desc = await fetch(`${BASE}/api/arc-templates/${tid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "updated prose only" }),
  });
  const descRes = (await desc.json()) as { version: number; bumped: boolean };
  check("versions: description-only PATCH does not bump", desc.status === 200 && descRes.bumped === false && descRes.version === 2, JSON.stringify(descRes));

  const del = await fetch(`${BASE}/api/arc-templates/${tid}`, { method: "DELETE" });
  check("versions: delete clean", del.status === 200, String(del.status));

  // ── ensemble audition (real TTS) ──
  const cast = await db.character.findMany({
    where: { projectId, name: { in: ["Lin Yue", "Chen Hao"] } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const speakers = cast.map((c) => c.name);
  check("ensemble: fixture speakers exist", speakers.length === 2, speakers.join(", "));

  const ens = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, delivery: "EXCITED", ensemble: speakers.map((speaker) => ({ speaker })) }),
  });
  const ensRes = (await ens.json()) as {
    ensemble: boolean;
    rows: Array<{ speaker: string | null; audio: string; text: string; source: string; voiceId: string; current: { url: string } | null }>;
    skipped: Array<{ entry: string; reason: string }>;
  };
  check("ensemble: one call renders every speaker", ens.status === 200 && ensRes.ensemble === true && Array.isArray(ensRes.rows) && ensRes.rows.length === 2, `${ens.status} rows=${ensRes.rows?.length}`);
  check("ensemble: rows carry real renders", Array.isArray(ensRes.rows) && ensRes.rows.every((r) => r.audio.length > 1000), ensRes.rows?.map((r) => r.audio.length).join(","));
  check("ensemble: each row knows its speaker + a line source", Array.isArray(ensRes.rows) && ensRes.rows.every((r) => r.speaker && (r.source === "character line" || r.source === "sample")), ensRes.rows?.map((r) => `${r.speaker}:${r.source}`).join(","));
  check("ensemble: A side is shape-valid (stored take or null)", Array.isArray(ensRes.rows) && ensRes.rows.every((r) => r.current === null || typeof r.current.url === "string"), JSON.stringify(ensRes.rows?.map((r) => r.current?.url ?? null)));

  const dup = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ensemble: [{ speaker: speakers[0] }, { speaker: speakers[0] }] }),
  });
  const dupRes = (await dup.json()) as { rows: unknown[]; skipped: Array<{ reason: string }> };
  check("ensemble: duplicate speaker skipped, not fatal", dup.status === 200 && dupRes.rows.length === 1 && dupRes.skipped[0]?.reason === "duplicate speaker in the batch", JSON.stringify(dupRes.skipped));

  const ghost = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ensemble: [{ speaker: speakers[0] }, { stateId: "no-such-state" }, {}] }),
  });
  const ghostRes = (await ghost.json()) as { rows: unknown[]; skipped: Array<{ entry: string; reason: string }> };
  check("ensemble: unknown state skipped with reason", ghost.status === 200 && ghostRes.rows.length === 1 && ghostRes.skipped.some((s) => s.reason === "state not found"), JSON.stringify(ghostRes.skipped));
  check("ensemble: empty entry skipped with reason", ghostRes.skipped.some((s) => s.reason === "needs a speaker or a stateId"), JSON.stringify(ghostRes.skipped));

  const tooFew = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ensemble: [{ speaker: speakers[0] }] }),
  });
  check("ensemble: single speaker rejected (400)", tooFew.status === 400, String(tooFew.status));

  const tooMany = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ensemble: Array.from({ length: 7 }, (_, i) => ({ speaker: `Speaker ${i}` })) }),
  });
  const tooManyText = await tooMany.text();
  check("ensemble: seven speakers rejected (400)", tooMany.status === 400 && tooManyText.includes("at most 6"), `${tooMany.status} ${tooManyText.slice(0, 80)}`);

  const notArray = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, ensemble: "nope" }),
  });
  check("ensemble: non-array rejected (400)", notArray.status === 400, String(notArray.status));
}

// ─────────────────────────────────────────────────────────────
// tool: version tags in apply/suggest results (fixture episode)
// ─────────────────────────────────────────────────────────────

const FIXTURE_DIALOGUES: Record<number, string> = {
  1: serializeDialogue([{ speaker: "Lin Yue", text: "The version lands.", kind: "SPEECH" }]),
  2: serializeDialogue([{ speaker: SPEAKER_B, text: "Which shape though?", kind: "SPEECH" }]),
  3: serializeDialogue([{ speaker: "Lin Yue", text: "The current one.", kind: "SPEECH" }]),
  4: serializeDialogue([{ speaker: SPEAKER_B, text: "Prove it.", kind: "SPEECH" }]),
};

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Version fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Version Proof - fixture", status: "DRAFT" },
  });
  for (const n of [1, 2, 3, 4]) {
    await db.shot.create({
      data: { sceneId: scene.id, number: n, description: `Fixture shot ${n}`, shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[n] },
    });
  }
  return ep;
}

async function cleanup() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  await db.arcTemplate.deleteMany({ where: { projectId, name: { in: [TEMPLATE_NAME, TEMPLATE_PLAIN] } } });
  const ghostChar = await db.character.findFirst({ where: { projectId, name: SPEAKER_B }, select: { id: true } });
  if (ghostChar) {
    await db.characterState.deleteMany({ where: { characterId: ghostChar.id } });
    await db.character.delete({ where: { id: ghostChar.id } });
  }
}

if (step === "tool") {
  await ensureEpisodeFixture();

  // fixture character + state
  await db.character.create({ data: { projectId, name: SPEAKER_B, role: "ANTAGONIST" } });
  const ghost = await db.character.findFirst({ where: { projectId, name: SPEAKER_B }, select: { id: true, name: true } });
  if (!ghost) throw new Error("fixture character missing");
  await db.characterState.create({ data: { characterId: ghost.id, label: STATE_LABEL, stateType: "TEMPORARY" } });

  // saved templates: one at v2 (updated shape + history), one at v1 (legacy)
  const v2row = await db.arcTemplate.create({
    data: {
      projectId,
      scope: "PROJECT",
      name: TEMPLATE_NAME,
      description: "a versioned probe shape for applies",
      segments: JSON.stringify([{ frac: 0.2, kind: "auto" }, { frac: 0.6, kind: "state" }, { frac: 0.2, kind: "auto" }]),
      version: 2,
      versions: JSON.stringify([{
        version: 1,
        segments: JSON.stringify([{ frac: 0.25, kind: "auto" }, { frac: 0.5, kind: "state" }, { frac: 0.25, kind: "auto" }]),
        note: "tightened the state run",
        at: new Date().toISOString(),
      }]),
    },
  });
  const v1row = await db.arcTemplate.create({
    data: {
      projectId,
      scope: "PROJECT",
      name: TEMPLATE_PLAIN,
      description: "an unversioned-legacy probe shape",
      segments: JSON.stringify([{ frac: 0.5, kind: "state" }, { frac: 0.5, kind: "auto" }]),
    },
  });

  // apply the v2 template: tag carries the version (Lin Yue stamps her
  // real state - the fixture episode is deleted afterwards, so the
  // season data never changes)
  const a2 = await executeTool(projectId, "apply_arc_template", {
    template: TEMPLATE_NAME,
    characterName: "Lin Yue",
    stateLabel: "Battle-damaged",
    sceneNumber: FIXTURE_SCENE,
    shotFrom: 1,
    shotTo: 4,
  });
  check("apply: v2 template tagged (production template v2)", a2.status === "OK" && a2.result.includes(`"${TEMPLATE_NAME}" (production template v2)`), a2.result.slice(0, 160));
  check("apply: shape stamped on the fixture", a2.status === "OK" && a2.result.includes("line(s) stamped"), a2.result.slice(0, 160));

  // apply the v1 template: legacy tag stays byte-compatible (no v1 suffix)
  const a1 = await executeTool(projectId, "apply_arc_template", {
    template: TEMPLATE_PLAIN,
    characterName: SPEAKER_B,
    stateLabel: "E2E V-State",
    sceneNumber: FIXTURE_SCENE,
    shotFrom: 1,
    shotTo: 4,
  });
  check("apply: v1 template keeps the legacy tag", a1.status === "OK" && a1.result.includes(`"${TEMPLATE_PLAIN}" (production template) on ${SPEAKER_B}`), a1.result.slice(0, 160));
  check("apply: v1 tag has no version suffix", a1.status === "OK" && !a1.result.includes("(production template v"), a1.result.slice(0, 120));

  // suggest header carries the version for the v2 template (no chain: no stateLabel)
  const s2 = await executeTool(projectId, "suggest_arc_template", {
    description: "a versioned probe shape for applies",
    characterName: "Lin Yue",
  });
  check("suggest: match header names the v2 template", s2.status === "OK" && s2.result.includes(`"${TEMPLATE_NAME}" (production template v2) scores`), s2.result.slice(0, 200));

  // the event summary carries the version too
  const event = await db.productionEvent.findFirst({
    where: { projectId, type: "STATE_CHANGE", summary: { contains: `applied arc template "${TEMPLATE_NAME}"` } },
    orderBy: { createdAt: "desc" },
  });
  check("apply: event summary carries v2", Boolean(event?.summary.includes("(production template v2)")), event?.summary ?? "no event");

  await cleanup();

  // baseline: the real season untouched
  const ep7 = await db.episode.findFirst({
    where: { number: 7, season: { projectId } },
    select: { id: true },
  });
  if (ep7) {
    const diff = await diffEpisodeById(ep7.id);
    check("baseline: Ep7 0 fresh / 0 stale / 1 unrendered", diff?.fresh === 0 && diff?.stale === 0 && diff?.unrendered === 1, JSON.stringify(diff && { f: diff.fresh, s: diff.stale, u: diff.unrendered }));
  }
  const templatesLeft = await db.arcTemplate.count({ where: { projectId, name: { in: [TEMPLATE_NAME, TEMPLATE_PLAIN] } } });
  check("cleanup: templates removed", templatesLeft === 0, String(templatesLeft));
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");
process.exit(0);

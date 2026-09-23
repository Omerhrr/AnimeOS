// E2E Iteration 25: PLAYABLE ARC CHIPS in the DSH reply, PER-STATE
// AUDITION HISTORY, and CROSS-SCOPE TEMPLATE DIFFING.
// Steps:
//   plan - pure checks (no DB writes): the cross-scope shape diff
//          (studio original vs production fork), buildArcTakes
//          span/label matching + story order, mergeArcTakes merging
//   tool - self-contained fixture (Ep12/Sc32, its own character +
//          states, real takes on the HEAD lines): the ensemble apply
//          attaches an ENSEMBLE chip (one span per engaged speaker,
//          audition rows recorded into the states' history), the
//          single set_state_arc attaches a single-span chip, the
//          suggest chain rides the chip too, the board's state
//          audition lands a history row (historyUrl), the
//          state-auditions GET/DELETE round trip works, the episode
//          arc-playback feed serves the ordered shots + cues; fixture
//          removed, audition files unlinked
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { renderVoiceTake } from "@/lib/ai/voice-render";
import { diffTemplateShapes } from "@/lib/comic/arc-templates";
import { buildArcTakes, mergeArcTakes, type ArcPlaybackShot } from "@/lib/comic/arc-playback";
import { unlink } from "node:fs/promises";
import path from "node:path";
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

const FIXTURE_EPISODE = 12;
const FIXTURE_SCENE = 32;
const RIVAL = "E2E Rival Wei";
const LIN_STATE = "E2E Possessed (fixture)";
const RIVAL_STATE = "E2E Possessor (fixture)";

const LIN_HEAD = "The seal cracks.";
const RIVAL_HEAD = "Your soul leaks through.";
const LIN_MID = "I cannot hold it.";
const RIVAL_MID = "Then do not.";

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
  return ep;
}

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Arc chips fixture (E2E)", status: "DRAFT" } });
  const scene = await db.scene.create({
    data: { episodeId: ep.id, number: FIXTURE_SCENE, title: "Twin Fall - chip fixture", status: "DRAFT" },
  });
  const mkShot = (number: number) =>
    db.shot.create({ data: { sceneId: scene.id, number, description: `Fixture shot ${number}`, shotType: "MEDIUM", dialogue: FIXTURE_DIALOGUES[number] } });
  const shots: Record<number, { id: string }> = {};
  for (const n of [1, 2, 3, 4, 5, 6]) shots[n] = await mkShot(n);
  const cue1 = await db.audioCue.create({ data: { shotId: shots[1].id, kind: "VOICE", label: `Lin Yue: ${LIN_HEAD}` } });
  const cue2 = await db.audioCue.create({ data: { shotId: shots[2].id, kind: "VOICE", label: `${RIVAL}: ${RIVAL_HEAD}` } });
  return { ep, scene, shots, cue1, cue2 };
}

async function auditionFilesFor(stateIds: string[]): Promise<string[]> {
  const rows = await db.stateAudition.findMany({
    where: { stateId: { in: stateIds } },
    select: { url: true },
  });
  return [...new Set(rows.map((r) => r.url))];
}

if (step === "plan") {
  const seg = (kind: "auto" | "state", frac: number) => ({ kind, frac });

  // 1. cross-scope diff: the studio original vs a production fork
  const studioOriginal = [seg("auto", 0.25), seg("state", 0.5), seg("auto", 0.25)];
  const productionFork = [seg("auto", 0.2), seg("state", 0.6), seg("auto", 0.2)];
  const fork = diffTemplateShapes(studioOriginal, productionFork);
  check("cross-diff: fork widens the state run", fork.includes("state run 50% -> 60% (+10)"), fork.join(" | "));
  check("cross-diff: fork trims the auto runs", fork.includes("auto run 25% -> 20% (-5)"), fork.join(" | "));
  check("cross-diff: identical shapes across scopes -> empty", diffTemplateShapes(studioOriginal, studioOriginal).length === 0, "");

  // 2. buildArcTakes: span filtering + story order (pure)
  const shots: ArcPlaybackShot[] = [
    { id: "s1", sceneNumber: 1, number: 1, dialogue: `[{"speaker":"Lin Yue","text":"${LIN_HEAD}","kind":"SPEECH","state":"${LIN_STATE}"}]`, audioCues: [{ kind: "VOICE", label: `Lin Yue: ${LIN_HEAD}`, voiceUrl: "/voices/a.wav", voiceDurationMs: 1200, voiceActor: "kazi", voiceStateLabel: null }] },
    { id: "s3", sceneNumber: 1, number: 3, dialogue: `[{"speaker":"Lin Yue","text":"${LIN_MID}","kind":"SPEECH","state":"${LIN_STATE}"},{"speaker":"Rival","text":"other","kind":"SPEECH"}]`, audioCues: [{ kind: "VOICE", label: `Lin Yue: ${LIN_MID}`, voiceUrl: "/voices/b.wav", voiceDurationMs: 900, voiceActor: "kazi", voiceStateLabel: null }] },
    { id: "s5", sceneNumber: 2, number: 2, dialogue: `[{"speaker":"Lin Yue","text":"The sword answers anyway.","kind":"SPEECH","state":"${LIN_STATE}"}]`, audioCues: [{ kind: "VOICE", label: "Lin Yue: The sword answers anyway.", voiceUrl: null, voiceDurationMs: null, voiceActor: null, voiceStateLabel: null }] },
  ];
  const span = { speakerKey: "lin yue", state: LIN_STATE, shotIds: ["s1", "s3", "s5"] };
  const wrongState = buildArcTakes({ ...span, state: "Some Other State" }, shots);
  check("takes: lines outside the span's state never qualify", wrongState.length === 0, String(wrongState.length));
  const takes = buildArcTakes(span, shots);
  check("takes: span speaker's matching lines collected in story order", takes.length === 2 && takes[0].text === LIN_HEAD && takes[1].text === LIN_MID, takes.map((t) => t.text).join(" | "));
  check("takes: url-less cues are skipped", !takes.some((t) => t.text === "The sword answers anyway."), "");
  const merged = mergeArcTakes([span, { speakerKey: "rival", state: "R", shotIds: ["s2"] }], [
    ...shots,
    { id: "s2", sceneNumber: 1, number: 2, dialogue: `[{"speaker":"Rival","text":"Then do not.","kind":"SPEECH","state":"R"}]`, audioCues: [{ kind: "VOICE", label: "Rival: Then do not.", voiceUrl: "/voices/c.wav", voiceDurationMs: 800, voiceActor: "kazi", voiceStateLabel: null }] },
  ]);
  check("takes: mergeArcTakes interleaves members in story order", merged.length === 3 && merged[0].speaker === "Lin Yue" && merged[1].speaker === "Rival" && merged[2].speaker === "Lin Yue", merged.map((m) => m.speaker).join(" | "));
}

if (step === "tool") {
  // fixture character + states (TEMPORARY @Ep9 so they never auto-apply),
  // variant + pitch hints so the audition renders the state's own performance
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  const rival = await db.character.create({ data: { projectId, name: RIVAL, role: "rival (e2e fixture)" } });
  const lin = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true, name: true } });
  if (!lin) throw new Error("Lin Yue not found");
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  const linState = await db.characterState.create({ data: { characterId: lin.id, label: LIN_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  const rivalState = await db.characterState.create({ data: { characterId: rival.id, label: RIVAL_STATE, stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.85 } });

  const fixture = await ensureEpisodeFixture();
  const rangeArgs = { scope: "scene", episodeNumber: fixture.ep.number, sceneNumber: FIXTURE_SCENE };

  // real takes on the HEAD lines: the chip queue has something to play
  const r1 = await renderVoiceTake(fixture.cue1.id);
  check("fixture: Lin take rendered", Boolean(r1.cue.voiceUrl), `bytes=${r1.bytes}`);
  const r2 = await renderVoiceTake(fixture.cue2.id);
  check("fixture: rival take rendered", Boolean(r2.cue.voiceUrl), `bytes=${r2.bytes}`);

  // 1. ENSEMBLE apply: one chip for the whole beat + history rows recorded
  const e1 = await executeTool(projectId, "apply_arc_template", {
    ...rangeArgs,
    characters: [{ name: "Lin Yue" }, { name: RIVAL, stateLabel: "Possessor" }],
    stateLabel: "Possessed",
    template: "possession spread",
  });
  const c1 = e1.arcPlayback;
  check("chip: ensemble apply mentions the chip", e1.status === "OK" && e1.result.includes("Arc playback attached: the trace carries a play chip for the whole beat"), e1.result.slice(0, 400));
  check("chip: ensemble chip attached", Boolean(c1) && c1!.ensemble === true && c1!.spans.length === 2, c1 ? `${c1.label} spans=${c1.spans.length}` : "none");
  check("chip: label names the beat", c1?.label === `ensemble beat: Lin Yue, ${RIVAL}`, c1?.label ?? "none");
  check("chip: episode rides the chip", c1?.episodeId === fixture.ep.id && c1?.episodeNumber === FIXTURE_EPISODE, `${c1?.episodeId} / Ep${c1?.episodeNumber}`);
  const linSpan = c1?.spans.find((s) => s.speakerKey === "lin yue");
  const rivalSpan = c1?.spans.find((s) => s.speakerKey === RIVAL.toLowerCase());
  check("chip: Lin span covers the stamped shot", linSpan?.state === LIN_STATE && linSpan?.shotIds.length === 1 && linSpan?.shotIds[0] === fixture.shots[3].id, JSON.stringify(linSpan));
  check("chip: rival span covers ITS stamped shot", rivalSpan?.state === RIVAL_STATE && rivalSpan?.shotIds.length === 1 && rivalSpan?.shotIds[0] === fixture.shots[4].id, JSON.stringify(rivalSpan));
  check("chip: the ensemble audition still rides the same result", Boolean(e1.ensembleAudition) && e1.ensembleAudition!.speakers.length === 2, "");

  // 2. history: every proposed read of a state is now a recorded row
  const linHist1 = await db.stateAudition.findMany({ where: { stateId: linState.id }, orderBy: { createdAt: "desc" } });
  const rivalHist1 = await db.stateAudition.findMany({ where: { stateId: rivalState.id }, orderBy: { createdAt: "desc" } });
  check("history: ensemble auditions recorded per state", linHist1.length === 1 && rivalHist1.length === 1, `lin=${linHist1.length} rival=${rivalHist1.length}`);
  check("history: row reads the stamped line", linHist1[0]?.text === LIN_MID && linHist1[0]?.voiceId === "kazi" && linHist1[0]?.pitch === 0.8, linHist1[0] ? `${linHist1[0].text} / ${linHist1[0].voiceId}` : "none");
  check("history: timestamped file naming + real file", /^\/auditions\/arc-.+-\d+\.wav$/.test(linHist1[0]?.url ?? "") && Boolean(linHist1[0] && await Bun.file(path.join(process.cwd(), "public", linHist1[0].url)).exists()), linHist1[0]?.url ?? "none");

  // 3. single-span chip on set_state_arc
  await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
  const e3 = await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "Possessed" });
  const c3 = e3.arcPlayback;
  check("chip: set_state_arc attaches a single span", e3.status === "OK" && Boolean(c3) && c3!.ensemble === false && c3!.spans.length === 1, c3 ? c3.label : "none");
  check("chip: the span is Lin + the full state label", c3?.spans[0]?.speakerKey === "lin yue" && c3?.spans[0]?.state === LIN_STATE, JSON.stringify(c3?.spans[0]));
  check("chip: span covers every Lin line shot", c3?.spans[0]?.shotIds.length === 3 && c3.spans[0].shotIds.includes(fixture.shots[1].id) && c3.spans[0].shotIds.includes(fixture.shots[5].id), JSON.stringify(c3?.spans[0]?.shotIds));
  check("chip: cleared arc attaches nothing", !(await (async () => {
    const e = await executeTool(projectId, "set_state_arc", { ...rangeArgs, characterName: "Lin Yue", stateLabel: "" });
    return e.arcPlayback;
  })()), "");

  // 4. the suggest single chain rides the chip too
  const e4 = await executeTool(projectId, "suggest_arc_template", {
    ...rangeArgs,
    description: "she starts normal, the possession takes hold mid-scene, then it releases",
    characterName: "Lin Yue",
    stateLabel: "Possessed",
  });
  const c4 = e4.arcPlayback;
  check("chain: single chain applies + carries the chip", e4.status === "OK" && e4.result.includes("Applied in this batch:") && Boolean(c4) && c4!.ensemble === false, c4 ? c4.label : "none");
  check("chain: chip spans the stamped line's shot", c4?.spans[0]?.shotIds.length === 1 && c4.spans[0].shotIds[0] === fixture.shots[3].id, JSON.stringify(c4?.spans[0]?.shotIds));
  const linHist2 = await db.stateAudition.count({ where: { stateId: linState.id } });
  check("history: the single chain records nothing (only ensemble applies render auditions)", linHist2 === 1, String(linHist2));

  // 5. the arc-playback feed serves the fixture episode's ordered shots + cues
  const feedRes = await fetch(`${BASE}/api/episodes/${fixture.ep.id}/arc-playback`);
  const feed = (await feedRes.json()) as {
    episode: { id: string; number: number };
    shots: Array<{ id: string; sceneNumber: number; number: number; audioCues: Array<{ kind: string; label: string; voiceUrl: string | null }> }>;
  };
  check("feed: 200 + episode header", feedRes.status === 200 && feed.episode.id === fixture.ep.id && feed.episode.number === FIXTURE_EPISODE, String(feedRes.status));
  check("feed: shots in story order", feed.shots.length === 6 && feed.shots.map((s) => s.number).join(",") === "1,2,3,4,5,6", feed.shots.map((s) => s.number).join(","));
  check("feed: VOICE cues carried", feed.shots[0].audioCues.length === 1 && Boolean(feed.shots[0].audioCues[0].voiceUrl) && feed.shots[1].audioCues.length === 1, "");
  const chipTakes = mergeArcTakes(c1!.spans, feed.shots.map((s) => ({ id: s.id, sceneNumber: s.sceneNumber, number: s.number, dialogue: FIXTURE_DIALOGUES[s.number] ?? null, audioCues: s.audioCues })));
  check("feed: chip spans + feed collect zero takes on the stamped lines", chipTakes.length === 0, String(chipTakes.length));
  const missing = await fetch(`${BASE}/api/episodes/nope/arc-playback`);
  check("feed: unknown episode -> 404", missing.status === 404, String(missing.status));

  // 6. the board's state audition lands a history row + the GET/DELETE round trip
  const boardRes = await fetch(`${BASE}/api/voice-auditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, stateId: linState.id, delivery: "EXCITED" }),
  });
  const board = (await boardRes.json()) as { historyUrl?: string; text?: string; error?: string };
  check("board: state audition renders + returns historyUrl", boardRes.status === 200 && /^\/auditions\/state-.+-\d+\.wav$/.test(board.historyUrl ?? ""), board.historyUrl ?? board.error ?? String(boardRes.status));
  const linHist3 = await db.stateAudition.findMany({ where: { stateId: linState.id }, orderBy: { createdAt: "desc" } });
  check("board: the audition is recorded newest-first", linHist3.length === 2 && linHist3[0].text === board.text && linHist3[0].url === board.historyUrl, `rows=${linHist3.length}`);

  const listRes = await fetch(`${BASE}/api/state-auditions?stateId=${linState.id}`);
  const list = (await listRes.json()) as { state: { id: string; label: string }; auditions: Array<{ id: string; text: string }> };
  check("history: GET returns the state block + newest-first rows", listRes.status === 200 && list.state.id === linState.id && list.auditions.length === 2 && list.auditions[0].text === board.text, `${list.auditions.length} rows`);
  const noParam = await fetch(`${BASE}/api/state-auditions`);
  check("history: GET without stateId -> 400", noParam.status === 400, String(noParam.status));

  const delRes = await fetch(`${BASE}/api/state-auditions?id=${linHist3[0].id}`, { method: "DELETE" });
  const linHist4 = await db.stateAudition.count({ where: { stateId: linState.id } });
  check("history: DELETE removes the row (file unlinked next)", delRes.status === 200 && linHist4 === 1, `${delRes.status} rows=${linHist4}`);
  const boardFileGone = board.historyUrl ? !(await Bun.file(path.join(process.cwd(), "public", board.historyUrl)).exists()) : false;
  check("history: DELETE unlinked the board row's file", boardFileGone, board.historyUrl ?? "none");

  // 7. baseline: the real season is untouched
  const ep7row = await ep7();
  if (!ep7row) throw new Error("Ep7 not found");
  const baseline = await diffEpisodeById(ep7row.id);
  check("baseline: Ep7 exactly as it started", baseline !== null && baseline.fresh === 0 && baseline.stale === 0 && baseline.unrendered === 1, baseline ? `fresh=${baseline.fresh} stale=${baseline.stale} unrendered=${baseline.unrendered}` : "null");

  // cleanup: unlink audition files, remove fixture episode + character (cascades states + history rows)
  const files = await auditionFilesFor([linState.id, rivalState.id]);
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  await db.characterState.deleteMany({ where: { characterId: lin.id, label: LIN_STATE } });
  await db.characterState.deleteMany({ where: { characterId: rival.id, label: RIVAL_STATE } });
  await db.character.deleteMany({ where: { projectId, name: RIVAL } });
  for (const url of files) {
    await unlink(path.join(process.cwd(), "public", url)).catch(() => {});
  }
  console.log(`cleanup done (${files.length} audition file(s) unlinked)`);
}

if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
} else {
  console.log("\nALL PASS");
}

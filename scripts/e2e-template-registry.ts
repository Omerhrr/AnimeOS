// E2E Iteration 20: user-defined arc templates saved per production
// + DSH suggesting a template from prose + per-speaker ruler lanes.
// Steps:
//   plan - pure checks (no DB writes): segment validation/normalization,
//          shape readout, prose matching (built-ins + a synthetic
//          production template), per-speaker lane grouping
//   api  - CRUD over /api/arc-templates (needs the dev server):
//          create, duplicate 409, invalid segments 400, missing name 400,
//          rename, bad PATCH 400, delete, delete 404
//   tool - runs on a self-contained fixture episode (Ep8, removed after):
//          suggest_arc_template (strong match, no match, empty arg,
//          production template tagged, state candidates) and
//          apply_arc_template with SAVED templates (shape stamped,
//          production marker, real rendered take going stale, unknown-name
//          error lists production templates); the fixture and the saved
//          templates are removed, the real season is never touched
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { parseDialogue, serializeDialogue } from "@/lib/comic/dialogue";
import {
  ARC_TEMPLATES, formatTemplateShape, matchArcTemplates,
  parseArcTemplateSegments, type ArcTemplate,
} from "@/lib/comic/arc-templates";
import { groupSpansBySpeaker } from "@/lib/comic/arcs";
import { diffEpisodeById } from "@/lib/ai/voice-diff";
import { renderVoiceTake } from "@/lib/ai/voice-render";
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

const CORRUPTION_SEGMENTS = [
  { frac: 0.3, kind: "auto" as const },
  { frac: 0.4, kind: "state" as const },
  { frac: 0.3, kind: "auto" as const },
];
const CORRUPTION_DESC = "the corruption spreads quietly and takes them from within, scene after scene";
const CORRUPTION_NAME = "corruption creep";
const DRAIN_NAME = "steady drain";
const STATE_LABEL = "E2E Possessed"; // fuzzy-matches the fixture state below

async function linYueId() {
  const ch = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true } });
  if (!ch) throw new Error("Lin Yue not found");
  return ch.id;
}

const FIXTURE_EPISODE = 8;
const FIXTURE_SCENE = 20;
const FIXTURE_DIALOGUES: Record<number, string> = {
  1: serializeDialogue([{ speaker: "Lin Yue", text: "The Jade Sword still answers my call.", kind: "SPEECH" }]),
  2: serializeDialogue([{ speaker: "Su Yan", text: "You cannot hold two swords with one soul.", kind: "SPEECH" }]),
  3: serializeDialogue([{ speaker: "Lin Yue", text: "The rain... it stopped.", kind: "THOUGHT" }]),
  4: serializeDialogue([{ speaker: "Lin Yue", text: "Then the soul stretches.", kind: "SPEECH" }]),
};

async function ensureEpisodeFixture() {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const ep = await db.episode.create({ data: { seasonId: season.id, number: FIXTURE_EPISODE, title: "Template registry fixture (E2E)", status: "DRAFT" } });
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
  const cue3 = await db.audioCue.create({ data: { shotId: s3.id, kind: "VOICE", label: "Lin Yue: The rain... it stopped." } });
  return { ep, scene, cue1, cue3 };
}

async function cleanupEpisodeFixture(cue1Id: string) {
  await db.episode.deleteMany({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  await unlink(path.join(process.cwd(), "public", "voices", `${cue1Id}.wav`)).catch(() => {});
  await db.arcTemplate.deleteMany({ where: { projectId, name: { in: [CORRUPTION_NAME, DRAIN_NAME] } } });
}

if (step === "plan") {
  // 1. segment validation: merge adjacent same-kind, normalize fractions
  const merged = parseArcTemplateSegments([
    { frac: 20, kind: "auto" }, { frac: 30, kind: "auto" }, { frac: 50, kind: "state" },
  ]);
  check(
    "segments: adjacent same-kind merge + normalize",
    merged !== null && merged.length === 2 && Math.abs(merged[0].frac - 0.5) < 1e-9 && merged[0].kind === "auto" && merged[1].kind === "state",
    merged ? JSON.stringify(merged) : "null",
  );
  const norm = parseArcTemplateSegments([{ frac: 1, kind: "auto" }, { frac: 2, kind: "state" }]);
  check(
    "segments: fracs normalize to sum 1",
    norm !== null && Math.abs(norm[0].frac - 1 / 3) < 1e-9 && Math.abs(norm[1].frac - 2 / 3) < 1e-9,
    norm ? norm.map((s) => s.frac.toFixed(3)).join("/") : "null",
  );
  check("segments: empty list rejected", parseArcTemplateSegments([]) === null);
  check("segments: non-array rejected", parseArcTemplateSegments("nope") === null);
  check("segments: zero frac rejected", parseArcTemplateSegments([{ frac: 0, kind: "auto" }]) === null);
  check("segments: bad kind rejected", parseArcTemplateSegments([{ frac: 1, kind: "banana" }]) === null);
  check("segments: missing kind rejected", parseArcTemplateSegments([{ frac: 2 }, { frac: 3 }]) === null);
  check(
    "segments: negative frac rejected",
    parseArcTemplateSegments([{ frac: 10, kind: "auto" }, { frac: -5, kind: "state" }]) === null,
  );

  // 2. shape readout
  const ps = ARC_TEMPLATES.find((t) => t.id === "possession-spread")!;
  check(
    "shape readout",
    formatTemplateShape(ps.segments) === "auto 25% -> state 50% -> auto 25%",
    formatTemplateShape(ps.segments),
  );

  // 3. prose matching against the built-ins
  const registry = [...ARC_TEMPLATES];
  const m1 = matchArcTemplates("she starts the fight normal, the possession takes hold mid-scene, then it releases", registry);
  check(
    "match: possession prose -> possession spread",
    m1[0]?.template.id === "possession-spread" && m1[0].score >= 3,
    m1.map((m) => `${m.template.name}:${m.score}`).join(", "),
  );
  const m2 = matchArcTemplates("she opens the fight still possessed and slowly shakes it off, returning to normal by the end", registry);
  check(
    "match: recovery prose -> recovery arc",
    m2[0]?.template.id === "recovery-arc" && m2[0].score >= 3,
    m2.map((m) => `${m.template.name}:${m.score}`).join(", "),
  );
  const m3 = matchArcTemplates("the spirit consumes him completely and never lets up, it owns every line", registry);
  check(
    "match: domination prose -> full takeover",
    m3[0]?.template.id === "full-takeover" && m3[0].score >= 3,
    m3.map((m) => `${m.template.name}:${m.score}`).join(", "),
  );
  check("match: empty prose -> no matches", matchArcTemplates("", registry).length === 0);

  // 4. a production template joins the registry and wins on its own words
  const corruption: ArcTemplate = {
    id: "fixture", name: CORRUPTION_NAME, description: CORRUPTION_DESC, segments: CORRUPTION_SEGMENTS,
  };
  const m4 = matchArcTemplates("the corruption spreads through her from within, scene after scene", [...registry, corruption]);
  check(
    "match: production template wins on its own words",
    m4[0]?.template.name === CORRUPTION_NAME && m4[0].score >= 3 && m4[1] && m4[1].score < m4[0].score,
    m4.map((m) => `${m.template.name}:${m.score}`).join(", "),
  );

  // 5. per-speaker lane grouping: one lane per speaker, story order
  const spans = [
    { speakerKey: "lin yue", speaker: "Lin Yue", start: 2, end: 3 },
    { speakerKey: "su yan", speaker: "Su Yan", start: 0, end: 0 },
    { speakerKey: "lin yue", speaker: "Lin Yue", start: 5, end: 6 },
  ];
  const lanes = groupSpansBySpeaker(spans);
  check(
    "lanes: one lane per speaker in story order",
    lanes.length === 2 && lanes[0].speakerKey === "su yan" && lanes[1].speakerKey === "lin yue",
    lanes.map((g) => `${g.speaker}@${g.spans[0].start}`).join(", "),
  );
  check(
    "lanes: a speaker's spans stay ordered inside the lane",
    lanes[1].spans.length === 2 && lanes[1].spans[0].start === 2 && lanes[1].spans[1].start === 5,
    lanes[1].spans.map((s) => s.start).join(","),
  );
} else if (step === "api") {
  const list0 = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  check("api: GET returns a list", list0.ok && Array.isArray(await list0.json()));

  const post = await fetch(`${BASE}/api/arc-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId, name: "e2e temp shape",
      description: "temp shape for the API check",
      segments: [{ frac: 20, kind: "auto" }, { frac: 30, kind: "auto" }, { frac: 50, kind: "state" }],
    }),
  });
  const created = (await post.json()) as { id?: string; error?: string };
  check("api: POST creates a template", post.ok && Boolean(created.id), JSON.stringify(created).slice(0, 120));
  const tid = created.id ?? "";

  const list1 = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const rows1 = (await list1.json()) as Array<{ id: string; name: string; segments: Array<{ frac: number; kind: string }> }>;
  const row1 = rows1.find((r) => r.id === tid);
  check(
    "api: GET lists the saved template with normalized segments",
    row1?.name === "e2e temp shape" && row1.segments.length === 2 && row1.segments[0].kind === "auto",
    JSON.stringify(row1?.segments ?? []).slice(0, 120),
  );

  const dup = await fetch(`${BASE}/api/arc-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, name: "e2e temp shape", segments: [{ frac: 50, kind: "state" }] }),
  });
  check("api: duplicate name 409", dup.status === 409, String(dup.status));

  const badSegs = await fetch(`${BASE}/api/arc-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, name: "e2e bad shape", segments: [{ frac: -1, kind: "auto" }] }),
  });
  check("api: invalid segments 400", badSegs.status === 400, String(badSegs.status));

  const noName = await fetch(`${BASE}/api/arc-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, name: "  ", segments: [{ frac: 50, kind: "state" }] }),
  });
  check("api: empty name 400", noName.status === 400, String(noName.status));

  const renamed = await fetch(`${BASE}/api/arc-templates/${tid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "e2e temp shape II", description: "renamed" }),
  });
  check("api: PATCH renames", renamed.ok, JSON.stringify(await renamed.json()).slice(0, 100));
  const badPatch = await fetch(`${BASE}/api/arc-templates/${tid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments: "banana" }),
  });
  check("api: PATCH bad segments 400", badPatch.status === 400, String(badPatch.status));

  const del = await fetch(`${BASE}/api/arc-templates/${tid}`, { method: "DELETE" });
  check("api: DELETE ok", del.ok, String(del.status));
  const list2 = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const rows2 = (await list2.json()) as Array<{ id: string }>;
  check("api: template gone after DELETE", !rows2.some((r) => r.id === tid));
  const del2 = await fetch(`${BASE}/api/arc-templates/${tid}`, { method: "DELETE" });
  check("api: DELETE again 404", del2.status === 404, String(del2.status));
} else if (step === "tool") {
  // fixture state: TEMPORARY @Ep9 never auto-applies at Ep8, but a forced
  // override ignores episode eligibility - its variant + pitch hint make
  // the rendered S1 take move when the arc lands on the line
  const chId = await linYueId();
  await db.characterState.deleteMany({ where: { characterId: chId, label: "E2E Possessed (fixture)" } });
  await db.characterState.create({
    data: { characterId: chId, label: "E2E Possessed (fixture)", stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 },
  });

  // self-contained fixture: 3 Lin Yue lines + 1 rival line, one rendered take
  const fixture = await ensureEpisodeFixture();
  const fixtureEpNumber = fixture.ep.number;

  // save two production templates
  await db.arcTemplate.deleteMany({ where: { projectId, name: { in: [CORRUPTION_NAME, DRAIN_NAME] } } });
  await db.arcTemplate.create({
    data: { projectId, name: CORRUPTION_NAME, description: CORRUPTION_DESC, segments: JSON.stringify(CORRUPTION_SEGMENTS) },
  });
  await db.arcTemplate.create({
    data: {
      projectId,
      name: DRAIN_NAME,
      description: "open already drained and stagger back to normal near the end",
      segments: JSON.stringify([{ frac: 0.7, kind: "state" }, { frac: 0.3, kind: "auto" }]),
    },
  });

  // 1. suggest: strong match on the built-ins
  const s1 = await executeTool(projectId, "suggest_arc_template", {
    description: "she starts the fight normal, the possession takes hold mid-scene, then it releases",
    characterName: "Lin Yue",
  });
  check(
    "suggest: strong built-in match proposes possession spread",
    s1.status === "OK" && s1.result.includes("Template match: \"possession spread\"") && s1.result.includes("apply_arc_template"),
    s1.result.slice(0, 220),
  );
  check(
    "suggest: shape + why + registry + state candidates present",
    s1.result.includes("auto 25% -> state 50% -> auto 25%")
      && s1.result.includes("Why: ")
      && s1.result.includes("State candidates for Lin Yue"),
    s1.result.slice(-300),
  );

  // 2. suggest: the production template wins on its own words, tagged
  const s2 = await executeTool(projectId, "suggest_arc_template", {
    description: "the corruption spreads through her from within, scene after scene",
  });
  check(
    "suggest: production template matched and tagged",
    s2.status === "OK" && s2.result.includes(`Template match: "${CORRUPTION_NAME}" (production template)`),
    s2.result.slice(0, 240),
  );

  // 3. suggest: nothing fits
  const s3 = await executeTool(projectId, "suggest_arc_template", {
    description: "the sword hums and the moon turns sideways",
  });
  check(
    "suggest: no strong match falls back to the registry",
    s3.status === "OK" && s3.result.includes("No arc template strongly matches") && s3.result.includes(CORRUPTION_NAME),
    s3.result.slice(0, 220),
  );

  // 4. suggest: empty description errors
  const s4 = await executeTool(projectId, "suggest_arc_template", {});
  check(
    "suggest: empty description errors",
    s4.status === "ERROR" && s4.result.includes("Pass description"),
    s4.result.slice(0, 140),
  );

  // render a real take on shot 1 (auto direction) so staleness can be observed
  const rendered = await renderVoiceTake(fixture.cue1.id);
  check(
    "fixture: real TTS take rendered on shot 1",
    Boolean(rendered.cue.voiceUrl) && Boolean(rendered.cue.voiceSig),
    `voice=${rendered.cue.voiceActor ?? "?"} bytes=${rendered.bytes}`,
  );

  // 5. apply the saved template: shape stamped, production marker, clean impact
  const a1 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: CORRUPTION_NAME, stateLabel: STATE_LABEL,
    sceneNumber: FIXTURE_SCENE, shotFrom: 1, shotTo: 4,
  });
  check(
    "apply saved: corruption creep stamps shot 3 with the production marker",
    a1.status === "OK"
      && a1.result.includes(`Arc template "${CORRUPTION_NAME}" (production template) on Lin Yue`)
      && a1.result.includes("1 line(s) stamped in shot(s) 3"),
    a1.result.slice(0, 260),
  );
  check(
    "apply saved: clean direction impact (only the unrendered cue moved)",
    a1.result.includes(`Direction impact: episode ${fixtureEpNumber} is clean (1 fresh, 1 unrendered)`),
    a1.result.slice(-200),
  );
  const s3Shot = await db.shot.findFirst({ where: { sceneId: fixture.scene.id, number: 3 } });
  const s3Line = parseDialogue(s3Shot?.dialogue ?? null).find((l) => l.speaker === "Lin Yue");
  check(
    "apply saved: shot 3 line now carries the forced state",
    s3Line?.state === "E2E Possessed (fixture)",
    s3Line?.state ?? "null",
  );

  // 6. apply the second saved template: reshapes the plan, the rendered S1 take goes stale
  const a2 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: DRAIN_NAME, stateLabel: STATE_LABEL,
    sceneNumber: FIXTURE_SCENE, shotFrom: 1, shotTo: 4,
  });
  check(
    "apply saved: steady drain forces shot 1 into the state",
    a2.status === "OK" && a2.result.includes("1 line(s) stamped in shot(s) 1"),
    a2.result.slice(0, 240),
  );
  check(
    "apply saved: direction impact + same-turn offer ride the result",
    a2.result.includes(`Direction impact: episode ${fixtureEpNumber} now has 1 stale take(s)`) && a2.result.includes("Offer the re-render in the same turn"),
    a2.result.slice(-260),
  );
  const s1After = await db.shot.findFirst({ where: { sceneId: fixture.scene.id, number: 1 } });
  const s4After = await db.shot.findFirst({ where: { sceneId: fixture.scene.id, number: 4 } });
  const s2After = await db.shot.findFirst({ where: { sceneId: fixture.scene.id, number: 2 } });
  check(
    "apply saved: state on shot 1, shots 3+4 auto, rival untouched",
    parseDialogue(s1After?.dialogue ?? null).find((l) => l.speaker === "Lin Yue")?.state === "E2E Possessed (fixture)"
      && parseDialogue(s4After?.dialogue ?? null).find((l) => l.speaker === "Lin Yue")?.state === null
      && parseDialogue(s2After?.dialogue ?? null).every((l) => !l.state),
  );
  const diffAfter = await diffEpisodeById(fixture.ep.id);
  check(
    "apply saved: diff agrees - exactly 1 stale",
    diffAfter !== null && diffAfter.stale === 1 && diffAfter.fresh === 0,
    diffAfter ? `${diffAfter.fresh} fresh / ${diffAfter.stale} stale` : "no diff",
  );

  // 7. unknown template: the error lists production templates too
  const e1 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "no such shape", stateLabel: STATE_LABEL,
  });
  check(
    "apply: unknown name lists built-ins and production templates",
    e1.status === "ERROR" && e1.result.includes("No arc template named 'no such shape'")
      && e1.result.includes(`"${CORRUPTION_NAME}" (production template)`),
    e1.result.slice(0, 240),
  );

  // cleanup: clear the arc (clean impact), then remove the fixture entirely
  const clear = await executeTool(projectId, "set_state_arc", {
    characterName: "Lin Yue", stateLabel: "", sceneNumber: FIXTURE_SCENE, shotFrom: 1, shotTo: 4,
  });
  check(
    "cleanup: clear resets the range and the diff is clean again",
    clear.status === "OK" && clear.result.includes("2 line(s) stamped in shot(s) 1, 3")
      && clear.result.includes(`Direction impact: episode ${fixtureEpNumber} is clean (1 fresh, 1 unrendered)`)
      && !clear.result.includes("Offer the re-render"),
    clear.result.slice(-240),
  );
  await cleanupEpisodeFixture(fixture.cue1.id);
  await db.characterState.deleteMany({ where: { characterId: chId, label: "E2E Possessed (fixture)" } });
  const leftover = await db.episode.count({ where: { number: FIXTURE_EPISODE, season: { projectId } } });
  const leftoverTemplates = await db.arcTemplate.count({ where: { projectId, name: { in: [CORRUPTION_NAME, DRAIN_NAME] } } });
  const leftoverStates = await db.characterState.count({ where: { characterId: chId, label: "E2E Possessed (fixture)" } });
  check("cleanup: fixture episode, templates and state removed", leftover === 0 && leftoverTemplates === 0 && leftoverStates === 0);

  // the real season is untouched: Ep7 still 0 fresh / 0 stale / 1 unrendered
  const ep7 = await db.episode.findFirst({ where: { number: 7, season: { projectId } } });
  const diff = ep7 ? await diffEpisodeById(ep7.id) : null;
  check(
    "cleanup: Ep7 untouched (0 fresh / 0 stale / 1 unrendered)",
    diff !== null && diff.fresh === 0 && diff.stale === 0 && diff.unrendered === 1,
    diff ? `${diff.fresh} fresh / ${diff.stale} stale / ${diff.unrendered} unrendered` : "no diff",
  );
  const ep7Scene = await db.scene.findFirst({
    where: { number: 12, episode: { number: 7, season: { projectId } } },
    include: { shots: { orderBy: { number: "asc" } } },
  });
  const s3Ep7 = ep7Scene?.shots.find((s) => s.number === 3);
  check(
    "cleanup: Ep7 Sc12 S3 dialogue byte-identical",
    s3Ep7?.dialogue === '[{"speaker":"Lin Yue","text":"The rain... it stopped.","kind":"THOUGHT"}]',
  );
} else {
  throw new Error(`Unknown step '${step}' (use plan | api | tool)`);
}

await db.$disconnect();
if (failures > 0) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log("\nALL PASS");

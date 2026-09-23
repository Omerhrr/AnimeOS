// E2E Iteration 21: studio-level template library shared across
// productions + DSH chaining suggest + apply in one batch.
// Steps:
//   api  - studio template CRUD over /api/arc-templates (needs the dev
//          server): create with scope STUDIO (projectId null), the row
//          visible from ANOTHER production's GET, studio duplicate 409,
//          promote PROJECT -> STUDIO via PATCH, promote name-clash 409,
//          demote back with projectId, bad scope 400, delete, 404
//   tool - runs on TWO self-contained fixtures (removed after):
//          project B ("E2E Studio Library B", Ep9/Sc90, Ren Wu) proves
//          cross-production sharing: a studio template saved against
//          production A is matched and applied on B; then production A's
//          fixture (Ep8/Sc20, Lin Yue + a rendered take) exercises the
//          ONE-BATCH CHAIN: suggest_arc_template with characterName +
//          stateLabel applies the matched template in the same call
//          (built-in chain on B, studio chain on A, direction impact +
//          staleness asserted, DB lines checked), the chained-failure
//          paths (bad state, bad character) keep the match header, the
//          non-chained path still only proposes, production templates
//          outrank a same-named studio template, and the unknown-name
//          error lists studio rows too.
// The season ends exactly as it started: Ep7 untouched (0 fresh / 0 stale / 1 unrendered).
import { executeTool } from "@/lib/dsh/tools";
import { parseDialogue } from "@/lib/comic/dialogue";
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
const step = process.argv[2] ?? "api";
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const STUDIO_NAME = "e2e studio sweep";
const STUDIO_DESC = "when the director calls for a studio sweep: a slow rolling tide over the cast that then lets go";
const STUDIO_SEGMENTS = [{ frac: 0.6, kind: "state" as const }, { frac: 0.4, kind: "auto" as const }];
const STUDIO_PROSE = "the studio sweep rolls over the cast like a slow tide and then lets go";
const POSSESSION_PROSE = "she starts the fight normal, the possession takes hold mid-scene, then it releases";

async function postTemplate(body: unknown) {
  return fetch(`${BASE}/api/arc-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

if (step === "api") {
  const OTHER = "e2e-other-production";

  // 1. create a STUDIO template (projectId passed for the event only)
  const post = await postTemplate({
    projectId, scope: "STUDIO", name: STUDIO_NAME, description: STUDIO_DESC, segments: STUDIO_SEGMENTS,
  });
  const created = (await post.json()) as { id?: string; error?: string };
  check("api: studio POST creates a template", post.ok && Boolean(created.id), JSON.stringify(created).slice(0, 140));
  const sid = created.id ?? "";

  // 2. the studio row reads back with scope STUDIO and no owning production
  const listA = await fetch(`${BASE}/api/arc-templates?projectId=${projectId}`);
  const rowsA = (await listA.json()) as Array<{ id: string; scope: string; projectId: string | null; segments: Array<{ frac: number; kind: string }> }>;
  const row = rowsA.find((r) => r.id === sid);
  check(
    "api: GET shows the studio row (scope STUDIO, projectId null, normalized shape)",
    row?.scope === "STUDIO" && row?.projectId === null && row.segments.length === 2 && row.segments[0].kind === "state",
    JSON.stringify(row ?? null).slice(0, 160),
  );

  // 3. the SAME row is visible from another production's GET - and that
  //    listing does NOT leak this production's private rows
  const listB = await fetch(`${BASE}/api/arc-templates?projectId=${OTHER}`);
  const rowsB = (await listB.json()) as Array<{ id: string; scope: string }>;
  check(
    "api: studio row shared across productions (visible from another projectId)",
    rowsB.some((r) => r.id === sid && r.scope === "STUDIO") && !rowsB.some((r) => r.id !== sid),
    `${rowsB.length} row(s) from the other production`,
  );

  // 4. the same name cannot be saved into the studio library twice,
  //    even from a different production
  const dup = await postTemplate({ projectId: OTHER, scope: "STUDIO", name: STUDIO_NAME, segments: [{ frac: 1, kind: "auto" }] });
  const dupBody = (await dup.json()) as { error?: string };
  check(
    "api: duplicate studio name 409 (across productions)",
    dup.status === 409 && dupBody.error?.includes("studio library"),
    `${dup.status} ${dupBody.error ?? ""}`,
  );

  // 5. promote a production template into the studio library
  const post2 = await postTemplate({
    projectId, name: "e2e private shape", segments: [{ frac: 40, kind: "auto" }, { frac: 60, kind: "state" }],
  });
  const created2 = (await post2.json()) as { id?: string };
  const pid = created2.id ?? "";
  const promote = await fetch(`${BASE}/api/arc-templates/${pid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "STUDIO" }),
  });
  check("api: PATCH scope STUDIO promotes a production template", promote.ok, String(promote.status));
  const list2 = await fetch(`${BASE}/api/arc-templates?projectId=${OTHER}`);
  const rows2 = (await list2.json()) as Array<{ id: string; scope: string; projectId: string | null }>;
  const promoted = rows2.find((r) => r.id === pid);
  check(
    "api: promoted row is now STUDIO + detached from the production",
    promoted?.scope === "STUDIO" && promoted?.projectId === null,
    JSON.stringify(promoted ?? null),
  );

  // 6. promoting a row whose name clashes with an existing studio row is a 409
  const post3 = await postTemplate({ projectId, name: "e2e clash shape", segments: [{ frac: 1, kind: "state" }] });
  const created3 = (await post3.json()) as { id?: string };
  const cid = created3.id ?? "";
  const clash = await fetch(`${BASE}/api/arc-templates/${cid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: STUDIO_NAME, scope: "STUDIO" }),
  });
  const clashBody = (await clash.json()) as { error?: string };
  check(
    "api: promote with a studio name clash 409",
    clash.status === 409 && clashBody.error?.includes("studio library"),
    `${clash.status} ${clashBody.error ?? ""}`,
  );

  // 7. demote back onto a production with an explicit projectId
  const demote = await fetch(`${BASE}/api/arc-templates/${pid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "PROJECT", projectId }),
  });
  check("api: PATCH scope PROJECT + projectId demotes back", demote.ok, String(demote.status));
  const list3 = await fetch(`${BASE}/api/arc-templates?projectId=${OTHER}`);
  const rows3 = (await list3.json()) as Array<{ id: string }>;
  check("api: demoted row left the other production's view", !rows3.some((r) => r.id === pid));

  // 8. bad scope is a 400
  const badScope = await fetch(`${BASE}/api/arc-templates/${cid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "BANANA" }),
  });
  check("api: bad scope 400", badScope.status === 400, String(badScope.status));

  // 9. cleanup: delete every fixture row, studio library empty again
  for (const id of [sid, pid, cid]) {
    const del = await fetch(`${BASE}/api/arc-templates/${id}`, { method: "DELETE" });
    check(`api: DELETE ${id === sid ? "studio" : "production"} row ok`, del.ok, String(del.status));
  }
  const del2 = await fetch(`${BASE}/api/arc-templates/${sid}`, { method: "DELETE" });
  check("api: DELETE again 404", del2.status === 404, String(del2.status));
  const listEnd = await fetch(`${BASE}/api/arc-templates?projectId=${OTHER}`);
  const rowsEnd = (await listEnd.json()) as Array<{ id: string }>;
  check("api: studio library empty again from the other production", rowsEnd.length === 0, `${rowsEnd.length} row(s)`);
} else if (step === "tool") {
  // the studio template lives OUTSIDE any production (projectId null)
  await db.arcTemplate.deleteMany({ where: { name: STUDIO_NAME } });
  await db.arcTemplate.create({
    data: { projectId: null, scope: "STUDIO", name: STUDIO_NAME, description: STUDIO_DESC, segments: JSON.stringify(STUDIO_SEGMENTS) },
  });

  // ── project B fixture: a SECOND production on the same lot ──
  await db.project.deleteMany({ where: { title: "E2E Studio Library B" } });
  const projB = await db.project.create({
    data: { title: "E2E Studio Library B", format: "SERIES", visualStyle: "ANIME", originalLanguage: "ja-JP" },
  });
  await db.season.create({ data: { projectId: projB.id, number: 1, title: "Season 1" } });
  const renWu = await db.character.create({ data: { projectId: projB.id, name: "Ren Wu", role: "RIVAL" } });
  await db.characterState.create({
    data: { characterId: renWu.id, label: "E2E Studio State", stateType: "TEMPORARY", episodeNumber: 8, voiceVariant: "kazi", pitchHint: 0.85 },
  });
  const seasonB = await db.season.findFirst({ where: { projectId: projB.id, number: 1 } });
  if (!seasonB) throw new Error("Season 1 (B) not found");
  const epB = await db.episode.create({ data: { seasonId: seasonB.id, number: 9, title: "Studio library fixture B", status: "DRAFT" } });
  const scB = await db.scene.create({ data: { episodeId: epB.id, number: 90, title: "Fixture scene B", status: "DRAFT" } });
  const bLines = [
    "The tide obeys no one.",
    "I am the tide now.",
    "The tide recedes.",
  ];
  const shotB1 = await db.shot.create({
    data: { sceneId: scB.id, number: 1, description: "fixture B shot 1", shotType: "MEDIUM", dialogue: JSON.stringify([{ speaker: "Ren Wu", text: bLines[0], kind: "SPEECH" }]) },
  });
  await db.shot.create({ data: { sceneId: scB.id, number: 2, description: "fixture B shot 2", shotType: "MEDIUM", dialogue: JSON.stringify([{ speaker: "Ren Wu", text: bLines[1], kind: "SPEECH" }]) } });
  await db.shot.create({ data: { sceneId: scB.id, number: 3, description: "fixture B shot 3", shotType: "MEDIUM", dialogue: JSON.stringify([{ speaker: "Ren Wu", text: bLines[2], kind: "SPEECH" }]) } });
  const cueB1 = await db.audioCue.create({ data: { shotId: shotB1.id, kind: "VOICE", label: `Ren Wu: ${bLines[0]}` } });
  const renderedB = await renderVoiceTake(cueB1.id);
  check("fixture B: real TTS take rendered on shot 1", Boolean(renderedB.cue.voiceUrl) && Boolean(renderedB.cue.voiceSig), `bytes=${renderedB.bytes}`);

  // 1. ONE-BATCH CHAIN on B with a BUILT-IN: suggest applies possession spread in the same call
  const c1 = await executeTool(projB.id, "suggest_arc_template", {
    description: POSSESSION_PROSE, characterName: "Ren Wu", stateLabel: "E2E Studio State",
    sceneNumber: 90, shotFrom: 1, shotTo: 3,
  });
  check(
    "chain B: built-in match applied in the same call",
    c1.status === "OK"
      && c1.result.includes(`Template match: "possession spread" scores`)
      && c1.result.includes(`Applied in this batch: Arc template "possession spread" on Ren Wu with "E2E Studio State" across scene 90 shots 1-3: 1 line(s) stamped in shot(s) 2`),
    c1.result.slice(0, 300),
  );
  check(
    "chain B: clean direction impact rides the chained result",
    c1.result.includes(`Direction impact: episode 9 is clean (1 fresh, 0 unrendered)`) && !c1.result.includes("Offer the re-render"),
    c1.result.slice(-220),
  );
  const shotB2 = await db.shot.findFirst({ where: { sceneId: scB.id, number: 2 } });
  check(
    "chain B: shot 2 line carries the forced state",
    parseDialogue(shotB2?.dialogue ?? null).find((l) => l.speaker === "Ren Wu")?.state === "E2E Studio State",
    parseDialogue(shotB2?.dialogue ?? null).find((l) => l.speaker === "Ren Wu")?.state ?? "null",
  );

  // 2. non-chained suggest still only proposes
  const c2 = await executeTool(projB.id, "suggest_arc_template", { description: POSSESSION_PROSE, characterName: "Ren Wu" });
  check(
    "chain B: without stateLabel the tool only proposes",
    c2.status === "OK" && c2.result.includes("Propose it in this turn") && c2.result.includes("State candidates for Ren Wu") && !c2.result.includes("Applied in this batch"),
    c2.result.slice(0, 200),
  );

  // 3. apply_arc_template by the STUDIO name on B: cross-production sharing proof
  const c3 = await executeTool(projB.id, "apply_arc_template", {
    characterName: "Ren Wu", template: STUDIO_NAME, stateLabel: "E2E Studio State",
    sceneNumber: 90, shotFrom: 1, shotTo: 3,
  });
  check(
    "chain B: studio template applied on ANOTHER production (tagged)",
    c3.status === "OK"
      && c3.result.includes(`Arc template "${STUDIO_NAME}" (studio template) on Ren Wu with "E2E Studio State"`)
      && c3.result.includes("1 line(s) stamped in shot(s) 1"),
    c3.result.slice(0, 280),
  );
  check(
    "chain B: the rendered take on shot 1 went stale (same-turn offer)",
    c3.result.includes(`Direction impact: episode 9 now has 1 stale take(s)`) && c3.result.includes("Offer the re-render in the same turn"),
    c3.result.slice(-240),
  );

  // 4. the studio template also wins the prose match from B's registry
  const c4 = await executeTool(projB.id, "suggest_arc_template", { description: STUDIO_PROSE });
  check(
    "chain B: studio template matched from prose and tagged",
    c4.status === "OK" && c4.result.includes(`Template match: "${STUDIO_NAME}" (studio template) scores`),
    c4.result.slice(0, 220),
  );

  // cleanup B: the whole second production cascades away
  await db.project.delete({ where: { id: projB.id } });
  await unlink(path.join(process.cwd(), "public", "voices", `${cueB1.id}.wav`)).catch(() => {});

  // ── production A fixture: the ONE-BATCH CHAIN on the real show ──
  const chId = await db.character.findFirst({ where: { projectId, name: "Lin Yue" }, select: { id: true } });
  if (!chId) throw new Error("Lin Yue not found");
  await db.characterState.deleteMany({ where: { characterId: chId.id, label: "E2E Possessed (fixture)" } });
  await db.characterState.create({
    data: { characterId: chId.id, label: "E2E Possessed (fixture)", stateType: "TEMPORARY", episodeNumber: 9, voiceVariant: "kazi", pitchHint: 0.8 },
  });
  await db.episode.deleteMany({ where: { number: 8, season: { projectId } } });
  const season = await db.season.findFirst({ where: { projectId, number: 1 } });
  if (!season) throw new Error("Season 1 not found");
  const epA = await db.episode.create({ data: { seasonId: season.id, number: 8, title: "Studio library fixture (E2E)", status: "DRAFT" } });
  const scA = await db.scene.create({ data: { episodeId: epA.id, number: 20, title: "Bridge of Blades - fixture", status: "DRAFT" } });
  const aDialogues: Record<number, Array<{ speaker: string; text: string; kind: string }>> = {
    1: [{ speaker: "Lin Yue", text: "The Jade Sword still answers my call.", kind: "SPEECH" }],
    2: [{ speaker: "Su Yan", text: "You cannot hold two swords with one soul.", kind: "SPEECH" }],
    3: [{ speaker: "Lin Yue", text: "The rain... it stopped.", kind: "THOUGHT" }],
    4: [{ speaker: "Lin Yue", text: "Then the soul stretches.", kind: "SPEECH" }],
  };
  const aShots: Record<number, string> = {};
  for (const n of [1, 2, 3, 4]) {
    const sh = await db.shot.create({
      data: { sceneId: scA.id, number: n, description: `fixture A shot ${n}`, shotType: "MEDIUM", dialogue: JSON.stringify(aDialogues[n]) },
    });
    aShots[n] = sh.id;
  }
  const cueA1 = await db.audioCue.create({ data: { shotId: aShots[1], kind: "VOICE", label: "Lin Yue: The Jade Sword still answers my call." } });
  const rendered = await renderVoiceTake(cueA1.id);
  check("fixture A: real TTS take rendered on shot 1", Boolean(rendered.cue.voiceUrl) && Boolean(rendered.cue.voiceSig), `bytes=${rendered.bytes}`);

  // 5. ONE-BATCH CHAIN on A with the STUDIO template: matched + applied + impact in one result
  const c5 = await executeTool(projectId, "suggest_arc_template", {
    description: STUDIO_PROSE, characterName: "Lin Yue", stateLabel: "E2E Possessed",
    sceneNumber: 20, shotFrom: 1, shotTo: 4,
  });
  check(
    "chain A: studio match applied in the same call",
    c5.status === "OK"
      && c5.result.includes(`Template match: "${STUDIO_NAME}" (studio template) scores`)
      && c5.result.includes(`Applied in this batch: Arc template "${STUDIO_NAME}" (studio template) on Lin Yue with "E2E Possessed (fixture)" across scene 20 shots 1-4: 2 line(s) stamped in shot(s) 1, 3`),
    c5.result.slice(0, 340),
  );
  check(
    "chain A: staleness + same-turn offer ride the chained result",
    c5.result.includes(`Direction impact: episode 8 now has 1 stale take(s)`) && c5.result.includes("Offer the re-render in the same turn"),
    c5.result.slice(-240),
  );
  check(
    "chain A: one-batch closing guidance replaces the propose framing",
    c5.result.includes("The beat landed in one batch") && !c5.result.includes("Propose it in this turn"),
    c5.result.slice(-200),
  );
  const s1After = parseDialogue((await db.shot.findFirst({ where: { id: aShots[1] } }))?.dialogue ?? null);
  const s2After = parseDialogue((await db.shot.findFirst({ where: { id: aShots[2] } }))?.dialogue ?? null);
  const s4After = parseDialogue((await db.shot.findFirst({ where: { id: aShots[4] } }))?.dialogue ?? null);
  check(
    "chain A: DB lines stamped (state on 1+3, auto on 4, rival untouched)",
    s1After.find((l) => l.speaker === "Lin Yue")?.state === "E2E Possessed (fixture)"
      && s4After.find((l) => l.speaker === "Lin Yue")?.state === null
      && s2After.every((l) => !l.state),
    JSON.stringify({ s1: s1After[0]?.state, s4: s4After[0]?.state }),
  );
  const lastEvent = await db.productionEvent.findFirst({
    where: { projectId, summary: { contains: STUDIO_NAME } },
    orderBy: { createdAt: "desc" },
  });
  check(
    "chain A: production event carries the studio tag",
    Boolean(lastEvent?.summary.includes("(studio template)")),
    lastEvent?.summary.slice(0, 160) ?? "no event",
  );

  // 6. chained apply with a bad state fails but keeps the match header
  const c6 = await executeTool(projectId, "suggest_arc_template", {
    description: STUDIO_PROSE, characterName: "Lin Yue", stateLabel: "no such state",
    sceneNumber: 20, shotFrom: 1, shotTo: 4,
  });
  check(
    "chain A: bad stateLabel -> ERROR with the match header intact",
    c6.status === "ERROR"
      && c6.result.includes(`Template match: "${STUDIO_NAME}" (studio template)`)
      && c6.result.includes("but the chained apply failed: No state of Lin Yue matches 'no such state'"),
    c6.result.slice(0, 240),
  );

  // 7. weak prose + stateLabel: no chain, fallback guidance only
  const c7 = await executeTool(projectId, "suggest_arc_template", {
    description: "the sword hums and the moon turns sideways", characterName: "Lin Yue", stateLabel: "E2E Possessed",
  });
  check(
    "chain A: weak prose never chains",
    c7.status === "OK" && c7.result.includes("No arc template strongly matches") && !c7.result.includes("Applied in this batch"),
    c7.result.slice(0, 200),
  );

  // 8. precedence: a same-named PRODUCTION template outranks the studio row
  await db.arcTemplate.create({
    data: { projectId, scope: "PROJECT", name: STUDIO_NAME, description: "an impostor saved on this production", segments: JSON.stringify([{ frac: 1, kind: "state" }]) },
  });
  const c8 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: STUDIO_NAME, stateLabel: "E2E Possessed",
    sceneNumber: 20, shotFrom: 1, shotTo: 4,
  });
  check(
    "chain A: production template wins over the same-named studio row",
    c8.status === "OK" && c8.result.includes(`Arc template "${STUDIO_NAME}" (production template) on Lin Yue`) && c8.result.includes("1 line(s) stamped in shot(s) 4"),
    c8.result.slice(0, 240),
  );
  await db.arcTemplate.deleteMany({ where: { projectId, name: STUDIO_NAME } });
  const c9 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: STUDIO_NAME, stateLabel: "E2E Possessed",
    sceneNumber: 20, shotFrom: 1, shotTo: 4,
  });
  check(
    "chain A: with the impostor gone the studio row answers again",
    c9.status === "OK" && c9.result.includes(`Arc template "${STUDIO_NAME}" (studio template) on Lin Yue`),
    c9.result.slice(0, 200),
  );

  // 9. unknown name: the error lists built-ins AND studio rows
  const c10 = await executeTool(projectId, "apply_arc_template", {
    characterName: "Lin Yue", template: "no such shape", stateLabel: "E2E Possessed",
  });
  check(
    "chain A: unknown name lists the studio row too",
    c10.status === "ERROR" && c10.result.includes("No arc template named 'no such shape'") && c10.result.includes(`"${STUDIO_NAME}" (studio template)`),
    c10.result.slice(0, 260),
  );

  // cleanup A: clear the arc (clean impact), remove fixture + state + studio template
  const clear = await executeTool(projectId, "set_state_arc", {
    characterName: "Lin Yue", stateLabel: "", sceneNumber: 20, shotFrom: 1, shotTo: 4,
  });
  check(
    "cleanup A: clear resets the range and the diff is clean again",
    clear.status === "OK" && clear.result.includes("2 line(s) stamped in shot(s) 1, 3")
      && clear.result.includes(`Direction impact: episode 8 is clean (1 fresh, 0 unrendered)`),
    clear.result.slice(-200),
  );
  await db.episode.deleteMany({ where: { number: 8, season: { projectId } } });
  await unlink(path.join(process.cwd(), "public", "voices", `${cueA1.id}.wav`)).catch(() => {});
  await db.characterState.deleteMany({ where: { characterId: chId.id, label: "E2E Possessed (fixture)" } });
  await db.arcTemplate.deleteMany({ where: { name: STUDIO_NAME } });
  const leftoverEp = await db.episode.count({ where: { number: 8, season: { projectId } } });
  const leftoverTpl = await db.arcTemplate.count({ where: { name: STUDIO_NAME } });
  const leftoverState = await db.characterState.count({ where: { characterId: chId.id, label: "E2E Possessed (fixture)" } });
  const leftoverB = await db.project.count({ where: { title: "E2E Studio Library B" } });
  check("cleanup: fixtures, state and studio template removed", leftoverEp === 0 && leftoverTpl === 0 && leftoverState === 0 && leftoverB === 0);

  // the real season is untouched: Ep7 still 0 fresh / 0 stale / 1 unrendered
  const ep7 = await db.episode.findFirst({ where: { number: 7, season: { projectId } } });
  const diff = ep7 ? await diffEpisodeById(ep7.id) : null;
  check(
    "cleanup: Ep7 untouched (0 fresh / 0 stale / 1 unrendered)",
    diff !== null && diff.fresh === 0 && diff.stale === 0 && diff.unrendered === 1,
    diff ? `${diff.fresh} fresh / ${diff.stale} stale / ${diff.unrendered} unrendered` : "no diff",
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

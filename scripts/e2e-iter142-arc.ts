// ─────────────────────────────────────────────────────────────
// E2E ITERATION 142 - THE ARC: the release gate's number is the
// multi-night median, not a single night's sweep.
//
// The 141 night measured the band (identical craft: mean 38 one
// drain, mean 60 the next; the eye confirmed the pixels did not
// move) and the sweep's own table structurally cannot remember
// (IdentityScore: one row per shot+source - every night overwrites
// the last). The 142 probe measured the candidates: the arc (the
// per-shot median across the cohort's nights) is the reproducible
// instrument (mean 49 on the receipts, inside the 38..60 band,
// still BELOW - the instrument does not flatter the craft).
//
// This gate proves the mechanism end to end:
//   A1 the source law (the schema's arc table, the reset's
//      non-deletion, the rescore's append wire, the version)
//   A2 the cohort law (the bridges' own law versions name the cohort)
//   A3 the arc math (pure: per-entry medians across nights, the
//      cohort filter, the night count)
//   A4 the REAL gate (append arc rows for the standing scene's
//      shots -> episodeReleaseVerdict reads arc=true, the medians
//      land, one night reads PROVISIONAL, two nights do not)
//   A5 the survival law (the identityScore wipe leaves the arc
//      standing - the reset's exact shape, scoped to the e2e's own
//      lab row so the production sweep keeps its night)
//   A6 the fallback (a lab scope with no arc rows -> the UNSCORED
//      spine and the sweep's rows answer byte-exact in EVERY ledger
//      state - the cascade's refusals cannot change shape)
//   A8/A9 the no-residue law (the 143 repair: the production arc
//      carries REAL nights now, so cleanup is judged against the
//      captured production truth, byte-exact - not against an
//      emptiness no honest night will ever restore)
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter142-arc.ts
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { readFileSync } from "fs";
import {
  IDENTITY_ARC_LAW_VERSION,
  IDENTITY_ARC_MIN_NIGHTS,
  appendIdentityArcReading,
  arcMedianRows,
  bridgeLawCohort,
  readIdentityArcEpisode,
} from "../src/lib/identity-arc";
import { episodeReleaseVerdict, episodeReleaseRefusal } from "../src/lib/identity-matrix";

const db = new PrismaClient();
const TITLE = "Immortal Path";
// THE DURABLE LEDGER (iteration 144): the e2e's appends ride their
// own lab receipt so the production ledger carries only REAL nights;
// deleted fresh at the start and gone at the end (no residue).
const LAB_ARC = "receipts/.e2e142-lab.jsonl";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("== Iteration 142: THE ARC - the gate reads the drain-to-drain truth ==\n");

  // ── A1 the source law ──
  const arcSrc = readFileSync("src/lib/identity-arc.ts", "utf8");
  check("A1a the arc lib carries its law version (144)", arcSrc.includes("export const IDENTITY_ARC_LAW_VERSION = 144"));
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  check("A1b the schema carries the arc table (one reading per shot+source+night)",
    schema.includes("model IdentityArcReading") && schema.includes("@@unique([shotId, source, night])"));
  const resetSrc = readFileSync("scripts/reset-sc12-renders.ts", "utf8");
  check("A1c the reset wipes the sweep but NEVER the arc (the ledger survives the night)",
    resetSrc.includes("identityScore.deleteMany") && !resetSrc.includes("identityArcReading"));
  const rescoreSrc = readFileSync("scripts/night111-rescore.ts", "utf8");
  check("A1d the night rescore appends its verdicts to the arc (night-tagged, cohort-tagged)",
    rescoreSrc.includes("appendIdentityArcReading") && rescoreSrc.includes("bridgeLawCohort()"));

  // ── A2 the cohort law ──
  const cohort = bridgeLawCohort();
  check("A2 the cohort is the bridges' own law versions (a125/t133/p108 - the standing build)",
    cohort === "a125/t133/p108", `got ${cohort}`);
  check("A2b the arc's youth law stands (a one-night arc is PROVISIONAL below the floor of two)",
    IDENTITY_ARC_MIN_NIGHTS === 2 && IDENTITY_ARC_LAW_VERSION === 144);

  // ── A3 the arc math (pure) ──
  const idByName = new Map<string, string>([["Lin Yue", "c-lin"], ["Demon Lord Wei", "c-wei"]]);
  const mkShot = (shotId: string, number: number) => ({
    shotId, night: "", cohort: "", scores: "[]",
    shot: { shotType: "CLOSEUP", movement: "STATIC", description: "a look", poseStart: "stand", poseEnd: null, lighting: "night",
      number, scene: { number: 12, episode: { number: 7 } } },
  });
  const twoNights = [
    { ...mkShot("s1", 1), night: "n1", cohort: "co", scores: JSON.stringify([{ characterName: "Lin Yue", similarity: 0.35, aspects: { face: 0.2, style: 0.3 }, note: "n1" }]) },
    { ...mkShot("s1", 1), night: "n2", cohort: "co", scores: JSON.stringify([{ characterName: "Lin Yue", similarity: 0.85, aspects: { face: 0.9, style: 0.9 }, note: "n2" }]) },
    { ...mkShot("s2", 2), night: "n1", cohort: "old", scores: JSON.stringify([{ characterName: "Lin Yue", similarity: 0.99, aspects: {}, note: "old cohort" }]) },
  ];
  const buckets = (shot: { shotType: string | null }) => ({ framing: shot.shotType ?? "?", yaw: "?", expression: "?", lighting: "?", state: "?" });
  const arc = arcMedianRows({
    arcRows: twoNights,
    idByName: idByName as Map<string, string>,
    bucketOf: buckets as never,
  });
  const lin = arc.rows.find((r) => r.characterName === "Lin Yue" && r.shotId === "s1");
  check("A3a the per-entry median lands (0.35 & 0.85 -> 0.60 - the swing cannot move it)",
    !!lin && Math.abs(lin.similarity - 0.6) < 1e-9, `got ${lin?.similarity}`);
  check("A3c the cohort filter (the 'old' cohort's 0.99 never enters the arc's rows)",
    arc.rows.length === 1 && arc.rows[0].shotId === "s1", `rows=${arc.rows.length}`);
  check("A3d the night count is the cohort's own (2 nights in 'co')", arc.nights === 2, `got ${arc.nights}`);

  // ── the REAL production ──
  const project = await db.project.findFirst({ where: { title: TITLE } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const shots = await db.shot.findMany({ where: { sceneId: scene.id }, orderBy: { number: "asc" } });
  if (shots.length < 3) throw new Error("the standing scene carries too few shots");
  const episodeId = scene.episodeId;

  // ── the production truth FIRST (A8/A9's no-residue baseline) ──
  const preProduction = await episodeReleaseVerdict(project.id, episodeId);
  const preProductionRefusal = episodeReleaseRefusal(preProduction, "EP07");

  // ── A6 the fallback shapes (on the e2e's own lab scope): the
  // production arc carries REAL nights now (night-143), so the
  // pre-arc fallback can no longer ride the production episode's
  // emptiness - the lab chain makes the shapes assert in EVERY
  // ledger state the studio will ever run this gate in ──
  const season = await db.season.findFirst({ where: { projectId: project.id } });
  if (!season) throw new Error("season missing");
  const labEpisode = await db.episode.create({ data: { seasonId: season.id, number: 99, title: "e2e-arc-lab" } });
  const labScene = await db.scene.create({ data: { episodeId: labEpisode.id, number: 99, title: "e2e-arc-lab" } });
  const labShot = await db.shot.create({ data: { sceneId: labScene.id, number: 99, description: "e2e arc lab - Lin Yue stands", shotType: "MEDIUM", movement: "STATIC", poseStart: "stand", lighting: "night", duration: 1 } });
  // no readings at all -> UNSCORED (the spine does not guess)
  const labEmpty = await episodeReleaseVerdict(project.id, labEpisode.id);
  check("A6-pre no readings -> UNSCORED (arc=false, the spine does not guess)",
    labEmpty.verdict === "UNSCORED" && labEmpty.arc === false && labEmpty.readings === 0,
    `verdict=${labEmpty.verdict} arc=${labEmpty.arc}`);
  check("A6-pre2 the UNSCORED refusal keeps its standing words",
    episodeReleaseRefusal(labEmpty, "E-LAB").includes("carries no scored identity readings"));
  // one sweep row, still no arc rows -> the sweep answers (the pre-arc fallback)
  await db.identityScore.create({ data: { projectId: project.id, shotId: labShot.id, source: "RENDER", scores: JSON.stringify([{ characterName: "Lin Yue", similarity: 0.5, aspects: { face: 0.4, style: 0.5 }, note: "e2e sweep row" }]), worst: 0.5, castSize: 1 } });
  const labSweep = await episodeReleaseVerdict(project.id, labEpisode.id);
  check("A6a no arc rows -> the sweep answers byte-exact (arc=false, nights=1)",
    labSweep.arc === false && labSweep.nights === 1 && labSweep.provisional === false && labSweep.readings === 1,
    `arc=${labSweep.arc} nights=${labSweep.nights} readings=${labSweep.readings}`);
  const labSweepRefusal = episodeReleaseRefusal(labSweep, "E-LAB");
  check("A6b the fallback refusal keeps its standing shape (no arc vocabulary)",
    !labSweepRefusal.includes("arc") && !labSweepRefusal.includes("PROVISIONAL"), labSweepRefusal.slice(0, 120));

  // ── A4 the REAL gate on the REAL shots ──
  try { fs.rmSync(LAB_ARC, { force: true }); } catch { /* fresh fold */ }
  const CO = "e2e-arc";
  const OLD = "a000/t000/p000";
  // an old-cohort reading first (earliest scoredAt -> filtered by the leader)
  await appendIdentityArcReading({
    projectId: project.id, shotId: shots[2].id, source: "RENDER",
    night: "e2e-old", cohort: OLD, worst: 0.99,
    scores: [{ characterName: "Lin Yue", similarity: 0.99, aspects: {}, note: "old cohort - never reads" }],
  }, { receiptPath: LAB_ARC });
  await sleep(40);
  // night one: every shot reads LOW
  for (const s of shots.slice(0, 2)) {
    await appendIdentityArcReading({
      projectId: project.id, shotId: s.id, source: "RENDER",
      night: "e2e-n1", cohort: CO, worst: 0.35,
      scores: [{ characterName: "Lin Yue", similarity: 0.35, aspects: { face: 0.2, style: 0.3 }, note: "e2e n1" }],
    }, { receiptPath: LAB_ARC });
  }
  await sleep(40);
  const one = await episodeReleaseVerdict(project.id, episodeId);
  check("A4a a one-night arc answers (arc=true) and names itself PROVISIONAL",
    one.arc === true && one.nights === 1 && one.provisional === true, `nights=${one.nights}`);
  const rawRow = await readIdentityArcEpisode(project.id, episodeId);
  const rawN1 = rawRow.find((r) => r.night === "e2e-n1");
  check("A4b the ledger keeps each night's RAW verdicts (the entries round-trip through scores JSON)",
    !!rawN1 && JSON.parse(rawN1.scores)[0]?.note === "e2e n1");
  check("A4c the provisional refusal carries the flag in its own words",
    episodeReleaseRefusal(one, "EP07").includes("PROVISIONAL - single-night read"));
  check("A4d the old cohort never reads (the leader's cohort filters; the 0.99 row is invisible)",
    one.readings === 2, `readings=${one.readings}`);
  // night two: the same craft reads HIGH (the 141 band, replayed)
  for (const [i, s] of shots.slice(0, 2).entries()) {
    await appendIdentityArcReading({
      projectId: project.id, shotId: s.id, source: "RENDER",
      night: "e2e-n2", cohort: CO, worst: i === 0 ? 0.85 : 0.5,
      scores: [{ characterName: "Lin Yue", similarity: i === 0 ? 0.85 : 0.5, aspects: { face: 0.9, style: 0.9 }, note: "e2e n2" }],
    }, { receiptPath: LAB_ARC });
  }
  const two = await episodeReleaseVerdict(project.id, episodeId);
  check("A4e two nights settle the arc (provisional=false, nights=2)",
    two.arc === true && two.nights === 2 && two.provisional === false);
  const s1Entries = two.overall;
  // S001's arc median = (0.35 + 0.85) / 2 = 0.60; S002's = (0.35 + 0.5) / 2 = 0.425;
  // the overall cell's mean = (0.60 + 0.425) / 2 = 0.5125
  check("A4f the gate's number IS the arc median (the overall mean lands at 0.5125)",
    Math.abs(s1Entries.mean - 0.5125) < 1e-6, `overall mean=${s1Entries.mean}`);
  const arcRefusal = episodeReleaseRefusal(two, "EP07");
  check("A4g the settled arc names its span (arc reading(s) across 2 night(s))",
    arcRefusal.includes("arc reading(s) across 2 night(s)"), arcRefusal.slice(0, 160));
  // the idempotent append: re-riding the same night replaces, never duplicates
  await appendIdentityArcReading({
    projectId: project.id, shotId: shots[0].id, source: "RENDER",
    night: "e2e-n2", cohort: CO, worst: 0.85,
    scores: [{ characterName: "Lin Yue", similarity: 0.85, aspects: { face: 0.9 }, note: "re-ride" }],
  }, { receiptPath: LAB_ARC });
  const afterRide = await readIdentityArcEpisode(project.id, episodeId);
  const n2Rows = afterRide.filter((r) => r.night === "e2e-n2").length;
  check("A4h the append is idempotent per night (a re-rescore replaces, never duplicates)",
    n2Rows === 2, `n2 rows=${n2Rows}`);

  // ── A5 the survival law (the reset's wipe shape, scoped to the
  // e2e's own lab row - the production sweep rows keep their night;
  // the arc rows stand, which is the law the reset obeys) ──
  const arcBefore = await db.identityArcReading.count({ where: { projectId: project.id, source: "RENDER" } });
  await db.identityScore.deleteMany({ where: { shotId: labShot.id } }); // THE RESET'S WIPE SHAPE
  const arcAfter = await db.identityArcReading.count({ where: { projectId: project.id, source: "RENDER" } });
  check("A5 the identityScore wipe leaves the arc standing",
    arcBefore > 0 && arcAfter === arcBefore, `before=${arcBefore} after=${arcAfter}`);

  // ── cleanup: the e2e rows leave EVERYWHERE (the production arc's
  // real nights and the lab chain untouched) - the gate's answer
  // must return byte-exact to the production truth captured first ──
  await db.identityArcReading.deleteMany({ where: { projectId: project.id, night: { in: ["e2e-n1", "e2e-n2", "e2e-old"] } } });
  fs.rmSync(LAB_ARC, { force: true }); // the lab receipt leaves with the lab rows
  await db.shot.delete({ where: { id: labShot.id } });
  await db.scene.delete({ where: { id: labScene.id } });
  await db.episode.delete({ where: { id: labEpisode.id } });
  const post = await episodeReleaseVerdict(project.id, episodeId);
  check("A8 the cleanup restores the production truth byte-exact (no e2e residue in the gate's answer)",
    post.verdict === preProduction.verdict && post.arc === preProduction.arc && post.nights === preProduction.nights
      && Math.abs(post.overall.mean - preProduction.overall.mean) < 1e-9,
    `verdict=${post.verdict}/${preProduction.verdict} arc=${post.arc}/${preProduction.arc} nights=${post.nights}/${preProduction.nights}`);
  check("A9 the refusal is byte-exact against the captured production truth (the e2e left no words behind)",
    episodeReleaseRefusal(post, "EP07") === preProductionRefusal);

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 142 (the arc)`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("e2e failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());

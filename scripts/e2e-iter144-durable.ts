// ─────────────────────────────────────────────────────────────
// E2E ITERATION 144 - THE DURABLE ARC: the ledger outlives the
// sandbox.
//
// The 144 probe measured the pattern twice: the night-142 rows died
// in the 143 rebuild, the night-143 rows died in the 144 rebuild -
// the arc as built could never reach its own purpose (the two-night
// median) in a world with sandbox deaths, because its rows rode the
// runtime DB and the runtime DB dies with the box. The fix: every
// append ALSO writes a receipt line into the repo (JSONL,
// committed), keyed by the WORK's number chain (episode/scene/shot)
// - the seed recreates the chain byte-exact every rebuild, the
// surrogate cuids it does not - and the gate UNIONS the DB rows
// with the receipt lines (dedupe by source+ref+night).
//
// This gate proves the durability end to end, on the e2e's own lab
// scope (episode 98 - the lab receipt never touches the production
// ledger):
//   B1 the source law (the version, the receipt path, the fold,
//      the rescore's production wire, the gitignore's shape)
//   B2 the append writes the receipt (the line carries the ref
//      chain and the scores round-trip)
//   B3 THE DEATH LAW (the DB rows deleted - the sandbox-death
//      shape - and the gate STILL reads the night from the receipt)
//   B4 the ref join follows the work (the shot deleted and
//      recreated at the same number - a NEW cuid - and the line
//      still joins; the surrogate died, the work persisted)
//   B5 the union dedupes (a live DB row and its receipt line are
//      ONE reading, never two)
//   B6 the two-night median settles ACROSS a death (night-A's rows
//      dead, night-B alive only in the receipt -> nights=2,
//      provisional=false, the median's number exact)
//   B7 the cohort law rides the receipt (an old-cohort line never
//      reads - the leader filter holds in the union)
//   B8 the anti-fabrication law (the e2e never wrote the production
//      receipt - its bytes are untouched through the whole run)
//   B9 the no-residue law (lab rows, lab chain, lab receipt gone;
//      the production truth byte-exact after)
//
// Run: DATABASE_URL=file:... npx tsx scripts/e2e-iter144-durable.ts
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { readFileSync } from "fs";
import {
  ARC_RECEIPT_PATH,
  IDENTITY_ARC_LAW_VERSION,
  appendIdentityArcReading,
  foldArcReceiptLines,
  readIdentityArcReceipt,
  writeArcReceiptLine,
} from "../src/lib/identity-arc";
import { episodeReleaseVerdict, episodeReleaseRefusal } from "../src/lib/identity-matrix";

const db = new PrismaClient();
const TITLE = "Immortal Path";
const LAB_ARC = "receipts/.e2e144-lab.jsonl"; // gitignored - the lab never commits
const NIGHT_A = "e2e144-a"; // dies with the lab DB (the death shape)
const NIGHT_B = "e2e144-b"; // lives only in the receipt (the across-death night)
const CO = "e2e144-co";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || !detail ? "" : ` - ${detail}`}`);
  if (!ok) failures += 1;
}
const entry = (sim: number, note: string) => ({ characterName: "Lin Yue", similarity: sim, aspects: { face: sim }, note });

async function main() {
  console.log("== Iteration 144: THE DURABLE ARC - the ledger outlives the sandbox ==\n");

  // ── the production truth FIRST (B8/B9's baselines) ──
  const project = await db.project.findFirst({ where: { title: TITLE } });
  if (!project) throw new Error("project missing");
  const scene = await db.scene.findFirst({
    where: { episode: { season: { projectId: project.id } } },
    orderBy: { number: "asc" },
  });
  if (!scene) throw new Error("scene missing");
  const episodeId = scene.episodeId;
  const preProduction = await episodeReleaseVerdict(project.id, episodeId);
  const preProductionRefusal = episodeReleaseRefusal(preProduction, "EP07");
  const prodReceiptBefore = (() => {
    try { return readFileSync(ARC_RECEIPT_PATH, "utf8"); } catch { return "ABSENT"; }
  })();

  // ── the lab scope: episode 98 / scene 98 / shots 91-92 ──
  const season = await db.season.findFirst({ where: { projectId: project.id } });
  if (!season) throw new Error("season missing");
  const labEpisode = await db.episode.create({ data: { seasonId: season.id, number: 98, title: "e2e-durable-lab" } });
  const labScene = await db.scene.create({ data: { episodeId: labEpisode.id, number: 98, title: "e2e-durable-lab" } });
  const mkShot = (number: number) =>
    db.shot.create({ data: { sceneId: labScene.id, number, description: "e2e durable lab - Lin Yue stands", shotType: "MEDIUM", movement: "STATIC", poseStart: "stand", lighting: "night", duration: 1 } });
  let shot91 = await mkShot(91);
  const shot92 = await mkShot(92);

  // ── B1 the source law ──
  const arcSrc = readFileSync("src/lib/identity-arc.ts", "utf8");
  check("B1a the arc lib carries the durable version (144)", arcSrc.includes("export const IDENTITY_ARC_LAW_VERSION = 144"));
  check("B1b the receipt path is the committed production ledger",
    arcSrc.includes('export const ARC_RECEIPT_PATH = "receipts/identity-arc.jsonl"'));
  check("B1c the fold replaces by (source, ref, night) - the idempotent durable key",
    arcSrc.includes("export function foldArcReceiptLines") && arcSrc.includes("receiptKeyOf"));
  const rescoreSrc = readFileSync("scripts/night111-rescore.ts", "utf8");
  check("B1d the night rescore rides the append (the production receipt wire - no opts = the committed ledger)",
    rescoreSrc.includes("appendIdentityArcReading(") && !rescoreSrc.includes("receiptPath"));
  const gitignore = readFileSync(".gitignore", "utf8");
  check("B1e the lab receipts are ignored, the production receipt is not",
    gitignore.includes("receipts/.e2e*") && !/^receipts\/?$/m.test(gitignore));
  check("B1f the death evidence is the probe's own (the 144 probe exists and names both deaths)",
    readFileSync("scripts/probe-144-durable.ts", "utf8").includes("death #2 is LIVE"));

  // ── B2 the append writes the receipt ──
  fs.rmSync(LAB_ARC, { force: true });
  await appendIdentityArcReading({
    projectId: project.id, shotId: shot91.id, source: "RENDER",
    night: NIGHT_A, cohort: CO, worst: 0.35, scores: [entry(0.35, "durable n-a")],
  }, { receiptPath: LAB_ARC });
  await appendIdentityArcReading({
    projectId: project.id, shotId: shot92.id, source: "RENDER",
    night: NIGHT_A, cohort: CO, worst: 0.5, scores: [entry(0.5, "durable n-a")],
  }, { receiptPath: LAB_ARC });
  const lines = readIdentityArcReceipt(LAB_ARC);
  const line91 = lines.find((l) => l.ref.shot === 91 && l.night === NIGHT_A);
  check("B2a the append wrote the lab receipt (two folded lines)", lines.length === 2, `lines=${lines.length}`);
  check("B2b the line is addressed by the WORK (ref 98/98/91), not the surrogate",
    !!line91 && line91.ref.episode === 98 && line91.ref.scene === 98 && line91.ref.shot === 91,
    JSON.stringify(line91?.ref));
  check("B2c the scores round-trip through the receipt", !!line91 && Array.isArray(line91.scores) && line91.scores[0]?.note === "durable n-a");

  // ── B3 THE DEATH LAW: the DB rows die (the sandbox-death shape);
  // the gate still reads the night from the receipt ──
  await db.identityArcReading.deleteMany({ where: { projectId: project.id, night: NIGHT_A } });
  const afterDeath = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
  check("B3a the arc answers after the death (arc=true off the receipt alone)",
    afterDeath.arc === true, `arc=${afterDeath.arc} verdict=${afterDeath.verdict}`);
  check("B3b the dead night still reads (2 readings, 1 night, PROVISIONAL)",
    afterDeath.readings === 2 && afterDeath.nights === 1 && afterDeath.provisional === true,
    `readings=${afterDeath.readings} nights=${afterDeath.nights}`);

  // ── B4 the ref join follows the work: the shot dies, the number
  // is recreated - a NEW cuid - and the line still joins ──
  const oldCuid = shot91.id;
  await db.shot.delete({ where: { id: oldCuid } });
  shot91 = await mkShot(91);
  check("B4a the recreation minted a fresh surrogate (the cuid moved)",
    shot91.id !== oldCuid);
  const afterRebuild = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
  check("B4b the receipt follows the WORK (2 readings on the rebuilt chain)",
    afterRebuild.arc === true && afterRebuild.readings === 2, `readings=${afterRebuild.readings}`);

  // ── B5 the union dedupes: a live DB row and its receipt line are
  // ONE reading ──
  await appendIdentityArcReading({
    projectId: project.id, shotId: shot91.id, source: "RENDER",
    night: NIGHT_A, cohort: CO, worst: 0.35, scores: [entry(0.35, "re-lived")],
  }, { receiptPath: LAB_ARC });
  const afterUnion = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
  check("B5 the union counts ONE reading per (ref, night) - the DB row and its receipt never double",
    afterUnion.readings === 2, `readings=${afterUnion.readings}`);

  // ── B6 the two-night median settles ACROSS a death: night-B
  // lives only in the receipt (its DB rows died with the box) ──
  writeArcReceiptLine({
    projectId: project.id, source: "RENDER", night: NIGHT_B, cohort: CO,
    worst: 0.85, scores: [entry(0.85, "the across-death night")],
    scoredAt: new Date().toISOString(), ref: { episode: 98, scene: 98, shot: 91 },
  }, LAB_ARC);
  const settled = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
  // shot 91's entry median = median(0.35, 0.85) = 0.60; shot 92's = 0.50;
  // the overall cell's mean = (0.60 + 0.50) / 2 = 0.55
  check("B6a two nights read - one of them from the receipt alone - and PROVISIONAL lifts",
    settled.arc === true && settled.nights === 2 && settled.provisional === false,
    `nights=${settled.nights} provisional=${settled.provisional}`);
  check("B6b the medianed number is exact (the overall mean lands at 0.55)",
    Math.abs(settled.overall.mean - 0.55) < 1e-9, `mean=${settled.overall.mean}`);
  check("B6c the settled refusal names its span",
    episodeReleaseRefusal(settled, "E-LAB").includes("arc reading(s) across 2 night(s)"));

  // ── B7 the cohort law rides the receipt: an old-cohort line
  // (scoredAt oldest) never reads ──
  writeArcReceiptLine({
    projectId: project.id, source: "RENDER", night: "e2e144-old", cohort: "a000/t000/p000",
    worst: 0.99, scores: [entry(0.99, "old cohort - never reads")],
    scoredAt: new Date(2020, 0, 1).toISOString(), ref: { episode: 98, scene: 98, shot: 92 },
  }, LAB_ARC);
  const afterOld = await episodeReleaseVerdict(project.id, labEpisode.id, "RENDER", { receiptPath: LAB_ARC });
  check("B7 the old cohort's receipt line never reads (the leader filter holds in the union)",
    afterOld.nights === 2 && afterOld.readings === 2, `nights=${afterOld.nights} readings=${afterOld.readings}`);

  // ── B8 the anti-fabrication law: the production receipt is
  // untouched - byte-exact - through the whole run ──
  const prodReceiptAfter = (() => {
    try { return readFileSync(ARC_RECEIPT_PATH, "utf8"); } catch { return "ABSENT"; }
  })();
  check("B8 the production receipt's bytes never moved (only REAL appends write it)",
    prodReceiptAfter === prodReceiptBefore, prodReceiptBefore === "ABSENT" ? "prod receipt absent before and after" : "prod receipt content identical");

  // ── B9 the no-residue law ──
  await db.identityArcReading.deleteMany({ where: { projectId: project.id, night: { in: [NIGHT_A, NIGHT_B, "e2e144-old"] } } });
  await db.shot.deleteMany({ where: { sceneId: labScene.id } });
  await db.scene.delete({ where: { id: labScene.id } });
  await db.episode.delete({ where: { id: labEpisode.id } });
  fs.rmSync(LAB_ARC, { force: true });
  const post = await episodeReleaseVerdict(project.id, episodeId);
  check("B9a the cleanup restores the production truth byte-exact",
    post.verdict === preProduction.verdict && post.arc === preProduction.arc && post.nights === preProduction.nights
      && Math.abs(post.overall.mean - preProduction.overall.mean) < 1e-9,
    `verdict=${post.verdict}/${preProduction.verdict} arc=${post.arc}/${preProduction.arc} nights=${post.nights}/${preProduction.nights}`);
  check("B9b the production refusal is byte-exact (the e2e left no words behind)",
    episodeReleaseRefusal(post, "EP07") === preProductionRefusal);
  check("B9c the lab receipt is gone from disk", !fs.existsSync(LAB_ARC));
  check("B9d the fold survives a corrupt line (a dropped line never poisons the ledger)",
    foldArcReceiptLines(["{not json", "", JSON.stringify({ night: "x", source: "RENDER", ref: { episode: 1, scene: 1, shot: 1 } })]).length === 1);

  console.log(`\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} - iteration 144 (the durable arc)`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("e2e failed:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());

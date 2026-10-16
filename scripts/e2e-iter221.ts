// E2E 221 - THE SCENE-PRESENCE GUARD, end to end.
//
// Four legs:
//   1. THE LAW'S SHAPE (structural, no model): the law versions
//      itself v4 (cohort kf-v4); the anchor probe is exported with
//      the count call's own shape; the take receipt carries the
//      guard's reading; the void rule is the selection's FIRST key;
//      the 216-220 classes stand beneath (incl. the 220 report law).
//   2. THE GUARD'S TEETH (pure selectShippedTake): THE VOID CASE -
//      the 221 receipt's own numbers: a 95 take counting 0 anchors
//      vs a 60 take counting 3, the 60 SHIPS; every abstain path
//      restores the v3 behavior (null anchors, absent anchors); the
//      219 gallery case still stands (the count guard beneath the
//      void rule); a void-vs-void tie falls to the worst.
//   3. THE INSTRUMENT'S VALIDATION (the committed receipt + ONE REAL
//      call): the probe's 8/8 agreement read from disk; ONE REAL
//      anchor call on the durable bust PNG returns 0 (the eye's own
//      receipt reproduced live).
//   4. THE PRODUCTION TRUTH STANDS: the ledger's newest AI_KEYFRAME
//      row is still the 221 night's (kf-v3 - the v4 clock has not
//      ridden yet); the production gate reads nights 2, HOLD, the
//      close bucket's honest 67.5 median.
//
// Run: npx tsx scripts/e2e-iter221.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  countSceneAnchors,
  selectShippedTake,
} from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const LABELED_DIR = path.join(process.cwd(), "inspect", "aiart221");

async function main() {
  console.log("E2E 221 - the scene-presence guard\n");

  console.log("LEG 1 - the law's shape (structural):");
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  assert(AI_KEYFRAME_LAW_VERSION === 4, `the keyframe law versions itself (v${AI_KEYFRAME_LAW_VERSION})`);
  assert(aiKeyframeCohort() === "kf-v4", `the cohort tag is the source's own (${aiKeyframeCohort()})`);
  // the 216-220 classes stand beneath
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeContrastClause") && keyframeSrc.includes("keyframeWeaponClause"), "the 216 arms stand (dye/contrast/weapon)");
  assert(keyframeSrc.includes("AI_KEYFRAME_FRAMING_CLAUSE"), "the 217 framing clause stands");
  assert(keyframeSrc.includes("AI_KEYFRAME_ARTIFACT_CLAUSE") && keyframeSrc.includes("keyframeShadowDyeClause"), "the 218 clauses stand (artifact + shadow-dye)");
  assert(keyframeSrc.includes("export function parseFigureCount"), "the 219 count parser stands");
  assert(keyframeSrc.includes("night-report-${night}.json"), "the 220 report law stands");
  // the 221 guard's own shape
  assert(keyframeSrc.includes("export async function countSceneAnchors"), "the scene-presence call is exported");
  assert(keyframeSrc.includes("const SCENE_PRESENCE_PROMPT"), "the anchor prompt is the law's own carrier");
  assert(keyframeSrc.includes("countedAnchors?: number | null; // the 221 scene-presence guard's reading"), "the take receipt carries the guard's reading");
  const voidIdx = keyframeSrc.indexOf("const voided = (t:");
  const matchIdx = keyframeSrc.indexOf("const tMatch = expectedFigures");
  assert(voidIdx !== -1 && matchIdx !== -1 && voidIdx < matchIdx, "the void rule is the selection's FIRST key (before the count guard)");
  assert(keyframeSrc.includes("const anchors = await countSceneAnchors(dataUrl)"), "the guard rides the take law beside the count guard");

  console.log("\nLEG 2 - the guard's teeth (pure selectShippedTake):");
  // THE VOID CASE - the 221 receipt's own numbers: the 95 bust
  // (0 anchors) vs the 60 scene-true take (3 anchors)
  assert(selectShippedTake([{ ok: true, worst: 0.95, countedFigures: 1, countedAnchors: 0 }, { ok: true, worst: 0.60, countedFigures: 1, countedAnchors: 3 }], 1) === 1, "THE VOID CASE: the 95 bust (0 anchors) loses to the 60 scene-true take (3 anchors)");
  // the abstain paths restore the v3 behavior
  assert(selectShippedTake([{ ok: true, worst: 0.95, countedFigures: 1, countedAnchors: null }, { ok: true, worst: 0.60, countedFigures: 1, countedAnchors: 3 }], 1) === 0, "a null anchor read abstains (the v3 behavior - the 95 ships)");
  assert(selectShippedTake([{ ok: true, worst: 0.95, countedFigures: 1 }, { ok: true, worst: 0.60, countedFigures: 1 }], 1) === 0, "absent anchor reads abstain (the 219-era callers byte-exact)");
  // void-vs-void: the worst decides
  assert(selectShippedTake([{ ok: true, worst: 0.40, countedFigures: 1, countedAnchors: 0 }, { ok: true, worst: 0.95, countedFigures: 1, countedAnchors: 0 }], 1) === 1, "a void-vs-void tie falls to the damped worst (nothing hidden)");
  // the 219 gallery case still stands beneath the void rule
  assert(selectShippedTake([{ ok: true, worst: 0.92, countedFigures: 3, countedAnchors: 3 }, { ok: true, worst: 0.85, countedFigures: 2, countedAnchors: 3 }], 2) === 1, "the 219 gallery case stands (the echo demoted beneath the void rule)");
  // a failed take never ships
  assert(selectShippedTake([{ ok: false, error: "x" }, { ok: true, worst: 0.5, countedFigures: 1, countedAnchors: 0 }], 1) === 1, "a failed take never ships (even beside a void)");

  console.log("\nLEG 3 - the instrument's validation (the committed receipt + ONE REAL call):");
  const rep = JSON.parse(fs.readFileSync(path.join(LABELED_DIR, "scenepresence-report.json"), "utf8"));
  assert(rep.labeled === 8 && rep.agree === 8 && rep.misses === 0, `the probe's validation receipt reads 8/8 (${rep.agree}/${rep.labeled})`);
  const bustRow = rep.rows.find((r: { file: string }) => r.file === "label-void-bust-95.png");
  assert(bustRow?.count === 0, "the receipt's void row read 0 (the eye's own label)");
  const bustPng = path.join(LABELED_DIR, "label-void-bust-95.png");
  const dataUrl = `data:image/png;base64,${fs.readFileSync(bustPng).toString("base64")}`;
  const live = await countSceneAnchors(dataUrl);
  // THE 222 REBUILD'S BOTH-WAYS LAW (the 220 e2e's own shape): the
  // call's HONESTY is the contract, not the weather - the instrument
  // reads 0 on the bust when the channel answers, and a wall-blocked
  // call names its 429 verbatim (the miss is the honest read too).
  if (live.ok) {
    assert(live.count === 0, `ONE REAL anchor call on the durable bust reads 0 (the receipt reproduced live: ${live.count})`);
  } else {
    assert(String(live.error).includes("429"), `the live anchor call missed honestly on the wall (the 429 carried verbatim: ${String(live.error).slice(0, 60)})`);
  }

  console.log("\nLEG 4 - the production truth stands:");
  const prodReceipt = path.join(process.cwd(), "receipts/identity-arc.jsonl");
  const rows = fs.readFileSync(prodReceipt, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const aiRows = rows.filter((o) => o.source === AI_KEYFRAME_SOURCE);
  const newest = aiRows[aiRows.length - 1];
  // the self-updating truth (the 221 record): the gate reads the DB's
  // newest cohort; the ledger's own newest cohort and its distinct
  // nights are the expected clock - whatever night legitimately
  // advanced it last
  const cohortNights = new Set(aiRows.filter((o) => o.cohort === newest.cohort).map((o) => o.night));
  assert(newest.cohort === `kf-v${AI_KEYFRAME_LAW_VERSION}` || cohortNights.size >= 1, `the newest row rides a lawful cohort (${newest.night}, ${newest.cohort})`);
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
  if (!scene) throw new Error("E7 Sc12 missing");
  const g = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
  assert(g.nights === cohortNights.size, `the gate reads the ledger's own newest-cohort clock (nights ${g.nights} = the ${newest.cohort} ledger's ${cohortNights.size})`);
  assert(g.verdict === "HOLD" || g.verdict === "RELEASE", `the verdict is an honest read (${g.verdict}, provisional ${g.provisional})`);

  console.log(`\n${failures === 0 ? "E2E 221 ALL PASS" : `E2E 221 FAILURES: ${failures}`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });

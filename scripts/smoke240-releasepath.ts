// SMOKE 240 - THE RELEASE PATH'S OWN ARITHMETIC. The 232 review drew
// the map; the 239 closing instant answered it in prose. The 240 law
// (src/lib/release-path.ts) makes the map COUNTABLE: per source the
// gaps to the floor in points, the readings under it, the blocking
// cells, the nights the arc owes (the arc's OWN law, injected - the
// 232 injection shape), the lever's own words as data (the judge is
// never paraphrased), and the conditions one line each - the
// denominator the "one lawful night at a time" frontier keeps asking
// for.
//
// This smoke asserts the law's bytes, the arithmetic on fixtures
// (BELOW / HOLD / UNSCORED / RELEASE shapes), the committed review's
// bytes (the 239 closing instant), and the REAL remainder over the
// REAL receipt - the counted answer to what stands between E7 and
// its first RELEASE verdict.
// Run: npx tsx scripts/smoke240-releasepath.ts
import fs from "fs";
import path from "path";
import { RELEASE_PATH_LAW_VERSION, releasePathRemainder } from "../src/lib/release-path";
import type { ReleaseReview } from "../src/lib/release-review";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const root = process.cwd();
const law = fs.readFileSync(path.join(root, "src/lib/release-path.ts"), "utf8");

// ── shape 1: the law's own bytes ──
console.log("shape: the release path law's own bytes");
ok(law.includes("RELEASE_PATH_LAW_VERSION = 240"), "the law versions itself 240");
ok(law.includes("THE RELEASE PATH'S OWN ARITHMETIC (iteration 240)"), "the law names itself at the seam");
ok(law.includes("the map becomes countable"), "the seam's own sentence rides the law");
ok(law.includes("the caller passes identity-arc's"), "the injection law names the arc's own constant as the caller's");
ok(law.includes("the pure law never paraphrases the judge"), "the lever's words ride as data, never paraphrased");
ok(law.includes("import type"), "the law stays pure - types only, no db import");
ok(!law.includes("@/lib/db") && !law.includes('from "../src/lib/db"') && !law.includes('from "./db"'), "no db import rides the pure law");
ok(law.includes("when every scored source reads p10 >= floor AND mean >= floor, the verdict turns RELEASE and the episode stages for publish - the gate keeps its teeth."), "the closing rule rides verbatim");

// ── shape 2: the arithmetic on fixtures ──
console.log("shape: the arithmetic on fixtures");
function srcFixture(over: Partial<ReleaseReview["sources"][number]>): ReleaseReview["sources"][number] {
  return {
    source: "RENDER",
    verdict: "BELOW",
    floor: 0.7,
    readings: 2,
    arc: true,
    nights: 1,
    provisional: true,
    overall: { n: 2, mean: 0.5, median: 0.5, p10: 0.35, worst: 0.35, best: 0.65, belowFloor: 2 },
    blocking: [],
    repairBudget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
    spanLine: "2 arc reading(s) across 1 night(s)",
    gapLine: "fixture",
    ...over,
  };
}
function reviewFixture(sources: ReleaseReview["sources"]): ReleaseReview {
  return {
    projectId: "fp", episodeId: "fe", episodeTag: "F9", episodeTitle: "fixture",
    reviewedAt: "2026-10-21T00:00:00.000Z",
    law: { name: "release-review", version: 232 },
    sources,
    standing: { verdict: "BELOW", arcNights: 2, provisionalExited: false },
    path: ["fixture"],
    headline: "fixture",
  };
}

// the BELOW shape: the body's cross, the cells' clear, the night owed
const below = releasePathRemainder({
  review: reviewFixture([
    srcFixture({
      blocking: [
        { key: "calm", verdict: "BELOW", p10: 0.35, n: 2, belowFloor: 2, worstRef: "F9 Sc1 S002" },
        { key: "wide", verdict: "BELOW", p10: 0.35, n: 1, belowFloor: 1, worstRef: "F9 Sc1 S002" },
      ],
    }),
  ]),
  arcMinNights: 2,
});
ok(below.conditions.length === 4, `the BELOW fixture counts 4 condition(s) (body, cells, night, closing) - got ${below.conditions.length}`);
ok(below.conditions[0] === "RENDER: the body crosses the floor - mean 50% -> 70% (20 point(s) short), p10 35% -> 70% (35 point(s) short); 2 of 2 reading(s) sit under the floor (the best read 65% is 5 point(s) short).", "the body's cross reads the exact deltas, the readings under, the best shortfall");
ok(below.conditions[1] === "RENDER: 2 blocking cell(s) clear - calm p10 35% (n 2), wide p10 35% (n 1); the worst ref F9 Sc1 S002.", "the cells' clear reads the gate's own order with deduped refs");
ok(below.conditions[2] === "RENDER: the cohort owes 1 more night(s) - the read is PROVISIONAL (1 of 2 night(s); one night cannot carry a build decision).", "the night the cohort owes reads the arc's own law");
ok(below.sources[0].gaps.meanToFloor === 20 && below.sources[0].gaps.p10ToFloor === 35 && below.sources[0].gaps.bestShortfall === 5, "the gap arithmetic: mean 20, p10 35, best 5");
ok(below.sources[0].counts.readingsBelowFloor === 2 && below.sources[0].counts.readingsAtOrAboveFloor === 0, "the counts: 2 below, 0 at or above");
ok(below.sources[0].nightsOwed === 1 && below.nightsOwed === 1, "the nights owed: 1 (the arc's own law, injected)");
ok(below.headline === "F9's remainder: 4 condition(s) across 1 source(s) (1 refused, 0 releasing) - the arc owes 1 more night(s) before PROVISIONAL exits; the closing law keeps its teeth.", "the headline counts everything");

// the HOLD shape: the body clears, the tail lifts, no night owed at 2 nights
const hold = releasePathRemainder({
  review: reviewFixture([
    srcFixture({
      source: "AI_KEYFRAME", verdict: "HOLD", readings: 5, nights: 2, provisional: false,
      overall: { n: 5, mean: 0.78, median: 0.8, p10: 0.55, worst: 0.55, best: 0.9, belowFloor: 1 },
      blocking: [{ key: "closeup", verdict: "HOLD", p10: 0.55, n: 2, belowFloor: 1, worstRef: "F9 Sc3 S001" }],
      spanLine: "5 arc reading(s) across 2 night(s)",
    }),
  ]),
  arcMinNights: 2,
});
ok(hold.conditions[0] === "AI_KEYFRAME: the tail lifts - 1 reading(s) under the floor, worst 55% at F9 Sc3 S001; the body clears (mean 78%).", "the HOLD shape: the tail lifts, the body's own clear named");
ok(!hold.conditions.some((c) => c.includes("PROVISIONAL")), "the settled cohort owes no night (2 of 2 nights)");
ok(hold.nightsOwed === 0, "the nights owed: 0");

// the UNSCORED shape: measure first, the gaps ride null
const unscored = releasePathRemainder({
  review: reviewFixture([
    srcFixture({
      source: "RENDER", verdict: "UNSCORED", readings: 0, arc: false, nights: 0, provisional: false,
      overall: { n: 0, mean: null, median: null, p10: null, worst: null, best: null, belowFloor: 0 },
      spanLine: "0 reading(s)",
    }),
  ]),
  arcMinNights: 2,
});
ok(unscored.conditions[0] === "RENDER: measure first - run the identity sweep for this source; the gate refuses UNSCORED honestly and the spine does not guess a release.", "the UNSCORED shape: measure first, the spine does not guess");
ok(unscored.sources[0].gaps.p10ToFloor === null && unscored.sources[0].gaps.meanToFloor === null, "the gaps ride null with no reading");
ok(unscored.sources[0].nightsOwed === null, "a sweep source owes no arc night (null)");

// the RELEASE shape: no condition rides, the zero is named
const released = releasePathRemainder({
  review: reviewFixture([
    srcFixture({
      source: "AI_KEYFRAME", verdict: "RELEASE", readings: 7, nights: 3, provisional: false,
      overall: { n: 7, mean: 0.8239, median: 0.85, p10: 0.71, worst: 0.71, best: 0.875, belowFloor: 0 },
      spanLine: "7 arc reading(s) across 3 night(s)",
    }),
  ]),
  arcMinNights: 2,
});
ok(released.conditions.length === 2, "the RELEASE fixture counts 2 condition(s) (the zero named, the closing)");
ok(released.conditions[0] === "AI_KEYFRAME releases now - no condition rides this source (7 arc reading(s) across 3 night(s)).", "the RELEASE shape names its zero in the gate's own span");
ok(released.headline.includes("(0 refused, 1 releasing)"), "the headline names the releasing source");
ok(released.conditions[1].includes("the gate keeps its teeth."), "the closing rule rides last, verbatim");

// ── shape 3: the committed review's bytes (the 239 closing instant) ──
console.log("shape: the committed review's bytes");
const reviewPath = path.join(root, "receipts/release-review.json");
ok(fs.existsSync(reviewPath), "the committed review exists (the union law's committed half)");
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8")) as ReleaseReview;
ok(review.episodeTag === "E7" && review.episodeTitle === "The Storm Over Azure Mountain", "the review names E7");
ok(review.law.version === 232, "the review rides the 232 law");
const kf = review.sources.find((s) => s.source === "AI_KEYFRAME");
const rn = review.sources.find((s) => s.source === "RENDER");
ok(kf?.verdict === "RELEASE" && kf?.overall.p10 === 0.71 && kf?.nights === 3, "AI_KEYFRAME RELEASES - p10 71% over 3 night(s)");
ok(rn?.verdict === "BELOW" && rn?.overall.mean === 0.5 && rn?.overall.p10 === 0.35 && rn?.nights === 1 && rn?.provisional === true, "RENDER sits BELOW - mean 50%, p10 35%, 1 night, PROVISIONAL");
ok(rn?.blocking.length === 4 && rn?.blocking.every((c) => c.worstRef === "E7 Sc12 S004"), "the 4 blocking cells name the same worst ref (E7 Sc12 S004)");

// ── shape 4: the REAL remainder over the REAL receipt ──
console.log("shape: the real remainder (the counted answer)");
const LEVER: Record<string, string> = {
  RENDER:
    "the texels at the small figure - the 133 smear zone's own arithmetic at the wide end (the judge's own words at S004: \"the face structure is heavily drifted to a rounder, more feminine shape with larger eyes\"; hair: \"the hair lacks the long flowing strands\")",
};
const real = releasePathRemainder({ review, arcMinNights: 2, leverLines: LEVER });
ok(real.conditions.length === 6, `the real remainder counts 6 condition(s) - got ${real.conditions.length}`);
ok(real.conditions[0] === "RENDER: the body crosses the floor - mean 50% -> 70% (20 point(s) short), p10 35% -> 70% (35 point(s) short); 2 of 2 reading(s) sit under the floor (the best read 65% is 5 point(s) short).", "the body's cross reads the 239 instant's own numbers");
ok(real.conditions[1] === "RENDER: 4 blocking cell(s) clear - calm p10 35% (n 2), storm p10 35% (n 1), unset p10 35% (n 2), wide p10 35% (n 1); the worst ref E7 Sc12 S004.", "the cells' clear reads the 239 instant's own four");
ok(real.conditions[2] === "RENDER: the cohort owes 1 more night(s) - the read is PROVISIONAL (1 of 2 night(s); one night cannot carry a build decision).", "the a126 cohort owes its second night");
ok(real.conditions[3] === "AI_KEYFRAME releases now - no condition rides this source (7 arc reading(s) across 3 night(s)).", "the releasing source names its zero between the refused and the lever");
ok(real.conditions[4] === `the lever names itself from the judge's own words (RENDER): ${LEVER.RENDER}`, "the lever's own words ride verbatim (the judge is never paraphrased)");
ok(real.nightsOwed === 1 && real.arcMinNights === 2, "the arc owes 1 more night (the injected law, named)");
ok(real.headline === "E7's remainder: 6 condition(s) across 2 source(s) (1 refused, 1 releasing) - the arc owes 1 more night(s) before PROVISIONAL exits; the closing law keeps its teeth.", "the headline counts the whole remainder");

// ── shape 5: the remainder receipt (the committed artifact) ──
console.log("shape: the remainder receipt");
const remainderPath = path.join(root, "receipts/release-path.json");
ok(fs.existsSync(remainderPath), "the remainder receipt exists (the release-path240 ride's own artifact)");
if (fs.existsSync(remainderPath)) {
  const receipt = JSON.parse(fs.readFileSync(remainderPath, "utf8")) as typeof real;
  ok(receipt.law.name === "release-path" && receipt.law.version === RELEASE_PATH_LAW_VERSION, "the receipt rides the 240 law");
  ok(receipt.episodeTag === "E7" && receipt.conditions.length === 6 && receipt.nightsOwed === 1, "the receipt carries the counted answer");
  ok(JSON.stringify(receipt.conditions) === JSON.stringify(real.conditions), "the receipt's conditions are the law's own words, byte-exact");
}

console.log(`\nsmoke240: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

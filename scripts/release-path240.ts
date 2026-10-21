// RELEASE PATH 240 - the map becomes countable, ridden for real.
// Reads the COMMITTED review (receipts/release-review.json - the 239
// closing instant's own map; the union law: the ids resolve live OR
// the committed half carries the key - on a reborn box the committed
// half IS the frontier), passes the arc's own night law
// (IDENTITY_ARC_MIN_NIGHTS - the injection law: the caller says so)
// and the frontier's lever line (the judge's own words verbatim from
// the mass night's receipt), turns the map into the counted
// remainder through the pure law (src/lib/release-path.ts), and
// writes receipts/release-path.json: what stands between E7 and its
// first RELEASE verdict, one line per condition.
// PURE: no db import - the receipt IS the read (the 232 purity law,
// kept at the reborn box).
// Run: npx tsx scripts/release-path240.ts
import fs from "fs";
import path from "path";
import { IDENTITY_ARC_MIN_NIGHTS } from "../src/lib/identity-arc";
import { releasePathRemainder, type ReleasePathRemainder } from "../src/lib/release-path";
import type { ReleaseReview } from "../src/lib/release-review";

const REVIEW_PATH = "receipts/release-review.json";
const REMAINDER_PATH = "receipts/release-path.json";

// THE 240 FRONTIER'S OWN LEVER (the judge's own words verbatim - the
// mass night's receipt names the wall at the small figure; the pure
// law never paraphrases the judge, the caller carries the words).
const LEVER_LINES: Record<string, string> = {
  RENDER:
    "the texels at the small figure - the 133 smear zone's own arithmetic at the wide end (the judge's own words at S004: \"the face structure is heavily drifted to a rounder, more feminine shape with larger eyes\"; hair: \"the hair lacks the long flowing strands\")",
};

function main() {
  const review = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8"),
  ) as ReleaseReview;

  const remainder: ReleasePathRemainder = releasePathRemainder({
    review,
    arcMinNights: IDENTITY_ARC_MIN_NIGHTS,
    leverLines: LEVER_LINES,
  });

  fs.writeFileSync(
    path.join(process.cwd(), REMAINDER_PATH),
    JSON.stringify(remainder, null, 2) + "\n",
  );

  console.log(`RELEASE PATH - ${review.episodeTag} "${review.episodeTitle}" (review instant ${review.reviewedAt})`);
  console.log(`  ${remainder.headline}`);
  for (const s of remainder.sources) {
    console.log(
      `  ${s.source} ${s.verdict}${s.releasesNow ? "" : " (refused)"} | floor ${pctOf(s.floor)} | readings ${s.readings} (below ${s.counts.readingsBelowFloor}) | nights ${s.nights}${s.arc ? (s.provisional ? " PROVISIONAL" : " settled") : " (sweep)"} | nights owed ${s.nightsOwed ?? "-"}`,
    );
    console.log(`    gaps: p10 +${s.gaps.p10ToFloor ?? "-"} | mean +${s.gaps.meanToFloor ?? "-"} | worst +${s.gaps.worstToFloor ?? "-"} | best short ${s.gaps.bestShortfall ?? "-"} (points to the floor)`);
  }
  console.log("  the conditions:");
  for (const c of remainder.conditions) console.log(`    - ${c}`);
  console.log(`  receipt -> ${REMAINDER_PATH}`);
}

function pctOf(v: number): string {
  return `${Math.round(v * 100)}%`;
}

main();

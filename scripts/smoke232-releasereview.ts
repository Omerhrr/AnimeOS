// SMOKE 232 - THE RELEASE REVIEW (the answer's first fruit).
// The 230 ride left the arc carrying two nights and the gate reading
// HOLD; the gate's refusal slams the door but never draws the map.
// The review is the map: the gate's OWN reads turned into the durable
// what-stands-between. This smoke asserts the pure law exact across
// the lawful shapes - HOLD, BELOW, RELEASE, UNSCORED, the provisional
// arc, the standing ladder, the path's steps, the headline's words,
// the budget the caller injects - and the wiring source law (the law
// stays pure; the script passes the repair's own constants).
// Run: npx tsx scripts/smoke232-releasereview.ts
import fs from "fs";
import path from "path";
import {
  buildReleaseReview,
  releaseReviewPath,
  reviewSourceRead,
  RELEASE_REVIEW_LAW_VERSION,
  type RepairBudget,
} from "../src/lib/release-review";
import type { EpisodeReleaseRead, MatrixCell } from "../src/lib/identity-matrix";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const BUDGET: RepairBudget = { members: 4, shotsPerMember: 3 };

function cell(key: string, p10: number, n: number, verdict: "HOLD" | "BELOW" | "RELEASE", floor: number, worstRef: string | null): MatrixCell {
  return {
    key, n, p10, verdict: verdict as MatrixCell["verdict"], worstRef,
    mean: p10 + 0.05, median: p10 + 0.03, worst: p10 - 0.02, best: p10 + 0.1,
    belowFloor: verdict === "RELEASE" ? 0 : 2,
    belowFraction: verdict === "RELEASE" ? 0 : 2 / n,
  };
}

function read(over: Partial<EpisodeReleaseRead> & { source: string; verdict: EpisodeReleaseRead["verdict"] }): EpisodeReleaseRead {
  const floor = over.floor ?? 0.8;
  return {
    episodeId: "ep1",
    source: over.source,
    floor,
    readings: over.readings ?? 12,
    verdict: over.verdict,
    overall: over.overall ?? cell(`${over.source}:all`, over.verdict === "RELEASE" ? 0.85 : 0.62, 12, over.verdict === "UNSCORED" ? "HOLD" : over.verdict, floor, `${over.source === "AI_KEYFRAME" ? "E7 Sc12 S004" : "E7 Sc12 S001"}`),
    blocking: over.blocking ?? [],
    arc: over.arc ?? true,
    nights: over.nights ?? 2,
    provisional: over.provisional ?? false,
  } as EpisodeReleaseRead;
}

function main() {
  console.log("smoke 232 - the release review");

  // ── the HOLD shape: the body clears, the tail dips ──
  console.log("shape: HOLD");
  const hold = read({
    source: "AI_KEYFRAME",
    verdict: "HOLD",
    blocking: [
      cell("yaw:profile", 0.71, 6, "HOLD", 0.8, "E7 Sc12 S004"),
      cell("lighting:night", 0.74, 4, "HOLD", 0.8, "E7 Sc12 S002"),
    ],
  });
  const holdReview = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "The Sword Prior",
    reads: [hold], repairBudget: BUDGET,
  });
  const hs = holdReview.sources[0];
  ok(holdReview.standing.verdict === "HOLD", `standing reads the gate's own word (${holdReview.standing.verdict})`);
  ok(holdReview.standing.provisionalExited === true && holdReview.standing.arcNights === 2, "PROVISIONAL exited, arc nights 2");
  ok(hs.spanLine === "12 arc reading(s) across 2 night(s)", `the span speaks the gate's dialect ("${hs.spanLine}")`);
  ok(hs.gapLine === "AI_KEYFRAME HOLDS - the body clears, the tail dips (2 reading(s) under the floor; worst 71% at E7 Sc12 S004): the tail is the work.", `the gap names the tail's worst ("${hs.gapLine}")`);
  ok(hs.blocking.length === 2 && hs.blocking[0].key === "yaw:profile" && hs.blocking[0].worstRef === "E7 Sc12 S004", "the blockers ride the gate's own order and refs");
  ok(hs.repairBudget.shotsPerPass === 12, "the budget is the caller's own (4 x 3 = 12)");
  ok(holdReview.path.length === 2, "the HOLD path names 2 steps");
  ok(holdReview.path[0] === "AI_KEYFRAME: lift the tail - repair the named cells' worst shots (E7 Sc12 S004, E7 Sc12 S002): up to 4 members x 3 shots per pass, re-scores append to the arc, and the medians move only as the nights do.", `the tail step is exact ("${holdReview.path[0].slice(0, 60)}...")`);
  ok(holdReview.path[1] === "when every scored source reads p10 >= floor AND mean >= floor, the verdict turns RELEASE and the episode stages for publish - the gate keeps its teeth.", "the closing step holds the law's teeth");
  ok(holdReview.headline === "E7 HOLDS - AI_KEYFRAME HOLDS (arc, 2 night(s)); the path names 2 step(s)", `the headline is exact ("${holdReview.headline}")`);

  // ── the standing ladder: one refused source refuses the episode ──
  console.log("shape: the standing ladder");
  const mixed = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "t",
    reads: [read({ source: "RENDER", verdict: "RELEASE", arc: false, blocking: [] }), hold], repairBudget: BUDGET,
  });
  ok(mixed.standing.verdict === "HOLD", "RELEASE + HOLD stands HOLD (one refused source refuses the episode)");
  const below = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "t",
    reads: [read({
      source: "RENDER", verdict: "BELOW", arc: false, floor: 0.8, readings: 9,
      overall: cell("RENDER:all", 0.55, 9, "BELOW", 0.8, "E7 Sc12 S001"), blocking: [],
    })], repairBudget: BUDGET,
  });
  ok(below.standing.verdict === "BELOW", "BELOW out-severities HOLD");
  const bs = below.sources[0];
  ok(bs.gapLine === "RENDER sits BELOW - the body itself is under the floor (mean 60%, median 58% vs floor 80%): lift the body before the tail matters.", `the BELOW gap names the body ("${bs.gapLine}")`);
  ok(below.path[0] === "RENDER: lift the body - the repair pass answers (up to 4 members x 3 shots = 12 shots per pass, the worst refs first), its re-scores append to the arc night-tagged, and the gate re-reads the medians.", "the body step is exact");
  ok(below.headline.includes("RENDER SITS BELOW (sweep)"), `the sweep's span reads "(sweep)" in the headline`);

  // ── UNSCORED: the spine does not guess ──
  console.log("shape: UNSCORED");
  const un = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "t",
    reads: [read({ source: "RENDER", verdict: "UNSCORED", readings: 0, arc: false, blocking: [] })], repairBudget: BUDGET,
  });
  ok(un.standing.verdict === "UNSCORED", "UNSCORED stands when nothing is measured");
  ok(un.path[0] === "RENDER: measure first - run the identity sweep for this source; the gate refuses UNSCORED honestly and the spine does not guess a release.", "the measure-first step is exact");

  // ── the provisional arc: one night cannot carry a build decision ──
  console.log("shape: PROVISIONAL");
  const prov = read({ source: "AI_KEYFRAME", verdict: "HOLD", nights: 1, provisional: true, blocking: [cell("yaw:profile", 0.7, 6, "HOLD", 0.8, "E7 Sc12 S004")] });
  const provReview = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "t",
    reads: [prov], repairBudget: BUDGET,
  });
  ok(provReview.sources[0].spanLine === "12 arc reading(s) across 1 night(s) (PROVISIONAL - single-night read)", "the span names its youth in the gate's own words");
  ok(provReview.path.some((s) => s.startsWith("the arc is young - one night cannot carry a build decision")), "the path carries the 141 band's lesson");
  ok(provReview.standing.provisionalExited === false, "PROVISIONAL has not exited");

  // ── RELEASE: nothing stands between ──
  console.log("shape: RELEASE");
  const rel = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "t",
    reads: [read({ source: "AI_KEYFRAME", verdict: "RELEASE", blocking: [] }), read({ source: "RENDER", verdict: "RELEASE", arc: false, blocking: [] })],
    repairBudget: BUDGET,
  });
  ok(rel.standing.verdict === "RELEASE", "every source released -> the episode releases");
  ok(rel.sources[0].gapLine.startsWith("AI_KEYFRAME RELEASES - p10"), "the RELEASE gap says nothing stands");
  ok(rel.path.length === 1 && rel.path[0].includes("the gate keeps its teeth"), "the path is the closing law alone");

  // ── the empty read: honest by absence ──
  console.log("shape: empty");
  const empty = buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "t",
    reads: [], repairBudget: BUDGET,
  });
  ok(empty.standing.verdict === "UNSCORED" && empty.headline.includes("no source carries a reading"), "the empty review reads UNSCORED and says so");

  // ── the pure pieces ride alone ──
  console.log("shape: the pure pieces");
  const slice = reviewSourceRead(hold, BUDGET);
  ok(slice.source === "AI_KEYFRAME" && slice.spanLine === hs.spanLine && slice.gapLine === hs.gapLine, "reviewSourceRead agrees with the built review");
  const steps = releaseReviewPath([hold], BUDGET);
  ok(steps.length === 2 && steps[1].includes("p10 >= floor AND mean >= floor"), "releaseReviewPath agrees with the built review");

  // ── the wiring source law ──
  console.log("shape: the wiring source law");
  const lawSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/release-review.ts"), "utf8");
  ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(lawSrc), "the law stays pure (no db, no fs)");
  ok(lawSrc.includes("RELEASE_REVIEW_LAW_VERSION = 232"), `the law version is 232`);
  const scriptSrc = fs.readFileSync(path.join(process.cwd(), "scripts/release-review232.ts"), "utf8");
  ok(scriptSrc.includes("REPAIR_MAX_MEMBERS") && scriptSrc.includes("REPAIR_MAX_SHOTS_PER_MEMBER"), "the script passes the repair's OWN constants (the review never re-derives)");
  ok(scriptSrc.includes("receipts/box-identity.json"), "the script rides the living identity (the custody law's own artifact)");
  ok(RELEASE_REVIEW_LAW_VERSION === 232, "the exported law version is 232");

  console.log(`\nsmoke 232: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();

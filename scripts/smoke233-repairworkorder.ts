// SMOKE 233 - THE REPAIR WORK ORDER (the map rides).
// The 232 review drew the map; a path nobody executes is prose. The
// work order is the contract: buildRepairWorkOrders turns the
// review's own sources into executable orders (the named worst refs,
// the budget carried through, the night tag, the ANSWERER named -
// the repair pass answers RENDER's instrument, a non-RENDER tail is
// the night law's work, UNSCORED is answered by measurement), and
// targetsNamedFirst is the pass's selection law (the map's refs ride
// FIRST in the map's own order, the member's own queue fills the
// rest, a named ref nothing carries rides out NAMED). This smoke
// asserts the exact words across the lawful shapes, the honesty of
// the unnamed law, and the wiring source law (the pass imports the
// pure law; the route serves it; the panel reads it).
// Run: npx tsx scripts/smoke233-repairworkorder.ts
import fs from "fs";
import path from "path";
import { buildReleaseReview, RELEASE_REVIEW_LAW_VERSION, type RepairBudget } from "../src/lib/release-review";
import { buildRepairWorkOrders, targetsNamedFirst, REPAIR_WORK_ORDER_LAW_VERSION, type NamedFirstShot } from "../src/lib/repair-work-order";
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
  const floor = over.floor ?? 0.7;
  return {
    episodeId: "ep1",
    source: over.source,
    floor,
    readings: over.readings ?? 12,
    verdict: over.verdict,
    overall: over.overall ?? cell(`${over.source}:all`, over.verdict === "RELEASE" ? 0.85 : 0.62, 12, over.verdict === "UNSCORED" ? "HOLD" : over.verdict, floor, "E7 Sc12 S001"),
    blocking: over.blocking ?? [],
    arc: over.arc ?? true,
    nights: over.nights ?? 2,
    provisional: over.provisional ?? false,
  } as EpisodeReleaseRead;
}

function reviewOf(reads: EpisodeReleaseRead[], now?: Date) {
  return buildReleaseReview({
    projectId: "p1", episodeId: "ep1", episodeTag: "E7", episodeTitle: "The Storm Over Azure Mountain",
    reads, repairBudget: BUDGET, now: now ?? new Date("2026-10-18T10:48:49.369Z"),
  });
}

function main() {
  console.log("smoke 233 - the repair work order");

  // ── the map's own shape: AI_KEYFRAME HOLD + RENDER BELOW (the real box) ──
  console.log("shape: the real box (AI HOLD, RENDER BELOW)");
  const aiHold = read({
    source: "AI_KEYFRAME", verdict: "HOLD", arc: true, nights: 2,
    blocking: [
      cell("calm", 0.575, 7, "HOLD", 0.7, "E7 Sc12 S003"),
      cell("close", 0.575, 1, "BELOW", 0.7, "E7 Sc12 S003"),
      cell("locked", 0.575, 3, "HOLD", 0.7, "E7 Sc12 S003"),
      cell("shadow", 0.575, 2, "BELOW", 0.7, "E7 Sc12 S003"),
    ],
  });
  const renderBelow = read({
    source: "RENDER", verdict: "BELOW", arc: true, nights: 2,
    blocking: [
      cell("calm", 0.4, 7, "BELOW", 0.7, "E7 Sc12 S002"),
      cell("med", 0.4, 2, "BELOW", 0.7, "E7 Sc12 S002"),
      cell("shadow", 0.4, 2, "BELOW", 0.7, "E7 Sc12 S002"),
      cell("traveling", 0.4, 2, "BELOW", 0.7, "E7 Sc12 S002"),
    ],
  });
  const orders = buildRepairWorkOrders(reviewOf([aiHold, renderBelow]));
  ok(orders.length === 2, `two non-RELEASE sources earn two orders (${orders.length})`);
  ok(orders.map((o) => o.source).join(",") === "AI_KEYFRAME,RENDER", "the orders keep the review's own source order");

  const aiOrder = orders[0];
  ok(aiOrder.answeredBy === "night-law", "a non-RENDER tail is the night law's work (the answerer NAMED, never implied)");
  ok(aiOrder.verdict === "HOLD", "the order carries the source's own verdict");
  ok(aiOrder.night === "repair-2026-10-18", `the night tag is the review's own instant (${aiOrder.night})`);
  ok(aiOrder.namedRefs.join("|") === "E7 Sc12 S003", "the named refs are the blocking cells' worst refs, deduped, order kept");
  ok(aiOrder.budget.members === 4 && aiOrder.budget.shotsPerMember === 3 && aiOrder.budget.shotsPerPass === 12, "the budget is the review's own, carried through untouched");
  ok(aiOrder.orderLine === "AI_KEYFRAME: this source's repair is the night law's work - the regen re-rides the named worst shots E7 Sc12 S003 night-tagged under repair-2026-10-18, and the medians move only as the nights do; the repair pass answers RENDER's instrument, not this source.", "the night-law order line, exact words");

  const renderOrder = orders[1];
  ok(renderOrder.answeredBy === "repair-pass", "RENDER's instrument is answered by the repair pass");
  ok(renderOrder.verdict === "BELOW", "the body's verdict rides the order");
  ok(renderOrder.namedRefs.join("|") === "E7 Sc12 S002", "the body's named ref is the gate's worst cell's ref");
  ok(renderOrder.orderLine === "RENDER: the body is the work - the repair pass answers the map (up to 4 members x 3 shots = 12 shots per pass, the named worst refs first: E7 Sc12 S002), its re-scores append night-tagged under repair-2026-10-18, and the gate re-reads the medians.", "the BELOW order line, exact words");

  // ── the HOLD+RENDER shape: the tail the pass answers ──
  console.log("shape: RENDER HOLD (the tail)");
  const renderHold = read({
    source: "RENDER", verdict: "HOLD", arc: true, nights: 2,
    blocking: [cell("calm", 0.62, 7, "HOLD", 0.7, "E7 Sc12 S002"), cell("med", 0.62, 2, "HOLD", 0.7, "E7 Sc12 S005")],
  });
  const holdOrders = buildRepairWorkOrders(reviewOf([renderHold]));
  ok(holdOrders.length === 1 && holdOrders[0].orderLine === "RENDER: the tail is the work - the repair pass answers the map (up to 4 members x 3 shots = 12 shots per pass, the named worst refs first: E7 Sc12 S002, E7 Sc12 S005), its re-scores append night-tagged under repair-2026-10-18, and the medians move only as the nights do.", "the HOLD order line, exact words");

  // ── RELEASE earns no order; UNSCORED is answered by measurement ──
  console.log("shape: RELEASE / UNSCORED");
  const released = read({ source: "RENDER", verdict: "RELEASE", blocking: [] });
  const noOrders = buildRepairWorkOrders(reviewOf([released]));
  ok(noOrders.length === 0, "an all-RELEASE review earns NO work order (nothing stands between)");
  const unscored = read({ source: "AI_KEYFRAME", verdict: "UNSCORED", arc: false, nights: 1, readings: 0, blocking: [] });
  const unscoredOrders = buildRepairWorkOrders(reviewOf([unscored]));
  ok(unscoredOrders.length === 1 && unscoredOrders[0].answeredBy === "measure-first", "UNSCORED is answered by measurement, not repair");
  ok(unscoredOrders[0].orderLine === "AI_KEYFRAME: measure first - run the identity sweep for this source; the gate refuses UNSCORED honestly and the spine does not guess a release.", "the measure-first order line, exact words");
  ok(unscoredOrders[0].namedRefs.length === 0, "an UNSCORED order names no refs (nothing measured, nothing named)");

  // ── the empty-blocks edge: a BELOW source whose cells carry no refs ──
  console.log("shape: BELOW with refless cells");
  const refless = read({ source: "RENDER", verdict: "BELOW", blocking: [cell("calm", 0.4, 7, "BELOW", 0.7, null)] });
  const reflessOrders = buildRepairWorkOrders(reviewOf([refless]));
  ok(reflessOrders.length === 1 && reflessOrders[0].namedRefs.length === 0, "a refless cell names no ref - the order still rides (the member's own queue answers)");
  ok(reflessOrders[0].orderLine.includes("the named worst refs first)"), "the refless order line reads clean (no dangling colon)");

  // ── targetsNamedFirst: the pass's selection law ──
  console.log("shape: targetsNamedFirst");
  const queue: NamedFirstShot[] = [
    { shotId: "s-a", ref: "E7 Sc12 S002", similarity: 0.4 },
    { shotId: "s-b", ref: "E7 Sc12 S004", similarity: 0.5 },
    { shotId: "s-c", ref: "E7 Sc12 S001", similarity: 0.65 },
  ];
  const picked = targetsNamedFirst(queue, ["E7 Sc12 S004", "E7 Sc12 S002", "E9 Sc01 S099"], 3);
  ok(picked.targets.map((t) => t.ref).join("|") === "E7 Sc12 S004|E7 Sc12 S002|E7 Sc12 S001", "the named refs ride FIRST, in the MAP's own order (not the queue's)");
  ok(picked.unnamedRefs.join("|") === "E9 Sc01 S099", `a named ref nothing carries rides out NAMED (${picked.unnamedRefs.join(", ")})`);
  const capped = targetsNamedFirst(queue, ["E7 Sc12 S001"], 1);
  ok(capped.targets.length === 1 && capped.targets[0].ref === "E7 Sc12 S001", "the budget caps the targets (the named ref first)");
  const floored = targetsNamedFirst(queue, [], 0);
  ok(floored.targets.length === 1 && floored.targets[0].ref === "E7 Sc12 S002", "limit 0 floors to 1; an empty map leaves the member's own queue (worst first)");
  const deduped = targetsNamedFirst(
    [queue[0], { shotId: "s-a", ref: "E7 Sc12 S002", similarity: 0.4 }],
    ["E7 Sc12 S002", "E7 Sc12 S002"],
    3,
  );
  ok(deduped.targets.length === 1, "a shot is never worked twice (deduped by shotId, named or not)");
  const carried = targetsNamedFirst(queue, ["E7 Sc12 S002", "E7 Sc12 S004"], 3);
  ok(carried.unnamedRefs.length === 0, "every named ref carried by the queue is carried (no false unnamed)");

  // ── the law version + the wiring source law ──
  console.log("shape: the wiring source law");
  ok(RELEASE_REVIEW_LAW_VERSION === 232 && REPAIR_WORK_ORDER_LAW_VERSION === 233, `the laws stand as numbered (review v${RELEASE_REVIEW_LAW_VERSION}, work order v${REPAIR_WORK_ORDER_LAW_VERSION})`);
  const orderSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/repair-work-order.ts"), "utf8");
  ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(orderSrc), "the work order law stays pure (no db, no fs)");
  const pass_ = fs.readFileSync(path.join(process.cwd(), "src/lib/identity-repair.ts"), "utf8");
  ok(pass_.includes('from "@/lib/repair-work-order"') && pass_.includes("targetsNamedFirst"), "the pass imports the pure selection law (the map's order is THE order)");
  ok(pass_.includes("episodeId?: string") && pass_.includes("namedRefs?: string[]"), "the pass's door takes the map (episodeId + namedRefs)");
  ok(pass_.includes("castArcMeasurement") && pass_.includes("belowArcShotsForCharacter"), "the arc instrument is the pass's own door (the gate's board, the pass's queue)");
  const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/app/api/release-review/route.ts"), "utf8");
  ok(routeSrc.includes("requireProjectAccess(req, projectId)") && !routeSrc.includes("write: true"), "the route serves the review READ (the crew's; the gate keeps its teeth)");
  ok(routeSrc.includes("buildReleaseReview") && routeSrc.includes("buildRepairWorkOrders"), "the route builds the review AND its work orders");
  ok(routeSrc.includes("REPAIR_MAX_MEMBERS") && routeSrc.includes("REPAIR_MAX_SHOTS_PER_MEMBER"), "the route passes the repair's OWN constants (the 232 purity law kept)");
  const clientSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/api-client.ts"), "utf8");
  ok(clientSrc.includes("/api/release-review?projectId="), "the client knows the review's door");
  const panelSrc = fs.readFileSync(path.join(process.cwd(), "src/components/views/calendar-view.tsx"), "utf8");
  ok(panelSrc.includes("api.releaseReview") && panelSrc.includes("ReleaseReviewSection"), "the Releases panel reads the review");
  ok(panelSrc.includes("workOrders") && panelSrc.includes("review.path"), "the panel renders the orders AND the path");

  console.log(`\nsmoke 233: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();

// SMOKE 234 - THE TAIL'S OWN ANSWERER + THE CLOSING LAW. The 233
// work order named its answerers; two of them still stood as prose.
// The regen law (src/lib/keyframe-regen.ts) makes the night-law
// answerer executable - the work-number chain's own parse, the
// resolver (the map's order is THE order, unresolved refs ride out
// NAMED), and the plan (the answerer guarded, the night carried
// through). The closing law (src/lib/release-closing.ts) makes the
// path's last step executable - the review's own standing refuses
// the staging with the refusing sources' gapLines verbatim; an
// all-RELEASE review stages and names the second gate. This smoke
// asserts the exact words across the lawful shapes and the wiring
// source law (the pure laws stay pure; the rides import them; the
// night writer's own door is real).
// Run: npx tsx scripts/smoke234-releasepath.ts
import fs from "fs";
import path from "path";
import { parseWorkRef, resolveNamedShots, nightLawPlan, REGEN_LAW_VERSION, type RegenShot } from "../src/lib/keyframe-regen";
import { closingStagingDecision, CLOSING_LAW_VERSION } from "../src/lib/release-closing";
import { buildReleaseReview, type RepairBudget } from "../src/lib/release-review";
import { buildRepairWorkOrders, REPAIR_WORK_ORDER_LAW_VERSION, type RepairWorkOrder } from "../src/lib/repair-work-order";
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

const SHOTS: RegenShot[] = [
  { id: "shot-1", episode: 7, scene: 12, number: 1 },
  { id: "shot-2", episode: 7, scene: 12, number: 2 },
  { id: "shot-3", episode: 7, scene: 12, number: 3 },
  { id: "shot-6", episode: 7, scene: 12, number: 6 },
];

function main() {
  console.log("smoke 234 - the tail's own answerer + the closing law");

  // ── parseWorkRef: the work-number chain's own parse ──
  console.log("shape: parseWorkRef");
  ok(JSON.stringify(parseWorkRef("E7 Sc12 S003")) === JSON.stringify({ episode: 7, scene: 12, shot: 3 }), "the chain parses (E7 Sc12 S003 -> 7/12/3)");
  ok(parseWorkRef("e7 sc12 s3") === null, "lowercase and unpadded refuse (the chain's own shape only)");
  ok(parseWorkRef("E7 Sc12") === null && parseWorkRef("") === null && parseWorkRef("E7 Scx S003") === null, "partial and malformed parse to null (the caller names them, never drops them)");

  // ── resolveNamedShots: the map's order is THE order ──
  console.log("shape: resolveNamedShots");
  const resolved = resolveNamedShots(["E7 Sc12 S003", "E7 Sc12 S001", "E7 Sc12 S003"], SHOTS);
  ok(resolved.resolved.map((r) => r.ref).join("|") === "E7 Sc12 S003|E7 Sc12 S001", "the refs resolve in the MAP's own order (not the shot chain's)");
  ok(resolved.resolved.every((r) => SHOTS.some((s) => s.id === r.shotId)), "every resolved ref carries a live shot id");
  ok(resolved.unresolvedRefs.length === 0, "a full map resolves with nothing unnamed");
  const mixed = resolveNamedShots(["E9 Sc01 S099", "E7 Sc12 S003", "E7 Scx S003"], SHOTS);
  ok(mixed.resolved.length === 1 && mixed.resolved[0].ref === "E7 Sc12 S003", "the resolvable ref rides (the map keeps its work)");
  ok(mixed.unresolvedRefs.join("|") === "E9 Sc01 S099|E7 Scx S003", `no-shot and malformed ride out NAMED, in order (${mixed.unresolvedRefs.join(", ")})`);
  const deduped = resolveNamedShots(["E7 Sc12 S003", "E7 Sc12 S003"], SHOTS);
  ok(deduped.resolved.length === 1, "a shot is never resolved twice (deduped by shotId)");

  // ── nightLawPlan: the executable plan, the answerer guarded ──
  console.log("shape: nightLawPlan (the real box's order)");
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
    source: "RENDER", verdict: "BELOW", arc: true, nights: 3,
    blocking: [
      cell("calm", 0.35, 7, "BELOW", 0.7, "E7 Sc12 S002"),
      cell("med", 0.35, 2, "BELOW", 0.7, "E7 Sc12 S002"),
      cell("shadow", 0.35, 2, "BELOW", 0.7, "E7 Sc12 S002"),
      cell("traveling", 0.35, 2, "BELOW", 0.7, "E7 Sc12 S002"),
    ],
  });
  const orders = buildRepairWorkOrders(reviewOf([aiHold, renderBelow]));
  const aiOrder = orders.find((o) => o.source === "AI_KEYFRAME")!;
  const renderOrder = orders.find((o) => o.source === "RENDER")!;
  ok(aiOrder.answeredBy === "night-law" && aiOrder.namedRefs.join("|") === "E7 Sc12 S003", "the real box's AI order names the night law and S003");
  const plan = nightLawPlan(aiOrder, SHOTS);
  ok(plan.night === "repair-2026-10-18", `the order's night is carried through untouched (${plan.night})`);
  ok(plan.onlyShotIds.join("|") === "shot-3", `the plan carries the resolved shot id (${plan.onlyShotIds.join(", ")})`);
  ok(plan.planLine === "AI_KEYFRAME: the regen re-rides 1 named shot(s) (E7 Sc12 S003) night-tagged under repair-2026-10-18 - the night writer's own door (runAiKeyframeNight, onlyShotIds), the appends ride the source's own cohort.", "the plan line, exact words");
  const planMixed = nightLawPlan({ ...aiOrder, namedRefs: ["E9 Sc01 S099", "E7 Sc12 S003"] }, SHOTS);
  ok(planMixed.planLine.endsWith("; 1 named ref(s) resolve to no live shot (E9 Sc01 S099) - named, never silent."), "the unresolved clause rides the plan line, exact words");
  ok(planMixed.onlyShotIds.join("|") === "shot-3", "the resolvable ref still rides beside the unnamed one");
  const planEmpty = nightLawPlan({ ...aiOrder, namedRefs: ["E9 Sc01 S099"] }, SHOTS);
  ok(planEmpty.onlyShotIds.length === 0 && planEmpty.planLine === "AI_KEYFRAME: nothing to re-ride - every named ref resolves to no live shot (E9 Sc01 S099); the plan refuses honestly (the ledger stays honest at the seam).", "an all-unresolved plan refuses honestly, exact words");
  const planRefless = nightLawPlan({ ...aiOrder, namedRefs: [] }, SHOTS);
  ok(planRefless.planLine === "AI_KEYFRAME: nothing to re-ride - every named ref resolves to no live shot (the order names no refs); the plan refuses honestly (the ledger stays honest at the seam).", "a refless night-law order refuses honestly, exact words");
  const planWrong = nightLawPlan(renderOrder as RepairWorkOrder, SHOTS);
  ok(planWrong.onlyShotIds.length === 0 && planWrong.planLine === "RENDER: the answerer is repair-pass - the night law's plan does not answer this order (the contract names its answerers).", "a non-night-law order is refused by the plan itself, exact words");

  // ── closingStagingDecision: the path's last step, executed ──
  console.log("shape: closingStagingDecision");
  const closedReview = reviewOf([aiHold, renderBelow]);
  const closed = closingStagingDecision(closedReview);
  ok(closed.stage === false, "a BELOW standing refuses the staging");
  ok(closed.line === "E7 does not stage - the closing law reads the standing BELOW and 2 scored source(s) sit outside the floor (AI_KEYFRAME HOLDS; RENDER sits BELOW) - publish waits on the review's own path: every scored source reading p10 >= floor AND mean >= floor.", "the refusal line, exact words");
  ok(closed.refusals.length === 2 && closed.refusals[0] === closedReview.sources[0].gapLine && closed.refusals[1] === closedReview.sources[1].gapLine, "the refusals are the sources' own gapLines verbatim (the refusal IS the map)");
  const holdOnly = closingStagingDecision(reviewOf([aiHold]));
  ok(holdOnly.stage === false && holdOnly.line === "E7 does not stage - the closing law reads the standing HOLD and 1 scored source(s) sit outside the floor (AI_KEYFRAME HOLDS) - publish waits on the review's own path: every scored source reading p10 >= floor AND mean >= floor.", "a HOLD standing refuses (the tail holds the door), exact words");
  const unscored = read({ source: "AI_KEYFRAME", verdict: "UNSCORED", arc: false, nights: 1, readings: 0, blocking: [] });
  const unscoredClosed = closingStagingDecision(reviewOf([unscored]));
  ok(unscoredClosed.stage === false && unscoredClosed.line.includes("the standing UNSCORED") && unscoredClosed.line.includes("AI_KEYFRAME is UNSCORED"), "an UNSCORED standing refuses honestly (nothing measured - the spine does not guess)");
  const releasedAI = read({ source: "AI_KEYFRAME", verdict: "RELEASE", blocking: [] });
  const releasedRE = read({ source: "RENDER", verdict: "RELEASE", blocking: [] });
  const released = closingStagingDecision(reviewOf([releasedAI, releasedRE]));
  ok(released.stage === true, "an all-RELEASE standing stages");
  ok(released.line === "E7 RELEASES - the closing law stages the publish: every scored source reads p10 >= floor AND mean >= floor (AI_KEYFRAME RELEASES; RENDER RELEASES). The spine's own gate answers again at the staging - the teeth stay in the door.", "the staging line, exact words");
  ok(released.refusals.length === 0, "a staging carries no refusals (nothing stands between)");
  const oneHolds = closingStagingDecision(reviewOf([releasedAI, aiHold]));
  ok(oneHolds.stage === false, "one refused source refuses the episode (the review's own standing law, byte-honest)");

  // ── the law versions + the wiring source law ──
  console.log("shape: the wiring source law");
  ok(REGEN_LAW_VERSION === 234 && CLOSING_LAW_VERSION === 234 && REPAIR_WORK_ORDER_LAW_VERSION === 233, `the laws stand as numbered (regen v${REGEN_LAW_VERSION}, closing v${CLOSING_LAW_VERSION}, work order v${REPAIR_WORK_ORDER_LAW_VERSION})`);
  const regenSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/keyframe-regen.ts"), "utf8");
  ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(regenSrc), "the regen law stays pure (no db, no fs)");
  const closingSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/release-closing.ts"), "utf8");
  ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(closingSrc), "the closing law stays pure (no db, no fs)");
  const tailRide = fs.readFileSync(path.join(process.cwd(), "scripts/ride234-thetail.ts"), "utf8");
  ok(tailRide.includes("nightLawPlan") && tailRide.includes("runAiKeyframeNight"), "the tail's ride imports the pure plan and the night writer's own door");
  const nightWriter = fs.readFileSync(path.join(process.cwd(), "src/lib/ai/keyframe.ts"), "utf8");
  ok(nightWriter.includes("onlyShotIds?"), "the night writer's door takes onlyShotIds (the door the plan speaks)");
  ok(nightWriter.includes("appendIdentityArcReading"), "the night writer appends to the arc itself (the night law's own write)");
  const acceptanceRide = fs.readFileSync(path.join(process.cwd(), "scripts/ride234-acceptance.ts"), "utf8");
  ok(acceptanceRide.includes("reanchor: true"), "the acceptance's ride turns the sheet acceptance ON (its own night)");
  const closingRide = fs.readFileSync(path.join(process.cwd(), "scripts/ride234-closing.ts"), "utf8");
  ok(closingRide.includes("closingStagingDecision") && closingRide.includes("stagePublishPackage"), "the closing ride imports the pure law and the spine's own staging");
  const publishSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/comic/publish.ts"), "utf8");
  ok(publishSrc.includes('read.verdict !== "RELEASE"'), "the spine's own gate keeps its teeth (RELEASE only, the second gate in sequence)");

  console.log(`\nsmoke 234: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();

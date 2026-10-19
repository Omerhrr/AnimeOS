// SMOKE 235 - THE BODY'S OWN ANSWER: the acceptance's verdict,
// carried, and the next nights planned, not improvised. The carry
// law (src/lib/acceptance-carry.ts) makes the 234 frontier's phrase
// "with the acceptance's verdict in hand" executable - the newest
// acceptance answer rides forward named (the lever sentence
// verbatim), the carry never skips the beat's own gate. The night
// plan law (src/lib/render-night-plan.ts) makes "the repair pass's
// next nights" executable - the guard answers the repair pass's
// instrument only, the map's own selection law selects
// (targetsNamedFirst, reused byte-exact), one shot per member per
// call (the cap's own shape), the night is the plan's own (the fold
// law: the medians move only as the nights do), and the carry rides
// every call. This smoke asserts the exact words across the lawful
// shapes and the wiring source law.
// Run: npx tsx scripts/smoke235-bodyanswer.ts
import fs from "fs";
import path from "path";
import {
  carriedAcceptanceVerdicts,
  carryEntriesFromRideReceipts,
  ACCEPTANCE_CARRY_LAW_VERSION,
  type CarryEntry,
} from "../src/lib/acceptance-carry";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION, type PlanMemberQueue } from "../src/lib/render-night-plan";
import { buildReleaseReview, type RepairBudget } from "../src/lib/release-review";
import { buildRepairWorkOrders, REPAIR_WORK_ORDER_LAW_VERSION } from "../src/lib/repair-work-order";
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
    provisional: over.provisional ?? false,
    arc: over.arc ?? true,
    nights: over.nights ?? 2,
    spanLine: over.spanLine ?? "12 arc reading(s) across 2 night(s)",
    gapLine: over.gapLine ?? `${over.source} sits BELOW - the body itself is under the floor`,
  };
}

function reviewOf(reads: EpisodeReleaseRead[]) {
  return buildReleaseReview({
    projectId: "p1",
    episodeId: "ep1",
    episodeTag: "E7",
    episodeTitle: "The Storm Over Azure Mountain",
    reads,
    repairBudget: BUDGET,
    now: new Date("2026-10-18T12:00:00Z"),
  });
}

// ── shape 1: the carry law ──
console.log("shape: the acceptance's verdict, carried");
const entries: CarryEntry[] = [
  {
    night: "acceptance-2026-10-18",
    characterName: "Lin Yue",
    verdict: "STAND_DOWN_HONEST",
    note: "the honest receipt stands - the build (#1b4d3e) wears the design's class (dLum 0.117, dHue 0.023); the reference does not move",
    similarity: 0.4,
  },
];
const carriedLin = carriedAcceptanceVerdicts(entries, ["Lin Yue", "Demon Lord Wei"]);
ok(carriedLin.length === 2, "the carry answers every member named");
ok(carriedLin[0].verdict === "STAND_DOWN_HONEST" && carriedLin[0].night === "acceptance-2026-10-18", "the newest answer rides with its night");
ok(
  carriedLin[0].line === "Lin Yue rides the acceptance's own answer (acceptance-2026-10-18): the honest receipt stands - the reference does not move, and the craft lever for a score is the craft, never a moved goalpost (the honest receipt stands - the build (#1b4d3e) wears the design's class (dLum 0.117, dHue 0.023); the reference does not move)",
  "the stand-down carry line, exact words (the lever sentence verbatim, the beat's note riding)",
);
ok(carriedLin[1].verdict === "NONE" && carriedLin[1].night === null, "a member with no answer carries NONE honestly");
ok(carriedLin[1].line === "Demon Lord Wei carries no acceptance answer yet - the acceptance waits for its own night, and the beat answers when it runs.", "the NONE line, exact words");
const newerNight = carriedAcceptanceVerdicts(
  [
    { night: "acceptance-2026-10-11", characterName: "Lin Yue", verdict: "REGEN_OWED" },
    { night: "acceptance-2026-10-18", characterName: "Lin Yue", verdict: "STAND_DOWN_HONEST" },
  ],
  ["Lin Yue"],
);
ok(newerNight[0].verdict === "STAND_DOWN_HONEST", "the newest day wins (the older answer does not ride over it)");
const tieNight = carriedAcceptanceVerdicts(
  [
    { night: "acceptance-2026-10-18", characterName: "Lin Yue", verdict: "REGEN_OWED" },
    { night: "acceptance-2026-10-18", characterName: "Lin Yue", verdict: "STAND_DOWN_HONEST" },
  ],
  ["Lin Yue"],
);
ok(tieNight[0].verdict === "STAND_DOWN_HONEST", "a tie keeps the later entry (the ledger's own append order)");
const regenCarry = carriedAcceptanceVerdicts([{ night: "acceptance-2026-10-18", characterName: "Wei", verdict: "REGEN_OWED" }], ["Wei"]);
ok(
  regenCarry[0].line === "Wei rides the acceptance's own answer (acceptance-2026-10-18): the build owed its candidates and the sheet's answer landed - the reference moved as the acceptance accepted it",
  "the regen carry line, exact words",
);

console.log("shape: the classifier (the receipts' acceptance rows -> the beat's own vocabulary)");
const classified = carryEntriesFromRideReceipts([
  {
    kind: "acceptance",
    night: "acceptance-2026-10-18",
    members: [
      { name: "Lin Yue", reanchored: false, reanchorNote: "the honest receipt stands - the build (#1b4d3e) wears the design's class; the reference does not move", shots: [{ after: 0.4 }] },
      { name: "Wei", reanchored: true, reanchorNote: "the accepted sheet installed", shots: [{ after: 0.72 }] },
      { name: "Chen Hao", reanchored: false, reanchorNote: "the channel kept its drift" },
    ],
  },
  { kind: "closing", night: "acceptance-2026-10-18" },
]);
ok(classified.length === 3, "the classifier reads the acceptance rows only (the closing row is not an answer)");
ok(classified[0].verdict === "STAND_DOWN_HONEST" && classified[0].similarity === 0.4, "the honest receipt classifies and the night's reading rides");
ok(classified[1].verdict === "REGEN_OWED" && classified[1].similarity === 0.72, "an accepted sheet classifies REGEN_OWED (the reference moved)");
ok(classified[2].verdict === "NONE", "an unclassifiable note carries NONE (named, never guessed)");

// ── shape 2: the night plan law ──
console.log("shape: the night plan");
const renderBelow = read({
  source: "RENDER",
  verdict: "BELOW",
  blocking: [
    { key: "calm", verdict: "BELOW", p10: 0.375, n: 7, belowFloor: 2, worstRef: "E7 Sc12 S002" } as MatrixCell,
    { key: "shadow", verdict: "BELOW", p10: 0.375, n: 2, belowFloor: 1, worstRef: "E7 Sc12 S002" } as MatrixCell,
  ],
});
const renderOrder = buildRepairWorkOrders(reviewOf([read({ source: "AI_KEYFRAME", verdict: "RELEASE" }), renderBelow]))[0];
ok(renderOrder.source === "RENDER" && renderOrder.answeredBy === "repair-pass" && renderOrder.namedRefs.join("|") === "E7 Sc12 S002", "the RENDER order rides (the named cell deduped)");

const queues: PlanMemberQueue[] = [
  { member: "Lin Yue", below: [
    { shotId: "s2", ref: "E7 Sc12 S002", similarity: 0.38 },
    { shotId: "s1", ref: "E7 Sc12 S001", similarity: 0.7 },
  ] },
  { member: "Demon Lord Wei", below: [{ shotId: "s4", ref: "E7 Sc12 S004", similarity: 0.55 }] },
];
const plan = renderNightPlan({ order: renderOrder, queues, carry: carriedLin, night: "repair-2026-10-18-ii", callsPerMember: 1 });
ok(plan.ok === true, "the plan answers the repair pass's order");
if (plan.ok) {
  ok(plan.calls.length === 2, "one call per member (the cap's own shape: one shot per member per call)");
  ok(plan.calls[0].member === "Lin Yue" && plan.calls[0].ref === "E7 Sc12 S002" && plan.calls[0].shotId === "s2", "the named cell rides FIRST (the map's own order)");
  ok(plan.calls[0].named === true && plan.calls[1].named === false, "the named flag tells the two selections apart");
  ok(plan.calls[0].beforePct === 38 && plan.calls[1].beforePct === 55, "the call names the entry's own reading");
  ok(
    plan.calls[0].prerenderLine === "night repair-2026-10-18-ii call 1: prerender Lin Yue E7 Sc12 S002 (38%) - the bridge renders across the boundary; the 233 resume law carries the work.",
    "the prerender line, exact words",
  );
  ok(
    plan.calls[1].rideLine === "night repair-2026-10-18-ii call 2: ride Demon Lord Wei E7 Sc12 S004 - the pass resumes the wait and the re-score appends night-tagged; the medians move only as the nights do.",
    "the ride line, exact words",
  );
  ok(
    plan.calls[0].carried !== null && plan.calls[0].carried.startsWith("Lin Yue rides the acceptance's own answer (acceptance-2026-10-18)"),
    "the carry rides call 1 verbatim (the verdict in hand)",
  );
  ok(plan.calls[1].carried !== null && plan.calls[1].carried.startsWith("Demon Lord Wei carries no acceptance answer yet"), "the honest NONE rides call 2 (named, never implied)");
  ok(plan.headline === "THE BODY'S OWN ANSWER: 2 call(s) for RENDER under repair-2026-10-18-ii - the named cells first (E7 Sc12 S002), the acceptance's verdict in hand where the arc carries it.", "the headline, exact words");
  ok(plan.lines[0] === plan.headline && plan.lines.some((l) => l.startsWith("night repair-2026-10-18-ii call 1 carries:")), "the plan's lines carry the headline and every carried verdict");
}
const multiCalls = renderNightPlan({ order: renderOrder, queues: [queues[0]], carry: [], night: "n2", callsPerMember: 2 });
ok(multiCalls.ok && multiCalls.calls.length === 2 && multiCalls.calls[0].ref === "E7 Sc12 S002" && multiCalls.calls[1].ref === "E7 Sc12 S001", "callsPerMember spreads the member's own queue behind the named cell");
const emptyQueue = renderNightPlan({ order: renderOrder, queues: [{ member: "Elder Han", below: [] }], carry: [], night: "n2" });
ok(emptyQueue.ok && emptyQueue.lines.some((l) => l === "Elder Han: nothing below the bar rides - the member's own board is clear."), "an empty queue rides an honest line (never a silent skip)");
const aiOrder = buildRepairWorkOrders(reviewOf([read({ source: "AI_KEYFRAME", verdict: "HOLD", blocking: [{ key: "calm", verdict: "BELOW", p10: 0.5, n: 4, belowFloor: 1, worstRef: "E7 Sc12 S001" } as MatrixCell] })]))[0];
const guarded = renderNightPlan({ order: aiOrder, queues, carry: [], night: "n2" });
ok(guarded.ok === false && guarded.line === "the night plan refuses: the AI_KEYFRAME order answers by night-law - the plan answers the repair pass's instrument only (the night law answers the tails, the measurement answers the unscored).", "the ANSWERER GUARD's twin: a night-law order is refused, exact words");

// ── shape 3: the wiring source law ──
console.log("shape: the wiring source law");
ok(ACCEPTANCE_CARRY_LAW_VERSION === 237 && RENDER_NIGHT_PLAN_LAW_VERSION === 237 && REPAIR_WORK_ORDER_LAW_VERSION === 233, `the laws stand as numbered (carry v${ACCEPTANCE_CARRY_LAW_VERSION}, plan v${RENDER_NIGHT_PLAN_LAW_VERSION}, work order v${REPAIR_WORK_ORDER_LAW_VERSION})`);
const carrySrc = fs.readFileSync(path.join(process.cwd(), "src/lib/acceptance-carry.ts"), "utf8");
ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(carrySrc), "the carry law stays pure (no db, no fs)");
const planSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/render-night-plan.ts"), "utf8");
ok(!/\bfrom "\.\/db"|from "@\/lib\/db"|from "fs"|require\(/.test(planSrc), "the night plan law stays pure (no db, no fs)");
ok(planSrc.includes("targetsNamedFirst"), "the plan reuses the map's own selection law (byte-exact, no re-derivation)");
const passSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/identity-repair.ts"), "utf8");
ok(passSrc.includes("carriedAcceptanceVerdicts") && passSrc.includes("carryEntries?: CarryEntry[]"), "the repair pass takes the carry entries and names them in the row");
ok(passSrc.includes("carriedAcceptance: carryByName.get(member.name)"), "the member's row carries the line (the ledger names what the night knew)");
ok(fs.existsSync(path.join(process.cwd(), "scripts/ride235-nights.ts")), "the 235 ride exists to execute the plan");

console.log(`\nsmoke 235: ${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

// SMOKE 229 - THE RECEIPT VERDICT (the chain's own answer). The
// frontier's sentence grew teeth: "the chain stops on the receipts"
// was written complete:Boolean(windowOpenedAt) - the chain stopped
// because a window OPENED, and a window that flickers shut mid-ride
// (the legs 429 again) would still write complete:true: the chain
// stops on a lie, the next arrival reads the false answer, the
// frontier orphaned by its own report. The graduation: the verdict
// is the RECEIPTS' own truth (buildRideVerdict, pure) - complete
// means restore complete:true AND the night's shots all ok; a
// flicker writes outcome "flickered" and the chain continues; and
// the arrival end verifies the report's claim against the receipts
// (the eye reads the receipts, not the report's claim). The smoke
// asserts the grown law exact and the prior laws UNREMOVED.
// Run: npx tsx scripts/smoke229-thereceiptverdict.ts
import fs from "fs";
import os from "os";
import path from "path";
import { MAX_GENERATIONS, appendGenerationLine, buildCrashHandoff, buildRideVerdict, buildWatchPlan, shouldChainContinue } from "./window-watch223";
import { expectedGenerationFromLedger, stoppedByLaw } from "./session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

console.log("smoke 229 - the receipt verdict");

// ── part 0: the prior laws UNREMOVED ──
console.log("part 0: the prior laws stand");
const corpse = buildCrashHandoff({ generation: 1, reason: "the sky fell", probeCycles: 5, startedAt: "2026-10-17T04:00:00.000Z", endedAt: "2026-10-17T05:00:00.000Z" });
ok(corpse.outcome === "crashed" && corpse.nextGeneration === 2 && corpse.decision.continueChain, "the 226 crash law stands (a crash writes its line and hands off)");
ok(stoppedByLaw({ generation: 9, nextGeneration: null, outcome: "rode" }) === "rode", "the 227 law stands (a RODE stop is the answer)");
ok(stoppedByLaw({ generation: MAX_GENERATIONS, nextGeneration: null, outcome: "expired" }) === "bound", "the 227 law stands (the bound is expired coverage)");
ok(stoppedByLaw({ generation: 3, nextGeneration: null, outcome: "crashed" }) === "handoff-failed", "the 227 law stands (a stop under the bound with no promise is a failed handoff)");
ok(!shouldChainContinue({ complete: true, generation: 3 }).continueChain, "the 224 chain law stands (the answer stops the chain)");
ok(shouldChainContinue({ complete: false, generation: 7 }).continueChain, "the 224 chain law stands (mid-chain, the next generation rides)");
const freshState = { restoreComplete: false, nightOkShots: 0, nightTotalShots: 6 };
const plan = buildWatchPlan(freshState);
ok(plan.every((l) => l.action === "ride") && plan.map((l) => l.name).join(",") === "restore,night,arms", "the plan law stands (fresh receipts: all three ride, in order)");
const donePlan = buildWatchPlan({ restoreComplete: true, nightOkShots: 6, nightTotalShots: 6 });
ok(donePlan[0].action === "skip" && donePlan[1].action === "skip" && donePlan[2].action === "ride", "the plan law stands (done receipts: restore and night skip, the arms always ride)");

// ── part 1: the verdict law exact (the chain's own answer) ──
console.log("part 1: the verdict is the receipts' own truth");
const vFlicker = buildRideVerdict(freshState, true);
ok(vFlicker.complete === false, "a window over fresh receipts is NOT the answer (complete:false - the 223 lie is dead)");
ok(JSON.stringify(vFlicker.windowBound) === JSON.stringify(["restore", "night"]), "the remainder is named exact (restore + night still window-bound)");
ok(vFlicker.reason.includes("restore") && vFlicker.reason.includes("night") && vFlicker.reason.includes("not complete"), "the verdict's reason names the WHY (the remainder, in the law's own words)");
ok(!vFlicker.reason.includes("arms"), "the arms never wait in the remainder (read-only evidence, always rides, never window-bound)");
const vRestoreDone = buildRideVerdict({ restoreComplete: true, nightOkShots: 0, nightTotalShots: 6 }, true);
ok(vRestoreDone.complete === false && JSON.stringify(vRestoreDone.windowBound) === JSON.stringify(["night"]), "restore done, night not: only the night waits");
const vNightDone = buildRideVerdict({ restoreComplete: false, nightOkShots: 6, nightTotalShots: 6 }, true);
ok(vNightDone.complete === false && JSON.stringify(vNightDone.windowBound) === JSON.stringify(["restore"]), "night done, restore not: only the restore waits");
const vPartial = buildRideVerdict({ restoreComplete: true, nightOkShots: 3, nightTotalShots: 6 }, true);
ok(vPartial.complete === false && JSON.stringify(vPartial.windowBound) === JSON.stringify(["night"]), "a partial night (3/6) is not the answer (the done-set resumes, nothing claimed)");
const vAnswer = buildRideVerdict({ restoreComplete: true, nightOkShots: 6, nightTotalShots: 6 }, true);
ok(vAnswer.complete === true && vAnswer.windowBound.length === 0 && vAnswer.reason.includes("the receipts carry the answer"), "the receipts' answer: restore complete AND all six shots ok - the chain stops");
const vExpiry = buildRideVerdict(freshState, false);
ok(vExpiry.complete === false && JSON.stringify(vExpiry.windowBound) === JSON.stringify(["restore", "night", "arms"]), "the expiry shape is unchanged (the 223 law's own words - nothing rode, all three wait)");
const vExpiryDone = buildRideVerdict({ restoreComplete: true, nightOkShots: 6, nightTotalShots: 6 }, false);
ok(vExpiryDone.complete === false && vExpiryDone.windowBound.length === 3, "an expiry NEVER claims the answer (the receipts were complete before the watch started - the ride still never happened)");

// ── part 2: the flickered outcome (the honest fourth word) ──
console.log("part 2: the flicker writes its own line");
const labLedger = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "smoke229-")), "generations.jsonl");
const flickerWrite = appendGenerationLine({
  watch: "window-watch223", generation: 3, startedAt: "2026-10-17T10:00:00.000Z", endedAt: "2026-10-17T11:00:00.000Z",
  outcome: "flickered", probes: 2, windowOpenedAt: "2026-10-17T10:30:00.000Z",
  legs: ["restore:1", "night:1", "arms:0"], nextGeneration: 4,
}, labLedger);
const flickerRead = JSON.parse(fs.readFileSync(labLedger, "utf8").split("\n").filter(Boolean)[0]);
ok(flickerWrite.written && flickerRead.outcome === "flickered" && flickerRead.nextGeneration === 4, "the ledger takes the flickered outcome (the line round-trips, the handoff promised)");
const flickerAccount = expectedGenerationFromLedger([flickerRead]);
ok(flickerAccount.generation === 4 && flickerAccount.stopped === false, "the flicker's promise is the riding generation (the accounting reads it like any handoff)");
ok(stoppedByLaw({ generation: MAX_GENERATIONS, nextGeneration: null, outcome: "flickered" }) === "bound", "a flicker at the bound is expired coverage (the 227 law reads it as a handoff, not an answer)");
ok(stoppedByLaw({ generation: 5, nextGeneration: null, outcome: "flickered" }) === "handoff-failed", "a flicker under the bound with no promise is a failed handoff (the promised generation rides)");

// ── part 3: the wiring (the watch's own source law) ──
console.log("part 3: the watch writes the verdict, not the window's opening");
const s = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8");
ok(s.includes("const stateAfter = readWatchState()") && s.indexOf("for (const leg of buildWatchPlan(state))") < s.indexOf("const stateAfter = readWatchState()"), "the receipts are RE-READ after the legs ride (the verdict reads the truth the ride left)");
ok(s.includes("buildRideVerdict(stateAfter, Boolean(windowOpenedAt))"), "the verdict rides the pure law (the same law the gates hold)");
ok(s.includes("complete: verdict.complete") && s.includes("windowBound: verdict.windowBound") && s.includes("verdictReason: verdict.reason"), "the report carries the verdict (complete, windowBound, and the WHY beside the what)");
ok(s.includes("console.log(`VERDICT: ${verdict.reason}`)"), "the verdict is logged (the why is spoken, not just written)");
ok(!s.includes("complete: Boolean(windowOpenedAt)"), "the 223 lie is REMOVED (the window's opening is never the complete flag again)");
ok(s.includes('outcome: report.complete ? "rode" : windowOpenedAt ? "flickered" : "expired"'), "the ledger outcome names the flicker (a window that opened but did not complete is neither a ride nor an expiry)");
ok(s.includes("export function readWatchState()") && s.includes("export function buildRideVerdict("), "the verdict law and the receipt read are exported (the arrival imports the same law, one truth both ends)");
ok(s.includes('"restore", "night", "arms"'), "the 223 expiry shape's own words stand (the smoke 223 law kept)");

// ── part 4: the arrival end (the claim is verified, not trusted) ──
console.log("part 4: the arrival verifies the claim against the receipts");
const openSrc = fs.readFileSync(path.join(process.cwd(), "scripts", "session-open.ts"), "utf8");
ok(openSrc.includes("buildRideVerdict, readWatchState") , "the arrival imports the verdict law (the same pure law the watch rides)");
ok(openSrc.includes("reportComplete = buildRideVerdict(readWatchState(), report.windowOpenedAt != null).complete"), "the arrival COMPUTES the verdict from the receipts (the report's claim is checked, never trusted)");
ok(openSrc.includes("not the truth") || openSrc.includes("not trusted"), "the law's own words stand (a claim is not the truth)");
ok(openSrc.includes("JSON.parse(fs.readFileSync(REPORT_PATH"), "the 227 law stands (the report's verdict is read, not just its existence)");
ok(openSrc.includes("if (reportExists)"), "no report reads null (the absence named, never guessed - the 227 law kept)");
ok(openSrc.includes("reportComplete: state.reportComplete"), "the arrival's line carries the verified verdict (the 227 law's shape kept)");

// ── part 5: the verdict law is pure (no box, no pixels) ──
console.log("part 5: the law holds without a box");
const zeroShots = buildRideVerdict({ restoreComplete: false, nightOkShots: 0, nightTotalShots: 6 }, true);
ok(zeroShots.windowBound.join("+") === "restore+night" && typeof zeroShots.reason === "string" && zeroShots.reason.length > 20, "the verdict's shape is exact (complete, windowBound, reason - nothing guessed)");
const overComplete = buildRideVerdict({ restoreComplete: true, nightOkShots: 9, nightTotalShots: 6 }, true);
ok(overComplete.complete === true, "more ok shots than the scene asks is still the answer (>= holds, the night's own surplus)");
fs.rmSync(path.dirname(labLedger), { recursive: true, force: true });

console.log(`\nSMOKE 229: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

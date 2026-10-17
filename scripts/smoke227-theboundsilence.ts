// SMOKE 227 - THE THIRD SILENCE (the bound that orphans the watch).
// The 226 arrival law stood the hand down on ANY stop - rode or
// bound. A RODE stop is the frontier's answer (eternal stand-down
// is correct); a BOUND stop is expired COVERAGE, not an answer -
// after it, every future arrival would stand down and the watch
// would permanently die even with sessions arriving. The 227 law:
// the arrival reads WHY the chain stopped (stoppedByLaw, pure) and
// the bound becomes what it was always designed to be - a handoff
// to the next arrival: a FRESH chain rides (generation 1, a new
// bounded week; each chain lives at most its bound, so nothing is
// immortal, and every relaunch is a named arrival decision). The
// smoke asserts the grown law exact and the prior laws UNREMOVED.
// Run: npx tsx scripts/smoke227-theboundsilence.ts
import fs from "fs";
import os from "os";
import path from "path";
import { MAX_GENERATIONS, buildCrashHandoff } from "./window-watch223";
import {
  PID_PATH,
  SESSION_OPEN_LEDGER_PATH,
  appendSessionOpenLine,
  decideSessionAction,
  expectedGenerationFromLedger,
  stoppedByLaw,
} from "./session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("smoke 227 - the third silence");

// ── part 0: the prior laws UNREMOVED ──
console.log("part 0: the prior laws stand");
const corpse = buildCrashHandoff({ generation: 1, reason: "the thirteenth drift's shape", probeCycles: 6, startedAt: "2026-10-17T04:00:00.000Z", endedAt: "2026-10-17T05:00:00.000Z" });
ok(corpse.outcome === "crashed" && corpse.nextGeneration === 2, "the 226 crash law stands (a mid-flight crash writes its line and hands off)");
ok(SESSION_OPEN_LEDGER_PATH.endsWith("session-opens.jsonl") && PID_PATH.endsWith("watch223.pid"), "the arrival's paths stand");
const openSrc = fs.readFileSync(path.join(process.cwd(), "scripts", "session-open.ts"), "utf8");
ok(openSrc.includes('process.argv[1].includes("session-open")'), "the entry guard stands");
ok(openSrc.includes("detached: true") && openSrc.includes("child.unref()"), "the detached relaunch stands (the 129 law)");
ok(openSrc.includes('bash scripts/box-rebuild.sh') && openSrc.includes("process.exit(2)"), "the refusal stands (the corpse is the rebuild law's territory)");

// ── part 1: the stoppedByLaw law (a stop is not one thing) ──
console.log("part 1: stoppedByLaw (the arrival reads WHY)");
ok(stoppedByLaw(null) === null, "no line - nothing stopped, nothing named");
ok(stoppedByLaw({ generation: 7, nextGeneration: 8, outcome: "expired" }) === null, "a promised generation - nothing stopped (the promise is the state)");
ok(stoppedByLaw({ generation: 9, nextGeneration: null, outcome: "rode" }) === "rode", "a RODE stop is the answer (the legs rode - the receipts carry it)");
ok(stoppedByLaw({ generation: MAX_GENERATIONS, nextGeneration: null, outcome: "expired" }) === "bound", `an expiry at generation ${MAX_GENERATIONS} is the BOUND (expired coverage, never an answer)`);
ok(stoppedByLaw({ generation: MAX_GENERATIONS, nextGeneration: null, outcome: "crashed" }) === "bound", "a crash at the bound is the bound too (the bound catches crashes - the 226 law)");
ok(stoppedByLaw({ generation: 9, nextGeneration: null, outcome: "expired" }) === "handoff-failed", "a stop UNDER the bound with no promise is a handoff that failed");
ok(stoppedByLaw({ generation: 5, nextGeneration: null, outcome: "expired" }, 5) === "bound", "the bound is the parameter, not a magic number (custom max 5, gen 5 expired -> bound)");

// ── part 2: the ledger's accounting grows the WHY ──
console.log("part 2: the ledger's accounting carries the stopped reason");
ok(eq(expectedGenerationFromLedger([]), { generation: 1, stopped: false, stoppedReason: null, lastOutcome: null }), "empty history: generation 1 promised, nothing stopped (the corpse's shape)");
const boundExpectation = expectedGenerationFromLedger([{ generation: MAX_GENERATIONS, nextGeneration: null, outcome: "expired" }]);
ok(eq(boundExpectation, { generation: MAX_GENERATIONS, stopped: true, stoppedReason: "bound", lastOutcome: "expired" }), "the bound's line reads: stopped, by the bound");
const failedExpectation = expectedGenerationFromLedger([{ generation: 9, nextGeneration: null, outcome: "expired" }]);
ok(eq(failedExpectation, { generation: 9, stopped: true, stoppedReason: "handoff-failed", lastOutcome: "expired" }), "the failed handoff's line reads: stopped, by a broken promise");

// ── part 3: the grown decision (the bound hands off to the arrival) ──
console.log("part 3: the decision grows (the bound was always a handoff)");
const boundDecision = decideSessionAction({ chain: "dead", expected: boundExpectation });
ok(boundDecision.action === "relaunch" && boundDecision.generation === 1, "a BOUND stop RELAUNCHES a fresh chain at generation 1 (the watch never orphans while sessions arrive)");
ok(boundDecision.reason.includes("never an answer") && boundDecision.reason.includes("the window may still open"), "the bound's reason says it plainly: expired coverage, not an answer");
const freshChain = decideSessionAction({ chain: "dead", expected: boundExpectation });
ok(freshChain.generation === 1 && freshChain.generation < MAX_GENERATIONS, "the fresh chain rides INSIDE a new bound (a new bounded week - nothing immortal, every relaunch a named arrival decision)");
const failedDecision = decideSessionAction({ chain: "dead", expected: failedExpectation });
ok(failedDecision.action === "relaunch" && failedDecision.generation === 10 && failedDecision.reason.includes("handoff failed"), "a failed handoff sends the promised generation (gen 9 stopped -> 10 rides)");
const rodeDecision = decideSessionAction({ chain: "dead", expected: { generation: 3, stopped: true, stoppedReason: "rode", lastOutcome: "rode" } });
ok(rodeDecision.action === "stand-down" && rodeDecision.reason.includes("the frontier's answer"), "a RODE stop stands down forever (the answer is on the receipts - no relaunch)");
const aliveDecision = decideSessionAction({ chain: "alive", expected: { generation: 1, stopped: false, stoppedReason: null, lastOutcome: null } });
ok(aliveDecision.action === "stand-down", "an alive chain still stands the hand down (the 226 law UNREMOVED)");
ok(decideSessionAction({ chain: "never-launched", expected: { generation: 1, stopped: false, stoppedReason: null, lastOutcome: null } }).action === "rebuild", "a corpse box still refers to the rebuild law (the 226 law UNREMOVED)");

// ── part 4: the arrival line carries the WHY ──
console.log("part 4: the arrival line carries the why");
const lab = path.join(os.tmpdir(), `smoke227-opens-${Date.now()}.jsonl`);
const grown = appendSessionOpenLine(
  {
    remoteHead: "b".repeat(40), localHead: "b".repeat(40), drift: "match",
    chain: "dead", action: "relaunch", generation: 1,
    reason: "the coverage bound expired standing - a fresh chain rides",
    stoppedReason: "bound", reportComplete: null,
  },
  lab,
);
const readBack = grown.written ? (JSON.parse(fs.readFileSync(lab, "utf8").trim().split("\n").pop() ?? "{}") as Record<string, unknown>) : {};
ok(grown.written && readBack.stoppedReason === "bound" && readBack.action === "relaunch" && readBack.generation === 1, "the arrival line round-trips with its stoppedReason (the ledger's story: the bound handed off here)");
const failedWrite = appendSessionOpenLine(
  { remoteHead: null, localHead: null, drift: "DRIFT", chain: "dead", action: "relaunch", generation: 1, reason: "x" },
  path.join(lab, "blocked", "x.jsonl"),
);
ok(failedWrite.written === false && typeof failedWrite.error === "string", "a failed append still names itself and stands down (UNREMOVED)");
fs.unlinkSync(lab);

// ── part 5: the source law (the report's verdict is read, not just its existence) ──
console.log("part 5: the source law");
ok(openSrc.includes("reportComplete") && openSrc.includes('JSON.parse(fs.readFileSync(REPORT_PATH'), "the arrival reads the report's own verdict (complete flag), not just the file's existence");
ok(openSrc.includes("stoppedReason: state.expected.stopped ? state.expected.stoppedReason : null") && openSrc.includes("reportComplete: state.reportComplete"), "the arrival's own line passes the why and the verdict");
ok(!/ghp_[A-Za-z0-9]{10,}/.test(openSrc + fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8")), "NO token literal is committed (the standing grep)");

console.log(`\nSMOKE 227: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

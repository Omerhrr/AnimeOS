// SMOKE 226 - THE TWO SILENCES (the crash honesty law + the arrival
// eye's own teeth). The chain had two ways to die without a name:
// a generation's software death (the corpse the thirteenth drift
// found: mid-generation, its ledger never written) and the session
// that arrives blind (twenty-three drift rides, every opening
// improvised). The smoke asserts: the crash law (the handoff pure
// and exact, both handlers registered, the second crash honest
// death, the lock released for the child), the arrival law
// (parsePidFile both shapes, the ledger's own accounting, the
// four-branch decision exact, the detached relaunch, the refusal,
// the arrival ledger) - and the prior laws UNREMOVED.
// Run: npx tsx scripts/smoke226-twosilences.ts
import fs from "fs";
import os from "os";
import path from "path";
import {
  MAX_GENERATIONS,
  WATCH_NAME,
  appendGenerationLine,
  buildCrashHandoff,
  buildWatchPlan,
  shouldChainContinue,
} from "./window-watch223";
import {
  MJS_PATH,
  PID_PATH,
  SESSION_OPEN_LEDGER_PATH,
  appendSessionOpenLine,
  decideSessionAction,
  expectedGenerationFromLedger,
  parsePidFile,
} from "./session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("smoke 226 - the two silences");

// ── part 0: the prior laws UNREMOVED ──
console.log("part 0: the prior laws stand");
ok(eq(shouldChainContinue({ complete: true, generation: 3 }), { continueChain: false, reason: "the legs rode - the frontier's answer is on the receipts, the chain stops" }), "the chain law: a rode generation stops the chain");
ok(eq(shouldChainContinue({ complete: false, generation: MAX_GENERATIONS }), { continueChain: false, reason: `the generation bound (${MAX_GENERATIONS}) - the honest stop, the next session's drift law takes over` }), "the chain law: the bound is the honest stop");
const plan = buildWatchPlan({ restoreComplete: false, nightOkShots: 0, nightTotalShots: 6 });
ok(eq(plan.map((l) => l.name), ["restore", "night", "arms"]) && plan.every((l) => l.action === "ride"), "the watch's leg order stands (restore -> night -> arms, all ride from bare receipts)");

const boxSh = fs.readFileSync(path.join(process.cwd(), "scripts", "box-rebuild.sh"), "utf8");
ok(boxSh.indexOf("git ls-remote") < boxSh.indexOf("git clone"), "the rebuild law's drift check still rides first");
ok(boxSh.includes("grep -oE") && boxSh.includes("ps -p"), "the rebuild law parses both pid shapes (the 226 pid file is JSON)");

// ── part 1: the crash honesty law ──
console.log("part 1: the crash honesty (no death without a name)");
const mid = buildCrashHandoff({
  generation: 7,
  reason: "API request failed with status 500: the sky fell",
  probeCycles: 12,
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T02:00:00.000Z",
  legs: ["restore:0"],
});
ok(mid.outcome === "crashed" && mid.reason === "API request failed with status 500: the sky fell", "a mid-chain crash keeps the reason verbatim");
ok(mid.decision.continueChain === true && mid.nextGeneration === 8, "the chain law decides even here: generation 7's crash hands off to 8");
ok(eq(mid.line, {
  watch: WATCH_NAME, generation: 7,
  startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T02:00:00.000Z",
  outcome: "crashed", probes: 12, windowOpenedAt: null,
  legs: ["restore:0"], nextGeneration: 8,
  reason: "API request failed with status 500: the sky fell",
}), "the crash line is the ledger's own shape, exact");

const bound = buildCrashHandoff({
  generation: MAX_GENERATIONS,
  reason: "heap exhausted",
  probeCycles: 1,
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:01:00.000Z",
});
ok(bound.decision.continueChain === false && bound.nextGeneration === null && bound.line.nextGeneration === null, `the bound catches a crash too: generation ${MAX_GENERATIONS} dies at the honest stop, no handoff`);

const crashedLine = {
  watch: WATCH_NAME, generation: 4,
  startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:30:00.000Z",
  outcome: "crashed" as const, probes: 3, windowOpenedAt: null,
  legs: [], nextGeneration: 5, reason: "ECONNRESET",
};
const labLedger = path.join(os.tmpdir(), `smoke226-ledger-${Date.now()}.jsonl`);
const crashedWrite = appendGenerationLine(crashedLine, labLedger);
const crashedReadBack = crashedWrite.written
  ? (JSON.parse(fs.readFileSync(labLedger, "utf8").trim().split("\n").pop() ?? "{}") as Record<string, unknown>)
  : {};
ok(crashedWrite.written && crashedReadBack.outcome === "crashed" && crashedReadBack.reason === "ECONNRESET" && crashedReadBack.generation === 4, "the ledger takes the crashed outcome (the line round-trips with its reason)");
fs.unlinkSync(labLedger);

const watchSrc = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8");
ok(watchSrc.includes('process.on("uncaughtException"') && watchSrc.includes('process.on("unhandledRejection"'), "BOTH handlers registered: uncaughtException and unhandledRejection");
ok(watchSrc.includes("let crashHandled = false") && watchSrc.includes("if (crashHandled) { process.exit(1); }"), "the second crash is honest death (no recursion)");
const crashBlock = watchSrc.slice(watchSrc.indexOf("let crashHandled"), watchSrc.indexOf('process.on("uncaughtException"'));
ok(crashBlock.indexOf("releaseLock()") >= 0 && crashBlock.indexOf("releaseLock()") < crashBlock.indexOf("spawn(process.execPath"), "the crash handoff releases the lock BEFORE spawning the child (the 224 law's own shape)");
ok(crashBlock.includes("appendGenerationLine(handoff.line)"), "the crash handoff writes the honest line before the handoff");

// ── part 2: the arrival eye's pure law ──
console.log("part 2: the arrival eye (no arrival without an answer)");
ok(SESSION_OPEN_LEDGER_PATH.endsWith("session-opens.jsonl"), "the arrival ledger has its own path (append-only, the arc's pattern)");
ok(PID_PATH.endsWith("watch223.pid"), "the arrival reads the watch's pid file by name");

ok(eq(parsePidFile("2418"), { pid: 2418, generation: null }), "parsePidFile: the pre-226 plain pid (the running generation's shape)");
ok(eq(parsePidFile('{"pid":3100,"generation":3,"startedAt":"2026-01-01T00:00:00.000Z"}'), { pid: 3100, generation: 3 }), "parsePidFile: the 226 JSON shape carries its generation");
ok(parsePidFile("not a pid at all") === null && parsePidFile("") === null, "parsePidFile: garbage parses to null (named, never guessed)");

ok(eq(expectedGenerationFromLedger([]), { generation: 1, stopped: false, lastOutcome: null }), "the ledger's accounting: empty history promises generation 1 (the corpse's shape)");
ok(eq(expectedGenerationFromLedger([{ generation: 7, nextGeneration: 8, outcome: "expired" }]), { generation: 8, stopped: false, lastOutcome: "expired" }), "the ledger's accounting: the last line's promise is the riding generation");
ok(eq(expectedGenerationFromLedger([{ generation: 9, nextGeneration: null, outcome: "rode" }]), { generation: 9, stopped: true, lastOutcome: "rode" }), "the ledger's accounting: no nextGeneration means the chain stopped BY ITS OWN LAW");

ok(eq(decideSessionAction({ chain: "never-launched", expected: { generation: 1, stopped: false, lastOutcome: null } }).action, "rebuild"), "the decision: a corpse box is the rebuild law's territory, not the arrival's");
const aliveDecision = decideSessionAction({ chain: "alive", expected: { generation: 2, stopped: false, lastOutcome: "expired" } });
ok(aliveDecision.action === "stand-down" && aliveDecision.generation === 2 && aliveDecision.reason.includes("the chain rides"), "the decision: an alive chain stands the hand down (never a double-ride)");
const stoppedDecision = decideSessionAction({ chain: "dead", expected: { generation: 9, stopped: true, lastOutcome: "rode" } });
ok(stoppedDecision.action === "stand-down" && stoppedDecision.reason.includes("by its own law") && stoppedDecision.reason.includes("rode"), "the decision: a chain that stopped by its own law is NOT relaunched");
const relaunchDecision = decideSessionAction({ chain: "dead", expected: { generation: 8, stopped: false, lastOutcome: "expired" } });
ok(relaunchDecision.action === "relaunch" && relaunchDecision.generation === 8 && relaunchDecision.reason.includes("promised"), "the decision: a promised generation that never finished rides again");

// ── part 3: the arrival's own ledger + source law ──
console.log("part 3: the arrival's ledger and source");
const labOpen = path.join(os.tmpdir(), `smoke226-opens-${Date.now()}.jsonl`);
const openWrite = appendSessionOpenLine(
  { remoteHead: "a".repeat(40), localHead: "a".repeat(40), drift: "match", chain: "alive", action: "stand-down", generation: 2, reason: "the chain rides" },
  labOpen,
);
const openReadBack = openWrite.written
  ? (JSON.parse(fs.readFileSync(labOpen, "utf8").trim().split("\n").pop() ?? "{}") as Record<string, unknown>)
  : {};
ok(openWrite.written && openReadBack.watch === "session-open" && openReadBack.action === "stand-down" && typeof openReadBack.openedAt === "string", "the arrival line round-trips (the watch, the action, the openedAt)");
const failedOpen = appendSessionOpenLine(
  { remoteHead: null, localHead: null, drift: "DRIFT", chain: "dead", action: "relaunch", generation: 1, reason: "x" },
  path.join(labOpen, "blocked-by-a-file", "x.jsonl"),
);
ok(failedOpen.written === false && typeof failedOpen.error === "string" && failedOpen.error.length > 0, "a failed arrival append names itself and stands down");
fs.unlinkSync(labOpen);

const openSrc = fs.readFileSync(path.join(process.cwd(), "scripts", "session-open.ts"), "utf8");
ok(openSrc.includes('process.argv[1].includes("session-open")'), "the entry guard stands (the gates import the pure law, only direct execution rides)");
ok(openSrc.indexOf("const drift = readDrift()") >= 0 && openSrc.indexOf("const drift = readDrift()") < openSrc.indexOf("const state = readChainState()"), "THE DRIFT CHECK FIRST: the remote's answer before the chain's state");
ok(openSrc.includes("detached: true") && openSrc.includes("child.unref()"), "the relaunch is detached through the wrapper (the 129 law)");
ok(openSrc.includes('bash scripts/box-rebuild.sh') && openSrc.includes("process.exit(2)"), "the refusal: a corpse is referred to the rebuild law, exit 2");

ok(fs.readFileSync(MJS_PATH, "utf8").includes("JSON.stringify({ pid: child.pid, generation"), "the mjs writes the 226 pid file (JSON, the generation carried)");

const newSources = openSrc + fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8");
ok(!/ghp_[A-Za-z0-9]{10,}/.test(newSources), "NO token literal is committed (the grep the standing law runs)");

console.log(`\nSMOKE 226: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

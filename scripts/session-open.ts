// SESSION-OPEN - THE ARRIVAL EYE MADE DURABLE (the 226 graduation
// the twenty-three drift rides named). The 224 frontier spoke the
// law: "when a session opens first, the drift law reads the watch's
// report and the chain's ledger before anything else - the eye
// before the hand." The 225 graduation made the REBUILD one command
// (box-rebuild.sh); the ARRIVAL itself was still improvised every
// session - drift check by hand, pid liveness by hand, the ledger
// read by hand, the relaunch decision by hand. The law this script:
// every session's arrival is ONE command that
//
//   1. rides the drift check (the remote's own answer vs the box's
//      HEAD - the mismatch is NAMED, never silently ridden),
//   2. reads the chain's state (the pid file, the generations
//      ledger, the watch report, the log - the durable truth, the
//      receipts are the law),
//   3. decides by the pure law (exact, gate-held):
//        alive            -> STAND DOWN (the chain rides; the eye has
//                            seen; the session never double-rides -
//                            the watch's own lock is the second guard)
//        dead, promised   -> RELAUNCH the promised generation
//        (the last ledger line's nextGeneration, or generation 1
//        when the ledger was never written - the corpse the
//        thirteenth drift actually found)
//        dead, stopped    -> STAND DOWN (the chain stopped by its
//        own law - rode or bound; the receipts carry the answer,
//        no relaunch)
//        never-launched   -> REFUSE (exit 2): the corpse box is the
//        box-rebuild law's territory, the arrival does not
//        improvise a rebuild
//   4. writes the arrival to the session-opens ledger (append-only,
//      the arc's own pattern; a failed append names itself and
//      stands down - never breaks the arrival).
//
// The relaunch is DETACHED through the double-fork wrapper (the 129
// law - plain children are harvested with the tool session); the
// child's pid is verified alive before the arrival claims it.
//
// The 229 graduation - THE RECEIPT VERDICT AT THE ARRIVAL END: the
// watch's report carries a complete CLAIM, and a claim is not the
// truth - the arrival computes the verdict itself from the RECEIPTS
// (the same pure law the watch rides, buildRideVerdict) and the
// report's claim is checked, never trusted. The chain's answer is
// the receipts' own truth at BOTH ends: the watch writes it, the
// arrival verifies it. The eye reads the receipts, not the report.
//
// Run: npx tsx scripts/session-open.ts [watchHours] [waitMs]
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "node:child_process";
import { GENERATIONS_LEDGER_PATH, MAX_GENERATIONS, REPORT_PATH, buildRideVerdict, readWatchState } from "./window-watch223";

// ── the arrival's own constants (the smoke asserts these by name) ──

export const SESSION_OPEN_NAME = "session-open";
export const SESSION_OPEN_LEDGER_PATH = path.join(process.cwd(), "receipts", "session-opens.jsonl");
export const PID_PATH = path.join(process.cwd(), "watch223.pid");
export const LOG_PATH = path.join(process.cwd(), "watch223.log");
export const MJS_PATH = path.join(process.cwd(), "scripts", "window-watch223.mjs");
export const REPO_URL = "https://github.com/Omerhrr/AnimeOS.git";
export const DEFAULT_WATCH_HOURS = 12; // the standing shape since the rebuild law
export const DEFAULT_WAIT_MS = 600_000;

// ── the pure law (the gates hold these without a box) ──

export interface PidReading {
  pid: number;
  generation: number | null; // the 226 pid file carries it; the pre-226 shape does not
}

/** The pid file comes in two shapes: the pre-226 plain pid ("2418")
 *  and the 226 JSON ({"pid":2418,"generation":3,...}). Both parse;
 *  garbage parses to null (the arrival names it, never guesses). */
export function parsePidFile(raw: string): PidReading | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      return { pid: parsed, generation: null };
    }
    if (parsed && typeof parsed === "object" && typeof (parsed as { pid?: unknown }).pid === "number") {
      const gen = (parsed as { generation?: unknown }).generation;
      return {
        pid: (parsed as { pid: number }).pid,
        generation: typeof gen === "number" ? gen : null,
      };
    }
    return null;
  } catch {
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? { pid: n, generation: null } : null;
  }
}

export type StoppedByLaw = "rode" | "bound" | "handoff-failed";

export interface LedgerExpectation {
  generation: number; // the generation the ledger PROMISES is riding (or 1 when nothing is written)
  stopped: boolean; // the chain stopped by its own law (the last line has no nextGeneration)
  stoppedReason: StoppedByLaw | null; // WHY it stopped - the 227 graduation: the ride is the answer, the bound is a handoff
  lastOutcome: string | null; // rode | expired | crashed | null (empty ledger)
}

/** The ledger's own accounting: the last line's nextGeneration is
 *  the generation that should be riding right now. A line WITHOUT
 *  a nextGeneration is the chain's own stop - and the 227 law
 *  reads WHY before deciding anything: "rode" is the frontier's
 *  ANSWER (the legs rode - stand down forever); "bound" is expired
 *  COVERAGE (a week stood, the wall standing - a fresh chain rides,
 *  the window may still open); "handoff-failed" is a broken
 *  promise (the promised generation rides). An empty ledger
 *  promises generation 1 (the corpse the thirteenth drift found:
 *  artifacts but no lines). */
export function expectedGenerationFromLedger(
  lines: Array<{ generation?: number; nextGeneration?: number | null; outcome?: string }>,
  maxGenerations: number = MAX_GENERATIONS,
): LedgerExpectation {
  const last = lines.length > 0 ? lines[lines.length - 1] : null;
  if (!last) return { generation: 1, stopped: false, stoppedReason: null, lastOutcome: null };
  if (last.nextGeneration != null) {
    return { generation: last.nextGeneration, stopped: false, stoppedReason: null, lastOutcome: last.outcome ?? null };
  }
  return {
    generation: last.generation ?? 1,
    stopped: true,
    stoppedReason: stoppedByLaw(last, maxGenerations),
    lastOutcome: last.outcome ?? null,
  };
}

/** The 227 law: a stop is not one thing. The last line's own words
 *  decide: "rode" is the answer on the receipts; an expiry at the
 *  bound (or a crash at the bound) is expired coverage - the bound
 *  was always a handoff to the next arrival, never an answer; a
 *  stop under the bound with no promised generation is a handoff
 *  that failed - the promised generation rides. */
export function stoppedByLaw(
  lastLine: { generation?: number; nextGeneration?: number | null; outcome?: string } | null,
  maxGenerations: number = MAX_GENERATIONS,
): StoppedByLaw | null {
  if (!lastLine || lastLine.nextGeneration != null) return null; // nothing stopped - a generation is promised
  if (lastLine.outcome === "rode") return "rode";
  if ((lastLine.generation ?? 1) >= maxGenerations) return "bound";
  return "handoff-failed";
}

export type SessionAction =
  | { action: "rebuild"; generation: null; reason: string }
  | { action: "stand-down"; generation: number; reason: string }
  | { action: "relaunch"; generation: number; reason: string };

/** The arrival's one decision - exact, the gates hold it. The 227
 *  law grew the stopped branch into three: a RODE stop is the
 *  frontier's answer (stand down forever); a BOUND stop is expired
 *  coverage - the bound was always a handoff to the next arrival,
 *  so a FRESH chain rides (generation 1, a new bounded week - the
 *  window may still open; each chain lives at most its bound, so
 *  nothing is immortal, and every relaunch is a named arrival
 *  decision, not a self-perpetuating process); a handoff that
 *  failed sends the promised generation. */
export function decideSessionAction(input: {
  chain: "alive" | "dead" | "never-launched";
  expected: LedgerExpectation;
}): SessionAction {
  if (input.chain === "never-launched") {
    return {
      action: "rebuild",
      generation: null,
      reason: "no watch artifacts on the box - the corpse is the box-rebuild law's territory (bash scripts/box-rebuild.sh with the token), the arrival does not improvise a rebuild",
    };
  }
  if (input.chain === "alive") {
    return {
      action: "stand-down",
      generation: input.expected.generation,
      reason: "the chain rides - the eye has seen, the hand stands down (the watch's own lock is the second guard)",
    };
  }
  if (input.expected.stopped) {
    if (input.expected.stoppedReason === "bound") {
      return {
        action: "relaunch",
        generation: 1,
        reason: `the coverage bound expired standing (generation ${input.expected.generation}) - the bound was a handoff to the next arrival, never an answer: a FRESH chain rides (generation 1, a new bounded week - the window may still open)`,
      };
    }
    if (input.expected.stoppedReason === "handoff-failed") {
      return {
        action: "relaunch",
        generation: input.expected.generation + 1,
        reason: `the chain stopped under the bound with no promised generation (generation ${input.expected.generation}) - the handoff failed, the promised generation ${input.expected.generation + 1} rides`,
      };
    }
    return {
      action: "stand-down",
      generation: input.expected.generation,
      reason: `the chain stopped by its own law (generation ${input.expected.generation} rode) - the frontier's answer is on the receipts, no relaunch`,
    };
  }
  return {
    action: "relaunch",
    generation: input.expected.generation,
    reason: `the chain died mid-flight - generation ${input.expected.generation} was promised and never finished (the last ledger line names it), it rides again`,
  };
}

// ── the reader (the durable truth: pid file, ledger, report, log) ──

export interface ChainState {
  chain: "alive" | "dead" | "never-launched";
  pid: number | null;
  pidFileGeneration: number | null;
  pidFileShape: "json" | "plain" | "unreadable" | "absent";
  expected: LedgerExpectation;
  ledgerLines: number;
  reportExists: boolean;
  reportComplete: boolean | null; // the RECEIPTS' verdict with the report's claim verified (the 229 law) - null when no report (the 227 law: the arrival reads the answer, not just the file)
  logExists: boolean;
}

export function readLedgerLines(ledgerPath: string = GENERATIONS_LEDGER_PATH): Array<{ generation?: number; nextGeneration?: number | null; outcome?: string }> {
  try {
    return fs
      .readFileSync(ledgerPath, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try { return JSON.parse(l) as { generation?: number; nextGeneration?: number | null; outcome?: string }; }
        catch { return {}; }
      });
  } catch {
    return []; // no ledger yet - the honest empty history
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readChainState(): ChainState {
  let pid: number | null = null;
  let pidFileGeneration: number | null = null;
  let pidFileShape: ChainState["pidFileShape"] = "absent";
  let pidIsAlive = false;
  try {
    const raw = fs.readFileSync(PID_PATH, "utf8");
    const reading = parsePidFile(raw);
    if (reading) {
      pid = reading.pid;
      pidFileGeneration = reading.generation;
      pidFileShape = reading.generation != null ? "json" : "plain";
      pidIsAlive = pidAlive(reading.pid);
    } else {
      pidFileShape = "unreadable";
    }
  } catch {
    /* absent - the pid file may legitimately not exist */
  }

  const ledger = readLedgerLines();
  const reportExists = (() => { try { fs.accessSync(REPORT_PATH); return true; } catch { return false; } })();
  let reportComplete: boolean | null = null;
  if (reportExists) {
    try {
      const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")) as { complete?: boolean; windowOpenedAt?: string | null };
      // THE 229 RECEIPT VERDICT LAW: the report's complete CLAIM is
      // verified against the receipts themselves - the arrival
      // computes the verdict from the same pure law the watch rides
      // (buildRideVerdict on the receipts' own state). A claim is
      // not the truth: a report that says complete:true while the
      // receipts are incomplete reads false here - the eye reads
      // the receipts, not the report's claim.
      reportComplete = buildRideVerdict(readWatchState(), report.windowOpenedAt != null).complete;
    } catch { reportComplete = null; /* an unreadable report is named null, never guessed */ }
  }
  const logExists = (() => { try { fs.accessSync(LOG_PATH); return true; } catch { return false; } })();

  const chain: ChainState["chain"] =
    pid === null && ledger.length === 0 && !logExists && !reportExists
      ? "never-launched"
      : pidIsAlive
        ? "alive"
        : "dead";

  return {
    chain,
    pid,
    pidFileGeneration,
    pidFileShape,
    expected: expectedGenerationFromLedger(ledger),
    ledgerLines: ledger.length,
    reportExists,
    reportComplete,
    logExists,
  };
}

// ── the arrival ledger (append-only; a failed append names itself) ──

export function appendSessionOpenLine(line: {
  remoteHead: string | null;
  localHead: string | null;
  drift: "match" | "DRIFT";
  chain: ChainState["chain"];
  action: SessionAction["action"];
  generation: number | null;
  reason: string;
  stoppedReason?: StoppedByLaw | null; // the 227 law: the WHY is carried, not just the what
  reportComplete?: boolean | null; // the report's own verdict when one exists
}, ledgerPath: string = SESSION_OPEN_LEDGER_PATH): { written: boolean; error?: string } {
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.appendFileSync(ledgerPath, JSON.stringify({ watch: SESSION_OPEN_NAME, ...line, openedAt: new Date().toISOString() }) + "\n");
    return { written: true };
  } catch (e) {
    return { written: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── the drift check (the remote's own answer vs the box's HEAD) ──

export function readDrift(): { remoteHead: string | null; localHead: string | null; match: boolean } {
  let remoteHead: string | null = null;
  try {
    const r = spawnSync("git", ["ls-remote", REPO_URL, "refs/heads/main"], { encoding: "utf8", timeout: 30_000 });
    remoteHead = (r.stdout ?? "").trim().split("\t")[0] || null;
  } catch {
    remoteHead = null;
  }
  let localHead: string | null = null;
  try {
    localHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() ?? null;
  } catch {
    localHead = null;
  }
  return { remoteHead, localHead, match: remoteHead != null && remoteHead === localHead };
}

// ── the arrival itself ──

async function main() {
  const watchHours = Number(process.argv[2] ?? DEFAULT_WATCH_HOURS) || DEFAULT_WATCH_HOURS;
  const waitMs = Number(process.argv[3] ?? DEFAULT_WAIT_MS) || DEFAULT_WAIT_MS;

  // 1. the drift check first - always, before anything else
  const drift = readDrift();
  if (!drift.match) {
    console.log(`DRIFT: remote ${drift.remoteHead?.slice(0, 7) ?? "UNANSWERING"} vs local ${drift.localHead?.slice(0, 7) ?? "UNKNOWN"} - the mismatch is named, read the chain's state anyway (the receipts are the box's truth)`);
  } else {
    console.log(`drift clean: remote and local agree at ${drift.localHead?.slice(0, 7)}`);
  }

  // 2. the chain's state, from the durable truth alone
  const state = readChainState();
  console.log(`chain: ${state.chain} (pid ${state.pid ?? "-"}${state.pidFileGeneration != null ? `, gen ${state.pidFileGeneration}` : ""}, pid file ${state.pidFileShape}; ledger ${state.ledgerLines} line(s), last outcome ${state.expected.lastOutcome ?? "-"}${state.expected.stoppedReason ? `, stopped: ${state.expected.stoppedReason}` : ""}; report ${state.reportExists ? `present (complete: ${state.reportComplete})` : "absent"}, log ${state.logExists ? "present" : "absent"})`);

  // 3. the pure law's decision
  const decision = decideSessionAction({ chain: state.chain, expected: state.expected });
  console.log(`decision: ${decision.action}${decision.generation != null ? ` generation ${decision.generation}` : ""} - ${decision.reason}`);

  // 4. the act (the relaunch is detached through the double-fork
  // wrapper, the 129 law; the child's pid is verified alive)
  if (decision.action === "relaunch" && decision.generation != null) {
    const child = spawn(process.execPath, [MJS_PATH, String(watchHours), String(waitMs), String(decision.generation)], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log(`relaunch: generation ${decision.generation} handed to the wrapper (pid ${child.pid}), verifying...`);
    await new Promise((r) => setTimeout(r, 8000));
    let verified = false;
    try {
      const raw = fs.readFileSync(PID_PATH, "utf8");
      const reading = parsePidFile(raw);
      verified = reading != null && pidAlive(reading.pid);
      if (verified && reading) console.log(`relaunch verified: generation ${reading.generation ?? decision.generation} riding (pid ${reading.pid}), ${watchHours}h, the log watch223.log`);
    } catch { /* fall through to the honest naming */ }
    if (!verified) console.log("WARNING: the relaunched pid did not answer - read watch223.log before trusting the chain");
  }

  // 5. the arrival named in its own ledger (a failed append stands down)
  const written = appendSessionOpenLine({
    remoteHead: drift.remoteHead,
    localHead: drift.localHead,
    drift: drift.match ? "match" : "DRIFT",
    chain: state.chain,
    action: decision.action,
    generation: decision.generation,
    reason: decision.reason,
    stoppedReason: state.expected.stopped ? state.expected.stoppedReason : null,
    reportComplete: state.reportComplete,
  });
  console.log(`arrival ledger: ${written.written ? SESSION_OPEN_LEDGER_PATH : `FAILED (${written.error}) - the append stands down`}`);

  if (decision.action === "rebuild") {
    console.log("REFUSED: the arrival does not rebuild - bash scripts/box-rebuild.sh with the token is the one command");
    process.exit(2);
  }
}

// the entry guard: the gates import this file for the pure law; only
// direct execution rides the arrival
if (process.argv[1] && process.argv[1].includes("session-open")) {
  main().catch((e) => { console.error("SESSION-OPEN FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
}

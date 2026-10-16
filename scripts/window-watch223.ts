// WINDOW WATCH 223 - THE FRONTIER RIDES ITSELF (the pixels-free
// graduation the standing wall named). The 429 wall has now killed
// three frontiers' pixels legs (220 -> 222 -> 223) for one reason:
// the patience was SESSION-BOUND. The window opened once (the 221
// rides) and closed unused between sessions. The law this script
// graduation: the watch is DETACHED patience - it probes the window
// on a bounded ladder, and on the window's own proof (a real probe
// image lands) it rides the frontier's ready legs IN ORDER:
//
//   1. night122-restore      (the sheets land; the receipt completes)
//   2. night222-v4aikeyframe (the SECOND kf-v4 night; the clock)
//   3. probe222-swordprior   (the paired arms; the graduation)
//
// Every leg is the COMMITTED script (idempotent, receipted); every
// leg's outcome lands in the durable watch report (the 220 report
// law's shape). The deadline expiring with the wall standing is an
// HONEST outcome - the report names it, exit 0, never a crash.
// The watch never improvises: it spawns, it reads receipts, it
// writes one report. The eye before the hand, automated.
//
// The probe is the CREATE channel alone (the 222 receipt's own
// shape: the wall is ACCOUNT-TOTAL - one channel's window IS the
// account's window; the legs carry their own per-call ladders and
// will name any per-channel shape honestly on the ride).
//
// Run (detached, the 129 double-fork law): node scripts/window-watch223.mjs
// Run (foreground): npx tsx scripts/window-watch223.ts [watchHours] [waitMs]
import fs from "fs";
import path from "path";
import { spawnSync } from "node:child_process";
import ZAI from "z-ai-web-dev-sdk";

// ── the watch's own constants (the smoke asserts these by name) ──

export const WATCH_NAME = "window-watch223";
export const REPORT_PATH = path.join(process.cwd(), "receipts", "watch223-report.json");
export const LOCK_PATH = path.join(process.cwd(), "receipts", "watch223.lock");
export const PROOF_PATH = path.join(process.cwd(), "inspect", "aiart223", "probe-open.png");
export const DEFAULT_WATCH_HOURS = 8;
export const DEFAULT_WAIT_MS = 600_000; // the 10-minute pace - honest, never a tight loop
export const LEG_TIMEOUT_MS = 2 * 60 * 60 * 1000; // a leg has two hours before the watch names it timed out

// ── the plan law (PURE - the e2e asserts exact outputs) ──

/** The state the receipts carry at watch start; the plan is its
 *  own function. Nothing is guessed: the receipts are the durable
 *  truth, the plan is the truth's consequence. */
export interface WatchState {
  restoreComplete: boolean; // the restore receipt's own complete flag
  nightOkShots: number; // ok shots on the night-222 durable report
  nightTotalShots: number; // the scene's shot count (6 for E7 Sc12)
}

export interface WatchLegPlan {
  name: string;
  target: string;
  action: "ride" | "skip";
  reason: string;
}

/** The leg order is the law: restore first (the arms' guard reads
 *  its receipt), then the night (independent - the designs carry
 *  the anchors), then the arms (read-only evidence, always rides).
 *  Skip rules come from the receipts alone. */
export function buildWatchPlan(state: WatchState): WatchLegPlan[] {
  return [
    {
      name: "restore",
      target: "scripts/night122-restore.ts",
      action: state.restoreComplete ? "skip" : "ride",
      reason: state.restoreComplete
        ? "the restore receipt reads complete:true - the sheets landed, the leg is done"
        : "the restore receipt names window-bound members - the sheets are the image channel's own work",
    },
    {
      name: "night",
      target: "scripts/night222-v4aikeyframe.ts",
      action: state.nightOkShots >= state.nightTotalShots ? "skip" : "ride",
      reason:
        state.nightOkShots >= state.nightTotalShots
          ? `the durable night report carries all ${state.nightTotalShots} shots ok - the second kf-v4 night is complete`
          : `the durable night report carries ${state.nightOkShots}/${state.nightTotalShots} shots ok - the per-shot done-set makes the ride clean`,
    },
    {
      name: "arms",
      target: "scripts/probe222-swordprior.ts",
      action: "ride",
      reason: "read-only paired evidence - re-riding adds evidence, the fan precedent",
    },
  ];
}

// ── the probe (the window's own proof: pixels or the wall verbatim) ──

export interface ProbeResult {
  open: boolean;
  ms: number;
  base64Chars?: number;
  error?: string; // the wall's own words, verbatim
}

export async function probeWindow(): Promise<ProbeResult> {
  const zai = await ZAI.create();
  const t0 = Date.now();
  try {
    const res = (await zai.images.generations.create({
      prompt: "a single green tea cup on a wooden table, anime cel-shading style, flat colors",
      size: "576x576",
    })) as { data?: Array<{ base64?: string }> };
    const b64 = res.data?.[0]?.base64 ?? "";
    return { open: true, ms: Date.now() - t0, base64Chars: b64.length };
  } catch (e) {
    return { open: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── the report (the 220 law's shape: durable, the write names its own failure) ──

export interface WatchReport {
  watch: string;
  startedAt: string;
  endedAt: string;
  deadlineHours: number;
  waitMs: number;
  probeCycles: number;
  windowOpenedAt: string | null;
  wallVerbatim: string | null; // the last probe's error when the deadline expired standing
  legs: Array<{
    name: string;
    target: string;
    startedAt: string;
    endedAt: string;
    exitCode: number | null;
    timedOut: boolean;
    summary: string;
  }>;
  complete: boolean; // the watch's own purpose: the legs rode
  windowBound: string[]; // the honest remainder when the deadline expired
  writtenAt: string;
  reportPath: string;
  reportError?: string;
}

export function writeWatchReport(report: WatchReport, reportPath = REPORT_PATH): WatchReport {
  const body = { ...report, writtenAt: new Date().toISOString(), reportPath };
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(body, null, 2));
  } catch (e) {
    body.reportError = e instanceof Error ? e.message : String(e);
  }
  return body;
}

// ── the receipts read (the plan's inputs, read at watch start) ──

function readWatchState(): WatchState {
  let restoreComplete = false;
  try {
    const rr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "receipts", "restore-receipt.json"), "utf8"));
    restoreComplete = rr.complete === true;
  } catch { /* absent - the restore rides */ }

  let nightOkShots = 0;
  try {
    const nr = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "inspect", "aikeyframes", "night-report-night-222-v4aikeyframe.json"), "utf8"),
    );
    nightOkShots = Array.isArray(nr.results) ? nr.results.filter((r: { ok?: boolean }) => r.ok === true).length : 0;
  } catch { /* absent - the night rides */ }

  return { restoreComplete, nightOkShots, nightTotalShots: 6 };
}

// ── the lock (the double-ride guard: one watch per box) ──

function acquireLock(): void {
  try {
    const prev = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8")) as { pid?: number };
    if (prev.pid) {
      try {
        process.kill(prev.pid, 0); // alive - the watch refuses to double-ride
        console.error(`WATCH REFUSED: a watch already rides (pid ${prev.pid}, ${LOCK_PATH})`);
        process.exit(2);
      } catch {
        /* stale - the pid is dead, the lock is replaced */
      }
    }
  } catch { /* no lock - fine */ }
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2));
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_PATH); } catch { /* absent - fine */ }
}

// ── the legs (spawn the COMMITTED scripts; their receipts are the truth) ──

function rideLeg(name: string, target: string, legs: WatchReport["legs"]): void {
  const startedAt = new Date().toISOString();
  console.log(`\n==== LEG ${name} -> ${target} (${startedAt}) ====`);
  const r = spawnSync("npx", ["tsx", target], { cwd: process.cwd(), timeout: LEG_TIMEOUT_MS, encoding: "utf8" });
  const endedAt = new Date().toISOString();
  const timedOut = r.error?.name === "AbortError" || (r.status === null && r.signal !== null);
  const exitCode = r.status;
  let summary = `exit ${exitCode}${timedOut ? " (timed out)" : ""}`;
  const tail = (r.stdout ?? "").trim().split("\n").filter(Boolean).slice(-3).join(" | ");
  if (tail) summary += ` - ${tail.slice(0, 300)}`;
  console.log(`LEG ${name}: ${summary}`);
  legs.push({ name, target, startedAt, endedAt, exitCode, timedOut, summary });
}

// ── the watch itself ──

async function main() {
  const watchHours = Number(process.argv[2] ?? DEFAULT_WATCH_HOURS) || DEFAULT_WATCH_HOURS;
  const waitMs = Number(process.argv[3] ?? DEFAULT_WAIT_MS) || DEFAULT_WAIT_MS;
  const deadline = Date.now() + watchHours * 60 * 60 * 1000;

  acquireLock();
  console.log(`${WATCH_NAME} riding: probe every ${Math.round(waitMs / 1000)}s, deadline ${new Date(deadline).toISOString()} (${watchHours}h)`);
  console.log(`plan: ${buildWatchPlan(readWatchState()).map((l) => `${l.name}:${l.action}`).join(" -> ")}`);

  const startedAt = new Date().toISOString();
  const legs: WatchReport["legs"] = [];
  let probeCycles = 0;
  let windowOpenedAt: string | null = null;
  let wallVerbatim: string | null = null;

  while (Date.now() < deadline) {
    probeCycles += 1;
    const probe = await probeWindow();
    if (probe.open) {
      windowOpenedAt = new Date().toISOString();
      console.log(`WINDOW OPEN (cycle ${probeCycles}, ${probe.ms}ms, base64 ${probe.base64Chars}) - the legs ride`);
      // the window's proof lands on disk (the pixels themselves)
      try {
        const zai2 = await ZAI.create();
        const proof = (await zai2.images.generations.create({
          prompt: "a single green tea cup on a wooden table, anime cel-shading style, flat colors",
          size: "576x576",
        })) as { data?: Array<{ base64?: string }> };
        const b64 = proof.data?.[0]?.base64 ?? "";
        if (b64) {
          fs.mkdirSync(path.dirname(PROOF_PATH), { recursive: true });
          fs.writeFileSync(PROOF_PATH, Buffer.from(b64, "base64"));
          console.log(`window proof: ${PROOF_PATH}`);
        }
      } catch (e) {
        console.log(`proof write skipped (the window flickered): ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }
    wallVerbatim = probe.error ?? "blocked";
    console.log(`cycle ${probeCycles}: BLOCKED (${probe.ms}ms) - ${wallVerbatim.slice(0, 120)}`);
    const sleepUntil = Date.now() + waitMs;
    if (sleepUntil >= deadline) break; // one more probe would outlive the deadline - the watch stands down honestly
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (windowOpenedAt) {
    const state = readWatchState();
    for (const leg of buildWatchPlan(state)) {
      if (leg.action === "skip") {
        console.log(`LEG ${leg.name}: SKIP - ${leg.reason}`);
        legs.push({ name: leg.name, target: leg.target, startedAt: "-", endedAt: "-", exitCode: 0, timedOut: false, summary: `skip - ${leg.reason}` });
        continue;
      }
      rideLeg(leg.name, leg.target, legs);
    }
  } else {
    console.log(`DEADLINE EXPIRED with the wall standing (${probeCycles} cycles) - the honest outcome, named`);
  }

  releaseLock();
  const report = writeWatchReport({
    watch: WATCH_NAME,
    startedAt,
    endedAt: new Date().toISOString(),
    deadlineHours: watchHours,
    waitMs,
    probeCycles,
    windowOpenedAt,
    wallVerbatim: windowOpenedAt ? null : wallVerbatim,
    legs,
    complete: Boolean(windowOpenedAt),
    windowBound: windowOpenedAt ? [] : ["restore", "night", "arms"],
  });
  console.log(`\nWATCH REPORT: ${report.reportPath} (complete: ${report.complete})${report.reportError ? ` (report write FAILED: ${report.reportError})` : ""}`);
}

// the entry guard: the e2e imports this file for the pure law; only
// direct execution rides the watch
if (process.argv[1] && process.argv[1].includes("window-watch223")) {
  main()
    .catch((e) => { console.error("WATCH FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });
}

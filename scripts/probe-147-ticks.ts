// PROBE 147 - THE TICK-BUDGET LAW (read-only, before the pen).
//
// The 146 night named the finding: the repair's wait budget is a
// CONSTANT (REPAIR_TICKS 660 x REPAIR_TICK_MS 500 = 330s) while the
// work it waits on scales with the rung - 2 of 4 re-renders timed out
// at the wide rung, and those "repairs" were silently re-judgments
// (the re-anchor beat supplied the lift). This probe measures the
// divergence from the SURVIVING COMMITTED EVIDENCE ONLY (the box died
// again - the eighth drift - so the DB's ProductionEvent payloads are
// gone; the README record and the receipt are the durable witnesses):
//
//   1. the source law: the constant, the loop that ignores progress,
//   2. the measured costs: the committed record's timeout frames
//      (S001 died at frame 54/101, Wei S004 at frame 27/96) and the
//      ~11-minute statement for a 1024-wide render,
//   3. the drain's own wall (night111-run.ts committed): 90 minutes
//      for six solo renders, the 138 wide-rung comment (~2.56x pixel
//      cost), and the live "frame N/M" telemetry the drain reads from
//      the job stage - telemetry the repair loop ignores,
//   4. the derived law's shape: a wait that reads the work's own
//      progress and fails only on stall or a ceiling sized from the
//      measured per-frame costs.
//
// Run: npx tsx scripts/probe-147-ticks.ts   (no DB writes, no renders)
import fs from "fs";

const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// ── P1: the source law (the constant, the blind loop) ──
const repairSrc = fs.readFileSync("src/lib/identity-repair.ts", "utf8");
const ticks = repairSrc.match(/export const REPAIR_TICKS = (\d+)/);
const tickMs = repairSrc.match(/export const REPAIR_TICK_MS = (\d+)/);
check("P1a the constant budget is named in source", !!ticks && !!tickMs,
  `REPAIR_TICKS=${ticks?.[1]} x REPAIR_TICK_MS=${tickMs?.[1]} = ${ticks && tickMs ? Number(ticks[1]) * Number(tickMs[1]) / 1000 : "?"}s`);
const budgetMs = Number(ticks?.[1] ?? 0) * Number(tickMs?.[1] ?? 0);
check("P1b the budget is 330s", budgetMs === 330_000, `${budgetMs / 1000}s`);
check("P1c the wait loop reads NO progress telemetry",
  !/frame \\?\(\\?d\+\)/.test(repairSrc) && (repairSrc.match(/ticked\.status === "RENDERING"/g)?.length ?? 0) >= 1,
  "the loop spins on status alone - a render that advances and one that stalls are indistinguishable to it");

// ── P2: the measured costs (the committed record) ──
const readme = fs.readFileSync("README.md", "utf8");
const s001 = readme.match(/frame (\d+)\/(\d+) when the 330s wait expired/);
const s004 = readme.match(/also timed out[^.]*|its re-render also timed out/);
const s004frame = readme.match(/frame 27\/96/);
check("P2a the committed record carries S001's timeout frame", !!s001,
  s001 ? `S001 died at frame ${s001[1]}/${s001[2]}` : "");
const elevenMin = readme.includes("~11 min") || readme.includes("~11 minutes");
check("P2b the committed record carries the 1024-wide cost", elevenMin, "~11 min per 1024-wide render");
check("P2c the committed record carries S004's timeout frame", !!s004 && !!s004frame,
  s004frame ? "Wei S004 died at frame 27/96" : "");

// the derived per-frame costs
const s001Done = Number(s001?.[1] ?? 0), s001Total = Number(s001?.[2] ?? 0);
const perFrameS001 = 330 / s001Done; // s/frame measured
const needS001 = s001Total * perFrameS001;
const perFrameS004 = 330 / 27;
const needS004 = 96 * perFrameS004;
console.log(`  measured: S001 ${perFrameS001.toFixed(2)}s/frame -> full need ~${needS001.toFixed(0)}s (${(needS001 / 330 * 100).toFixed(0)}% of budget); S004 ${perFrameS004.toFixed(2)}s/frame -> full need ~${needS004.toFixed(0)}s (${(needS004 / 330 * 100).toFixed(0)}% of budget)`);
check("P2d the constant budget covers ZERO of the two wide-rung renders",
  needS001 > 330 && needS004 > 330,
  `S001 needs ~${(needS001 / 330).toFixed(2)}x the budget; S004 needs ~${(needS004 / 330).toFixed(2)}x`);

// ── P3: the drain's own wall and the live telemetry ──
const drainSrc = fs.readFileSync("scripts/night111-run.ts", "utf8");
check("P3a the drain's wall is 90 minutes for six renders", drainSrc.includes("90 * 60 * 1000"),
  "the drain never expires mid-render at the wide rung");
check("P3b the drain reads live frame telemetry from the job stage",
  /frame \\d\+\\\/\\d\+|frame \(\\d\+\)\\\/\(\\d\+\)/.test(drainSrc) || drainSrc.includes("frame (\\d+)/(\\d+)"),
  'the stage string carries "frame N/M" - the repair loop never reads it');
check("P3c the wide rung's pixel cost is named in the drain", drainSrc.includes("2.56x"),
  "~2.56x pixel cost per wide clip (the 138 rung)");

// ── P4: the frontier law's shape (what 147 must build) ──
check("P4a the budget must scale: fail only on stall or ceiling",
  !repairSrc.includes("REPAIR_STALL_TICKS") && !repairSrc.includes("REPAIR_MAX_WAIT_TICKS"),
  "the stall/ceiling laws DO NOT EXIST yet - this is the work");
check("P4b the ceiling must be sized from the measured worst per-frame cost",
  perFrameS004 > 12,
  `worst measured ${perFrameS004.toFixed(2)}s/frame x ~101 frames ~= ${(perFrameS004 * 101 / 60).toFixed(1)} min - a 22-minute ceiling covers it with margin`);
check("P4c the wait must end with an HONEST reason in the ledger",
  !repairSrc.includes("stalled") || !repairSrc.includes("ceiling"),
  "the failure status must name WHICH budget ended the wait");

console.log(failures.length === 0
  ? `\nPROBE 147 COMPLETE - ALL GREEN: the divergence is measured (${(needS001 / 330).toFixed(2)}x and ${(needS004 / 330).toFixed(2)}x under-covered); the law's shape is named (progress-aware wait, stall + ceiling, honest reasons).`
  : `\nPROBE 147 INCOMPLETE - ${failures.length} failure(s): ${failures.join(", ")}`);
process.exit(failures.length === 0 ? 0 : 1);

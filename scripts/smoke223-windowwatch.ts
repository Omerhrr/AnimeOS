// SMOKE 223 - THE WINDOW WATCH'S LAW (the graduation's own teeth).
// Pixels-free by construction: the smoke never calls a channel. It
// asserts (1) the source law - the probe channel, the pace, the
// deadline honesty, the lock, the detached wrapper; (2) the plan
// law PURE - the leg order and the skip rules from receipts alone;
// (3) the report law - the durable shape, the write names its own
// failure; (4) the legs are the COMMITTED scripts.
// Run: npx tsx scripts/smoke223-windowwatch.ts
import fs from "fs";
import path from "path";
import {
  WATCH_NAME, REPORT_PATH, LOCK_PATH, PROOF_PATH,
  DEFAULT_WATCH_HOURS, DEFAULT_WAIT_MS,
  buildWatchPlan, writeWatchReport, type WatchState,
} from "./window-watch223";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}
function src(l: string): string {
  return fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8");
}

console.log(`${WATCH_NAME} - the watch's own law`);

// ── 1. the source law ──
const s = src("x");
ok(s.includes("zai.images.generations.create"), "the probe rides the CREATE channel (the account-total receipt's own shape)");
ok(s.includes("DEFAULT_WAIT_MS = 600_000"), "the pace is the 10-minute ladder (never a tight loop)");
ok(s.includes("DEFAULT_WATCH_HOURS = 8"), "the deadline is bounded (8h default)");
ok(s.includes("process.exit(2)"), "the lock refuses a double-ride (exit 2, named)");
ok(s.includes("windowBound:") && s.includes('"restore", "night", "arms"'), "the deadline expiring names the window-bound legs");
ok(s.includes('r.error?.name === "AbortError"'), "a leg timeout is named, never swallowed");
ok(s.includes('action: "ride",') && s.includes('"scripts/probe222-swordprior.ts"'), "the arms always ride (read-only evidence)");
ok(s.includes('process.argv[1].includes("window-watch223")'), "the entry guard: the e2e imports the pure law, never rides main");

// ── 2. the detached wrapper (the 129 double-fork law) ──
const m = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.mjs"), "utf8");
ok(m.includes("detached: true") && m.includes("child.unref()"), "the double-fork detach: detached + unref");
ok(m.includes("watch223.pid") && m.includes("watch223.log"), "the pid and the log land on disk");

// ── 3. the legs are the committed scripts ──
for (const t of ["scripts/night122-restore.ts", "scripts/night222-v4aikeyframe.ts", "scripts/probe222-swordprior.ts"]) {
  ok(fs.existsSync(path.join(process.cwd(), t)), `the leg target exists: ${t}`);
}

// ── 4. the plan law (PURE - exact outputs) ──
const wallBound: WatchState = { restoreComplete: false, nightOkShots: 0, nightTotalShots: 6 };
const p1 = buildWatchPlan(wallBound);
ok(p1.length === 3, "the plan carries exactly three legs");
ok(p1[0].name === "restore" && p1[0].action === "ride", "leg 1 rides the restore while the sheets are window-bound");
ok(p1[1].name === "night" && p1[1].action === "ride", "leg 2 rides the second kf-v4 night while the report is short");
ok(p1[2].name === "arms" && p1[2].action === "ride", "leg 3 always rides the paired arms");
const p2 = buildWatchPlan({ restoreComplete: true, nightOkShots: 0, nightTotalShots: 6 });
ok(p2[0].action === "skip" && p2[0].reason.includes("complete:true"), "the restore receipt's complete flag skips leg 1");
const p3 = buildWatchPlan({ restoreComplete: true, nightOkShots: 6, nightTotalShots: 6 });
ok(p3[1].action === "skip" && p3[1].reason.includes("complete"), "the night report's 6/6 ok skips leg 2");
const p4 = buildWatchPlan({ restoreComplete: false, nightOkShots: 3, nightTotalShots: 6 });
ok(p4[1].action === "ride" && p4[1].reason.includes("3/6"), "a partial night rides clean (the per-shot done-set)");

// ── 5. the report law (durable, the write names its own failure) ──
const labDir = path.join(process.cwd(), "inspect", "aiart223");
const labReport = path.join(labDir, "smoke223-lab-report.json");
const r = writeWatchReport(
  {
    watch: WATCH_NAME, generation: 1, startedAt: "lab", endedAt: "lab", deadlineHours: 0, waitMs: 0,
    probeCycles: 0, windowOpenedAt: null, wallVerbatim: "lab - the wall's words",
    legs: [], complete: false, windowBound: ["restore", "night", "arms"],
  },
  labReport,
);
ok(r.writtenAt.length > 0 && r.reportPath === labReport, "the report carries its own write receipts (writtenAt/reportPath)");
const onDisk = JSON.parse(fs.readFileSync(labReport, "utf8"));
ok(onDisk.complete === false && onDisk.windowBound.length === 3 && onDisk.wallVerbatim.includes("wall"), "the honest incomplete shape lands on disk");
// a path whose PARENT is a file cannot be created - name the failure
const blocked = writeWatchReport(
  { ...onDisk, generation: 1, startedAt: "lab3" },
  path.join(process.cwd(), "package.json", "impossible", "lab.json"),
);
ok(Boolean(blocked.reportError), "a failed write names itself in reportError (nothing hidden)");
try { fs.unlinkSync(labReport); } catch { /* fine */ }

// ── 6. the standing paths ──
ok(REPORT_PATH.endsWith("watch223-report.json") && LOCK_PATH.endsWith("watch223.lock") && PROOF_PATH.includes("aiart223"), "the report/lock/proof paths are the watch's own");

console.log(`\nSMOKE 223: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

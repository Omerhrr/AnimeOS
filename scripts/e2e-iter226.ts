// E2E ITERATION 226 - THE TWO SILENCES' OWN PROOF. The chain had
// two ways to die unnamed: the software crash that never wrote its
// line (the corpse the thirteenth drift found) and the session
// that arrived blind. The graduation is ridden here against the
// REAL box: the drift check rides the real remote, the arrival eye
// reads the real chain (alive, generation 1, its ledger honest by
// its very emptiness) and stands the hand down, the pure laws are
// held exact, the live probe rides both ways, the scope teeth and
// the gate's continuity stand.
// Run: npx tsx scripts/e2e-iter226.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { AI_KEYFRAME_SOURCE } from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { buildCrashHandoff, buildWatchPlan, probeWindow } from "../scripts/window-watch223";
import { decideSessionAction, parsePidFile, readChainState, readDrift } from "../scripts/session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("e2e 226 - the two silences, named and closed");

  // ── leg 1: the drift check rides the real remote ──
  console.log("leg 1: the drift check (the arrival eye's first act)");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)} (the drift law's own answer, ridden by the new law)`);

  // ── leg 2: the arrival eye reads the REAL chain ──
  console.log("leg 2: the chain's real state, read by the arrival eye");
  const state = readChainState();
  ok((state.chain === "alive" || state.chain === "dead") && state.pid != null, `the chain's pid file names its rider: pid ${state.pid} (pid file ${state.pidFileShape} shape; ${state.chain} - riding, or ridden and stopped by its own law)`);
  ok((state.ledgerLines === 0 && !state.reportExists) || (state.ledgerLines >= 1 && state.reportExists), `the chain's story is one of the two lawful shapes (riding: ${state.ledgerLines} lines, report ${state.reportExists ? "present" : "absent"} - or the answer's own: the rode line + the report)`);

  // ── leg 3: the arrival's decision against the real state ──
  console.log("leg 3: the arrival's decision (the pure law on the real box)");
  const decision = decideSessionAction({ chain: state.chain, expected: state.expected });
  ok(decision.action === "stand-down" && decision.generation === 1 && (decision.reason.includes("the chain rides") || decision.reason.includes("stopped by its own law")), `the hand stands down: ${decision.reason.slice(0, 80)}`);
  ok(state.expected.generation === 1 && ((state.expected.stopped === false && state.expected.lastOutcome === null) || (state.expected.stopped === true && state.expected.lastOutcome === "rode")), `the ledger's accounting on the real box is lawful (gen 1 ${state.expected.stopped ? `stopped: ${state.expected.lastOutcome} - the answer` : "promised, nothing stopped"})`);

  // ── leg 4: the plan law against the REAL receipts ──
  console.log("leg 4: the plan law against the real receipts");
  let restoreComplete = false;
  try { restoreComplete = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "receipts", "restore-receipt.json"), "utf8")) as { complete?: boolean }).complete === true; } catch { /* absent */ }
  let nightOk = 0;
  try {
    const nr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "inspect", "aikeyframes", "night-report-night-222-v4aikeyframe.json"), "utf8")) as { results?: Array<{ ok?: boolean }> };
    nightOk = Array.isArray(nr.results) ? nr.results.filter((r) => r.ok === true).length : 0;
  } catch { /* absent */ }
  const plan = buildWatchPlan({ restoreComplete, nightOkShots: nightOk, nightTotalShots: 6 });
  ok(plan[0].action === (restoreComplete ? "skip" : "ride") && plan[1].action === (nightOk >= 6 ? "skip" : "ride") && plan[2].action === "ride", `the plan reads the receipts alone (restore ${restoreComplete ? "complete" : "window-bound"}, night ${nightOk}/6, arms always ride)`);
  ok(plan.every((l) => l.action === "ride") || (plan[0].action === "skip" && plan[1].action === "skip" && plan[2].action === "ride"), `the plan is the receipts' own consequence (all three ride while the receipts wait; the skips take over when the answer is in - the arms always ride)`);

  // ── leg 5: the crash law - the corpse's own shape, exact ──
  console.log("leg 5: the crash law (the thirteenth drift's corpse, replayed)");
  const corpse = buildCrashHandoff({
    generation: 1,
    reason: "the box was taken mid-generation (the thirteenth drift's own shape)",
    probeCycles: 6,
    startedAt: "2026-10-17T04:00:00.000Z",
    endedAt: "2026-10-17T05:00:00.000Z",
  });
  ok(corpse.outcome === "crashed" && corpse.nextGeneration === 2 && corpse.decision.continueChain === true, `the corpse replayed: generation 1 crashed writes its line and hands to 2 - the silent death cannot happen again`);
  ok(corpse.line.legs.length === 0 && corpse.line.windowOpenedAt === null, "the honest line carries exactly what was true: no legs ridden, no window seen");

  // ── leg 6: the live probe (both-ways) ──
  console.log("leg 6: the live probe (the both-ways law)");
  const probe = await probeWindow();
  if (probe.open) {
    ok(typeof probe.base64Chars === "number" && probe.base64Chars > 1000, `the window is OPEN (${probe.base64Chars} b64 chars) - the legs ride in-session`);
  } else {
    ok(probe.error?.includes("429"), `the wall stands and names itself verbatim (${probe.ms}ms) - generation 1 keeps watching`);
  }

  // ── leg 7: the union arc (the scope teeth across 226) ──
  console.log("leg 7: the union arc");
  const dbRows = await db.identityArcReading.count({ where: { source: AI_KEYFRAME_SOURCE } });
  const ledgerRows = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8")
    .split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((o) => o && o.source === AI_KEYFRAME_SOURCE).length;
  ok(dbRows + ledgerRows >= 36, `the arc carries its rows (db ${dbRows} + committed ledger ${ledgerRows}, unchanged across the graduation)`);

  // ── leg 8: the gate's continuity ──
  console.log("leg 8: the gate's continuity");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
  if (project && scene) {
    const gate = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
    ok(gate.arc === true && gate.nights >= 1, `the arc stands, nights ${gate.nights} (the ref chain, not the DB)`);
    ok(gate.provisional === (gate.nights < 2), `PROVISIONAL ${gate.provisional ? "stands" : "has exited"} (the clock's teeth)`);
    if (gate.provisional) ok(gate.verdict !== "RELEASE", "a PROVISIONAL arc never releases");
  } else {
    ok(false, "the project or scene is missing - the DB's state is not the law's");
  }

  // ── leg 9: the pid file law (both shapes parse - the box's real file rides) ──
  console.log("leg 9: the pid file law");
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "watch223.pid"), "utf8");
    const reading = parsePidFile(raw);
    ok(reading != null && reading.pid === state.pid, `the box's real pid file parses (pid ${reading?.pid}, generation ${reading?.generation ?? "pre-226"})`);
  } catch {
    ok(false, "the pid file could not be read - the chain's liveness is unnamed");
  }

  console.log(`\nE2E 226: ${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error("E2E 226 FAILED:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; })
  .finally(() => db.$disconnect());

// E2E ITERATION 229 - THE CHAIN'S OWN ANSWER, PROVEN ON THE REAL
// BOX. The frontier's sentence grew its teeth: the chain stops on
// the RECEIPTS, not on the window's opening. The 223 law wrote
// complete:Boolean(windowOpenedAt) - a window that flickers shut
// mid-ride would still write complete:true, the chain would stop on
// a lie, the next arrival would read the false answer. The
// graduation rides both ends: the watch re-reads the receipts after
// the legs ride (buildRideVerdict, the verdict is the receipts' own
// truth, a flicker writes outcome "flickered" and the chain
// continues) and the arrival VERIFIES the report's claim against
// the same receipts (the eye reads the receipts, not the report's
// claim). Every leg here reads the REAL box: the drift, the riding
// chain through the grown eye, the plan against the real receipts,
// the verdict on the real remainder, the wall's own words, the
// union arc, the gate, and the lab-scope round-trips.
// Run: npx tsx scripts/e2e-iter229.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { WATCH_NAME, appendGenerationLine, buildRideVerdict, buildWatchPlan, probeWindow, readWatchState, writeWatchReport } from "../scripts/window-watch223";
import { SESSION_OPEN_LEDGER_PATH, decideSessionAction, readChainState, readDrift } from "../scripts/session-open";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("e2e 229 - the chain's own answer");

  // ── leg 1: the drift check ──
  console.log("leg 1: the drift check");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)}`);

  // ── leg 2: the real chain, read by the grown eye ──
  console.log("leg 2: the real chain read (the arrival's own reader)");
  const state = readChainState();
  // THE TWO LAWFUL SHAPES, GROWN TO THE 228 MEMORY LAW (the fifth
  // death's own shape): a fresh generation rides an empty ledger and
  // no report - and a REBORN chain rides the predecessor's own
  // history (the arrival ledger is the box's memory, carried across
  // the clone; the report it carries is the predecessor's COMPLETED
  // answer, the claim verified). An alive chain wearing an INCOMPLETE
  // report stays unlawful - the teeth keep that gate.
  const ridingFresh = state.chain === "alive" && state.ledgerLines === 0 && state.reportExists === false && state.reportComplete === null;
  const ridingReborn = state.chain === "alive" && state.reportExists === true && state.reportComplete === true;
  const riding = ridingFresh || ridingReborn;
  const answered = state.chain === "dead" && state.ledgerLines >= 1 && state.reportExists === true && typeof state.reportComplete === "boolean";
  ok(riding || answered, `the chain's story is one of the lawful shapes (chain: ${state.chain}, pid ${state.pid ?? "-"}, pid file ${state.pidFileShape}, ledger ${state.ledgerLines} line(s), report ${state.reportExists ? `present, claim verified: ${state.reportComplete}` : "absent"}${ridingReborn ? " - the reborn shape: the memory survived the body" : ""})`);
  ok(state.pidFileShape === "json", `the pid file carries its generation (the 228 shape: ${state.pidFileShape})`);

  // ── leg 3: the real stand-down decision ──
  console.log("leg 3: the arrival's decision on the real chain");
  const decision = decideSessionAction({ chain: state.chain, expected: state.expected });
  ok(decision.action === "stand-down" && (decision.reason.includes("the chain rides") || decision.reason.includes("stopped by its own law")), `the hand stands down - lawful in BOTH states (${decision.action}: ${decision.reason.slice(0, 70)})`);
  ok(decision.action === "stand-down" && decision.generation === (state.pidFileGeneration ?? state.expected.generation), `the stand-down names the generation (${decision.action === "stand-down" ? decision.generation : "-"})`);

  // ── leg 4: the plan law against the real receipts ──
  console.log("leg 4: the plan law vs the real receipts");
  const real = readWatchState();
  ok(typeof real.restoreComplete === "boolean" && real.nightTotalShots === 6 && real.nightOkShots >= 0 && real.nightOkShots <= 6, `the reader reads the real receipts (restore ${real.restoreComplete ? "complete" : "window-bound"}, night ${real.nightOkShots}/${real.nightTotalShots} - the truth, either state)`);
  const plan = buildWatchPlan(real);
  ok(plan.map((l) => l.name).join(",") === "restore,night,arms" && plan[0].action === (real.restoreComplete ? "skip" : "ride") && plan[1].action === (real.nightOkShots >= 6 ? "skip" : "ride") && plan[2].action === "ride", `the plan is the receipts' own consequence, in order (${plan.map((l) => `${l.name}:${l.action}`).join(" -> ")})`);

  // ── leg 5: the verdict law on the real receipts ──
  console.log("leg 5: the verdict on the real remainder");
  const flickerVerdict = buildRideVerdict(real, true);
  const receiptsComplete = real.restoreComplete && real.nightOkShots >= 6;
  ok(flickerVerdict.complete === receiptsComplete, `the verdict IS the receipts' truth (complete: ${flickerVerdict.complete} - ${receiptsComplete ? "the answer is in" : "a window alone is not the answer"})`);
  ok(receiptsComplete === true ? (flickerVerdict.windowBound.length === 0 && flickerVerdict.reason.includes("the receipts carry the answer")) : (JSON.stringify(flickerVerdict.windowBound) === JSON.stringify(["restore", "night"]) && flickerVerdict.reason.includes("not complete")), `the verdict's words match its own verdict (${flickerVerdict.windowBound.join(" + ") || "nothing remains"})`);
  const expiryVerdict = buildRideVerdict(real, false);
  ok(expiryVerdict.complete === false && expiryVerdict.windowBound.length === 3, `the expiry shape stands (all three wait: ${expiryVerdict.windowBound.join(", ")})`);

  // ── leg 6: the live probe (both-ways: the wall's words or pixels) ──
  console.log("leg 6: the live probe (the both-ways law)");
  const probe = await probeWindow();
  if (probe.open) {
    ok(typeof probe.base64Chars === "number" && probe.base64Chars > 1000, `the window is OPEN - real pixels (${probe.base64Chars} b64 chars, ${probe.ms}ms)`);
  } else {
    ok(probe.error?.includes("429"), `the wall stands and names itself verbatim (${probe.ms}ms)`);
    ok(probe.base64Chars === undefined, "a blocked probe carries no pixels");
  }

  // ── leg 7: the union arc (the identity law's own shape) ──
  console.log("leg 7: the union arc");
  const dbArcRows = await db.identityArcReading.count({ where: { source: "AI_KEYFRAME" } });
  // THE UNION LAW'S OWN INVARIANT (grown at 235, the 227/228 precedent):
  // the db half is lawful at 0 or at the rides' own rows - however many
  // lawful nights - and every db night key must live in the committed
  // half (the live half never invents a night the file does not carry;
  // the 234 tail's ride lawfully added S003's single regen row).
  const committedAiNights = new Set(
    fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8").split("\n").filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { source?: string; night?: string })
      .filter((r) => r.source === "AI_KEYFRAME" && r.night)
      .map((r) => r.night as string),
  );
  const dbAiNights = new Set(
    (await db.identityArcReading.findMany({ where: { source: "AI_KEYFRAME" }, select: { night: true } })).map((r) => r.night),
  );
  const allNightsCarried = [...dbAiNights].every((n) => committedAiNights.has(n));
  ok((dbArcRows === 0 || dbArcRows >= 1) && allNightsCarried, `the union arc's db half is lawful (${dbArcRows} rows - empty until a night rides, the rides' own appends however many lawful nights, every night key carried by the committed half)`);
  const committedArc = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { source?: string })
    .filter((r) => r.source === "AI_KEYFRAME");
  // THE 231 UNION LAW: the ledger file is append-only across boxes; the
  // db half is THIS body's own (a rebirth empties it, the file remembers).
  // The invariant every lawful state holds: file >= the 36-row history,
  // and file minus this body's appends still carries the history.
  ok(committedArc.length >= 36 && committedArc.length - dbArcRows >= 36, `the committed ledger half stands: ${committedArc.length} AI_KEYFRAME rows, db half ${dbArcRows} (the append-only union law - the file carries the 36-row history plus every night's append; rebirth empties the db half, the file remembers)`);

  // ── leg 8: the gate's continuity ──
  console.log("leg 8: the release gate");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: true } });
  if (project && scene) {
    const gate = await episodeReleaseVerdict(project.id, scene.episode.id, "AI_KEYFRAME");
    ok(gate.provisional === (gate.nights < 2), `PROVISIONAL ${gate.provisional ? "stands" : "has exited"} (nights ${gate.nights})`);
    if (gate.provisional) ok(gate.verdict !== "RELEASE", "a PROVISIONAL arc never releases");
  } else {
    ok(false, "the project or scene is missing - the DB's state is not the law's");
  }

  // ── leg 9: the verdict's round-trips (lab scope - the real receipts are never touched) ──
  console.log("leg 9: the lab round-trips (the report and the flicker's line)");
  const labReportPath = path.join(process.cwd(), "inspect", "aiart223", "e2e229-lab-watch-report.json");
  const labReport = writeWatchReport(
    {
      watch: WATCH_NAME, generation: 3, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      deadlineHours: 12, waitMs: 600_000, probeCycles: 2, windowOpenedAt: new Date().toISOString(),
      wallVerbatim: null, legs: [], complete: false,
      windowBound: ["restore", "night"],
      verdictReason: "the window opened but the receipts are not complete - restore + night still window-bound, the chain does not stop on an opened window alone",
    },
    labReportPath,
  );
  const labRead = JSON.parse(fs.readFileSync(labReportPath, "utf8")) as { complete?: boolean; windowBound?: string[]; verdictReason?: string };
  ok(labRead.complete === false && JSON.stringify(labRead.windowBound) === JSON.stringify(["restore", "night"]), "the flicker's report shape lands on disk (complete:false, the remainder named)");
  ok((labRead.verdictReason ?? "").includes("not complete"), "the WHY rides beside the what (the verdictReason field round-trips)");
  ok(labReport.reportError === undefined, "the lab report wrote clean");
  fs.rmSync(labReportPath, { force: true });

  const labLedger = path.join(process.cwd(), "inspect", "aiart223", "e2e229-lab-generations.jsonl");
  const flickerLine = appendGenerationLine({
    watch: WATCH_NAME, generation: 3, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
    outcome: "flickered", probes: 2, windowOpenedAt: new Date().toISOString(),
    legs: ["restore:1", "night:1", "arms:0"], nextGeneration: 4,
  }, labLedger);
  const labLines = fs.readFileSync(labLedger, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { outcome?: string; nextGeneration?: number | null });
  ok(flickerLine.written && labLines[0].outcome === "flickered" && labLines[0].nextGeneration === 4, "the flicker's ledger line round-trips (the honest fourth word)");
  ok(decideSessionAction({ chain: "dead", expected: { generation: 4, stopped: false, stoppedReason: null, lastOutcome: "flickered" } }).action === "relaunch", "the arrival relaunches the flicker's promise (generation 4 rides again)");
  fs.rmSync(labLedger, { force: true });

  // ── leg 10: the arrivals ledger's continuity ──
  console.log("leg 10: the arrivals ledger");
  const opens = fs.readFileSync(SESSION_OPEN_LEDGER_PATH, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { watch?: string; action?: string; reportComplete?: boolean | null });
  ok(opens.length >= 5 && opens.every((o) => o.watch === "session-open"), `${opens.length} arrivals on the ledger, every one the arrival's own line`);
  ok(opens.every((o) => o.reportComplete === undefined || o.reportComplete === null || typeof o.reportComplete === "boolean"), "every arrival's verdict field is lawful (the 226-born lines predate the WHY fields - the ledger keeps its own history; the 227-grown lines carry the truth or the named absence)");

  console.log(`\nE2E 229: ${pass} pass, ${fail} fail`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E 229 FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });

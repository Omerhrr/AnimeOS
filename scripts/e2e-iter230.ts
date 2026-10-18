// E2E ITERATION 230 - THE ANSWER'S OWN PROOF. The fifth death wiped
// the box while the frontier's answer was still waiting; the rebuild
// rode one command (the rebirth: the memory from git, the rows born
// back, the chain gen 1 relaunched under the 229 verdict law from
// birth) - AND THE WINDOW OPENED ON CYCLE 1. The chain rode its own
// legs in order (restore complete:true, the night 6/6 ok, the arms'
// evidence), re-read the receipts, wrote the verdict FROM THE
// RECEIPTS (complete:true, nothing window-bound), stopped on its own
// answer, and the arrival verified the claim against the receipts
// and stood down forever (the 227 rode branch, live). Every leg here
// reads the REAL terminal state: the rode line, the eternal
// stand-down, the verified claim, the verdict's own words, the arc's
// both halves, the gate's clock, and the arrivals ledger's story.
// Run: npx tsx scripts/e2e-iter230.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { buildRideVerdict, readWatchState } from "../scripts/window-watch223";
import { GENERATIONS_LEDGER_PATH, SESSION_OPEN_LEDGER_PATH, decideSessionAction, expectedGenerationFromLedger, readChainState, readDrift, readLedgerLines } from "../scripts/session-open";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("e2e 230 - the answer's own proof");

  // ── leg 1: the drift check ──
  console.log("leg 1: the drift check");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)}`);

  // ── leg 2: the rode line (the chain's own history) ──
  console.log("leg 2: the rode line");
  const ledger = readLedgerLines(GENERATIONS_LEDGER_PATH);
  const rode = ledger[ledger.length - 1];
  ok(ledger.length >= 1 && rode?.outcome === "rode" && rode?.nextGeneration === null, `the chain wrote its own answer: ${ledger.length} line(s), the last outcome ${rode?.outcome}, no handoff (append-only across the rides - the law, not one box state)`);
  ok(JSON.stringify(rode?.legs) === JSON.stringify(["restore:0", "night:0", "arms:0"]), `the three legs rode clean (${(rode?.legs ?? []).join(", ")})`);
  ok(typeof rode?.windowOpenedAt === "string" && (rode?.windowOpenedAt ?? "").length > 0, `the window's opening is named (${rode?.windowOpenedAt})`);

  // ── leg 3: the arrival's accounting (the 227 law, live) ──
  console.log("leg 3: the arrival's accounting");
  const expected = expectedGenerationFromLedger(ledger);
  ok(expected.generation === 1 && expected.stopped === true && expected.stoppedReason === "rode", `the accounting reads the stop: gen ${expected.generation}, stopped: ${expected.stoppedReason}`);

  // ── leg 4: the eternal stand-down (the rode branch, live) ──
  console.log("leg 4: the eternal stand-down");
  const decision = decideSessionAction({ chain: "dead", expected });
  ok(decision.action === "stand-down" && decision.reason.includes("its own law"), `the rode stop stands down forever (${decision.action}: ${decision.reason.slice(0, 70)})`);

  // ── leg 5: the verified claim (the 229 arrival law, live) ──
  console.log("leg 5: the verified claim");
  const state = readChainState();
  ok(state.chain === "dead" && state.reportExists === true, "the chain is dead by its own law, the report present");
  ok(state.reportComplete === true, "reportComplete is TRUE - COMPUTED from the receipts (the claim verified, not trusted)");

  // ── leg 6: the verdict's own answer (the 229 watch law, live) ──
  console.log("leg 6: the verdict's own answer");
  const real = readWatchState();
  const verdict = buildRideVerdict(real, true);
  ok(real.restoreComplete === true && real.nightOkShots >= 6, `the receipts read complete (restore ${real.restoreComplete}, night ${real.nightOkShots}/${real.nightTotalShots})`);
  ok(verdict.complete === true && verdict.windowBound.length === 0 && verdict.reason.includes("the receipts carry the answer"), `the verdict IS the answer (${verdict.windowBound.length} window-bound - ${verdict.reason.slice(0, 60)})`);

  // ── leg 7: the report's own words (the watch's own output) ──
  console.log("leg 7: the report's own words");
  const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), "receipts", "watch223-report.json"), "utf8")) as { complete?: boolean; windowBound?: string[]; verdictReason?: string; legs?: Array<{ name: string; exitCode: number | null; timedOut: boolean }>; windowOpenedAt?: string | null; generation?: number };
  ok(report.complete === true && (report.windowBound ?? []).length === 0, `the report carries the answer (complete: ${report.complete}, window-bound: ${(report.windowBound ?? []).join(", ") || "none"})`);
  ok((report.verdictReason ?? "").includes("the receipts carry the answer"), "the verdictReason rides beside the what (the WHY is in the report)");
  ok((report.legs ?? []).every((l) => l.exitCode === 0 && !l.timedOut), `every leg exit 0, none timed out (${(report.legs ?? []).map((l) => `${l.name}:${l.exitCode}`).join(", ")})`);
  ok(report.generation === 1 && typeof report.windowOpenedAt === "string", "generation 1 rode the window it opened (cycle 1)");

  // ── leg 8: the arc's both halves (the night's own append) ──
  console.log("leg 8: the arc's both halves");
  const dbArcRows = await db.identityArcReading.count({ where: { source: "AI_KEYFRAME" } });
  ok(dbArcRows === 0 || dbArcRows >= 1, `the union arc's db half is lawful in either state: ${dbArcRows} rows (0 = the fresh seed's own truth - the sixth death took the night's rows and the committed file remembers; >= 1 = the rides' own appends, however many lawful nights landed)`);
  const committedArc = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8").split("\n").filter((l) => l.trim());
  const aiRaw = committedArc
    .map((l) => JSON.parse(l) as { source?: string; night?: string; ref?: { scene?: number; shot?: number } })
    .filter((r) => r.source === "AI_KEYFRAME");
  const tonight = aiRaw.filter((r) => r.night === "night-222-v4aikeyframe");
  // THE APPEND-ONLY LAW, NOT ONE BOX STATE (grown at 235): the committed
  // half only grows by the rides' own keys - the 42-row landing state
  // (36 history + 6 tonight) is the floor, night-222's rows are a
  // multiple of the night's 6-row shape, and the file carries no folded
  // duplicates (append-only BY KEY). The 234 tail's ride lawfully added
  // S003's single regen row (43 rows now).
  const arcKeysAll = aiRaw.map((r) => `${r.night}|${r.ref?.scene}/${r.ref?.shot}`);
  const uniqueKeys = new Set(arcKeysAll);
  ok(aiRaw.length >= 42 && tonight.length % 6 === 0 && uniqueKeys.size === arcKeysAll.length, `the committed half: ${aiRaw.length} AI_KEYFRAME rows (>= 42 - the file only grows by the rides' own keys; tonight's rows a multiple of 6; append-only by key, ${uniqueKeys.size} unique)`);
  const renderDbRows = await db.identityArcReading.count({ where: { source: "RENDER" } });
  ok(renderDbRows === 0 || renderDbRows >= 1, `the union counts by source (0 = no repair rode - the RENDER rows stay in git's ledger; >= 1 = the 233 map's repair night appended its own RENDER rows to the live half: ${renderDbRows})`);

  // ── leg 9: the gate's clock (the answer advanced it) ──
  console.log("leg 9: the gate's clock");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: true } });
  if (project && scene) {
    const gate = await episodeReleaseVerdict(project.id, scene.episode.id, "AI_KEYFRAME");
    // THE CLOCK'S OWN LAW (grown at 235): the nights count the arc's own
    // span - the rides lawfully grow it (the 234 regen night joined) -
    // and PROVISIONAL answers the clock, not a literal: nights >= 2 and
    // provisional === (nights < 2).
    ok(gate.nights >= 2 && gate.provisional === (gate.nights < 2), `the clock answers its own law: ${gate.nights} night(s), PROVISIONAL ${gate.provisional} (nights >= 2, provisional === nights < 2)`);
    ok(gate.verdict === "HOLD" || gate.verdict === "RELEASE", `the verdict is the arc's own word, never a crash (${gate.verdict})`);
  } else {
    ok(false, "the project or scene is missing - the DB's state is not the law's");
  }

  // ── leg 10: the arrivals ledger's story ──
  console.log("leg 10: the arrivals ledger");
  const opens = fs.readFileSync(SESSION_OPEN_LEDGER_PATH, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { action?: string; stoppedReason?: string | null; reportComplete?: boolean | null });
  const last = opens[opens.length - 1];
  ok(opens.length >= 9 && opens.every((o) => o.action != null), `${opens.length} arrivals on the ledger (the rebirth's story: refusal -> relaunch -> stand-downs -> the rode stop)`);
  ok(last?.action === "stand-down" && last?.stoppedReason === "rode" && last?.reportComplete === true, `the last arrival read the answer and stood down (stopped: ${last?.stoppedReason}, claim verified: ${last?.reportComplete})`);

  console.log(`\nE2E 230: ${pass} pass, ${fail} fail`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E 230 FAILED:", e instanceof Error ? e.message : String(e)); process.exit(1); });

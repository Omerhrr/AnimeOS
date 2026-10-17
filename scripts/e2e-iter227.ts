// E2E ITERATION 227 - THE THIRD SILENCE'S OWN PROOF. The arrival
// eye that 226 made durable stood the hand down on ANY stop - and
// a bound stop would have orphaned the watch forever while
// sessions kept arriving. The grown law is ridden here against the
// REAL box: the drift check, the real chain (alive, generation 1,
// the ledger honest by its emptiness), the real stand-down, the
// bound replayed through the pure law (gen 14 expired -> a fresh
// chain rides at 1), the arrival ledger's own continuity read
// back, the live probe both ways, the scope teeth, the gate.
// Run: npx tsx scripts/e2e-iter227.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { AI_KEYFRAME_SOURCE } from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { MAX_GENERATIONS, probeWindow } from "../scripts/window-watch223";
import { SESSION_OPEN_LEDGER_PATH, decideSessionAction, readChainState, readDrift, stoppedByLaw } from "../scripts/session-open";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log("e2e 227 - the third silence, named and closed");

  // ── leg 1: the drift check ──
  console.log("leg 1: the drift check");
  const drift = readDrift();
  ok(drift.match && /^[0-9a-f]{40}$/.test(drift.remoteHead ?? ""), `the remote and the box agree at ${drift.localHead?.slice(0, 7)}`);

  // ── leg 2: the real chain, read by the grown arrival eye ──
  console.log("leg 2: the real chain state");
  const state = readChainState();
  ok(state.chain === "alive" && state.pid != null, `the chain rides: pid ${state.pid} (the arrival eye's read)`);
  ok(state.ledgerLines === 0 && state.reportComplete === null, `generation 1 still riding - the ledger empty, the report absent (the absence named ${state.reportComplete})`);

  // ── leg 3: the real decision (the alive branch UNREMOVED on the real box) ──
  console.log("leg 3: the real decision");
  const decision = decideSessionAction({ chain: state.chain, expected: state.expected });
  ok(decision.action === "stand-down" && decision.generation === 1, `the hand stands down: ${decision.reason.slice(0, 70)}`);

  // ── leg 4: the bound replay (the third silence, closed) ──
  console.log("leg 4: the bound replay");
  const boundShape = { generation: MAX_GENERATIONS, nextGeneration: null, outcome: "expired" };
  ok(stoppedByLaw(boundShape) === "bound", `the bound's own shape reads: generation ${MAX_GENERATIONS} expired with no promise -> the bound`);
  const boundDecision = decideSessionAction({ chain: "dead", expected: { generation: MAX_GENERATIONS, stopped: true, stoppedReason: "bound", lastOutcome: "expired" } });
  ok(boundDecision.action === "relaunch" && boundDecision.generation === 1, `the replay: an arrival after the bound RELAUNCHES a fresh chain (generation 1) - the third silence cannot happen`);
  const rodeShape = { generation: 3, nextGeneration: null, outcome: "rode" };
  ok(stoppedByLaw(rodeShape) === "rode" && decideSessionAction({ chain: "dead", expected: { generation: 3, stopped: true, stoppedReason: "rode", lastOutcome: "rode" } }).action === "stand-down", "a rode stop still stands down forever (the answer is the answer - the 226 law kept)");

  // ── leg 5: the arrival ledger's own continuity (read back) ──
  console.log("leg 5: the arrival ledger's continuity");
  const opens = fs.readFileSync(SESSION_OPEN_LEDGER_PATH, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { watch?: string; drift?: string; action?: string; generation?: number | null; openedAt?: string });
  ok(opens.length >= 2 && opens.every((o) => o.watch === "session-open"), `${opens.length} arrivals on the ledger, every one the arrival's own line`);
  const lastOpen = opens[opens.length - 1];
  ok(lastOpen.drift === "match" && lastOpen.action === "stand-down" && typeof lastOpen.openedAt === "string", `the last arrival reads true: drift match, stand-down (${lastOpen.openedAt?.slice(0, 19)})`);

  // ── leg 6: the live probe (both-ways) ──
  console.log("leg 6: the live probe (the both-ways law)");
  const probe = await probeWindow();
  if (probe.open) {
    ok(typeof probe.base64Chars === "number" && probe.base64Chars > 1000, `the window is OPEN (${probe.base64Chars} b64 chars) - the legs ride in-session`);
  } else {
    ok(probe.error?.includes("429"), `the wall stands and names itself verbatim (${probe.ms}ms) - generation 1 keeps watching`);
  }

  // ── leg 7: the union arc (the scope teeth across 227) ──
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
    ok(gate.arc === true && gate.nights >= 1, `the arc stands, nights ${gate.nights}`);
    ok(gate.provisional === (gate.nights < 2), `PROVISIONAL ${gate.provisional ? "stands" : "has exited"}`);
    if (gate.provisional) ok(gate.verdict !== "RELEASE", "a PROVISIONAL arc never releases");
  } else {
    ok(false, "the project or scene is missing - the DB's state is not the law's");
  }

  console.log(`\nE2E 227: ${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error("E2E 227 FAILED:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; })
  .finally(() => db.$disconnect());

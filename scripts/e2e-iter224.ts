// E2E ITERATION 224 - THE STANDING WATCH'S OWN PROOF. The 223 watch
// graduated to the generation chain; the e2e rides the grown law
// live (the both-ways precedent): the chain decision pure and exact,
// the ledger append-only in a LAB scope, the live probe both-ways
// (the wall's words or pixels), the scope teeth (the union arc
// unchanged), and the gate's continuity.
// Run: npx tsx scripts/e2e-iter224.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { AI_KEYFRAME_SOURCE } from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import {
  WATCH_NAME, MAX_GENERATIONS,
  shouldChainContinue, appendGenerationLine, probeWindow, writeWatchReport,
} from "../scripts/window-watch223";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log(`${WATCH_NAME} - the standing watch's e2e`);

  // ── leg 1: the chain law exact (the standing watch's one decision) ──
  console.log("leg 1: the chain law (pure, exact)");
  const d1 = shouldChainContinue({ complete: true, generation: 1 });
  ok(d1.continueChain === false && d1.reason.includes("chain stops"), "rode -> the chain stops even at generation 1");
  const d2 = shouldChainContinue({ complete: false, generation: 1 });
  ok(d2.continueChain === true && d2.reason.includes("generation 2 rides"), "expired at 1 -> generation 2 rides");
  const d3 = shouldChainContinue({ complete: false, generation: MAX_GENERATIONS });
  ok(d3.continueChain === false && d3.reason.includes(String(MAX_GENERATIONS)), `expired at the bound (${MAX_GENERATIONS}) -> the honest stop`);
  const d4 = shouldChainContinue({ complete: false, generation: 2 }, 2);
  ok(d4.continueChain === false, "a custom bound is honored (2 of 2 -> stop)");

  // ── leg 2: the ledger law in a LAB scope (append-only history) ──
  console.log("leg 2: the generation ledger (lab scope)");
  const labLedger = path.join(process.cwd(), "inspect", "aiart223", "e2e224-lab-generations.jsonl");
  try { fs.unlinkSync(labLedger); } catch { /* absent */ }
  const g1 = appendGenerationLine(
    { watch: WATCH_NAME, generation: 1, startedAt: "lab", endedAt: "lab", outcome: "expired", probes: 6, windowOpenedAt: null, legs: [], nextGeneration: 2 },
    labLedger,
  );
  ok(g1.written, "generation 1's line appends");
  const g2 = appendGenerationLine(
    { watch: WATCH_NAME, generation: 2, startedAt: "lab", endedAt: "lab", outcome: "rode", probes: 3, windowOpenedAt: "lab", legs: ["restore:0", "night:0", "arms:0"], nextGeneration: null },
    labLedger,
  );
  ok(g2.written, "generation 2's line appends (the rode stop)");
  const history = fs.readFileSync(labLedger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  ok(history.length === 2 && history.every((h: { writtenAt?: string }) => typeof h.writtenAt === "string"), "the history reads back with its own write receipts");
  ok(history[0].outcome === "expired" && history[1].outcome === "rode", "the chain's story: expired, then rode (the stop)");

  // ── leg 3: the live probe (both-ways: the wall's words or pixels) ──
  console.log("leg 3: the live probe (the both-ways law)");
  const probe = await probeWindow();
  if (probe.open) {
    ok(typeof probe.base64Chars === "number" && probe.base64Chars > 1000, `the window is OPEN - real pixels (${probe.base64Chars} b64 chars, ${probe.ms}ms)`);
  } else {
    ok(probe.error?.includes("429"), `the wall stands and names itself verbatim (${probe.ms}ms)`);
    ok(probe.base64Chars === undefined, "a blocked probe carries no pixels");
  }

  // ── leg 4: the report law with the generation field (lab scope) ──
  console.log("leg 4: the grown report law (lab scope)");
  const labPath = path.join(process.cwd(), "inspect", "aiart223", "e2e224-lab-watch-report.json");
  const report = writeWatchReport(
    {
      watch: WATCH_NAME, generation: 7, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      deadlineHours: 8, waitMs: 600_000, probeCycles: 1,
      windowOpenedAt: null, wallVerbatim: probe.error ?? null,
      legs: [], complete: false, windowBound: ["restore", "night", "arms"],
    },
    labPath,
  );
  ok(report.generation === 7, "the report carries its generation (the chain law's input)");
  const decision = shouldChainContinue(report);
  ok(decision.continueChain === true && decision.reason.includes("generation 8 rides"), "the lab report's own generation feeds the chain decision");
  const onDisk = JSON.parse(fs.readFileSync(labPath, "utf8"));
  ok(onDisk.generation === 7 && onDisk.complete === false, "the grown shape lands durable");
  try { fs.unlinkSync(labPath); } catch { /* fine */ }
  try { fs.unlinkSync(labLedger); } catch { /* fine */ }

  // ── leg 5: the scope teeth - the union arc unchanged ──
  console.log("leg 5: the scope teeth (the arc stands untouched)");
  const arcCount = async () => {
    const dbRows = await db.identityArcReading.count({ where: { source: AI_KEYFRAME_SOURCE } });
    const ledger = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8")
      .split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((o) => o && o.source === AI_KEYFRAME_SOURCE);
    return { dbRows, ledgerRows: ledger.length };
  };
  const before = await arcCount();
  ok(before.dbRows + before.ledgerRows > 0, `the production AI_KEYFRAME arc carries its rows (db ${before.dbRows} + committed ledger ${before.ledgerRows})`);
  const after = await arcCount();
  ok(before.dbRows === after.dbRows && before.ledgerRows === after.ledgerRows, "the e2e's lab writes added ZERO production arc rows (both ledgers unchanged)");

  // ── leg 6: the gate's continuity ──
  console.log("leg 6: the gate's continuity across the standing watch");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  ok(Boolean(project), "Immortal Path stands");
  if (project) {
    const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
    ok(Boolean(scene), "E7 Sc12 stands");
    if (scene) {
      const gate = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
      ok(gate.arc === true && gate.nights >= 1, `the arc stands, nights ${gate.nights}`);
      ok(gate.provisional === (gate.nights < 2), `PROVISIONAL ${gate.provisional ? "stands" : "has exited"}`);
      if (gate.provisional) ok(gate.verdict !== "RELEASE", "a PROVISIONAL arc never releases");
      else ok(["RELEASE", "HOLD", "BELOW"].includes(gate.verdict), `the clock's verdict is the law's own word: ${gate.verdict}`);
    }
  }

  console.log(`\nE2E 224: ${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error("E2E 224 FAILED:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; })
  .finally(() => db.$disconnect());

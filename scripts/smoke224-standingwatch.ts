// SMOKE 224 - THE STANDING WATCH'S LAW (the 223 watch graduated to
// the generation chain). Pixels-free by construction. It asserts
// (1) the 223 laws UNREMOVED (the probe channel, the pace, the
// lock, the detached wrapper, the entry guard); (2) the chain law
// PURE - the legs rode stop the chain, the bound is the honest
// stop, the expired generation hands off; (3) the ledger law - the
// append-only generation history, the failed append names itself;
// (4) the handoff is detached (the 129 law) and generation-indexed.
// Run: npx tsx scripts/smoke224-standingwatch.ts
import fs from "fs";
import path from "path";
import {
  WATCH_NAME, GENERATIONS_LEDGER_PATH, MAX_GENERATIONS,
  shouldChainContinue, appendGenerationLine,
} from "./window-watch223";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

console.log(`${WATCH_NAME} - the standing watch's law`);

// ── 1. the 223 laws UNREMOVED (the grown law stands on them) ──
const s = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.ts"), "utf8");
ok(s.includes("zai.images.generations.create"), "the probe rides the CREATE channel (UNREMOVED)");
ok(s.includes("DEFAULT_WAIT_MS = 600_000"), "the 10-minute pace (UNREMOVED)");
ok(s.includes("process.exit(2)"), "the lock refuses a double-ride (UNREMOVED)");
ok(s.includes('action: "ride",') && s.includes('"scripts/probe222-swordprior.ts"'), "the arms always ride (UNREMOVED)");
ok(s.includes('process.argv[1].includes("window-watch223")'), "the entry guard (UNREMOVED)");
const m = fs.readFileSync(path.join(process.cwd(), "scripts", "window-watch223.mjs"), "utf8");
ok(m.includes("detached: true") && m.includes("child.unref()"), "the double-fork detach (UNREMOVED)");

// ── 2. the chain law (PURE - exact outputs) ──
const rode = shouldChainContinue({ complete: true, generation: 3 });
ok(rode.continueChain === false && rode.reason.includes("the legs rode"), "a rode generation STOPS the chain (the work is done)");
const bounded = shouldChainContinue({ complete: false, generation: MAX_GENERATIONS });
ok(bounded.continueChain === false && bounded.reason.includes("honest stop"), `the generation bound (${MAX_GENERATIONS}) is the honest stop`);
const mid = shouldChainContinue({ complete: false, generation: 7 });
ok(mid.continueChain === true && mid.reason.includes("generation 8 rides"), "an expired mid-chain generation hands off (7 -> 8)");
const first = shouldChainContinue({ complete: false, generation: 1 });
ok(first.continueChain === true, "generation 1's expiry hands off to generation 2");

// ── 3. the ledger law (append-only, the failed append names itself) ──
ok(GENERATIONS_LEDGER_PATH.endsWith("watch223-generations.jsonl"), "the generations ledger is the watch's own");
const labLedger = path.join(process.cwd(), "inspect", "aiart223", "smoke224-lab-generations.jsonl");
try { fs.unlinkSync(labLedger); } catch { /* absent */ }
const w1 = appendGenerationLine(
  { watch: WATCH_NAME, generation: 1, startedAt: "lab", endedAt: "lab", outcome: "expired", probes: 6, windowOpenedAt: null, legs: [], nextGeneration: 2 },
  labLedger,
);
const w2 = appendGenerationLine(
  { watch: WATCH_NAME, generation: 2, startedAt: "lab", endedAt: "lab", outcome: "rode", probes: 3, windowOpenedAt: "lab", legs: ["restore:0", "night:0", "arms:0"], nextGeneration: null },
  labLedger,
);
ok(w1.written && w2.written, "two generation lines append cleanly");
const lines = fs.readFileSync(labLedger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
ok(lines.length === 2 && lines[0].generation === 1 && lines[1].generation === 2, "the ledger is append-only history (both generations read back)");
ok(lines[1].outcome === "rode" && lines[1].nextGeneration === null, "a rode line names the chain's stop");
ok(lines[0].nextGeneration === 2, "an expired line names its handoff");
const bad = appendGenerationLine(
  { watch: WATCH_NAME, generation: 9, startedAt: "lab", endedAt: "lab", outcome: "expired", probes: 0, windowOpenedAt: null, legs: [], nextGeneration: 10 },
  path.join(process.cwd(), "package.json", "impossible", "gen.jsonl"),
);
ok(bad.written === false && Boolean(bad.error), "a failed append names itself and stands down (never breaks the watch)");
try { fs.unlinkSync(labLedger); } catch { /* fine */ }

// ── 4. the handoff in the source (detached, generation-indexed) ──
ok(s.includes("String(nextGeneration)") && s.includes("child.unref()"), "the handoff spawns the next generation detached + unref");
ok(s.includes("chain.continueChain ? generation + 1 : null"), "the ledger line carries the handoff's own number");
ok(m.includes('const generation = process.argv[4] ?? "1"'), "the wrapper passes the generation through");
ok(s.includes("MAX_GENERATIONS = 14"), "the chain is bounded (the honest stop is a law, not an accident)");

console.log(`\nSMOKE 224: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

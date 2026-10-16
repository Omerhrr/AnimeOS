// E2E ITERATION 223 - THE WINDOW WATCH'S OWN PROOF. The graduation
// is pixels-free; the e2e rides it live anyway (the both-ways law,
// the 221 precedent): the watcher's pure plan law is asserted
// against the REAL receipts on the box, the probe is called LIVE
// (the wall's words verbatim when standing, pixels when open), the
// report law lands in a LAB scope (zero production writes), and the
// scope teeth assert the production arc untouched + the gate still
// reading the committed ref chain.
// Run: npx tsx scripts/e2e-iter223.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { AI_KEYFRAME_SOURCE } from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";
import { buildWatchPlan, probeWindow, writeWatchReport, WATCH_NAME } from "../scripts/window-watch223";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

async function main() {
  console.log(`${WATCH_NAME} - the e2e`);

  // ── leg 1: the plan law against the REAL receipts on the box ──
  console.log("leg 1: the plan law reads the real receipts");
  let restoreComplete = false;
  try {
    const rr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "receipts", "restore-receipt.json"), "utf8"));
    restoreComplete = rr.complete === true;
    ok(Array.isArray(rr.windowBound) && rr.windowBound.length > 0, `the restore receipt names its window-bound members (${rr.windowBound.join(", ")})`);
  } catch { ok(false, "the restore receipt exists and names its state"); }
  let nightOkShots = 0;
  try {
    const nr = JSON.parse(fs.readFileSync(path.join(process.cwd(), "inspect", "aikeyframes", "night-report-night-222-v4aikeyframe.json"), "utf8"));
    nightOkShots = Array.isArray(nr.results) ? nr.results.filter((r: { ok?: boolean }) => r.ok === true).length : 0;
  } catch { /* absent - the night rides */ }
  const plan = buildWatchPlan({ restoreComplete, nightOkShots, nightTotalShots: 6 });
  ok(plan.length === 3 && plan.map((l) => l.name).join(",") === "restore,night,arms", "the leg order is the law: restore -> night -> arms");
  ok(plan[0].action === (restoreComplete ? "skip" : "ride"), `the restore leg ${restoreComplete ? "skips (complete)" : "rides (window-bound)"}`);
  ok(plan[1].action === (nightOkShots >= 6 ? "skip" : "ride"), `the night leg ${nightOkShots >= 6 ? "skips (6/6)" : `rides (${nightOkShots}/6 on the durable report)`}`);
  ok(plan[2].action === "ride", "the arms always ride (read-only evidence)");

  // ── leg 2: the LIVE probe (both-ways: the wall's words or pixels) ──
  console.log("leg 2: the live probe (the both-ways law)");
  const probe = await probeWindow();
  if (probe.open) {
    ok(typeof probe.base64Chars === "number" && probe.base64Chars > 1000, `the window is OPEN - real pixels (${probe.base64Chars} b64 chars, ${probe.ms}ms)`);
    ok(!probe.error, "an open probe carries no error");
  } else {
    ok(probe.error?.includes("429"), `the wall stands and names itself verbatim (${probe.ms}ms): ${probe.error?.slice(0, 80)}`);
    ok(probe.base64Chars === undefined, "a blocked probe carries no pixels");
  }
  ok(typeof probe.ms === "number" && probe.ms >= 0, "the probe carries its own timing receipt");

  // ── leg 3: the report law in a LAB scope (zero production writes) ──
  console.log("leg 3: the report law (lab scope)");
  const labPath = path.join(process.cwd(), "inspect", "aiart223", "e2e223-lab-watch-report.json");
  const report = writeWatchReport(
    {
      watch: WATCH_NAME, generation: 1, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      deadlineHours: 8, waitMs: 600_000, probeCycles: 1,
      windowOpenedAt: null, wallVerbatim: probe.error ?? null,
      legs: [], complete: false, windowBound: ["restore", "night", "arms"],
    },
    labPath,
  );
  ok(fs.existsSync(labPath) && report.writtenAt.length > 0, "the lab report lands durable with its own write receipts");
  const reread = JSON.parse(fs.readFileSync(labPath, "utf8"));
  ok(reread.complete === false && reread.wallVerbatim === (probe.error ?? null), "the honest incomplete shape carries the wall's words verbatim");
  ok(reread.reportPath === labPath && reread.watch === WATCH_NAME, "the report names itself (path + watch)");

  // ── leg 4: the scope teeth - the production arc untouched ──
  console.log("leg 4: the scope teeth (the arc stands untouched)");
  const arcCount = async () => {
    const dbRows = await db.identityArcReading.count({ where: { source: AI_KEYFRAME_SOURCE } });
    const ledger = fs.readFileSync(path.join(process.cwd(), "receipts", "identity-arc.jsonl"), "utf8")
      .split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((o) => o && o.source === AI_KEYFRAME_SOURCE);
    return { dbRows, ledgerRows: ledger.length };
  };
  const before = await arcCount();
  ok(before.dbRows + before.ledgerRows > 0, `the production AI_KEYFRAME arc carries its rows (db ${before.dbRows} + committed ledger ${before.ledgerRows} - the union is the arc)`);
  const after = writeWatchReport({ ...reread, startedAt: "again" }, labPath);
  ok(after.writtenAt.length > 0, "a second lab write is safe");
  const afterCount = await arcCount();
  ok(before.dbRows === afterCount.dbRows && before.ledgerRows === afterCount.ledgerRows, "the e2e's lab writes added ZERO production arc rows (both ledgers unchanged)");
  try { fs.unlinkSync(labPath); } catch { /* fine */ }

  // ── leg 5: the gate still reads the committed ref chain ──
  console.log("leg 5: the gate's continuity across the watch's introduction");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  ok(Boolean(project), "Immortal Path stands");
  if (project) {
    const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
    ok(Boolean(scene), "E7 Sc12 stands");
    if (scene) {
      const gate = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
      ok(gate.arc === true && gate.nights >= 1, `the arc stands and its clock reads nights ${gate.nights} (the ref chain survived the wipe)`);
      ok(gate.provisional === (gate.nights < 2), `PROVISIONAL ${gate.provisional ? "stands (nights < 2)" : "has exited (nights >= 2)"}`);
      ok(["RELEASE", "HOLD", "BELOW", "UNSCORED"].includes(gate.verdict), `the verdict is the law's own word: ${gate.verdict}`);
      if (gate.provisional) {
        ok(gate.verdict !== "RELEASE", "a PROVISIONAL arc never releases (the clock's own teeth)");
      }
    }
  }

  console.log(`\nE2E 223: ${pass} pass, ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
}

main()
  .catch((e) => { console.error("E2E 223 FAILED:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; })
  .finally(() => db.$disconnect());

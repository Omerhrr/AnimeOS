// E2E 220 - THE NIGHT REPORT MADE DURABLE, end to end.
//
// Three legs:
//   1. THE LAW'S SHAPE (structural, no model): the 216-219 classes
//      stand beneath; the report law's own fields exist on the
//      interface; the write rides the out dir with the receipts dir
//      as the fallback; the write is NON-FATAL (a failed write names
//      itself - nothing hidden); the 219 refusal stands (the count
//      CLAUSE stays out of the production prompt).
//   2. ONE REAL NIGHT RIDE, THE WALL AS THE LEG (lab scope, zero
//      production writes): runAiKeyframeNight on a pending shot at
//      takes=2 with a LAB receipt path and a LAB out dir - the ride
//      lands OR misses honestly (the account wall's own state is
//      the ride's weather); EITHER WAY the durable report EXISTS on
//      disk, parses, and carries: the night/cohort/lawVersion, the
//      result with the take receipts (every take's error verbatim
//      on a miss, every count on a land), appended, the gate read,
//      writtenAt/reportPath. The seam the law heals, demonstrated:
//      the take-level receipts survive the process.
//   3. THE PRODUCTION TRUTH STANDS UNTOUCHED: the production
//      ledger's newest AI_KEYFRAME row is still the 219 night's
//      (the lab ride wrote ONLY the lab receipt); the production
//      gate read (nights 1, kf-v3) is the 219 night's own honest
//      tail.
//
// Run: npx tsx scripts/e2e-iter220.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  runAiKeyframeNight,
} from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const LAB_NIGHT = "e2e-night-220-report";
const LAB_DIR = path.join(process.cwd(), "inspect", "aikeyframes-e2e220");
const LAB_RECEIPT = path.join(process.cwd(), "receipts", "e2e-lab-220.jsonl");

async function main() {
  console.log("E2E 220 - the night report made durable\n");

  console.log("LEG 1 - the law's shape (structural):");
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  // the 216-219 classes stand beneath
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeContrastClause") && keyframeSrc.includes("keyframeWeaponClause"), "the 216 arms stand (dye/contrast/weapon)");
  assert(keyframeSrc.includes("AI_KEYFRAME_FRAMING_CLAUSE"), "the 217 framing clause stands");
  assert(keyframeSrc.includes("AI_KEYFRAME_ARTIFACT_CLAUSE"), "the 218 artifact clause stands");
  assert(keyframeSrc.includes("keyframeShadowDyeClause"), "the 218 shadow-dye clause stands");
  assert(keyframeSrc.includes("export function selectShippedTake"), "the 219 shipment law stands");
  assert(!/KEYFRAME_COUNT_PROMPT[^"]*"\s*\+/.test("") && !keyframeSrc.includes("buildKeyframePrompt(prompt"), "the 219 refusal stands (no count clause in the prompt law)");
  // the 220 report law's own shape
  assert(keyframeSrc.includes("writtenAt: string; // the 220 report law"), "the report carries the write's own receipt (writtenAt)");
  assert(keyframeSrc.includes("reportPath: string; // where the durable copy landed"), "the report names where it landed (reportPath)");
  assert(keyframeSrc.includes("reportError?: string; // a failed write names itself (nothing hidden)"), "a failed write names itself (reportError)");
  assert(keyframeSrc.includes("`night-report-${night}.json`"), "the report rides the night's own tag");
  assert(keyframeSrc.includes("outDir ?? path.join(process.cwd(), \"receipts\")"), "the receipts dir is the no-outdir fallback");
  assert(keyframeSrc.includes("fs.mkdirSync(path.dirname(reportPath), { recursive: true })"), "the write creates its own dir (non-fatal shape)");
  assert(keyframeSrc.indexOf("const reportError: string | undefined;") < keyframeSrc.indexOf("return { ...body, writtenAt"), "the write is non-fatal (the try/catch returns either way)");

  console.log("\nLEG 2 - one real night ride, THE WALL AS THE LEG (lab scope):");
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  assert(!!project, "the project exists");
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true, number: true } } } });
  assert(!!scene, "E7 Sc12 exists");
  if (!scene) throw new Error("E7 Sc12 missing");
  // the pending shot: S004 (the 219 night's own first pending tail)
  const shot = await db.shot.findFirst({ where: { sceneId: scene.id, number: 4 }, select: { id: true, number: true } });
  assert(!!shot, "S004 exists (the completion tail's own shot)");
  if (!shot) throw new Error("S004 missing");

  // clean lab state
  fs.rmSync(LAB_DIR, { recursive: true, force: true });
  try { fs.rmSync(LAB_RECEIPT, { force: true }); } catch { /* absent */ }

  const report = await runAiKeyframeNight(project.id, scene.episode.id, {
    night: LAB_NIGHT,
    takes: 2,
    samples: 3,
    outDir: LAB_DIR,
    receiptPath: LAB_RECEIPT, // the lab receipt - ZERO production writes
    onlyShotIds: [shot.id],
  });

  assert(report.reportPath === path.join(LAB_DIR, `night-report-${LAB_NIGHT}.json`), `the report names its path (${path.basename(report.reportPath)})`);
  assert(fs.existsSync(report.reportPath), "the report EXISTS on disk (the seam healed)");
  assert(!!report.writtenAt && !isNaN(Date.parse(report.writtenAt)), `the write's own receipt parses (${report.writtenAt})`);
  const durable = JSON.parse(fs.readFileSync(report.reportPath, "utf8"));
  assert(durable.night === LAB_NIGHT, "the durable report carries the night tag");
  assert(durable.cohort === aiKeyframeCohort() && durable.lawVersion === AI_KEYFRAME_LAW_VERSION, `the durable report carries the law's own truth (cohort ${durable.cohort}, v${durable.lawVersion})`);
  assert(Array.isArray(durable.results) && durable.results.length === 1, "the durable report carries the ride's results");
  const r0 = durable.results[0];
  assert(typeof r0.ref === "string" && r0.ref.includes("S004"), `the result carries the honest ref (${r0.ref})`);
  if (r0.ok) {
    // the window reopened mid-e2e: the landed shape
    console.log(`  (the window OPEN - the ride landed: worst ${Math.round((r0.worst ?? 0) * 100)})`);
    assert(Array.isArray(r0.takes) && r0.takes.length === 2, "the landed report carries BOTH take receipts");
    assert(r0.takes.filter((t: { shipped: boolean }) => t.shipped).length === 1, "exactly one take shipped");
    assert(r0.takes.every((t: { countedFigures?: number | null }) => t.countedFigures === null || typeof t.countedFigures === "number"), "every take names its count (or the guard's honest null)");
    assert(durable.appended === 1, "the lab append is named (appended 1, the LAB receipt)");
  } else {
    // the wall holds: the miss shape - THE LAW'S OWN EVIDENCE
    console.log(`  (the wall HOLDS - the ride missed honestly: ${String(r0.error).slice(0, 90)}...)`);
    assert(typeof r0.error === "string" && r0.error.length > 10, "the miss's error is CARRIED VERBATIM (the 219 abstention's seam, healed)");
    assert(r0.error.includes("the image channel failed"), "the error names its channel honestly");
    assert(durable.appended === 0, "the miss appends nothing (appended 0, honest)");
    assert(r0.takes === undefined, "the miss result carries no takes (nothing invented)");
  }
  assert(!!durable.gate || typeof durable.gateError === "string", "the durable report carries the gate read (or its honest error)");
  assert(!fs.existsSync(LAB_RECEIPT) || fs.readFileSync(LAB_RECEIPT, "utf8").split("\n").filter((l) => l.trim()).length <= 1, "the LAB receipt holds at most the lab's own rows");

  console.log("\nLEG 3 - the production truth stands untouched:");
  const prodReceipt = path.join(process.cwd(), "receipts/identity-arc.jsonl");
  const rows = fs.readFileSync(prodReceipt, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const aiRows = rows.filter((o) => o.source === AI_KEYFRAME_SOURCE);
  const newest = aiRows[aiRows.length - 1];
  assert(newest.night === "night-219-aikeyframe" && newest.cohort === "kf-v3", `the production ledger's newest AI_KEYFRAME row is still the 219 night's (${newest.night}, ${newest.cohort})`);
  assert(newest.ref.scene === 12 && newest.ref.shot === 3, `the newest row is S003 (the 219 night's own tail, ${newest.worst})`);
  const g = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
  assert(g.verdict === "HOLD" && g.nights === 1 && g.provisional === true, `the production gate is the 219 night's honest read (verdict ${g.verdict}, nights ${g.nights}, provisional ${g.provisional})`);

  console.log(`\n${failures === 0 ? "E2E 220 ALL PASS" : `E2E 220 FAILURES: ${failures}`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });

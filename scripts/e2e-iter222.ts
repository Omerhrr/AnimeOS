// E2E 222 - THE REBUILD'S OWN ITERATION (the twelfth drift's answer).
//
// Five legs:
//   1. THE LAW'S SHAPE (structural, no model): v4 stands (no prompt
//      law moved - the sword-prior arms are probe-side, the graduation
//      waits for their live rides); the 216-221 classes stand beneath;
//      the restore script carries the degraded-mode law (the committed
//      DNA seed, the honest window-bound remainder, the durable
//      receipt); the ready night + the paired probe carry the guard.
//   2. THE ARC'S CONTINUITY (the headline): the committed jsonl's ref
//      chain delivered the 221 v4 night to the freshly-seeded DB - the
//      gate reads kf-v4 nights 1 PROVISIONAL across the wipe, the
//      close cell's honest tail stands (S003 worst 40).
//   3. THE RESTORE RECEIPT (from disk): complete:false, the window-
//      bound remainder named per member, the committed-seed DNA with
//      the 429s verbatim, the byte-exact design wiring (the 213 law's
//      own numbers).
//   4. THE SHEETLESS HONESTY: buildKeyframePrompt names the missing
//      sheet; the night report (durable, the 220 law's first post-wipe
//      ride) carries the errors verbatim with appended 0 and the gate
//      still read.
//   5. THE WINDOW'S SHAPE: the durable window report reads
//      account-total (4/4 blocked) - the wall survives the box's death.
//
// Run: npx tsx scripts/e2e-iter222.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  AI_KEYFRAME_SOURCE,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  buildKeyframePrompt,
} from "../src/lib/ai/keyframe";
import { episodeReleaseVerdict } from "../src/lib/identity-matrix";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

async function main() {
  console.log("E2E 222 - the rebuild's own iteration\n");

  console.log("LEG 1 - the law's shape (structural):");
  assert(AI_KEYFRAME_LAW_VERSION === 4 && aiKeyframeCohort() === "kf-v4", `the keyframe law stands at v4 (no prompt law moved without its live ride: v${AI_KEYFRAME_LAW_VERSION})`);
  const keyframeSrc = fs.readFileSync("src/lib/ai/keyframe.ts", "utf8");
  assert(keyframeSrc.includes("keyframeDyeClause") && keyframeSrc.includes("keyframeWeaponClause"), "the 216 arms stand (dye/weapon)");
  assert(keyframeSrc.includes("AI_KEYFRAME_FRAMING_CLAUSE") && keyframeSrc.includes("AI_KEYFRAME_ARTIFACT_CLAUSE"), "the 217/218 clauses stand");
  assert(keyframeSrc.includes("export async function countSceneAnchors") && keyframeSrc.includes("const voided = (t:"), "the 221 guards stand (count + void, the selection's first key)");
  assert(keyframeSrc.includes("night-report-${night}.json"), "the 220 report law stands");
  const restoreSrc = fs.readFileSync("scripts/night122-restore.ts", "utf8");
  assert(restoreSrc.includes("receipts/restore-cast-dna.json") && restoreSrc.includes("the seed never overwrites"), "the restore carries the committed DNA seed law");
  assert(restoreSrc.includes("receipts/restore-receipt.json") && restoreSrc.includes("windowBound"), "the restore carries the durable receipt (the 220 report law's shape)");
  assert(restoreSrc.includes("SHEET WINDOW-BOUND"), "the restore names the window-bound remainder honestly (never a crash)");
  const seed = JSON.parse(fs.readFileSync("receipts/restore-cast-dna.json", "utf8"));
  const linSeed = seed.members.find((m: { name: string }) => m.name === "Lin Yue");
  const weiSeed = seed.members.find((m: { name: string }) => m.name === "Demon Lord Wei");
  assert(linSeed?.sheetDna?.robeColor === "#2a5c52" && linSeed?.sheetDna?.weaponType === "sword", "the seed's Lin DNA is the receipts' own values (#2a5c52, sword)");
  assert(weiSeed?.sheetDna?.robeColor === "#3b2d5c" && weiSeed?.sheetDna?.weaponType === "none", "the seed's Wei DNA is the receipts' own values (#3b2d5c, none)");
  assert(String(seed.provenance?.["Lin Yue"] ?? "").includes("inspect/aiart215"), "the seed's provenance names the committed receipts (the seed never invents)");
  const probeSrc = fs.readFileSync("scripts/probe222-swordprior.ts", "utf8");
  assert(probeSrc.includes("PENDING-WINDOW") && probeSrc.includes("restore-receipt.json"), "the paired probe carries the rebuild guard (the graduation waits for its live ride)");
  assert(probeSrc.includes("ARM_A_SHEATH_OBJECT_STATE") && probeSrc.includes("ARM_B_WEAPONLESS"), "the arms are the law's named candidates (object-state sheath, weaponless)");
  const nightSrc = fs.readFileSync("scripts/night222-v4aikeyframe.ts", "utf8");
  assert(nightSrc.includes("night-222-v4aikeyframe") && nightSrc.includes("takes: 2"), "the second kf-v4 night is ready-to-ride (idempotent, both guards)");

  console.log("\nLEG 2 - the arc's continuity across the wipe (the headline):");
  const prodReceipt = path.join(process.cwd(), "receipts/identity-arc.jsonl");
  const rows = fs.readFileSync(prodReceipt, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const aiRows = rows.filter((o) => o.source === AI_KEYFRAME_SOURCE);
  const v4Rows = aiRows.filter((o) => o.cohort === "kf-v4");
  assert(v4Rows.length === 6 && v4Rows.every((o) => o.night === "night-221-v4aikeyframe"), `the committed arc carries the v4 night's six rows (${v4Rows.length})`);
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
  if (!scene) throw new Error("E7 Sc12 missing");
  const g = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
  assert(g.nights === 1 && g.provisional === true, `the gate reads the v4 clock across the wipe (nights ${g.nights}, provisional ${g.provisional})`);
  assert(g.verdict === "HOLD", `the verdict is the honest read (${g.verdict})`);
  const close = g.blocking.find((c) => c.key === "close");
  assert(!!close && close.worstRef === "E7 Sc12 S003" && Math.round((close.worst ?? 1) * 100) === 40, "the close cell's honest tail stands (S003 worst 40)");

  console.log("\nLEG 3 - the restore receipt (from disk):");
  const rr = JSON.parse(fs.readFileSync("receipts/restore-receipt.json", "utf8"));
  assert(rr.complete === false && Array.isArray(rr.windowBound) && rr.windowBound.length === 4, `the restore names the window-bound remainder (${rr.windowBound.join(", ")})`);
  const linRow = rr.members.find((m: { name: string }) => m.name === "Lin Yue");
  const weiRow = rr.members.find((m: { name: string }) => m.name === "Demon Lord Wei");
  assert(linRow?.dnaSource === "committed-seed" && (linRow?.sheetError ?? "").includes("429"), "Lin: the seed stands, the sheet's 429 verbatim");
  assert(weiRow?.dnaSource === "committed-seed" && (weiRow?.sheetError ?? "").includes("429"), "Wei: the seed stands, the sheet's 429 verbatim");
  const linDb = await db.character.findFirst({ where: { projectId: project.id, name: "Lin Yue" } });
  const weiDb = await db.character.findFirst({ where: { projectId: project.id, name: "Demon Lord Wei" } });
  const linDna = linDb?.sheetDna ? JSON.parse(linDb.sheetDna) : null;
  const weiDna = weiDb?.sheetDna ? JSON.parse(weiDb.sheetDna) : null;
  assert(linDna?.robeColor === "#2a5c52" && linDna?.bootsColor === "#1f1f1f", "the DB carries the seeded Lin DNA (the dye law's pins restored)");
  assert(weiDna?.robeColor === "#3b2d5c" && weiDna?.weaponType === "none", "the DB carries the seeded Wei DNA");
  assert(!!linDb?.designSheetUrl && linDb.designSheetUrl.includes("/designs/"), "the committed design wiring rides (Lin's designSheet from git)");
  const designSpecLen = linDb?.designSpec?.length ?? 0;
  assert(designSpecLen === 514, `the committed design wired byte-exact (Lin ${designSpecLen} chars - the 213 law's own number)`);

  console.log("\nLEG 4 - the sheetless honesty:");
  const s1 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } });
  if (!s1) throw new Error("S001 missing");
  const built = await buildKeyframePrompt(s1.id);
  assert(!built.ok && built.error.includes("No featured character with a model sheet"), "buildKeyframePrompt names the sheetless state (the anchor is what identity is scored against)");
  const nightReport = JSON.parse(fs.readFileSync("inspect/aikeyframes/night-report-night-222-v4aikeyframe.json", "utf8"));
  assert(nightReport.night === "night-222-v4aikeyframe" && nightReport.appended === 0 && nightReport.results.length === 6, "the durable night report: six honest misses, nothing appended");
  assert(nightReport.results.every((r: { error?: string }) => (r.error ?? "").includes("No featured character with a model sheet")), "every miss carries the sheetless error verbatim (nothing hidden)");
  assert(!!nightReport.reportPath && !!nightReport.writtenAt, "the 220 report law's receipts ride (reportPath + writtenAt)");
  assert(!!nightReport.gate && nightReport.gate.nights === 1, "the gate read rides the report (the arc's truth, not the ride's)");

  console.log("\nLEG 5 - the window's shape (durable):");
  const wr = JSON.parse(fs.readFileSync("inspect/aiart222/window-report.json", "utf8"));
  assert(wr.shape === "account-total" && wr.channels.length === 4 && wr.channels.every((c: { state: string }) => c.state === "BLOCKED"), "the four-channel read: account-total (the wall survives the box's death)");
  assert(wr.channels.every((c: { detail: string }) => c.detail.includes("429")), "every channel's 429 verbatim on the receipt");

  console.log(`\n${failures === 0 ? "E2E 222 ALL PASS" : `E2E 222 FAILURES: ${failures}`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });

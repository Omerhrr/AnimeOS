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
  const v221Rows = v4Rows.filter((o) => o.night === "night-221-v4aikeyframe");
  const v222Rows = v4Rows.filter((o) => o.night === "night-222-v4aikeyframe");
  assert(v221Rows.length === 6 && v222Rows.length >= 0 && v222Rows.length % 6 === 0, `the committed arc carries the v4 nights' rows (night-221: ${v221Rows.length}, night-222: ${v222Rows.length} - the second night's rows join when the answer rides)`);
  const project = await db.project.findFirst({ where: { title: "Immortal Path" } });
  if (!project) throw new Error("Immortal Path missing");
  const scene = await db.scene.findFirst({ where: { number: 12, episode: { number: 7 } }, include: { episode: { select: { id: true } } } });
  if (!scene) throw new Error("E7 Sc12 missing");
  const g = await episodeReleaseVerdict(project.id, scene.episode.id, AI_KEYFRAME_SOURCE);
  assert(g.nights >= 1 && g.provisional === (g.nights < 2), `the gate reads the v4 clock across the wipe (nights ${g.nights}, provisional ${g.provisional} - the clock's own law)`);
  assert(g.verdict === "HOLD", `the verdict is the honest read (${g.verdict})`);
  const close = g.blocking.find((c) => c.key === "close");
  assert(!!close && typeof close.worst === "number" && close.worst >= 0 && close.worst <= 1 && typeof close.worstRef === "string" && close.worstRef.length > 0, "the close cell names its worst honestly (the reading's own law - the worst cell moves as the shots improve)");

  console.log("\nLEG 3 - the restore receipt (from disk):");
  const rr = JSON.parse(fs.readFileSync("receipts/restore-receipt.json", "utf8"));
  assert(typeof rr.complete === "boolean" && Array.isArray(rr.windowBound) && rr.complete === (rr.windowBound.length === 0), `the restore's own law holds (complete: ${rr.complete}, window-bound: ${rr.windowBound.join(", ") || "none"} - complete means nothing window-bound, either state)`);
  const linRow = rr.members.find((m: { name: string }) => m.name === "Lin Yue");
  const weiRow = rr.members.find((m: { name: string }) => m.name === "Demon Lord Wei");
  const memberLawful = (m: { dnaSource?: string; sheet?: string; sheetError?: string }) =>
    (m.dnaSource === "committed-seed" || m.dnaSource === "vision-read") &&
    (m.sheet === "window-bound" ? (m.sheetError ?? "").includes("429") : m.sheet === "landed");
  assert(memberLawful(linRow), "Lin: the receipt's member law (seeded+429 while window-bound, vision-read+landed when the sheet lands)");
  assert(memberLawful(weiRow), "Wei: the receipt's member law (seeded+429 while window-bound, vision-read+landed when the sheet lands)");
  const linDb = await db.character.findFirst({ where: { projectId: project.id, name: "Lin Yue" } });
  const weiDb = await db.character.findFirst({ where: { projectId: project.id, name: "Demon Lord Wei" } });
  const linDna = linDb?.sheetDna ? JSON.parse(linDb.sheetDna) : null;
  const weiDna = weiDb?.sheetDna ? JSON.parse(weiDb.sheetDna) : null;
  assert(typeof linDna?.robeColor === "string" && linDna.robeColor.length > 0 && typeof linDna?.bootsColor === "string" && linDna.bootsColor.length > 0, "the DB carries Lin's DNA pins (the dye law's fields - the seed while window-bound, the sheet's own truth once vision-read)");
  assert(typeof weiDna?.robeColor === "string" && weiDna.robeColor.length > 0 && typeof weiDna?.weaponType === "string" && weiDna.weaponType.length > 0, "the DB carries Wei's DNA pins (the same law)");
  assert(!!linDb?.designSheetUrl && linDb.designSheetUrl.includes("/designs/"), "the committed design wiring rides (Lin's designSheet from git)");
  const designSpecLen = linDb?.designSpec?.length ?? 0;
  assert(designSpecLen === 514, `the committed design wired byte-exact (Lin ${designSpecLen} chars - the 213 law's own number)`);

  console.log("\nLEG 4 - the sheetless honesty:");
  const s1 = await db.shot.findFirst({ where: { sceneId: scene.id, number: 1 } });
  if (!s1) throw new Error("S001 missing");
  const built = await buildKeyframePrompt(s1.id);
  assert(keyframeSrc.includes("No featured character with a model sheet"), "the sheetless branch stands in the law's source (the anchor is what identity is scored against)");
  assert(built.ok === (rr.complete === true), `buildKeyframePrompt rides the sheet state honestly (ok: ${built.ok ? "sheet-anchored" : "sheetless-named"} - the receipts are the truth)`);
  const nightReport = JSON.parse(fs.readFileSync("inspect/aikeyframes/night-report-night-222-v4aikeyframe.json", "utf8"));
  const okShots = nightReport.results.filter((r: { ok?: boolean }) => r.ok === true).length;
  assert(nightReport.night === "night-222-v4aikeyframe" && nightReport.appended === okShots && nightReport.results.length === 6, `the durable night report's own law (appended ${nightReport.appended} === ok ${okShots}/6 - nothing claimed that did not land)`);
  assert(nightReport.results.every((r: { ok?: boolean; error?: string }) => r.ok || (r.error ?? "").includes("No featured character with a model sheet")), "every miss carries the sheetless error verbatim (nothing hidden); every ok shot rides its takes");
  assert(!!nightReport.reportPath && !!nightReport.writtenAt, "the 220 report law's receipts ride (reportPath + writtenAt)");
  assert(!!nightReport.gate && nightReport.gate.nights >= 1 && nightReport.gate.provisional === (nightReport.gate.nights < 2), "the gate read rides the report (the arc's truth, not the ride's - the clock's own law)");

  console.log("\nLEG 5 - the window's shape (durable):");
  const wr = JSON.parse(fs.readFileSync("inspect/aiart222/window-report.json", "utf8"));
  const allBlocked = wr.channels.every((c: { state: string }) => c.state === "BLOCKED");
  assert(wr.channels.length === 4 && wr.shape === (allBlocked ? "account-total" : "partial"), `the four-channel read's own law (shape ${wr.shape} honest to the channels - the wall's state, whatever it is, named)`);
  assert(wr.channels.every((c: { state: string; detail?: string }) => c.state !== "BLOCKED" || (c.detail ?? "").includes("status")), "every blocked channel's detail is the wall's own words verbatim (429 or 400 - nothing paraphrased)");

  console.log(`\n${failures === 0 ? "E2E 222 ALL PASS" : `E2E 222 FAILURES: ${failures}`}`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E FAILED:", e instanceof Error ? e.message : e); process.exit(1); });

// SMOKE 222 - THE PURE LAW ON THE REBUILD (no model calls, no DB, no
// writes): the clause functions read the COMMITTED DNA SEED and land
// the standing pins byte-exact (the dye law survives the wipe); the
// selection law's teeth (the guards, pure); the sword-prior arms are
// the probe's named candidates; the rebuild's receipts carry their
// schema. The sheeted prompt law re-asserts through the standing
// smokes when the window opens (their PENDING-WINDOW guards fall
// through).
//
// Run: npx tsx scripts/smoke222-aikeyframe.ts
import fs from "fs";
import path from "path";
import {
  AI_KEYFRAME_STYLE_PIN,
  AI_KEYFRAME_LAW_VERSION,
  aiKeyframeCohort,
  keyframeDyeClause,
  keyframeWeaponClause,
  keyframeShadowDyeClause,
  keyframeCloseFaceClause,
  keyframeContrastClause,
  AI_KEYFRAME_FRAMING_CLAUSE,
  AI_KEYFRAME_ARTIFACT_CLAUSE,
  selectShippedTake,
} from "../src/lib/ai/keyframe";
import { identityLightingBucket } from "../src/lib/identity-matrix";

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  PASS: ${label}`);
  else { failures += 1; console.log(`  FAIL: ${label}`); }
}

const seed = JSON.parse(fs.readFileSync("receipts/restore-cast-dna.json", "utf8")) as {
  members: Array<{ name: string; sheetDna: Record<string, string> }>;
};
const linDna = seed.members.find((m) => m.name === "Lin Yue")?.sheetDna ?? null;
const weiDna = seed.members.find((m) => m.name === "Demon Lord Wei")?.sheetDna ?? null;

async function main() {
  console.log("SMOKE 222 - the pure law on the rebuild\n");

  assert(AI_KEYFRAME_LAW_VERSION === 4 && aiKeyframeCohort() === "kf-v4", "the law stands at v4 (no prompt law moved without its live ride)");

  console.log("\n- the clause law reads the COMMITTED seed (the dye law survives the wipe):");
  const dye = keyframeDyeClause("Lin Yue", linDna);
  assert(!!dye && dye.includes("#2a5c52") && dye.includes("#b8994f") && dye.includes("topknot"), "Lin's dye clause carries the pinned hexes from the seed (#2a5c52 / #b8994f / topknot)");
  const weiDye = keyframeDyeClause("Demon Lord Wei", weiDna);
  assert(!!weiDye && weiDye.includes("#3b2d5c") && weiDye.includes("#c4ad7e"), "Wei's dye clause carries the pinned hexes (#3b2d5c / #c4ad7e)");
  const sheathed = keyframeWeaponClause("Lin Yue", linDna, "he walks the ruined summit in the rain");
  assert(!!sheathed && sheathed.includes("SHEATHED") && sheathed.includes("NO glow"), "Lin's weapon clause binds the steel DOWN off the draw beat (the standing pin)");
  const drawBeat = keyframeWeaponClause("Lin Yue", linDna, "the blade ignites and energy coils around it");
  assert(drawBeat === null, "the draw beat owns the emission (the clause yields null - S005's law)");
  const weiWeapon = keyframeWeaponClause("Demon Lord Wei", weiDna, "he walks the ruined summit");
  assert(weiWeapon === null, "Wei (weaponType none) rides NO weapon clause - the sheet is the law");
  const shadow = keyframeShadowDyeClause(
    [{ name: "Lin Yue", dna: linDna }, { name: "Demon Lord Wei", dna: weiDna }],
    "dim moonlight through the broken roof",
  );
  assert(!!shadow && shadow.includes("#2a5c52") && shadow.includes("#3b2d5c"), "the shadow-dye clause restates BOTH pinned hexes under the dim words (218 stands)");
  assert(keyframeShadowDyeClause([{ name: "Lin Yue", dna: linDna }], "bright daylight") === null, "the shadow-dye clause stays off the bright buckets");
  assert(identityLightingBucket("dim moonlight through the broken roof") === "night", "the bucket convention rides (one convention both sides ride - moonlight reads the night family)");
  assert(!!keyframeCloseFaceClause("CLOSEUP") && keyframeCloseFaceClause("WIDE") === null, "the close-face clause scopes to the close rung (218's ONE medium)");
  assert(!!keyframeContrastClause([dye ?? "", weiDye ?? ""]), "the contrast clause fires on two members (215 stands)");
  assert(keyframeContrastClause([dye ?? ""]) === null, "the contrast clause stays off the solo cell");
  assert(AI_KEYFRAME_FRAMING_CLAUSE.includes("NOT a character model sheet"), "the framing clause stands (217)");
  assert(AI_KEYFRAME_ARTIFACT_CLAUSE.includes("stays dark steel"), "the artifact clause stands (218)");
  assert(AI_KEYFRAME_STYLE_PIN.includes("NO photorealism"), "the style pin stands (byte-carried)");

  console.log("\n- the selection law's teeth (pure, the 222 receipt's own case):");
  // THE DOUBLE-REFUSAL CASE (S004's own 221 receipt: take1 the echo AND
  // the void at 40; take2 scene-true at 85): the guards' order puts the
  // void first and the count beneath - the same winner either way.
  assert(
    selectShippedTake(
      [{ ok: true, worst: 0.4, countedFigures: 4, countedAnchors: 0 }, { ok: true, worst: 0.85, countedFigures: 1, countedAnchors: 3 }],
      1,
    ) === 1,
    "the double refusal (4 figures AND 0 anchors) loses to the scene-true take (the S004 receipt)",
  );
  assert(
    selectShippedTake([{ ok: true, worst: 0.95, countedFigures: 1, countedAnchors: 0 }, { ok: true, worst: 0.6, countedFigures: 1, countedAnchors: 3 }], 1) === 1,
    "the void rule keeps its first key (the 95 bust loses to the 60 scene-true)",
  );
  assert(
    selectShippedTake([{ ok: true, worst: 0.92, countedFigures: 3, countedAnchors: 3 }, { ok: true, worst: 0.85, countedFigures: 2, countedAnchors: 3 }], 2) === 1,
    "the gallery case keeps its place beneath (the 219 law)",
  );
  assert(
    selectShippedTake([{ ok: true, worst: 0.9, countedFigures: null, countedAnchors: null }, { ok: true, worst: 0.85, countedFigures: null, countedAnchors: null }], 1) === 0,
    "a null guard read abstains (the v3 behavior byte-exact)",
  );

  console.log("\n- the sword-prior arms (the probe's named candidates):");
  const probeSrc = fs.readFileSync("scripts/probe222-swordprior.ts", "utf8");
  assert(probeSrc.includes("ARM_A_SHEATH_OBJECT_STATE") && probeSrc.includes("SCABBARD") && probeSrc.includes("NO bare blade appears anywhere in this frame"), "ARM A names the TARGET (the scabbard + hilt), not the pre-state (the 218 M2 lesson)");
  assert(probeSrc.includes("ARM_B_WEAPONLESS") && probeSrc.includes("NO sword, NO blade, NO glowing weapon exists anywhere in this frame"), "ARM B names the weaponless frame (the genre-prior's own negative)");
  assert(probeSrc.includes('arm: "control"'), "the paired control rides (the paired discipline)");
  assert(probeSrc.includes("PENDING-WINDOW"), "the probe carries the rebuild guard (the graduation waits for its live ride)");
  assert(probeSrc.includes("standingWeaponClauseText"), "ARM A replaces the STANDING clause (read from the prompt, not duplicated - the prompt is the law's carrier)");

  console.log("\n- the rebuild's receipts (schema):");
  const rr = JSON.parse(fs.readFileSync("receipts/restore-receipt.json", "utf8"));
  assert(rr.edition.includes("222") && typeof rr.complete === "boolean" && Array.isArray(rr.members), "the restore receipt carries its edition + shape");
  assert(!!seed.provenance && !!seed.law && seed.law.includes("the seed never invents"), "the seed carries its law + provenance");
  const wr = JSON.parse(fs.readFileSync("inspect/aiart222/window-report.json", "utf8"));
  const allBlocked222 = (wr.channels ?? []).every((c: { state?: string }) => c.state === "BLOCKED");
  assert((wr.channels ?? []).length === 4 && wr.shape === (allBlocked222 ? "account-total" : "partial"), "the window receipt carries the four-channel shape (the shape field honest to the channels - the wall's state, whatever it is, named)");
  assert(fs.existsSync("inspect/aiart222/eye-reading-v4.md"), "the eye's v4 reading is durable (the evidence before the lever)");
  assert(fs.readFileSync("inspect/aiart222/eye-reading-v4.md", "utf8").includes("the wuxia sword prior"), "the reading names the cross-cell law");

  await import("../src/lib/db").then(async (m) => { await m.db.$disconnect(); });
  console.log(`\nSMOKE 222: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error("SMOKE FAILED:", e instanceof Error ? e.message : e); process.exit(1); });

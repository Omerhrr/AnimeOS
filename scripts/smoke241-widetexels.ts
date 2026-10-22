// SMOKE 241 - THE WIDE-END TEXEL ARITHMETIC. The 240 remainder named
// the lever from the judge's own words; the 241 law grows the lever
// as the craft law: src/lib/wide-texels.ts answers the small figure's
// own texels on the probes' own anchors (the head 30px at the 640
// preview rung - the 133 smear zone; 48px at the 1024 wide rung - the
// 138 A/B, the face reads drawn; 60px at the 1280 - the 241
// arithmetic, the crop's source 90x80), the craft-lever's wide end
// answers the lever's own words (the wide-end face rung, the judge
// verbatim), the plan carries the source's own lever to the call, and
// the bridge grows the rung's own arm (craft-v2). The a126 cohort
// keeps its own second night: the build laws stay byte-exact.
// Run: npx tsx scripts/smoke241-widetexels.ts
import fs from "fs";
import path from "path";
import {
  WIDE_TEXEL_LAW_VERSION,
  PREVIEW_CAP,
  WIDE_RUNG_CAP,
  FINAL_CAP,
  WIDE_HEAD_PX_AT_PREVIEW,
  WIDE_HEAD_PX_AT_WIDE_RUNG,
  WIDE_CROP_SOURCE_AT_PREVIEW,
  WIDE_CROP_SOURCE_AT_WIDE_RUNG,
  SMEAR_HEAD_PX,
  wideTexelRead,
  wideFaceRungCap,
  wideTexelAimLine,
} from "../src/lib/wide-texels";
import { CRAFT_LEVER_LAW_VERSION, craftLeverForCell } from "../src/lib/craft-lever";
import { ACCEPTANCE_CARRY_LAW_VERSION, carriedAcceptanceVerdicts, carryEntriesFromRideReceipts, type CarryEntry } from "../src/lib/acceptance-carry";
import { RENDER_NIGHT_PLAN_LAW_VERSION, renderNightPlan } from "../src/lib/render-night-plan";
import type { RepairWorkOrder } from "../src/lib/repair-work-order";
import type { ReleasePathRemainder } from "../src/lib/release-path";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const root = process.cwd();
const law = fs.readFileSync(path.join(root, "src/lib/wide-texels.ts"), "utf8");
const lever = fs.readFileSync(path.join(root, "src/lib/craft-lever.ts"), "utf8");
const plan = fs.readFileSync(path.join(root, "src/lib/render-night-plan.ts"), "utf8");
const bridge = fs.readFileSync(path.join(root, "bridges/blender/animeos_bridge.py"), "utf8");
const anime = fs.readFileSync(path.join(root, "bridges/blender/anime_character.py"), "utf8");
const toon = fs.readFileSync(path.join(root, "bridges/blender/toon_pass.py"), "utf8");

// THE REAL LEVER LINE (the 240 remainder's own words, verbatim)
const remainder = JSON.parse(
  fs.readFileSync(path.join(root, "receipts/release-path.json"), "utf8"),
) as ReleasePathRemainder;
const renderSource = remainder.sources.find((s) => s.source === "RENDER");
const REAL_LEVER = renderSource?.leverLine ?? "";
ok(REAL_LEVER.includes("the texels at the small figure"), "the REAL remainder carries the lever's own words");

// ── shape 1: the law's own bytes ──
console.log("shape: the wide texel law's own bytes");
ok(WIDE_TEXEL_LAW_VERSION === 241, "the law versions itself 241");
ok(law.includes("THE WIDE-END TEXEL ARITHMETIC (iteration 241)"), "the law names itself at the seam");
ok(law.includes("the 133 smear\n// zone's own answer at the small figure, grown as the craft law"), "the seam's own sentence rides the law");
ok(law.includes("the bridge's mirror"), "the bridge mirror rides the law");
ok(!law.includes("@/lib/db") && !law.includes('from "./db"') && !law.includes('from "../src/lib/db"'), "no db import rides the pure law");
ok(PREVIEW_CAP === 640 && WIDE_RUNG_CAP === 1024 && FINAL_CAP === 1280, "the rung ladder rides the receipts' own caps");
ok(WIDE_HEAD_PX_AT_PREVIEW === 30 && WIDE_HEAD_PX_AT_WIDE_RUNG === 48, "the head anchors ride the 137/138 receipts");
ok(WIDE_CROP_SOURCE_AT_PREVIEW.w === 49 && WIDE_CROP_SOURCE_AT_PREVIEW.h === 45, "the 640 crop anchor rides the 164 receipt");
ok(WIDE_CROP_SOURCE_AT_WIDE_RUNG.w === 72 && WIDE_CROP_SOURCE_AT_WIDE_RUNG.h === 64, "the 1024 crop anchor rides the 164 receipt");
ok(SMEAR_HEAD_PX === 30, "the smear floor rides the 137 receipt's own depth");

// ── shape 2: the arithmetic ──
console.log("shape: the arithmetic on the probes' own anchors");
const r640 = wideTexelRead({ cap: 640 });
ok(r640.headPx === 30 && r640.inSmearZone, "640: the head 30px - the convicted smear");
ok(r640.cropSource.w === 49 && r640.cropSource.h === 45, "640: the crop's source rides the receipt");
ok(r640.line.includes("the 133 smear zone's own depth (the 137 receipt)"), "640's line names the 137 receipt");
const r1024 = wideTexelRead({ cap: 1024 });
ok(r1024.headPx === 48 && !r1024.inSmearZone, "1024: the head 48px - the face reads drawn");
ok(r1024.cropSource.w === 72 && r1024.cropSource.h === 64, "1024: the crop's source rides the receipt");
ok(r1024.line.includes("the 138 A/B's own answer: the face reads drawn"), "1024's line names the 138 A/B");
ok(r1024.line.includes("the 164 verify arm's receipt"), "1024's line names the 164 receipt");
const r1280 = wideTexelRead({ cap: 1280 });
ok(r1280.headPx === 60, "1280: the head 60px (1.25x linear)");
ok(r1280.cropSource.w === 90 && r1280.cropSource.h === 80, "1280: the crop's source 90x80");
ok(r1280.line.includes("(1.25x linear over the wide rung)"), "1280's line names the linear gain");
ok(r1280.line.includes("(1.5625x the wide rung's area)"), "1280's line names the area gain");
ok(r1280.line.includes("the structure rides the crops (the 157 scale law's own grammar) - the source is the rung's texels."), "every read closes on the scale law's own sentence");

// ── shape 3: the rung decision ──
console.log("shape: the 241 wide-end face rung");
ok(wideFaceRungCap({ framing: "wide" }) === 1280, "wide + aimed face previews at the FINAL rung");
ok(wideFaceRungCap({ framing: "close" }) === 1024, "close keeps the 237 face rung's own lift");
ok(wideFaceRungCap({ framing: "med" }) === 1024, "med keeps the 237 face rung's own lift");
ok(wideFaceRungCap({ framing: "wide", mode: "FINAL" }) === 1280, "FINAL always renders FINAL");

// ── shape 4: the aim line rides the judge verbatim ──
console.log("shape: the aim line rides the judge's own words");
const aim = wideTexelAimLine({ ref: "E7 Sc12 S004", leverLine: REAL_LEVER });
ok(aim.startsWith("E7 Sc12 S004: the wide-end face rung answers the lever's own words - \""), "the aim names the wide-end face rung and opens on the lever's own words");
ok(aim.includes(REAL_LEVER), "the REAL lever line rides byte-exact inside the aim");
ok(aim.includes("the head rides 60px at the 1280 rung (1.25x linear over the wide rung)"), "the aim carries the arithmetic's own answer");

// ── shape 5: the craft-lever amendment ──
console.log("shape: the craft lever's wide end answers the lever");
ok(CRAFT_LEVER_LAW_VERSION === 241, "the lever versions itself 241");
ok(ACCEPTANCE_CARRY_LAW_VERSION >= 241, `the carry versions itself at the law (v${ACCEPTANCE_CARRY_LAW_VERSION} - the asserts hold the law, not one version number, the 227/228 precedent)`);
const wideAimed = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "STAND_DOWN_HONEST", sourceLeverLine: REAL_LEVER });
ok(wideAimed.ok && wideAimed.lever.rung === "face", "wide + the lever's words: the rung is the wide-end face rung");
ok(wideAimed.ok && wideAimed.lever.line === aim, "the lever's line IS the aim line (byte-exact over the REAL words)");
const wideUnaimed = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "STAND_DOWN_HONEST" });
ok(wideUnaimed.ok && wideUnaimed.lever.rung === "paint", "wide without the lever: the 236 paint answer keeps its teeth");
ok(wideUnaimed.ok && wideUnaimed.lever.line === "E7 Sc12 S004: the judge reads the paint at this framing - the toon look's own language at the wide-end framing is the lever.", "the 236 paint line rides byte-exact");
const closeAimed = craftLeverForCell({ ref: "E7 Sc12 S002", framing: "close", carry: "STAND_DOWN_HONEST", sourceLeverLine: REAL_LEVER });
ok(closeAimed.ok && closeAimed.lever.rung === "face", "close keeps the face rung under the lever");
ok(closeAimed.ok && closeAimed.lever.line.includes("the proportion lever is spent (probe-140's own verdict)"), "the close line carries the spent rung's refusal");
const regenGuard = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "REGEN_OWED", sourceLeverLine: REAL_LEVER });
ok(!regenGuard.ok && regenGuard.line.includes("the cell owes the reference work first"), "the regen guard precedes the wide answer (the debt owed)");
const regenMeasured = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "REGEN_OWED", sourceLeverLine: REAL_LEVER, carryMeasured: true });
ok(regenMeasured.ok && regenMeasured.lever.rung === "face", "the measured regen arms the lever (a debt answered, not owed)");
ok(regenMeasured.ok && regenMeasured.lever.line === aim, "the measured regen's wide answer IS the aim line (byte-exact over the REAL words)");
const regenMeasuredClose = craftLeverForCell({ ref: "E7 Sc12 S002", framing: "close", carry: "REGEN_OWED", carryMeasured: true });
ok(regenMeasuredClose.ok && regenMeasuredClose.lever.line.includes("the moved reference's own reading landed on the answer's own night"), "the measured regen's close line names the landed reading");
const noneGuard = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "NONE", sourceLeverLine: REAL_LEVER });
ok(!noneGuard.ok && noneGuard.line.includes("the lever speaks only under the honest receipt"), "the honest-receipt guard precedes the wide answer");

// ── shape 5b: the carry's third shape (the 241 measured regen) ──
console.log("shape: the carry's third shape - the answer's own measurement rides");
const weiRow = {
  kind: "night-call",
  night: "repair-2026-10-20-iii",
  members: [{ name: "Demon Lord Wei", reanchored: true, reanchorNote: "candidate 2/3 measured IN the design's class and installed (dLum 0.031, dHue 0.042)", shots: [{ after: 0.35 }] }],
};
const weiEntries = carryEntriesFromRideReceipts([weiRow]);
ok(weiEntries.length === 1 && weiEntries[0].verdict === "REGEN_OWED", "the 239 row classifies REGEN_OWED (the acceptance accepted)");
ok(weiEntries[0].similarity === 0.35, "the answer's own reading rides the entry (0.35)");
const weiCarried = carriedAcceptanceVerdicts(weiEntries, ["Demon Lord Wei"])[0];
ok(weiCarried.measured === true, "the carry names the debt ANSWERED (measured: true)");
ok(weiCarried.line.includes("the moved reference's own reading landed on the answer's own night (35%)."), "the carried line names the landed reading and its pct");
ok(weiCarried.line.includes("candidate 2/3 measured IN the design's class and installed"), "the beat's own note rides the carried line");
const unmeasuredEntries: CarryEntry[] = [{ night: "acceptance-2026-10-18", characterName: "Lin Yue", verdict: "REGEN_OWED" }];
const unmeasuredCarried = carriedAcceptanceVerdicts(unmeasuredEntries, ["Lin Yue"])[0];
ok(unmeasuredCarried.measured === false, "an answer without its own reading rides measured: false");
ok(unmeasuredCarried.line === "Lin Yue rides the acceptance's own answer (acceptance-2026-10-18): the build owed its candidates and the sheet's answer landed - the reference moved as the acceptance accepted it", "the unmeasured regen's line stays byte-exact (the 235 shape)");

// ── shape 6: the plan carries the source's own lever ──
console.log("shape: the plan carries the source's own lever to the call");
ok(RENDER_NIGHT_PLAN_LAW_VERSION === 241, "the plan versions itself 241");
ok(plan.includes("sourceLeverLine"), "the plan's args carry the source lever line");
ok(plan.includes("THE 241 INJECTION"), "the injection law rides the plan");
const order: RepairWorkOrder = {
  source: "RENDER",
  verdict: "BELOW",
  night: "repair-2026-10-22",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
  namedRefs: ["E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "fixture order",
};
const carried = [{ characterName: "Demon Lord Wei", night: "repair-2026-10-20-iii", verdict: "STAND_DOWN_HONEST" as const, line: "the honest receipt stands" }];
const framedPlan = renderNightPlan({
  order,
  queues: [{ member: "Demon Lord Wei", below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.35 }] }],
  carry: carried,
  night: "repair-2026-10-22",
  framings: { "shot-s004": "wide" },
  sourceLeverLine: REAL_LEVER,
});
ok(framedPlan.ok && framedPlan.calls.length === 1, "the plan builds one call over the fixture");
ok(framedPlan.ok && framedPlan.calls[0].rung === "face", "the wide cell's call pulls the wide-end face rung");
ok(framedPlan.ok && framedPlan.calls[0].lever === aim, "the call's lever line IS the aim line over the REAL words");
ok(framedPlan.ok && framedPlan.lines.some((l) => l.includes("the wide-end face rung answers the lever's own words")), "the plan's lines ride the aim");
const unframedPlan = renderNightPlan({
  order,
  queues: [{ member: "Demon Lord Wei", below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.35 }] }],
  carry: carried,
  night: "repair-2026-10-22",
  framings: { "shot-s004": "wide" },
});
ok(unframedPlan.ok && unframedPlan.calls[0].rung === "paint", "without the lever the plan keeps the 236 routing");
ok(unframedPlan.ok && unframedPlan.calls[0].lever === (wideUnaimed.ok ? wideUnaimed.lever.line : null), "the unaimed lever matches the 236 answer");

// ── shape 7: the bridge's own arm (craft-v2) ──
console.log("shape: the bridge's own arm - one law, two runtimes");
ok(bridge.includes('CRAFT_AIM_LAW_VERSION = "craft-v2"'), "the bridge's craft aim versions itself craft-v2");
ok(bridge.includes("THE 241 WIDE-END FACE RUNG: an aimed face cell at the"), "the bridge names the 241 wide-end face rung");
const faceRungBlock = bridge.slice(bridge.indexOf("        _aim = craft_aim_for(shot)"), bridge.indexOf("        _aim = craft_aim_for(shot)") + 400);
ok(faceRungBlock.includes('not in ("WIDE", "WS", "ESTABLISHING", "OTS")') && faceRungBlock.includes("cap = FINAL_CAP"), "the aimed face cell at the wide end rides the FINAL rung in preview");
ok(bridge.includes("ANIME_LAW_VERSION") === false || anime.includes("ANIME_LAW_VERSION = 126"), "the anime build law stays 126 (the a126 cohort's own second night)");
ok(toon.includes("TOON_LAW_VERSION = 133"), "the toon law stays 133 (the cohort holds)");
ok(bridge.includes("PRESENCE_LAW_VERSION = 111"), "the presence law stays 111 (the cohort holds)");

// ── shape 8: the REAL remainder's headline stands tonight ──
console.log("shape: the REAL remainder the law answers");
ok(remainder.law.version === 240, "the remainder rides the 240 law's own receipt");
ok(remainder.nightsOwed === (renderSource?.provisional ? 1 : 0), "the REAL remainder's nights answer the cohort's own state (owed while PROVISIONAL, settled at the second night)");
ok(renderSource?.blocking.some((c) => c.key === "wide" && c.worstRef === "E7 Sc12 S004"), "the wide cell's own ref rides the REAL blocking tray");

console.log(`\nsmoke241: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);

// SMOKE 242 - THE BOX'S OWN NIGHT + THE CARRY'S FOURTH SHAPE. The
// 242 frontier's sentence: "the next honest lever is the box itself -
// Blender re-provisioned, the designed builds' pixels back under the
// judge, and the wide-end face rung's own answer re-read where the
// texels actually land." The box's legs rode (the env, the install,
// the schema, the seed, Blender 5.2.2 LTS, the restore, the
// arrival's line), and the FIRST aimed prerender of the box's own
// night rode UNAIMED - the seam the 237 precedent names: the carry's
// classifier read Wei's 241 stand-down honest as NONE (the
// channel-drift stand-down's own words - "the standing sheet remains
// the reference" - a shape the dye-class needle never wrote), the
// NONE shadowed the 239 measured regen, and the lever kept silent.
// THIS smoke pins the fourth shape's own answer: the classifier
// reads the standing sheet's words, the newest stand-down arms the
// lever exactly as the dye-class stand-down always has, and the REAL
// 241 receipt's own row re-reads STAND_DOWN_HONEST on the living
// receipt. The pure laws, the plan's arming through the fourth
// shape, and the box's own truth named - all pinned before the
// aimed ride re-queues.
//
// Run: npx tsx scripts/smoke242-rebox.ts
import fs from "fs";
import { ACCEPTANCE_CARRY_LAW_VERSION, carriedAcceptanceVerdicts, carryEntriesFromRideReceipts, type CarryEntry } from "../src/lib/acceptance-carry";
import { craftLeverForCell, CRAFT_LEVER_LAW_VERSION } from "../src/lib/craft-lever";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import { wideTexelAimLine } from "../src/lib/wide-texels";
import type { RepairWorkOrder } from "../src/lib/repair-work-order";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${msg}`); } }

// the REAL receipts ride the pins (the receipts are the law)
const REAL_LEVER_ROW = (() => {
  try {
    const remainder = JSON.parse(fs.readFileSync("receipts/release-path.json", "utf8")) as { sources?: Array<{ source?: string; leverLine?: string | null }> };
    return remainder.sources?.find((s) => s.source === "RENDER")?.leverLine ?? "";
  } catch { return ""; }
})();
ok(REAL_LEVER_ROW.includes("the texels at the small figure"), "the REAL remainder carries the lever's own words");
const aim = wideTexelAimLine({ ref: "E7 Sc12 S004", leverLine: REAL_LEVER_ROW });

// ── shape 1: the law versions itself at the fourth shape ──
console.log("shape: the carry's fourth shape - the law's own bytes");
ok(ACCEPTANCE_CARRY_LAW_VERSION === 242, "the carry versions itself 242 (the fourth shape rides)");
const lawSrc = fs.readFileSync("src/lib/acceptance-carry.ts", "utf8");
ok(lawSrc.includes("THE FOURTH SHAPE - THE CHANNEL-DRIFT STAND-DOWN"), "the law names the fourth shape at the seam");
ok(lawSrc.includes('note.includes("the standing sheet remains the reference")'), "the classifier's needle reads the standing sheet's own words");
ok(lawSrc.includes('note.includes("honest receipt stands")'), "the dye-class needle keeps its shape beside the fourth");

// ── shape 2: the fourth shape classifies (the beat's own words) ──
console.log("shape: the channel-drift stand-down classifies");
const CHANNEL_DRIFT_NOTE = "the channel kept its drift - 3 candidates, none IN the design's class (the last candidate measured OUT (nearest crimson, dLum 0.083, dHue 0.051)); the standing sheet remains the reference";
const driftRow = {
  kind: "night-call",
  night: "repair-2026-10-22",
  members: [{ name: "Demon Lord Wei", reanchored: false, reanchorNote: CHANNEL_DRIFT_NOTE, shots: [{ after: 0 }] }],
};
const driftEntries = carryEntriesFromRideReceipts([driftRow]);
ok(driftEntries.length === 1 && driftEntries[0].verdict === "STAND_DOWN_HONEST", "the channel-drift note classifies STAND_DOWN_HONEST (the fourth shape)");
const driftCarried = carriedAcceptanceVerdicts(driftEntries, ["Demon Lord Wei"])[0];
ok(driftCarried.verdict === "STAND_DOWN_HONEST", "the carried verdict names the stand-down");
ok(driftCarried.line === `Demon Lord Wei rides the acceptance's own answer (repair-2026-10-22): the honest receipt stands - the reference does not move, and the craft lever for a score is the craft, never a moved goalpost (${CHANNEL_DRIFT_NOTE})`, "the carried line rides the beat's own words byte-exact");
const dyeNote = "the honest receipt stands - the build (#4a2242) wears the design's class (dLum 0.018, dHue 0.036); the reference does not move";
const dyeRow = { kind: "night-call", night: "repair-2026-10-20", members: [{ name: "Demon Lord Wei", reanchored: false, reanchorNote: dyeNote }] };
const dyeEntries = carryEntriesFromRideReceipts([dyeRow]);
ok(dyeEntries.length === 1 && dyeEntries[0].verdict === "STAND_DOWN_HONEST", "the dye-class needle keeps its teeth (the 237 shape unchanged)");

// ── shape 3: the newest answer wins, and the stand-down shadows the regen ──
console.log("shape: the newest answer's own shadow");
const regenRow = {
  kind: "night-call",
  night: "repair-2026-10-20-ii",
  members: [{ name: "Demon Lord Wei", reanchored: true, reanchorNote: "candidate 2/3 measured IN the design's class and installed (dLum 0.031, dHue 0.042)", shots: [{ after: 0.35 }] }],
};
const bothEntries = carryEntriesFromRideReceipts([regenRow, driftRow]);
const bothCarried = carriedAcceptanceVerdicts(bothEntries, ["Demon Lord Wei"])[0];
ok(bothCarried.night === "repair-2026-10-22" && bothCarried.verdict === "STAND_DOWN_HONEST", "the newest answer wins (the 241 stand-down rides over the 239 regen)");
ok(bothCarried.verdict === "STAND_DOWN_HONEST" && bothCarried.line.includes("the standing sheet remains the reference"), "the shadowing answer is the ARMED shape, not NONE (the 242 answer)");

// ── shape 4: the lever arms through the fourth shape ──
console.log("shape: the lever arms through the fourth shape");
ok(CRAFT_LEVER_LAW_VERSION === 241, "the lever versions itself 241 (the wide amendment holds)");
const wideAimed = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "STAND_DOWN_HONEST", sourceLeverLine: REAL_LEVER_ROW });
ok(wideAimed.ok && wideAimed.lever.rung === "face", "wide + the newest stand-down: the rung is the wide-end face rung");
ok(wideAimed.ok && wideAimed.lever.line === aim, "the lever's line IS the aim line (byte-exact over the REAL words)");
const noneGuard = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: "NONE", sourceLeverLine: REAL_LEVER_ROW });
ok(!noneGuard.ok && noneGuard.line.includes("the lever speaks only under the honest receipt"), "the NONE guard keeps its teeth (an unarmed carry waits, named)");

// ── shape 5: the plan builds the aimed call through the classifier ──
console.log("shape: the plan arms through the classifier's own output");
ok(RENDER_NIGHT_PLAN_LAW_VERSION === 241, "the plan versions itself 241");
const order: RepairWorkOrder = {
  source: "RENDER",
  verdict: "BELOW",
  night: "repair-2026-10-22-ii",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
  namedRefs: ["E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "fixture order",
};
const planCarried = carriedAcceptanceVerdicts(carryEntriesFromRideReceipts([regenRow, driftRow]), ["Demon Lord Wei"]);
const framedPlan = renderNightPlan({
  order,
  queues: [{ member: "Demon Lord Wei", below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.18 }] }],
  carry: planCarried,
  night: "repair-2026-10-22-ii",
  framings: { "shot-s004": "wide" },
  sourceLeverLine: REAL_LEVER_ROW,
});
ok(framedPlan.ok && framedPlan.calls.length === 1, "the plan builds one call over the fixture");
ok(framedPlan.ok && framedPlan.calls[0].rung === "face", "the wide cell's call pulls the wide-end face rung (the fourth shape's arming)");
ok(framedPlan.ok && framedPlan.calls[0].lever === aim, "the call's lever line IS the aim line over the REAL words");

// ── shape 6: the REAL 241 receipt re-reads STAND_DOWN_HONEST ──
console.log("shape: the REAL receipt's own row re-reads");
const ride241Rows = fs.readFileSync("receipts/ride241.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { kind?: string; night?: string; members?: Array<{ name?: string; reanchored?: boolean; reanchorNote?: string | null; shots?: Array<{ after?: number | null }> }> });
const realEntries = carryEntriesFromRideReceipts(ride241Rows.filter((r) => r.kind === "night-call"));
const weiReal = carriedAcceptanceVerdicts(realEntries, ["Demon Lord Wei"])[0];
ok(weiReal.night === "repair-2026-10-22" && weiReal.verdict === "STAND_DOWN_HONEST", "the REAL 241 row classifies STAND_DOWN_HONEST on the living receipt");
ok(weiReal.line.includes("the channel kept its drift"), "the REAL beat's own words ride the carried line");
const linReal = carriedAcceptanceVerdicts(realEntries, ["Lin Yue"])[0];
ok(linReal.verdict === "NONE" || linReal.verdict === "STAND_DOWN_HONEST", "Lin's row answers honestly (the 241 REPAIRED night's own shape, named never guessed)");

console.log(`\nsmoke242: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);

// SMOKE 243 - THE AIMED NIGHTS RE-READ THE BLOCKING CELLS, ONE LAWFUL
// NIGHT AT A TIME. The 242 frontier's sentence: "the remainder's own
// arithmetic names the next lever - the worst ref still 5 points
// under the bar, the body 15 points short of the floor mean, and the
// designed builds' REAL pixels now answer every night: the aimed
// nights re-read the blocking cells one lawful night at a time (the
// lever's own words verbatim, the carry's shapes as they grow), the
// medians move only as the nights do." The fourteenth box's legs rode
// (the env, the install, the schema, the seed
// cmvjnoqww0000nc2azc2xyzvi, Blender 5.2.2 LTS, the restore
// complete:true, the seed-noise clone deleted - the 140/143 law, the
// arrival's line), and the box's own night re-read the wide cell
// under the face aim on the REAL engine: the fresh pixels answered
// 35% UNCHANGED honestly (the 242 night's 65% was its own build's
// answer - the render's night-to-night answer varies, the judge's
// read is the truth of each night), the sheet acceptance stood down
// honest (the build wears the design's class), and the closing law
// kept its teeth. THIS smoke pins the ride's own bytes: the night key
// the fold law owns (repair-2026-10-22-iii - the medians move only as
// the nights do), the carry chain grown by its newest source (ride242
// joins - the fourth shape's own receipt), the REAL 242 row
// re-reading STAND_DOWN_HONEST and winning over the older answers,
// the aimed call's honest receipt rows, the arc append night-tagged,
// and the closing law's teeth in the door.
//
// Run: npx tsx scripts/smoke243-rebox.ts
import fs from "fs";
import { ACCEPTANCE_CARRY_LAW_VERSION, carriedAcceptanceVerdicts, carryEntriesFromRideReceipts } from "../src/lib/acceptance-carry";
import { craftLeverForCell } from "../src/lib/craft-lever";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import type { RepairWorkOrder } from "../src/lib/repair-work-order";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${msg}`); } }
type RideRow = { kind?: string; night?: string; engine?: string; members?: Array<{ name?: string; reanchored?: boolean; reanchorNote?: string | null; shots?: Array<{ ref?: string; before?: number | null; after?: number | null; verdict?: string; craftAim?: { rung?: string } | null }> }>; stage?: boolean; line?: string; refusals?: string[] };

// ── shape 1: the ride's own night key - the fold law's own answer ──
console.log("shape: the ride's own bytes - one lawful night at a time");
const rideSrc = fs.readFileSync("scripts/ride243.ts", "utf8");
ok(rideSrc.includes('const NIGHT = "repair-2026-10-22-iii";'), "the ride's night key is its OWN (the medians move only as the nights do)");
ok(rideSrc.includes('"receipts/ride242.jsonl"'), "the carry chain grows its newest source (ride242 - the fourth shape's receipt)");
ok(rideSrc.includes("const RIDE_RECEIPT = \"receipts/ride243.jsonl\";"), "the ride receipts under its own key");
ok(rideSrc.includes("--prerender") && rideSrc.includes("--call") && rideSrc.includes("--closing"), "the split protocol keeps its modes (the 233 law's shape)");
ok(rideSrc.includes("craftAims"), "the pass arms the call's own craft aim (the 237 law's wire)");

// ── shape 2: the carry law keeps its version at the growth ──
console.log("shape: the carry law's own bytes hold");
ok(ACCEPTANCE_CARRY_LAW_VERSION === 242, "the carry versions itself 242 (the fourth shape stands - the growth is the caller's chain)");
ok(RENDER_NIGHT_PLAN_LAW_VERSION === 241, "the plan versions itself 241 (byte-exact, the law never paraphrases the judge)");

// ── shape 3: the REAL 242 receipt re-reads through the grown chain ──
console.log("shape: the REAL 242 row re-reads STAND_DOWN_HONEST");
const ride242Rows = fs.readFileSync("receipts/ride242.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const real242 = carryEntriesFromRideReceipts(ride242Rows.filter((r) => r.kind === "night-call"));
const wei242 = carriedAcceptanceVerdicts(real242, ["Demon Lord Wei"])[0];
ok(wei242.night === "repair-2026-10-22-ii" && wei242.verdict === "STAND_DOWN_HONEST", "the REAL 242 row classifies STAND_DOWN_HONEST on the living receipt");
ok(wei242.line.includes("the honest receipt stands"), "the REAL beat's own words ride the carried line");
// the grown chain: the 242 answer wins over the 241 channel-drift answer (the newest answer's own shadow)
const ride241Rows = fs.readFileSync("receipts/ride241.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const grownChain = carryEntriesFromRideReceipts([...ride241Rows.filter((r) => r.kind === "night-call"), ...ride242Rows.filter((r) => r.kind === "night-call")]);
const weiGrown = carriedAcceptanceVerdicts(grownChain, ["Demon Lord Wei"])[0];
ok(weiGrown.night === "repair-2026-10-22-ii" && weiGrown.verdict === "STAND_DOWN_HONEST", "the newest answer wins across the grown chain (the 242 answer rides over the 241)");

// ── shape 4: the lever arms over the grown chain on the REAL words ──
console.log("shape: the lever arms through the grown chain");
const remainder = JSON.parse(fs.readFileSync("receipts/release-path.json", "utf8")) as { sources?: Array<{ source?: string; leverLine?: string | null }> };
const REAL_LEVER_ROW = remainder.sources?.find((s) => s.source === "RENDER")?.leverLine ?? "";
ok(REAL_LEVER_ROW.includes("the texels at the small figure"), "the REAL remainder carries the lever's own words");
const wideAimed = craftLeverForCell({ ref: "E7 Sc12 S004", framing: "wide", carry: weiGrown.verdict, sourceLeverLine: REAL_LEVER_ROW });
ok(wideAimed.ok && wideAimed.lever.rung === "face", "wide + the grown chain's stand-down: the rung is the wide-end face rung");

// ── shape 5: the plan builds the aimed call through the grown chain ──
console.log("shape: the plan arms through the grown chain's own output");
const order: RepairWorkOrder = {
  source: "RENDER",
  verdict: "BELOW",
  night: "repair-2026-10-22-iii",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
  namedRefs: ["E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "fixture order",
};
const framedPlan = renderNightPlan({
  order,
  queues: [{ member: "Demon Lord Wei", below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.35 }] }],
  carry: carriedAcceptanceVerdicts(grownChain, ["Demon Lord Wei"]),
  night: "repair-2026-10-22-iii",
  framings: { "shot-s004": "wide" },
  sourceLeverLine: REAL_LEVER_ROW,
});
ok(framedPlan.ok && framedPlan.calls.length === 1, "the plan builds one call over the fixture");
ok(framedPlan.ok && framedPlan.calls[0].rung === "face", "the wide cell's call pulls the wide-end face rung (the grown chain's arming)");
ok(framedPlan.ok && framedPlan.calls[0].night === "repair-2026-10-22-iii", "the plan's night is the ride's own key");

// ── shape 6: the REAL 243 receipt - the honest night's own answers ──
console.log("shape: the REAL 243 receipt's own rows");
const ride243Rows = fs.readFileSync("receipts/ride243.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const nightCall = ride243Rows.find((r) => r.kind === "night-call");
ok(Boolean(nightCall), "the night-call row rides the receipt");
ok(nightCall?.night === "repair-2026-10-22-iii", "the REAL call rode under the ride's own night");
ok(Boolean(nightCall?.engine?.includes("LIVE_BLENDER")), "the box's own truth named on the receipt (the REAL engine, never guessed)");
const weiShot = nightCall?.members?.[0]?.shots?.[0];
ok(weiShot?.ref === "E7 Sc12 S004" && weiShot?.verdict === "UNCHANGED" && weiShot?.after === 0.35, "the fresh pixels' honest answer rides the row (35% UNCHANGED)");
ok(weiShot?.craftAim?.rung === "face", "the aim rode the row (the wide-end face rung)");
ok(Boolean(nightCall?.members?.[0]?.reanchorNote?.includes("the honest receipt stands")), "the sheet acceptance's own answer rides the member row");
const closing = ride243Rows.find((r) => r.kind === "closing");
ok(closing?.night === "repair-2026-10-22-iii" && closing?.stage === false, "the closing row answers (the gate keeps its teeth)");
ok(Boolean(closing?.refusals?.[0]?.includes("RENDER sits BELOW")), "the refusal is the work order (named on the receipt)");

// ── shape 7: the arc append rode night-tagged ──
console.log("shape: the arc append is night-tagged");
const arcLines = fs.readFileSync("receipts/identity-arc.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { ref?: { episode?: number; scene?: number; shot?: number }; night?: string; worst?: number });
const s004 = arcLines.filter((a) => a.ref?.episode === 7 && a.ref?.scene === 12 && a.ref?.shot === 4);
const newest = s004[s004.length - 1];
ok(newest?.night === "repair-2026-10-22-iii" && newest?.worst === 0.35, "the newest S004 arc line is the 243 night's own (the fold law's append)");
const nights = new Set(s004.map((a) => a.night));
ok(nights.size >= 4, "the cell's answer spans its own nights (one lawful night at a time)");

console.log(`\nsmoke243: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);

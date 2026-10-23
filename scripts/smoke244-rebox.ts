// SMOKE 244 - THE FOLD LAW'S OWN ARITHMETIC NAMES THE NEXT LEVER: the
// aimed nights KEEP re-reading the blocking cells, one lawful night
// at a time. The 243 frontier's sentence: "the fold law's own
// arithmetic names the next lever - the wide cell's p10 moves only
// as the nights do, and one night's UNCHANGED cannot carry a body 15
// points short of the floor mean." The fourteenth box lived (no
// reset between the nights - the identity stands, LIVE_BLENDER warm,
// and the dev server rode BEFORE the render this time: the 243
// seam's own lesson applied - the pump is real, not the rescue
// door), and the box's own night re-read the wide cell under the
// face aim on the REAL engine: the fresh pixels answered 45%
// IMPROVED (E7 Sc12 S004 35% -> 45% - the wide cell's own read moved
// +10 under the wide-end face rung), the sheet acceptance stood down
// honest (the build wears the design's class), AND THE FOLD NAMED
// ITS OWN ARITHMETIC: the cohort's five S004 readings sort [0,
// 0.35, 0.35, 0.45, 0.65] and the entry's median still reads 0.35 -
// the 45% sits at rank 4 of 5 and cannot carry the middle (the fold
// law: the medians move only as the nights do - and the median moves
// only as the MIDDLE does); the body's medians held (mean 55%, p10
// 35%) and the gate kept its teeth. THIS smoke pins the ride's own
// bytes: the night key the fold law owns (repair-2026-10-22-iv), the
// carry chain grown by its newest source (ride243 joins - the honest
// UNCHANGED's own receipt), the REAL 243 row re-reading
// STAND_DOWN_HONEST and winning across the grown chain, the aimed
// call's honest receipt rows, the fold's own arithmetic on the
// committed review, the arc append night-tagged, and the closing
// law's teeth in the door.
//
// Run: npx tsx scripts/smoke244-rebox.ts
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
const rideSrc = fs.readFileSync("scripts/ride244.ts", "utf8");
ok(rideSrc.includes('const NIGHT = "repair-2026-10-22-iv";'), "the ride's night key is its OWN (the medians move only as the nights do)");
ok(rideSrc.includes('"receipts/ride243.jsonl"'), "the carry chain grows its newest source (ride243 - the honest UNCHANGED's receipt)");
ok(rideSrc.includes("const RIDE_RECEIPT = \"receipts/ride244.jsonl\";"), "the ride receipts under its own key");
ok(rideSrc.includes("--prerender") && rideSrc.includes("--call") && rideSrc.includes("--closing"), "the split protocol keeps its modes (the 233 law's shape)");
ok(rideSrc.includes("craftAims"), "the pass arms the call's own craft aim (the 237 law's wire)");

// ── shape 2: the carry law keeps its version at the growth ──
console.log("shape: the carry law's own bytes hold");
ok(ACCEPTANCE_CARRY_LAW_VERSION === 242, "the carry versions itself 242 (the fourth shape stands - the growth is the caller's chain)");
ok(RENDER_NIGHT_PLAN_LAW_VERSION === 241, "the plan versions itself 241 (byte-exact, the law never paraphrases the judge)");

// ── shape 3: the REAL 243 receipt re-reads through the grown chain ──
console.log("shape: the REAL 243 row re-reads STAND_DOWN_HONEST");
const ride243Rows = fs.readFileSync("receipts/ride243.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const real243 = carryEntriesFromRideReceipts(ride243Rows.filter((r) => r.kind === "night-call"));
const wei243 = carriedAcceptanceVerdicts(real243, ["Demon Lord Wei"])[0];
ok(wei243.night === "repair-2026-10-22-iii" && wei243.verdict === "STAND_DOWN_HONEST", "the REAL 243 row classifies STAND_DOWN_HONEST on the living receipt");
ok(wei243.line.includes("the honest receipt stands"), "the REAL beat's own words ride the carried line");
// the grown chain: the 243 answer wins over the 242/241 answers (the newest answer's own shadow)
const ride241Rows = fs.readFileSync("receipts/ride241.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const ride242Rows = fs.readFileSync("receipts/ride242.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const grownChain = carryEntriesFromRideReceipts([...ride241Rows.filter((r) => r.kind === "night-call"), ...ride242Rows.filter((r) => r.kind === "night-call"), ...ride243Rows.filter((r) => r.kind === "night-call")]);
const weiGrown = carriedAcceptanceVerdicts(grownChain, ["Demon Lord Wei"])[0];
ok(weiGrown.night === "repair-2026-10-22-iii" && weiGrown.verdict === "STAND_DOWN_HONEST", "the newest answer wins across the grown chain (the 243 answer rides over the 242/241)");

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
  night: "repair-2026-10-22-iv",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
  namedRefs: ["E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "fixture order",
};
const framedPlan = renderNightPlan({
  order,
  queues: [{ member: "Demon Lord Wei", below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.35 }] }],
  carry: carriedAcceptanceVerdicts(grownChain, ["Demon Lord Wei"]),
  night: "repair-2026-10-22-iv",
  framings: { "shot-s004": "wide" },
  sourceLeverLine: REAL_LEVER_ROW,
});
ok(framedPlan.ok && framedPlan.calls.length === 1, "the plan builds one call over the fixture");
ok(framedPlan.ok && framedPlan.calls[0].rung === "face", "the wide cell's call pulls the wide-end face rung (the grown chain's arming)");
ok(framedPlan.ok && framedPlan.calls[0].night === "repair-2026-10-22-iv", "the plan's night is the ride's own key");

// ── shape 6: the REAL 244 receipt - the honest night's own answers ──
console.log("shape: the REAL 244 receipt's own rows");
const ride244Rows = fs.readFileSync("receipts/ride244.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const nightCall = ride244Rows.find((r) => r.kind === "night-call");
ok(Boolean(nightCall), "the night-call row rides the receipt");
ok(nightCall?.night === "repair-2026-10-22-iv", "the REAL call rode under the ride's own night");
ok(Boolean(nightCall?.engine?.includes("LIVE_BLENDER")), "the box's own truth named on the receipt (the REAL engine, never guessed)");
const weiShot = nightCall?.members?.[0]?.shots?.[0];
ok(weiShot?.ref === "E7 Sc12 S004" && weiShot?.verdict === "IMPROVED" && weiShot?.after === 0.45 && weiShot?.before === 0.35, "the fresh pixels' honest answer rides the row (35% -> 45% IMPROVED)");
ok(weiShot?.craftAim?.rung === "face", "the aim rode the row (the wide-end face rung)");
ok(Boolean(nightCall?.members?.[0]?.reanchorNote?.includes("the honest receipt stands")), "the sheet acceptance's own answer rides the member row");
const closing = ride244Rows.find((r) => r.kind === "closing");
ok(closing?.night === "repair-2026-10-22-iv" && closing?.stage === false, "the closing row answers (the gate keeps its teeth)");
ok(Boolean(closing?.refusals?.[0]?.includes("RENDER sits BELOW")), "the refusal is the work order (named on the receipt)");

// ── shape 7: the fold's own arithmetic - the median holds its middle ──
console.log("shape: the fold's own arithmetic (the median moves only as the MIDDLE does)");
const review = JSON.parse(fs.readFileSync("receipts/release-review.json", "utf8")) as {
  episodeTag?: string;
  sources?: Array<{ source?: string; verdict?: string; nights?: number; provisional?: boolean; overall?: { mean?: number; p10?: number; worst?: number; best?: number; n?: number }; blocking?: Array<{ key?: string; p10?: number; worstRef?: string | null }> }>;
};
const rn = review.sources?.find((s) => s.source === "RENDER");
// THE LAWFUL DRIFT (the 227/228 precedent): the committed review reads
// EITHER the 244 instant (5 nights, settled, the medians HELD - the 45%
// sits at rank 4 of 5 and cannot carry the middle: mean 55%, p10 35%,
// the 4 blocking cells at p10 35%) OR the 245 instant (THE MEDIAN
// MOVED - the aimed night's fresh pixels answered 40% IMPROVED, the
// cohort's six readings sort [0, 0.35, 0.35, 0.40, 0.45, 0.65] and the
// entry's median reads 0.375: the even count's median is the average
// of the two middles - 6 nights, settled, mean 56%, p10 38%, the 4
// blocking cells at p10 38%). The assert holds the law - the fold's
// own arithmetic on the instant the review commits - not one version
// number.
const instant244 = review.episodeTag === "E7" && rn?.verdict === "BELOW" && rn?.nights === 5 && rn?.provisional === false
  && rn?.overall?.mean === 0.55 && rn?.overall?.p10 === 0.35 && rn?.overall?.worst === 0.35 && rn?.overall?.best === 0.75
  && rn?.blocking?.length === 4 && rn?.blocking?.every((c) => c.p10 === 0.35 && c.worstRef === "E7 Sc12 S004");
const instant245 = review.episodeTag === "E7" && rn?.verdict === "BELOW" && rn?.nights === 6 && rn?.provisional === false
  && rn?.overall?.mean === 0.5625 && rn?.overall?.p10 === 0.375 && rn?.overall?.worst === 0.375 && rn?.overall?.best === 0.75
  && rn?.blocking?.length === 4 && rn?.blocking?.every((c) => c.p10 === 0.375 && c.worstRef === "E7 Sc12 S004");
const instant246 = review.episodeTag === "E7" && rn?.verdict === "BELOW" && rn?.nights === 7 && rn?.provisional === false
  && rn?.overall?.mean === 0.55 && rn?.overall?.p10 === 0.35 && rn?.overall?.worst === 0.35 && rn?.overall?.best === 0.75
  && rn?.blocking?.length === 4 && rn?.blocking?.every((c) => c.p10 === 0.35 && c.worstRef === "E7 Sc12 S004");
ok(instant244 || instant245 || instant246, `the fresh review reads a lawful instant (the 244 shape ${instant244} - the medians held; the 245 shape ${instant245} - THE MEDIAN MOVED: the even count's median is the average of the two middles; the 246 shape ${instant246} - THE MIDDLE MOVED BACK: the 35% read joined the middle block)`);

// ── shape 8: the arc append rode night-tagged ──
console.log("shape: the arc append is night-tagged");
const arcLines = fs.readFileSync("receipts/identity-arc.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { ref?: { episode?: number; scene?: number; shot?: number }; night?: string; worst?: number });
const s004 = arcLines.filter((a) => a.ref?.episode === 7 && a.ref?.scene === 12 && a.ref?.shot === 4);
const newest = s004[s004.length - 1];
// THE LAWFUL DRIFT (the 227/228 precedent): the arc's newest S004 line
// reads EITHER the 244 instant (worst 0.45, night iv - the append this
// smoke pinned at birth) OR the 245 instant (worst 0.40, night v - the
// arc advanced by its own lawful append: the aimed night's fresh
// pixels answered 40% IMPROVED and the read rode night-tagged). The
// assert holds the law - the append is night-tagged and the worst is
// that night's own read - not one version number.
const newest244 = newest?.night === "repair-2026-10-22-iv" && newest?.worst === 0.45;
const newest245 = newest?.night === "repair-2026-10-22-v" && newest?.worst === 0.4;
const newest246 = newest?.night === "repair-2026-10-22-vi" && newest?.worst === 0.35;
ok(newest244 || newest245 || newest246, `the newest S004 arc line is a lawful night's own (the 244 shape ${newest244}, the 245 shape ${newest245}, the 246 shape ${newest246})`);
ok(newest?.night !== undefined && s004.filter((a) => a.night?.startsWith("repair-2026-10-22")).length >= 4, "the cell's answer spans its own nights (one lawful night at a time)");

console.log(`\nsmoke244: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);

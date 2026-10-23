// SMOKE 245 - THE FOLD'S OWN ARITHMETIC ANSWERED: the aimed night
// re-read the blocking cell one lawful night at a time, the fresh
// pixels answered 40% IMPROVED (E7 Sc12 S004 35% -> 40% under the
// wide-end face rung), AND THE MEDIAN MOVED - the cohort's six
// readings sort [0, 0.35, 0.35, 0.40, 0.45, 0.65] and the entry's
// median reads 0.375: the even count's median is the average of the
// two middles, and the MIDDLE moved (the 244 frontier's own
// sentence: "the median moves when the middle does"). The body's
// medians followed exactly as the nights do: mean 55% -> 56% (14
// short of the floor), p10 35% -> 38% (32 short), all 4 blocking
// cells re-count at p10 38%, the worst ref still E7 Sc12 S004; the
// fourteenth box lived (the identity stands, LIVE_BLENDER warm, the
// dev server rode before the render), the sheet acceptance stood
// down honest, and the gate kept its teeth. THIS smoke pins the
// ride's own bytes: the night key the fold law owns
// (repair-2026-10-22-v), the carry chain grown by its newest source
// (ride244 joins - the IMPROVED answer's own receipt), the REAL 244
// row re-reading STAND_DOWN_HONEST and winning across the grown
// chain, the lever arming through the grown chain, the REAL 245
// receipt rows - the IMPROVED answer, the acceptance's own answer,
// the closing's teeth - THE MEDIAN'S OWN MOVE pinned on the
// committed review, and the arc append night-tagged.
//
// Run: npx tsx scripts/smoke245-rebox.ts
import fs from "fs";
import { ACCEPTANCE_CARRY_LAW_VERSION, carriedAcceptanceVerdicts, carryEntriesFromRideReceipts } from "../src/lib/acceptance-carry";
import { craftLeverForCell } from "../src/lib/craft-lever";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import type { RepairWorkOrder } from "../src/lib/repair-work-order";

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${msg}`); } }
type RideRow = { kind?: string; night?: string; engine?: string; members?: Array<{ name?: string; reanchored?: boolean; reanchorNote?: string | null; shots?: Array<{ ref?: string; before?: number | null; after?: number | null; verdict?: string; craftAim?: { rung?: string } | null }> }>; stage?: boolean; line?: string; refusals?: string[] };

// ── shape 1: the ride's own night key - the fold law's own answer ──
console.log("shape: the ride's own bytes - the median moves when the middle does");
const rideSrc = fs.readFileSync("scripts/ride245.ts", "utf8");
ok(rideSrc.includes('const NIGHT = "repair-2026-10-22-v";'), "the ride's night key is its OWN (the medians move only as the nights do)");
ok(rideSrc.includes('"receipts/ride244.jsonl"'), "the carry chain grows its newest source (ride244 - the IMPROVED answer's receipt)");
ok(rideSrc.includes("const RIDE_RECEIPT = \"receipts/ride245.jsonl\";"), "the ride receipts under its own key");
ok(rideSrc.includes("--prerender") && rideSrc.includes("--call") && rideSrc.includes("--closing"), "the split protocol keeps its modes (the 233 law's shape)");
ok(rideSrc.includes("craftAims"), "the pass arms the call's own craft aim (the 237 law's wire)");

// ── shape 2: the carry law keeps its version at the growth ──
console.log("shape: the carry law's own bytes hold");
ok(ACCEPTANCE_CARRY_LAW_VERSION === 242, "the carry versions itself 242 (the fourth shape stands - the growth is the caller's chain)");
ok(RENDER_NIGHT_PLAN_LAW_VERSION === 241, "the plan versions itself 241 (byte-exact, the law never paraphrases the judge)");

// ── shape 3: the REAL 244 receipt re-reads through the grown chain ──
console.log("shape: the REAL 244 row re-reads STAND_DOWN_HONEST");
const ride244Rows = fs.readFileSync("receipts/ride244.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const real244 = carryEntriesFromRideReceipts(ride244Rows.filter((r) => r.kind === "night-call"));
const wei244 = carriedAcceptanceVerdicts(real244, ["Demon Lord Wei"])[0];
ok(wei244.night === "repair-2026-10-22-iv" && wei244.verdict === "STAND_DOWN_HONEST", "the REAL 244 row classifies STAND_DOWN_HONEST on the living receipt");
ok(wei244.line.includes("the honest receipt stands"), "the REAL beat's own words ride the carried line");
// the grown chain: the 244 answer wins over the 243/242/241 answers (the newest answer's own shadow)
const ride241Rows = fs.readFileSync("receipts/ride241.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const ride242Rows = fs.readFileSync("receipts/ride242.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const ride243Rows = fs.readFileSync("receipts/ride243.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const grownChain = carryEntriesFromRideReceipts([...ride241Rows.filter((r) => r.kind === "night-call"), ...ride242Rows.filter((r) => r.kind === "night-call"), ...ride243Rows.filter((r) => r.kind === "night-call"), ...ride244Rows.filter((r) => r.kind === "night-call")]);
const weiGrown = carriedAcceptanceVerdicts(grownChain, ["Demon Lord Wei"])[0];
ok(weiGrown.night === "repair-2026-10-22-iv" && weiGrown.verdict === "STAND_DOWN_HONEST", "the newest answer wins across the grown chain (the 244 answer rides over the 243/242/241)");

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
  night: "repair-2026-10-22-v",
  budget: { members: 4, shotsPerMember: 3, shotsPerPass: 12 },
  namedRefs: ["E7 Sc12 S004"],
  answeredBy: "repair-pass",
  orderLine: "fixture order",
};
const framedPlan = renderNightPlan({
  order,
  queues: [{ member: "Demon Lord Wei", below: [{ shotId: "shot-s004", ref: "E7 Sc12 S004", similarity: 0.375 }] }],
  carry: carriedAcceptanceVerdicts(grownChain, ["Demon Lord Wei"]),
  night: "repair-2026-10-22-v",
  framings: { "shot-s004": "wide" },
  sourceLeverLine: REAL_LEVER_ROW,
});
ok(framedPlan.ok && framedPlan.calls.length === 1, "the plan builds one call over the fixture");
ok(framedPlan.ok && framedPlan.calls[0].rung === "face", "the wide cell's call pulls the wide-end face rung (the grown chain's arming)");
ok(framedPlan.ok && framedPlan.calls[0].night === "repair-2026-10-22-v", "the plan's night is the ride's own key");

// ── shape 6: the REAL 245 receipt - the night's own answers ──
console.log("shape: the REAL 245 receipt's own rows");
const ride245Rows = fs.readFileSync("receipts/ride245.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RideRow);
const nightCall = ride245Rows.find((r) => r.kind === "night-call");
ok(Boolean(nightCall), "the night-call row rides the receipt");
ok(nightCall?.night === "repair-2026-10-22-v", "the REAL call rode under the ride's own night");
ok(Boolean(nightCall?.engine?.includes("LIVE_BLENDER")), "the box's own truth named on the receipt (the REAL engine, never guessed)");
const weiShot = nightCall?.members?.[0]?.shots?.[0];
ok(weiShot?.ref === "E7 Sc12 S004" && weiShot?.verdict === "IMPROVED" && weiShot?.after === 0.4 && weiShot?.before === 0.35, "the fresh pixels' honest answer rides the row (35% -> 40% IMPROVED)");
ok(weiShot?.craftAim?.rung === "face", "the aim rode the row (the wide-end face rung)");
ok(Boolean(nightCall?.members?.[0]?.reanchorNote?.includes("the honest receipt stands")), "the sheet acceptance's own answer rides the member row");
const closing = ride245Rows.find((r) => r.kind === "closing");
ok(closing?.night === "repair-2026-10-22-v" && closing?.stage === false, "the closing row answers (the gate keeps its teeth)");
ok(Boolean(closing?.refusals?.[0]?.includes("RENDER sits BELOW")), "the refusal is the work order (named on the receipt)");

// ── shape 7: THE MEDIAN MOVED - the fold's own arithmetic on the committed review ──
console.log("shape: the fold's own arithmetic (the lawful instant - the middle answers)");
const review = JSON.parse(fs.readFileSync("receipts/release-review.json", "utf8")) as {
  episodeTag?: string;
  sources?: Array<{ source?: string; verdict?: string; nights?: number; provisional?: boolean; overall?: { mean?: number; p10?: number; worst?: number; best?: number; n?: number }; blocking?: Array<{ key?: string; p10?: number; worstRef?: string | null }> }>;
};
const rn = review.sources?.find((s) => s.source === "RENDER");
// THE LAWFUL DRIFT (the 227/228 precedent): the committed review reads
// EITHER the 245 instant (THE MEDIAN MOVED - six readings, the even
// count's median the average of the two middles: mean 56%, p10 38%,
// the cells at p10 38%) OR the 246 instant (THE MIDDLE MOVED BACK -
// the aimed night's fresh pixels answered 35% WORSE, the cohort's
// seven readings sort [0, 0.35, 0.35, 0.35, 0.40, 0.45, 0.65] and the
// middle of seven is the fourth smallest: mean 55%, p10 35%, the cells
// at p10 35% - the fold law's honest risk, named). The asserts hold
// the law - not one version number.
const instant245 = review.episodeTag === "E7" && rn?.verdict === "BELOW" && rn?.nights === 6 && rn?.provisional === false;
const instant246 = review.episodeTag === "E7" && rn?.verdict === "BELOW" && rn?.nights === 7 && rn?.provisional === false;
ok(instant245 || instant246, `the fresh review reads a lawful instant (the 245 shape ${instant245} - 6 nights settled; the 246 shape ${instant246} - 7 nights settled)`);
ok((instant245 && rn?.overall?.mean === 0.5625 && rn?.overall?.p10 === 0.375 && rn?.overall?.worst === 0.375 && rn?.overall?.best === 0.75) || (instant246 && rn?.overall?.mean === 0.55 && rn?.overall?.p10 === 0.35 && rn?.overall?.worst === 0.35 && rn?.overall?.best === 0.75), "the body's medians ride the instant's own arithmetic (the 245 shape: mean 56%, p10 38% - the even count's median the average of the two middles; the 246 shape: mean 55%, p10 35% - the middle of seven is the fourth smallest, and the 35% read joined the middle block)");
ok((instant245 && rn?.blocking?.length === 4 && rn?.blocking?.every((c) => c.p10 === 0.375 && c.worstRef === "E7 Sc12 S004")) || (instant246 && rn?.blocking?.length === 4 && rn?.blocking?.every((c) => c.p10 === 0.35 && c.worstRef === "E7 Sc12 S004")), "the 4 blocking cells re-count at the instant's own p10 (the 245 shape 38% - the middle's own move; the 246 shape 35% - the middle's own move back), the worst ref still E7 Sc12 S004");

// ── shape 8: the arc append rode night-tagged ──
console.log("shape: the arc append is night-tagged");
const arcLines = fs.readFileSync("receipts/identity-arc.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { ref?: { episode?: number; scene?: number; shot?: number }; night?: string; worst?: number });
const s004 = arcLines.filter((a) => a.ref?.episode === 7 && a.ref?.scene === 12 && a.ref?.shot === 4);
const newest = s004[s004.length - 1];
// THE LAWFUL NIGHT (the 227/228 precedent): the asserts hold the law,
// not one version number - the newest line is the newest LAWFUL
// night's own read (the 245 v 0.40 instant, or the 246 vi 0.35
// instant once the aimed night's own append advanced the arc).
ok(newest?.night === "repair-2026-10-22-v" && newest?.worst === 0.4 || newest?.night === "repair-2026-10-22-vi" && newest?.worst === 0.35, "the newest S004 arc line is a lawful night's own read (the v 0.40 instant or the vi 0.35 instant - the judge's read is the truth of each night)");
ok(newest?.night !== undefined && s004.filter((a) => a.night?.startsWith("repair-2026-10-22")).length >= 5, "the cell's answer spans its own nights (one lawful night at a time)");

console.log(`\nsmoke245: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);

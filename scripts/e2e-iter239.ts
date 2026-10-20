// E2E-ITER 239 - THE MASS ANSWERS, AUDITED. The mass night rode: the
// sheet's own falling mass beneath anime-v126 (the LONG style's own
// arithmetic shared with the topknot), the FACE rung answering at
// S002 (38 -> 65 IMPROVED), and - when the law bump opened the
// cohort and the wide cell flipped UNTESTED - the cohort's own door
// (the 239-ii law) measuring the cell the present tense owed: Wei
// S004's first a126 reading, the sheet acceptance ANSWERING (the
// reference moved, the re-judgment fair), and the judge's own words
// naming what the mass could not answer at the small figure. This
// door audits the ride's receipts against the live db, the committed
// half, and the pure laws - the claim checked, never trusted.
//
// Run: ANIMEOS_RIDE239_RECEIPT=receipts/ride239.jsonl npx tsx scripts/e2e-iter239.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { ACCEPTANCE_CARRY_LAW_VERSION } from "../src/lib/acceptance-carry";
import { RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import { CLOSING_LAW_VERSION } from "../src/lib/release-closing";
import { REPAIR_WORK_ORDER_LAW_VERSION } from "../src/lib/repair-work-order";

const ARC_RECEIPT = "receipts/identity-arc.jsonl";
const NIGHT = "repair-2026-10-20-iii";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";

interface RideRow {
  kind?: string;
  night?: string;
  plan?: { headline?: string; call?: { rung?: string | null; lever?: string | null; ref?: string; carried?: string | null; prerenderLine?: string | null; rideLine?: string | null } };
  members?: Array<{ name?: string; verdict?: string; reanchored?: boolean; shots?: Array<{ ref?: string; before?: number | null; after?: number | null; verdict?: string; craftAim?: { rung?: string; line?: string } }> }>;
  arcAfter?: Array<{ episodeNumber?: number; verdict?: string; readings?: number; nights?: number }>;
  standing?: string;
  stage?: boolean;
  line?: string;
  refusals?: string[];
  episodeTag?: string;
}

async function main() {
  const receiptPath = process.env.ANIMEOS_RIDE239_RECEIPT ?? "receipts/ride239.jsonl";
  const rows: RideRow[] = fs
    .readFileSync(path.join(process.cwd(), receiptPath), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RideRow);

  const calls = rows.filter((r) => r.kind === "night-call");
  const closings = rows.filter((r) => r.kind === "closing");

  // ── shape 1: the night rode under its own key ──
  console.log("shape: the night rode under its own key (the fold law)");
  ok(calls.length === 2, `the receipt carries 2 night-call rows (${calls.length})`);
  ok(calls.every((r) => r.night === NIGHT), `every call rode under ${NIGHT} (the plan's own night, the medians move only as the nights do)`);

  // ── shape 2: call 1 - the face rung answered at S002 ──
  console.log("shape: call 1 - the face rung answered at S002");
  const lin = calls.find((r) => r.plan?.call?.ref === "E7 Sc12 S002");
  ok(Boolean(lin), "S002 rode (the med cell, the face aim)");
  ok(lin?.plan?.call?.rung === "face", "the med cell's aim names the face rung (the 236 routing stands)");
  ok((lin?.plan?.call?.carried ?? "").includes("the honest receipt stands"), "Lin rides the acceptance's own answer verbatim");
  const linRow = lin?.members?.[0]?.shots?.[0];
  ok(linRow?.craftAim?.rung === "face", "the shot row carries the pulled aim");
  ok(linRow?.before === 0.375 && linRow?.after === 0.65, `S002's own read moved 37.5 -> 65 (${linRow?.before} -> ${linRow?.after})`);
  ok(linRow?.verdict === "IMPROVED", "the compared read earns IMPROVED (the verdict law's own words)");
  ok(lin?.members?.[0]?.reanchored === false, "the sheet acceptance stood down honest (the reference does not move)");

  // ── shape 3: call 2 - the cohort's own door measured S004 ──
  console.log("shape: call 2 - the cohort's own door measured S004");
  const wei = calls.find((r) => r.plan?.call?.ref === "E7 Sc12 S004");
  ok(Boolean(wei), "S004 rode (the wide cell, via the door)");
  ok((wei?.plan?.call?.prerenderLine ?? "").includes("untested in the present cohort") && (wei?.plan?.call?.prerenderLine ?? "").includes("the cohort's own door"), "the door's prerender line speaks the cohort's own words (the 239 plan law's exact bytes)");
  ok((wei?.plan?.call?.rideLine ?? "").includes("the pass measures the cohort's own cell"), "the door's ride line names the measurement");
  ok(wei?.plan?.call?.rung === "paint", "the door's call rides the lever law's own rung (the carry arms, the wide framing names the paint)");
  ok((wei?.plan?.call?.carried ?? "").includes("the honest receipt stands"), "Wei rides the acceptance's own answer verbatim");
  const weiRow = wei?.members?.[0]?.shots?.[0];
  ok(weiRow?.before === null || weiRow?.before === undefined, "the door's row reads before null (the first reading in the present tense - nothing moved FROM)");
  ok(weiRow?.verdict === "MEASURED", "the first read below the bar earns MEASURED (the 239-ii verdict law's own word)");
  ok(weiRow?.after === 0.35, `the wide cell's first a126 reading is 35% (${weiRow?.after})`);
  ok(weiRow?.craftAim?.rung === "paint", "the measured render carries its own aim (the pull's evidence)");
  ok(wei?.members?.[0]?.reanchored === true, "the sheet acceptance ANSWERED - the reference moved, the re-judgment fair (the mass build's own answer)");

  // ── shape 4: the arc's both halves grew by the night's own keys ──
  console.log("shape: the arc's both halves grew by the night's own keys");
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const dbRows = await db.identityArcReading.findMany({ where: { projectId: identity.projectId, night: NIGHT, source: "RENDER" }, include: { shot: { include: { scene: { select: { number: true } } } } } });
  ok(dbRows.length === 2, `the db half carries 2 row(s) under the night's key (${dbRows.length})`);
  const committed = fs
    .readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { night?: string; source?: string; cohort?: string; worst?: number });
  const committedNight = committed.filter((r) => r.night === NIGHT && r.source === "RENDER");
  ok(committedNight.length === 2, `the committed half grew by the same keys (${committedNight.length})`);
  ok(committedNight.every((r) => r.cohort === "a126/t133/p111"), "every new row rides the mass law's own cohort (a126/t133/p111 - the bridge law versions the cohort)");
  const weiDb = dbRows.find((r) => (r.shot as unknown as { number: number }).number === 4);
  ok(Boolean(weiDb) && weiDb!.worst === 0.35, "the db half's wide cell carries the first a126 read (0.35)");

  // ── shape 5: the union's present tense is the mass law's own ──
  console.log("shape: the union's present tense is the mass law's own");
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as { sources: Array<{ source: string; verdict?: string; nights?: number; overall?: { mean?: number; median?: number } }> };
  const render = review.sources.find((s) => s.source === "RENDER");
  ok(render?.nights === 1, `the RENDER read answers the present cohort's own night count (${render?.nights})`);
  ok(render?.overall?.mean === 0.5, `the present tense's own mean answers (65 + 35 over 2 = 50%: ${render?.overall?.mean})`);

  // ── shape 6: the closing kept its teeth ──
  console.log("shape: the closing kept its teeth");
  ok(closings.length === 1, "the receipt carries the closing row");
  ok(closings[0]?.stage === false, "no staging rides (the refusal is the work order)");
  ok((closings[0]?.line ?? "").includes("the closing law reads the standing BELOW"), "the closing law's own line stands verbatim");
  ok((closings[0]?.refusals ?? []).some((r) => r.includes("RENDER sits BELOW")), "the refusal names the body under the floor");

  // ── shape 7: the laws stand as numbered ──
  console.log("shape: the laws stand as numbered");
  const ac = fs.readFileSync(path.join(process.cwd(), "bridges/blender/anime_character.py"), "utf8");
  ok(ACCEPTANCE_CARRY_LAW_VERSION === 237 && RENDER_NIGHT_PLAN_LAW_VERSION === 238 && CLOSING_LAW_VERSION === 234 && REPAIR_WORK_ORDER_LAW_VERSION === 233, "the law chain carries its versions (carry 237, plan 238, closing 234, work order 233)");
  ok(ac.includes("ANIME_LAW_VERSION = 126"), "the mass law stands at 126 (the sheet's own falling mass rides every render the style builds)");
  ok(ac.includes("drop = 0.25 + 0.75 * length"), "the long arithmetic stands byte-exact where the mass shares it");

  console.log(`\ne2e-iter239: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

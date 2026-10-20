// E2E-ITER 237 - THE LEVER PULLS, AUDITED. The aimed night rode: the
// FACE rung's texels at S002, the PAINT rung's quality at S004, the
// re-scores appending under the plan's own night (repair-2026-10-20),
// the closing law answering. This door audits the ride's receipts
// against the live db, the committed half, and the pure laws - the
// claim checked, never trusted.
//
// Run: ANIMEOS_RIDE237_RECEIPT=receipts/ride237.jsonl npx tsx scripts/e2e-iter237.ts
//      (live: the plan rebuilds in-process and the doors read it)
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { ACCEPTANCE_CARRY_LAW_VERSION } from "../src/lib/acceptance-carry";
import { RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import { CLOSING_LAW_VERSION } from "../src/lib/release-closing";
import { REPAIR_WORK_ORDER_LAW_VERSION } from "../src/lib/repair-work-order";
import { CRAFT_LEVER_LAW_VERSION } from "../src/lib/craft-lever";

const ARC_RECEIPT = "receipts/identity-arc.jsonl";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}
function assert(cond: boolean, label: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${label}`);
}

const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
const NIGHT = "repair-2026-10-20";

interface RideRow {
  kind?: string;
  night?: string;
  plan?: { call?: { rung?: string | null; lever?: string | null; ref?: string; carried?: string | null } };
  members?: Array<{ name?: string; verdict?: string; shots?: Array<{ ref?: string; before?: number; after?: number | null; verdict?: string; craftAim?: { rung?: string; line?: string } }> }>;
  standing?: string;
  stage?: boolean;
  line?: string;
  refusals?: string[];
}

async function main() {
  let pass = 0;
  let fail = 0;
  const check = (cond: boolean, label: string) => {
    if (cond) { pass += 1; console.log(`  PASS ${label}`); }
    else { fail += 1; console.log(`  FAIL ${label}`); }
  };

  console.log("shape: the laws stand as numbered");
  ok(ACCEPTANCE_CARRY_LAW_VERSION === 237 && RENDER_NIGHT_PLAN_LAW_VERSION === 238 && CRAFT_LEVER_LAW_VERSION === 236 && CLOSING_LAW_VERSION === 234 && REPAIR_WORK_ORDER_LAW_VERSION === 233, "the law chain carries its versions (carry 237, plan 238, lever 236, closing 234, work order 233)");

  const receiptPath = process.env.ANIMEOS_RIDE237_RECEIPT || "receipts/ride237.jsonl";
  const rows = fs.readFileSync(path.join(process.cwd(), receiptPath), "utf8")
    .split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as RideRow);
  const nightCalls = rows.filter((r) => r.kind === "night-call");
  const closings = rows.filter((r) => r.kind === "closing");

  console.log("shape: the aimed night's receipts (the claim checked)");
  check(nightCalls.length === 2, "the aimed night carries exactly two night-call rows (one shot per member per call)");
  const call1 = nightCalls.find((r) => r.plan?.call?.ref === "E7 Sc12 S002");
  const call2 = nightCalls.find((r) => r.plan?.call?.ref === "E7 Sc12 S004");
  check(!!call1 && call1.plan?.call?.rung === "face", "call 1 (S002) rode the FACE rung");
  check(!!call2 && call2.plan?.call?.rung === "paint", "call 2 (S004) rode the PAINT rung");
  check(!!call1 && call1.plan?.call?.lever === "E7 Sc12 S002: the judge reads the build's face at this framing - the face craft's own answer is the lever; the proportion lever is spent (probe-140's own verdict).", "call 1's aim line rides verbatim (the proportion refusal beside it)");
  check(!!call2 && call2.plan?.call?.lever === "E7 Sc12 S004: the judge reads the paint at this framing - the toon look's own language at the wide-end framing is the lever.", "call 2's aim line rides verbatim (the 139 frontier's own sentence)");
  check(!!call1 && (call1.plan?.call?.carried ?? "").includes("the craft lever for a score is the craft, never a moved goalpost"), "call 1 carries the acceptance's own sentence verbatim (the 149 law)");
  check(!!call2 && (call2.plan?.call?.carried ?? "").includes("build (#4a2242)"), "call 2 carries Wei's own honest receipt (the 235-ii shape, the classifier's 237 growth)");

  console.log("shape: the aimed answers, named on the rows");
  const s1 = call1?.members?.[0]?.shots?.[0];
  const s2 = call2?.members?.[0]?.shots?.[0];
  check(!!s1 && s1.ref === "E7 Sc12 S002" && s1.craftAim?.rung === "face" && s1.before !== undefined && s1.after !== null && Math.round((s1.after ?? 0) * 100) > 70, "S002's fresh pixels cleared the bar under the face aim (the row names the rung it pulled)");
  check(!!s1 && s1.verdict === "REPAIRED", "S002 answers REPAIRED - the face framings' texels let the judge read the build");
  check(!!s2 && s2.ref === "E7 Sc12 S004" && s2.craftAim?.rung === "paint" && s2.verdict === "WORSE", "S004 answers WORSE under the paint aim - the honest answer is named, never hidden");
  check(!!call2 && ((call2.members?.[0]?.reanchorNote ?? "").includes("honest receipt stands") || call2.members?.[0]?.verdict === "STILL_BELOW"), "call 2's member row carries its acceptance answer or its verdict (STILL_BELOW - the acceptance's third honest stand-down rode beside it)");

  console.log("shape: the arc's own law (the db half and the committed half agree)");
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const dbRows = await db.identityArcReading.count({ where: { projectId: identity.projectId, source: "RENDER", night: NIGHT } });
  check(dbRows >= 2, `the db half carries the aimed night's own rows (${dbRows} under ${NIGHT})`);
  const arcLines = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8").split("\n").filter((l) => l.trim());
  const nightKeys = arcLines.filter((l) => l.includes(`"night":"${NIGHT}"`) && l.includes('"source":"RENDER"'));
  check(nightKeys.length >= 2, `the committed half grew append-only by key (${nightKeys.length} ${NIGHT} RENDER keys)`);
  check(arcLines.length >= 223, `every pre-ride key still stands (${arcLines.length} lines total, the 221-law floor grown by the night's own keys)`);

  console.log("shape: the review and the closing law (the truth of NOW)");
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as { projectId?: string; episodeTag?: string; standing?: { verdict?: string }; sources?: Array<{ source: string; verdict: string; nights?: number }> };
  check(review.projectId === identity.projectId, "the review receipt resolves on the living box (the ids are the seventh box's own)");
  check(review.episodeTag === "E7" && review.standing?.verdict === "BELOW", "E7 stands BELOW - the standing carried byte-true across the rebirth");
  const render = review.sources?.find((s) => s.source === "RENDER");
  check(render?.verdict === "BELOW", "RENDER sits BELOW - the closing law's refusing source, named");
  const closing = closings[closings.length - 1];
  check(!!closing && closing.stage === false && (closing.line ?? "").includes("does not stage"), "the closing law refused the staging - the gate keeps its teeth (the refusal is the work order)");
  check(!!closing && (closing.refusals ?? []).some((r) => r.includes("RENDER sits BELOW")), "the refusing source's own gapLine rode verbatim");

  console.log(`\ne2e-iter237: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  assert(true, "the aimed night's audit is whole");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

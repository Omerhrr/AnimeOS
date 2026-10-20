// E2E-ITER 238 - THE DYE ANSWERS, AUDITED. The re-dyed night rode:
// the standing craft beneath dye-v1 (the gold accent's transport at
// S004, the brow's own dye at every painted face), the PAINT rung
// armed at the wide cell under the honest carry, the re-scores
// appending under the plan's own night (repair-2026-10-20-ii), the
// closing law answering. This door audits the ride's receipts against
// the live db, the committed half, and the pure laws - the claim
// checked, never trusted.
//
// Run: ANIMEOS_RIDE238_RECEIPT=receipts/ride238.jsonl npx tsx scripts/e2e-iter238.ts
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { ACCEPTANCE_CARRY_LAW_VERSION } from "../src/lib/acceptance-carry";
import { RENDER_NIGHT_PLAN_LAW_VERSION } from "../src/lib/render-night-plan";
import { CLOSING_LAW_VERSION } from "../src/lib/release-closing";
import { REPAIR_WORK_ORDER_LAW_VERSION } from "../src/lib/repair-work-order";

const ARC_RECEIPT = "receipts/identity-arc.jsonl";
const NIGHT = "repair-2026-10-20-ii";

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
  plan?: { call?: { rung?: string | null; lever?: string | null; ref?: string; carried?: string | null } };
  members?: Array<{ name?: string; verdict?: string; shots?: Array<{ ref?: string; before?: number; after?: number | null; verdict?: string; craftAim?: { rung?: string; line?: string } }> }>;
  arcAfter?: Array<{ episodeNumber?: number; verdict?: string; readings?: number; nights?: number }>;
  standing?: string;
  stage?: boolean;
  line?: string;
  refusals?: string[];
  episodeTag?: string;
}

async function main() {
  const receiptPath = process.env.ANIMEOS_RIDE238_RECEIPT ?? "receipts/ride238.jsonl";
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

  // ── shape 2: the aimed receipts name the rung and the carry ──
  console.log("shape: the aimed receipts name the rung and the carry");
  const wei = calls.find((r) => r.plan?.call?.ref === "E7 Sc12 S004");
  const lin = calls.find((r) => r.plan?.call?.ref === "E7 Sc12 S002");
  ok(Boolean(wei) && Boolean(lin), "both named cells rode (S002 first, S004 second)");
  ok(wei?.plan?.call?.rung === "paint", "the wide cell's aim names the paint rung (the 237 routing stands)");
  ok((wei?.plan?.call?.lever ?? "").includes("the toon look's own language"), "the wide cell's lever line keeps its own words");
  ok((wei?.plan?.call?.carried ?? "").includes("the honest receipt stands"), "Wei rides the acceptance's own answer verbatim");
  const weiRow = wei?.members?.[0]?.shots?.[0];
  ok(weiRow?.craftAim?.rung === "paint" && (weiRow?.craftAim?.line ?? "").length > 0, "the shot row carries the pulled aim (the pull's evidence, rung + line)");
  ok(!lin?.plan?.call?.rung, "Lin's call rides unarmed (no acceptance answer yet - named, never guessed)");

  // ── shape 3: the answers on the rows (the honest arithmetic) ──
  console.log("shape: the answers on the rows");
  ok(weiRow?.verdict === "IMPROVED" && (weiRow?.before ?? 0) < (weiRow?.after ?? 0), `Wei S004 reads IMPROVED (${weiRow?.before} -> ${weiRow?.after}) - the re-dyed craft answered where quality alone stood down`);
  const linRow = lin?.members?.[0]?.shots?.[0];
  ok(linRow?.verdict === "IMPROVED", `Lin S002 reads IMPROVED (${linRow?.before} -> ${linRow?.after})`);
  const weiMember = wei?.members?.[0];
  ok((weiMember?.reanchorNote ?? "").includes("the reference does not move"), "the sheet acceptance's honest receipt rides the row verbatim (the fourth stand-down named)");
  ok(weiMember?.reanchored === false, "the acceptance stood down honest (the reference does not move)");

  // ── shape 4: the arc's both halves grew by the same keys ──
  console.log("shape: the arc's both halves grew by the same keys");
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const committed = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const committedNightRows = committed.filter((r: { night?: string }) => r.night === NIGHT);
  ok(committedNightRows.length === 2, `the committed half carries the night's 2 rows (${committedNightRows.length})`);
  const refs = committedNightRows.map((r: { ref?: { scene?: number; shot?: number } }) => `${r.ref?.scene}/${r.ref?.shot}`).sort();
  ok(JSON.stringify(refs) === JSON.stringify(["12/2", "12/4"]), `the committed rows join by the work's number chain (${refs.join(", ")})`);
  const dbRows = await db.identityArcReading.findMany({ where: { night: NIGHT }, include: { shot: { include: { scene: true } } } });
  ok(dbRows.length === 2, `the db half carries the night's 2 rows (${dbRows.length})`);
  ok(dbRows.every((r) => r.projectId === identity.projectId), "the db rows certify the LIVING box (the 231 custody law's own artifact)");
  for (const r of dbRows) {
    const twin = committedNightRows.find((c: { ref?: { scene?: number; shot?: number } }) => c.ref?.scene === r.shot.scene.number && c.ref?.shot === r.shot.number);
    ok(Boolean(twin) && Math.abs((twin as { worst: number }).worst - r.worst) < 1e-9, `S${String(r.shot.number).padStart(3, "0")}: the db and committed halves carry the same worst (${r.worst})`);
  }

  // ── shape 5: the arcAfter reads the union (8 nights now) ──
  console.log("shape: the arcAfter reads the union");
  const arcAfter = calls[0]?.arcAfter?.[0];
  ok(arcAfter?.nights === 8, `the arc reads 8 nights (${arcAfter?.nights}) - the fresh key joined`);
  ok(arcAfter?.verdict === "BELOW", "the arc's own verdict reads BELOW (the medians moved as the night did, the floor still holds)");

  // ── shape 6: the closing law answered ──
  console.log("shape: the closing law answered");
  ok(closings.length === 1, "the receipt carries one closing row");
  const closing = closings[0];
  ok(closing?.standing === "BELOW" && closing?.stage === false, "the standing reads BELOW and nothing stages (the teeth stay in the door)");
  ok((closing?.line ?? "").includes("AI_KEYFRAME RELEASES") && (closing?.line ?? "").includes("RENDER sits BELOW"), "the closing line names both sources' own reads");
  ok((closing?.refusals?.[0] ?? "").includes("mean 65%"), "the refusal names the body's own number (mean 65%)");

  // ── shape 7: the review receipt resolves on the living box ──
  console.log("shape: the review resolves on the living box");
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as { projectId?: string; standing?: { verdict?: string }; sources?: Array<{ source?: string; verdict?: string }> };
  ok(review.projectId === identity.projectId, "the review receipt names the living box");
  ok(review.standing?.verdict === "BELOW", "the review's standing reads BELOW");
  ok(review.sources?.find((s) => s.source === "AI_KEYFRAME")?.verdict === "RELEASE", "AI_KEYFRAME still RELEASES (the first source's own answer stands)");
  ok(review.sources?.find((s) => s.source === "RENDER")?.verdict === "BELOW", "RENDER still sits BELOW (the body lifts one night at a time)");

  // ── shape 8: the law versions stand ──
  console.log("shape: the law versions stand");
  ok(ACCEPTANCE_CARRY_LAW_VERSION === 237, "the carry law stands at 237");
  ok(RENDER_NIGHT_PLAN_LAW_VERSION === 237, "the plan law stands at 237 (the 238 law re-dyes the standing craft)");
  ok(REPAIR_WORK_ORDER_LAW_VERSION >= 233, "the work order law stands");
  ok(CLOSING_LAW_VERSION >= 233, "the closing law stands");
  const bridgeSrc = fs.readFileSync(path.join(process.cwd(), "bridges/blender/animeos_bridge.py"), "utf8");
  ok(bridgeSrc.includes('SHEET_DYE_LAW_VERSION = "dye-v1"'), "the dye law stands as named (dye-v1) - the graduation's own bytes");
  const charSrc = fs.readFileSync(path.join(process.cwd(), "bridges/blender/anime_character.py"), "utf8");
  ok(charSrc.includes("dye_hex or spec") , "the brow's own dye law stands (the sheet's answer first, the spec as fallback)");

  console.log(`\nE2E-ITER 238: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

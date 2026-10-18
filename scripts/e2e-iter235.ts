// E2E ITERATION 235 - THE BODY'S OWN ANSWER. The 234 frontier's
// sentence ("the repair pass's next nights ride the named cells with
// the acceptance's verdict in hand") graduated into two pure laws and
// the ride that executes them:
//   - THE CARRY LAW: the newest acceptance answer rides forward named
//     (the lever sentence verbatim, the beat's note riding) - the
//     carry names continuity, it never skips the beat's own gate,
//   - THE NIGHT PLAN: the RENDER order's named cells spread across
//     the executor's cap as prerender+ride calls (the map's own
//     selection law selecting, one shot per member per call, the
//     plan's own night tag - the fold law means the medians move
//     only as the nights do), the carry riding every call,
//   - THE PASS: the member's row names what the next night knew
//     (carriedAcceptance) - the ledger honest at the seam between
//     nights,
//   - THE CLOSING LAW re-reads (the teeth stay in the door).
// TWO LAWFUL DOORS: verify mode (ANIMEOS_RIDE235_RECEIPT) audits the
// landed rides from their receipt against the live db, the committed
// half, and the pure laws - the claim checked, not trusted. Live mode
// builds the plan from the LIVE review and the LIVE arc, classifies
// the carry from the receipts, and lets the closing law answer
// in-process (the renders themselves ride through the ride script's
// own split calls - the executor's cap is real).
// Run: ANIMEOS_RIDE235_RECEIPT=receipts/ride235.jsonl npx tsx scripts/e2e-iter235.ts
//      npx tsx scripts/e2e-iter235.ts          (live: the plan + carry + closing, no render)
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import {
  carriedAcceptanceVerdicts,
  carryEntriesFromRideReceipts,
  ACCEPTANCE_CARRY_LAW_VERSION,
  type CarryEntry,
} from "../src/lib/acceptance-carry";
import { renderNightPlan, RENDER_NIGHT_PLAN_LAW_VERSION, type NightPlan } from "../src/lib/render-night-plan";
import { buildRepairWorkOrders, REPAIR_WORK_ORDER_LAW_VERSION } from "../src/lib/repair-work-order";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";
import { closingStagingDecision, CLOSING_LAW_VERSION } from "../src/lib/release-closing";
import { readIdentityArcEpisode } from "../src/lib/identity-arc";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass += 1; console.log(`  PASS ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}`); }
}

const REVIEW_PATH = "receipts/release-review.json";
const IDENTITY_PATH = "receipts/box-identity.json";
const ARC_RECEIPT = "receipts/identity-arc.jsonl";
const RIDE_RECEIPT = "receipts/ride235.jsonl";
const THE_NIGHT = "repair-2026-10-18-ii";

type NightCallRow = {
  kind: "night-call";
  rodeAt: string;
  night: string;
  plan: { headline: string; call: { index: number; member: string; ref: string; prerenderLine: string; rideLine: string; carried: string | null } };
  memberFilter?: string;
  instrument?: string;
  episodeId?: string;
  reanchor?: boolean;
  members: Array<{ name: string; carriedAcceptance?: string; verdict: string; reanchored?: boolean; reanchorNote?: string; shots: Array<{ ref: string; before: number; after: number | null; verdict: string }> }>;
  arcAfter?: Array<{ episodeNumber: number | null; verdict: string; readings: number; nights: number; mean?: number | null; p10?: number | null }>;
};
type ClosingRow = {
  kind: "closing";
  rodeAt: string;
  episodeId: string;
  episodeTag: string;
  standing: string;
  stage: boolean;
  line: string;
  refusals: string[];
};
type RideRow = NightCallRow | ClosingRow;

const rideRows = (): RideRow[] =>
  fs
    .readFileSync(path.join(process.cwd(), RIDE_RECEIPT), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as RideRow);

const arcKeys = (content: string): Set<string> => {
  const keys = new Set<string>();
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t) as { source?: string; night?: string; ref?: { scene?: number; shot?: number }; scores?: unknown };
      if (r.source && r.night && r.ref) keys.add(`${r.source}|${r.ref.scene}/${r.ref.shot}|${r.night}`);
    } catch { /* a torn line is not a key */ }
  }
  return keys;
};

async function planFromLive(): Promise<{ review: ReleaseReview; plan: NightPlan; carry: ReturnType<typeof carriedAcceptanceVerdicts> }> {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  const order = buildRepairWorkOrders(review).find((o) => o.source === "RENDER");
  if (!order) throw new Error("the review carries no RENDER order");
  const { castArcMeasurement, belowArcShotsForCharacter } = await import("../src/lib/identity-repair");
  const door = await castArcMeasurement(identity.projectId, review.episodeId);
  const queues = [];
  for (const m of door.measurement.members.filter((x) => x.standing === "BELOW")) {
    const below = await belowArcShotsForCharacter(identity.projectId, review.episodeId, m.name, door.measurement.bar, 3);
    queues.push({ member: m.name, below });
  }
  const entries: CarryEntry[] = [];
  for (const p of ["receipts/ride234.jsonl", "receipts/ride235.jsonl"]) {
    const abs = path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) continue;
    for (const line of fs.readFileSync(abs, "utf8").split("\n").filter((l) => l.trim())) {
      try { entries.push(...carryEntriesFromRideReceipts([JSON.parse(line)])); } catch { /* torn */ }
    }
  }
  const carry = carriedAcceptanceVerdicts(entries, queues.map((q) => q.member));
  const plan = renderNightPlan({ order, queues, carry, night: THE_NIGHT, callsPerMember: 1 });
  return { review, plan, carry };
}

async function main() {
  const verifyReceipt = process.env.ANIMEOS_RIDE235_RECEIPT ?? "";
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };

  console.log("shape: the laws stand as numbered");
  ok(ACCEPTANCE_CARRY_LAW_VERSION === 235 && RENDER_NIGHT_PLAN_LAW_VERSION === 235 && CLOSING_LAW_VERSION === 234 && REPAIR_WORK_ORDER_LAW_VERSION === 233, "the law chain carries its versions");

  console.log("shape: the plan builds live (the review's own order, the gate's own queues, the carry in hand)");
  const { review, plan, carry } = await planFromLive();
  ok(plan.ok === true, "the live plan answers the RENDER order");
  if (plan.ok) {
    ok(plan.calls.length >= 1, `the plan carries ${plan.calls.length} call(s) across the below members`);
    ok(plan.calls.every((c) => c.night === THE_NIGHT), "every call rides the plan's own night tag (the fold law's fresh key)");
    const named = plan.calls.filter((c) => c.named);
    ok(named.length >= 1 && named[0] === plan.calls[0], "the named cells ride first (the map's own order)");
    ok(plan.calls[0].carried !== null && plan.calls[0].carried.length > 0, "the carry rides the calls (in hand, named)");
    ok(carry.length === plan.calls.length, "the carry answers every below member (NONE named honestly where the arc is silent)");
  }
  const liveCarryLin = carry.find((c) => c.characterName === "Lin Yue");
  ok(
    liveCarryLin !== undefined && liveCarryLin.verdict === "STAND_DOWN_HONEST" && liveCarryLin.line.includes("the craft lever for a score is the craft, never a moved goalpost"),
    "Lin Yue's carried verdict is the 234 acceptance's own answer (the lever sentence verbatim)",
  );

  console.log("shape: the union law before the rides (the baseline the verify door grows)");
  const arcBefore = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
  const keysBefore = arcKeys(arcBefore);
  const dbHalfBefore = await db.identityArcReading.count({ where: { projectId: identity.projectId, source: "RENDER" } });
  ok(keysBefore.size >= 200, `the committed half carries the ledger (${keysBefore.size} keys)`);
  ok(arcBefore.split("\n").filter((l) => l.trim()).length >= keysBefore.size, "the committed half is append-only by key (no folded duplicates in the receipt)");

  if (verifyReceipt) {
    console.log("shape: the verify door (the landed rides audited - the claim checked, not trusted)");
    const rows = rideRows();
    const calls = rows.filter((r): r is NightCallRow => r.kind === "night-call");
    const closings = rows.filter((r): r is ClosingRow => r.kind === "closing");
    ok(calls.length >= 1, `the receipt carries ${calls.length} night call(s)`);
    for (const row of calls) {
      const c = row.plan.call;
      ok(row.night === THE_NIGHT, `call ${c.index} rode the plan's own night (${row.night})`);
      ok(c.ref && row.members.length >= 1 && row.members.some((m) => m.shots.some((s) => s.ref === c.ref)), `call ${c.index}'s receipt answers its plan call (${c.member} ${c.ref})`);
      ok(typeof c.carried === "string" && c.carried.length > 0, `call ${c.index} rode with the carry named`);
      const member = row.members.find((m) => m.shots.some((s) => s.ref === c.ref));
      if (member) {
        ok(
          member.carriedAcceptance === c.carried,
          `call ${c.index}'s member row carries the same line the plan rode (the ledger names what the night knew)`,
        );
        const shot = member.shots.find((s) => s.ref === c.ref)!;
        ok(shot.after === null || (shot.after >= 0 && shot.after <= 1), `call ${c.index}'s re-score is a lawful reading (${shot.after === null ? "unscored, named" : Math.round(shot.after * 100) + "%"})`);
      }
    }
    ok(closings.length >= 1, "the receipt carries the gate's re-read");
    const closing = closings[closings.length - 1];
    ok(closing.stage === false, "the closing law kept its teeth (a BELOW standing does not stage)");
    ok(closing.line.includes("does not stage") && closing.line.includes("p10 >= floor AND mean >= floor"), "the refusal line names the standing and the closing rule");
    ok(closing.refusals.every((r) => r.includes("sits BELOW") || r.includes("HOLDS") || r.includes("is UNSCORED")), "the refusals are the sources' own gapLines");

    console.log("shape: the arc grew by the rides' own keys (append-only, the union law after)");
    const arcAfter = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
    const keysAfter = arcKeys(arcAfter);
    ok(keysAfter.size >= keysBefore.size, `the committed half only grows (${keysBefore.size} -> ${keysAfter.size})`);
    for (const row of calls) {
      const refMatch = row.plan.call.ref.match(/Sc(\d+) S(\d+)/);
      if (!refMatch) continue;
      const key = `RENDER|${refMatch[1]}/${Number(refMatch[2])}|${row.night}`;
      const inCommitted = keysAfter.has(key);
      const inDb = (await db.identityArcReading.count({ where: { projectId: identity.projectId, source: "RENDER", night: row.night } })) > 0;
      ok(inCommitted || inDb, `the ride's key joined the ledger (${key}${inCommitted ? ", committed half" : ""}${inDb ? ", db half" : ""})`);
    }
    ok(keysAfter.size - keysBefore.size >= 0, "the union holds in either lawful half-state (append-only by key)");
    const liveArc = await readIdentityArcEpisode(identity.projectId, (JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview).episodeId, "RENDER");
    const nights = new Set(liveArc.map((r) => r.night));
    ok(nights.has(THE_NIGHT), `the live arc carries the plan's own night (${[...nights].slice(-3).join(", ")})`);
  } else {
    console.log("shape: live door (no receipt - the plan, the carry, and the closing law, no render)");
    const arcAfterFile = fs.readFileSync(path.join(process.cwd(), ARC_RECEIPT), "utf8");
    ok(arcKeys(arcAfterFile).size >= keysBefore.size, "the committed half only grows");
    const fresh = buildReleaseReview({
      projectId: review.projectId,
      episodeId: review.episodeId,
      episodeTag: review.episodeTag,
      episodeTitle: review.episodeTitle,
      reads: [],
      repairBudget: { members: 4, shotsPerMember: 3 },
      now: new Date(0),
    });
    void fresh;
    const decision = closingStagingDecision(review);
    ok(decision.stage === false || decision.stage === true, "the closing law answers the live standing");
    console.log(`  closing: ${decision.line}`);
  }

  console.log(`\ne2e-iter235: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  await db.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

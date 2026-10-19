// RIDE 235 - THE BODY'S OWN ANSWER. The 234 frontier's sentence:
// "the repair pass's next nights ride the named cells with the
// acceptance's verdict in hand". This ride executes it as a PLAN, not
// an improvisation: the review's own RENDER order and the gate's own
// queues build the night plan (src/lib/render-night-plan.ts - the
// named cells first, one shot per member per call, the plan's own
// night tag), the acceptance's verdict rides every call
// (src/lib/acceptance-carry.ts - the 234 night's own answer, carried
// verbatim), and each call runs the 234 split protocol: --prerender
// queues the member's target in a seconds-long call (the bridge
// renders across the boundary), the ride call resumes the wait and
// spends its budget on the re-score. The appends land under the
// plan's OWN night tag - the fold law is the arc's: a fresh night is
// what moves the medians (a folded night does not).
//
// Modes:
//   --plan                    build the plan, print it, ride nothing
//                             (the map, read-only)
//   --prerender --call N      queue call N's target (the bridge
//                             renders across the boundary)
//   --call N                  ride call N: the pass resumes the wait,
//                             the re-score appends night-tagged, the
//                             carry named in the receipt
//   --closing                 the gate re-reads: the review rebuilt
//                             LIVE (the truth of NOW), the closing
//                             law answers (the teeth stay in the door)
// Run: npx tsx scripts/ride235-nights.ts --plan
//      npx tsx scripts/ride235-nights.ts --prerender --call 1
//      npx tsx scripts/ride235-nights.ts --call 1
//      npx tsx scripts/ride235-nights.ts --closing
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { REPAIR_MAX_SHOTS_PER_MEMBER, runIdentityRepairPass, castArcMeasurement, belowArcShotsForCharacter, renderJobHeartbeatAlive } from "../src/lib/identity-repair";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";
import { renderNightPlan, type NightPlan, type PlanMemberQueue } from "../src/lib/render-night-plan";
import { carriedAcceptanceVerdicts, carryEntriesFromRideReceipts, type CarryEntry } from "../src/lib/acceptance-carry";
import { closingStagingDecision } from "../src/lib/release-closing";
import { episodeReleaseVerdict, type EpisodeReleaseRead } from "../src/lib/identity-matrix";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";
import { createRenderJob } from "../src/lib/engine/render";

const RIDE_RECEIPT = "receipts/ride235.jsonl";
const CARRY_SOURCES = ["receipts/ride234.jsonl", "receipts/ride235.jsonl"];
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
// THE PLAN'S OWN NIGHT (the fold law): the 233 repair night and the
// 234 acceptance night own their keys; this night owns its own - the
// medians move only as the nights do.
const NIGHT = "repair-2026-10-18-ii";

type RideReceiptRow = {
  kind?: string;
  night?: string;
  members?: Array<{ name?: string; reanchored?: boolean; reanchorNote?: string | null; shots?: Array<{ after?: number | null }> }>;
};

function loadCarryEntries(): CarryEntry[] {
  const out: CarryEntry[] = [];
  for (const p of CARRY_SOURCES) {
    const abs = path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) continue;
    for (const line of fs.readFileSync(abs, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try { out.push(...carryEntriesFromRideReceipts([JSON.parse(t) as RideReceiptRow])); } catch { /* a torn line is not an answer */ }
    }
  }
  return out;
}

async function buildPlan(): Promise<{ review: ReleaseReview; plan: NightPlan }> {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  const order = buildRepairWorkOrders(review).find((o) => o.source === "RENDER");
  if (!order) throw new Error("the review carries no RENDER order - nothing stands between (the plan has no body to answer)");
  // the gate's own queues: the below members' below-bar shots, worst
  // first (the arc instrument - the same door the pass reads)
  const queues: PlanMemberQueue[] = [];
  const door = await castArcMeasurement(identity.projectId, review.episodeId);
  for (const m of door.measurement.members.filter((x) => x.standing === "BELOW")) {
    const below = await belowArcShotsForCharacter(identity.projectId, review.episodeId, m.name, door.measurement.bar, REPAIR_MAX_SHOTS_PER_MEMBER);
    queues.push({ member: m.name, below });
  }
  const carry = carriedAcceptanceVerdicts(loadCarryEntries(), queues.map((q) => q.member));
  const plan = renderNightPlan({ order, queues, carry, night: NIGHT, callsPerMember: 1 });
  return { review, plan };
}

async function main() {
  const argv = process.argv;
  const planMode = argv.includes("--plan");
  const prerender = argv.includes("--prerender");
  const closing = argv.includes("--closing");
  const callIdx = argv.includes("--call") ? Number(argv[argv.indexOf("--call") + 1]) : null;

  if (closing) { await closingRide(); return; }

  const { review, plan } = await buildPlan();
  if (!plan.ok) throw new Error(plan.line);
  console.log(`RIDE 235 - ${plan.headline}`);
  for (const l of plan.lines.slice(1)) console.log(`  ${l}`);

  if (planMode) {
    console.log("  (plan only - nothing rode)");
    return;
  }

  const call = plan.calls.find((c) => c.index === callIdx);
  if (!call) throw new Error(`--call ${callIdx} names no call the plan carries (1..${plan.calls.length})`);

  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };

  if (prerender) {
    const latest = await db.renderJob.findFirst({
      where: { projectId: identity.projectId, shotId: call.shotId, mode: "PREVIEW", status: { in: ["RENDERING", "REVIEW", "APPROVED"] } },
      orderBy: { startedAt: "desc" },
    });
    const freshDone =
      latest && (latest.status === "REVIEW" || latest.status === "APPROVED") && latest.outputUrl && latest.finishedAt &&
      Date.now() - latest.finishedAt.getTime() < 30 * 60_000;
    const aliveRide = latest && latest.status === "RENDERING" && renderJobHeartbeatAlive(latest.id, { progress: latest.progress, stage: latest.stage });
    if (freshDone || aliveRide) {
      console.log(`PRERENDER - ${call.member} ${call.ref}: the work already rides (${latest?.status}, no duplicate queued)`);
      return;
    }
    const job = await createRenderJob(identity.projectId, call.shotId, "PREVIEW");
    console.log(`PRERENDER - ${call.member} ${call.ref}: job ${job?.id.slice(-6) ?? "FAILED"} queued (the bridge renders across the boundary)`);
    return;
  }

  // THE RIDE: the pass answers the map WITH the acceptance's verdict
  // in hand (the carry entries ride in; the row names them; the beat
  // still answers its own gate when it runs). One shot, the plan's
  // own night tag.
  const carryEntries = loadCarryEntries();
  const result = await runIdentityRepairPass(identity.projectId, {
    episodeId: review.episodeId,
    members: 4,
    shotsPerMember: 1,
    nameFilter: call.member,
    namedRefs: [call.ref],
    night: NIGHT,
    reanchor: true,
    carryEntries,
  });

  const row = {
    kind: "night-call",
    rodeAt: new Date().toISOString(),
    night: NIGHT,
    plan: { headline: plan.headline, call: { index: call.index, member: call.member, ref: call.ref, prerenderLine: call.prerenderLine, rideLine: call.rideLine, carried: call.carried } },
    memberFilter: call.member,
    instrument: result.instrument,
    episodeId: result.episodeId,
    bar: result.bar,
    workOrder: result.workOrder,
    before: result.before,
    after: result.after,
    members: result.members,
    arcAfter: result.arcAfter,
    reanchor: true,
  };
  fs.appendFileSync(path.join(process.cwd(), RIDE_RECEIPT), JSON.stringify(row) + "\n");

  console.log(`RIDE 235 - CALL ${call.index} (${call.member} ${call.ref})`);
  for (const m of result.members) {
    console.log(`  ${m.name}: ${m.verdict} (${m.before.standing} ${m.before.worst !== null ? Math.round(m.before.worst * 100) + "%" : "-"} -> ${m.after.standing} ${m.after.worst !== null ? Math.round(m.after.worst * 100) + "%" : "-"})`);
    if (m.carriedAcceptance) console.log(`    carried: ${m.carriedAcceptance}`);
    console.log(`    sheet acceptance: ${m.reanchored ? "ACCEPTED - the reference moved, the re-judgment fair" : m.reanchorNote ?? m.reanchorError ?? "no note - named, never silent"}`);
    for (const s of m.shots) {
      console.log(`    ${s.ref} ${Math.round(s.before * 100)}% -> ${s.after !== null ? Math.round(s.after * 100) + "%" : "unscored"} ${s.verdict}${s.error ? ` (${s.error.slice(0, 60)})` : ""}`);
    }
  }
  for (const a of result.arcAfter) {
    console.log(`  arcAfter E${a.episodeNumber}: ${a.verdict} over ${a.readings} reading(s), ${a.nights} night(s)`);
  }
  console.log(`  receipt -> ${RIDE_RECEIPT}`);
}

// THE GATE RE-READS: the review rebuilt LIVE from the gate's own
// reads (the truth of NOW), the pure closing law answering - the
// refreshed receipt rides out (the map is the truth of NOW).
async function closingRide() {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const projectId = identity.projectId;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      seasons: {
        orderBy: { number: "asc" as const },
        select: {
          number: true,
          episodes: {
            orderBy: { number: "asc" as const },
            select: { id: true, number: true, title: true, scenes: { select: { _count: { select: { shots: true } } } } },
          },
        },
      },
    },
  });
  if (!project) throw new Error(`project ${projectId} not found - the living identity names a body the db does not carry`);
  const episodes = project.seasons.flatMap((s) => s.episodes.map((e) => ({ ...e })));
  const shotCountOf = (e: { scenes: Array<{ _count: { shots: number } }> }) => e.scenes.reduce((a, sc) => a + sc._count.shots, 0);
  const episode = [...episodes].sort((a, b) => shotCountOf(b) - shotCountOf(a) || a.number - b.number)[0];
  if (!episode) throw new Error("no episode carries shots - nothing to close");
  const episodeTag = `E${episode.number}`;

  const reads: EpisodeReleaseRead[] = [];
  for (const source of ["AI_KEYFRAME", "RENDER"] as const) {
    reads.push(await episodeReleaseVerdict(projectId, episode.id, source));
  }
  const review = buildReleaseReview({
    projectId,
    episodeId: episode.id,
    episodeTag,
    episodeTitle: episode.title,
    reads,
    repairBudget: { members: 4, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });
  fs.writeFileSync(path.join(process.cwd(), REVIEW_PATH), JSON.stringify(review, null, 2) + "\n");
  const decision = closingStagingDecision(review);
  console.log(`RIDE 235 - THE GATE RE-READS`);
  console.log(`  ${decision.line}`);
  for (const r of decision.refusals) console.log(`    refuses: ${r}`);
  if (!decision.stage) console.log(`  the gate keeps its teeth - no staging rides (the refusal is the work order)`);
  const row = {
    kind: "closing",
    rodeAt: new Date().toISOString(),
    episodeId: episode.id,
    episodeTag,
    standing: review.standing.verdict,
    stage: decision.stage,
    line: decision.line,
    refusals: decision.refusals,
  };
  fs.appendFileSync(path.join(process.cwd(), RIDE_RECEIPT), JSON.stringify(row) + "\n");
  console.log(`  receipt -> ${RIDE_RECEIPT}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

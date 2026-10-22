// RIDE 244 - THE FOLD LAW'S OWN ARITHMETIC NAMES THE NEXT LEVER: the
// aimed nights KEEP re-reading the blocking cells, one lawful night
// at a time. The 243 frontier's sentence: "the fold law's own
// arithmetic names the next lever - the wide cell's p10 moves only
// as the nights do, and one night's UNCHANGED cannot carry a body 15
// points short of the floor mean: the aimed nights keep re-reading
// the blocking cells one lawful night at a time (the lever's own
// words verbatim - the texels at the small figure - and the carry's
// shapes as they grow), the freshest reads count only when the nights
// do, and the first RELEASE verdict stands where the map always said
// it would: every scored source reading p10 >= floor AND mean >=
// floor."
// This ride executes exactly that: the fourteenth box lives (the
// identity stands, the env, the schema, the seed
// cmvjnoqww0000nc2azc2xyzvi - no reset between the nights, the box
// answered 05d9d8b byte-true), LIVE_BLENDER stays warm (the resident
// at 127.0.0.1:8101, the 2-slot pool), the dev server rides BEFORE
// the render this time (the 243 seam's own lesson applied - the pump
// is real, not the rescue door), and the aimed night re-reads the
// blocking cell on the REAL ENGINE: the review re-reads LIVE, the
// plan aims the blocking cells worst-first (the lever's own words
// verbatim), the carry chain grows its newest source (ride243 - the
// honest UNCHANGED's own receipt joins), the renders ride Blender
// Cycles pixels of the DESIGNED builds, and the re-scores append
// night-tagged under the plan's OWN night (the fold law: the medians
// move only as the nights do).
//
// Modes:
//   --review                  rebuild the review LIVE and write it
//   --plan                    build the plan, print it, ride nothing
//   --prerender --call N      queue call N's target WITH its aim
//   --call N                  ride call N: the pass resumes the wait,
//                             the re-score appends night-tagged
//   --closing                 the gate re-reads, the closing law
//                             answers (the teeth stay in the door)
// Run: npx tsx scripts/ride244.ts --review
//      npx tsx scripts/ride244.ts --plan
//      npx tsx scripts/ride244.ts --prerender --call 1
//      npx tsx scripts/ride244.ts --call 1
//      npx tsx scripts/ride244.ts --closing
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { REPAIR_MAX_SHOTS_PER_MEMBER, runIdentityRepairPass, castArcMeasurement, belowArcShotsForCharacter, renderJobHeartbeatAlive } from "../src/lib/identity-repair";
import { buildRepairWorkOrders } from "../src/lib/repair-work-order";
import { renderNightPlan, type NightPlan, type PlanMemberQueue } from "../src/lib/render-night-plan";
import { carriedAcceptanceVerdicts, carryEntriesFromRideReceipts, type CarryEntry } from "../src/lib/acceptance-carry";
import { closingStagingDecision } from "../src/lib/release-closing";
import { episodeReleaseVerdict, identityFramingBucket, type EpisodeReleaseRead } from "../src/lib/identity-matrix";
import { readIdentityArcEpisode } from "../src/lib/identity-arc";
import { buildReleaseReview, type ReleaseReview } from "../src/lib/release-review";
import { createRenderJob } from "../src/lib/engine/render";
import { bridgeStatus } from "../src/lib/bridge/blender";

const RIDE_RECEIPT = "receipts/ride244.jsonl";
const CARRY_SOURCES = ["receipts/ride234.jsonl", "receipts/ride235.jsonl", "receipts/ride237.jsonl", "receipts/ride238.jsonl", "receipts/ride239.jsonl", "receipts/ride241.jsonl", "receipts/ride242.jsonl", "receipts/ride243.jsonl"];
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
const REMAINDER_PATH = "receipts/release-path.json";
// THE PLAN'S OWN NIGHT (the fold law): the 233 repair night, the 234
// acceptance night, the 235-ii night, the 237 aimed night, the 238
// re-dyed night, the 239 mass night, the 241 wide-end night and the
// 243 re-read night own their keys; the box's own night owns its own
// - the medians move only as the nights do.
const NIGHT = "repair-2026-10-22-iv";

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

// THE SOURCE'S OWN LEVER (the 240/241 injection): the remainder's
// leverLine for RENDER - the judge's own words, verbatim - read off
// the committed receipt (the pure law never paraphrases the judge;
// the caller carries the words).
function sourceLeverLine(): string | null {
  try {
    const remainder = JSON.parse(fs.readFileSync(path.join(process.cwd(), REMAINDER_PATH), "utf8")) as {
      sources?: Array<{ source?: string; leverLine?: string | null }>;
    };
    const line = remainder.sources?.find((s) => s.source === "RENDER")?.leverLine ?? null;
    return line && line.trim() ? line.trim() : null;
  } catch {
    return null; // no remainder, no lever - the 236 routing keeps its teeth
  }
}

// THE BOX'S OWN TRUTH, NAMED (the 242 law): the bridge's own status
// rides the receipt's headline - the stand-in's answer was the BOX's
// truth, and the box changed; the ride names the engine the pixels
// will ride, never guesses it.
async function boxEngineLine(): Promise<string> {
  const s = await bridgeStatus(true);
  return s.reachable
    ? `LIVE_BLENDER - the designed builds' pixels ride the real engine (${s.detail})`
    : `MOTION - no Blender attached; the stand-in's pixels would ride again (the 241 state, named honestly)`;
}

// THE REVIEW RE-READS LIVE (the truth of NOW on the living box): the
// committed review names the predecessor's ids; the fourteenth box's
// own reads answer through the union law (the ids resolve live OR the
// committed half carries the key) - the fresh receipt rides out and
// the plan reads the living ids.
async function reviewRide(): Promise<ReleaseReview> {
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
  if (!episode) throw new Error("no episode carries shots - nothing to review");
  const reads: EpisodeReleaseRead[] = [];
  for (const source of ["AI_KEYFRAME", "RENDER"] as const) {
    reads.push(await episodeReleaseVerdict(projectId, episode.id, source));
  }
  const review = buildReleaseReview({
    projectId,
    episodeId: episode.id,
    episodeTag: `E${episode.number}`,
    episodeTitle: episode.title,
    reads,
    repairBudget: { members: 4, shotsPerMember: REPAIR_MAX_SHOTS_PER_MEMBER },
  });
  fs.writeFileSync(path.join(process.cwd(), REVIEW_PATH), JSON.stringify(review, null, 2) + "\n");
  console.log(`RIDE 244 - THE REVIEW RE-READS LIVE: ${review.episodeTag} on the living box ${projectId}`);
  console.log(`  the box's own truth: ${await boxEngineLine()}`);
  for (const s of review.sources) {
    console.log(`  ${s.source}: ${s.verdict} (mean ${Math.round((s.overall?.mean ?? 0) * 100)}%, nights ${s.nights}${s.provisional ? " PROVISIONAL" : ""})`);
  }
  return review;
}

async function buildPlan(): Promise<{ review: ReleaseReview; plan: NightPlan; leverLine: string | null }> {
  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as ReleaseReview;
  const leverLine = sourceLeverLine();
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
  // THE FRAMINGS MAP (the 236 law's own argument): shotId -> the
  // matrix's own framing bucket, off the live shots - the lever arms
  // only where the map carries the shot's framing (named, never
  // guessed).
  const shots = await db.shot.findMany({
    where: { scene: { episodeId: review.episodeId } },
    select: { id: true, shotType: true, number: true, scene: { select: { number: true, episode: { select: { number: true } } } } },
  });
  const framings: Record<string, "close" | "med" | "wide"> = {};
  for (const s of shots) framings[s.id] = identityFramingBucket(s.shotType);
  const carry = carriedAcceptanceVerdicts(loadCarryEntries(), queues.map((q) => q.member));
  const plan = renderNightPlan({ order, queues, carry, night: NIGHT, callsPerMember: 1, framings, sourceLeverLine: leverLine });
  return { review, plan, leverLine };
}

async function main() {
  const argv = process.argv;
  const reviewMode = argv.includes("--review");
  const planMode = argv.includes("--plan");
  const prerender = argv.includes("--prerender");
  const closing = argv.includes("--closing");
  const callIdx = argv.includes("--call") ? Number(argv[argv.indexOf("--call") + 1]) : null;

  if (closing) { await closingRide(); return; }

  if (reviewMode) { await reviewRide(); return; }

  const { review, plan, leverLine } = await buildPlan();
  if (!plan.ok) throw new Error(plan.line);
  console.log(`RIDE 244 - ${plan.headline}`);
  console.log(`  the box's own truth: ${await boxEngineLine()}`);
  console.log(`  the lever's own words (the remainder, verbatim): ${leverLine ?? "- none -"}`);
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
    // THE AIMED PRERENDER (237/241): the rung rides the queue - the
    // bridge renders the aimed craft across the boundary; the 244
    // ride's renders ride the REAL engine (LIVE_BLENDER - the
    // designed builds, the wide-end face rung's own texels).
    const craft = call.rung && call.lever ? { rung: call.rung, line: call.lever } : null;
    const job = await createRenderJob(identity.projectId, call.shotId, "PREVIEW", craft);
    console.log(`PRERENDER - ${call.member} ${call.ref}: job ${job?.id.slice(-6) ?? "FAILED"} queued${craft ? ` WITH the ${craft.rung} aim (the wide-end face rung, craft-v2)` : " (unaimed - the standing craft)"} (the REAL engine rides: ${await boxEngineLine()})`);
    return;
  }

  // THE AIMED RIDE: the pass answers the map WITH the acceptance's
  // verdict in hand AND the call's own craft aim (the wide-end face
  // rung's own pull). One shot, the plan's own night tag - the box's
  // own night.
  const carryEntries = loadCarryEntries();
  const craftAims = call.rung && call.lever ? [{ ref: call.ref, rung: call.rung, line: call.lever }] : [];
  const result = await runIdentityRepairPass(identity.projectId, {
    episodeId: review.episodeId,
    members: 4,
    shotsPerMember: 1,
    nameFilter: call.member,
    namedRefs: [call.ref],
    night: NIGHT,
    reanchor: true,
    carryEntries,
    craftAims,
  });

  const row = {
    kind: "night-call",
    rodeAt: new Date().toISOString(),
    night: NIGHT,
    engine: await boxEngineLine(),
    lever: leverLine,
    plan: { headline: plan.headline, call: { index: call.index, member: call.member, ref: call.ref, rung: call.rung, lever: call.lever, prerenderLine: call.prerenderLine, rideLine: call.rideLine, carried: call.carried } },
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

  console.log(`RIDE 244 - CALL ${call.index} (${call.member} ${call.ref}${call.rung ? `, the ${call.rung} aim - the wide-end face rung` : ""}, craft-v2, the REAL engine)`);
  for (const m of result.members) {
    console.log(`  ${m.name}: ${m.verdict} (${m.before.standing} ${m.before.worst !== null ? Math.round(m.before.worst * 100) + "%" : "-"} -> ${m.after.standing} ${m.after.worst !== null ? Math.round(m.after.worst * 100) + "%" : "-"})`);
    if (m.carriedAcceptance) console.log(`    carried: ${m.carriedAcceptance}`);
    console.log(`    sheet acceptance: ${m.reanchored ? "ACCEPTED - the reference moved, the re-judgment fair" : m.reanchorNote ?? m.reanchorError ?? "no note - named, never silent"}`);
    for (const s of m.shots) {
      console.log(`    ${s.ref} ${s.before !== null ? Math.round(s.before * 100) + "%" : "untested"} -> ${s.after !== null ? Math.round(s.after * 100) + "%" : "unscored"} ${s.verdict}${s.craftAim ? ` [${s.craftAim.rung} aim]` : ""}${s.error ? ` (${s.error.slice(0, 60)})` : ""}`);
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
  console.log(`RIDE 244 - THE GATE RE-READS`);
  console.log(`  the box's own truth: ${await boxEngineLine()}`);
  console.log(`  ${decision.line}`);
  for (const r of decision.refusals) console.log(`    refuses: ${r}`);
  if (!decision.stage) console.log(`  the gate keeps its teeth - no staging rides (the refusal is the work order)`);
  const row = {
    kind: "closing",
    rodeAt: new Date().toISOString(),
    night: NIGHT,
    engine: await boxEngineLine(),
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

main().catch((e) => { console.error(e); process.exit(1); });

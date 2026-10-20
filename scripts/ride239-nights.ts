// RIDE 239 - THE FALLING MASS THE SHEET DECIDED. The 238 frontier's
// sentence: "the small figure's own reads - deeper than quality,
// deeper than proportion, deeper than dye - the next lever names
// itself from the judge's own words, one lawful night at a time."
// The judge's own words at S004 (night repair-2026-10-20-ii) named
// the wall: "the hair mass is reduced to a short bob instead of long
// flowing locks" (hair 0.3) - the wardrobe and palette matched "at
// this scale" (the dye law had answered; the purple drift died), and
// what remained was the SILHOUETTE. The 239 trace found the mass the
// topknot never built: the topknot branch answered the sheet's own
// style with the swept-up mass, the bun and THREE thin strands
// (chest height at the spec's own 0.95) while the sheet's own
// silhouette (the r2 turnaround's back view) carries the falling
// mass down the back to the waist. The 239 law (anime-v126, THE
// FALLING MASS THE SHEET DECIDED) grows the mass riding the LONG
// style's own arithmetic byte-shared; the standing craft grows
// beneath the aim (the dye-v1 shape). This ride executes the mass
// craft AS A PLAN on the tenth box: the review re-reads LIVE first
// (the truth of NOW - the living ids, the union law's own join), the
// gate's own queues build the plan (the framings map rides - the
// matrix's own read off the live shots), each prerender call aims
// its target's render with the rung (the 237 law's own pull, the
// mass law beneath), and the ride call resumes the wait, the
// re-score appending night-tagged under the plan's OWN night tag
// (the fold law: the medians move only as the nights do).
//
// Modes:
//   --review                  rebuild the review LIVE (the truth of
//                             NOW on the living box) and write it -
//                             the plan reads the fresh ids
//   --plan                    build the plan, print it, ride nothing
//                             (the aimed map, read-only)
//   --prerender --call N      queue call N's target WITH its aim (the
//                             bridge renders across the boundary -
//                             anime-v126 beneath: the mass rides)
//   --call N                  ride call N: the pass resumes the wait,
//                             the re-score appends night-tagged, the
//                             aim named in the receipt
//   --closing                 the gate re-reads: the review rebuilt
//                             LIVE (the truth of NOW), the closing
//                             law answers (the teeth stay in the door)
// Run: npx tsx scripts/ride239-nights.ts --review
//      npx tsx scripts/ride239-nights.ts --plan
//      npx tsx scripts/ride239-nights.ts --prerender --call 1
//      npx tsx scripts/ride239-nights.ts --call 1
//      npx tsx scripts/ride239-nights.ts --closing
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

const RIDE_RECEIPT = "receipts/ride239.jsonl";
const CARRY_SOURCES = ["receipts/ride234.jsonl", "receipts/ride235.jsonl", "receipts/ride237.jsonl", "receipts/ride238.jsonl"];
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
// THE PLAN'S OWN NIGHT (the fold law): the 233 repair night, the 234
// acceptance night, the 235-ii night, the 237 aimed night and the
// 238 re-dyed night own their keys; this mass night owns its own -
// the medians move only as the nights do.
const NIGHT = "repair-2026-10-20-iii";

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

// THE REVIEW RE-READS LIVE (the truth of NOW on the living box): the
// committed review names the predecessor's ids; the tenth box's own
// reads answer through the union law (the ids resolve live OR the
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
  console.log(`RIDE 239 - THE REVIEW RE-READS LIVE: ${review.episodeTag} on the living box ${projectId}`);
  for (const s of review.sources) {
    console.log(`  ${s.source}: ${s.verdict} (mean ${Math.round((s.overall?.mean ?? 0) * 100)}%, nights ${s.nights})`);
  }
  return review;
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
  // THE COHORT'S OWN DOOR (the 239-ii law's own caller): the craft
  // moved, the cohort opened, and the cells the move leaves
  // unmeasured owe the present tense their first reading. The cell's
  // OWN worst read names the member (any cohort - the history is the
  // truth; the freshest below-bar row wins the attribution), the
  // present tense names the gap, and the work order's named refs
  // bound the door. A ref the below queues already carry rides once
  // (the plan dedupes; the caller pre-dedupes honestly).
  const refOf = (s: { number: number; scene: { number: number; episode: { number: number } } }) =>
    `E${s.scene.episode.number} Sc${s.scene.number} S${String(s.number).padStart(3, "0")}`;
  const shotIdOfRef = new Map(shots.map((s) => [refOf(s), s.id] as const));
  const castRows = await db.character.findMany({ where: { projectId: identity.projectId }, select: { name: true } });
  const castNames = new Set(castRows.map((c) => c.name));
  const unionRows = await readIdentityArcEpisode(identity.projectId, review.episodeId, "RENDER");
  const memberOfRef: Record<string, string> = {};
  for (const row of unionRows) {
    if (row.worst >= door.measurement.bar) continue;
    let entries: Array<{ characterName?: string; similarity?: number }> = [];
    try { entries = JSON.parse(row.scores) as Array<{ characterName?: string; similarity?: number }>; } catch { continue; }
    let worstName: string | null = null;
    let worstSim = 2;
    for (const e of entries) {
      const name = String(e.characterName ?? "").trim();
      if (!name || !castNames.has(name)) continue;
      const sim = typeof e.similarity === "number" && Number.isFinite(e.similarity) ? e.similarity : 2;
      if (sim < worstSim) { worstSim = sim; worstName = name; }
    }
    const ref = refOf(row.shot);
    if (worstName && row.worst < door.measurement.bar && order.namedRefs.includes(ref)) memberOfRef[ref] = worstName;
  }
  const riddenByQueues = new Set(queues.flatMap((q) => q.below.map((b) => b.ref)));
  const openQueues = [...new Set(order.namedRefs.filter((ref) => memberOfRef[ref] && shotIdOfRef.has(ref) && !riddenByQueues.has(ref)))].map((ref) => ({
    member: memberOfRef[ref],
    namedShots: [{ shotId: shotIdOfRef.get(ref)!, ref }],
  }));
  const carry = carriedAcceptanceVerdicts(loadCarryEntries(), [...queues.map((q) => q.member), ...openQueues.map((q) => q.member)]);
  const plan = renderNightPlan({ order, queues, carry, night: NIGHT, callsPerMember: 1, framings, openQueues });
  return { review, plan };
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

  const { review, plan } = await buildPlan();
  if (!plan.ok) throw new Error(plan.line);
  console.log(`RIDE 239 - ${plan.headline}`);
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
    // THE AIMED PRERENDER (237): the rung rides the queue - the bridge
    // renders the aimed craft across the boundary; the 239 mass law
    // (anime-v126) rides the standing craft beneath every render.
    const craft = call.rung && call.lever ? { rung: call.rung, line: call.lever } : null;
    const job = await createRenderJob(identity.projectId, call.shotId, "PREVIEW", craft);
    console.log(`PRERENDER - ${call.member} ${call.ref}: job ${job?.id.slice(-6) ?? "FAILED"} queued${craft ? ` WITH the ${craft.rung} aim` : " (unaimed - the standing craft, anime-v126 beneath)"} (the bridge renders across the boundary)`);
    return;
  }

  // THE AIMED RIDE: the pass answers the map WITH the acceptance's
  // verdict in hand AND the call's own craft aim (the rung matched by
  // ref - the render the pass re-rides pulls the aimed arm when it
  // must re-queue). One shot, the plan's own night tag.
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

  console.log(`RIDE 239 - CALL ${call.index} (${call.member} ${call.ref}${call.rung ? `, the ${call.rung} aim` : ""}, anime-v126 beneath)`);
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
  console.log(`RIDE 239 - THE GATE RE-READS`);
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

main().catch((e) => { console.error(e); process.exit(1); });

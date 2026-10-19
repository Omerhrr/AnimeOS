// RIDE 234 - THE SHEET ACCEPTANCE'S OWN NIGHT. The 233 ride rode the
// map with reanchor OFF and named it honestly ("the sheet acceptance
// waits for its own night"). This is that night: the repair pass
// rides the map WITH the acceptance answering - the re-renders and
// re-scores first (the 233 resume law: fresh pixels answer the wait,
// a live render resumes, only a corpse re-queues), and a member
// still below after them meets the night130 gate: an HONEST build
// (in the design's dye class) means the reference does not move and
// the still-below stands named; a DRIFTED build owes the bounded
// best-of candidates, each measured in the design's class before it
// may install; only an ACCEPTED sheet re-scores the shots. Its own
// night tag (acceptance-<day>) so the repair night's appends and the
// acceptance night's appends stay distinct keys - the medians move
// as the nights do.
// The executor's cap is real (a foreground call dies at 10 minutes;
// the render rides ~10 alone), so the protocol splits: --prerender
// queues the member's targets in a seconds-long call (the bridge
// renders across the boundary), the ride call resumes the wait and
// spends its budget on the re-score and the acceptance.
// Run: npx tsx scripts/ride234-acceptance.ts --prerender --member "Lin Yue"
//      npx tsx scripts/ride234-acceptance.ts --member "Lin Yue"
import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { REPAIR_MAX_MEMBERS, REPAIR_MAX_SHOTS_PER_MEMBER, runIdentityRepairPass, castArcMeasurement, belowArcShotsForCharacter, renderJobHeartbeatAlive } from "../src/lib/identity-repair";
import { targetsNamedFirst } from "../src/lib/repair-work-order";
import { createRenderJob } from "../src/lib/engine/render";

const RIDE_RECEIPT = "receipts/ride234.jsonl";
const IDENTITY_PATH = "receipts/box-identity.json";
const REVIEW_PATH = "receipts/release-review.json";
const NIGHT = "acceptance-2026-10-18";

async function memberTargets(projectId: string, episodeId: string, member: string, namedRefs: string[]) {
  // the pass's own selection law, read-only (the same door, no work)
  const door = await castArcMeasurement(projectId, episodeId);
  const mem = door.measurement.members.find((m) => m.standing === "BELOW" && m.name.toLowerCase().includes(member.toLowerCase()));
  if (!mem) return { bar: door.measurement.bar, targets: [] as Array<{ shotId: string; ref: string }> };
  const below = await belowArcShotsForCharacter(projectId, episodeId, mem.name, door.measurement.bar, REPAIR_MAX_SHOTS_PER_MEMBER);
  const order = targetsNamedFirst(below, namedRefs, REPAIR_MAX_SHOTS_PER_MEMBER);
  return { bar: door.measurement.bar, targets: order.targets };
}

async function main() {
  const prerender = process.argv.includes("--prerender");
  const memberArg = (process.argv.find((a) => a === "--member") ? process.argv[process.argv.indexOf("--member") + 1] : "") ?? "";
  const member = memberArg.trim();
  if (!member) throw new Error('--member "<name>" names the member this call rides');

  const identity = JSON.parse(fs.readFileSync(path.join(process.cwd(), IDENTITY_PATH), "utf8")) as { projectId: string };
  const projectId = identity.projectId;
  const review = JSON.parse(fs.readFileSync(path.join(process.cwd(), REVIEW_PATH), "utf8")) as {
    episodeId: string;
    sources: Array<{ source: string; blocking: Array<{ worstRef: string | null }> }>;
  };
  const renderOrderRefs = [...new Set(review.sources.find((s) => s.source === "RENDER")?.blocking.flatMap((b) => (b.worstRef ? [b.worstRef] : [])) ?? [])];
  if (renderOrderRefs.length === 0) throw new Error("the map's RENDER order carries no named refs - nothing to ride");

  if (prerender) {
    // queue the member's targets now; the bridge renders across the
    // call boundary; the ride's own wait resumes the work
    const { targets } = await memberTargets(projectId, review.episodeId, member, renderOrderRefs);
    if (targets.length === 0) {
      console.log(`PRERENDER - ${member}: no below-bar targets on the gate's board (nothing to queue)`);
      return;
    }
    for (const t of targets) {
      const latest = await db.renderJob.findFirst({
        where: { projectId, shotId: t.shotId, mode: "PREVIEW", status: { in: ["RENDERING", "REVIEW", "APPROVED"] } },
        orderBy: { startedAt: "desc" },
      });
      const freshDone =
        latest && (latest.status === "REVIEW" || latest.status === "APPROVED") && latest.outputUrl && latest.finishedAt &&
        Date.now() - latest.finishedAt.getTime() < 30 * 60_000;
      const aliveRide = latest && latest.status === "RENDERING" && renderJobHeartbeatAlive(latest.id, { progress: latest.progress, stage: latest.stage });
      if (freshDone || aliveRide) {
        console.log(`PRERENDER - ${member} ${t.ref}: the work already rides (${latest?.status}, no duplicate queued)`);
        continue;
      }
      const job = await createRenderJob(projectId, t.shotId, "PREVIEW");
      console.log(`PRERENDER - ${member} ${t.ref}: job ${job?.id.slice(-6) ?? "FAILED"} queued (the bridge renders across the boundary)`);
    }
    return;
  }

  // THE ACCEPTANCE'S OWN NIGHT: the pass rides with reanchor ON - the
  // sheet acceptance answers for the member the re-render could not
  // lift (the 149 law: the reference does not move under an honest
  // receipt). One shot per member keeps the call inside the cap; the
  // night tag is the acceptance's OWN.
  const result = await runIdentityRepairPass(projectId, {
    episodeId: review.episodeId,
    members: REPAIR_MAX_MEMBERS,
    shotsPerMember: 1,
    nameFilter: member,
    namedRefs: renderOrderRefs,
    night: NIGHT,
    reanchor: true,
  });

  const row = {
    kind: "acceptance",
    rodeAt: new Date().toISOString(),
    night: NIGHT,
    memberFilter: member,
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

  console.log(`RIDE 234 - THE ACCEPTANCE (${member})`);
  console.log(`  instrument: ${result.instrument} | night ${NIGHT} | episode ${result.episodeId}`);
  for (const m of result.members) {
    console.log(`  ${m.name}: ${m.verdict} (${m.before.standing} ${m.before.worst !== null ? Math.round(m.before.worst * 100) + "%" : "-"} -> ${m.after.standing} ${m.after.worst !== null ? Math.round(m.after.worst * 100) + "%" : "-"})`);
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

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
